'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Plus, Trash2 } from 'lucide-react';

interface QuotaSetting {
  id: string;
  effective_from: string;
  dispatch_rate: string;
  base_quota: number;
  max_quota: number;
  created_at: string;
}

export default function QuotaSettingsManager({ currentUserId }: { currentUserId: string }) {
  const [settings, setSettings] = useState<QuotaSetting[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    dispatchRate: '80%',
    baseQuota: 3,
    maxQuota: 5,
    effectiveFrom: new Date().toISOString().split('T')[0],
  });

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const { data } = await supabase
        .from('quota_settings')
        .select('*')
        .order('effective_from', { ascending: false });

      setSettings(data || []);
    } catch (error) {
      console.error('설정 로드 실패:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      await supabase.from('quota_settings').insert({
        effective_from: formData.effectiveFrom,
        dispatch_rate: formData.dispatchRate,
        base_quota: formData.baseQuota,
        max_quota: formData.maxQuota,
        created_by: currentUserId,
      });

      setFormData({
        dispatchRate: '80%',
        baseQuota: 3,
        maxQuota: 5,
        effectiveFrom: new Date().toISOString().split('T')[0],
      });
      setShowForm(false);
      loadSettings();
      alert('정원 설정이 저장되었습니다.');
    } catch (error) {
      alert('저장 실패했습니다.');
      console.error(error);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('정말 삭제하시겠습니까?')) return;

    try {
      await supabase.from('quota_settings').delete().eq('id', id);
      loadSettings();
    } catch (error) {
      alert('삭제 실패했습니다.');
    }
  };

  if (loading) {
    return <div className="text-gray-600">로딩 중...</div>;
  }

  return (
    <div className="space-y-6">
      {/* 추가 폼 */}
      {showForm && (
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold mb-4 text-gray-900">새 정원 설정</h3>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  출동율
                </label>
                <input
                  type="text"
                  value={formData.dispatchRate}
                  onChange={(e) => setFormData({ ...formData, dispatchRate: e.target.value })}
                  placeholder="예: 80%"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  적용 시작일
                </label>
                <input
                  type="date"
                  value={formData.effectiveFrom}
                  onChange={(e) =>
                    setFormData({ ...formData, effectiveFrom: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  기본치 (인원)
                </label>
                <input
                  type="number"
                  value={formData.baseQuota}
                  onChange={(e) =>
                    setFormData({ ...formData, baseQuota: parseInt(e.target.value) })
                  }
                  min="1"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  최대치 (인원)
                </label>
                <input
                  type="number"
                  value={formData.maxQuota}
                  onChange={(e) =>
                    setFormData({ ...formData, maxQuota: parseInt(e.target.value) })
                  }
                  min="1"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                />
              </div>
            </div>

            <div className="flex gap-3">
              <button
                type="submit"
                className="flex-1 bg-blue-500 hover:bg-blue-600 text-white font-semibold py-2 px-4 rounded-lg transition"
              >
                저장
              </button>
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="flex-1 bg-gray-300 hover:bg-gray-400 text-gray-800 font-semibold py-2 px-4 rounded-lg transition"
              >
                취소
              </button>
            </div>
          </form>
        </div>
      )}

      {/* 설정 목록 */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
          <h3 className="text-lg font-semibold text-gray-900">정원 설정 이력</h3>
          {!showForm && (
            <button
              onClick={() => setShowForm(true)}
              className="flex items-center gap-2 bg-blue-500 hover:bg-blue-600 text-white font-semibold py-2 px-4 rounded-lg transition"
            >
              <Plus size={18} />
              새 설정 추가
            </button>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">
                  적용 시작일
                </th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">
                  출동율
                </th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">
                  기본치
                </th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">
                  최대치
                </th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">
                  작성일
                </th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">
                  작업
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {settings.map((setting) => (
                <tr key={setting.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 text-sm text-gray-900">{setting.effective_from}</td>
                  <td className="px-6 py-4 text-sm text-gray-900">{setting.dispatch_rate}</td>
                  <td className="px-6 py-4 text-sm text-gray-900">{setting.base_quota}명</td>
                  <td className="px-6 py-4 text-sm text-gray-900">{setting.max_quota}명</td>
                  <td className="px-6 py-4 text-sm text-gray-600">
                    {new Date(setting.created_at).toLocaleDateString('ko-KR')}
                  </td>
                  <td className="px-6 py-4 text-sm">
                    <button
                      onClick={() => handleDelete(setting.id)}
                      className="text-red-600 hover:text-red-700 transition"
                    >
                      <Trash2 size={18} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {settings.length === 0 && (
          <div className="px-6 py-8 text-center text-gray-500">
            아직 설정된 정원이 없습니다.
          </div>
        )}
      </div>
    </div>
  );
}
