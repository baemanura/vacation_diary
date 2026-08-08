'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useLiveRefresh } from '@/lib/useLiveRefresh';
import { describeUnexpectedError, formatDateTime } from '@/lib/utils';
import { Send, Trash2, ChevronDown, ChevronUp, Pin, PinOff } from 'lucide-react';

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
  is_notice: boolean;
  profiles?: Profile;
  board_comments?: Comment[];
}

export default function BoardPosts({
  currentUserId,
  isAdmin = false,
}: {
  currentUserId: string;
  isAdmin?: boolean;
}) {
  const [posts, setPosts] = useState<Post[]>([]);
  const [newPost, setNewPost] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [expandedPosts, setExpandedPosts] = useState<Set<string>>(new Set());
  const [newComments, setNewComments] = useState<{ [key: string]: string }>({});
  const [submittingComments, setSubmittingComments] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadPosts();
  }, []);

  // 다른 대원이 올린 글·댓글을 새로고침 없이 반영한다.
  useLiveRefresh(['board_posts', 'board_comments'], () => loadPosts());

  const loadPosts = async () => {
    try {
      // 게시글 조회. 공지는 오래됐더라도 항상 맨 위에 오게 정렬한다.
      // (정렬이 limit보다 먼저 적용되므로 50번째 밖으로 밀린 공지도 살아남는다.)
      const { data: postsData, error: postsError } = await supabase
        .from('board_posts')
        .select('*')
        .order('is_notice', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(50);

      if (postsError) console.error('게시글 조회 실패:', postsError);

      // 화면에 띄운 글의 댓글만 가져온다. 예전에는 테이블 전체를 받아왔는데,
      // 글이 쌓일수록 아무도 안 보는 댓글까지 매번 실려와 계속 무거워진다.
      const postIds = (postsData || []).map((post) => post.id);
      const { data: commentsData, error: commentsError } = postIds.length
        ? await supabase
            .from('board_comments')
            .select('*')
            .in('post_id', postIds)
            .order('created_at', { ascending: true })
        : { data: [], error: null };

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

  // 서무가 이미 올라온 글을 공지로 올리거나 내린다.
  // 공지로 올려도 글쓴이는 그대로이고, 목록 맨 위로만 옮겨간다.
  const handleToggleNotice = async (post: Post) => {
    try {
      const { error } = await supabase
        .from('board_posts')
        .update({ is_notice: !post.is_notice })
        .eq('id', post.id);
      if (error) throw error;
      await loadPosts();
    } catch (error) {
      alert(describeUnexpectedError(error, post.is_notice ? '공지 내리기' : '공지 등록'));
      console.error(error);
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
            <div
              key={post.id}
              className={`p-4 rounded border ${
                post.is_notice
                  ? 'bg-amber-50 border-amber-300 border-l-4 border-l-amber-500'
                  : 'bg-gray-50 border-gray-200'
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  {post.is_notice && (
                    <span className="inline-flex items-center gap-1 mb-1 px-2 py-0.5 rounded-full bg-amber-500 text-white text-xs font-bold">
                      <Pin size={12} />
                      공지
                    </span>
                  )}
                  <div className="font-semibold text-gray-900">
                    {post.profiles?.name} {post.profiles?.rank}
                  </div>
                  <div className="text-sm text-gray-500 mt-1">{formatDateTime(post.created_at)}</div>
                </div>
                <div className="ml-4 flex items-center gap-1 shrink-0">
                  {isAdmin && (
                    <button
                      onClick={() => handleToggleNotice(post)}
                      className={`p-2 rounded transition ${
                        post.is_notice
                          ? 'text-amber-600 hover:text-gray-600 hover:bg-gray-100'
                          : 'text-gray-400 hover:text-amber-600 hover:bg-amber-50'
                      }`}
                      title={post.is_notice ? '공지 내리기' : '공지로 올리기'}
                    >
                      {post.is_notice ? <PinOff size={18} /> : <Pin size={18} />}
                    </button>
                  )}
                  {post.author_id === currentUserId && (
                    <button
                      onClick={() => handleDelete(post.id)}
                      className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition"
                      title="삭제"
                    >
                      <Trash2 size={18} />
                    </button>
                  )}
                </div>
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
