'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { formatDateTime } from '@/lib/utils';
import { Send, Trash2, ChevronDown, ChevronUp } from 'lucide-react';

interface Profile {
  id: string;
  name: string;
  rank: string;
}

interface Comment {
  id: string;
  post_id: string;
  author_id: string;
  content: string;
  created_at: string;
  profiles?: Profile;
}

interface Post {
  id: string;
  author_id: string;
  content: string;
  created_at: string;
  profiles?: Profile;
  board_comments?: Comment[];
}

export default function BoardPosts({ currentUserId }: { currentUserId: string }) {
  const [posts, setPosts] = useState<Post[]>([]);
  const [newPost, setNewPost] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [expandedPosts, setExpandedPosts] = useState<Set<string>>(new Set());
  const [newComments, setNewComments] = useState<{ [key: string]: string }>({});
  const [submittingComments, setSubmittingComments] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadPosts();

    // 일단 Realtime 구독 비활성화 (나중에 수정)
    // const subscription = supabase
    //   .channel('board_posts')
    //   .on(
    //     'postgres_changes',
    //     { event: '*', schema: 'public', table: 'board_posts' },
    //     () => loadPosts()
    //   )
    //   .subscribe();

    // return () => {
    //   subscription.unsubscribe();
    // };
  }, []);

  const loadPosts = async () => {
    try {
      // 게시글 조회
      const { data: postsData, error: postsError } = await supabase
        .from('board_posts')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);

      if (postsError) console.error('게시글 조회 실패:', postsError);

      // 모든 댓글 조회
      const { data: commentsData, error: commentsError } = await supabase
        .from('board_comments')
        .select('*')
        .order('created_at', { ascending: true });

      if (commentsError) console.error('댓글 조회 실패:', commentsError);

      // 신청자 프로필 조회 후 매핑 (profiles와의 FK 관계가 없어 별도 조회 후 매핑)
      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('id, name, rank');

      if (profileError) console.error('프로필 조회 실패:', profileError);

      const profileMap = new Map<string, Profile>();
      profileData?.forEach((p) => {
        profileMap.set(p.id, p);
      });

      const commentsByPost = new Map<string, Comment[]>();
      (commentsData || []).forEach((comment) => {
        const withProfile = { ...comment, profiles: profileMap.get(comment.author_id) };
        const existing = commentsByPost.get(comment.post_id) || [];
        existing.push(withProfile);
        commentsByPost.set(comment.post_id, existing);
      });

      const postsWithComments = (postsData || []).map((post) => ({
        ...post,
        profiles: profileMap.get(post.author_id),
        board_comments: commentsByPost.get(post.id) || [],
      }));

      setPosts(postsWithComments);
    } catch (error) {
      console.error('게시글 로드 실패:', error);
    } finally {
      setLoading(false);
    }
  };

  const toggleComments = (postId: string) => {
    const newExpanded = new Set(expandedPosts);
    if (newExpanded.has(postId)) {
      newExpanded.delete(postId);
    } else {
      newExpanded.add(postId);
    }
    setExpandedPosts(newExpanded);
  };

  const handleCommentSubmit = async (postId: string) => {
    const content = newComments[postId]?.trim();
    if (!content) return;

    setSubmittingComments(new Set([...submittingComments, postId]));

    try {
      const { error } = await supabase.from('board_comments').insert({
        post_id: postId,
        author_id: currentUserId,
        content,
      });

      if (error) throw error;

      setNewComments({ ...newComments, [postId]: '' });
      await loadPosts();
    } catch (error) {
      alert('댓글 작성 실패했습니다.');
      console.error(error);
    } finally {
      setSubmittingComments(new Set([...submittingComments].filter(id => id !== postId)));
    }
  };

  const handleCommentDelete = async (commentId: string) => {
    if (!confirm('정말 삭제하시겠습니까?')) return;

    try {
      const { error } = await supabase.from('board_comments').delete().eq('id', commentId);
      if (error) throw error;
      await loadPosts();
    } catch (error) {
      alert('댓글 삭제 실패했습니다.');
      console.error(error);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPost.trim()) return;

    setSubmitting(true);

    try {
      const { error } = await supabase.from('board_posts').insert({
        author_id: currentUserId,
        content: newPost.trim(),
      });

      if (error) throw error;

      setNewPost('');
      await loadPosts();
    } catch (error) {
      alert('게시 실패했습니다.');
      console.error(error);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('정말 삭제하시겠습니까?')) return;

    try {
      const { error } = await supabase.from('board_posts').delete().eq('id', id);
      if (error) throw error;
      await loadPosts();
    } catch (error) {
      alert('삭제 실패했습니다.');
      console.error(error);
    }
  };

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h2 className="text-xl font-bold mb-6 text-gray-900">자유게시판</h2>

      {/* 글 작성 폼 */}
      <form onSubmit={handleSubmit} className="mb-6 pb-6 border-b border-gray-200">
        <textarea
          value={newPost}
          onChange={(e) => setNewPost(e.target.value)}
          placeholder="대원들과 소통해보세요..."
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none resize-none"
          rows={3}
          disabled={submitting}
        />
        <div className="mt-3 flex justify-end">
          <button
            type="submit"
            disabled={!newPost.trim() || submitting}
            className="flex items-center gap-2 bg-blue-500 hover:bg-blue-600 disabled:bg-gray-400 text-white font-semibold py-2 px-4 rounded-lg transition duration-200"
          >
            <Send size={18} />
            {submitting ? '등록 중...' : '등록'}
          </button>
        </div>
      </form>

      {/* 게시글 목록 */}
      {loading ? (
        <div className="text-center text-gray-600">로딩 중...</div>
      ) : posts.length === 0 ? (
        <div className="text-center text-gray-500 py-8">아직 게시글이 없습니다.</div>
      ) : (
        <div className="space-y-4">
          {posts.map((post) => (
            <div key={post.id} className="p-4 bg-gray-50 rounded border border-gray-200">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="font-semibold text-gray-900">
                    {post.profiles?.name} {post.profiles?.rank}
                  </div>
                  <div className="text-sm text-gray-500 mt-1">{formatDateTime(post.created_at)}</div>
                </div>
                {post.author_id === currentUserId && (
                  <button
                    onClick={() => handleDelete(post.id)}
                    className="ml-4 p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition"
                    title="삭제"
                  >
                    <Trash2 size={18} />
                  </button>
                )}
              </div>
              <div className="mt-3 text-gray-800 whitespace-pre-wrap break-words">{post.content}</div>

              {/* 댓글 토글 버튼 */}
              <button
                onClick={() => toggleComments(post.id)}
                className="mt-4 text-sm text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1"
              >
                댓글 {(post.board_comments || []).length}개
                {expandedPosts.has(post.id) ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              </button>

              {/* 댓글 섹션 */}
              {expandedPosts.has(post.id) && (
                <div className="mt-4 pt-4 border-t border-gray-200 space-y-3">
                  {/* 댓글 목록 */}
                  {post.board_comments && post.board_comments.length > 0 ? (
                    <div className="space-y-3">
                      {post.board_comments.map((comment) => (
                        <div key={comment.id} className="pl-4 py-2 bg-white rounded border-l-2 border-gray-300">
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <div className="text-sm font-semibold text-gray-800">
                                {comment.profiles?.name} {comment.profiles?.rank}
                              </div>
                              <div className="text-xs text-gray-500 mt-1">
                                {formatDateTime(comment.created_at)}
                              </div>
                            </div>
                            {comment.author_id === currentUserId && (
                              <button
                                onClick={() => handleCommentDelete(comment.id)}
                                className="ml-2 p-1 text-gray-400 hover:text-red-600 transition"
                                title="댓글 삭제"
                              >
                                <Trash2 size={14} />
                              </button>
                            )}
                          </div>
                          <div className="mt-2 text-sm text-gray-700 whitespace-pre-wrap break-words">
                            {comment.content}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-sm text-gray-500 py-2">댓글이 없습니다.</div>
                  )}

                  {/* 댓글 작성 폼 */}
                  <div className="mt-4 pt-3 border-t border-gray-200">
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={newComments[post.id] || ''}
                        onChange={(e) =>
                          setNewComments({ ...newComments, [post.id]: e.target.value })
                        }
                        onKeyPress={(e) => {
                          if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            handleCommentSubmit(post.id);
                          }
                        }}
                        placeholder="댓글을 입력하세요..."
                        disabled={submittingComments.has(post.id)}
                        className="flex-1 px-3 py-1 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                      />
                      <button
                        onClick={() => handleCommentSubmit(post.id)}
                        disabled={
                          !newComments[post.id]?.trim() || submittingComments.has(post.id)
                        }
                        className="flex items-center gap-1 bg-blue-500 hover:bg-blue-600 disabled:bg-gray-400 text-white font-medium py-1 px-3 rounded text-sm transition"
                      >
                        <Send size={14} />
                        {submittingComments.has(post.id) ? '등록 중...' : '등록'}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
