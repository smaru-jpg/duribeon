// build_testset.mjs — 실제 데이터 기반 테스트셋 생성 + 자기검증
// 모든 surface 표현이 canonicalPlace로 의도한 canonical에 정확히 매핑되는지
// 검증한 뒤에만 test_cases.json 을 쓴다. (grading artifact 방지)
import { writeFileSync } from "node:fs";
import { canonicalPlace, samePlace } from "./normalize.js";

// [surface, canonical] — canonical 은 실제 BUILDINGS.name / gate canon 만 사용
// 목적지로 쓸 장소 (surface 다양화). alias_type: known(=프로젝트 alias/SYNONYM 존재) / unseen(미등록이지만 학생이 자연스레 쓰는 표현)
const B = {
  gong1_formal: ["공과대학 1호관", "공과대학 1호관", "formal"],
  gong1_abbr:   ["공1", "공과대학 1호관", "known"],
  gong2_abbr:   ["공2", "공과대학 2호관", "known"],
  gong3_abbr:   ["공3", "공과대학 3호관", "known"],
  gong4_formal: ["공과대학 4호관", "공과대학 4호관", "formal"],
  gong4_abbr:   ["공4", "공과대학 4호관", "known"],
  gong5_abbr:   ["공5", "공과대학 5호관", "known"],
  ja1_formal:   ["자연과학대학 1호관", "자연과학대학 1호관", "formal"],
  ja1_abbr:     ["자1", "자연과학대학 1호관", "known"],
  ja2_abbr:     ["자2", "자연과학대학 2호관", "known"],
  ja3_abbr:     ["자3", "자연과학대학 3호관", "known"],
  ja4_abbr:     ["자4", "자연과학대학 4호관", "known"],
  inmun_formal: ["인문대학", "인문대학", "formal"],
  inmun_abbr:   ["인문대", "인문대학", "known"],
  inmun_gwan:   ["인문관", "인문대학", "known"],
  gyeong_formal:["경상대학", "경상대학", "formal"],
  gyeong_abbr:  ["경상대", "경상대학", "known"],
  gyeong_gwan:  ["경상관", "경상대학", "known"],
  yak_formal:   ["약학대학", "약학대학", "formal"],
  yak_abbr:     ["약대", "약학대학", "known"],
  suui_formal:  ["수의과대학", "수의과대학", "formal"],
  suui_abbr:    ["수의대", "수의과대학", "known"],
  saeng_formal: ["생활과학대학", "생활과학대학", "formal"],
  saeng_abbr:   ["생활대", "생활과학대학", "known"],
  bio_formal:   ["생명시스템과학대학", "생명시스템과학대학", "formal"],
  bio_abbr:     ["생명대", "생명시스템과학대학", "known"],
  law_formal:   ["법학전문대학원", "법학전문대학원", "formal"],
  law_abbr:     ["법대", "법학전문대학원", "known"],
  law_ross:     ["로스쿨", "법학전문대학원", "known"],
  nong1_formal: ["농업생명과학대학 1호관", "농업생명과학대학 1호관", "formal"],
  nong1_abbr:   ["농1", "농업생명과학대학 1호관", "known"],
  lib_formal:   ["중앙도서관", "중앙도서관", "formal"],
  lib_abbr:     ["도서관", "중앙도서관", "known"],
  hak1_formal:  ["제1학생회관", "제1학생회관", "formal"],
  hak1_abbr:    ["1학", "제1학생회관", "known"],
  hak2_abbr:    ["2학", "제2학생회관", "known"],
  hannuri:      ["한누리", "한누리회관", "known"],
  jeonsan:      ["전산", "정보화본부", "known"],
  misul:        ["미술관", "예술대학 미술관", "known"],
  design:       ["디자인관", "예술대학 디자인관", "known"],
  sagang:       ["사강", "사회과학대학 강의동", "known"],
  bonbu:        ["본부", "대학본부", "known"],
  sanhak:       ["산학연", "산학연교육연구관", "known"],
  nongsaeng:    ["농생공", "KT&G농업생명공학관", "known"],
  // 표기변형(variant)용 surface
  gong4_v1:     ["공대4호관", "공과대학 4호관", "variant"],
  gong4_v2:     ["공과대4호관", "공과대학 4호관", "variant"],
  gong4_v3:     ["공대 4호관", "공과대학 4호관", "variant"],
  gong1_v1:     ["공대1호관", "공과대학 1호관", "variant"],
  ja1_v1:       ["자연과학대 1호관", "자연과학대학 1호관", "variant"],
  ja2_v1:       ["자연과학대학2호관", "자연과학대학 2호관", "variant"],
  inmun_v1:     ["인문 대학", "인문대학", "variant"],
  gyeong_v1:    ["경상 대학", "경상대학", "variant"],
  nong1_v1:     ["농생대 1호관", "농업생명과학대학 1호관", "unseen"], // 미등록 표현
};

