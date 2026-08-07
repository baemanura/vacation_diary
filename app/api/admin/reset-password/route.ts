import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, isFailure } from '@/lib/serverAuth';
import { generateInitialPassword } from '@/lib/password';

// 대원이 비밀번호를 잊었을 때 서무가 새 임시 비밀번호를 발급한다.
// 발급된 값은 이 응답에서 한 번만 보여주고 어디에도 저장하지 않는다.
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (isFailure(auth)) return auth.error;

    const { supabase } = auth;

    const body = await request.json();
    const memberId = typeof body.memberId === 'string' ? body.memberId : '';

    if (!memberId) {
      return NextResponse.json({ error: '대상 대원이 지정되지 않았습니다.' }, { status: 400 });
    }

    const { data: target, error: targetError } = await supabase
      .from('profiles')
      .select('id, name, rank')
      .eq('id', memberId)
      .single();

    if (targetError || !target) {
      return NextResponse.json({ error: '해당 대원을 찾을 수 없습니다.' }, { status: 404 });
    }

    const newPassword = generateInitialPassword();

    // 임시 비밀번호는 반드시 본인이 다시 바꾸도록 플래그를 세운다.
    const { error: updateError } = await supabase.auth.admin.updateUserById(memberId, {
      password: newPassword,
      app_metadata: { must_change_password: true },
    });

    if (updateError) {
      return NextResponse.json(
        { error: `비밀번호 초기화 실패: ${updateError.message}` },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      name: target.name,
      rank: target.rank,
      temporaryPassword: newPassword,
    });
  } catch (error) {
    console.error('비밀번호 초기화 오류:', error);
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 });
  }
}
