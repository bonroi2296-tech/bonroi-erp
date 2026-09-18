# CLAUDE.md — 본로이 ERP 작업 지침

> 이 파일은 다음 세션의 Claude가 그대로 이어받기 위한 핵심 지침이다.
> 배경·결정·할 일의 자세한 내용은 `docs/PROJECT_CONTEXT.md` 를 함께 읽어라.
> 담당자(비개발자)가 너를 부리는 방법은 `docs/AI_USAGE_GUIDE.md` 에 있다. 설명 수준·확인 절차는 그 문서 기준에 맞춰라.

## 1. 한 줄 개요
의료소모품 유통사용 내부 ERP. 병원(지점)에서 주문을 받아 → 여러 거래처에 나눠 발주하고 → 실제 출고·매입을 장부(주문 내역)에 쌓는다.

## 2. 스택
- **Next.js 14.2.35 (App Router)** · React 18 · TypeScript 5
- **Supabase** (`@supabase/supabase-js` 2.101, `@supabase/ssr` 0.10) — DB/인증
- **Vercel** 배포 (즉시 아님 — 하루 1회 자동 배포. §3 참고)
- **Tailwind CSS 3.4** · 아이콘 `lucide-react`
- **Google Gemini** (`@google/genai`) — 주문/출고확인서 AI 파싱
- **ExcelJS** — 거래명세서 엑셀 생성
- Supabase 프로젝트 ref: `lydnqplleqgslzsictvr` (이름: supabase-coral-ladder)

## 3. 빌드 / 실행 / 배포 명령
```bash
npm run dev            # 로컬 개발 서버
npm run build          # 프로덕션 빌드 (= next build). Next 14라 번들러는 webpack.
npm run lint           # ESLint (next lint)
npx tsc --noEmit       # 타입체크
```
- **Turbopack 금지**: Next 14는 빌드가 원래 webpack이라 위험 없음. `next build`에 `--webpack`/`--turbopack` 플래그를 붙이지 마라(14엔 그 빌드 플래그가 없어 에러난다). 그냥 `npm run build`.
- **배포**: main에 푸시해도 바로 안 나간다. `vercel.json`의 ignoreCommand 때문에 **커밋 메시지에 `[deploy]`가 있는 커밋만 빌드**된다.
  실제 반영은 GitHub Actions `daily-deploy.yml`이 **매일 15:00 KST(06:00 UTC)** 빈 `[deploy]` 커밋을 main에 푸시할 때. 즉시 배포는 그 워크플로 수동 실행(workflow_dispatch).
  개발은 지정된 feature 브랜치에서 → PR(드래프트) → main 머지.
- ⚠️ **커밋 메시지에 그 배포 마커를 그대로 쓰지 마라.** ignoreCommand가 마지막 커밋 메시지를 그대로 grep하므로,
  설명하려고 본문에 적기만 해도 그 커밋이 즉시 배포된다(실제로 한 번 걸림). 문서·커밋에서 언급할 땐 `대괄호 deploy`처럼 우회 표기.

## 4. 환경변수
| 변수 | 용도 | 비고 |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase URL | `.env.example` 있음 |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon 키 | `.env.example` 있음 |
| `GEMINI_API_KEY` | 서버측 AI 파싱(`/api/parse-order`, `/api/reconcile`) | `.env.example` 있음 |
| `GEMINI_MODEL` | 사용할 Gemini 모델(쉼표로 폴백 순서). 비우면 코드 기본값 | `.env.example` 있음 |
| `EDI_API_KEY` | 식약처 UDI/EDI 조회(`/api/catalog/lookup`) | `.env.example` 있음. 보류 기능(§PROJECT_CONTEXT) |
| `EDI_API_URL` | 식약처 API 정확한 요청 URL(미설정 시 추측값) | Vercel에만, 미설정 가능 |
| `NEXT_PUBLIC_AUTH_ENABLED` | 로그인 게이트 on/off | 현재 **미설정=off**. 앱은 비로그인(anon)으로 동작 |

