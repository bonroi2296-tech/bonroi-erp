import type { GoogleGenAI } from "@google/genai";

// 주문 분석·출고확인서 분석이 같이 쓰는 Gemini 호출. 두 라우트에 복사돼 있던 걸 모았다.
//
// 모델이 단종되면(404) 다음 모델로 넘어간다. 예전 기본 폴백이던 gemini-2.5-flash 가
// 신규 사용자 대상으로 내려가면서 404 를 냈는데, 그걸 "진짜 오류"로 보고 바로 던져서
// 1순위 모델이 한도(429)에 걸릴 때마다 분석 전체가 실패했다.
const DEFAULT_MODELS = ["gemini-3.5-flash", "gemini-3.6-flash"];

const BUSY = /(503|429|UNAVAILABLE|overload|high demand|RESOURCE_EXHAUSTED|quota)/i;
const RETIRED = /(404|NOT_FOUND|no longer available)/i;

const errText = (e: unknown) => String(e instanceof Error ? e.message : e);

export function isGeminiBusy(e: unknown): boolean {
  return BUSY.test(errText(e));
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

// JSON 응답을 받는다. 모든 모델이 과부하·한도면 잠깐 쉬고 한 바퀴 더 돈다.
export async function generateJson(
  ai: GoogleGenAI,
  parts: Array<Record<string, unknown>>,
  { rounds = 2, pauseMs = 2500 }: { rounds?: number; pauseMs?: number } = {}
): Promise<string> {
  let lastErr: unknown = null;
  for (let round = 0; round < rounds; round++) {
    let onlyDaily = true;
    for (const model of models()) {
      try {
        const config: Record<string, unknown> = { responseMimeType: "application/json", temperature: 0 };
        if (!model.startsWith("gemini-2.0")) config.thinkingConfig = { thinkingBudget: 0 };
        const r = await ai.models.generateContent({ model, contents: [{ role: "user", parts }], config });
        return r.text ?? "";
      } catch (e) {
        lastErr = e;
        if (RETIRED.test(errText(e))) continue;
        if (!BUSY.test(errText(e))) throw e;
        if (!isGeminiDailyQuota(e)) onlyDaily = false;
      }
    }
    // 전부 하루 한도라면 기다려도 소용없다
    if (onlyDaily) break;
    if (round < rounds - 1) await new Promise((r) => setTimeout(r, pauseMs));
  }
  throw lastErr ?? new Error("모델 응답 없음");
}
