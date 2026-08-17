'use client';

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useLiveRefresh } from '@/lib/useLiveRefresh';
import { daysBetweenInclusive, TYPE_BADGE_COLOR } from '@/lib/utils';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface LeaveRow {
  member_id: string;
  type: string;
  start_date: string;
  end_date: string;
  status: string;
}

interface Profile {
  id: string;
  name: string;
  rank: string;
}

const TOP_N = 5;

/**
 * 그 달에 연가를 많이 쓴 대원 순위. 서무만 보는 화면이다.
 *
 * 원래 달력 맨 아래에 있었는데, 그 자리는 대원이 본인 신청을 확인하는 곳으로 바뀌었다.
 * 남의 사용량은 대원이 굳이 볼 것이 아니지만, 부대 전체의 사용량을 한눈에 보는 수단은
 * 서무에게 남겨둬야 해서 관리 페이지로 옮겼다.
 *
 * 달력과 달리 여기에는 기준이 되는 달이 없으므로 직접 달을 넘길 수 있게 한다.
 */
export default function MemberUsageSummary() {
  // 항상 이번 달로 시작한다. 고정 날짜를 쓰면 달이 바뀌어도 과거 달이 계속 보인다.
  const [month, setMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [leaves, setLeaves] = useState<LeaveRow[]>([]);
  const [profiles, setProfiles] = useState<Map<string, Profile>>(new Map());
  const [loading, setLoading] = useState(true);

  const year = month.getFullYear();
  const monthIndex = month.getMonth();
  const pad = (n: number) => String(n).padStart(2, '0');
  const firstDay = `${year}-${pad(monthIndex + 1)}-01`;
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const lastDay = `${year}-${pad(monthIndex + 1)}-${pad(daysInMonth)}`;

  const load = useCallback(async () => {
    try {
      // 이 달과 하루라도 겹치는 신청을 모두 가져온다(달을 걸친 신청이 빠지지 않도록).
      const { data: leaveData, error: leaveError } = await supabase
        .from('leave_requests')
        .select('member_id, type, start_date, end_date, status')
        .eq('status', 'active')
        .lte('start_date', lastDay)
        .gte('end_date', firstDay);

      if (leaveError) console.error('사용 현황 조회 실패:', leaveError);

      const { data: profileData } = await supabase.from('profiles').select('id, name, rank');

      const profileMap = new Map<string, Profile>();
      profileData?.forEach((p) => profileMap.set(p.id, p));

      setProfiles(profileMap);
      setLeaves(leaveData || []);
    } catch (error) {
      console.error('사용 현황 로드 실패:', error);
    } finally {
      setLoading(false);
    }
  }, [firstDay, lastDay]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  // 대원이 신청하거나 취소하면 새로고침 없이 반영한다.
  useLiveRefresh(['leave_requests'], () => load());

  // member별로 유형별 사용일수를 집계한다. 이번 달 범위로 잘라낸 실제 일수만 센다.
  const counts = new Map<string, Map<string, number>>();
  leaves.forEach((leave) => {
    if (!leave.member_id) return;
    const start = leave.start_date > firstDay ? leave.start_date : firstDay;
    const end = leave.end_date < lastDay ? leave.end_date : lastDay;
    if (start > end) return;
    const days = daysBetweenInclusive(start, end);

    const byType = counts.get(leave.member_id) || new Map<string, number>();
    byType.set(leave.type, (byType.get(leave.type) ?? 0) + days);
    counts.set(leave.member_id, byType);
  });

  // 휴직자는 순위에서 뺀다. 한 달 내내 잡혀 있어 매번 1위가 되어버린다.
  const ranked = Array.from(counts.entries())
    .filter(([, byType]) => !byType.has('휴직'))
    .map(([memberId, byType]) => ({
      memberId,
      name: profiles.get(memberId)?.name ?? '알 수 없음',
      rank: profiles.get(memberId)?.rank ?? '',
      byType: Array.from(byType.entries()),
      totalDays: Array.from(byType.values()).reduce((sum, d) => sum + d, 0),
    }))
    .sort((a, b) => b.totalDays - a.totalDays || a.name.localeCompare(b.name, 'ko'))
    .slice(0, TOP_N);

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-lg font-semibold text-gray-900">대원별 사용일수 (상위 {TOP_N}명)</h3>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setMonth(new Date(year, monthIndex - 1, 1))}
            className="p-2 hover:bg-gray-100 rounded-lg transition"
            title="이전 달"
          >
            <ChevronLeft size={18} />
          </button>
          <span className="text-sm font-medium text-gray-700 tabular-nums whitespace-nowrap">
            {year}년 {monthIndex + 1}월
          </span>
          <button
            onClick={() => setMonth(new Date(year, monthIndex + 1, 1))}
            className="p-2 hover:bg-gray-100 rounded-lg transition"
            title="다음 달"
          >
            <ChevronRight size={18} />
          </button>
        </div>
      </div>
      <p className="text-sm text-gray-500 mb-4">이 화면은 서무에게만 보입니다.</p>

      {loading ? (
        <div className="text-gray-600 text-sm">로딩 중...</div>
      ) : ranked.length === 0 ? (
        <p className="text-gray-500 text-sm">이 달에는 사용 내역이 없습니다.</p>
      ) : (
        <div className="space-y-1.5">
          {ranked.map((m, index) => (
            <div
              key={m.memberId}
              className="flex flex-wrap items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-50 border border-gray-200 text-sm"
            >
              <span className="text-xs font-bold text-gray-400 w-5 shrink-0">{index + 1}위</span>
              <span className="font-medium text-gray-900">
                {m.name} {m.rank}
              </span>
              {m.byType.map(([type, days]) => (
                <span
                  key={type}
                  className={`text-xs px-1.5 py-0.5 rounded-full ${
                    TYPE_BADGE_COLOR[type] ?? 'bg-gray-100 text-gray-700'
                  }`}
                >
                  {type} {days}일
                </span>
              ))}
              <span className="ml-auto text-xs text-gray-500">합계 {m.totalDays}일</span>
            </div>
          ))}
        </div>
      )}

      <p className="mt-4 text-xs text-gray-400">
        휴직은 순위에서 빠집니다. 한 달 내내 잡혀 있어 매번 1위가 되기 때문입니다.
      </p>
    </div>
  );
}
