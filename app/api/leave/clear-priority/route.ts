import { NextRequest, NextResponse } from 'next/server';
import { requireUser, isFailure } from '@/lib/serverAuth';

// 신청을 취소할 때 그 날짜에 걸려 있던 순번을 함께 지운다.
//
// 순번을 남겨두면 나중에 같은 날짜로 다시 신청했을 때 예전 순위가 그대로 되살아난다.
// 취소하고 다시 넣은 사람이 먼저 신청한 사람보다 앞에 서는 셈이라 순서가 뒤집힌다.
// 순번이 없어야 목록 맨 뒤(신청 시각 순)로 들어간다.
//
// 브라우저에서 직접 지우지 않고 서버를 거치는 이유: `leave_priorities`는 서무만
// 지정·해제할 수 있게 막혀 있어서, 대원이 자기 신청을 취소하면서 지우려 하면 RLS가
// 조용히 막는다 — 오류가 아니라 "0건 삭제 성공"으로 돌아와 아무도 눈치채지 못한다.
//
// 지울 수 있는 사람은 본인과 서무. 남의 순번을 마음대로 지우지 못하게 여기서 확인한다.
export async function POST(request: NextRequest) {
  try {
    const auth = await requireUser(request);
    if (isFailure(auth)) return auth.error;

    const { supabase, user } = auth;

    const body = await request.json();
    const date = typeof body.date === 'string' ? body.date : '';
    const memberId = typeof body.memberId === 'string' ? body.memberId : '';

    if (!date || !memberId) {
      return NextResponse.json({ error: '날짜와 대상 대원이 필요합니다.' }, { status: 400 });
    }

    if (memberId !== user.id) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();

      if (profile?.role !== 'admin') {
        return NextResponse.json(
          { error: '본인 신청의 순번만 지울 수 있습니다.' },
          { status: 403 }
        );
      }
    }

    const { error } = await supabase
      .from('leave_priorities')
      .delete()
      .eq('date', date)
      .eq('member_id', memberId);

    if (error) {
      return NextResponse.json({ error: `순번 삭제 실패: ${error.message}` }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('순번 삭제 오류:', error);
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 });
  }
}
