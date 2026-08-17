'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import {
  LEAVE_TYPES,
  SUB_REASON_OPTIONS_BY_TYPE,
  ABSENCE_LENGTHS,
  QUOTA_EXEMPT_ABSENCE,
  spansThreeMonths,
  daysBetweenInclusive,
  describeUnexpectedError,
  getTodayString,
} from '@/lib/utils';

// 한 번에 신청할 수 있는 최대 일수. 날짜 오입력(연도를 잘못 적는 등)을 걸러내기 위한 상한이다.
// 휴직은 애초에 몇 달~몇 년짜리라 같은 잣대를 대면 3개월 이상 휴직이 아예 등록되지 않는다.
const MAX_REQUEST_DAYS = 90;
const MAX_ABSENCE_DAYS = 1096; // 약 3년

export default function LeaveRequestForm({ currentUserId, onSuccess }: { currentUserId: string; onSuccess: () => void }) {
  const [formData, setFormData] = useState({
    type: '연가',
    subReason: '',
    absenceLength: '',
    startDate: '',
    endDate: '',
    note: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const subReasonOptions = SUB_REASON_OPTIONS_BY_TYPE[formData.type];
  // 휴직만 기간 구분을 함께 받는다. 이 값이 정원 계산에 들어가기 때문이다.
  const needsAbsenceLength = formData.type === '휴직';

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
      setError(formData.type === '연가' ? '구분을 선택해주세요.' : '사유를 선택해주세요.');
      return;
    }

    if (needsAbsenceLength && !formData.absenceLength) {
      setError('휴직 기간을 선택해주세요. 정원 계산이 달라집니다.');
      return;
    }

    // 연도를 잘못 입력하는 실수(2026 → 2027 등)를 걸러낸다.
    const maxDays = needsAbsenceLength ? MAX_ABSENCE_DAYS : MAX_REQUEST_DAYS;
    const days = daysBetweenInclusive(formData.startDate, formData.endDate);
    if (days > maxDays) {
      setError(`한 번에 ${maxDays}일까지만 신청할 수 있습니다. 날짜를 확인해주세요.`);
      return;
    }

    // 고른 기간 구분과 실제 날짜가 어긋나면 정원이 몇 달 내내 잘못 계산된다.
    // 사정이 있어 그대로 낼 수도 있으니 막지는 않고 한 번 확인만 받는다.
    if (needsAbsenceLength) {
      const actuallyLong = spansThreeMonths(formData.startDate, formData.endDate);
      const chosenLong = formData.absenceLength === QUOTA_EXEMPT_ABSENCE;
      if (actuallyLong !== chosenLong) {
        const message = actuallyLong
          ? `입력한 기간(${formData.startDate} ~ ${formData.endDate})은 3개월 이상인데 '3개월 미만'을 골랐습니다.\n\n` +
            '이대로 신청하면 그 기간 내내 가능인원 한 자리를 차지합니다. 그대로 진행할까요?'
          : `입력한 기간(${formData.startDate} ~ ${formData.endDate})은 3개월이 되지 않는데 '3개월 이상'을 골랐습니다.\n\n` +
            '이대로 신청하면 정원에서 빠져 가능인원이 줄지 않습니다. 그대로 진행할까요?';
        if (!confirm(message)) return;
      }
    }

    // 지난 날짜 신청이 필요한 경우도 있어 막지는 않고, 실수인지 한 번 확인만 받는다.
    if (formData.startDate < getTodayString()) {
      if (!confirm(`시작일(${formData.startDate})이 오늘보다 이전입니다. 그대로 신청할까요?`)) {
        return;
      }
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
        absence_length: needsAbsenceLength ? formData.absenceLength : null,
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

      setFormData({
        type: '연가',
        subReason: '',
        absenceLength: '',
        startDate: '',
        endDate: '',
        note: '',
      });
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
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">유형</label>
            <select
              value={formData.type}
              onChange={(e) =>
                setFormData({ ...formData, type: e.target.value, subReason: '', absenceLength: '' })
              }
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
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {formData.type === '연가' ? '구분' : '사유'}
              </label>
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

        {needsAbsenceLength && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">휴직 기간</label>
            <select
              value={formData.absenceLength}
              onChange={(e) => setFormData({ ...formData, absenceLength: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
            >
              <option value="">선택해주세요</option>
              {ABSENCE_LENGTHS.map((length) => (
                <option key={length} value={length}>
                  {length}
                </option>
              ))}
            </select>
            <div className="mt-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-900">
              <p className="font-semibold">이 선택에 따라 정원 계산이 달라집니다.</p>
              <ul className="mt-1 space-y-0.5 list-disc list-inside">
                <li>
                  <strong className="font-semibold">3개월 이상</strong> — 부대 정원에서 빠지므로
                  가능인원이 줄지 않습니다.
                </li>
                <li>
                  <strong className="font-semibold">3개월 미만</strong> — 자리가 그대로 남아 있어
                  그 기간 내내 가능인원 한 자리를 차지합니다.
                </li>
              </ul>
            </div>
          </div>
        )}

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
            placeholder="필요한 사항이 있으면 작성해주세요 (해외, 국내, 결혼 등)"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
            rows={3}
          />
        </div>

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
