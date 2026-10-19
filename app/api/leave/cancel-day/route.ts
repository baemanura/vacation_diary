import { NextRequest, NextResponse } from 'next/server';
import { requireUser, isFailure } from '@/lib/serverAuth';
import { addDays } from '@/lib/utils';

// 여러 날에 걸친 신청 중 하루만 취소한다. 하루짜리 신청이면 그 신청을 통째로 취소한다.
//
// 브라우저에서 하지 않고 서버를 거치는 이유:
//  - 하루를 빼면 남는 뒷구간을 새 행으로 넣어야 하는데, `leave_requests`의 INSERT는 본인
//    것만 허용된다. 서무가 남의 신청에서 하루를 빼려 하면 42501로 막혔다.
//  - 예전에는 원래 행을 "취소된 하루"로 바꾸고 남는 구간을 새로 만들었다. 새 행은
//    신청 시각(created_at)이 취소한 시각이 되어 남은 날짜마다 신청 순서가 맨 뒤로 밀렸고,
//    휴직 기간 구분(absence_length)이 빠져 '3개월 이상' 휴직이 정원을 차지하게 됐다.
//
// 그래서 원래 행은 남는 앞구간(앞구간이 없으면 뒷구간)으로 줄이기만 하고, 취소된 하루와
// 나머지 구간만 새 행으로 만든다. 새 행은 원래 행의 내용을 신청 시각까지 그대로 옮긴다.
//
// 취소할 수 있는 사람은 본인과 서무. 서무가 남의 신청을 취소할 때는 사유가 있어야 한다 —
// 대원의 '내 신청 내역'에 그대로 보인다.

/** 원래 행에서 그대로 옮겨 적는 칸. 칸이 늘면 여기에 더해야 새 행에서 빠지지 않는다. */
const CARRIED_COLUMNS = [
  'member_id',
  'type',
  'sub_reason',
  'absence_length',
  'note',
  'created_at',
] as const;

