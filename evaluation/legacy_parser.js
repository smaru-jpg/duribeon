// =====================================================================
// legacy_parser.js — LLM(Gemini) 도입 "이전"의 규칙·키워드·점수 기반 파서
//
// 출처: src/CNUNavigator.jsx @ commit 260d8e5 (Gemini 도입 직전 상태)
//   - expandSyn / STOPWORD / tokenize / scoreRoom / scoreBuilding /
//     smartSearch / bestMatch : 매칭 엔진 (현재 코드와 바이트 단위 동일함을 확인)
//   - findOriginInText / splitFromTo : 출발지·목적지 분리 로직 (도입 전 버전)
//
// ⚠ 요구사항 13: 이 파일은 도입 전 알고리즘을 "그대로" 재현한다.
//    Gemini·새 fallback·개선된 정규화 등 도입 후 요소를 절대 섞지 않는다.
//    데이터(BUILDINGS/ORIGINS/SYNONYM)만 공유 모듈에서 상수로 가져와
//    두 방식이 동일 DB 위에서 비교되도록 한다(건물명 집합·SYNONYM·엔진은
//    도입 전과 동일함이 확인됨).
// =====================================================================

import { BUILDINGS, ORIGINS, SYNONYM } from "./duribeon_data.js";

// ── 이하 함수들은 원본에서 그대로 옮긴 것 (verbatim) ──────────────
function expandSyn(s) {
  let r = s;
  for (const [k, v] of Object.entries(SYNONYM)) {
    r = r.replace(new RegExp(k + "(?!학)", "g"), v);
  }
  if (/메카(?!트로)/.test(r)) r = r.replace(/메카(?!트로)/g, "메카트로닉스");
  return r;
}

const STOPWORD =
  /^(가고|싶어|싶어요|가고싶어|가는|길|어떻게|가|좀|어디|위치|찾아|알려|줘|주세요|에서|부터|으로|로|까지|가려면|가자|갈래|이동|경로|있어|있나요|예요|야|에|의|을|를|은|는|이|가|호|호실|실|관|동|교수님|교수|님|좀요|주실래|주세|부탁)$/;

function tokenize(q) {
  const cleaned = expandSyn(q.toLowerCase());
  const roomNums = [...cleaned.matchAll(/\d{3}(?:-\d)?/g)].map((x) => x[0]);
  const words = cleaned
    .split(/[\s,.\/·]+/)
    .map((w) => w.replace(/\d{3}(?:-\d)?/g, "").trim())
    .filter((w) => w.length >= 2 && !STOPWORD.test(w));
  return { roomNums, words };
}

function scoreRoom(r, tk) {
  const rNum = (r.match(/^\d{3}(?:-\d)?/) || [])[0];
  const rName = r.replace(/^\d{3}(?:-\d)?\s*/, "").replace(/\s/g, "").toLowerCase();
  let s = 0;
  if (rNum && tk.roomNums.includes(rNum)) s += 50;
  for (const w of tk.words) if (rName.includes(w)) s += 10;
  return s;
}

function scoreBuilding(b, tk) {
  let score = 0;
  const bldHay = (b.name + b.alias + b.code).replace(/\s/g, "").toLowerCase();

  for (const w of tk.words) {
    if (bldHay.includes(w)) score += 6;
    if (b.code.toLowerCase() === w) score += 15;
  }

  const scoredRooms = b.rooms
    .map((r) => ({ r, rs: scoreRoom(r, tk) }))
    .filter((x) => x.rs > 0)
    .sort((a, c) => c.rs - a.rs);

  if (scoredRooms.length) {
    score += scoredRooms[0].rs;
    score += Math.min(scoredRooms.length, 3);
  }

  return { score, rooms: scoredRooms.map((x) => x.r) };
}

function smartSearch(q) {
  const tk = tokenize(q);
  if (!tk.words.length && !tk.roomNums.length) return [];
  return BUILDINGS
    .map((b) => ({ b, ...scoreBuilding(b, tk) }))
    .filter((x) => x.score > 0)
    .sort((a, c) => c.score - a.score)
    .slice(0, 5);
}

function bestMatch(q) {
  const r = smartSearch(q);
  if (!r.length) return null;
  return { building: r[0].b, room: r[0].rooms[0] || "", rooms: r[0].rooms, all: r };
}

function findOriginInText(t) {
  const s = t.replace(/\s/g, "").toLowerCase();
  if (s.includes("정문")) return ORIGINS.find((o) => o.id === "maingate");
  if (s.includes("쪽문") || s.includes("bhc")) return ORIGINS.find((o) => o.id === "sidegate");
  if (s.includes("서문")) return ORIGINS.find((o) => o.id === "westgate");
  if (s.includes("북문") || s.includes("자운대")) return ORIGINS.find((o) => o.id === "northgate");
  // "수의대" 단독은 목적지(수의과대학)와 충돌하므로 '입구/문'이 붙은 경우만 출발지로 인식
  if (s.includes("수의대입구") || s.includes("수의대문")) return ORIGINS.find((o) => o.id === "vetgate");
  if (s.includes("도서관")) return ORIGINS.find((o) => o.id === "library");
  if (s.includes("1학") || s.includes("일학") || s.includes("학생회관"))
    return ORIGINS.find((o) => o.id === "student1");
  return null;
}

function splitFromTo(t) {
  const m = t.match(/(.+?)(?:에서|부터)\s*(.+)/);
  if (m) return { fromPart: m[1], toPart: m[2] };
  return { fromPart: null, toPart: t };
}

// ── 평가용 래퍼 ────────────────────────────────────────────────
// 원본 handle() 의 "첫 판단"을 대화 상태 없이(one-shot) 그대로 재현한다.
//   - foundOrigin : findOriginInText 결과(교문/도서관/1학만 인식) → label 또는 null
//   - destination : bestMatch 결과 건물명 또는 null
//   - asked_origin: 목적지는 찾았지만 출발지를 못 찾아 "지금 어디 계세요?"를
//                   되물어야 하는 상태 (불필요한 재질문 지표용)
export function parseWithLegacyParser(message) {
  const t = (message || "").trim();
  const { fromPart, toPart } = splitFromTo(t);

  const foundOrigin = fromPart
    ? findOriginInText(fromPart)
    : findOriginInText(t) && !smartSearch(t).length
    ? findOriginInText(t)
    : null;

  const destSource = fromPart ? toPart : t;
  const match = bestMatch(destSource);

  return {
    origin: foundOrigin ? foundOrigin.label : null,
    destination: match ? match.building.name : null,
    asked_origin: !!(match && !foundOrigin),
    status: "SUCCESS",
  };
}

export { smartSearch, bestMatch, findOriginInText, splitFromTo };
