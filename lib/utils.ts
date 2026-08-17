// 세션에 담긴 app_metadata를 보고 비밀번호를 아직 바꾸지 않았는지 판단한다.
// 기존 계정에는 이 값이 없으므로, false로 명시된 경우에만 "이미 바꿨다"고 본다.
// (서버의 판정 기준과 같아야 한다 — lib/serverAuth.ts의 mustChangePassword 참고)
export function needsPasswordChange(
  user: { app_metadata?: Record<string, unknown> } | null | undefined
) {
  if (!user) return false;
  return user.app_metadata?.must_change_password !== false;
}

/**
 * 예상하지 못한 오류를 대원이 그대로 읽어 전달할 수 있는 문장으로 바꾼다.
 *
 * "다시 시도해주세요"만 보여주면, 재시도로는 절대 풀리지 않는 문제(예: 서버가 허용하지
 * 않는 유형을 고른 경우)를 대원이 계속 다시 눌러보게 되고 진짜 원인은 콘솔에만 남는다.
 * 코드까지 화면에 남겨두면 대원 → 서무 → 개발자로 그대로 옮겨적을 수 있다.
 */
export function describeUnexpectedError(error: unknown, action: string) {
  const e = error as { code?: string; message?: string } | null;
  const code = e?.code;
  const message = e?.message;

  // 서버가 돌려준 오류에는 항상 코드가 붙는다. 코드가 없으면 요청이 서버에 닿지도
  // 못한 것(연결 끊김 등)이므로, 이때는 재시도가 실제로 맞는 조치다.
  if (!code) {
    return `${action}에 실패했습니다. 인터넷 연결을 확인하고 다시 시도해주세요.`;
  }

  return (
    `${action}에 실패했습니다. 다시 시도해도 안 되면 아래 내용을 서무에게 알려주세요.\n` +
    `[${code ?? '코드 없음'}] ${message ?? ''}`.trim()
  );
}

export function getQuotaStatus(current: number, base: number, max: number) {
  if (current <= base) {
    return { status: 'available', color: 'bg-green-100 text-green-800', label: '여유' };
  } else if (current <= max) {
    return { status: 'warning', color: 'bg-yellow-100 text-yellow-800', label: '주의' };
  } else {
    return { status: 'exceeded', color: 'bg-red-100 text-red-800', label: '초과' };
  }
}

export interface QuotaSetting {
  id: string;
  effective_from: string;
  /** 비어 있으면 다음 설정이 시작하기 전까지 계속 적용된다. */
  effective_to: string | null;
  dispatch_rate: string;
  base_quota: number;
  max_quota: number;
  created_at: string;
}

// 날짜(date)에 실제로 적용되는 정원 설정을 찾는다.
// 시작일이 date 이전(포함)이고, 종료일이 없거나 date 이후(포함)인 것들 중
// 가장 늦게 시작한 설정을 쓴다. 시작일이 같으면 나중에 등록된 것을 우선한다.
export function getQuotaForDate(settings: QuotaSetting[], date: string): QuotaSetting | null {
  const candidates = settings.filter(
    (s) => s.effective_from <= date && (!s.effective_to || date <= s.effective_to)
  );
  if (candidates.length === 0) return null;

  return candidates.reduce((latest, s) => {
    if (s.effective_from !== latest.effective_from) {
      return s.effective_from > latest.effective_from ? s : latest;
    }
    return s.created_at > latest.created_at ? s : latest;
  });
}

/**
 * from부터 days일 안에서, 적용되는 정원 설정이 하나도 없는 첫 날짜를 찾는다.
 * 전부 덮여 있으면 null.
 *
 * 종료일이 있는 설정만 있으면 그 다음날부터 달력의 색과 인원 표시가 통째로 사라지는데,
 * 화면에는 "-"만 뜰 뿐이라 서무가 알아채기 어렵다. 미리 찾아서 알려주기 위한 것이다.
 */
export function findQuotaGapStart(
  settings: QuotaSetting[],
  from: string,
  days: number
): string | null {
  for (let i = 0; i < days; i++) {
    const date = addDays(from, i);
    if (!getQuotaForDate(settings, date)) return date;
  }
  return null;
}

/**
 * 두 설정의 적용 기간이 하루라도 겹치는지 본다.
 * 겹치면 그 날짜에 어느 설정을 쓸지 모호해지므로 저장 전에 막는다.
 */
export function quotaPeriodsOverlap(
  a: { effective_from: string; effective_to: string | null },
  b: { effective_from: string; effective_to: string | null }
) {
  const aEnd = a.effective_to ?? '9999-12-31';
  const bEnd = b.effective_to ?? '9999-12-31';
  return a.effective_from <= bEnd && b.effective_from <= aEnd;
}

// "오늘"을 로컬 날짜 문자열로 반환한다. new Date().toISOString()로 만들면
// 한국 시간대에서 자정~오전 9시 사이에 UTC 변환 때문에 하루 전으로 밀린다.
export function getTodayString() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

export function addDays(dateString: string, days: number) {
  const [y, m, d] = dateString.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().split('T')[0];
}