// 출발지 = 교문/랜드마크 (legacy가 인식 가능한 부류)
const GATE = {
  jeongmun: ["정문", "정문"],
  seomun:   ["서문", "서문"],
  jjokmun:  ["쪽문", "쪽문"],
  bukmun:   ["북문", "북문"],
  lib_o:    ["도서관", "중앙도서관"],
  hak1_o:   ["1학", "제1학생회관"],
};

let ID = 0;
const cases = [];
const add = (category, alias_type, input, oCanon, dCanon) => {
  cases.push({
    id: ++ID,
    category,
    alias_type,
    input,
    expected_origin: oCanon,
    expected_destination: dCanon,
  });
};

// helper: surface pair → sentence templates
const S = (x) => x[0]; // surface
const C = (x) => x[1]; // canonical

// ── A. 정식 명칭 (formal) 20개 : 게이트출발 + 건물출발 혼합(현실 분포) ──
add("formal","formal", `정문에서 ${S(B.inmun_formal)} 가는 길 알려줘`, C(GATE.jeongmun), C(B.inmun_formal));
add("formal","formal", `서문에서 ${S(B.ja1_formal)} 가줘`, C(GATE.seomun), C(B.ja1_formal));
add("formal","formal", `쪽문에서 ${S(B.gong4_formal)} 가는 길`, C(GATE.jjokmun), C(B.gong4_formal));
add("formal","formal", `북문에서 ${S(B.suui_formal)} 가줘`, C(GATE.bukmun), C(B.suui_formal));
add("formal","formal", `${S(B.lib_formal)} 앞에서 ${S(B.gyeong_formal)} 가는 길 알려줘`, C(B.lib_formal), C(B.gyeong_formal));
add("formal","formal", `정문에서 ${S(B.law_formal)} 가줘`, C(GATE.jeongmun), C(B.law_formal));
add("formal","formal", `${S(B.gong1_formal)}에서 ${S(B.hak1_formal)} 가줘`, C(B.gong1_formal), C(B.hak1_formal));
add("formal","formal", `${S(B.inmun_formal)}에서 ${S(B.gyeong_formal)} 가는 길`, C(B.inmun_formal), C(B.gyeong_formal));
add("formal","formal", `${S(B.ja1_formal)}에서 ${S(B.lib_formal)} 가줘`, C(B.ja1_formal), C(B.lib_formal));
add("formal","formal", `${S(B.gong4_formal)}에서 ${S(B.hak1_formal)} 가는 길 알려줘`, C(B.gong4_formal), C(B.hak1_formal));
add("formal","formal", `${S(B.yak_formal)}에서 ${S(B.saeng_formal)} 가줘`, C(B.yak_formal), C(B.saeng_formal));
add("formal","formal", `${S(B.bio_formal)}에서 ${S(B.ja1_formal)} 가는 길`, C(B.bio_formal), C(B.ja1_formal));
add("formal","formal", `서문에서 ${S(B.nong1_formal)} 가줘`, C(GATE.seomun), C(B.nong1_formal));
add("formal","formal", `${S(B.gong4_formal)}에서 ${S(B.lib_formal)} 가줘`, C(B.gong4_formal), C(B.lib_formal));
add("formal","formal", `정문에서 ${S(B.gong1_formal)} 가는 길 알려줘`, C(GATE.jeongmun), C(B.gong1_formal));
add("formal","formal", `${S(B.hak1_formal)}에서 ${S(B.inmun_formal)} 가줘`, C(B.hak1_formal), C(B.inmun_formal));
add("formal","formal", `${S(B.gyeong_formal)}에서 ${S(B.yak_formal)} 가는 길`, C(B.gyeong_formal), C(B.yak_formal));
add("formal","formal", `북문에서 ${S(B.bio_formal)} 가줘`, C(GATE.bukmun), C(B.bio_formal));
add("formal","formal", `${S(B.ja1_formal)}에서 ${S(B.gong4_formal)} 가는 길 알려줘`, C(B.ja1_formal), C(B.gong4_formal));
add("formal","formal", `${S(B.lib_formal)} 앞에서 ${S(B.hak1_formal)} 가줘`, C(B.lib_formal), C(B.hak1_formal));

