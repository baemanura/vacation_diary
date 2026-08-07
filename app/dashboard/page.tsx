'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { LogOut, Settings, KeyRound } from 'lucide-react';
import { needsPasswordChange } from '@/lib/utils';
import LeaveCalendar from '@/components/LeaveCalendar';
import LeaveRequestForm from '@/components/LeaveRequestForm';
import BoardPosts from '@/components/BoardPosts';
import OnlineUsers from '@/components/OnlineUsers';

// 백엔드가 응답하지 않을 때 무한정 "로딩 중..."에 머물지 않도록 하는 상한.
const LOAD_TIMEOUT_MS = 8000;

export default function DashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

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

        // 임시 비밀번호를 쓰는 동안에는 본인 확인이 안 된 상태나 마찬가지라
        // 연가표를 보기 전에 비밀번호부터 바꾸게 한다.
        if (needsPasswordChange(data.session.user)) {
          router.push('/change-password');
          return;
        }

        setUser(data.session.user);

        // 로그인 화면에서 이미 조회한 프로필이 있으면 재사용해 중복 조회를 생략한다.
        const cachedProfile = sessionStorage.getItem('login_profile_cache');
        if (cachedProfile) {
          sessionStorage.removeItem('login_profile_cache');
          setProfile(JSON.parse(cachedProfile));
          setLoading(false);
          return;
        }

        const { data: profileData } = await Promise.race([
          supabase.from('profiles').select('*').eq('id', data.session.user.id).single(),
          timeout,
        ]);

        setProfile(profileData);
        setLoading(false);
      } catch (error) {
        console.error('대시보드 로드 실패:', error);
        setFailed(true);
      }
    };

    checkAuth();
  }, [router]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/login');
  };

  const handleFormSuccess = () => {
    setRefreshKey((prev) => prev + 1);
  };

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
          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">3기 2제 실시간 연가표</h1>
              <p className="text-gray-600">
                {profile?.name} {profile?.rank} ({profile?.role === 'admin' ? '서무' : '대원'})
              </p>
            </div>
            <div className="flex gap-3">
              {profile?.role === 'admin' && (
                <button
                  onClick={() => router.push('/admin')}
                  className="flex items-center gap-2 whitespace-nowrap bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-lg transition"
                >
                  <Settings size={18} />
                  관리
                </button>
              )}
              <button
                onClick={() => router.push('/change-password')}
                className="flex items-center gap-2 whitespace-nowrap bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-2 rounded-lg transition"
              >
                <KeyRound size={18} />
                비밀번호
              </button>
              <button
                onClick={handleLogout}
                className="flex items-center gap-2 whitespace-nowrap bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded-lg transition"
              >
                <LogOut size={18} />
                로그아웃
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* 메인 콘텐츠 */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="space-y-8">
          {/* 현재 접속자 */}
          {user?.id && profile && (
            <OnlineUsers currentUserId={user.id} name={profile.name} rank={profile.rank} />
          )}

          {/* 달력 뷰 */}
          <LeaveCalendar
            key={refreshKey}
            currentUserId={user?.id}
            isAdmin={profile?.role === 'admin'}
          />

          {/* 신청 폼 */}
          <LeaveRequestForm currentUserId={user?.id} onSuccess={handleFormSuccess} />

          {/* 자유게시판 */}
          <BoardPosts currentUserId={user?.id} />
        </div>
      </main>
    </div>
  );
}
