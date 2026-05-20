import { createBrowserClient } from "@supabase/ssr";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "Supabase 환경변수가 없습니다. .env.local에 NEXT_PUBLIC_SUPABASE_URL과 NEXT_PUBLIC_SUPABASE_ANON_KEY를 설정하세요 (.env.example 참고)."
  );
}

// 브라우저(클라이언트 컴포넌트)용 Supabase 클라이언트.
// 쿠키 기반 세션을 사용하므로 미들웨어/서버에서도 동일 세션을 인식합니다.
export const supabase = createBrowserClient(supabaseUrl, supabaseAnonKey);
