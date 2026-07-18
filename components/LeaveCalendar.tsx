'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import {
  getQuotaStatus,
  getQuotaForDate,
  formatDateTime,
  daysBetweenInclusive,
  type QuotaSetting,
} from '@/lib/utils';
import { ChevronLeft, ChevronRight, Trash2 } from 'lucide-react';

interface LeaveRequest {
  id: string;
  start_date: string;
  end_date: string;
  type: string;
  sub_reason: string | null;
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

export default function LeaveCalendar({
  currentUserId,
  isAdmin = false,
}: {
  currentUserId?: string;
  isAdmin?: boolean;
} = {}) {
  const [currentDate, setCurrentDate] = useState(new Date(2026, 6, 18)); // 7월 18일
  const [leaves, setLeaves] = useState<LeaveRequest[]>([]);
  const [profiles, setProfiles] = useState<Map<string, Profile>>(new Map());
  const [quotaSettings, setQuotaSettings] = useState<QuotaSetting[]>([]);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, [currentDate]);

  const loadData = async () => {
    try {
      // 정원 설정 전체 조회 (기간별로 다른 출동율이 적용될 수 있어 날짜별로 직접 계산한다)
      const { data: quota, error: quotaError } = await supabase
        .from('quota_settings')
        .select('*')
        .order('effective_from', { ascending: true });

      if (quotaError) console.error('정원 설정 조회 실패:', quotaError);
      setQuotaSettings(quota || []);

      // 현재 월의 연가 데이터 조회
      const firstDay = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1)
        .toISOString()
        .split('T')[0];
      const lastDay = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0)
        .toISOString()
        .split('T')[0];

      const { data: leaveData, error: leaveError } = await supabase
        .from('leave_requests')
        .select('*')
        .lte('end_date', lastDay)
        .gte('start_date', firstDay)
        .order('created_at', { ascending: true });

      if (leaveError) console.error('연가 조회 실패:', leaveError);

      // 모든 프로필 조회
      const { data: profileData } = await supabase
        .from('profiles')
        .select('id, name, rank');

      const profileMap = new Map<string, Profile>();
      profileData?.forEach((p) => {
        profileMap.set(p.id, p);
      });
      setProfiles(profileMap);

