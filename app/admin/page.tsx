'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { ArrowLeft } from 'lucide-react';
import { needsPasswordChange } from '@/lib/utils';
import QuotaSettingsManager from '@/components/QuotaSettingsManager';
import AccountManager from '@/components/AccountManager';
import MemberList from '@/components/MemberList';
import AdminGuide from '@/components/AdminGuide';

// 백엔드가 응답하지 않을 때 무한정 "로딩 중..."에 머물지 않도록 하는 상한.
const LOAD_TIMEOUT_MS = 8000;

export default function AdminPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [activeTab, setActiveTab] = useState<'quota' | 'account' | 'members'>('quota');

  useEffect(() => {
    const checkAuth = async () => {
      try {
        // 서버가 죽어 있으면 응답 없이 계속 대기할 수 있어 시간 상한을 둔다.
        const timeout = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('로딩 시간 초과')), LOAD_TIMEOUT_MS)
        );

        const { data } = await Promise.race([supabase.auth.getSession(), timeout]);
        if (!data?.session) {
          router.push('/login');
          return;
        }

        // 임시 비밀번호 상태에서는 관리 기능도 쓸 수 없게 막는다.
        if (needsPasswordChange(data.session.user)) {
          router.push('/change-password');
          return;
        }

        setUser(data.session.user);

        const { data: profileData } = await Promise.race([
          supabase.from('profiles').select('*').eq('id', data.session.user.id).single(),
          timeout,
        ]);

        // 서무만 접근 가능
        if (profileData?.role !== 'admin') {
          router.push('/dashboard');
          return;
        }

        setProfile(profileData);
        setLoading(false);
      } catch (error) {
        console.error('관리 페이지 로드 실패:', error);
        setFailed(true);
      }
    };

    checkAuth();
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

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-600">로딩 중...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 헤더 */}
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">관리 페이지</h1>
              <p className="text-gray-600">
                {profile?.name} {profile?.rank}
              </p>
            </div>
            <button
              onClick={() => router.push('/dashboard')}
              className="flex items-center gap-2 text-blue-600 hover:text-blue-700 font-medium"
            >
              <ArrowLeft size={18} />
              대시보드로
            </button>
          </div>
        </div>
      </header>

      {/* 탭 네비게이션 */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex gap-8">
            <button
              onClick={() => setActiveTab('quota')}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'quota'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-600 hover:text-gray-900'
              }`}
            >
              정원 설정
            </button>
            <button
              onClick={() => setActiveTab('account')}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'account'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-600 hover:text-gray-900'
              }`}
            >
              계정 관리
            </button>
            <button
              onClick={() => setActiveTab('members')}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'members'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-600 hover:text-gray-900'
              }`}
            >
              대원 목록
            </button>
          </div>
        </div>
      </div>

      {/* 콘텐츠 */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* 서무가 바뀌어도 인수인계 없이 운영할 수 있도록 항상 위에 둔다. */}
        <AdminGuide />

        {activeTab === 'quota' && <QuotaSettingsManager currentUserId={user?.id} />}
        {activeTab === 'account' && <AccountManager />}
        {activeTab === 'members' && <MemberList />}
      </main>
    </div>
  );
}
