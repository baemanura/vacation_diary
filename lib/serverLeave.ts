import type { SupabaseClient } from '@supabase/supabase-js';

// 서무의 대리 신청·변경·취소가 함께 쓰는 조각들. 서버 전용이다.
//
// 대리 입력을 브라우저에서 바로 하지 않고 서버를 거치는 이유:
// `leave_requests`의 INSERT는 본인(member_id = auth.uid()) 것만 허용되어 있어서,
// 서무가 남의 이름으로 넣으려 하면 42501로 거부된다. 정책을 열어 대원 아무나
// 남의 이름으로 신청할 수 있게 만드는 대신, 서버가 서무인지 확인하고 대신 넣는다.

/** 신청 한 건이 DB에서 갖는 모양 중 이 경로들이 쓰는 부분. */
export interface LeaveRow {
  id: string;
  member_id: string;
  type: string;
  start_date: string;
  end_date: string;
  status: string;
}

/**
 * 겹치는 활성 신청을 찾는다. 하루에 한 유형만 낼 수 있다는 규칙을 지키기 위한 것.
 *
 * DB에도 같은 규칙의 제약조건이 있어서 결국 막히지만, 그때 돌아오는 것은 23P01이라는
 * 코드뿐이라 어느 신청과 부딪혔는지 알 수 없다. 무엇과 겹쳤는지 알려주려고 먼저 본다.
 */
export async function findOverlappingLeave(
  supabase: SupabaseClient,
  memberId: string,
  startDate: string,
  endDate: string,
  excludeId?: string
): Promise<LeaveRow | null> {
  let query = supabase
    .from('leave_requests')
    .select('id, member_id, type, start_date, end_date, status')
    .eq('member_id', memberId)
    .eq('status', 'active')
    .lte('start_date', endDate)
    .gte('end_date', startDate);

  // 자기 자신과 겹친다고 나오면 날짜를 그대로 둔 채 유형만 고칠 수 없다.
  if (excludeId) query = query.neq('id', excludeId);

  const { data, error } = await query.limit(1);
  if (error) throw error;
  return data && data.length > 0 ? (data[0] as LeaveRow) : null;
}

/**
 * 신청에서 빠진 날짜의 순번을 지운다.
 *
 * 순번은 (날짜, 대원) 단위라 신청과 따로 논다. 9/1~9/3을 9/5~9/7로 옮기고 순번을
 * 남겨두면, 그 대원이 신청하지도 않은 9/1에 순위가 남아 나중에 다시 신청할 때
 * 먼저 신청한 사람보다 앞에 서게 된다.
 *
 * 지우는 범위를 원래 기간(oldStart~oldEnd) 안으로 가두는 것이 중요하다. 그러지 않으면
 * 다른 신청 때문에 붙어 있던 순번까지 함께 지워진다.
 */
export async function clearPrioritiesOutsideRange(
  supabase: SupabaseClient,
  memberId: string,
  oldStart: string,
  oldEnd: string,
  newStart: string | null,
  newEnd: string | null
) {
  const inOldRange = () =>
    supabase
      .from('leave_priorities')
      .delete()
      .eq('member_id', memberId)
      .gte('date', oldStart)
      .lte('date', oldEnd);

  // 취소처럼 남는 기간이 아예 없으면 원래 기간 전체를 지운다.
  if (!newStart || !newEnd) {
    const { error } = await inOldRange();
    if (error) throw error;
    return;
  }

  const { error: beforeError } = await inOldRange().lt('date', newStart);
  if (beforeError) throw beforeError;

  const { error: afterError } = await inOldRange().gt('date', newEnd);
  if (afterError) throw afterError;
}

/**
 * 쓰기가 실패했을 때 서무가 읽고 판단할 수 있는 문장으로 바꾼다.
 * 짚이는 원인이 없으면 null — 부르는 쪽에서 원래 메시지를 쓰면 된다.
 */
export function describeLeaveWriteError(
  error: { code?: string } | null,
  type: string
): string | null {
  if (error?.code === '23P01') {
    return '그 대원이 이미 신청한 다른 건과 날짜가 겹칩니다. 하루에 한 유형만 신청할 수 있습니다.';
  }
  // 앱에만 유형을 추가하고 DB의 허용 목록(check 제약조건)을 함께 고치지 않으면 여기로 온다.
  if (error?.code === '23514') {
    return (
      `'${type}'은(는) 서버에 아직 등록되지 않은 유형입니다. ` +
      'docs/database-changes.md의 유형 추가 SQL을 실행해야 합니다. [23514]'
    );
  }
  return null;
}
