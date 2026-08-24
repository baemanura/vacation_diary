import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, isFailure } from '@/lib/serverAuth';
import { readLeaveInput, toLeaveRow, validateLeaveInput } from '@/lib/leaveValidation';
import {
  clearPrioritiesOutsideRange,
  describeLeaveWriteError,
  findOverlappingLeave,
  type LeaveRow,
} from '@/lib/serverLeave';

// 서무가 이미 들어온 신청의 내용을 고친다.
//
// 지금까지 고치는 방법은 "취소하고 다시 신청"뿐이었는데, 그러면 취소 기록이 남고
// 순번도 맨 뒤로 밀린다. 날짜 하루를 잘못 적은 것을 바로잡는 데 쓰기에는 무겁다.
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (isFailure(auth)) return auth.error;

    const { supabase } = auth;

    const body = await request.json();
    const requestId = typeof body.requestId === 'string' ? body.requestId : '';
    const input = readLeaveInput(body);

    if (!requestId) {
      return NextResponse.json({ error: '수정할 신청이 지정되지 않았습니다.' }, { status: 400 });
    }

    const problem = validateLeaveInput(input);
    if (problem) {
      return NextResponse.json({ error: problem }, { status: 400 });
    }

    const { data: existing, error: existingError } = await supabase
      .from('leave_requests')
      .select('id, member_id, type, start_date, end_date, status')
      .eq('id', requestId)
      .single<LeaveRow>();

    if (existingError || !existing) {
      return NextResponse.json({ error: '해당 신청을 찾을 수 없습니다.' }, { status: 404 });
    }

    // 취소된 신청을 되살리면 취소 시각과 사유가 그대로 붙은 채 살아 있는 어정쩡한
    // 상태가 된다. 새로 신청하는 편이 기록이 분명하다.
    if (existing.status !== 'active') {
      return NextResponse.json(
        { error: '이미 취소된 신청은 수정할 수 없습니다. 새로 신청해주세요.' },
        { status: 409 }
      );
    }

    const overlap = await findOverlappingLeave(
      supabase,
      existing.member_id,
      input.startDate,
      input.endDate,
      existing.id
    );
    if (overlap) {
      return NextResponse.json(
        {
          error:
            `그 대원이 이미 신청한 ${overlap.type}` +
            `(${overlap.start_date} ~ ${overlap.end_date})와 날짜가 겹칩니다.`,
        },
        { status: 409 }
      );
    }

    const { data: updated, error: updateError } = await supabase
      .from('leave_requests')
      .update(toLeaveRow(input))
      .eq('id', existing.id)
      .select()
      .single();

    if (updateError) {
      const described = describeLeaveWriteError(updateError, input.type);
      return NextResponse.json(
        { error: described ?? `수정 실패: ${updateError.message}` },
        { status: described ? 409 : 400 }
      );
    }

    // 기간이 줄거나 옮겨졌으면 이제 신청에 들어 있지 않은 날짜의 순번을 지운다.
    // 여기서 실패해도 수정 자체는 이미 끝났으므로 되돌리지 않고 알리기만 한다.
    try {
      await clearPrioritiesOutsideRange(
        supabase,
        existing.member_id,
        existing.start_date,
        existing.end_date,
        input.startDate,
        input.endDate
      );
    } catch (priorityError) {
      console.error('순번 정리 실패:', priorityError);
      return NextResponse.json({
        success: true,
        request: updated,
        warning:
          '수정은 되었지만 빠진 날짜의 순번이 남아 있습니다. 달력에서 그 날짜의 순번을 직접 지워주세요.',
      });
    }

    return NextResponse.json({ success: true, request: updated });
  } catch (error) {
    console.error('신청 수정 오류:', error);
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 });
  }
}
