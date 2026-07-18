'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

export default function LoginPage() {
  const router = useRouter();
  const [nameRank, setNameRank] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      // 이름과 계급 분리
      const parts = nameRank.trim().split(/\s+/);
      if (parts.length < 2) {
        setError('이름과 계급을 함께 입력해주세요. (예: 홍길동 경사)');
        return;
      }

      const name = parts.slice(0, -1).join(' ');
      const rank = parts[parts.length - 1];

      // 서버 API를 통해 로그인
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name,
          rank,
          password,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || '로그인에 실패했습니다.');
        return;
      }

      // 세션 저장
      if (data.session) {
        await supabase.auth.setSession(data.session);
      }

      // 로그인 성공 후 대시보드로 이동
      router.push('/dashboard');
    } catch (err) {
      setError('오류가 발생했습니다.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl p-8 w-full max-w-md">
        <h1 className="text-3xl font-bold text-center mb-2 text-gray-800">
          3기 2제 실시간 연가표
        </h1>
        <p className="text-center text-gray-600 mb-8">로그인</p>

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              이름 + 계급
            </label>
            <input
              type="text"
              value={nameRank}
              onChange={(e) => setNameRank(e.target.value)}
              placeholder="예: 홍길동 경사"
              className="w-full px-4 py-2 text-base border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
              disabled={loading}
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              비밀번호
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-2 text-base border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
              disabled={loading}
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
            disabled={loading}
            className="w-full bg-blue-500 hover:bg-blue-600 disabled:bg-gray-400 text-white font-semibold py-2 px-4 rounded-lg transition duration-200"
          >
            {loading ? '로그인 중...' : '로그인'}
          </button>
        </form>

        <p className="text-center text-gray-600 text-sm mt-6">
          처음 사용하시나요? 서무에게 아이디와 비밀번호를 받으세요.
        </p>
      </div>
    </div>
  );
}
