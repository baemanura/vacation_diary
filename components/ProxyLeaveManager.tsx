'use client';

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useLiveRefresh } from '@/lib/useLiveRefresh';
import { daysBetweenInclusive, formatDateTime, TYPE_BADGE_COLOR } from '@/lib/utils';
import {
  emptyLeaveInput,
  leaveWarnings,
  validateLeaveInput,
  type LeaveInput,
} from '@/lib/leaveValidation';
import LeaveFields from './LeaveFields';
import { Edit2, Trash2 } from 'lucide-react';

interface Member {
  id: string;
  name: string;
  rank: string;
}

interface LeaveRequest {
  id: string;
  member_id: string;
  type: string;
  sub_reason: string | null;
  absence_length: string | null;
  note: string | null;
  start_date: string;
  end_date: string;
  status: string;
  created_at: string;
  cancelled_at: string | null;
  cancel_reason: string | null;
}

/** 목록의 한 건을 수정 화면이 다루는 값 한 벌로 바꾼다. */
const toInput = (leave: LeaveRequest): LeaveInput => ({
  type: leave.type,
  subReason: leave.sub_reason ?? '',
  absenceLength: leave.absence_length ?? '',
  startDate: leave.start_date,
  endDate: leave.end_date,
  note: leave.note ?? '',
});

/**
 * 서무가 대원 대신 연가·병가를 넣고, 고치고, 무르는 화면.
 *
 * 부대원 전원이 앱을 쓰는 것은 아니라서, 서무가 구두·서면으로 받은 신청을 대신
 * 넣어줄 수 있어야 달력의 가능인원이 실제와 맞는다. 대원 본인이 낸 것과 구별해
 * 저장하지는 않으므로, 대원 화면에는 본인이 낸 것과 똑같이 보인다.
 *
 * 쓰기는 전부 `/api/admin/leave/*`를 거친다. 브라우저에서 바로 넣으면 남의 이름으로
 * 넣는 신청을 RLS가 거부한다.
 */
