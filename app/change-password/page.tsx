'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { needsPasswordChange } from '@/lib/utils';

export default function ChangePasswordPage() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [forced, setForced] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const check = async () => {
      const { data } = await supabase.auth.getSession();
      if (!data?.session) {
        router.push('/login');
        return;
      }
      // 아직 임시 비밀번호를 쓰는 중이면 뒤로 빠져나갈 수 없게 한다.
      setForced(needsPasswordChange(data.session.user));
      setChecking(false);
    };
    check();
  }, [router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (newPassword !== confirmPassword) {
      setError('새 비밀번호와 확인이 서로 다릅니다.');
      return;
    }

    setSubmitting(true);

    try {
      const { data } = await supabase.auth.getSession();
      const accessToken = data?.session?.access_token;
      if (!accessToken) {
        router.push('/login');
        return;
      }

      const response = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ currentPassword, newPassword }),
      });

      const result = await response.json();

      if (!response.ok) {
        setError(result.error || '비밀번호 변경에 실패했습니다.');
        setSubmitting(false);
        return;
      }

      // 비밀번호가 바뀌면 지금 세션의 정보는 옛것이 된다.
      // 헷갈리지 않도록 로그아웃하고 새 비밀번호로 다시 로그인하게 한다.
      setDone(true);
      await supabase.auth.signOut();
    } catch (err) {
      console.error(err);
      setError('오류가 발생했습니다. 잠시 후 다시 시도해주세요.');
      setSubmitting(false);
    }
  };

  if (checking) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-600">로딩 중...</div>
      </div>
    );
  }

  if (done) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-xl p-8 w-full max-w-md text-center">
          <h1 className="text-xl font-bold text-gray-900 mb-2">비밀번호가 변경되었습니다</h1>
          <p className="text-gray-600 text-sm mb-6">
            새 비밀번호로 다시 로그인해주세요.
          </p>
          <button
            onClick={() => router.push('/login')}
            className="w-full bg-blue-500 hover:bg-blue-600 text-white font-semibold py-2 px-4 rounded-lg transition"
          >
            로그인하러 가기
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl p-8 w-full max-w-md">
        <h1 className="text-xl font-bold text-gray-900 mb-2">비밀번호 변경</h1>

        {forced && (
          <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 text-sm rounded-lg px-4 py-3 mb-4">
            처음 받은 임시 비밀번호를 쓰고 있습니다. 본인만 아는 비밀번호로 바꿔야
            연가표를 이용할 수 있습니다.
          </div>
        )}

        {/* 규칙은 강제 변경일 때도 반드시 보여야 한다. 처음 로그인하는 대원이 전부
            이 화면을 거치는데, 규칙을 숨겨두면 저장을 눌러본 뒤에야 무엇이 잘못됐는지
            알게 된다. */}
        <div className="text-gray-600 text-sm mb-6">
          <p>새 비밀번호는 아래 조건을 모두 만족해야 합니다.</p>
          <ul className="mt-1 space-y-0.5 list-disc list-inside">
            <li>8자 이상</li>
            <li>영문과 숫자를 모두 포함 (공백 없이)</li>
            <li>임시 비밀번호와 다른 값</li>
          </ul>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              현재 비밀번호
            </label>
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              autoComplete="current-password"
              className="w-full px-4 py-2 text-base border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
              disabled={submitting}
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              새 비밀번호
            </label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              autoComplete="new-password"
              className="w-full px-4 py-2 text-base border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
              disabled={submitting}
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              새 비밀번호 확인
            </label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              autoComplete="new-password"
              className="w-full px-4 py-2 text-base border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
              disabled={submitting}
              required
            />
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full bg-blue-500 hover:bg-blue-600 disabled:bg-gray-400 text-white font-semibold py-2 px-4 rounded-lg transition"
          >
            {submitting ? '변경 중...' : '비밀번호 변경'}
          </button>

          {/* 강제 변경 중에는 연가표로 빠져나갈 길을 주지 않는다. 다만 계정을 잘못
              입력해 들어온 경우까지 갇히면 브라우저 데이터를 지우는 수밖에 없으므로
              로그아웃만은 열어둔다. */}
          {forced ? (
            <button
              type="button"
              onClick={async () => {
                await supabase.auth.signOut();
                router.push('/login');
              }}
              disabled={submitting}
              className="w-full text-gray-600 hover:text-gray-900 text-sm py-2"
            >
              다른 계정으로 로그인하기
            </button>
          ) : (
            <button
              type="button"
              onClick={() => router.push('/dashboard')}
              className="w-full text-gray-600 hover:text-gray-900 text-sm py-2"
            >
              취소하고 돌아가기
            </button>
          )}
        </form>
      </div>
    </div>
  );
}
