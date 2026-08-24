'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { describeUnexpectedError } from '@/lib/utils';
import {
  emptyLeaveInput,
  leaveWarnings,
  toLeaveRow,
  validateLeaveInput,
  type LeaveInput,
} from '@/lib/leaveValidation';
import LeaveFields from './LeaveFields';

export default function LeaveRequestForm({ currentUserId, onSuccess }: { currentUserId: string; onSuccess: () => void }) {
  const [formData, setFormData] = useState<LeaveInput>(emptyLeaveInput);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const problem = validateLeaveInput(formData);
    if (problem) {
      setError(problem);
      return;
    }

    // 막을 정도는 아니지만 그냥 넘기면 정원이 잘못 계산되거나 날짜를 잘못 적은 채로
    // 들어가는 것들. 사정이 있어 그대로 낼 수도 있으니 확인만 받는다.
    for (const warning of leaveWarnings(formData)) {
      if (!confirm(warning)) return;
    }

    setLoading(true);

    try {
      // 같은 날짜에 이미 신청한(취소되지 않은) 다른 유형이 있으면 하루에 한 유형만
      // 신청할 수 있도록 먼저 겹치는 신청이 있는지 확인한다.
      const { data: overlapping, error: overlapError } = await supabase
        .from('leave_requests')
        .select('type, start_date, end_date')
        .eq('member_id', currentUserId)
        .eq('status', 'active')
        .lte('start_date', formData.endDate)
        .gte('end_date', formData.startDate);

      if (overlapError) throw overlapError;

      if (overlapping && overlapping.length > 0) {
        const conflict = overlapping[0];
        setError(
          `이미 신청한 ${conflict.type}(${conflict.start_date} ~ ${conflict.end_date})와 날짜가 겹칩니다. 하루에 한 유형만 신청할 수 있습니다.`
        );
        setLoading(false);
        return;
      }

      const { error: insertError } = await supabase.from('leave_requests').insert({
        member_id: currentUserId,
        ...toLeaveRow(formData),
        status: 'active',
      });

      if (insertError) {
        if (insertError.code === '23P01') {
          setError('이미 신청한 다른 유형과 날짜가 겹쳐 신청할 수 없습니다.');
          return;
        }
        // 서버가 허용하는 유형 목록(DB의 check 제약조건)에 없는 값을 고른 경우.
        // 앱에만 유형을 추가하고 DB를 함께 고치지 않으면 여기로 온다 — 대원이 다시
        // 시도해서 풀 수 있는 문제가 아니므로 무엇이 문제인지 분명히 알린다.
        if (insertError.code === '23514') {
          setError(
            `'${formData.type}'은(는) 서버에 아직 등록되지 않은 유형이라 신청할 수 없습니다.\n` +
              `다른 유형으로 신청하시고, 서무에게 이 화면을 알려주세요. [23514]`
          );
          return;
        }
        throw insertError;
      }

      setFormData(emptyLeaveInput());
      onSuccess();
      alert('신청이 완료되었습니다.');
    } catch (err) {
      setError(describeUnexpectedError(err, '신청'));
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h2 className="text-xl font-bold mb-6 text-gray-900">연가/병가 신청</h2>

      <form onSubmit={handleSubmit} className="space-y-4">
        <LeaveFields value={formData} onChange={setFormData} disabled={loading} />

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm whitespace-pre-line break-words">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-blue-500 hover:bg-blue-600 disabled:bg-gray-400 text-white font-semibold py-2 px-4 rounded-lg transition duration-200"
        >
          {loading ? '등록 중...' : '신청하기'}
        </button>
      </form>
    </div>
  );
}