export default function ProxyLeaveManager() {
  const [members, setMembers] = useState<Member[]>([]);
  const [selectedMemberId, setSelectedMemberId] = useState('');
  const [requests, setRequests] = useState<LeaveRequest[]>([]);
  const [loadingRequests, setLoadingRequests] = useState(false);

  const [newInput, setNewInput] = useState<LeaveInput>(emptyLeaveInput);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editInput, setEditInput] = useState<LeaveInput>(emptyLeaveInput);
  const [cancelId, setCancelId] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState('');

  // 처리 중에 한 번 더 눌러 같은 신청이 두 번 들어가는 것을 막는다.
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const selectedMember = members.find((m) => m.id === selectedMemberId) ?? null;

  useEffect(() => {
    const loadMembers = async () => {
      const { data } = await supabase
        .from('profiles')
        .select('id, name, rank')
        .order('name', { ascending: true });
      setMembers(data ?? []);
    };
    void loadMembers();
  }, []);

  const loadRequests = useCallback(async () => {
    if (!selectedMemberId) {
      setRequests([]);
      return;
    }
    setLoadingRequests(true);
    try {
      // 취소한 건도 함께 보여준다. 왜 없어졌는지 서무가 바로 확인할 수 있어야 한다.
      const { data } = await supabase
        .from('leave_requests')
        .select('*')
        .eq('member_id', selectedMemberId)
        .order('start_date', { ascending: false })
        .limit(100);
      setRequests(data ?? []);
    } finally {
      setLoadingRequests(false);
    }
  }, [selectedMemberId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadRequests();
  }, [loadRequests]);

  // 대원이 직접 신청하거나 다른 서무가 손대면 새로고침 없이 반영한다.
  useLiveRefresh(['leave_requests'], () => loadRequests());

  /** 서무 확인이 필요한 서버 경로를 부른다. 실패는 던져서 부르는 쪽에서 한 번에 받는다. */
  const callApi = async (path: string, body: Record<string, unknown>) => {
    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData?.session?.access_token;
    if (!accessToken) throw new Error('로그인이 필요합니다. 다시 로그인해주세요.');

    const response = await fetch(path, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(body),
    });

    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(result.error ?? '요청에 실패했습니다. 잠시 후 다시 시도해주세요.');
    }
    return result as { warning?: string };
  };

  const describe = (err: unknown) =>
    err instanceof Error ? err.message : '알 수 없는 오류가 발생했습니다.';

  /** 서버에서도 막지만, 여기서 걸러주면 왕복 없이 바로 알려줄 수 있다. */
  const readyToSubmit = (input: LeaveInput) => {
    const problem = validateLeaveInput(input);
    if (problem) {
      setError(problem);
      return false;
    }
    // 막을 정도는 아니지만 그냥 넘기면 정원이 잘못 계산되는 것들. 확인만 받는다.
    for (const warning of leaveWarnings(input)) {
      if (!confirm(warning)) return false;
    }
    return true;
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!selectedMemberId) {
      setError('먼저 대상 대원을 선택해주세요.');
      return;
    }
    if (busy || !readyToSubmit(newInput)) return;

    setBusy(true);
    try {
      await callApi('/api/admin/leave/create', { memberId: selectedMemberId, ...newInput });
      setNewInput(emptyLeaveInput());
      await loadRequests();
      alert(`${selectedMember?.name} ${selectedMember?.rank} 앞으로 신청했습니다.`);
    } catch (err) {
      setError(describe(err));
    } finally {
      setBusy(false);
    }
  };

  const startEdit = (leave: LeaveRequest) => {
    setError('');
    setCancelId(null);
    setEditingId(leave.id);
    setEditInput(toInput(leave));
  };

  const handleUpdate = async () => {
    setError('');
    if (busy || !editingId || !readyToSubmit(editInput)) return;

    setBusy(true);
    try {
      const result = await callApi('/api/admin/leave/update', {
        requestId: editingId,
        ...editInput,
      });
      setEditingId(null);
      await loadRequests();
      if (result.warning) alert(result.warning);
    } catch (err) {
      setError(describe(err));
    } finally {
      setBusy(false);
    }
  };

  const startCancel = (leave: LeaveRequest) => {
    setError('');
    setEditingId(null);
    setCancelId(leave.id);
    setCancelReason('');
  };

  const handleCancel = async () => {
    setError('');
    if (busy || !cancelId) return;

    const reason = cancelReason.trim();
    if (!reason) {
      setError('취소 사유를 입력해주세요. 대원 화면에 그대로 보입니다.');
      return;
    }

    setBusy(true);
    try {
      const result = await callApi('/api/admin/leave/cancel', { requestId: cancelId, reason });
      setCancelId(null);
      await loadRequests();
      if (result.warning) alert(result.warning);
    } catch (err) {
      setError(describe(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* 대상 대원 선택 */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-xl font-bold mb-2 text-gray-900">대리 입력</h2>
        <p className="text-sm text-gray-600 mb-4">
          아직 앱을 쓰지 않는 대원의 연가·병가를 서무가 대신 넣고, 고치고, 무를 수 있습니다.
          여기서 넣은 신청은 대원이 직접 낸 것과 똑같이 달력과 가능인원에 반영됩니다.
        </p>

        <label className="block text-sm font-medium text-gray-700 mb-2">대상 대원</label>
        <select
          value={selectedMemberId}
          onChange={(e) => {
            setSelectedMemberId(e.target.value);
            setEditingId(null);
            setCancelId(null);
            setError('');
          }}
          className="w-full sm:max-w-xs px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
        >
          <option value="">선택해주세요 ({members.length}명)</option>
          {members.map((member) => (
            <option key={member.id} value={member.id}>
              {member.name} {member.rank}
            </option>
          ))}
        </select>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm whitespace-pre-line break-words">
          {error}
        </div>
      )}

      {selectedMember && (
        <>
          {/* 새로 신청 */}
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="font-bold text-gray-900 mb-4">
              {selectedMember.name} {selectedMember.rank} 앞으로 새로 신청
            </h3>
            <form onSubmit={handleCreate} className="space-y-4">
              <LeaveFields value={newInput} onChange={setNewInput} disabled={busy} />
              <button
                type="submit"
                disabled={busy}
                className="w-full bg-blue-500 hover:bg-blue-600 disabled:bg-gray-400 text-white font-semibold py-2 px-4 rounded-lg transition duration-200"
              >
                {busy ? '처리 중...' : '대리 신청하기'}
              </button>
            </form>
          </div>

          {/* 그 대원의 신청 목록 */}
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-baseline justify-between gap-2 mb-4">
              <h3 className="font-bold text-gray-900">
                {selectedMember.name} {selectedMember.rank}의 신청
              </h3>
              <span className="text-sm text-gray-500">{requests.length}건</span>
            </div>

            {loadingRequests ? (
              <p className="text-gray-500 text-sm">불러오는 중...</p>
            ) : requests.length === 0 ? (
              <p className="text-gray-500 text-sm">신청 내역이 없습니다.</p>
            ) : (
              <div className="space-y-2">
                {requests.map((leave) => {
                  const cancelled = leave.status !== 'active';
                  const days = daysBetweenInclusive(leave.start_date, leave.end_date);

                  return (
                    <div
                      key={leave.id}
                      className={`px-3 py-2 rounded-lg border text-sm ${
                        cancelled ? 'bg-gray-50 border-gray-200 opacity-70' : 'bg-white border-gray-200'
                      }`}
                    >
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span
                          className={`font-medium tabular-nums ${
                            cancelled ? 'text-gray-500 line-through' : 'text-gray-900'
                          }`}
                        >
                          {leave.start_date}
                          {leave.start_date !== leave.end_date && ` ~ ${leave.end_date}`}
                        </span>

                        <span
                          className={`text-xs px-1.5 py-0.5 rounded-full ${
                            TYPE_BADGE_COLOR[leave.type] ?? 'bg-gray-100 text-gray-700'
                          }`}
                        >
                          {leave.type}
                        </span>

                        {leave.sub_reason && (
                          <span className="text-xs text-gray-600">{leave.sub_reason}</span>
                        )}
                        {leave.absence_length && (
                          <span className="text-xs text-gray-600">{leave.absence_length}</span>
                        )}

                        <span className="text-xs text-gray-500">{days}일</span>

                        <span
                          className={`ml-auto text-xs px-2 py-0.5 rounded-full font-medium ${
                            cancelled ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'
                          }`}
                        >
                          {cancelled ? '취소됨' : '신청중'}
                        </span>

                        {/* 취소된 건은 되살리지 않는다. 새로 신청하는 편이 기록이 분명하다. */}
                        {!cancelled && (
                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              onClick={() => startEdit(leave)}
                              disabled={busy}
                              className="p-1 text-gray-400 hover:text-blue-600 hover:bg-blue-50 disabled:text-gray-300 rounded transition"
                              title="수정"
                            >
                              <Edit2 size={14} />
                            </button>
                            <button
                              onClick={() => startCancel(leave)}
                              disabled={busy}
                              className="p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 disabled:text-gray-300 rounded transition"
                              title="취소"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        )}
                      </div>

                      {leave.note && (
                        <div className="mt-1 text-xs text-gray-600">추가 사항: {leave.note}</div>
                      )}

                      <div className="mt-0.5 text-xs text-gray-400">
                        등록: {formatDateTime(leave.created_at)}
                        {cancelled && leave.cancelled_at && (
                          <span className="text-red-500">
                            {' '}
                            · 취소: {formatDateTime(leave.cancelled_at)}
                          </span>
                        )}
                      </div>

                      {cancelled && leave.cancel_reason && (
                        <div className="mt-0.5 text-xs text-red-600">
                          취소 사유: {leave.cancel_reason}
                        </div>
                      )}

                      {/* 수정 */}
                      {editingId === leave.id && (
                        <div className="mt-3 pt-3 border-t border-gray-200">
                          <LeaveFields value={editInput} onChange={setEditInput} disabled={busy} />
                          <div className="mt-3 flex justify-end gap-2">
                            <button
                              onClick={() => setEditingId(null)}
                              disabled={busy}
                              className="px-3 py-1.5 text-xs rounded bg-gray-100 hover:bg-gray-200 text-gray-700 transition"
                            >
                              그만두기
                            </button>
                            <button
                              onClick={() => void handleUpdate()}
                              disabled={busy}
                              className="px-3 py-1.5 text-xs rounded bg-blue-500 hover:bg-blue-600 disabled:bg-gray-400 text-white font-semibold transition"
                            >
                              {busy ? '저장 중...' : '저장'}
                            </button>
                          </div>
                        </div>
                      )}

                      {/* 취소 */}
                      {cancelId === leave.id && (
                        <div className="mt-2 pt-2 border-t border-gray-200">
                          <label className="block text-xs font-medium text-gray-700 mb-1">
                            취소 사유를 입력해주세요
                            <span className="font-normal text-gray-500">
                              {' '}
                              (이 신청 {leave.start_date}
                              {leave.start_date !== leave.end_date && ` ~ ${leave.end_date}`}이
                              통째로 취소됩니다. 대원 화면에 사유가 그대로 보입니다)
                            </span>
                          </label>
                          <input
                            type="text"
                            value={cancelReason}
                            onChange={(e) => setCancelReason(e.target.value)}
                            onKeyDown={(e) => {
                              // 한글을 조합하는 중에 눌린 Enter는 글자를 확정하는 것이라 넘긴다.
                              if (e.nativeEvent.isComposing) return;
                              if (e.key === 'Enter' && cancelReason.trim() && !busy) {
                                e.preventDefault();
                                void handleCancel();
                              }
                            }}
                            placeholder="예: 근무 일정 변경"
                            autoFocus
                            disabled={busy}
                            className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                          />
                          <div className="mt-2 flex justify-end gap-2">
                            <button
                              onClick={() => setCancelId(null)}
                              disabled={busy}
                              className="px-3 py-1 text-xs rounded bg-gray-100 hover:bg-gray-200 text-gray-700 transition"
                            >
                              그만두기
                            </button>
                            <button
                              onClick={() => void handleCancel()}
                              disabled={busy || !cancelReason.trim()}
                              className="px-3 py-1 text-xs rounded bg-red-500 hover:bg-red-600 disabled:bg-gray-400 text-white font-semibold transition"
                            >
                              {busy ? '취소 중...' : '취소하기'}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
