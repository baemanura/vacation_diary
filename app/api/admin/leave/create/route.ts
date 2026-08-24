import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, isFailure } from '@/lib/serverAuth';
import { readLeaveInput, toLeaveRow, validateLeaveInput } from '@/lib/leaveValidation';
import { describeLeaveWriteError, findOverlappingLeave } from '@/lib/serverLeave';

// 서무가 대원 대신 연가·병가 등을 신청한다.
//
// 아직 앱을 쓰지 않는 대원의 연가도 달력에 들어와 있어야 그날의 가능인원이 맞는다.
// 그렇지 않으면 실제로는 자리가 없는 날이 여유(초록)로 보인다.
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (isFailure(auth)) return auth.error;

    const { supabase } = auth;

    const body = await request.json();
    const memberId = typeof body.memberId === 'string' ? body.memberId : '';
    const input = readLeaveInput(body);

    if (!memberId) {
      return NextResponse.json({ error: '대상 대원을 선택해주세요.' }, { status: 400 });
    }

    const problem = validateLeaveInput(input);
    if (problem) {
      return NextResponse.json({ error: problem }, { status: 400 });
    }

    // 지워진 대원 앞으로 신청이 들어가면 달력에 "알 수 없음"으로만 남는다.
    const { data: member, error: memberError } = await supabase
      .from('profiles')
      .select('id, name, rank')
      .eq('id', memberId)
      .single();

    if (memberError || !member) {
      return NextResponse.json({ error: '해당 대원을 찾을 수 없습니다.' }, { status: 404 });
    }

    const overlap = await findOverlappingLeave(supabase, memberId, input.startDate, input.endDate);
    if (overlap) {
      return NextResponse.json(
        {
          error:
            `${member.name} ${member.rank}은(는) 이미 ${overlap.type}` +
            `(${overlap.start_date} ~ ${overlap.end_date})을(를) 신청했습니다. ` +
            '하루에 한 유형만 신청할 수 있습니다.',
        },
        { status: 409 }
      );
    }

    const { data: inserted, error: insertError } = await supabase
      .from('leave_requests')
      .insert({ member_id: memberId, ...toLeaveRow(input), status: 'active' })
      .select()
      .single();

    if (insertError) {
      const described = describeLeaveWriteError(insertError, input.type);
      return NextResponse.json(
        { error: described ?? `신청 실패: ${insertError.message}` },
        { status: described ? 409 : 400 }
      );
    }

    return NextResponse.json({ success: true, request: inserted });
  } catch (error) {
    console.error('대리 신청 오류:', error);
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 });
  }
}
