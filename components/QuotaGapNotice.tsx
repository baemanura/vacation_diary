'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { findQuotaGapStart, getTodayString, type QuotaSetting } from '@/lib/utils';
import { AlertTriangle } from 'lucide-react';

// 몇 일 앞까지 미리 살펴볼지. 두 달치를 보므로 종료일이 다가와도 넉넉히 먼저 알게 된다.
const LOOKAHEAD_DAYS = 60;

/**
 * 앞으로 정원 설정이 비는 날이 있으면 서무에게 미리 알린다.
 *
 * 정원 설정에 종료일을 지정하면 그 다음날부터는 적용되는 설정이 없어진다. 그러면 달력의
 * 날짜 색이 전부 사라지고 출동율·가능인원·남은인원이 모두 "-"로만 표시된다. 오류가 아니라
 * 조용히 빈 값이 되는 것이라, 대원이 "왜 색이 없냐"고 물어보기 전까지 아무도 모른다.
 * 그래서 그 날이 오기 전에 여기서 먼저 알려준다.
 *
 * 정원을 고칠 수 있는 사람은 서무뿐이므로 서무에게만 보여준다.
 */
export default function QuotaGapNotice({ settings }: { settings?: QuotaSetting[] }) {
  // 정원 설정을 이미 들고 있는 화면(관리 페이지)은 그대로 넘겨주고,
  // 그렇지 않은 화면(대시보드)에서만 직접 불러온다.
  const [fetched, setFetched] = useState<QuotaSetting[] | null>(null);
  const loaded = settings ?? fetched;

  useEffect(() => {
    if (settings) return;

    let cancelled = false;
    void (async () => {
      const { data, error } = await supabase.from('quota_settings').select('*');
      if (cancelled) return;
      if (error) {
        console.error('정원 설정 조회 실패:', error);
        return;
      }
      setFetched(data || []);
    })();
    return () => {
      cancelled = true;
    };
  }, [settings]);

  if (!loaded) return null;

  const today = getTodayString();
  const gapStart = findQuotaGapStart(loaded, today, LOOKAHEAD_DAYS);
  if (!gapStart) return null;

  const [, month, day] = gapStart.split('-');
  const label = `${Number(month)}월 ${Number(day)}일`;
  const isNow = gapStart === today;

  return (
    <div className="flex gap-2 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
      <AlertTriangle size={18} className="mt-0.5 shrink-0" />
      <div>
        <p className="font-semibold">
          {isNow
            ? '지금 적용되는 정원 설정이 없습니다.'
            : `${label}부터 적용되는 정원 설정이 없습니다.`}
        </p>
        <p className="mt-1">
          {isNow ? '오늘' : `${label}`}부터 달력에 날짜 색이 칠해지지 않고, 출동율·가능인원·남은인원이
          모두 <strong className="font-semibold">-</strong> 로 표시됩니다. 대원이 신청은 할 수 있지만
          몇 명까지 갈 수 있는지 알 수 없게 됩니다.
        </p>
        <p className="mt-1">
          <strong className="font-semibold">관리 페이지 → 정원 설정</strong>에서 이어지는 기간의 설정을
          새로 추가하거나, 지금 설정의 <strong className="font-semibold">적용 종료일을 비워두면</strong>{' '}
          다음 설정이 생길 때까지 계속 적용됩니다.
        </p>
      </div>
    </div>
  );
}