export function daysBetweenInclusive(startDate: string, endDate: string) {
  const [sy, sm, sd] = startDate.split('-').map(Number);
  const [ey, em, ed] = endDate.split('-').map(Number);
  const start = Date.UTC(sy, sm - 1, sd);
  const end = Date.UTC(ey, em - 1, ed);
  return Math.round((end - start) / 86400000) + 1;
}

export function formatDate(dateString: string) {
  const date = new Date(dateString + 'T00:00:00');
  return date.toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
}

// Supabase의 timestamp(타임존 없는) 컬럼은 UTC 값인데도 'Z'/오프셋 없이 내려온다.
// 타임존 표기가 없으면 JS가 이를 로컬 시각으로 오인해서 한국 시간 기준 9시간이 어긋난다.
// 타임존 표기가 없을 때만 'Z'를 붙여 UTC로 명시적으로 해석한다.
function parseTimestamp(dateString: string) {
  const hasTimezone = /[zZ]|[+-]\d\d:?\d\d$/.test(dateString);
  return new Date(hasTimezone ? dateString : `${dateString}Z`);
}

export function formatDateTime(dateString: string) {
  return parseTimestamp(dateString).toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatDateFromTimestamp(dateString: string) {
  return parseTimestamp(dateString).toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
}

export function addMonths(dateString: string, months: number) {
  const [y, m, d] = dateString.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1 + months, d));
  return date.toISOString().split('T')[0];
}

/**
 * 휴직 기간 구분. 정원(가능인원)에 영향을 주는지가 여기서 갈린다.
 *
 * 3개월 이상 휴직은 부대 정원에서 아예 빠지므로 가능인원이 줄지 않는다.
 * 3개월 미만은 자리가 그대로 남아 있는 상태라 그 사람 몫으로 한 자리가 묶인다.
 * 예) 출동율 80%로 가능인원이 3명일 때, 3개월 이상 휴직자가 있어도 3명이 갈 수 있지만
 *     3개월 미만 휴직자가 있으면 실질적으로 2명만 갈 수 있다.
 */
export const ABSENCE_LENGTHS = ['3개월 이상', '3개월 미만'];

/** 이 값을 고른 휴직만 정원에서 빠진다. */
export const QUOTA_EXEMPT_ABSENCE = '3개월 이상';

/** 3개월(달력 기준)을 채우는 기간인지 본다. 신청 화면에서 고른 값과 대조하는 데 쓴다. */
export function spansThreeMonths(startDate: string, endDate: string) {
  return endDate >= addDays(addMonths(startDate, 3), -1);
}

/**
 * 이 신청이 그날의 가능인원 한 자리를 차지하는지 본다.
 *
 * 연가·병가·교육·출장 등은 그날 근무에서 빠지는 것이라 모두 자리를 차지한다.
 * 3개월 이상 휴직만 예외로, 정원 자체에서 빠져 있어 세지 않는다.
 * (기간을 고르기 전에 등록된 예전 휴직은 값이 비어 있으므로 지금까지처럼 자리를 차지한다.)
 */
export function occupiesQuota(leave: { type: string; absence_length?: string | null }) {
  return !(leave.type === '휴직' && leave.absence_length === QUOTA_EXEMPT_ABSENCE);
}

export const LEAVE_TYPES = ['연가', '병가', '공가', '특가', '교육', '출장', '휴직'];
// 연가는 하루를 다 쓰는지(일반), 반일만 쓰는지(오전/오후)만 고른다.
// 여행·결혼식 같은 구체적인 사정은 목록으로 못 다 담고 사생활이기도 해서,
// 필요한 사람만 신청 화면의 '추가 사항'에 직접 적도록 안내한다.
export const LEAVE_REASONS = ['일반', '오전', '오후'];
export const LEAVE_OF_ABSENCE_REASONS = ['육아휴직', '유학휴직', '돌봄휴직', '질병휴직'];

// 유형별로 사유 선택이 필요한 경우, 어떤 목록을 보여줄지 매핑한다.
export const SUB_REASON_OPTIONS_BY_TYPE: Record<string, string[]> = {
  연가: LEAVE_REASONS,
  휴직: LEAVE_OF_ABSENCE_REASONS,
};

export const DISPATCH_RATE_OPTIONS = ['70%', '80%', '90%', '100%'] as const;

// 출동율을 고르면 채워지는 가능인원(통상적으로 연가를 보낼 수 있는 인원)의 출발값.
// 출동율이 10% 오를 때마다 2명씩 줄어드는 기존 기준을 그대로 이었다.
// 서무가 그 자리에서 고칠 수 있으므로 어디까지나 기본값이다.
export const BASE_QUOTA_BY_DISPATCH_RATE: Record<string, number> = {
  '70%': 5,
  '80%': 3,
  '90%': 1,
  '100%': 0,
};

/** 예비인원(만일을 대비해 남겨두는 인원)의 기본값. 역시 고칠 수 있다. */
export const DEFAULT_RESERVE_QUOTA = 2;

/** 인원 선택 목록. 0명은 "그 기간에는 연가를 보내지 않는다"는 뜻으로 쓸 수 있다. */
export const QUOTA_CHOICES = Array.from({ length: 11 }, (_, i) => i);