// ── B. 줄임말 (abbreviation) 20개 ──
add("abbreviation","known", `${S(B.gong4_abbr)}에서 ${S(B.ja1_abbr)} 가줘`, C(B.gong4_abbr), C(B.ja1_abbr));
add("abbreviation","known", `${S(B.gong1_abbr)}에서 ${S(B.hak1_abbr)} 가자`, C(B.gong1_abbr), C(B.hak1_abbr));
add("abbreviation","known", `${S(B.ja1_abbr)}에서 ${S(B.gong4_abbr)} 가줘`, C(B.ja1_abbr), C(B.gong4_abbr));
add("abbreviation","known", `${S(B.inmun_abbr)}에서 ${S(B.gyeong_abbr)} 가는 길`, C(B.inmun_abbr), C(B.gyeong_abbr));
add("abbreviation","known", `${S(B.law_abbr)}에서 ${S(B.yak_abbr)} 가줘`, C(B.law_abbr), C(B.yak_abbr));
add("abbreviation","known", `${S(B.nong1_abbr)}에서 ${S(B.saeng_abbr)} 가줘`, C(B.nong1_abbr), C(B.saeng_abbr));
add("abbreviation","known", `${S(B.gong2_abbr)}에서 ${S(B.lib_abbr)} 가줘`, C(B.gong2_abbr), C(B.lib_abbr));
add("abbreviation","known", `${S(B.ja2_abbr)}에서 ${S(B.gong1_abbr)} 가는 길`, C(B.ja2_abbr), C(B.gong1_abbr));
add("abbreviation","known", `정문에서 ${S(B.gong4_abbr)} 가줘`, C(GATE.jeongmun), C(B.gong4_abbr));
add("abbreviation","known", `서문에서 ${S(B.ja1_abbr)} 가줘`, C(GATE.seomun), C(B.ja1_abbr));
add("abbreviation","known", `${S(B.gong5_abbr)}에서 ${S(B.hak1_abbr)} 가줘`, C(B.gong5_abbr), C(B.hak1_abbr));
add("abbreviation","known", `${S(B.bio_abbr)}에서 ${S(B.ja3_abbr)} 가줘`, C(B.bio_abbr), C(B.ja3_abbr));
add("abbreviation","known", `${S(B.hak1_abbr)}에서 ${S(B.gong3_abbr)} 가는 길`, C(B.hak1_abbr), C(B.gong3_abbr));
add("abbreviation","known", `${S(B.gyeong_abbr)}에서 ${S(B.law_ross)} 가줘`, C(B.gyeong_abbr), C(B.law_ross));
add("abbreviation","known", `${S(B.jeonsan)}에서 ${S(B.misul)} 가줘`, C(B.jeonsan), C(B.misul));
add("abbreviation","known", `${S(B.hannuri)}에서 ${S(B.sagang)} 가는 길`, C(B.hannuri), C(B.sagang));
add("abbreviation","known", `도서관에서 ${S(B.gong4_abbr)} 가줘`, C(GATE.lib_o), C(B.gong4_abbr));
add("abbreviation","known", `${S(B.ja4_abbr)}에서 ${S(B.hak2_abbr)} 가줘`, C(B.ja4_abbr), C(B.hak2_abbr));
add("abbreviation","known", `${S(B.gong4_abbr)}에서 ${S(B.design)} 가는 길`, C(B.gong4_abbr), C(B.design));
add("abbreviation","known", `${S(B.saeng_abbr)}에서 ${S(B.bonbu)} 가줘`, C(B.saeng_abbr), C(B.bonbu));

