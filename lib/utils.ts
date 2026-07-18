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

export function addDays(dateString: string, days: number) {
  const [y, m, d] = dateString.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().split('T')[0];
}

export function formatDate(dateString: string) {
  const date = new Date(dateString + 'T00:00:00');
  return date.toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
}

export function formatDateTime(dateString: string) {
  const date = new Date(dateString);
  return date.toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export const LEAVE_TYPES = ['연가', '병가', '공가', '교육', '출장'];
export const LEAVE_REASONS = ['해외여행', '국내여행', '결혼식', '신혼여행', '출산휴가', '기타'];
