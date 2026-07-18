'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { getQuotaStatus, formatDate, formatDateTime, LEAVE_REASONS } from '@/lib/utils';
import { Trash2 } from 'lucide-react';

interface LeaveRequest {
  id: string;
  member_id: string;
  type: string;
  sub_reason: string | null;
  start_date: string;
  end_date: string;
  status: string;
  created_at: string;
  cancelled_at: string | null;
  profiles: { name: string; rank: string };
}

interface QuotaSettings {
  base_quota: number;
  max_quota: number;
}

export default function LeaveRequestsList({ currentUserId }: { currentUserId: string }) {
  const [leaves, setLeaves] = useState<LeaveRequest[]>([]);
  const [quotaSettings, setQuotaSettings] = useState<QuotaSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [dateRange] = useState<[Date, Date]>([
    new Date(),
    new Date(new Date().getTime() + 90 * 24 * 60 * 60 * 1000), // 90일 후
  ]);

  useEffect(() => {
    loadData();

    // 일단 Realtime 구독 비활성화 (나중에 수정)
    // const channel = supabase
    //   .channel('leave_requests_changes')
    //   .on(
    //     'postgres_changes',
    //     { event: '*', schema: 'public', table: 'leave_requests' },
    //     async () => {
    //       await loadData();
    //     }
    //   )
    //   .subscribe();

    // return () => {
    //   channel.unsubscribe();
    // };
  }, [currentUserId]);

  const loadData = async () => {
    try {
      // 최신 정원 설정 조회
      const { data: quota, error: quotaError } = await supabase
        .from('quota_settings')
        .select('base_quota, max_quota')
        .lte('effective_from', new Date().toISOString().split('T')[0])
        .order('effective_from', { ascending: false })
        .limit(1)
        .single();

      if (quotaError) console.error('정원 설정 로드 실패:', quotaError);
      setQuotaSettings(quota);

      // 연가 신청 조회 (join 없이 먼저 테스트)
      const { data: leaveData, error: leaveError } = await supabase
        .from('leave_requests')
        .select('*');

      if (leaveError) {
        console.error('연가 조회 실패:', leaveError);
      } else {
        console.log('조회된 연가 데이터:', leaveData);
      }

      setLeaves(leaveData || []);
    } catch (error) {
      console.error('데이터 로드 실패:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = async (id: string) => {
    if (!confirm('정말 취소하시겠습니까?')) return;

    try {
      await supabase
        .from('leave_requests')
        .update({ status: 'cancelled', cancelled_at: new Date().toISOString() })
        .eq('id', id);
      loadData();
    } catch (error) {
      alert('취소 실패했습니다.');
    }
  };

  // 날짜별 그룹화
  const dateGroups = new Map<string, LeaveRequest[]>();
  leaves.forEach((leave) => {
    const date = leave.start_date;
    if (!dateGroups.has(date)) {
      dateGroups.set(date, []);
    }
    dateGroups.get(date)!.push(leave);
  });

  if (loading) {
    return <div className="text-center text-gray-600">로딩 중...</div>;
  }

  return (
    <div className="space-y-4">
      {Array.from(dateGroups.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, requests]) => {
          const quota = quotaSettings;
          const status = quota ? getQuotaStatus(requests.length, quota.base_quota, quota.max_quota) : null;

          return (
            <div key={date} className="bg-white rounded-lg shadow p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-lg font-semibold text-gray-900">{formatDate(date)}</h3>
                {status && (
                  <div className={`px-3 py-1 rounded-full text-sm font-medium ${status.color}`}>
                    {requests.length}/{quota?.max_quota} {status.label}
                  </div>
                )}
              </div>

              <div className="space-y-2">
                {requests.map((leave) => (
                  <div key={leave.id} className="flex items-start justify-between p-3 bg-gray-50 rounded border border-gray-200">
                    <div className="flex-1">
                      <div className="font-semibold text-gray-900">
                        {leave.profiles?.name} {leave.profiles?.rank}
                      </div>
                      <div className="text-sm text-gray-600 mt-1">
                        유형: <span className="font-medium">{leave.type}</span>
                        {leave.sub_reason && ` (${leave.sub_reason})`}
                      </div>
                      {leave.start_date !== leave.end_date && (
                        <div className="text-sm text-gray-600">
                          기간: {formatDate(leave.start_date)} ~ {formatDate(leave.end_date)}
                        </div>
                      )}
                      <div className="text-xs text-gray-500 mt-1">
                        기입: {formatDateTime(leave.created_at)}
                        {leave.cancelled_at && (
                          <span className="ml-2 text-red-600">
                            (취소: {formatDateTime(leave.cancelled_at)})
                          </span>
                        )}
                      </div>
                    </div>
                    {leave.member_id === currentUserId && (
                      <button
                        onClick={() => handleCancel(leave.id)}
                        className="ml-4 p-2 text-red-600 hover:bg-red-50 rounded transition"
                        title="취소"
                      >
                        <Trash2 size={18} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          );
        })}

      {dateGroups.size === 0 && (
        <div className="text-center text-gray-500 py-8">
          신청된 연가/병가가 없습니다.
        </div>
      )}
    </div>
  );
}
