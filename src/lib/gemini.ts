import type { GoogleGenAI } from "@google/genai";

// 주문 분석·출고확인서 분석이 같이 쓰는 Gemini 호출. 두 라우트에 복사돼 있던 걸 모았다.
//
// 모델이 단종되면(404) 다음 모델로 넘어간다. 예전 기본 폴백이던 gemini-2.5-flash 가
// 신규 사용자 대상으로 내려가면서 404 를 냈는데, 그걸 "진짜 오류"로 보고 바로 던져서
// 1순위 모델이 한도(429)에 걸릴 때마다 분석 전체가 실패했다.
//
// 폴백을 길게 두는 이유: 무료 등급은 하루 한도가 '모델당'으로 잡히고, 503(과부하)은
// 모델별로 따로 터진다. 앞쪽 순서는 그대로 둬서 평소 분석 결과가 바뀌지 않게 했다.
const DEFAULT_MODELS = [
  "gemini-3.5-flash",
  "gemini-3.6-flash",
  "gemini-3.7-flash",
  "gemini-3.8-flash",
  "gemini-2.5-flash",
  "gemini-3.5-flash-lite",
  "gemini-3.1-flash-lite",
  "gemini-2.5-flash-lite",
];

const BUSY = /(503|429|UNAVAILABLE|overload|high demand|RESOURCE_EXHAUSTED|quota|TIMED_OUT)/i;
const RETIRED = /(404|NOT_FOUND|no longer available)/i;
// thinkingConfig 같은 설정을 안 받는 모델이 있다. 그 모델만 설정 없이 한 번 더 해본다.
const BADCONFIG = /(400|INVALID_ARGUMENT|not supported|unsupported)/i;

// 라우트의 maxDuration 안에서 끝내야 한다. 넘기면 사용자는 안내 문구 대신 504 를 본다.
const BUDGET_MS = 80_000;
// 호출 하나가 늘어지면 예산 검사(호출과 호출 사이)에 걸리지 않고 라우트 제한을 통째로 먹는다.
// 2026-11-26 에 실제로 60초 타임아웃이 났다. 모델 하나당 시간을 끊고 다음 모델로 넘긴다.
const CALL_MS = 25_000;

function callWithTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`TIMED_OUT: ${ms}ms 안에 응답이 없음`)), ms);
    p.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); }
    );
  });
}

const errText = (e: unknown) => String(e instanceof Error ? e.message : e);

export function isGeminiBusy(e: unknown): boolean {
  return BUSY.test(errText(e));
}

export function isGeminiTimeout(e: unknown): boolean {
  return /TIMED_OUT/.test(errText(e));
}

export function isGeminiQuota(e: unknown): boolean {
  return /(429|RESOURCE_EXHAUSTED|quota)/i.test(errText(e));
}

// 무료 등급은 '모델당 하루 20회'라 몇 초 쉬고 다시 해도 안 풀린다. 재시도하면 남은 횟수만 깎인다.
export function isGeminiDailyQuota(e: unknown): boolean {
  return /PerDay/i.test(errText(e));
}

function models(): string[] {
  const env = (process.env.GEMINI_MODEL || "").split(",").map((s) => s.trim()).filter(Boolean);
  return env.length ? env : DEFAULT_MODELS;
}

// JSON 응답을 받는다. 모든 모델이 과부하·한도면 간격을 늘려가며 한 바퀴 더 돈다.
// 503 은 하루 한도를 깎지 않으니 오래 기다려도 손해가 없다.
export async function generateJson(
  ai: GoogleGenAI,
  parts: Array<Record<string, unknown>>,
  { rounds = 3, pauseMs = 3000 }: { rounds?: number; pauseMs?: number } = {}
): Promise<string> {
  const startedAt = Date.now();
  const left = () => BUDGET_MS - (Date.now() - startedAt);
  let lastErr: unknown = null;

  for (let round = 0; round < rounds; round++) {
    let onlyDaily = true;
    for (const model of models()) {
      if (left() <= 0) return bail(lastErr);
      // 설정을 안 받는 모델이면 설정을 빼고 한 번 더
      for (const withThinking of [true, false]) {
        try {
          const config: Record<string, unknown> = { responseMimeType: "application/json", temperature: 0 };
          if (withThinking && !model.startsWith("gemini-2.0")) config.thinkingConfig = { thinkingBudget: 0 };
          const r = await callWithTimeout(
            ai.models.generateContent({ model, contents: [{ role: "user", parts }], config }),
            Math.max(5_000, Math.min(CALL_MS, left()))
          );
          return r.text ?? "";
        } catch (e) {
          lastErr = e;
          if (withThinking && BADCONFIG.test(errText(e))) continue;
          if (RETIRED.test(errText(e))) break;
          if (!BUSY.test(errText(e))) throw e;
          if (!isGeminiDailyQuota(e)) onlyDaily = false;
          break;
        }
      }
    }
    // 전부 하루 한도라면 기다려도 소용없다
    if (onlyDaily) break;
    const wait = pauseMs * 2 ** round;
    if (round < rounds - 1 && left() > wait) await new Promise((r) => setTimeout(r, wait));
    else break;
  }
  return bail(lastErr);
}

function bail(lastErr: unknown): never {
  throw lastErr ?? new Error("모델 응답 없음");
}
