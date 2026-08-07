import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

// 서버 전용 모듈이다. 서비스 롤 키를 다루므로 클라이언트에서 import하면 안 된다.

/** 서비스 롤 클라이언트를 만든다. 환경변수가 없으면 null. */
export function createAdminClient(): SupabaseClient | null {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) return null;

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

type AuthFailure = { error: NextResponse };
type UserSuccess = { supabase: SupabaseClient; user: User };
type AdminSuccess = UserSuccess & { profile: { id: string; role: string } };

export function isFailure<T extends object>(result: T | AuthFailure): result is AuthFailure {
  return 'error' in result;
}

/** Authorization 헤더의 토큰으로 요청자를 확인한다. */
export async function requireUser(request: Request): Promise<UserSuccess | AuthFailure> {
  const supabase = createAdminClient();
  if (!supabase) {
    return {
      error: NextResponse.json({ error: '서버 설정이 누락되었습니다.' }, { status: 500 }),
    };
  }

  const authHeader = request.headers.get('authorization');
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) {
    return { error: NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 }) };
  }

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) {
    return { error: NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 }) };
  }

  return { supabase, user: data.user };
}

/** 요청자가 서무(admin)인지까지 확인한다. */
export async function requireAdmin(request: Request): Promise<AdminSuccess | AuthFailure> {
  const result = await requireUser(request);
  if (isFailure(result)) return result;

  const { supabase, user } = result;

  const { data: profile, error } = await supabase
    .from('profiles')
    .select('id, role')
    .eq('id', user.id)
    .single();

  if (error || profile?.role !== 'admin') {
    return {
      error: NextResponse.json({ error: '서무만 사용할 수 있습니다.' }, { status: 403 }),
    };
  }

  return { supabase, user, profile };
}

/**
 * 이 계정이 아직 초기 비밀번호를 쓰고 있는지 판단한다.
 *
 * app_metadata는 서비스 롤로만 바꿀 수 있어 사용자가 스스로 지워 강제 변경을
 * 건너뛸 수 없다. 기존 계정에는 이 값이 아예 없으므로, false로 명시된 경우에만
 * "이미 바꿨다"고 보고 나머지는 변경이 필요한 것으로 취급한다.
 * 덕분에 기존 대원 전원이 다음 로그인 때 자동으로 변경 절차를 밟는다.
 */
export function mustChangePassword(user: Pick<User, 'app_metadata'>): boolean {
  return user.app_metadata?.must_change_password !== false;
}
