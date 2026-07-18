export function getQuotaStatus(current: number, base: number, max: number) {
  if (current <= base) {
    return { status: 'available', color: 'bg-green-100 text-green-800', label: '여유' };
  } else if (current <= max) {
    return { status: 'warning', color: 'bg-yellow-100 text-yellow-800', label: '주의' };
  } else {
    return { status: 'exceeded', color: 'bg-red-100 text-red-800', label: '초과' };
  }
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
