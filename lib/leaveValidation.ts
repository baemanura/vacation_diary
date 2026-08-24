import {
  LEAVE_TYPES,
  SUB_REASON_OPTIONS_BY_TYPE,
  ABSENCE_LENGTHS,
  QUOTA_EXEMPT_ABSENCE,
  spansThreeMonths,
  daysBetweenInclusive,
  getTodayString,
} from './utils';

// 한 번에 신청할 수 있는 최대 일수. 날짜 오입력(연도를 잘못 적는 등)을 걸러내기 위한 상한이다.
// 휴직은 애초에 몇 달~몇 년짜리라 같은 잣대를 대면 3개월 이상 휴직이 아예 등록되지 않는다.
export const MAX_REQUEST_DAYS = 90;
export const MAX_ABSENCE_DAYS = 1096; // 약 3년

/**
 * 신청 화면이 다루는 값 한 벌.
 *
 * 대원이 본인 것을 내는 화면(LeaveRequestForm)과 서무가 대신 넣고 고치는 화면
 * (ProxyLeaveManager)이 같은 모양을 쓴다. 두 화면의 검사 기준이 갈라지면
 * 한쪽에서만 통과하는 값이 생기므로 판정도 여기에 모아둔다.
 */
export interface LeaveInput {
  type: string;
  subReason: string;
  absenceLength: string;
  startDate: string;
  endDate: string;
  note: string;
}

export const emptyLeaveInput = (): LeaveInput => ({
  type: '연가',
  subReason: '',
  absenceLength: '',
  startDate: '',
  endDate: '',
  note: '',
});

/** 휴직만 기간 구분을 함께 받는다. 이 값이 정원 계산에 들어가기 때문이다. */
export const needsAbsenceLength = (type: string) => type === '휴직';

/**
 * 반드시 막아야 하는 입력을 걸러낸다. 통과하면 null, 아니면 보여줄 문장.
 *
 * 브라우저와 서버가 똑같이 이 함수를 부른다. 브라우저 검사는 왕복 없이 바로 알려주기
 * 위한 것이고, 실제로 막는 것은 서버 쪽 호출이다.
 */
export function validateLeaveInput(input: LeaveInput): string | null {
  if (!LEAVE_TYPES.includes(input.type)) {
    return `'${input.type}'은(는) 사용할 수 없는 유형입니다.`;
  }

  if (!input.startDate || !input.endDate) {
    return '날짜를 입력해주세요.';
  }

  if (input.startDate > input.endDate) {
    return '종료일이 시작일보다 클 수 없습니다.';
  }

  const subReasonOptions = SUB_REASON_OPTIONS_BY_TYPE[input.type];
  if (subReasonOptions) {
    if (!input.subReason) {
      return input.type === '연가' ? '구분을 선택해주세요.' : '사유를 선택해주세요.';
    }
    if (!subReasonOptions.includes(input.subReason)) {
      return `'${input.subReason}'은(는) ${input.type}에서 고를 수 없는 값입니다.`;
    }
  }

  if (needsAbsenceLength(input.type)) {
    if (!input.absenceLength) {
      return '휴직 기간을 선택해주세요. 정원 계산이 달라집니다.';
    }
    if (!ABSENCE_LENGTHS.includes(input.absenceLength)) {
      return `'${input.absenceLength}'은(는) 고를 수 없는 휴직 기간입니다.`;
    }
  }

  // 연도를 잘못 입력하는 실수(2026 → 2027 등)를 걸러낸다.
  const maxDays = needsAbsenceLength(input.type) ? MAX_ABSENCE_DAYS : MAX_REQUEST_DAYS;
  if (daysBetweenInclusive(input.startDate, input.endDate) > maxDays) {
    return `한 번에 ${maxDays}일까지만 신청할 수 있습니다. 날짜를 확인해주세요.`;
  }

  return null;
}

/**
 * 막지는 않고 한 번 확인만 받을 내용. 순서대로 confirm()에 걸면 된다.
 *
 * 서버에서는 쓰지 않는다 — 사정이 있어 그대로 내는 경우가 실제로 있어서,
 * 서버가 막아버리면 그 신청을 아예 넣을 수 없게 된다.
 */
export function leaveWarnings(input: LeaveInput): string[] {
  const warnings: string[] = [];

  // 고른 기간 구분과 실제 날짜가 어긋나면 정원이 몇 달 내내 잘못 계산된다.
  if (needsAbsenceLength(input.type) && input.startDate && input.endDate) {
    const actuallyLong = spansThreeMonths(input.startDate, input.endDate);
    const chosenLong = input.absenceLength === QUOTA_EXEMPT_ABSENCE;
    if (actuallyLong !== chosenLong) {
      warnings.push(
        actuallyLong
          ? `입력한 기간(${input.startDate} ~ ${input.endDate})은 3개월 이상인데 '3개월 미만'을 골랐습니다.\n\n` +
              '이대로 신청하면 그 기간 내내 가능인원 한 자리를 차지합니다. 그대로 진행할까요?'
          : `입력한 기간(${input.startDate} ~ ${input.endDate})은 3개월이 되지 않는데 '3개월 이상'을 골랐습니다.\n\n` +
              '이대로 신청하면 정원에서 빠져 가능인원이 줄지 않습니다. 그대로 진행할까요?'
      );
    }
  }

  // 지난 날짜 신청이 필요한 경우도 있어 막지는 않고, 실수인지 한 번 확인만 받는다.
  if (input.startDate && input.startDate < getTodayString()) {
    warnings.push(`시작일(${input.startDate})이 오늘보다 이전입니다. 그대로 진행할까요?`);
  }

  return warnings;
}

/** 화면의 값 한 벌을 leave_requests에 넣을 모양으로 바꾼다. */
export function toLeaveRow(input: LeaveInput) {
  return {
    type: input.type,
    sub_reason: SUB_REASON_OPTIONS_BY_TYPE[input.type] ? input.subReason : null,
    absence_length: needsAbsenceLength(input.type) ? input.absenceLength : null,
    start_date: input.startDate,
    end_date: input.endDate,
    note: input.note.trim() || null,
  };
}

/** 요청 본문에서 받은 값을 LeaveInput 모양으로 정리한다(서버용). */
export function readLeaveInput(body: Record<string, unknown>): LeaveInput {
  const text = (value: unknown) => (typeof value === 'string' ? value.trim() : '');
  return {
    type: text(body.type),
    subReason: text(body.subReason),
    absenceLength: text(body.absenceLength),
    startDate: text(body.startDate),
    endDate: text(body.endDate),
    note: text(body.note),
  };
}
