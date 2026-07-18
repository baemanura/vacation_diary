import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, password, name, rank, role = 'member' } = body;

    if (!email || !password || !name || !rank) {
      return NextResponse.json(
        { error: '필수 정보가 누락되었습니다.' },
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

    // Admin API를 사용하여 Supabase 클라이언트 생성
    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    // 1. Auth에 사용자 생성
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // 자동 확인
    });

    if (authError || !authData.user) {
      return NextResponse.json(
        { error: `계정 생성 실패: ${authError?.message || '알 수 없는 오류'}` },
        { status: 400 }
      );
    }

    // 2. profiles 테이블에 프로필 생성
    const { data: profileData, error: profileError } = await supabase
      .from('profiles')
      .insert({
        id: authData.user.id,
        name,
        rank,
        role,
      })
      .select()
      .single();

    if (profileError) {
      // 프로필 생성 실패 시 생성된 Auth 사용자는 유지 (수동 삭제 필요)
      return NextResponse.json(
        {
          error: `프로필 생성 실패: ${profileError.message}`,
          userId: authData.user.id,
          note: 'Auth 계정은 생성되었으나 프로필 등록에 실패했습니다. 수동으로 프로필을 등록하거나 계정을 삭제해주세요.',
        },
        { status: 400 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        message: '계정이 생성되었습니다.',
        user: {
          id: authData.user.id,
          email: authData.user.email,
          name,
          rank,
          role,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('계정 생성 오류:', error);
    return NextResponse.json(
      { error: '서버 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
