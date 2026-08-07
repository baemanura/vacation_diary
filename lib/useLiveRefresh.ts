'use client';

import { useEffect, useRef } from 'react';
import { supabase } from './supabase';

const DEFAULT_POLL_MS = 20000;

/**
 * 다른 사람이 바꾼 내용을 자동으로 다시 불러온다.
 *
 * 세 가지 경로를 함께 쓴다:
 *  1. Supabase Realtime(postgres_changes) — 설정돼 있으면 즉시 반영된다.
 *  2. 주기적 폴링 — Realtime publication이 꺼져 있어도 확실히 갱신된다.
 *  3. 탭 복귀(focus/visibilitychange) — 화면을 다시 볼 때 바로 최신 상태로 맞춘다.
 *
 * Realtime 하나만 쓰면 publication에 테이블이 등록돼 있지 않을 때 아무 에러 없이
 * 조용히 갱신이 멈춘다. 폴링을 함께 두는 이유가 이것이다.
 * 폴링은 탭이 보이는 동안에만 돌기 때문에 백그라운드 탭이 불필요한 요청을 만들지 않는다.
 */
export function useLiveRefresh(
  tables: string[],
  onChange: () => void | Promise<void>,
  pollMs: number = DEFAULT_POLL_MS
) {
  // 최신 콜백을 참조로 들고 있어야 currentDate 같은 최신 상태를 반영해 다시 불러온다.
  const handlerRef = useRef(onChange);
  useEffect(() => {
    handlerRef.current = onChange;
  });

  // 배열은 렌더마다 새 참조라 의존성으로 쓸 수 없어 문자열 키로 바꾼다.
  const tableKey = tables.join(',');

  useEffect(() => {
    const tableList = tableKey.split(',').filter(Boolean);
    if (tableList.length === 0) return;

    const fire = () => {
      void handlerRef.current();
    };

    // 같은 채널 이름이 겹치면 서로 간섭하므로 마운트마다 고유한 이름을 쓴다.
    const channel = supabase.channel(`live-${tableKey}-${Math.random().toString(36).slice(2)}`);
    tableList.forEach((table) => {
      channel.on('postgres_changes', { event: '*', schema: 'public', table }, fire);
    });
    channel.subscribe();

    const refreshIfVisible = () => {
      if (document.visibilityState === 'visible') fire();
    };

    const interval = setInterval(refreshIfVisible, pollMs);
    window.addEventListener('focus', refreshIfVisible);
    document.addEventListener('visibilitychange', refreshIfVisible);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(interval);
      window.removeEventListener('focus', refreshIfVisible);
      document.removeEventListener('visibilitychange', refreshIfVisible);
    };
  }, [tableKey, pollMs]);
}
