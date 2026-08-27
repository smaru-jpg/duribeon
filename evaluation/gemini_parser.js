// =====================================================================
// gemini_parser.js — 현재(Gemini 도입 후) 의미 해석 방식 평가용 래퍼
//
// 핵심: 프로덕션의 실제 서버 함수(api/chat.js)를 그대로 호출한다.
//   - vite.config.js 의 local-api 플러그인과 동일한 방식으로 가짜 req/res 를
//     만들어 handler(req,res) 를 부른다 → /api/chat 을 띄우지 않아도
//     "실제 프로덕션 파싱 경로"를 그대로 평가한다.
//   - 반환 구조: { parsed: { intent, origin, destination, ready_to_navigate, reply } }
//
// 응답시간·재시도·타임아웃·에러분류(API_ERROR/TIMEOUT/PARSE_ERROR/SUCCESS) 포함.
//
// ⚠ GEMINI_API_KEY 환경변수가 필요하다(.env 또는 export). 키가 없으면
//    handler 가 500을 반환하며 API_ERROR 로 기록된다.
//
// temperature: 프로덕션 parse 모드는 generationConfig 에 temperature 를
//   "설정하지 않음"(Gemini 기본값). 재현성 실험을 원하면 evaluate.js 에서
//   --deterministic 로 parseWithGeminiDeterministic(temperature:0) 을 쓸 수
//   있다. 이 경우에도 프로덕션 파일은 건드리지 않는다(별도 호출 경로).
// =====================================================================

import prodHandler from "../api/chat.js";

const MODEL = "gemini-3.6-flash";
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function makeMockReqRes(message, mode = "parse") {
  const req = { method: "POST", body: { message, mode } };
  let _status = 200;
  const captured = { status: 200, payload: null };
  const res = {
    status(s) { _status = s; captured.status = s; return res; },
    json(data) { captured.payload = data; captured.status = _status; return res; },
    setHeader() {},
    end() {},
  };
  return { req, res, captured };
}

function withTimeout(promise, ms, onTimeout) {
  let t;
  const timeout = new Promise((_, reject) => {
    t = setTimeout(() => reject(Object.assign(new Error("TIMEOUT"), { __timeout: true })), ms);
  });
  return Promise.race([promise.finally(() => clearTimeout(t)), timeout]).catch((e) => {
    if (e && e.__timeout) return onTimeout();
    throw e;
  });
}

// parsed 객체에서 origin/destination 안전 추출
function extractParsed(payload) {
  const parsed = payload && payload.parsed ? payload.parsed : null;
  if (!parsed) return { parsed: null, origin: null, destination: null, ready: null };
  const norm = (v) => (v == null || v === "null" || v === "" ? null : String(v).trim());
  return {
    parsed,
    origin: norm(parsed.origin),
    destination: norm(parsed.destination),
    ready: parsed.ready_to_navigate ?? null,
    intent: parsed.intent ?? null,
  };
}

/**
 * 프로덕션 handler(api/chat.js)를 그대로 호출 — Production Setting Evaluation
 * @returns {origin,destination,ready,intent,status,response_time_ms,attempts,error}
 */
export async function parseWithGemini(message, opts = {}) {
  const { maxRetries = 3, timeoutMs = 15000, baseBackoffMs = 800 } = opts;
  let attempt = 0;
  let lastErr = null;

  while (attempt <= maxRetries) {
    attempt++;
    const start = performance.now();
    try {
      const { req, res, captured } = makeMockReqRes(message, "parse");
      const run = Promise.resolve(prodHandler(req, res));
      let timedOut = false;
      await withTimeout(run, timeoutMs, () => { timedOut = true; });
      const elapsed = performance.now() - start;

      if (timedOut) {
        lastErr = "TIMEOUT";
        if (attempt <= maxRetries) { await sleep(baseBackoffMs * 2 ** (attempt - 1)); continue; }
        return { origin: null, destination: null, ready: null, intent: null,
                 status: "TIMEOUT", response_time_ms: elapsed, attempts: attempt, error: "timeout" };
      }

      const httpStatus = captured.status;
      const payload = captured.payload || {};

      // 서버/네트워크 계열 오류 → 재시도 대상
      if (httpStatus >= 500 || payload.error) {
        lastErr = `API_ERROR ${httpStatus} ${payload.error || ""}`.trim();
        if (attempt <= maxRetries) { await sleep(baseBackoffMs * 2 ** (attempt - 1)); continue; }
        return { origin: null, destination: null, ready: null, intent: null,
                 status: "API_ERROR", response_time_ms: elapsed, attempts: attempt, error: lastErr };
      }

      const { parsed, origin, destination, ready, intent } = extractParsed(payload);
      if (!parsed) {
        // JSON 파싱 실패 = 인식 실패(재시도 X, 오답으로 처리)
        return { origin: null, destination: null, ready: null, intent: null,
                 status: "PARSE_ERROR", response_time_ms: elapsed, attempts: attempt,
                 error: "parsed=null", raw: payload.raw || null };
      }

      return { origin, destination, ready, intent,
               status: "SUCCESS", response_time_ms: elapsed, attempts: attempt, error: null };
    } catch (err) {
      lastErr = String(err && err.message || err);
      const elapsed = performance.now() - start;
      if (attempt <= maxRetries) { await sleep(baseBackoffMs * 2 ** (attempt - 1)); continue; }
      return { origin: null, destination: null, ready: null, intent: null,
               status: "API_ERROR", response_time_ms: elapsed, attempts: attempt, error: lastErr };
    }
  }
  return { origin: null, destination: null, ready: null, intent: null,
           status: "API_ERROR", response_time_ms: 0, attempts: attempt, error: lastErr || "unknown" };
}

