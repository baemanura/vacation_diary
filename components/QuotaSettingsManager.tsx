'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import {
  getTodayString,
  formatDateFromTimestamp,
  describeUnexpectedError,
  quotaPeriodsOverlap,
  DISPATCH_RATE_OPTIONS,
  BASE_QUOTA_BY_DISPATCH_RATE,
  DEFAULT_RESERVE_QUOTA,
  QUOTA_CHOICES,
  type QuotaSetting,
} from '@/lib/utils';
import { Plus, Trash2, Pencil } from 'lucide-react';

interface FormState {
  dispatchRate: string;
  effectiveFrom: string;
  effectiveTo: string;
  baseQuota: number;
  reserveQuota: number;
}

const emptyForm = (): FormState => ({
  dispatchRate: '80%',
  effectiveFrom: getTodayString(),
  effectiveTo: '',
  baseQuota: BASE_QUOTA_BY_DISPATCH_RATE['80%'],
  reserveQuota: DEFAULT_RESERVE_QUOTA,
});

export default function QuotaSettingsManager({ currentUserId }: { currentUserId: string }) {
  const [settings, setSettings] = useState<QuotaSetting[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  // 값이 있으면 그 설정을 고치는 중, 없으면 새로 만드는 중이다.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);

  const loadSettings = async () => {
    try {
      const { data, error } = await supabase
        .from('quota_settings')
        .select('*')
        .order('effective_from', { ascending: false });
      if (error) throw error;
      setSettings(data || []);
    } catch (error) {
      console.error('설정 로드 실패:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // 첫 화면에 한 번만 불러온다. loadSettings는 async라 상태 변경은 await 뒤에
    // 일어나는데, 규칙이 그것까지는 구분하지 못해 여기서만 끈다.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadSettings();
  }, []);

  const totalQuota = form.baseQuota + form.reserveQuota;

  const openNew = () => {
    setEditingId(null);
    setForm(emptyForm());
    setShowForm(true);
  };

  const openEdit = (setting: QuotaSetting) => {
    setEditingId(setting.id);
    setForm({
      dispatchRate: setting.dispatch_rate,
      effectiveFrom: setting.effective_from,
      effectiveTo: setting.effective_to ?? '',
      baseQuota: setting.base_quota,
      // 예비인원은 따로 저장하지 않고 총 한도와의 차이로 되돌린다.
      reserveQuota: Math.max(setting.max_quota - setting.base_quota, 0),
    });
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditingId(null);
  };

  // 출동율을 바꾸면 그 출동율의 기본 가능인원으로 맞춰준다. 이후 직접 고칠 수 있다.
  const changeRate = (dispatchRate: string) =>
    setForm((prev) => ({
      ...prev,
      dispatchRate,
      baseQuota: BASE_QUOTA_BY_DISPATCH_RATE[dispatchRate] ?? prev.baseQuota,
    }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!form.effectiveFrom) {
      alert('적용 시작일을 입력해주세요.');
      return;
    }
    if (form.effectiveTo && form.effectiveTo < form.effectiveFrom) {
      alert('종료일은 시작일보다 빠를 수 없습니다.');
      return;
    }

    // 기간이 겹치면 그 날짜에 어느 설정을 쓸지 알 수 없다. 저장 전에 막는다.
    const candidate = {
      effective_from: form.effectiveFrom,
      effective_to: form.effectiveTo || null,
    };
    const clash = settings.find((s) => s.id !== editingId && quotaPeriodsOverlap(candidate, s));
    if (clash) {
      alert(
        '적용 기간이 다른 설정과 겹칩니다.\n\n' +
          `겹치는 설정: ${clash.effective_from} ~ ${clash.effective_to ?? '계속 적용'} (${clash.dispatch_rate})\n\n` +
          '겹치는 날짜에 어느 정원을 적용할지 알 수 없으므로, 기간을 조정하거나 그 설정을 먼저 고쳐주세요.'
      );
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        effective_from: form.effectiveFrom,
        effective_to: form.effectiveTo || null,
        dispatch_rate: form.dispatchRate,
        base_quota: form.baseQuota,
        max_quota: totalQuota,
      };

      if (editingId) {
        const { data, error } = await supabase
          .from('quota_settings')
          .update(payload)
          .eq('id', editingId)
          .select();
        if (error) throw error;
        // 권한이 없으면 오류 없이 0건이 돌아온다. 성공으로 넘기면 안 된다.
        if (!data || data.length === 0) {
          alert('수정하지 못했습니다. 서무 권한이 필요합니다.');
          return;
        }
      } else {
        const { error } = await supabase
          .from('quota_settings')
          .insert({ ...payload, created_by: currentUserId });
        if (error) throw error;
      }

      closeForm();
      setForm(emptyForm());
      await loadSettings();
    } catch (error) {
      alert(describeUnexpectedError(error, editingId ? '정원 설정 수정' : '정원 설정 저장'));
      console.error(error);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (setting: QuotaSetting) => {
    if (
      !confirm(
        `${setting.effective_from} ~ ${setting.effective_to ?? '계속 적용'} (${setting.dispatch_rate}) 설정을 삭제할까요?\n\n` +
          '이 기간에 적용되던 정원이 사라져 달력 색이 표시되지 않을 수 있습니다.'
      )
    )
      return;

    try {
      const { error } = await supabase.from('quota_settings').delete().eq('id', setting.id);
      if (error) throw error;
      await loadSettings();
    } catch (error) {
      alert(describeUnexpectedError(error, '정원 설정 삭제'));
      console.error(error);
    }
  };

  if (loading) {
    return <div className="text-gray-600">로딩 중...</div>;
  }

  return (
    <div className="space-y-6">
      {showForm && (
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold mb-4 text-gray-900">
            {editingId ? '정원 설정 수정' : '새 정원 설정'}
          </h3>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">출동율</label>
                <select
                  value={form.dispatchRate}
                  onChange={(e) => changeRate(e.target.value)}
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
                <label className="block text-sm font-medium text-gray-700 mb-2">적용 시작일</label>
                <input
                  type="date"
                  value={form.effectiveFrom}
                  onChange={(e) => setForm({ ...form, effectiveFrom: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  적용 종료일 <span className="font-normal text-gray-500">(선택)</span>
                </label>
                <input
                  type="date"
                  value={form.effectiveTo}
                  min={form.effectiveFrom}
                  onChange={(e) => setForm({ ...form, effectiveTo: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                />
              </div>
            </div>
            <p className="text-xs text-gray-500">
              종료일을 비워두면 다음 설정이 시작하기 전까지 계속 적용됩니다.
            </p>

            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">가능인원</label>
                <select
                  value={form.baseQuota}
                  onChange={(e) => setForm({ ...form, baseQuota: Number(e.target.value) })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                >
                  {QUOTA_CHOICES.map((n) => (
                    <option key={n} value={n}>
                      {n}명
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">예비인원</label>
                <select
                  value={form.reserveQuota}
                  onChange={(e) => setForm({ ...form, reserveQuota: Number(e.target.value) })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                >
                  {QUOTA_CHOICES.map((n) => (
                    <option key={n} value={n}>
                      {n}명
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <span className="block text-sm font-medium text-gray-700 mb-2">총 한도</span>
                <div className="px-3 py-2 rounded-lg bg-gray-50 border border-gray-200 text-lg font-semibold text-gray-900">
                  {totalQuota}명
                </div>
              </div>
            </div>
            <p className="text-xs text-gray-500">
              가능인원은 통상적으로 연가를 보낼 수 있는 인원, 예비인원은 혹시 모를 경우를 대비해
              남겨두는 인원입니다. <strong>총 한도는 두 값을 더해 자동으로 정해집니다.</strong>
            </p>

            <div className="flex gap-3">
              <button
                type="submit"
                disabled={submitting}
                className="flex-1 bg-blue-500 hover:bg-blue-600 disabled:bg-gray-400 text-white font-semibold py-2 px-4 rounded-lg transition"
              >
                {submitting ? '저장 중...' : editingId ? '수정 저장' : '저장'}
              </button>
              <button
                type="button"
                onClick={closeForm}
                disabled={submitting}
                className="flex-1 bg-gray-300 hover:bg-gray-400 text-gray-800 font-semibold py-2 px-4 rounded-lg transition"
              >
                취소
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
          <h3 className="text-lg font-semibold text-gray-900">정원 설정 이력</h3>
          {!showForm && (
            <button
              onClick={openNew}
              className="flex items-center gap-2 bg-blue-500 hover:bg-blue-600 text-white font-semibold py-2 px-4 rounded-lg transition"
            >
              <Plus size={18} />
              새 설정 추가
            </button>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                {['적용 기간', '출동율', '가능인원', '예비인원', '총 한도', '작성일', '작업'].map(
                  (h) => (
                    <th
                      key={h}
                      className="px-6 py-3 text-left text-sm font-semibold text-gray-900 whitespace-nowrap"
                    >
                      {h}
                    </th>
                  )
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {settings.map((setting) => (
                <tr key={setting.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 text-sm text-gray-900 whitespace-nowrap">
                    {setting.effective_from} ~ {setting.effective_to ?? '계속 적용'}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-900 whitespace-nowrap">
                    {setting.dispatch_rate}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-900 whitespace-nowrap">
                    {setting.base_quota}명
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-900 whitespace-nowrap">
                    +{Math.max(setting.max_quota - setting.base_quota, 0)}명
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-900 whitespace-nowrap">
                    {setting.max_quota}명
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600 whitespace-nowrap">
                    {formatDateFromTimestamp(setting.created_at)}
                  </td>
                  <td className="px-6 py-4 text-sm whitespace-nowrap">
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => openEdit(setting)}
                        className="text-blue-600 hover:text-blue-700 transition"
                        title="수정"
                      >
                        <Pencil size={18} />
                      </button>
                      <button
                        onClick={() => handleDelete(setting)}
                        className="text-red-600 hover:text-red-700 transition"
                        title="삭제"
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {settings.length === 0 && (
          <div className="px-6 py-8 text-center text-gray-500">아직 설정된 정원이 없습니다.</div>
        )}
      </div>
    </div>
  );
}
