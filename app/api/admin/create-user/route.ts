import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, isFailure } from '@/lib/serverAuth';
import { INITIAL_PASSWORD } from '@/lib/password';
import { randomInt } from 'node:crypto';

// 로그인은 이름+계급으로 하므로 이메일은 표시되지 않는 내부 식별자일 뿐이다.
// 클라이언트가 정하게 두지 않고 서버에서 충돌 없이 만든다.
function generateEmail() {
  const timestamp = Date.now().toString().slice(-6);
  const random = randomInt(1000).toString().padStart(3, '0');
  return `user_${timestamp}${random}@unit.local`;
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (isFailure(auth)) return auth.error;

    const { supabase } = auth;

    const body = await request.json();
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const rank = typeof body.rank === 'string' ? body.rank.trim() : '';
    const role = body.role === 'admin' ? 'admin' : 'member';

    if (!name || !rank) {
      return NextResponse.json({ error: '필수 정보가 누락되었습니다.' }, { status: 400 });
    }

    // 로그인은 "이름 + 계급"으로 사람을 특정하므로, 둘 다 같은 계정이 두 개 생기면
    // 두 사람 모두 로그인할 수 없게 된다. 생성 단계에서 막는다.
    const { data: duplicates, error: duplicateError } = await supabase
      .from('profiles')
      .select('id')
      .eq('name', name)
      .eq('rank', rank);

    if (duplicateError) {
      return NextResponse.json(
        { error: `중복 확인 실패: ${duplicateError.message}` },
        { status: 400 }
      );
    }

    if (duplicates && duplicates.length > 0) {
      return NextResponse.json(
        {
          error: `이미 "${name} ${rank}" 계정이 있습니다. 이름과 계급이 모두 같으면 로그인할 때 구분할 수 없습니다.`,
        },
        { status: 409 }
      );
    }

    // 서무가 불러주고 대원이 받아적기 쉽도록 초기 비밀번호는 정해진 값을 쓴다.
    // 모두가 아는 값이므로 첫 로그인 때 반드시 본인 것으로 바꾸게 한다
    // (아래 app_metadata의 must_change_password가 그 역할을 한다).
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email: generateEmail(),
      password: INITIAL_PASSWORD,
      email_confirm: true, // 자동 확인
      app_metadata: { must_change_password: true },
    });

    if (authError || !authData.user) {
      return NextResponse.json(
        { error: `계정 생성 실패: ${authError?.message || '알 수 없는 오류'}` },
        { status: 400 }
      );
    }

    const { error: profileError } = await supabase
      .from('profiles')
      .insert({ id: authData.user.id, name, rank, role })
      .select()
      .single();

    if (profileError) {
      // 프로필이 없으면 로그인 자체가 안 되는 반쪽 계정이 남는다.
      // 방금 만든 Auth 계정을 되돌려 찌꺼기를 남기지 않는다.
      await supabase.auth.admin.deleteUser(authData.user.id);

      return NextResponse.json(
        { error: `프로필 생성 실패: ${profileError.message}` },
        { status: 400 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        message: '계정이 생성되었습니다.',
        user: { id: authData.user.id, name, rank, role },
        initialPassword: INITIAL_PASSWORD,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('계정 생성 오류:', error);
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 });
  }
}
