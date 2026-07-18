'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { LEAVE_TYPES, SUB_REASON_OPTIONS_BY_TYPE } from '@/lib/utils';

export default function LeaveRequestForm({ currentUserId, onSuccess }: { currentUserId: string; onSuccess: () => void }) {
  const [formData, setFormData] = useState({
    type: '연가',
    subReason: '',
    startDate: '',
    endDate: '',
    note: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const subReasonOptions = SUB_REASON_OPTIONS_BY_TYPE[formData.type];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!formData.startDate || !formData.endDate) {
      setError('날짜를 입력해주세요.');
      return;
    }

    if (formData.startDate > formData.endDate) {
      setError('종료일이 시작일보다 클 수 없습니다.');
      return;
    }

    if (subReasonOptions && !formData.subReason) {
      setError('사유를 선택해주세요.');
      return;
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
        type: formData.type,
        sub_reason: subReasonOptions ? formData.subReason : null,
        start_date: formData.startDate,
        end_date: formData.endDate,
        note: formData.note || null,
        status: 'active',
      });

      if (insertError) {
        if (insertError.code === '23P01') {
          setError('이미 신청한 다른 유형과 날짜가 겹쳐 신청할 수 없습니다.');
          return;
        }
        throw insertError;
      }

      setFormData({
        type: '연가',
        subReason: '',
        startDate: '',
        endDate: '',
        note: '',
      });
      onSuccess();
      alert('신청이 완료되었습니다.');
    } catch (err) {
      setError('신청 실패. 다시 시도해주세요.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h2 className="text-xl font-bold mb-6 text-gray-900">연가/병가 신청</h2>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">유형</label>
            <select
              value={formData.type}
              onChange={(e) => setFormData({ ...formData, type: e.target.value, subReason: '' })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
            >
              {LEAVE_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </div>

          {subReasonOptions && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">사유</label>
              <select
                value={formData.subReason}
                onChange={(e) => setFormData({ ...formData, subReason: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
              >
                <option value="">선택해주세요</option>
                {subReasonOptions.map((reason) => (
                  <option key={reason} value={reason}>
                    {reason}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">시작일</label>
            <input
              type="date"
              value={formData.startDate}
              onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">종료일</label>
            <input
              type="date"
              value={formData.endDate}
              onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">추가 사항 (선택)</label>
          <textarea
            value={formData.note}
            onChange={(e) => setFormData({ ...formData, note: e.target.value })}
            placeholder="필요한 사항이 있으면 작성해주세요."
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
            rows={3}
          />
        </div>

        {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">{error}</div>}

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
