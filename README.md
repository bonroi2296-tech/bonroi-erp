# 본로이 ERP

의료소모품 유통(본로이)의 사내 통합 관리 시스템입니다. 병원별 주문/발주, 품목·벤더 마스터, 단가 비교, 공급망 모니터링, 거래명세서(엑셀) 생성을 제공합니다.

## 기술 스택

- **Next.js 14** (App Router) + **TypeScript**
- **Tailwind CSS** — UI
- **Supabase** (PostgreSQL) — 데이터 저장
- **ExcelJS** — 거래명세서 생성

## 시작하기

### 1. 환경변수 설정

`.env.example`을 복사해 `.env.local`을 만들고 Supabase 값을 채웁니다.

```bash
cp .env.example .env.local
```

| 변수 | 설명 |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase 프로젝트 URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon(public) 키 |

> anon 키는 브라우저에 노출되는 공개 키입니다. 데이터 접근 통제는 **반드시 Supabase RLS 정책**으로 합니다.

### 2. 의존성 설치 및 실행

```bash
npm install
npm run dev
```

[http://localhost:3000](http://localhost:3000) 에서 확인합니다.

## 스크립트

| 명령 | 설명 |
| --- | --- |
| `npm run dev` | 개발 서버 |
| `npm run build` | 프로덕션 빌드 |
| `npm run start` | 프로덕션 서버 |
| `npm run lint` | ESLint |

## 주요 화면 (`src/app/(main)`)

- `dashboard` — 현황 요약(주문/마진/월 비교/지점별)
- `orders` / `order-history` — 주문 등록·조회
- `products` / `vendors` — 품목·벤더 마스터
- `price-compare` — 벤더별 단가 비교 및 가격 변동 이력
- `supply-monitor` — 공급망 모니터링(이행추적/가격변동/공급리스크)
- `purchase` / `returns` — 발주·반품 관리
- `documents` — 월별 거래명세서 엑셀 생성 (`/api/invoice`)

## 데이터베이스

스키마 변경/RLS 정책 등 SQL 마이그레이션은 `supabase/migrations/`에 보관합니다. 적용 방법은 해당 디렉터리의 SQL 주석을 참고하세요.