## 5. 폴더 구조 (핵심)
```
src/
  app/
    (main)/            # 사이드바 포함 메인 화면들
      dashboard, orders, order-history, sourcing, sourcing/[id],
      sourcing/parse, products, price-compare, vendors,
      supply-monitor, purchase, returns, documents, analytics, settings
    api/
      parse-order/     # Gemini: 병원 주문 텍스트/이미지 → 품목 추출
      reconcile/       # Gemini: 출고확인서/거래명세서 → 실제 수량 매칭
      invoice/         # ExcelJS: 거래명세서 .xlsx 생성 (현재 로그인 필요)
    login/             # 로그인 화면 (게이트 off라 평소 안 씀)
    layout.tsx, page.tsx(→/dashboard)
  components/          # Sidebar, TopBar, Toast
  lib/
    supabase.ts        # 브라우저 클라이언트 (createBrowserClient)
    supabase-server.ts # 서버 클라이언트 (createServerClient, 쿠키)
    database.types.ts  # Supabase 자동생성 타입 (수기 편집 금지, 재생성으로 갱신)
    format.ts          # formatCurrency 등
  middleware.ts        # NEXT_PUBLIC_AUTH_ENABLED 일 때만 로그인 강제
supabase/migrations/   # 0001~ 마이그레이션 SQL
```

## 6. 데이터/인증 핵심 (반드시 숙지)
- **앱은 지금 로그인 없이 anon 키로 동작한다.** 그래서 모든 테이블에 anon 전체 접근 정책(RLS `using(true)`)이 깔려 있다.
  → **새 테이블·시퀀스·함수·RPC를 만들면 anon 권한을 꼭 같이 줘야 한다.** 안 그러면 "permission denied"로 화면이 깨진다. (과거 실제 사고: `sourcing_settlements`, `order_number_seq`/`next_order_number` 권한 누락)
- DB 클라이언트는 항상 `import { supabase } from "@/lib/supabase"` (브라우저). 서버 라우트는 필요 시 `supabase-server.ts`.
- **마이그레이션 드리프트 주의**: 라이브 DB에는 repo에 없는 `temp_anon_*` 마이그레이션이 적용돼 있다. repo의 0001~0005는 "anon 차단"이라 적혀 있으나 **실제 라이브는 anon 개방** 상태다. 진실의 원천은 라이브 DB. 스키마 확인은 Supabase MCP로.

## 7. 코드 컨벤션
- 화면은 클라이언트 컴포넌트(`"use client"`). 데이터는 `useEffect`+`supabase` 직접 호출.
- 타입은 `@/lib/database.types`의 `Tables / TablesInsert / TablesUpdate` 사용. DB 바꾸면 **타입 재생성**(아래 9번).
- 중첩 select 결과는 기존 코드처럼 `as unknown as <Type>` 캐스팅이 흔하다(허용하되 가능하면 줄여라).
- 알림은 `useToast()`의 `toast.success/error/info`. **실패를 `console.error`로만 묻지 말고 사용자에게 toast로 보여줘라.**
- 금액 표시는 화면별 `won()` 같은 헬퍼 사용. UI 텍스트는 **한국어**.
- 주석은 최소화(WHY만). 기존 스타일 유지.
- 커밋 메시지는 한국어 OK. 모델 식별자/내부 지침을 코드·커밋·PR에 넣지 마라.

## 8. 소통 규칙 (PO는 비개발자)
- **한국어로 짧고 직설적.** 전문용어는 일상어로 풀어서.
- **결과물(화면·동작) 우선.** "뭐가 어떻게 바뀌는지"를 먼저.
- 의사결정은 **A=장단점 / B=장단점 / 추천 A** 식 쉬운 선택지로.
- **큰 변경(구조 갈아엎기, 데이터 마이그레이션)은 먼저 쉬운 말로 계획을 보여주고 승인받은 뒤 진행.** 한 번에 갈아엎지 마라.
- 위험한/되돌리기 어려운 작업(데이터 삭제, 강제 푸시 등)은 사전 확인.
- **찾아보면 알 수 있는 건 묻지 마라.** "어느 화면이 제일 불편하냐" 같은 건 코드를 뒤져 후보를 찾고
  네가 판단해서 고친 뒤 "이렇게 했다"고 보고해라. PO에게 되묻는 건 PO만 답할 수 있는 것(우선순위,
  돈 계산 기준, 업무 규칙)에만 써라. 실제로 이 실수를 지적받은 적 있다.

