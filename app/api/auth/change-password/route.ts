import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { requireUser, isFailure } from '@/lib/serverAuth';
import { validateNewPassword } from '@/lib/password';

export async function POST(request: NextRequest) {
  try {
    const auth = await requireUser(request);
    if (isFailure(auth)) return auth.error;

    const { supabase, user } = auth;

    const body = await request.json();
    const currentPassword = typeof body.currentPassword === 'string' ? body.currentPassword : '';
    const newPassword = typeof body.newPassword === 'string' ? body.newPassword : '';

    if (!currentPassword) {
      return NextResponse.json({ error: '현재 비밀번호를 입력해주세요.' }, { status: 400 });
    }

    const invalidReason = validateNewPassword(newPassword);
    if (invalidReason) {
      return NextResponse.json({ error: invalidReason }, { status: 400 });
    }

    if (currentPassword === newPassword) {
      return NextResponse.json(
        { error: '새 비밀번호가 현재 비밀번호와 같습니다.' },
        { status: 400 }
      );
    }

    if (!user.email) {
      return NextResponse.json({ error: '이메일 정보가 없습니다.' }, { status: 400 });
    }

    // 자리를 비운 사이 남이 세션을 잡고 비밀번호를 바꿔버리는 것을 막기 위해
    // 세션만 믿지 않고 현재 비밀번호를 한 번 더 확인한다.
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (!anonKey || !supabaseUrl) {
      return NextResponse.json({ error: '서버 설정이 누락되었습니다.' }, { status: 500 });
    }

    const verifyClient = createClient(supabaseUrl, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { error: verifyError } = await verifyClient.auth.signInWithPassword({
      email: user.email,
      password: currentPassword,
    });

    if (verifyError) {
      return NextResponse.json(
        { error: '현재 비밀번호가 일치하지 않습니다.' },
        { status: 401 }
      );
    }

    const { error: updateError } = await supabase.auth.admin.updateUserById(user.id, {
      password: newPassword,
      app_metadata: { must_change_password: false },
    });

    if (updateError) {
      return NextResponse.json(
        { error: `비밀번호 변경 실패: ${updateError.message}` },
        { status: 400 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('비밀번호 변경 오류:', error);
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 });
  }
}