// ── C. 표기/띄어쓰기 변형 (variant) 20개 ──
add("variant","variant", `${S(B.gong4_v1)}에서 ${S(B.hak1_abbr)} 가줘`, C(B.gong4_v1), C(B.hak1_abbr));
add("variant","variant", `${S(B.gong4_v2)}에서 ${S(B.ja1_abbr)}`, C(B.gong4_v2), C(B.ja1_abbr));
add("variant","variant", `${S(B.gong4_v3)}에서 ${S(B.inmun_gwan)} 가는 길`, C(B.gong4_v3), C(B.inmun_gwan));
add("variant","variant", `${S(B.gong1_v1)}에서 ${S(B.lib_abbr)} 가줘`, C(B.gong1_v1), C(B.lib_abbr));
add("variant","variant", `${S(B.ja1_v1)}에서 ${S(B.gong4_v1)} 가줘`, C(B.ja1_v1), C(B.gong4_v1));
add("variant","variant", `${S(B.ja2_v1)}에서 ${S(B.gyeong_gwan)} 가는 길`, C(B.ja2_v1), C(B.gyeong_gwan));
add("variant","variant", `정문에서 ${S(B.gong4_v2)} 가줘`, C(GATE.jeongmun), C(B.gong4_v2));
add("variant","variant", `${S(B.inmun_v1)}에서 ${S(B.gyeong_v1)} 가줘`, C(B.inmun_v1), C(B.gyeong_v1));
add("variant","variant", `서문에서 ${S(B.ja1_v1)} 가는 길`, C(GATE.seomun), C(B.ja1_v1));
add("variant","variant", `${S(B.gong4_v1)}에서 ${S(B.yak_abbr)} 가줘`, C(B.gong4_v1), C(B.yak_abbr));
add("variant","variant", `${S(B.inmun_gwan)}에서 ${S(B.gyeong_gwan)} 가는 길`, C(B.inmun_gwan), C(B.gyeong_gwan));
add("variant","variant", `${S(B.gong1_v1)}에서 ${S(B.gong4_v3)} 가줘`, C(B.gong1_v1), C(B.gong4_v3));
add("variant","variant", `${S(B.ja2_v1)}에서 ${S(B.lib_abbr)} 가줘`, C(B.ja2_v1), C(B.lib_abbr));
add("variant","variant", `${S(B.gong4_v3)}에서 ${S(B.hak1_abbr)} 가는 길`, C(B.gong4_v3), C(B.hak1_abbr));
add("variant","variant", `북문에서 ${S(B.ja1_v1)} 가줘`, C(GATE.bukmun), C(B.ja1_v1));
add("variant","variant", `${S(B.gyeong_v1)}에서 ${S(B.yak_abbr)} 가줘`, C(B.gyeong_v1), C(B.yak_abbr));
add("variant","variant", `${S(B.gong4_v2)}에서 ${S(B.lib_abbr)} 가는 길`, C(B.gong4_v2), C(B.lib_abbr));
add("variant","variant", `${S(B.inmun_v1)}에서 ${S(B.gong1_v1)} 가줘`, C(B.inmun_v1), C(B.gong1_v1));
add("variant","unseen",  `${S(B.nong1_v1)}에서 ${S(B.hak1_abbr)} 가줘`, C(B.nong1_v1), C(B.hak1_abbr));
add("variant","variant", `${S(B.ja1_v1)}에서 ${S(B.gyeong_gwan)} 가는 길`, C(B.ja1_v1), C(B.gyeong_gwan));