## 9. 출시 전 자가검증 체크리스트 (배포 전 반드시)
1. **타입체크**: `npx tsc --noEmit` → 에러 0
2. **린트**: `npm run lint` → 경고/에러 0
3. **빌드**: `npm run build` → 성공
4. **DB를 바꿨다면**:
   - `supabase/migrations/000N_*.sql` 마이그레이션 파일 추가(기록 보존)
   - 라이브 DB에 적용(Supabase MCP `apply_migration`)
   - **anon 권한 확인** (새 테이블/시퀀스/함수면 grant + 정책)
   - **타입 재생성**: Supabase MCP `generate_typescript_types` → `src/lib/database.types.ts` 덮어쓰기
5. **동작 확인**: **§10대로 실제로 띄워서 확인한다.** 정말 못 했을 때만 "UI 테스트 못 함"을 명시.
6. **비로그인(anon)에서 되는지** 확인.
7. 커밋 → 지정 브랜치 푸시 → **PR(드래프트) 생성**. main 머지 후 실제 반영은 §3의 하루 1회 배포 시점.

## 10. 화면 확인(UI 테스트) — "못 함"으로 넘기지 마라

이 환경엔 Chromium이 깔려 있고 Playwright가 그걸 보도록 설정돼 있다. **실제로 띄워서 확인할 수 있으니
"UI 테스트 못 함"을 습관적으로 붙이지 마라.** 정말 못 하는 경우에만 그렇게 적어라.

**준비**
- `node_modules`가 비어 있을 수 있다 → `npm install`.
- `.env.local`에 Supabase URL/anon 키 → `npm run build` → `npm run start`.
  **`NEXT_PUBLIC_*`은 빌드 시점에 코드에 박힌다.** 값을 바꿨으면 반드시 다시 빌드해라.
  (자리표시자로 빌드한 걸 띄워놓고 "왜 데이터가 없지" 하며 헛디버깅한 적 있음.)
- 서버는 **하나만** 띄워라. 여러 개 뜨면 청크가 꼬여 흰 화면이 된다 → `pkill -f "[n]ext-server"`.

**브라우저**
- `chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })`. `playwright install` 하지 마라.
- 프록시 때문에 브라우저에서 `supabase.co`로 직접 못 나간다(tunnel 끊김). 실데이터 대신 **Playwright
  route로 `**/rest/v1/**`을 가짜 응답으로 채워라.**
  - 응답에 **CORS 헤더**(`access-control-allow-origin: *`)를 꼭 붙여라. 없으면 화면에 데이터가 안 들어온다.
  - **나중에 등록한 route가 우선이다.** catch-all을 먼저, 구체적인 경로를 나중에 등록해라.
  - 스텁 모양은 그 화면의 `.select(...)`를 그대로 따라 만들어라(중첩 select는 중첩 객체로).

**좁은 화면(모바일) 확인**
- 뷰포트 390px로 열고 `scrollWidth > clientWidth + 2`인 요소를 세면 가로 스크롤이 그대로 잡힌다.
- 라이트/다크 둘 다(`colorScheme`) 봐라.

## 11. 자주 하는 실수 (피해라)
- 새 DB 객체에 anon 권한 안 주기 → 화면 깨짐.
- `database.types.ts`를 손으로 고치기 → 재생성으로만 갱신.
- 빌드에 `--turbopack`/`--webpack` 붙이기 → Next 14에선 에러/불필요.
- 실패를 toast 없이 console.error로만 처리 → 사용자는 "아무 일도 안 일어난" 줄 안다.
- 확인할 수 있는데 "UI 테스트 못 함"으로 넘기기 → §10 대로 띄워서 봐라.
- 조사하면 알 수 있는 걸 PO에게 되묻기 → §8.
