import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { mustChangePassword } from '@/lib/serverAuth';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, rank, password } = body;

    if (!name || !rank || !password) {
      return NextResponse.json(
        { error: '이름, 계급, 비밀번호를 입력해주세요.' },
        { status: 400 }
      );
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceRoleKey) {
      return NextResponse.json(
        { error: '서버 설정이 누락되었습니다.' },
        { status: 500 }
      );
    }

    // Admin 클라이언트로 profiles 테이블 조회
    const adminSupabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    // 이름과 계급으로 프로필 찾기
    const { data: profiles, error: profileError } = await adminSupabase
      .from('profiles')
      .select('*')
      .eq('name', name)
      .eq('rank', rank);

    if (profileError) {
      return NextResponse.json(
        { error: '일치하는 계정을 찾을 수 없습니다.' },
        { status: 401 }
      );
    }

    // .single()로 조회하면 동명이인(이름·계급이 모두 같은 경우)에 에러가 나서
    // 해당 대원이 영영 로그인하지 못한다. 목록으로 받아 직접 판별한다.
    if (!profiles || profiles.length === 0) {
      return NextResponse.json(
        { error: '일치하는 계정을 찾을 수 없습니다.' },
        { status: 401 }
      );
    }

    // 이름·계급이 같은 계정이 둘 이상이면 누구인지 특정할 수 없다.
    // 임의로 하나를 고르면 다른 사람으로 로그인될 수 있어 막고 안내한다.
    if (profiles.length > 1) {
      return NextResponse.json(
        { error: '이름과 계급이 같은 계정이 여러 개 있습니다. 서무에게 문의해주세요.' },
        { status: 409 }
      );
    }

    const profile = profiles[0];

    // Auth 사용자의 이메일 찾기
    const { data: authUser, error: authError } = await adminSupabase.auth.admin.getUserById(
      profile.id
    );

    if (authError || !authUser.user) {
      return NextResponse.json(
        { error: '인증 정보를 찾을 수 없습니다.' },
        { status: 401 }
      );
    }

    const email = authUser.user.email;
    if (!email) {
      return NextResponse.json(
        { error: '이메일 정보가 없습니다.' },
        { status: 401 }
      );
    }

    // 일반 클라이언트로 로그인 시도
    const userSupabase = createClient(supabaseUrl, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);

    const { data: authData, error: signInError } = await userSupabase.auth.signInWithPassword({
      email,
      password,
    });

    if (signInError || !authData.session) {
      return NextResponse.json(
        { error: '비밀번호가 일치하지 않습니다.' },
        { status: 401 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        session: authData.session,
        profile,
        // 초기(임시) 비밀번호로 로그인했으면 본인 비밀번호로 바꾸도록 안내한다.
        mustChangePassword: mustChangePassword(authUser.user),
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('로그인 오류:', error);
    return NextResponse.json(
      { error: '서버 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
