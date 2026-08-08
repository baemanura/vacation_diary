import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, isFailure } from '@/lib/serverAuth';

// 전출한 대원을 기록까지 통째로 지운다.
//
// 이 앱은 "지금 있는 사람"만 관리한다. 전출자의 프로필만 지우고 로그인 계정을 남기면
// 아무도 못 쓰는 계정이 계속 쌓이고, 나중에 그 계정을 정리하는 순간 연쇄 삭제로 기록이
// 조용히 날아간다. 그래서 지울 때 한 번에 다 지운다.
//
// 삭제 순서가 중요하다:
//  - leave_priorities.set_by는 profiles를 참조하고 연쇄 삭제가 아니라서, 순번을 한 번이라도
//    지정한 서무는 이걸 먼저 지우지 않으면 프로필 삭제 자체가 거부된다(23503).
//  - quota_settings는 부대 공용 설정이라 사람과 함께 사라지면 안 된다. 만든이만 넘긴다.
//  - 나머지는 연쇄 삭제에 맡기지 않고 직접 지운다. 몇 건을 지웠는지 돌려주기 위해서다.
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (isFailure(auth)) return auth.error;

    const { supabase, user } = auth;

    const body = await request.json();
    const memberId = typeof body.memberId === 'string' ? body.memberId : '';

    if (!memberId) {
      return NextResponse.json({ error: '대상 대원이 지정되지 않았습니다.' }, { status: 400 });
    }

    // 본인을 지우면 지운 직후 자기 세션이 갈 곳을 잃는다. 다른 서무가 지우게 한다.
    if (memberId === user.id) {
      return NextResponse.json(
        { error: '본인 계정은 삭제할 수 없습니다. 다른 서무에게 요청해주세요.' },
        { status: 400 }
      );
    }

    const { data: target, error: targetError } = await supabase
      .from('profiles')
      .select('id, name, rank, role')
      .eq('id', memberId)
      .single();

    if (targetError || !target) {
      return NextResponse.json({ error: '해당 대원을 찾을 수 없습니다.' }, { status: 404 });
    }

    // 마지막 서무를 지우면 아무도 관리 페이지에 들어갈 수 없게 된다.
    if (target.role === 'admin') {
      const { count, error: countError } = await supabase
        .from('profiles')
        .select('id', { count: 'exact', head: true })
        .eq('role', 'admin');

      if (countError) {
        return NextResponse.json(
          { error: `서무 수 확인 실패: ${countError.message}` },
          { status: 400 }
        );
      }
      if ((count ?? 0) <= 1) {
        return NextResponse.json(
          { error: '마지막 서무는 삭제할 수 없습니다. 다른 대원을 먼저 서무로 지정해주세요.' },
          { status: 400 }
        );
      }
    }

    const deleted: Record<string, number> = {};

    const wipe = async (table: string, column: string) => {
      const { data, error } = await supabase.from(table).delete().eq(column, memberId).select('id');
      if (error) throw new Error(`${table} 정리 실패: ${error.message}`);
      deleted[table] = (deleted[table] ?? 0) + (data?.length ?? 0);
    };

    // 부대 공용 설정은 살리고 만든이만 지우는 사람 앞으로 넘긴다.
    const { error: quotaError } = await supabase
      .from('quota_settings')
      .update({ created_by: user.id })
      .eq('created_by', memberId);
    if (quotaError) {
      return NextResponse.json(
        { error: `정원 설정 이관 실패: ${quotaError.message}` },
        { status: 400 }
      );
    }

    try {
      // 남의 글에 단 댓글까지 지운 뒤, 본인 글을 지운다(본인 글에 달린 남의 댓글은 함께 사라진다).
      await wipe('board_comments', 'author_id');
      await wipe('board_posts', 'author_id');
      await wipe('date_comments', 'author_id');
      await wipe('leave_priorities', 'set_by');
      await wipe('leave_priorities', 'member_id');
      await wipe('leave_requests', 'member_id');
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : '기록 정리 실패' },
        { status: 400 }
      );
    }

    const { error: profileError } = await supabase.from('profiles').delete().eq('id', memberId);
    if (profileError) {
      return NextResponse.json(
        { error: `대원 정보 삭제 실패: ${profileError.message}` },
        { status: 400 }
      );
    }

    const { error: authDeleteError } = await supabase.auth.admin.deleteUser(memberId);
    if (authDeleteError) {
      // 프로필이 이미 없어 로그인은 막힌 상태다. 계정만 남았다는 걸 분명히 알린다.
      return NextResponse.json(
        {
          error:
            `대원 정보는 삭제됐지만 로그인 계정이 남았습니다: ${authDeleteError.message}\n` +
            '다시 시도하거나 관리자에게 알려주세요.',
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      member: { id: memberId, name: target.name, rank: target.rank },
      deleted,
    });
  } catch (error) {
    console.error('대원 삭제 오류:', error);
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 });
  }
}
