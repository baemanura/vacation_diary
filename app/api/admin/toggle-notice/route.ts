import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, isFailure } from '@/lib/serverAuth';

// 서무가 게시글을 공지로 올리거나 내린다.
//
// 대원이 자기 글을 고칠 수 있어야 하는데, DB 권한은 "이 줄을 고쳐도 되는가"까지만
// 구분하고 "어느 칸을 고쳐도 되는가"는 구분하지 못한다. 그래서 대원에게는 content만
// 고칠 수 있게 칸 단위로 권한을 잘라두고(GRANT UPDATE (content, updated_at)),
// is_notice는 아무도 브라우저에서 직접 바꿀 수 없게 했다.
// 공지 지정은 이 경로로만 가능하고, 여기서 서무인지 서버가 직접 확인한다.
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (isFailure(auth)) return auth.error;

    const { supabase } = auth;

    const body = await request.json();
    const postId = typeof body.postId === 'string' ? body.postId : '';
    const isNotice = body.isNotice === true;

    if (!postId) {
      return NextResponse.json({ error: '대상 게시글이 지정되지 않았습니다.' }, { status: 400 });
    }

    const { data: updated, error: updateError } = await supabase
      .from('board_posts')
      .update({ is_notice: isNotice })
      .eq('id', postId)
      .select('id, is_notice');

    if (updateError) {
      return NextResponse.json({ error: `공지 변경 실패: ${updateError.message}` }, { status: 400 });
    }

    // 이미 지워진 글을 누른 경우. 0건 수정은 오류로 오지 않으므로 직접 확인해야 한다.
    if (!updated || updated.length === 0) {
      return NextResponse.json({ error: '해당 게시글을 찾을 수 없습니다.' }, { status: 404 });
    }

    return NextResponse.json({ success: true, post: updated[0] });
  } catch (error) {
    console.error('공지 변경 오류:', error);
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 });
  }
}
