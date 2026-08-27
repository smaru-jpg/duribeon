// =====================================================================
// normalize.js — 채점 전용 정규화기 (grading-only canonicalizer)
//
// 목적: 두 시스템(legacy / Gemini)이 "실제로 출력한" 장소 문자열을 캠퍼스
//       표준 명칭(canonical)으로 바꿔서 문자열 표기 차이 때문에 정답이
//       오답으로 처리되는 것을 막는다.
//
// 공정성 원칙 (요구사항 15·16):
//   - 이 함수는 "시스템이 이미 출력한 후보 이름"에만 적용된다.
//   - 정답을 보고 예측을 정답으로 끌어당기지 않는다. 예측과 정답을 각각
//     독립적으로 canonical화한 뒤 비교한다.
//   - legacy가 애초에 뽑지 못한 값(null)은 정규화로도 살아나지 않는다.
//   - 두 시스템에 완전히 동일하게 적용되는 대칭적 유틸리티다.
//
// 사용하는 SYNONYM/expandSyn 은 프로덕션과 동일(그리고 Gemini 도입 전 커밋과
// 바이트 단위 동일)한 값이다. 채점기이지 파서가 아니다.
// =====================================================================

import { BUILDINGS, ORIGINS, SYNONYM } from "./duribeon_data.js";

// 프로덕션과 동일한 축약어 전개 (공대→공과대학 등)
function expandSyn(s) {
  let r = s;
  for (const [k, v] of Object.entries(SYNONYM)) {
    r = r.replace(new RegExp(k + "(?!학)", "g"), v);
  }
  if (/메카(?!트로)/.test(r)) r = r.replace(/메카(?!트로)/g, "메카트로닉스");
  return r;
}

const squeeze = (s) => (s ?? "").toString().replace(/\s+/g, "").toLowerCase();

// 교문류(건물이 아닌 출발지) 표준 키
const GATE_IDS = ["maingate", "sidegate", "westgate", "northgate", "vetgate"];
const GATE_CANON = {
  maingate: "정문",
  sidegate: "쪽문",
  westgate: "서문",
  northgate: "북문",
  vetgate: "수의대입구",
};
// 교문 인식용 키워드 (findOriginInText 와 동일한 사고방식)
const GATE_MATCH = [
  { id: "maingate", keys: ["정문"] },
  { id: "sidegate", keys: ["쪽문", "bhc"] },
  { id: "westgate", keys: ["서문"] },
  { id: "northgate", keys: ["북문", "자운대"] },
  { id: "vetgate", keys: ["수의대입구", "수의대문"] },
];

// 건물 별칭 인덱스: 별칭 토큰(·로 분리) → 건물명
const ALIAS_INDEX = new Map();
for (const b of BUILDINGS) {
  ALIAS_INDEX.set(squeeze(b.name), b.name);
  if (b.code) ALIAS_INDEX.set(squeeze(b.code), b.name);
  if (b.alias) {
    for (const tok of b.alias.split("·")) {
      const key = squeeze(tok);
      // "구 기초1호관" 같은 설명형 별칭은 너무 일반적이지 않게 그대로 등록
      if (key && !ALIAS_INDEX.has(key)) ALIAS_INDEX.set(key, b.name);
    }
  }
}

/**
 * 원시 장소 문자열 → canonical 명칭 (없으면 정리된 원문 그대로, 빈값이면 null)
 */
export function canonicalPlace(raw) {
  if (raw == null) return null;
  let s = raw.toString().trim();
  if (!s || s.toLowerCase() === "null" || s === "-") return null;

  // 1) 교문류 먼저 (건물 매칭보다 우선)
  const sq0 = squeeze(s);
  for (const g of GATE_MATCH) {
    if (g.keys.some((k) => sq0.includes(squeeze(k)))) return GATE_CANON[g.id];
  }

  // 2) 건물 매칭: 축약어 전개 후 공백 제거하여 이름/별칭/코드와 대조
  const expanded = squeeze(expandSyn(s));
  if (ALIAS_INDEX.has(expanded)) return ALIAS_INDEX.get(expanded);

  // 3) 끝의 "앞"/조사 제거 후 재시도 (예: "중앙도서관 앞" → "중앙도서관")
  const noSuffix = expanded.replace(/(앞|근처|쪽|앞에서|에서|앞임|임)$/,"");
  if (noSuffix && ALIAS_INDEX.has(noSuffix)) return ALIAS_INDEX.get(noSuffix);

  // 4) 별칭 토큰이 문자열에 포함되는 경우(가장 긴 것 우선) — 과도매칭 방지 위해 2자 이상만
  let best = null;
  for (const [key, name] of ALIAS_INDEX.entries()) {
    if (key.length >= 2 && expanded.includes(key)) {
      if (!best || key.length > best.key.length) best = { key, name };
    }
  }
  if (best) return best.name;

  // 5) 해석 실패 → 정리된 원문 반환(오답은 오답으로 남는다)
  return s.replace(/\s+/g, " ").trim();
}

// 정답/예측 비교 (둘 다 canonical화 후 비교)
export function samePlace(pred, expected) {
  const p = canonicalPlace(pred);
  const e = canonicalPlace(expected);
  if (p == null || e == null) return false;
  return squeeze(p) === squeeze(e);
}

export { expandSyn, GATE_IDS, ORIGINS };
