'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { formatDateFromTimestamp } from '@/lib/utils';
import { Edit2, Trash2, KeyRound } from 'lucide-react';

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
  const [editForm, setEditForm] = useState<{ name: string; rank: string; role: 'member' | 'admin' }>(
    { name: '', rank: '', role: 'member' }
  );
  const [saving, setSaving] = useState(false);
  const [resettingId, setResettingId] = useState<string | null>(null);

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

  const startEdit = (member: Member) => {
    setEditingId(member.id);
    setEditForm({ name: member.name, rank: member.rank, role: member.role });
  };

  // 마지막 서무를 일반 대원으로 바꾸거나 삭제하면 아무도 관리 페이지에 들어갈 수 없게 된다.
  // 그러면 계정 생성·정원 설정이 전부 막혀 Supabase 대시보드에서 직접 고쳐야 하므로 미리 막는다.
  const isLastAdmin = (id: string) =>
    members.filter((m) => m.role === 'admin').length <= 1 &&
    members.some((m) => m.id === id && m.role === 'admin');

  const saveEdit = async (id: string) => {
    const name = editForm.name.trim();
    const rank = editForm.rank.trim();

    if (!name || !rank) {
      alert('이름과 계급을 모두 입력해주세요.');
      return;
    }

    // 서버에서도 막지만, 여기서 걸러주면 왕복 없이 바로 알려줄 수 있다.
    if (editForm.role !== 'admin' && isLastAdmin(id)) {
      alert('마지막 서무는 일반 대원으로 바꿀 수 없습니다.\n다른 대원을 먼저 서무로 지정해주세요.');
      return;
    }

    const duplicate = members.find(
      (m) => m.id !== id && m.name === name && m.rank === rank
    );
    if (duplicate) {
      alert(`이미 "${name} ${rank}" 계정이 있습니다.\n이름과 계급이 모두 같으면 두 사람 다 로그인할 수 없게 됩니다.`);
      return;
    }

    setSaving(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData?.session?.access_token;
      if (!accessToken) {
        alert('로그인이 필요합니다.');
        return;
      }

      const response = await fetch('/api/admin/update-member', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ memberId: id, name, rank, role: editForm.role }),
      });

      const result = await response.json();

      if (!response.ok) {
        alert(result.error || '수정에 실패했습니다.');
        return;
      }

      await loadMembers();
      setEditingId(null);
    } catch (error) {
      alert('수정 중 오류가 발생했습니다.');
      console.error(error);
    } finally {
      setSaving(false);
    }
  };

  // 대원이 비밀번호를 잊었을 때 새 임시 비밀번호를 발급한다.
  // 발급값은 서버가 저장하지 않으므로 이 자리에서 바로 전달해야 한다.
  const handleResetPassword = async (member: Member) => {
    if (
      !confirm(
        `${member.name} ${member.rank}의 비밀번호를 초기화할까요?\n새 임시 비밀번호가 발급되고, 본인이 다시 변경해야 합니다.`
      )
    ) {
      return;
    }

    setResettingId(member.id);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData?.session?.access_token;
      if (!accessToken) {
        alert('로그인이 필요합니다.');
        return;
      }

      const response = await fetch('/api/admin/reset-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ memberId: member.id }),
      });

      const result = await response.json();

      if (!response.ok) {
        alert(result.error || '비밀번호 초기화에 실패했습니다.');
        return;
      }

      alert(
        `${result.name} ${result.rank}의 임시 비밀번호\n\n` +
          `${result.temporaryPassword}\n\n` +
          `이 값은 다시 확인할 수 없습니다. 본인에게 직접 전달해주세요.`
      );
    } catch (error) {
      console.error(error);
      alert('비밀번호 초기화 중 오류가 발생했습니다.');
    } finally {
      setResettingId(null);
    }
  };

  const handleDelete = async (id: string) => {
    if (isLastAdmin(id)) {
      alert('마지막 서무는 삭제할 수 없습니다.\n다른 대원을 먼저 서무로 지정해주세요.');
      return;
    }

    if (!confirm('정말 이 대원을 삭제하시겠습니까?\n(Auth 계정도 함께 삭제해야 합니다)')) return;

    try {
      // profiles만 삭제 (Auth 계정은 Supabase 대시보드에서 별도 삭제 필요)
      const { error } = await supabase.from('profiles').delete().eq('id', id);
      if (error) throw error;
      await loadMembers();
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
        <table className="min-w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900 whitespace-nowrap">이름</th>
              <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900 whitespace-nowrap">계급</th>
              <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900 whitespace-nowrap">역할</th>
              <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900 whitespace-nowrap">가입일</th>
              <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900 whitespace-nowrap">작업</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {members.map((member) => {
              const editing = editingId === member.id;

              return (
                <tr key={member.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 text-sm font-medium text-gray-900 whitespace-nowrap">
                    {editing ? (
                      <input
                        type="text"
                        value={editForm.name}
                        onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                        placeholder="이름"
                        disabled={saving}
                        className="w-28 px-2 py-1 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                      />
                    ) : (
                      member.name
                    )}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-900 whitespace-nowrap">
                    {editing ? (
                      <input
                        type="text"
                        value={editForm.rank}
                        onChange={(e) => setEditForm({ ...editForm, rank: e.target.value })}
                        placeholder="계급"
                        disabled={saving}
                        className="w-24 px-2 py-1 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                      />
                    ) : (
                      member.rank
                    )}
                  </td>
                  <td className="px-6 py-4 text-sm whitespace-nowrap">
                    {editing ? (
                      <select
                        value={editForm.role}
                        onChange={(e) =>
                          setEditForm({ ...editForm, role: e.target.value as 'member' | 'admin' })
                        }
                        disabled={saving}
                        className="px-2 py-1 border border-gray-300 rounded text-sm"
                      >
                        <option value="member">일반 대원</option>
                        <option value="admin">서무</option>
                      </select>
                    ) : (
                      <span
                        className={`px-3 py-1 rounded-full text-xs font-medium ${
                          member.role === 'admin'
                            ? 'bg-purple-100 text-purple-800'
                            : 'bg-gray-100 text-gray-800'
                        }`}
                      >
                        {member.role === 'admin' ? '서무' : '일반'}
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600 whitespace-nowrap">
                    {formatDateFromTimestamp(member.created_at)}
                  </td>
                  <td className="px-6 py-4 text-sm whitespace-nowrap">
                    {editing ? (
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => saveEdit(member.id)}
                          disabled={saving}
                          className="px-2 py-1 bg-blue-500 hover:bg-blue-600 disabled:bg-gray-400 text-white text-xs rounded transition"
                        >
                          {saving ? '저장 중...' : '저장'}
                        </button>
                        <button
                          onClick={() => setEditingId(null)}
                          disabled={saving}
                          className="px-2 py-1 bg-gray-400 hover:bg-gray-500 disabled:opacity-50 text-white text-xs rounded transition"
                        >
                          취소
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => startEdit(member)}
                          className="text-blue-600 hover:text-blue-700 transition"
                          title="이름·계급·역할 수정"
                        >
                          <Edit2 size={18} />
                        </button>
                        <button
                          onClick={() => handleResetPassword(member)}
                          disabled={resettingId === member.id}
                          className="text-amber-600 hover:text-amber-700 disabled:text-gray-300 transition"
                          title="비밀번호 초기화"
                        >
                          <KeyRound size={18} />
                        </button>
                        <button
                          onClick={() => handleDelete(member.id)}
                          className="text-red-600 hover:text-red-700 transition"
                          title="삭제"
                        >
                          <Trash2 size={18} />
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {members.length === 0 && (
        <div className="px-6 py-8 text-center text-gray-500">아직 등록된 대원이 없습니다.</div>
      )}
    </div>
  );
}
