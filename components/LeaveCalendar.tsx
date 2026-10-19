'use client';

import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { useLiveRefresh } from '@/lib/useLiveRefresh';
import {
  getQuotaStatus,
  getEffectiveQuotaForDate,
  isDayDuty,
  formatDateTime,
  daysBetweenInclusive,
  describeUnexpectedError,
  getTodayString,
  occupiesQuota,
  TYPE_BADGE_COLOR,
  type QuotaSetting,
} from '@/lib/utils';
import { ChevronLeft, ChevronRight, Trash2 } from 'lucide-react';
import DateComments from './DateComments';

interface LeaveRequest {
  id: string;
  start_date: string;
  end_date: string;
  type: string;
  sub_reason: string | null;
  /** 휴직일 때만 채워진다. '3개월 이상'이면 정원에서 빠진다. */
  absence_length: string | null;
  note: string | null;
  status: string;
  created_at: string;
  cancelled_at: string | null;
  cancel_reason: string | null;
  member_id?: string;
}

interface Profile {
  id: string;
  name: string;
  rank: string;
}

const priorityKey = (date: string, memberId: string) => `${date}|${memberId}`;

export default function LeaveCalendar({
  currentUserId,
  isAdmin = false,
  refreshKey = 0,
}: {
  currentUserId?: string;
  isAdmin?: boolean;
  /** 바뀌면 보던 달과 선택한 날짜를 그대로 둔 채 다시 읽는다(신청 직후 등). */
  refreshKey?: number;
} = {}) {
  // 항상 "이번 달"로 시작한다. 고정 날짜를 쓰면 달이 바뀌어도 과거 달이 계속 보인다.
  // (대시보드가 로딩을 끝낸 뒤에야 이 컴포넌트를 렌더링하므로 서버/클라이언트 날짜가
  //  어긋나 하이드레이션이 깨질 일은 없다.)
  const [currentDate, setCurrentDate] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [leaves, setLeaves] = useState<LeaveRequest[]>([]);
  const [profiles, setProfiles] = useState<Map<string, Profile>>(new Map());
  const [quotaSettings, setQuotaSettings] = useState<QuotaSetting[]>([]);
  const [priorities, setPriorities] = useState<Map<string, number>>(new Map());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  // 서무가 남의 신청을 취소할 때 사유를 받는 입력칸. 한 번에 하나만 열어둔다.
  const [cancelTarget, setCancelTarget] = useState<{ leaveId: string; date: string } | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelling, setCancelling] = useState(false);
  // 마지막 조회가 실패했는지. 실패하면 화면은 직전 내용을 그대로 두고 이 표시만 띄운다.
  const [loadFailed, setLoadFailed] = useState(false);
  // 달을 빨리 넘기면 앞 달 조회가 늦게 도착해 지금 달 화면을 덮을 수 있다. 지금 보고 있는
  // 달을 적어두고, 다른 달을 위해 시작한 조회의 결과는 버린다.
  // (같은 달의 조회끼리는 버리지 않는다 — 연결이 나쁠 때는 한 번 조회에 자동 새로고침
  //  간격보다 오래 걸려서, 늦은 조회를 버리면 실패 표시가 영영 뜨지 않는다.)
  const shownMonth = useRef('');
  const monthKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}`;

  useEffect(() => {
    shownMonth.current = monthKey(currentDate);
    loadData();
  }, [currentDate, refreshKey]);

  // 다른 대원이 신청/취소하거나 서무가 순번·정원을 바꾸면 새로고침 없이 반영한다.
  useLiveRefresh(['leave_requests', 'leave_priorities', 'quota_settings'], () => loadData());

  const loadData = async () => {
    const requestedMonth = monthKey(currentDate);
    try {
      // 정원 설정 전체 조회 (기간별로 다른 출동율이 적용될 수 있어 날짜별로 직접 계산한다)
      const { data: quota, error: quotaError } = await supabase
        .from('quota_settings')
        .select('*')
        .order('effective_from', { ascending: true });

      // 현재 월의 연가 데이터 조회
      // (new Date(...).toISOString()로 만들면 한국 시간대에서 UTC 변환 때문에
      // 하루 밀릴 수 있어, 로컬 연/월/일 값으로 직접 문자열을 만든다)
      const dataYear = currentDate.getFullYear();
      const dataMonth = currentDate.getMonth();
      const firstDay = `${dataYear}-${String(dataMonth + 1).padStart(2, '0')}-01`;
      const daysInDataMonth = new Date(dataYear, dataMonth + 1, 0).getDate();
      const lastDay = `${dataYear}-${String(dataMonth + 1).padStart(2, '0')}-${String(daysInDataMonth).padStart(2, '0')}`;

      // 이 달과 하루라도 겹치는 신청을 모두 가져온다.
      // (start_date >= 1일 AND end_date <= 말일)로 조회하면 7/30~8/2처럼 달을 걸친
      // 신청이 양쪽 달력에서 모두 빠져 인원 계산까지 틀어진다.
      const { data: leaveData, error: leaveError } = await supabase
        .from('leave_requests')
        .select('*')
        .lte('start_date', lastDay)
        .gte('end_date', firstDay)
        .order('created_at', { ascending: true });

      // 이번 달 순번 설정 조회
      const { data: priorityData, error: priorityError } = await supabase
        .from('leave_priorities')
        .select('date, member_id, priority')
        .gte('date', firstDay)
        .lte('date', lastDay);

      // 모든 프로필 조회
      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('id, name, rank');

      // supabase-js는 연결이 끊겨도 예외 대신 error를 돌려준다. 그대로 빈 값으로 덮으면
      // 폰이 잠깐 끊긴 사이 달력이 "아무도 신청하지 않은 달"처럼 보인다. 하나라도
      // 실패하면 직전 화면을 그대로 두고, 다음 자동 새로고침에서 다시 읽는다.
      if (requestedMonth !== shownMonth.current) return;

      const failure = quotaError ?? leaveError ?? priorityError ?? profileError;
      if (failure) {
        console.error('달력 조회 실패:', failure);
        setLoadFailed(true);
        return;
      }
      setLoadFailed(false);
      setQuotaSettings(quota || []);

      const priorityMap = new Map<string, number>();
      priorityData?.forEach((p) => {
        priorityMap.set(priorityKey(p.date, p.member_id), p.priority);
      });
      setPriorities(priorityMap);

      const profileMap = new Map<string, Profile>();
      profileData?.forEach((p) => {
        profileMap.set(p.id, p);
      });
      setProfiles(profileMap);

      setLeaves(leaveData || []);
    } catch (error) {
      console.error('데이터 로드 실패:', error);
      if (requestedMonth === shownMonth.current) setLoadFailed(true);
    }
  };

  // 취소되지 않은(현재 유효한) 신청만
  const activeLeaves = leaves.filter((leave) => leave.status === 'active');

  // 날짜 범위에 해당하는 신청 필터링 (기본은 유효한 신청만, includeCancelled로 취소 내역도 포함)
  const getRequestsForDate = (date: string, includeCancelled = false) => {
    const source = includeCancelled ? leaves : activeLeaves;
    return source.filter((leave) => {
      return date >= leave.start_date && date <= leave.end_date;
    });
  };

  // 그날 가능인원 한 자리를 실제로 차지하는 신청만. 색·인원수·남은인원의 기준이다.
  //
  // 3개월 이상 휴직은 부대 정원에서 아예 빠져 있어 가능인원을 줄이지 않는다. 그대로 세면
  // 몇 달 내내 한 자리가 잠겨 실제로는 갈 수 있는 날이 노랑·빨강으로 보인다.
  // 달력 칸에서도 빼는 이유는 하나 더 있다 — 휴직은 기간이 길어서, 세지 않고 이름만
  // 남겨두면 반 년치 달력 모든 칸에 같은 이름이 박힌다.
  const getQuotaOccupantsForDate = (date: string) =>
    getRequestsForDate(date).filter(occupiesQuota);

  // 신청자 정보 가져오기
  const getRequesterInfo = (leave: LeaveRequest) => {
    const profile = leave.member_id ? profiles.get(leave.member_id) : null;
    const name = profile ? profile.name : '알 수 없음';
    const rank = profile?.rank ?? '';
    return { name, rank, type: leave.type };
  };

  // 본인이 취소하면 사유 없이, 서무가 본인 것이 아닌 신청을 취소하면 사유를 받아 기록한다.
  // 여러 날에 걸친 신청 중 하루만 취소하는 경우, 그 하루만 취소 처리하고
  // 나머지 앞/뒤 구간은 별도의 유효한 신청으로 남긴다.
  const cancelScopeNote = (leave: LeaveRequest, dateToCancel: string) =>
    leave.start_date !== leave.end_date
      ? ` (${leave.start_date} ~ ${leave.end_date} 중 ${dateToCancel}만 취소되고 나머지는 유지됩니다)`
      : '';

  // 본인 신청은 확인만 받고 바로 취소하고, 남의 신청을 서무가 취소할 때는 사유를 받는다.
  //
  // 사유를 prompt()로 받았더니 카카오톡 같은 인앱 브라우저가 그 창을 막는 경우가 있었다.
  // 막히면 null이 돌아와 취소가 조용히 중단되고, 서무 눈에는 버튼이 안 먹는 것처럼 보인다.
  // 그래서 사유는 화면 안의 입력칸으로 받는다.
  const requestCancel = (leave: LeaveRequest, dateToCancel: string) => {
    // 처리 중에 한 번 더 누르면 같은 신청을 두 번 취소하려 들면서, 남는 구간을
    // 두 번 등록하다 겹침 오류가 난다. 휴대폰에서는 두 번 눌리기 쉬워 여기서 막는다.
    if (cancelling) return;
    if (leave.member_id === currentUserId) {
      if (!confirm(`정말 취소하시겠습니까?${cancelScopeNote(leave, dateToCancel)}`)) return;
      setCancelling(true);
      void handleCancel(leave, dateToCancel, null);
      return;
    }
    setCancelReason('');
    setCancelTarget({ leaveId: leave.id, date: dateToCancel });
  };

  // 하루 취소는 서버에서 한다(app/api/leave/cancel-day). 남는 구간을 새 행으로 넣어야 하는데
  // 브라우저에서는 남의 이름으로 넣을 수 없어 서무의 하루 취소가 막혔고, 새 행이 신청 시각과
  // 휴직 기간 구분을 잃었다. 그날의 순번 정리도 서버가 함께 한다.
  const handleCancel = async (
    leave: LeaveRequest,
    dateToCancel: string,
    reason: string | null
  ) => {
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData?.session?.access_token;
      if (!accessToken) {
        alert('로그인이 만료되었습니다. 다시 로그인해주세요.');
        return;
      }

      const response = await fetch('/api/leave/cancel-day', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ leaveId: leave.id, date: dateToCancel, reason }),
      });
      const result = await response.json().catch(() => ({}));

      if (!response.ok) {
        alert(result.error ?? `취소에 실패했습니다. [HTTP ${response.status}]`);
        await loadData();
        return;
      }
      if (result.warning) alert(result.warning);

      setCancelTarget(null);
      await loadData();
    } catch (error) {
      alert(describeUnexpectedError(error, '취소'));
      console.error(error);
    } finally {
      setCancelling(false);
    }
  };

  // 서무가 특정 날짜에 신청한 사람들의 순번(1~5)을 지정/해제한다.
  const handleSetPriority = async (date: string, memberId: string, priority: number | null) => {
    try {
      // 같은 날 같은 번호를 두 사람에게 주면, 날짜 상세가 순번으로 정렬되는 의미가 사라지고
      // 서무가 정한 순서를 아무도 알 수 없게 된다. 저장 전에 막는다.
      if (priority !== null) {
        const mine = priorityKey(date, memberId);
        const taken = Array.from(priorities.entries()).find(
          ([key, value]) => value === priority && key.startsWith(`${date}|`) && key !== mine
        );
        if (taken) {
          const other = profiles.get(taken[0].slice(date.length + 1));
          alert(
            `${priority}순위는 이미 ${other ? `${other.name} ${other.rank}` : '다른 대원'}에게 지정되어 있습니다.\n\n` +
              '그 대원의 순번을 먼저 바꾸거나 해제한 뒤에 다시 지정해주세요.'
          );
          // 화면의 선택칸을 원래 값으로 되돌린다. 상태가 그대로면 고른 번호가 남아
          // 저장된 것처럼 보인다.
          await loadData();
          return;
        }
      }

      if (priority === null) {
        const { error } = await supabase
          .from('leave_priorities')
          .delete()
          .eq('date', date)
          .eq('member_id', memberId);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('leave_priorities')
          .upsert(
            { date, member_id: memberId, priority, set_by: currentUserId },
            { onConflict: 'date,member_id' }
          );
        if (error) throw error;
      }
      await loadData();
    } catch (error) {
      alert(describeUnexpectedError(error, '순번 지정'));
      console.error(error);
    }
  };

  // 해당 월의 첫 요일과 일수
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const firstDayOfMonth = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  // 달력 셀 생성
  const calendarDays = [];
  for (let i = 0; i < firstDayOfMonth; i++) {
    calendarDays.push(null);
  }
  for (let day = 1; day <= daysInMonth; day++) {
    calendarDays.push(day);
  }

  const dayNames = ['일', '월', '화', '수', '목', '금', '토'];
  const monthName = `${year}년 ${month + 1}월`;
  const monthFirstDay = `${year}-${String(month + 1).padStart(2, '0')}-01`;
  const monthLastDay = `${year}-${String(month + 1).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`;

  const prevMonth = () => {
    setCurrentDate(new Date(year, month - 1, 1));
    setSelectedDate(null);
  };

  const nextMonth = () => {
    setCurrentDate(new Date(year, month + 1, 1));
    setSelectedDate(null);
  };

  // 상단 요약 카드에 쓸 기준일: 날짜를 선택했으면 그 날짜, 아니면 오늘(이번 달을 보고 있을 때만) 또는 이번 달 1일
  const todayStr = getTodayString();
  const isTodayInThisMonth = todayStr.slice(0, 7) === `${year}-${String(month + 1).padStart(2, '0')}`;
  const referenceDate =
    selectedDate ?? (isTodayInThisMonth ? todayStr : `${year}-${String(month + 1).padStart(2, '0')}-01`);
  const referenceQuota = getEffectiveQuotaForDate(quotaSettings, referenceDate);
  const referenceCount = getQuotaOccupantsForDate(referenceDate).length;
  const referenceRemaining = referenceQuota ? Math.max(referenceQuota.base_quota - referenceCount, 0) : null;

  return (
    <div className="bg-white rounded-lg shadow p-6">
      {/* 헤더 */}
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold text-gray-900">{monthName}</h2>
        <div className="flex gap-2">
          <button
            onClick={prevMonth}
            className="p-2 hover:bg-gray-100 rounded-lg transition"
          >
            <ChevronLeft size={20} />
          </button>
          <button
            onClick={nextMonth}
            className="p-2 hover:bg-gray-100 rounded-lg transition"
          >
            <ChevronRight size={20} />
          </button>
        </div>
      </div>

      {/* 상단 요약: 기준일의 출동율/정원 현황 */}
      <div className="mb-6 p-4 rounded-lg bg-gray-50 border border-gray-200">
        <div className="text-sm text-gray-600 mb-3">
          {referenceDate} 기준{!selectedDate && isTodayInThisMonth && ' (오늘)'}
          {!referenceQuota && ' · 적용된 출동율 설정이 없습니다.'}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-white rounded-lg p-3 text-center border border-gray-200">
            <div className="text-xs text-gray-500 mb-1">출동율</div>
            <div className="text-lg font-bold text-gray-900">
              {referenceQuota ? referenceQuota.dispatch_rate : '-'}
            </div>
          </div>
          <div className="bg-white rounded-lg p-3 text-center border border-gray-200">
            <div className="text-xs text-gray-500 mb-1">가능인원</div>
            <div className="text-lg font-bold text-gray-900">
              {referenceQuota ? `${referenceQuota.base_quota}명` : '-'}
            </div>
          </div>
          <div className="bg-white rounded-lg p-3 text-center border border-gray-200">
            <div className="text-xs text-gray-500 mb-1">현재 신청인원</div>
            <div className="text-lg font-bold text-gray-900">
              {referenceQuota ? `${referenceCount}명` : '-'}
            </div>
          </div>
          <div className="bg-white rounded-lg p-3 text-center border border-gray-200">
            <div className="text-xs text-gray-500 mb-1">남은인원</div>
            <div
              className={`text-lg font-bold ${
                referenceRemaining === null
                  ? 'text-gray-900'
                  : referenceRemaining > 0
                    ? 'text-green-600'
                    : 'text-red-600'
              }`}
            >
              {referenceRemaining === null ? '-' : `${referenceRemaining}명`}
            </div>
          </div>
        </div>
      </div>

      {loadFailed && (
        <p className="mb-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800">
          연결이 불안정해 최신 내용을 불러오지 못했습니다. 잠시 후 자동으로 다시 불러옵니다.
        </p>
      )}

      {/* 요일 헤더 */}
      <div className="grid grid-cols-7 gap-1 mb-2">
        {dayNames.map((day) => (
          <div key={day} className="text-center font-semibold text-gray-600 py-2">
            {day}
          </div>
        ))}
      </div>

      {/* 달력 그리드 */}
      <div className="grid grid-cols-7 gap-1">
        {calendarDays.map((day, index) => {
          if (day === null) {
            return (
              <div key={`empty-${index}`} className="min-h-16 sm:aspect-square bg-gray-50 rounded-lg"></div>
            );
          }

          const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          const requests = getQuotaOccupantsForDate(dateStr);
          const dayQuota = getEffectiveQuotaForDate(quotaSettings, dateStr);
          const status =
            dayQuota && requests.length > 0
              ? getQuotaStatus(requests.length, dayQuota.base_quota, dayQuota.max_quota)
              : null;

          return (
            <button
              key={day}
              onClick={() => setSelectedDate(dateStr)}
              className={`min-h-16 sm:aspect-square sm:overflow-hidden px-0.5 py-1.5 sm:p-1.5 rounded-lg border-2 transition flex flex-col items-start justify-start text-xs font-medium cursor-pointer ${
                selectedDate === dateStr
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-gray-200 hover:border-gray-300'
              } ${status ? status.color : 'bg-white text-gray-600'}`}
            >
              <div className="flex items-baseline gap-1">
                <span className="text-sm font-bold text-gray-900">{day}</span>
                {/* 우리 부대가 일근인 날. 날짜 옆의 작은 '일' 하나로만 알린다. */}
                {isDayDuty(dateStr) && (
                  <span className="text-[10px] font-semibold leading-none text-gray-500">일</span>
                )}
              </div>
              {/* 폰 화면: 칸이 좁아 유형은 빼고 이름만 전원 보여준다. 석 자 이름이 들어가도록
                  이 화면에서만 칸의 좌우 여백을 줄였다. (버튼은 글자를 가운데 정렬하므로 날짜와
                  줄을 맞추려고 왼쪽 정렬을 따로 준다.) */}
              {requests.length > 0 && (
                <div className="sm:hidden w-full mt-0.5 text-left">
                  {requests.map((leave, idx) => (
                    <div
                      key={idx}
                      className="text-[10px] font-semibold leading-tight truncate tracking-tighter"
                    >
                      {getRequesterInfo(leave).name}
                    </div>
                  ))}
                </div>
              )}
              <div className="hidden sm:block w-full mt-0.5 space-y-0.5">
                {(() => {
                  // 그 날짜의 가능인원만큼 이름을 먼저 보여주고, 넘치는 인원만 +N으로 묶는다.
                  const visibleCount = dayQuota?.base_quota ?? 3;
                  return (
                    <>
                      {requests.slice(0, visibleCount).map((leave, idx) => {
                        const { name, type } = getRequesterInfo(leave);
                        return (
                          <div key={idx} className="text-xs truncate leading-tight">
                            <span className="font-semibold">{name}</span>
                            <span className="text-gray-600"> ({type})</span>
                          </div>
                        );
                      })}
                      {requests.length > visibleCount && (
                        <div className="text-xs text-gray-500">
                          +{requests.length - visibleCount}명
                        </div>
                      )}
                    </>
                  );
                })()}
              </div>
            </button>
          );
        })}
      </div>

      {/* 선택된 날짜의 상세 정보 */}
      {selectedDate && (
        <div className="mt-6 pt-6 border-t border-gray-200">
          <h3 className="font-semibold text-gray-900 mb-3">
            {selectedDate} 신청 현황
          </h3>
          <div className="space-y-2">
            {getRequestsForDate(selectedDate, true).length === 0 ? (
              <p className="text-gray-500 text-sm">신청된 항목이 없습니다.</p>
            ) : (
              [...getRequestsForDate(selectedDate, true)]
                .sort((a, b) => {
                  const aCancelled = a.status !== 'active';
                  const bCancelled = b.status !== 'active';
                  if (aCancelled !== bCancelled) return aCancelled ? 1 : -1;
                  if (!aCancelled) {
                    const aPriority = a.member_id
                      ? priorities.get(priorityKey(selectedDate, a.member_id))
                      : undefined;
                    const bPriority = b.member_id
                      ? priorities.get(priorityKey(selectedDate, b.member_id))
                      : undefined;
                    if (aPriority !== bPriority) {
                      if (aPriority === undefined) return 1;
                      if (bPriority === undefined) return -1;
                      return aPriority - bPriority;
                    }
                  }
                  return a.created_at.localeCompare(b.created_at);
                })
                .map((leave, idx) => {
                const { name, rank } = getRequesterInfo(leave);
                const cancelled = leave.status !== 'active';
                const canCancel = !cancelled && (leave.member_id === currentUserId || isAdmin);
                const priority =
                  !cancelled && leave.member_id
                    ? priorities.get(priorityKey(selectedDate, leave.member_id))
                    : undefined;
                return (
                  <div
                    key={idx}
                    className={`p-2 rounded text-sm border-l-4 ${
                      cancelled
                        ? 'bg-gray-50 border-gray-300 opacity-70'
                        : 'bg-gray-50 border-green-400'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        {priority && (
                          <span className="mr-1 text-xs font-bold text-blue-700">
                            {priority}순위
                          </span>
                        )}
                        <span className="font-semibold text-gray-900">
                          {name} {rank}
                        </span>{' '}
                        <span className="font-medium text-gray-900">{leave.type}</span>
                        {/* 연가 '일반'은 하루를 다 쓴다는 뜻이라 굳이 적지 않고,
                            반일(오전/오후)일 때만 눈에 띄게 표시한다. */}
                        {leave.sub_reason && leave.sub_reason !== '일반' && (
                          <span className="text-gray-600"> ({leave.sub_reason})</span>
                        )}
                        {leave.absence_length && (
                          <span className="text-gray-600"> · {leave.absence_length}</span>
                        )}
                        {/* 왜 이 사람은 세지 않는지 여기서만 알 수 있으므로 분명히 적어둔다.
                            달력 칸에는 아예 나오지 않는다. */}
                        {!cancelled && !occupiesQuota(leave) && (
                          <span className="ml-1.5 text-xs px-1.5 py-0.5 rounded-full bg-gray-200 text-gray-700 font-medium">
                            정원 제외
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {!cancelled && isAdmin && leave.member_id && (
                          <select
                            value={priority ?? ''}
                            onChange={(e) =>
                              handleSetPriority(
                                selectedDate,
                                leave.member_id!,
                                e.target.value ? Number(e.target.value) : null
                              )
                            }
                            className="text-xs border border-gray-300 rounded px-1 py-0.5 bg-white"
                            title="순번 지정"
                          >
                            <option value="">순번-</option>
                            {[1, 2, 3, 4, 5].map((n) => (
                              <option key={n} value={n}>
                                {n}순위
                              </option>
                            ))}
                          </select>
                        )}
                        <span
                          className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                            cancelled
                              ? 'bg-red-100 text-red-700'
                              : 'bg-green-100 text-green-700'
                          }`}
                        >
                          {cancelled ? '취소됨' : '신청중'}
                        </span>
                        {canCancel && (
                          <button
                            onClick={() => requestCancel(leave, selectedDate)}
                            disabled={cancelling}
                            className="p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 disabled:text-gray-300 rounded transition"
                            title="취소"
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                      {leave.start_date} ~ {leave.end_date}
                    </div>
                    <div className="text-xs text-gray-400 mt-0.5">
                      등록: {formatDateTime(leave.created_at)}
                      {cancelled && leave.cancelled_at && (
                        <span className="text-red-500">
                          {' '}
                          · 취소: {formatDateTime(leave.cancelled_at)}
                        </span>
                      )}
                    </div>
                    {cancelled && leave.cancel_reason && (
                      <div className="text-xs text-red-600 mt-0.5">
                        취소 사유: {leave.cancel_reason}
                      </div>
                    )}

                    {cancelTarget?.leaveId === leave.id && cancelTarget.date === selectedDate && (
                      <div className="mt-2 pt-2 border-t border-gray-200">
                        <label className="block text-xs font-medium text-gray-700 mb-1">
                          취소 사유를 입력해주세요
                          <span className="font-normal text-gray-500">
                            {cancelScopeNote(leave, selectedDate)}
                          </span>
                        </label>
                        <input
                          type="text"
                          value={cancelReason}
                          onChange={(e) => setCancelReason(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.nativeEvent.isComposing) return;
                            if (e.key === 'Enter' && cancelReason.trim() && !cancelling) {
                              e.preventDefault();
                              setCancelling(true);
                              void handleCancel(leave, selectedDate, cancelReason.trim());
                            }
                          }}
                          placeholder="예: 근무 일정 변경"
                          autoFocus
                          disabled={cancelling}
                          className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                        />
                        <div className="mt-2 flex justify-end gap-2">
                          <button
                            onClick={() => setCancelTarget(null)}
                            disabled={cancelling}
                            className="px-3 py-1 text-xs rounded bg-gray-100 hover:bg-gray-200 text-gray-700 transition"
                          >
                            그만두기
                          </button>
                          <button
                            onClick={() => {
                              setCancelling(true);
                              void handleCancel(leave, selectedDate, cancelReason.trim());
                            }}
                            disabled={cancelling || !cancelReason.trim()}
                            className="px-3 py-1 text-xs rounded bg-red-500 hover:bg-red-600 disabled:bg-gray-400 text-white font-semibold transition"
                          >
                            {cancelling ? '취소 중...' : '취소하기'}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>

          <DateComments
            date={selectedDate}
            currentUserId={currentUserId}
            isAdmin={isAdmin}
            profiles={profiles}
          />
        </div>
      )}

      {/* 이 달의 내 신청 내역 (취소한 것도 함께 보여주므로 activeLeaves가 아니라 leaves) */}
      <MyMonthlyRequests
        leaves={leaves}
        firstDay={monthFirstDay}
        lastDay={monthLastDay}
        monthName={monthName}
        currentUserId={currentUserId}
      />
    </div>
  );
}

/**
 * 지금 보고 있는 달에 걸친 내 신청을 건별로 보여준다.
 *
 * 달력만으로는 본인이 언제 무엇을 냈는지 알려면 날짜를 하나씩 눌러봐야 한다.
 * 취소한 건도 함께 보여준다 — 서무가 취소한 경우 그 사유를 여기서 바로 확인할 수 있다.
 * 달력이 이미 이 달의 신청을 모두 들고 있으므로 따로 조회하지 않는다.
 */
function MyMonthlyRequests({
  leaves,
  firstDay,
  lastDay,
  monthName,
  currentUserId,
}: {
  leaves: LeaveRequest[];
  firstDay: string;
  lastDay: string;
  monthName: string;
  currentUserId?: string;
}) {
  if (!currentUserId) return null;

  const mine = leaves
    .filter((leave) => leave.member_id === currentUserId)
    .sort(
      (a, b) =>
        a.start_date.localeCompare(b.start_date) || a.created_at.localeCompare(b.created_at)
    );

  // 이번 달에 걸친 날만 센다. 달을 걸친 신청은 이번 달 몫만 합계에 들어간다.
  const daysThisMonth = (leave: LeaveRequest) => {
    const start = leave.start_date > firstDay ? leave.start_date : firstDay;
    const end = leave.end_date < lastDay ? leave.end_date : lastDay;
    return start > end ? 0 : daysBetweenInclusive(start, end);
  };

  const totalDays = mine
    .filter((leave) => leave.status === 'active')
    .reduce((sum, leave) => sum + daysThisMonth(leave), 0);

  return (
    <div className="mt-6 pt-6 border-t border-gray-200">
      <div className="flex items-baseline justify-between gap-2 mb-3">
        <h3 className="font-semibold text-gray-900">내 신청 내역</h3>
        <span className="text-sm text-gray-500">{monthName}</span>
      </div>

      {mine.length === 0 ? (
        <p className="text-gray-500 text-sm">이 달 신청 내역이 없습니다.</p>
      ) : (
        <>
          <div className="space-y-1.5">
            {mine.map((leave) => {
              const cancelled = leave.status !== 'active';
              const wholeDays = daysBetweenInclusive(leave.start_date, leave.end_date);
              // 달을 걸친 신청은 전체 일수와 이번 달 몫이 달라서 둘 다 적어준다.
              const partial = leave.start_date < firstDay || leave.end_date > lastDay;

              return (
                <div
                  key={leave.id}
                  className={`px-3 py-2 rounded-lg border text-sm ${
                    cancelled
                      ? 'bg-gray-50 border-gray-200 opacity-70'
                      : 'bg-gray-50 border-gray-200'
                  }`}
                >
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span
                      className={`font-medium tabular-nums ${
                        cancelled ? 'text-gray-500 line-through' : 'text-gray-900'
                      }`}
                    >
                      {leave.start_date.slice(5)}
                      {leave.start_date !== leave.end_date && ` ~ ${leave.end_date.slice(5)}`}
                    </span>

                    <span
                      className={`text-xs px-1.5 py-0.5 rounded-full ${
                        TYPE_BADGE_COLOR[leave.type] ?? 'bg-gray-100 text-gray-700'
                      }`}
                    >
                      {leave.type}
                    </span>

                    {leave.sub_reason && (
                      <span className="text-xs text-gray-600">{leave.sub_reason}</span>
                    )}
                    {leave.absence_length && (
                      <span className="text-xs text-gray-600">{leave.absence_length}</span>
                    )}

                    <span className="text-xs text-gray-500">
                      {wholeDays}일{partial && ` (이번 달 ${daysThisMonth(leave)}일)`}
                    </span>

                    <span
                      className={`ml-auto text-xs px-2 py-0.5 rounded-full font-medium ${
                        cancelled ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'
                      }`}
                    >
                      {cancelled ? '취소됨' : '신청중'}
                    </span>
                  </div>

                  {/* 서무가 취소한 경우 그 사유를 여기서 바로 볼 수 있게 한다. */}
                  {cancelled && leave.cancel_reason && (
                    <div className="mt-1 text-xs text-red-600">
                      취소 사유: {leave.cancel_reason}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="mt-3 text-sm text-gray-700">
            이번 달 합계 <strong className="font-semibold">{totalDays}일</strong>{' '}
            <span className="text-gray-400">(취소 제외)</span>
          </div>
        </>
      )}

      <p className="mt-2 text-xs text-gray-400">
        달력 위 화살표(‹ ›)로 달을 넘기면 그 달의 내역이 보입니다.
      </p>
    </div>
  );
}
