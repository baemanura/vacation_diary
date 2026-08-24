import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, isFailure } from '@/lib/serverAuth';
import { clearPrioritiesOutsideRange, type LeaveRow } from '@/lib/serverLeave';

// 서무가 신청 한 건을 통째로 취소한다.
//
// 달력에서 하는 취소는 "여러 날 중 하루만" 빼는 것이라 남는 앞뒤 구간을 다시 만든다.
// 여기서는 신청 한 건을 통째로 무르므로 기간을 그대로 두고 상태만 바꾼다 —
// 무엇이 취소됐는지 기록에 그대로 남는다.
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (isFailure(auth)) return auth.error;

    const { supabase } = auth;

    const body = await request.json();
    const requestId = typeof body.requestId === 'string' ? body.requestId : '';
    const reason = typeof body.reason === 'string' ? body.reason.trim() : '';

    if (!requestId) {
      return NextResponse.json({ error: '취소할 신청이 지정되지 않았습니다.' }, { status: 400 });
    }

    // 본인이 내지 않은 신청이 사라지면 대원은 이유를 알 길이 없다. 여기 적은 사유가
    // 대원의 '내 신청 내역'에 그대로 보인다.
    if (!reason) {
      return NextResponse.json({ error: '취소 사유를 입력해주세요.' }, { status: 400 });
    }

    const { data: existing, error: existingError } = await supabase
      .from('leave_requests')
      .select('id, member_id, type, start_date, end_date, status')
      .eq('id', requestId)
      .single<LeaveRow>();

    if (existingError || !existing) {
      return NextResponse.json({ error: '해당 신청을 찾을 수 없습니다.' }, { status: 404 });
    }

    if (existing.status !== 'active') {
      return NextResponse.json({ error: '이미 취소된 신청입니다.' }, { status: 409 });
    }

    const { error: updateError } = await supabase
      .from('leave_requests')
      .update({
        status: 'cancelled',
        cancelled_at: new Date().toISOString(),
        cancel_reason: reason,
      })
      .eq('id', existing.id);

    if (updateError) {
      return NextResponse.json({ error: `취소 실패: ${updateError.message}` }, { status: 400 });
    }

    // 취소한 기간의 순번을 함께 지운다. 남겨두면 같은 날짜로 다시 신청했을 때
    // 예전 순위가 되살아나 먼저 신청한 사람보다 앞에 선다.
    try {
      await clearPrioritiesOutsideRange(
        supabase,
        existing.member_id,
        existing.start_date,
        existing.end_date,
        null,
        null
      );
    } catch (priorityError) {
      console.error('순번 정리 실패:', priorityError);
      return NextResponse.json({
        success: true,
        warning:
          '취소는 되었지만 순번이 남아 있습니다. 이대로 다시 신청하면 예전 순위가 살아나므로 달력에서 직접 지워주세요.',
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('신청 취소 오류:', error);
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 });
  }
}