export async function POST(request: NextRequest) {
  try {
    const auth = await requireUser(request);
    if (isFailure(auth)) return auth.error;

    const { supabase, user } = auth;

    const body = await request.json();
    const leaveId = typeof body.leaveId === 'string' ? body.leaveId : '';
    const date = typeof body.date === 'string' ? body.date : '';
    const reason = typeof body.reason === 'string' ? body.reason.trim() : '';

    if (!leaveId || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return NextResponse.json({ error: '취소할 신청과 날짜가 필요합니다.' }, { status: 400 });
    }

    const { data: leave, error: leaveError } = await supabase
      .from('leave_requests')
      .select('*')
      .eq('id', leaveId)
      .single();

    if (leaveError || !leave) {
      return NextResponse.json({ error: '해당 신청을 찾을 수 없습니다.' }, { status: 404 });
    }

    // 화면이 오래되어 이미 취소된 신청을 다시 누른 경우. 그대로 진행하면 취소된 날짜가
    // 유효한 신청으로 되살아난다.
    if (leave.status !== 'active') {
      return NextResponse.json(
        { error: '이미 취소된 신청입니다. 화면을 새로고침해주세요.' },
        { status: 409 }
      );
    }

    const isOwn = leave.member_id === user.id;
    if (!isOwn) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();

      if (profile?.role !== 'admin') {
        return NextResponse.json({ error: '본인 신청만 취소할 수 있습니다.' }, { status: 403 });
      }
      if (!reason) {
        return NextResponse.json({ error: '취소 사유를 입력해주세요.' }, { status: 400 });
      }
    }

    if (date < leave.start_date || date > leave.end_date) {
      return NextResponse.json({ error: '신청 기간에 없는 날짜입니다.' }, { status: 400 });
    }

    const cancelledFields = {
      status: 'cancelled',
      cancelled_at: new Date().toISOString(),
      cancel_reason: isOwn ? null : reason,
    };

    if (leave.start_date === leave.end_date) {
      // 하루짜리 신청은 행 하나를 그대로 취소 상태로 바꾸면 끝이다.
      const { data: cancelled, error } = await supabase
        .from('leave_requests')
        .update(cancelledFields)
        .eq('id', leave.id)
        .eq('status', 'active')
        .select('id');
      if (error || !cancelled || cancelled.length === 0) {
        return NextResponse.json(
          { error: `취소 실패: ${error?.message ?? '신청이 그 사이 바뀌었습니다. 새로고침해주세요.'}` },
          { status: 409 }
        );
      }
    } else {
      const carried = Object.fromEntries(CARRIED_COLUMNS.map((c) => [c, leave[c]]));
      const before =
        date > leave.start_date ? { start: leave.start_date, end: addDays(date, -1) } : null;
      const after = date < leave.end_date ? { start: addDays(date, 1), end: leave.end_date } : null;

      // 원래 행이 맡을 구간. 앞구간이 있으면 앞구간, 없으면(첫날 취소) 뒷구간.
      const kept = before ?? after!;
      const newRows: Record<string, unknown>[] = [
        { ...carried, start_date: date, end_date: date, ...cancelledFields },
      ];
      if (before && after) {
        newRows.push({ ...carried, start_date: after.start, end_date: after.end, status: 'active' });
      }

      // 겹치는 유효 신청을 막는 제약조건 때문에, 원래 행을 먼저 줄여 자리를 비운 뒤에
      // 새 행을 넣는다. (제약조건은 유효한 신청끼리만 본다 — 취소된 하루는 부딪히지 않는다.)
      const { data: shrunk, error: shrinkError } = await supabase
        .from('leave_requests')
        .update({ start_date: kept.start, end_date: kept.end })
        .eq('id', leave.id)
        .eq('status', 'active')
        .select('id');
      if (shrinkError || !shrunk || shrunk.length === 0) {
        return NextResponse.json(
          { error: `취소 실패: ${shrinkError?.message ?? '신청이 그 사이 바뀌었습니다. 새로고침해주세요.'}` },
          { status: 409 }
        );
      }

      // 새 행들은 한 번에 넣는다 — 하나만 들어가는 일은 없다.
      const { error: insertError } = await supabase.from('leave_requests').insert(newRows);
      if (insertError) {
        const { data: restored, error: restoreError } = await supabase
          .from('leave_requests')
          .update({ start_date: leave.start_date, end_date: leave.end_date })
          .eq('id', leave.id)
          .select('id');
        if (restoreError || !restored || restored.length === 0) {
          // 여기까지 오면 원래 신청이 줄어든 채 남는다. 무엇을 되돌려야 하는지 그대로 알린다.
          console.error('하루 취소 되돌리기 실패:', leave.id, restoreError);
          return NextResponse.json(
            {
              error:
                `취소 중 오류가 나서 신청 기간이 ${kept.start} ~ ${kept.end}로 줄어든 채 남았습니다. ` +
                `원래 기간은 ${leave.start_date} ~ ${leave.end_date}입니다. 서무에게 알려주세요. ` +
                `[${insertError.code ?? ''}] ${insertError.message}`,
            },
            { status: 500 }
          );
        }
        return NextResponse.json(
          { error: `취소 실패: [${insertError.code ?? ''}] ${insertError.message}` },
          { status: 400 }
        );
      }
    }

    // 취소한 날짜의 순번을 지운다. 남겨두면 같은 날짜로 다시 신청했을 때 예전 순위가
    // 되살아나 먼저 신청한 사람보다 앞에 선다.
    const { error: priorityError } = await supabase
      .from('leave_priorities')
      .delete()
      .eq('date', date)
      .eq('member_id', leave.member_id);
    if (priorityError) {
      console.error('순번 정리 실패:', priorityError);
      return NextResponse.json({
        success: true,
        warning:
          '취소는 완료됐지만 순번이 지워지지 않았습니다. 이대로 다시 신청하면 예전 순위가 그대로 살아나므로 서무에게 알려주세요.',
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('하루 취소 오류:', error);
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 });
  }
}