      setLeaves(leaveData || []);
    } catch (error) {
      console.error('데이터 로드 실패:', error);
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

  // 신청자 정보 가져오기
  const getRequesterInfo = (leave: LeaveRequest) => {
    const profile = leave.member_id ? profiles.get(leave.member_id) : null;
    const name = profile ? profile.name : '알 수 없음';
    const rank = profile?.rank ?? '';
    return { name, rank, type: leave.type };
  };

  // 본인이 취소하면 사유 없이, 서무가 본인 것이 아닌 신청을 취소하면 사유를 받아 기록한다.
  const handleCancel = async (leave: LeaveRequest) => {
    const isSelf = leave.member_id === currentUserId;
    let reason: string | null = null;

    if (isSelf) {
      if (!confirm('정말 취소하시겠습니까?')) return;
    } else {
      const input = prompt('취소 사유를 입력해주세요.');
      if (input === null) return;
      if (!input.trim()) {
        alert('취소 사유를 입력해야 합니다.');
        return;
      }
      reason = input.trim();
    }

    try {
      const { error } = await supabase
        .from('leave_requests')
        .update({
          status: 'cancelled',
          cancelled_at: new Date().toISOString(),
          cancel_reason: reason,
        })
        .eq('id', leave.id);
      if (error) throw error;
      await loadData();
    } catch (error) {
      alert('취소 실패했습니다.');
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
  const todayStr = new Date().toISOString().split('T')[0];
  const isTodayInThisMonth = todayStr.slice(0, 7) === `${year}-${String(month + 1).padStart(2, '0')}`;
  const referenceDate =
    selectedDate ?? (isTodayInThisMonth ? todayStr : `${year}-${String(month + 1).padStart(2, '0')}-01`);
  const referenceQuota = getQuotaForDate(quotaSettings, referenceDate);
  const referenceCount = getRequestsForDate(referenceDate).length;
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
              <div key={`empty-${index}`} className="aspect-square bg-gray-50 rounded-lg"></div>
            );
          }

          const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          const requests = getRequestsForDate(dateStr);
          const dayQuota = getQuotaForDate(quotaSettings, dateStr);
          const status =
            dayQuota && requests.length > 0
              ? getQuotaStatus(requests.length, dayQuota.base_quota, dayQuota.max_quota)
              : null;

          return (
            <button
              key={day}
              onClick={() => setSelectedDate(dateStr)}
              className={`aspect-square p-1.5 rounded-lg border-2 transition flex flex-col items-start justify-start text-xs font-medium cursor-pointer overflow-hidden ${
                selectedDate === dateStr
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-gray-200 hover:border-gray-300'
              } ${status ? status.color : 'bg-white text-gray-600'}`}
            >
              <div className="text-sm font-bold text-gray-900">{day}</div>
              {requests.length > 0 && (
                <div className="sm:hidden text-[10px] font-semibold text-gray-700 mt-0.5">
                  {requests.length}명
                </div>
              )}
              <div className="hidden sm:block w-full mt-0.5 space-y-0.5">
                {requests.slice(0, 3).map((leave, idx) => {
                  const { name, type } = getRequesterInfo(leave);
                  return (
                    <div key={idx} className="text-xs truncate leading-tight">
                      <span className="font-semibold">{name}</span>
                      <span className="text-gray-600"> ({type})</span>
                    </div>
                  );
                })}
                {requests.length > 3 && (
                  <div className="text-xs text-gray-500">+{requests.length - 3}명</div>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {/* 범례 */}
      <div className="mt-6 pt-4 border-t border-gray-200">
        <div className="text-sm text-gray-600 mb-2">범례:</div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-4">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 shrink-0 rounded bg-green-100 border border-green-300"></div>
            <span className="text-sm">
              여유 <span className="text-gray-500">— 가능인원 이내</span>
            </span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 shrink-0 rounded bg-yellow-100 border border-yellow-300"></div>
            <span className="text-sm">
              주의 <span className="text-gray-500">— 예비인원까지 사용 중</span>
            </span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 shrink-0 rounded bg-red-100 border border-red-300"></div>
            <span className="text-sm">
              초과 <span className="text-gray-500">— 예비인원까지 초과</span>
            </span>
          </div>
        </div>
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
              getRequestsForDate(selectedDate, true).map((leave, idx) => {
                const { name, rank } = getRequesterInfo(leave);
                const cancelled = leave.status !== 'active';
                const canCancel = !cancelled && (leave.member_id === currentUserId || isAdmin);
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
                        <span className="font-semibold text-gray-900">
                          {name} {rank}
                        </span>{' '}
                        <span className="font-medium text-gray-900">{leave.type}</span>
                        {leave.sub_reason && (
                          <span className="text-gray-600"> ({leave.sub_reason})</span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
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
                            onClick={() => handleCancel(leave)}
                            className="p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition"
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
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* 대원별 이달 사용일수 */}
      <MonthlyMemberSummary
        leaves={activeLeaves}
        profiles={profiles}
        firstDay={monthFirstDay}
        lastDay={monthLastDay}
      />
    </div>
  );
}

function MonthlyMemberSummary({
  leaves,
  profiles,
  firstDay,
  lastDay,
}: {
  leaves: LeaveRequest[];
  profiles: Map<string, Profile>;
  firstDay: string;
  lastDay: string;
}) {
  const counts = new Map<string, { annualDays: number; sickDays: number }>();

  leaves.forEach((leave) => {
    if (leave.type !== '연가' && leave.type !== '병가') return;
    if (!leave.member_id) return;

    // 이번 달 범위로 잘라낸 실제 사용일수만 집계한다.
    const clippedStart = leave.start_date > firstDay ? leave.start_date : firstDay;
    const clippedEnd = leave.end_date < lastDay ? leave.end_date : lastDay;
    if (clippedStart > clippedEnd) return;
    const days = daysBetweenInclusive(clippedStart, clippedEnd);

    const entry = counts.get(leave.member_id) || { annualDays: 0, sickDays: 0 };
    if (leave.type === '연가') entry.annualDays += days;
    else entry.sickDays += days;
    counts.set(leave.member_id, entry);
  });

  const summary = Array.from(counts.entries())
    .map(([memberId, count]) => ({
      memberId,
      name: profiles.get(memberId)?.name ?? '알 수 없음',
      rank: profiles.get(memberId)?.rank ?? '',
      ...count,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'ko'));

  return (
    <div className="mt-6 pt-6 border-t border-gray-200">
      <h3 className="font-semibold text-gray-900 mb-3">이달의 대원별 사용일수</h3>
      {summary.length === 0 ? (
        <p className="text-gray-500 text-sm">이번 달 연가/병가 사용 내역이 없습니다.</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {summary.map((m) => (
            <div
              key={m.memberId}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-gray-50 border border-gray-200 text-sm"
            >
              <span className="font-medium text-gray-900">
                {m.name} {m.rank}
              </span>
              {m.annualDays > 0 && (
                <span className="text-xs px-1.5 py-0.5 rounded-full bg-green-100 text-green-700">
                  연가 {m.annualDays}일
                </span>
              )}
              {m.sickDays > 0 && (
                <span className="text-xs px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700">
                  병가 {m.sickDays}일
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
