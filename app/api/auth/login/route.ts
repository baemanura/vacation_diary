import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

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
    const { data: profile, error: profileError } = await adminSupabase
      .from('profiles')
      .select('*')
      .eq('name', name)
      .eq('rank', rank)
      .single();

    if (profileError || !profile) {
      return NextResponse.json(
        { error: '일치하는 계정을 찾을 수 없습니다.' },
        { status: 401 }
      );
    }

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
