'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { getQuotaStatus } from '@/lib/utils';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface LeaveRequest {
  id: string;
  start_date: string;
  end_date: string;
  type: string;
  sub_reason: string | null;
  status: string;
  profiles?: { name: string; rank: string };
  member_id?: string;
}

interface QuotaSettings {
  base_quota: number;
  max_quota: number;
}

interface Profile {
  id: string;
  name: string;
  rank: string;
}

export default function LeaveCalendar() {
  const [currentDate, setCurrentDate] = useState(new Date(2026, 6, 18)); // 7월 18일
  const [leaves, setLeaves] = useState<LeaveRequest[]>([]);
  const [profiles, setProfiles] = useState<Map<string, Profile>>(new Map());
  const [quotaSettings, setQuotaSettings] = useState<QuotaSettings | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, [currentDate]);

  const loadData = async () => {
    try {
      // 정원 설정 조회
      const { data: quota } = await supabase
        .from('quota_settings')
        .select('base_quota, max_quota')
        .lte('effective_from', new Date().toISOString().split('T')[0])
        .order('effective_from', { ascending: false })
        .limit(1)
        .single();

      setQuotaSettings(quota);

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
        .eq('status', 'active')
        .lte('end_date', lastDay)
        .gte('start_date', firstDay);

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

  // 날짜 범위에 해당하는 신청 필터링
  const getRequestsForDate = (date: string) => {
    return leaves.filter((leave) => {
      return date >= leave.start_date && date <= leave.end_date;
    });
  };

  // 신청자 정보 가져오기
  const getRequesterInfo = (leave: LeaveRequest) => {
    const profile = leave.member_id ? profiles.get(leave.member_id) : null;
    const name = profile ? `${profile.name}` : '알 수 없음';
    return { name, type: leave.type };
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

  const prevMonth = () => {
    setCurrentDate(new Date(year, month - 1, 1));
    setSelectedDate(null);
  };

  const nextMonth = () => {
    setCurrentDate(new Date(year, month + 1, 1));
    setSelectedDate(null);
  };

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
          const status =
            quotaSettings && requests.length > 0
              ? getQuotaStatus(requests.length, quotaSettings.base_quota, quotaSettings.max_quota)
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
        <div className="grid grid-cols-3 gap-4">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded bg-green-100 border border-green-300"></div>
            <span className="text-sm">여유 (≤ 기본치)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded bg-yellow-100 border border-yellow-300"></div>
            <span className="text-sm">주의 (기본치 ~ 최대치)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded bg-red-100 border border-red-300"></div>
            <span className="text-sm">초과 (&gt; 최대치)</span>
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
            {getRequestsForDate(selectedDate).length === 0 ? (
              <p className="text-gray-500 text-sm">신청된 항목이 없습니다.</p>
            ) : (
              getRequestsForDate(selectedDate).map((leave, idx) => (
                <div key={idx} className="p-2 bg-gray-50 rounded text-sm">
                  <span className="font-medium text-gray-900">{leave.type}</span>
                  {leave.sub_reason && (
                    <span className="text-gray-600"> ({leave.sub_reason})</span>
                  )}
                  <div className="text-xs text-gray-500">
                    {leave.start_date} ~ {leave.end_date}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
