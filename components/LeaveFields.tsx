'use client';

import { LEAVE_TYPES, SUB_REASON_OPTIONS_BY_TYPE, ABSENCE_LENGTHS } from '@/lib/utils';
import { needsAbsenceLength, type LeaveInput } from '@/lib/leaveValidation';

const FIELD_CLASS =
  'w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none';

/**
 * 신청 한 건을 이루는 입력 칸들.
 *
 * 대원이 본인 것을 내는 화면과 서무가 대신 넣고 고치는 화면이 똑같은 칸을 쓴다.
 * 따로 만들어두면 유형을 하나 늘리거나 안내 문구를 고칠 때 한쪽만 바뀌어,
 * 같은 신청인데 어디서 냈느냐에 따라 다른 값이 들어가게 된다.
 */
export default function LeaveFields({
  value,
  onChange,
  disabled = false,
}: {
  value: LeaveInput;
  onChange: (next: LeaveInput) => void;
  disabled?: boolean;
}) {
  const subReasonOptions = SUB_REASON_OPTIONS_BY_TYPE[value.type];
  const showAbsenceLength = needsAbsenceLength(value.type);

  const set = (patch: Partial<LeaveInput>) => onChange({ ...value, ...patch });

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">유형</label>
          <select
            value={value.type}
            disabled={disabled}
            // 유형이 바뀌면 이전 유형에서 고른 사유·기간은 더 이상 맞지 않으므로 비운다.
            onChange={(e) => set({ type: e.target.value, subReason: '', absenceLength: '' })}
            className={FIELD_CLASS}
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
              {value.type === '연가' ? '구분' : '사유'}
            </label>
            <select
              value={value.subReason}
              disabled={disabled}
              onChange={(e) => set({ subReason: e.target.value })}
              className={FIELD_CLASS}
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

      {showAbsenceLength && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">휴직 기간</label>
          <select
            value={value.absenceLength}
            disabled={disabled}
            onChange={(e) => set({ absenceLength: e.target.value })}
            className={FIELD_CLASS}
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
            value={value.startDate}
            disabled={disabled}
            onChange={(e) => set({ startDate: e.target.value })}
            className={FIELD_CLASS}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">종료일</label>
          <input
            type="date"
            value={value.endDate}
            disabled={disabled}
            onChange={(e) => set({ endDate: e.target.value })}
            className={FIELD_CLASS}
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">추가 사항 (선택)</label>
        <textarea
          value={value.note}
          disabled={disabled}
          onChange={(e) => set({ note: e.target.value })}
          placeholder="필요한 사항이 있으면 작성해주세요 (해외, 국내, 결혼 등)"
          className={FIELD_CLASS}
          rows={3}
        />
      </div>
    </div>
  );
}
