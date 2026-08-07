import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

// Supabase 무료 플랜은 7일간 DB 활동이 없으면 프로젝트를 자동으로 일시정지한다.
// 외부 크론(cron-job.org 등)이 이 엔드포인트를 주기적으로 호출해 가벼운 쿼리를 한 번
// 발생시키는 것만으로 비활성 판정을 막을 수 있다.
// Route Handler는 기본적으로 캐시되지 않으므로 매 호출이 실제로 DB까지 도달한다.
export async function GET() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !anonKey) {
    return NextResponse.json(
      { ok: false, error: '서버 설정이 누락되었습니다.' },
      { status: 500 }
    );
  }

  const supabase = createClient(supabaseUrl, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // 행 내용은 필요 없고 DB에 실제 쿼리가 닿기만 하면 되므로 count만 요청한다.
  const { error } = await supabase
    .from('profiles')
    .select('id', { count: 'exact', head: true });

  if (error) {
    return NextResponse.json(
      { ok: false, error: error.message, checkedAt: new Date().toISOString() },
      { status: 503 }
    );
  }

  return NextResponse.json({ ok: true, checkedAt: new Date().toISOString() });
}
