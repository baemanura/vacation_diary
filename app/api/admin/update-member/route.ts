import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, isFailure } from '@/lib/serverAuth';

// 서무가 대원의 이름·계급·역할을 수정한다.
//
// 이름과 계급은 로그인 식별자라 클라이언트에서만 검사하면 안 된다.
// 이미 있는 조합으로 바꿔버리면 두 사람 모두 로그인할 수 없게 되므로
// 서버에서 확정적으로 중복을 막는다.
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (isFailure(auth)) return auth.error;

    const { supabase } = auth;

    const body = await request.json();
    const memberId = typeof body.memberId === 'string' ? body.memberId : '';
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const rank = typeof body.rank === 'string' ? body.rank.trim() : '';
    const role = body.role === 'admin' ? 'admin' : 'member';

    if (!memberId) {
      return NextResponse.json({ error: '대상 대원이 지정되지 않았습니다.' }, { status: 400 });
    }

    if (!name || !rank) {
      return NextResponse.json({ error: '이름과 계급을 모두 입력해주세요.' }, { status: 400 });
    }

    const { data: target, error: targetError } = await supabase
      .from('profiles')
      .select('id, name, rank, role')
      .eq('id', memberId)
      .single();

    if (targetError || !target) {
      return NextResponse.json({ error: '해당 대원을 찾을 수 없습니다.' }, { status: 404 });
    }

    // 본인을 제외하고 같은 이름+계급이 이미 있는지 확인한다.
    const { data: duplicates, error: duplicateError } = await supabase
      .from('profiles')
      .select('id')
      .eq('name', name)
      .eq('rank', rank)
      .neq('id', memberId);

    if (duplicateError) {
      return NextResponse.json(
        { error: `중복 확인 실패: ${duplicateError.message}` },
        { status: 400 }
      );
    }

    if (duplicates && duplicates.length > 0) {
      return NextResponse.json(
        {
          error: `이미 "${name} ${rank}" 계정이 있습니다. 이름과 계급이 모두 같으면 두 사람 다 로그인할 수 없게 됩니다.`,
        },
        { status: 409 }
      );
    }

    // 마지막 서무를 일반 대원으로 내리면 아무도 관리 페이지에 못 들어간다.
    // 클라이언트 쪽 검사는 우회할 수 있으므로 여기서도 막는다.
    if (target.role === 'admin' && role !== 'admin') {
      const { count, error: adminCountError } = await supabase
        .from('profiles')
        .select('id', { count: 'exact', head: true })
        .eq('role', 'admin');

      if (adminCountError) {
        return NextResponse.json(
          { error: `서무 수 확인 실패: ${adminCountError.message}` },
          { status: 400 }
        );
      }

      if ((count ?? 0) <= 1) {
        return NextResponse.json(
          { error: '마지막 서무는 일반 대원으로 바꿀 수 없습니다. 다른 대원을 먼저 서무로 지정해주세요.' },
          { status: 400 }
        );
      }
    }

    const { error: updateError } = await supabase
      .from('profiles')
      .update({ name, rank, role })
      .eq('id', memberId);

    if (updateError) {
      return NextResponse.json(
        { error: `수정 실패: ${updateError.message}` },
        { status: 400 }
      );
    }

    return NextResponse.json({ success: true, member: { id: memberId, name, rank, role } });
  } catch (error) {
    console.error('대원 정보 수정 오류:', error);
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 });
  }
}