/**
 * Deterministic Evaluation (선택) — temperature:0 을 명시적으로 넣어 재현성 확보.
 * 프로덕션 api/chat.js 를 수정하지 않고, 동일한 시스템 프롬프트로 직접 호출한다.
 * (systemText 는 api/chat.js 의 parse 모드와 동일하게 유지)
 */
const PARSE_SYSTEM_TEXT = [
  "너는 충남대학교 대덕캠퍼스 길안내 챗봇 '두리번'의 의도 분석기야.",
  "사용자 문장에서 출발지(origin), 목적지(destination), 의도(intent)를 뽑아라.",
  "origin은 사용자가 출발한다고 말한 장소(예: 정문, 서문, 도서관 등), 없으면 null.",
  "destination은 가려는 건물/학과/호실/교수님 등 목적지 표현, 없으면 null.",
  "intent는 길안내면 'navigation', 그 외 일반 대화면 'chat'.",
  "origin과 destination이 모두 있으면 ready_to_navigate=true, 아니면 false.",
  "너는 좌표나 실제 경로를 만들지 마라. 장소 이름만 그대로 뽑아라.",
  "반드시 아래 형식의 JSON 하나만 출력해라. 설명, 인사, 마크다운(```), 다른 텍스트 절대 금지.",
  '{"intent":"navigation|chat","origin":"문자열 또는 null","destination":"문자열 또는 null","ready_to_navigate":true|false,"reply":"사용자에게 보여줄 짧은 한국어 안내 문장"}',
].join("\n");

export async function parseWithGeminiDeterministic(message, opts = {}) {
  const { maxRetries = 3, timeoutMs = 15000, baseBackoffMs = 800, temperature = 0 } = opts;
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return { origin: null, destination: null, ready: null, intent: null,
             status: "API_ERROR", response_time_ms: 0, attempts: 0, error: "GEMINI_API_KEY 없음" };
  }
  let attempt = 0, lastErr = null;
  while (attempt <= maxRetries) {
    attempt++;
    const start = performance.now();
    try {
      const controller = new AbortController();
      const to = setTimeout(() => controller.abort(), timeoutMs);
      const geminiRes = await fetch(GEMINI_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: PARSE_SYSTEM_TEXT }] },
          contents: [{ role: "user", parts: [{ text: message }] }],
          generationConfig: { responseMimeType: "application/json", temperature },
        }),
        signal: controller.signal,
      }).finally(() => clearTimeout(to));
      const elapsed = performance.now() - start;

      if (!geminiRes.ok) {
        lastErr = `API_ERROR ${geminiRes.status}`;
        if (attempt <= maxRetries) { await sleep(baseBackoffMs * 2 ** (attempt - 1)); continue; }
        return { origin: null, destination: null, ready: null, intent: null,
                 status: "API_ERROR", response_time_ms: elapsed, attempts: attempt, error: lastErr };
      }
      const data = await geminiRes.json();
      const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
      const cleaned = raw.replace(/```json|```/g, "").trim();
      let parsed = null;
      try { parsed = JSON.parse(cleaned); } catch { parsed = null; }
      if (!parsed) {
        return { origin: null, destination: null, ready: null, intent: null,
                 status: "PARSE_ERROR", response_time_ms: elapsed, attempts: attempt, error: "parsed=null", raw };
      }
      const { origin, destination, ready, intent } = extractParsed({ parsed });
      return { origin, destination, ready, intent,
               status: "SUCCESS", response_time_ms: elapsed, attempts: attempt, error: null };
    } catch (err) {
      const elapsed = performance.now() - start;
      const isAbort = err && err.name === "AbortError";
      lastErr = isAbort ? "TIMEOUT" : String(err && err.message || err);
      if (attempt <= maxRetries) { await sleep(baseBackoffMs * 2 ** (attempt - 1)); continue; }
      return { origin: null, destination: null, ready: null, intent: null,
               status: isAbort ? "TIMEOUT" : "API_ERROR", response_time_ms: elapsed, attempts: attempt, error: lastErr };
    }
  }
  return { origin: null, destination: null, ready: null, intent: null,
           status: "API_ERROR", response_time_ms: 0, attempts: attempt, error: lastErr || "unknown" };
}
