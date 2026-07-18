'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Edit2, Trash2 } from 'lucide-react';

interface Member {
  id: string;
  name: string;
  rank: string;
  role: 'member' | 'admin';
  created_at: string;
}

export default function MemberList() {
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [newRole, setNewRole] = useState<'member' | 'admin'>('member');

  useEffect(() => {
    loadMembers();
  }, []);

  const loadMembers = async () => {
    try {
      const { data } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false });

      setMembers(data || []);
    } catch (error) {
      console.error('대원 목록 로드 실패:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleRoleChange = async (id: string, currentRole: 'member' | 'admin') => {
    setEditingId(id);
    setNewRole(currentRole === 'admin' ? 'member' : 'admin');
  };

  const confirmRoleChange = async (id: string) => {
    try {
      await supabase
        .from('profiles')
        .update({ role: newRole })
        .eq('id', id);

      loadMembers();
      setEditingId(null);
      alert('역할이 변경되었습니다.');
    } catch (error) {
      alert('역할 변경 실패');
      console.error(error);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('정말 이 대원을 삭제하시겠습니까?\n(Auth 계정도 함께 삭제해야 합니다)')) return;

    try {
      // profiles만 삭제 (Auth 계정은 Supabase 대시보드에서 별도 삭제 필요)
      await supabase.from('profiles').delete().eq('id', id);
      loadMembers();
    } catch (error) {
      alert('삭제 실패');
      console.error(error);
    }
  };

  if (loading) {
    return <div className="text-gray-600">로딩 중...</div>;
  }

  return (
    <div className="bg-white rounded-lg shadow overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-200">
        <h3 className="text-lg font-semibold text-gray-900">대원 목록 ({members.length}명)</h3>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">이름</th>
              <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">계급</th>
              <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">역할</th>
              <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">가입일</th>
              <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">작업</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {members.map((member) => (
              <tr key={member.id} className="hover:bg-gray-50">
                <td className="px-6 py-4 text-sm font-medium text-gray-900">{member.name}</td>
                <td className="px-6 py-4 text-sm text-gray-900">{member.rank}</td>
                <td className="px-6 py-4 text-sm">
                  {editingId === member.id ? (
                    <div className="flex items-center gap-2">
                      <select
                        value={newRole}
                        onChange={(e) => setNewRole(e.target.value as 'member' | 'admin')}
                        className="px-2 py-1 border border-gray-300 rounded text-sm"
                      >
                        <option value="member">일반 대원</option>
                        <option value="admin">총무</option>
                      </select>
                      <button
                        onClick={() => confirmRoleChange(member.id)}
                        className="px-2 py-1 bg-blue-500 text-white text-xs rounded hover:bg-blue-600"
                      >
                        확인
                      </button>
                      <button
                        onClick={() => setEditingId(null)}
                        className="px-2 py-1 bg-gray-400 text-white text-xs rounded hover:bg-gray-500"
                      >
                        취소
                      </button>
                    </div>
                  ) : (
                    <span
                      className={`px-3 py-1 rounded-full text-xs font-medium ${
                        member.role === 'admin'
                          ? 'bg-purple-100 text-purple-800'
                          : 'bg-gray-100 text-gray-800'
                      }`}
                    >
                      {member.role === 'admin' ? '총무' : '일반'}
                    </span>
                  )}
                </td>
                <td className="px-6 py-4 text-sm text-gray-600">
                  {new Date(member.created_at).toLocaleDateString('ko-KR')}
                </td>
                <td className="px-6 py-4 text-sm space-x-3 flex">
                  <button
                    onClick={() => handleRoleChange(member.id, member.role)}
                    className="text-blue-600 hover:text-blue-700 transition"
                    title="역할 변경"
                  >
                    <Edit2 size={18} />
                  </button>
                  <button
                    onClick={() => handleDelete(member.id)}
                    className="text-red-600 hover:text-red-700 transition"
                    title="삭제"
                  >
                    <Trash2 size={18} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {members.length === 0 && (
        <div className="px-6 py-8 text-center text-gray-500">아직 등록된 대원이 없습니다.</div>
      )}
    </div>
  );
}
