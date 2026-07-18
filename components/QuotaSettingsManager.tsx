'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import {
  getQuotaForDate,
  addDays,
  formatDateFromTimestamp,
  DISPATCH_RATE_OPTIONS,
  BASE_QUOTA_BY_DISPATCH_RATE,
  getReserveQuota,
  type QuotaSetting,
} from '@/lib/utils';
import { Plus, Trash2 } from 'lucide-react';

export default function QuotaSettingsManager({ currentUserId }: { currentUserId: string }) {
  const [settings, setSettings] = useState<QuotaSetting[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    dispatchRate: '80%',
    effectiveFrom: new Date().toISOString().split('T')[0],
    effectiveTo: '',
  });

  const formBaseQuota = BASE_QUOTA_BY_DISPATCH_RATE[formData.dispatchRate] ?? 0;
  const formReserveQuota = getReserveQuota(formBaseQuota);

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

  // 이 테이블엔 종료일 컬럼이 없어서, 기간을 지정하면 시작일에 새 설정을 추가하고
  // 종료일 다음날에 "그 이전에 적용되던 설정"을 다시 추가해 기간이 끝나면 원래대로 돌아가게 한다.
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (formData.effectiveTo && formData.effectiveTo < formData.effectiveFrom) {
      alert('종료일은 시작일보다 빠를 수 없습니다.');
      return;
    }

    setSubmitting(true);

    try {
      const { error: insertError } = await supabase.from('quota_settings').insert({
        effective_from: formData.effectiveFrom,
        dispatch_rate: formData.dispatchRate,
        base_quota: formBaseQuota,
        max_quota: formReserveQuota,
        created_by: currentUserId,
      });
      if (insertError) throw insertError;

      if (formData.effectiveTo) {
        const previous = getQuotaForDate(settings, addDays(formData.effectiveFrom, -1));
        if (previous) {
          const { error: restoreError } = await supabase.from('quota_settings').insert({
            effective_from: addDays(formData.effectiveTo, 1),
            dispatch_rate: previous.dispatch_rate,
            base_quota: previous.base_quota,
            max_quota: previous.max_quota,
            created_by: currentUserId,
          });
          if (restoreError) throw restoreError;
        }
      }

      setFormData({
        dispatchRate: '80%',
        effectiveFrom: new Date().toISOString().split('T')[0],
        effectiveTo: '',
      });
      setShowForm(false);
      await loadSettings();
      alert('정원 설정이 저장되었습니다.');
    } catch (error) {
      alert('저장 실패했습니다.');
      console.error(error);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('정말 삭제하시겠습니까?')) return;

    try {
      const { error } = await supabase.from('quota_settings').delete().eq('id', id);
      if (error) throw error;
      await loadSettings();
    } catch (error) {
      alert('삭제 실패했습니다.');
      console.error(error);
    }
  };

  if (loading) {
    return <div className="text-gray-600">로딩 중...</div>;
  }

  // 표시용: 각 설정이 다음 설정 시작일 전날까지 적용되는 것으로 보고 종료일을 계산한다.
  const nextStartDates = Array.from(new Set(settings.map((s) => s.effective_from))).sort();
  const getDisplayEndDate = (effectiveFrom: string) => {
    const next = nextStartDates.find((d) => d > effectiveFrom);
    return next ? addDays(next, -1) : null;
  };

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
                <select
                  value={formData.dispatchRate}
                  onChange={(e) => setFormData({ ...formData, dispatchRate: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                >
                  {DISPATCH_RATE_OPTIONS.map((rate) => (
                    <option key={rate} value={rate}>
                      {rate}
                    </option>
                  ))}
                </select>
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

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                적용 종료일 (선택)
              </label>
              <input
                type="date"
                value={formData.effectiveTo}
                onChange={(e) => setFormData({ ...formData, effectiveTo: e.target.value })}
                min={formData.effectiveFrom}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
              />
              <p className="mt-1 text-xs text-gray-500">
                비워두면 다음 설정을 추가하기 전까지 계속 적용됩니다. 종료일을 지정하면 그
                다음날부터는 이전에 적용되던 출동율로 자동으로 돌아갑니다.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="px-3 py-2 rounded-lg bg-gray-50 border border-gray-200">
                <div className="text-xs text-gray-500">기본 인원</div>
                <div className="text-lg font-semibold text-gray-900">{formBaseQuota}명</div>
              </div>
              <div className="px-3 py-2 rounded-lg bg-gray-50 border border-gray-200">
                <div className="text-xs text-gray-500">예비인원 (기본 인원 + 2)</div>
                <div className="text-lg font-semibold text-gray-900">{formReserveQuota}명</div>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                type="submit"
                disabled={submitting}
                className="flex-1 bg-blue-500 hover:bg-blue-600 disabled:bg-gray-400 text-white font-semibold py-2 px-4 rounded-lg transition"
              >
                {submitting ? '저장 중...' : '저장'}
              </button>
              <button
                type="button"
                onClick={() => setShowForm(false)}
                disabled={submitting}
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
                  적용 기간
                </th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">
                  출동율
                </th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">
                  기본치
                </th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">
                  예비인원
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
              {settings.map((setting) => {
                const endDate = getDisplayEndDate(setting.effective_from);
                return (
                <tr key={setting.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 text-sm text-gray-900">
                    {setting.effective_from} ~ {endDate ?? '계속 적용'}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-900">{setting.dispatch_rate}</td>
                  <td className="px-6 py-4 text-sm text-gray-900">{setting.base_quota}명</td>
                  <td className="px-6 py-4 text-sm text-gray-900">{setting.max_quota}명</td>
                  <td className="px-6 py-4 text-sm text-gray-600">
                    {formatDateFromTimestamp(setting.created_at)}
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
                );
              })}
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
