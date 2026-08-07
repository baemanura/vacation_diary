import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

// Supabase 무료 플랜은 7일간 DB 활동이 없으면 프로젝트를 자동으로 일시정지한다.
// 이 엔드포인트를 주기적으로 호출해 가벼운 쿼리를 한 번 발생시키는 것만으로 막을 수 있다.
//
// vercel.json의 crons가 매일 03:00 UTC(한국 시간 정오)에 여기를 호출한다.
// Hobby 플랜은 하루 1회까지만 허용하므로 더 자주 부르려면 외부 크론을 함께 써야 한다.
//
// Route Handler는 기본적으로 캐시되지 않으므로 매 호출이 실제로 DB까지 도달한다.
// (캐시되면 DB에 닿지 않아 활동으로 집계되지 않으니 이 점이 중요하다.)
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