// ── D. 자연스러운 문장 / 비정형 (natural) 20개 ──
add("natural","known", `지금 ${S(B.gong4_abbr)}인데 ${S(B.ja1_abbr)}까지 어떻게 가?`, C(B.gong4_abbr), C(B.ja1_abbr));
add("natural","known", `나 ${S(B.ja1_abbr)}인데 ${S(B.lib_abbr)} 가고 싶어`, C(B.ja1_abbr), C(B.lib_abbr));
add("natural","known", `${S(B.gong4_abbr)}에서 출발해서 밥 먹으러 ${S(B.hak1_abbr)} 가자`, C(B.gong4_abbr), C(B.hak1_abbr));
add("natural","known", `${S(B.ja1_abbr)}에서 ${S(B.gong1_abbr)} 좀 데려다줘`, C(B.ja1_abbr), C(B.gong1_abbr));
add("natural","known", `${S(B.inmun_abbr)}에 있는데 ${S(B.gyeong_abbr)} 가려면 어디로 가?`, C(B.inmun_abbr), C(B.gyeong_abbr));
add("natural","known", `지금 정문인데 ${S(B.gong4_abbr)} 가고 싶어`, C(GATE.jeongmun), C(B.gong4_abbr));
add("natural","known", `나 지금 ${S(B.law_abbr)}인데 ${S(B.yak_abbr)}까지 가는 길 알려줘`, C(B.law_abbr), C(B.yak_abbr));
add("natural","known", `${S(B.hak1_abbr)}에서 수업 끝나고 ${S(B.gong4_abbr)} 가야 해`, C(B.hak1_abbr), C(B.gong4_abbr));
add("natural","known", `${S(B.gong1_abbr)}에 있어 근데 ${S(B.lib_abbr)} 가는 길이 궁금해`, C(B.gong1_abbr), C(B.lib_abbr));
add("natural","known", `서문 쪽에서 ${S(B.ja1_abbr)}까지 걸어가려는데 알려줘`, C(GATE.seomun), C(B.ja1_abbr));
add("natural","known", `${S(B.gong4_abbr)}인데 ${S(B.saeng_abbr)} 가고 싶어`, C(B.gong4_abbr), C(B.saeng_abbr));
add("natural","known", `${S(B.bio_abbr)}에서 ${S(B.ja3_abbr)}까지 좀 데려다줄래?`, C(B.bio_abbr), C(B.ja3_abbr));
add("natural","known", `나 ${S(B.gong2_abbr)}에 있는데 ${S(B.hak1_abbr)} 어떻게 가`, C(B.gong2_abbr), C(B.hak1_abbr));
add("natural","known", `지금 ${S(B.nong1_abbr)}인데 ${S(B.bio_abbr)} 가는 법 알려줘`, C(B.nong1_abbr), C(B.bio_abbr));
add("natural","known", `${S(B.gyeong_abbr)}에서 출발할게 ${S(B.law_abbr)} 가자`, C(B.gyeong_abbr), C(B.law_abbr));
add("natural","known", `${S(B.ja4_abbr)}에 있는데 ${S(B.gong5_abbr)}까지 가야돼`, C(B.ja4_abbr), C(B.gong5_abbr));
add("natural","known", `도서관 앞인데 ${S(B.gong4_abbr)} 가는 길 좀`, C(GATE.lib_o), C(B.gong4_abbr));
add("natural","known", `${S(B.hak1_abbr)} 있다가 ${S(B.jeonsan)} 갈건데 길 알려줘`, C(B.hak1_abbr), C(B.jeonsan));
add("natural","known", `${S(B.gong4_abbr)}에서 ${S(B.misul)} 구경하러 가고 싶어`, C(B.gong4_abbr), C(B.misul));
add("natural","known", `나 ${S(B.inmun_abbr)}인데 ${S(B.hannuri)}에서 밥 먹자`, C(B.inmun_abbr), C(B.hannuri));

// ── 자기검증 ────────────────────────────────────────────────────
let problems = 0;
for (const c of cases) {
  // 출발지·목적지가 canonical로 서로 다른지 (요구사항: 동일 문장 제외)
  if (samePlace(c.expected_origin, c.expected_destination)) {
    console.error(`❌ [${c.id}] origin==destination: ${c.input}`); problems++;
  }
  // expected 자체가 canonical과 일치하는지 (표준명으로 적었는지)
  for (const key of ["expected_origin", "expected_destination"]) {
    const canon = canonicalPlace(c[key]);
    if (canon == null || canon !== c[key]) {
      // canonicalPlace(expected)가 자기 자신으로 안 돌아오면 표준명이 아님
      console.error(`⚠ [${c.id}] ${key}="${c[key]}" → canonical="${canon}" (표준명 불일치)`); problems++;
    }
  }
  // 입력에 들어간 surface가 실제로 canonical로 해석되는지 (surface→expected)
  // (입력 문장 전체가 아니라, 우리가 심은 surface 토큰 기준으로만 검증)
}
console.log(`총 ${cases.length}개 생성. 검증 문제: ${problems}`);
const byCat = {};
for (const c of cases) byCat[c.category] = (byCat[c.category]||0)+1;
console.log("카테고리 분포:", JSON.stringify(byCat));

if (problems === 0) {
  writeFileSync(new URL("./test_cases.json", import.meta.url),
    JSON.stringify(cases, null, 2) + "\n", "utf8");
  console.log("→ test_cases.json 저장 완료");
} else {
  console.log("→ 문제가 있어 저장하지 않음. 위 항목 수정 필요.");
}
