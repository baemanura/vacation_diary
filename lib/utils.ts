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
  dispatch_rate: string;
  base_quota: number;
  max_quota: number;
  created_at: string;
}

// 날짜(date)에 실제로 적용되는 정원 설정을 찾는다.
// effective_from이 date 이전(포함)인 것들 중 가장 최근에 시작된 설정을 사용하고,
// 시작일이 같으면 가장 최근에 등록된(created_at) 설정을 우선한다.
export function getQuotaForDate(settings: QuotaSetting[], date: string): QuotaSetting | null {
  const candidates = settings.filter((s) => s.effective_from <= date);
  if (candidates.length === 0) return null;

  return candidates.reduce((latest, s) => {
    if (s.effective_from !== latest.effective_from) {
      return s.effective_from > latest.effective_from ? s : latest;
    }
    return s.created_at > latest.created_at ? s : latest;
  });
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

export const LEAVE_TYPES = ['연가', '병가', '공가', '교육', '출장', '휴직'];
export const LEAVE_REASONS = [
  '해외여행',
  '국내여행',
  '결혼식',
  '신혼여행',
  '출산휴가',
  '가족돌봄',
  '상견례',
  '웨딩촬영',
  '가족행사',
  '기타',
];
export const LEAVE_OF_ABSENCE_REASONS = ['육아휴직', '유학휴직', '돌봄휴직', '질병휴직'];

// 유형별로 사유 선택이 필요한 경우, 어떤 목록을 보여줄지 매핑한다.
export const SUB_REASON_OPTIONS_BY_TYPE: Record<string, string[]> = {
  연가: LEAVE_REASONS,
  휴직: LEAVE_OF_ABSENCE_REASONS,
};

// 출동율별 가능인원(통상적으로 연가를 보낼 수 있는 인원).
// 예비인원은 만일을 대비해 별도로 잡아두는 인원으로, 가능인원과 별개로 항상 2명이다.
export const DISPATCH_RATE_OPTIONS = ['70%', '80%'] as const;
export const BASE_QUOTA_BY_DISPATCH_RATE: Record<string, number> = {
  '70%': 5,
  '80%': 3,
};
export const RESERVE_QUOTA = 2;
export function getMaxQuota(baseQuota: number) {
  return baseQuota + RESERVE_QUOTA;
}
