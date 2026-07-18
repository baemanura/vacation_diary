'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { formatDateTime } from '@/lib/utils';
import { Send, Trash2 } from 'lucide-react';

interface DateComment {
  id: string;
  date: string;
  author_id: string;
  content: string;
  created_at: string;
}

interface Profile {
  id: string;
  name: string;
  rank: string;
}

export default function DateComments({
  date,
  currentUserId,
  isAdmin,
  profiles,
}: {
  date: string;
  currentUserId?: string;
  isAdmin: boolean;
  profiles: Map<string, Profile>;
}) {
  const [comments, setComments] = useState<DateComment[]>([]);
  const [newComment, setNewComment] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    loadComments();
  }, [date]);

  const loadComments = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('date_comments')
        .select('*')
        .eq('date', date)
        .order('created_at', { ascending: true });
      if (error) throw error;
      setComments(data || []);
    } catch (error) {
      console.error('날짜 댓글 조회 실패:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newComment.trim() || !currentUserId) return;

    setSubmitting(true);
    try {
      const { error } = await supabase.from('date_comments').insert({
        date,
        author_id: currentUserId,
        content: newComment.trim(),
      });
      if (error) throw error;
      setNewComment('');
      await loadComments();
    } catch (error) {
      alert('댓글 작성 실패했습니다.');
      console.error(error);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('정말 삭제하시겠습니까?')) return;
    try {
      const { error } = await supabase.from('date_comments').delete().eq('id', id);
      if (error) throw error;
      await loadComments();
    } catch (error) {
      alert('댓글 삭제 실패했습니다.');
      console.error(error);
    }
  };

  return (
    <div className="mt-3 pt-3 border-t border-gray-200">
      <div className="text-xs font-semibold text-gray-600 mb-2">
        {date} 댓글{comments.length > 0 && ` (${comments.length})`}
      </div>

      {loading ? (
        <div className="text-xs text-gray-400">불러오는 중...</div>
      ) : (
        <div className="space-y-2 mb-2">
          {comments.map((c) => {
            const profile = profiles.get(c.author_id);
            const canDelete = c.author_id === currentUserId || isAdmin;
            return (
              <div
                key={c.id}
                className="flex items-start justify-between gap-2 text-xs bg-white rounded p-2 border border-gray-100"
              >
                <div className="min-w-0">
                  <span className="font-semibold text-gray-800">
                    {profile ? `${profile.name} ${profile.rank}` : '알 수 없음'}
                  </span>
                  <span className="text-gray-400 ml-1">{formatDateTime(c.created_at)}</span>
                  <div className="mt-0.5 text-gray-700 whitespace-pre-wrap break-words">
                    {c.content}
                  </div>
                </div>
                {canDelete && (
                  <button
                    onClick={() => handleDelete(c.id)}
                    className="p-1 text-gray-400 hover:text-red-600 shrink-0"
                    title="삭제"
                  >
                    <Trash2 size={12} />
                  </button>
                )}
              </div>
            );
          })}
          {comments.length === 0 && (
            <div className="text-xs text-gray-400">아직 댓글이 없습니다.</div>
          )}
        </div>
      )}

      {currentUserId && (
        <form onSubmit={handleSubmit} className="flex gap-2">
          <input
            type="text"
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            placeholder="댓글을 입력하세요..."
            disabled={submitting}
            className="flex-1 px-2 py-1 text-xs border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
          />
          <button
            type="submit"
            disabled={!newComment.trim() || submitting}
            className="flex items-center gap-1 bg-blue-500 hover:bg-blue-600 disabled:bg-gray-400 text-white text-xs px-2 py-1 rounded transition"
          >
            <Send size={12} />
          </button>
        </form>
      )}
    </div>
  );
}
