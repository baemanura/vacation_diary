'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabase';

export default function AccountManager() {
  const [formData, setFormData] = useState({
    name: '',
    rank: '',
  });
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [generatedPassword, setGeneratedPassword] = useState('');

  // 비밀번호 (모든 대원 동일)
  const password = 'test1234!';

  // 이메일 자동 생성 (숫자 기반, 중복 없음)
  const generateEmail = () => {
    const timestamp = Date.now().toString().slice(-6); // 마지막 6자리
    const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    return `user_${timestamp}${random}@unit.local`;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage('');

    if (!formData.name || !formData.rank) {
      setMessage('이름과 계급을 입력해주세요.');
      return;
    }

    setLoading(true);
    const email = generateEmail();

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData?.session?.access_token;

      if (!accessToken) {
        setMessage('❌ 로그인이 필요합니다.');
        return;
      }

      const response = await fetch('/api/admin/create-user', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          name: formData.name,
          rank: formData.rank,
          email,
          password,
          role: 'member',
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setMessage(`❌ ${data.error}`);
        return;
      }

      setMessage(
        `✅ 계정이 생성되었습니다!\n\n로그인 정보:\n이름+계급: ${formData.name} ${formData.rank}\n비밀번호: ${password}\n\n로그인 페이지에서 "이름 계급"으로 로그인하세요.`
      );
      setFormData({
        name: '',
        rank: '',
      });
    } catch (error) {
      setMessage('❌ 오류 발생: ' + (error instanceof Error ? error.message : '알 수 없는 오류'));
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl">
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold mb-6 text-gray-900">새 대원 계정 생성</h3>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">이름</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="예: 홍길동"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">계급</label>
            <input
              type="text"
              value={formData.rank}
              onChange={(e) => setFormData({ ...formData, rank: e.target.value })}
              placeholder="예: 경사, 경위"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-500 hover:bg-blue-600 disabled:bg-gray-400 text-white font-semibold py-2 px-4 rounded-lg transition"
          >
            {loading ? '생성 중...' : '계정 생성'}
          </button>

          {message && (
            <div
              className={`p-4 rounded-lg text-sm whitespace-pre-wrap ${
                message.includes('✅')
                  ? 'bg-green-50 border border-green-200 text-green-800'
                  : 'bg-red-50 border border-red-200 text-red-800'
              }`}
            >
              {message}
            </div>
          )}
        </form>
      </div>
    </div>
  );
}