'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { LogOut, Settings } from 'lucide-react';
import LeaveCalendar from '@/components/LeaveCalendar';
import LeaveRequestForm from '@/components/LeaveRequestForm';
import BoardPosts from '@/components/BoardPosts';

export default function DashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    const checkAuth = async () => {
      const { data } = await supabase.auth.getSession();
      if (!data?.session) {
        router.push('/login');
        return;
      }
      setUser(data.session.user);

      const { data: profileData } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', data.session.user.id)
        .single();

      setProfile(profileData);
      setLoading(false);
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
          {/* 달력 뷰 */}
          <LeaveCalendar key={refreshKey} />

          {/* 신청 폼 */}
          <LeaveRequestForm currentUserId={user?.id} onSuccess={handleFormSuccess} />

          {/* 자유게시판 */}
          <BoardPosts currentUserId={user?.id} />
        </div>
      </main>
    </div>
  );
}
