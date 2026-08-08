'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useLiveRefresh } from '@/lib/useLiveRefresh';
import { formatDateTime } from '@/lib/utils';
import { Pin } from 'lucide-react';

interface Notice {
  id: string;
  content: string;
  created_at: string;
  authorName: string;
}

/**
 * 서무가 공지로 지정한 글을 대시보드 맨 위에 띄운다.
 *
 * 자유게시판은 화면 아래쪽에 있어서 로그인 직후에는 보이지 않는다. 모두가 읽어야 하는
 * 글이 정작 가장 찾기 어려운 자리에 있으면 안 되므로, 여기에 한 번 더 보여준다.
 * 게시판 목록에도 그대로 남아 있어서 댓글은 거기서 달면 된다.
 */
export default function NoticeBanner() {
  const [notices, setNotices] = useState<Notice[]>([]);

  const loadNotices = async () => {
    try {
      const { data: posts, error } = await supabase
        .from('board_posts')
        .select('id, content, created_at, author_id')
        .eq('is_notice', true)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('공지 조회 실패:', error);
        return;
      }
      if (!posts?.length) {
        setNotices([]);
        return;
      }

      // 게시글과 프로필 사이에 FK 관계가 없어 이름은 따로 조회해 붙인다.
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, name, rank')
        .in('id', posts.map((post) => post.author_id));

      const nameById = new Map(
        (profiles || []).map((p) => [p.id, `${p.name} ${p.rank}`.trim()])
      );

      setNotices(
        posts.map((post) => ({
          id: post.id,
          content: post.content,
          created_at: post.created_at,
          authorName: nameById.get(post.author_id) ?? '알 수 없음',
        }))
      );
    } catch (error) {
      console.error('공지 로드 실패:', error);
    }
  };

  useEffect(() => {
    // 첫 화면에 한 번만 불러온다. 이후 갱신은 아래 useLiveRefresh가 맡는다.
    // loadNotices는 async라서 상태 변경은 await 뒤에 일어나는데, 규칙이 그것까지는
    // 구분하지 못해 여기서만 끈다.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadNotices();
  }, []);

  // 서무가 공지를 올리거나 내리면 새로고침 없이 반영한다.
  useLiveRefresh(['board_posts'], () => loadNotices());

  // 공지가 없으면 자리를 차지하지 않는다.
  if (notices.length === 0) return null;

  return (
    <div className="space-y-3">
      {notices.map((notice) => (
        <div
          key={notice.id}
          className="bg-amber-50 border border-amber-300 border-l-4 border-l-amber-500 rounded-lg p-4"
        >
          <div className="flex items-center gap-2 flex-wrap">
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500 text-white text-xs font-bold">
              <Pin size={12} />
              공지
            </span>
            <span className="text-sm font-semibold text-gray-900">{notice.authorName}</span>
            <span className="text-xs text-gray-500">{formatDateTime(notice.created_at)}</span>
          </div>
          <div className="mt-2 text-gray-900 whitespace-pre-wrap break-words">
            {notice.content}
          </div>
        </div>
      ))}
    </div>
  );
}
