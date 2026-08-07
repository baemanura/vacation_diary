'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

// 백엔드가 응답하지 않을 때 무한정 "로딩 중..."에 머물지 않도록 하는 상한.
const AUTH_CHECK_TIMEOUT_MS = 8000;

export default function Home() {
  const router = useRouter();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const checkAuth = async () => {
      try {
        // 서버가 죽어 있으면 getSession()이 응답 없이 계속 대기할 수 있어 시간 상한을 둔다.
        const { data } = await Promise.race([
          supabase.auth.getSession(),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('세션 확인 시간 초과')), AUTH_CHECK_TIMEOUT_MS)
          ),
        ]);

        if (cancelled) return;

        if (data?.session) {
          router.push('/dashboard');
        } else {
          router.push('/login');
        }
      } catch (error) {
        if (cancelled) return;
        console.error('세션 확인 실패:', error);
        setFailed(true);
      }
    };

    checkAuth();

    return () => {
      cancelled = true;
    };
  }, [router]);

  if (failed) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="text-center max-w-sm">
          <p className="text-gray-900 font-semibold mb-2">서버에 연결할 수 없습니다</p>
          <p className="text-gray-600 text-sm mb-6">
            일시적인 장애일 수 있습니다. 잠시 후 다시 시도해 주세요.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-lg transition"
          >
            다시 시도
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="text-gray-600">로딩 중...</div>
    </div>
  );
}
