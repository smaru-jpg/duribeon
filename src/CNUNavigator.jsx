import React, { useState, useRef, useEffect } from "react";
import { routeOnCampusGraph } from "./campusGraph";

// 노드 좌표 수집 모드: true면 지도 클릭 시 콘솔(F12)에 좌표가 출력된다.
// 그래프 데이터(src/campusGraph.js)를 다 채운 뒤 false로 끌 것.
const COLLECT_MODE = false;

// ── Gemini 대화 호출 (서버 함수 /api/chat 경유) ──────────────
// 기존 규칙/점수 검색이 못 알아들은 문장만 Gemini에게 넘겨 자연스러운 답을 받는다.
// 실제 건물/호실/좌표/경로는 여전히 기존 두리번 데이터가 담당한다.
async function askGemini(userText) {
  try {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message:
          "너는 충남대학교 대덕캠퍼스 길안내 챗봇 '두리번'이야. " +
          "친근하고 간결하게 한국어로 답해줘. 캠퍼스에 없는 건물이나 정확하지 않은 위치는 지어내지 마. " +
          "사용자 메시지: " + userText,
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.reply || null;
  } catch {
    return null;
  }
}

// ── Gemini 의도 분석 호출 (JSON parse 모드) ──────────────────
// 서버(/api/chat, mode:"parse")가 문장에서 출발지·목적지·의도를 뽑아 JSON으로 돌려준다.
// 반환 예: { intent, origin, destination, ready_to_navigate, reply }
// 실제 장소 검증/좌표/경로는 이 JSON을 받아 기존 두리번 DB가 담당한다.
async function askGeminiParse(userText) {
  try {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: userText, mode: "parse" }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.parsed || null;
  } catch {
    return null;
  }
}

// ════════════════════════════════════════════════════════════
// 충남대학교 대덕캠퍼스 두리번 (CNU Campus Navigator)
// 지도 기반 1차 버전
// - 출발지/목적지 핀은 카카오맵 장소검색 결과만 사용
// - 두리번은 자연어 해석/건물·호실 매칭 담당
// - 두리번 전용 경로 라인은 추후 추가
// ════════════════════════════════════════════════════════════

// ── 건물 데이터 (공식 건물코드 기준) ──────────────────────────
const BUILDINGS = [
  // ─ 정문/중앙(E zone 남부) ─
  {
    code: "E1-2",
    name: "정심화국제문화회관",
    alias: "정심화·백마홀",
    x: 50,
    y: 74,
    zone: "center",
    rooms: ["정심화홀(대공연장)", "백마홀(중공연장)", "대덕홀(세미나)"],
  },
  {
    code: "E1-1",
    name: "국제교류본부·국제언어교육센터",
    alias: "국제교류본부",
    x: 41,
    y: 71,
    zone: "center",
    rooms: ["국제교류본부", "국제언어교육센터", "외국인 유학생 지원"],
  },
  {
    code: "E1-3",
    name: "자연사박물관",
    alias: "자연사박물관",
    x: 35,
    y: 76,
    zone: "center",
    rooms: ["상설전시관", "기획전시실"],
  },

  // ─ 서쪽(W zone) 공대·자연대·인문·사회 ─
  {
    code: "W3",
    name: "공과대학 1호관",
    alias: "공1",
    x: 22,
    y: 58,
    zone: "eng",
    rooms: ["기계공학부", "101 대강의실", "강의실 다수", "산업대학원"],
  },
  {
    code: "W2",
    name: "공과대학 5호관",
    alias: "공5·공학교육실습관",
    x: 16,
    y: 50,
    zone: "eng",
    rooms: ["공학교육실습관", "실습실", "에너지과학기술대학원(W1)"],
  },
  {
    code: "W1",
    name: "산학연교육연구관",
    alias: "산학연",
    x: 12,
    y: 44,
    zone: "eng",
    rooms: ["산학협력단", "에너지과학기술대학원", "연구실"],
  },
  {
    code: "W5",
    name: "자연과학대학 1호관",
    alias: "자1",
    x: 26,
    y: 47,
    zone: "sci",
    rooms: ["수학과", "정보통계학과", "강의실"],
  },
  {
    code: "W4",
    name: "자연과학대학 2호관",
    alias: "자2",
    x: 30,
    y: 52,
    zone: "sci",
    rooms: ["물리학과", "천문우주과학과", "사범대 일부(사범2)"],
  },
  {
    code: "W11-1",
    name: "자연과학대학 3호관",
    alias: "자3·구 기초1호관",
    x: 28,
    y: 40,
    zone: "sci",
    rooms: ["화학과", "생화학과", "지질환경과학과", "하나은행 ATM"],
  },
  {
    code: "W11-2",
    name: "자연과학대학 4호관",
    alias: "자4·구 기초2호관",
    x: 24,
    y: 36,
    zone: "sci",
    rooms: ["해양환경과학과", "강의실", "실험실"],
  },
  {
    code: "W6",
    name: "약학대학",
    alias: "약학관",
    x: 36,
    y: 42,
    zone: "sci",
    rooms: ["약학과", "강의실", "약초원(W13)"],
  },
  {
    code: "W7",
    name: "인문대학",
    alias: "인문관",
    x: 33,
    y: 33,
    zone: "hum",
    rooms: ["국어국문학과", "영어영문학과", "사학과", "철학과", "강의실 다수"],
  },
  {
    code: "W12-1",
    name: "사회과학대학 본관",
    alias: "사회과학관",
    x: 20,
    y: 28,
    zone: "soc",
    rooms: ["행정학부", "정치외교학과", "사회학과", "심리학과"],
  },
  {
    code: "W12-2",
    name: "사회과학대학 강의동",
    alias: "사강",
    x: 16,
    y: 32,
    zone: "soc",
    rooms: ["강의실", "세미나실"],
  },
  {
    code: "W15",
    name: "글로벌인재양성센터",
    alias: "사범대·교육대학원·국제학부",
    x: 40,
    y: 30,
    zone: "hum",
    rooms: ["사범대학", "교육대학원", "국제학부"],
  },
  {
    code: "W10",
    name: "백마교양교육관",
    alias: "백마교양관",
    x: 38,
    y: 55,
    zone: "hum",
    rooms: ["교양 강의실 다수", "대형 강의실"],
  },
  {
    code: "W8-2",
    name: "제1학생회관",
    alias: "1학·1학생회관",
    x: 30,
    y: 62,
    lat: 36.367861,
    lng: 127.343056,
    zone: "student",
    rooms: ["학생식당(1학)", "매점", "편의시설"],
  },
  {
    code: "W8-1",
    name: "한누리회관",
    alias: "한누리",
    x: 34,
    y: 64,
    zone: "student",
    rooms: ["대강당", "회의실", "행사장"],
  },
  {
    code: "W9",
    name: "공동실험실습관",
    alias: "공동",
    x: 20,
    y: 44,
    zone: "eng",
    rooms: ["공용 실험장비", "연구지원시설"],
  },
  {
    code: "W14",
    name: "노천극장",
    alias: "노천극장",
    x: 14,
    y: 24,
    zone: "etc",
    rooms: ["야외공연장", "행사장"],
  },

  // ─ 중앙·동쪽(E zone) ─
  {
    code: "E2",
    name: "공과대학 2호관",
    alias: "공2",
    x: 58,
    y: 58,
    zone: "eng",
    rooms: ["전기·전자공학", "자유전공학부", "분석과학기술대학원", "강의실"],
  },
  {
    code: "E3",
    name: "공과대학 3호관",
    alias: "공3",
    x: 63,
    y: 54,
    zone: "eng",
    rooms: ["건축·토목", "강의실", "실습실"],
  },
  {
    code: "E4",
    name: "공과대학 4호관",
    alias: "공4·기계공학부·메카트로닉스공학과",
    x: 67,
    y: 58,
    zone: "eng",
    rooms: [
      "105 학생회실",
      "106 유체공학실험실",
      "106-1 지속가능 열공학·관리 연구실",
      "106-2 지속가능 열공학·관리 실험실",
      "107 유체공학실험준비실",
      "108 일반강의실",
      "109 재료강도실험실",
      "109-1 신뢰성평가실험실",
      "212 일반강의실",
      "213 창의인재상담실",
      "214 기계공학부사무실",
      "216 문헌정보실",
      "216-1 산학융합이노베이션룸",
      "219 연소 및 추진실험실",
      "219-1 열유체자료실",
      "219-2 동역학 및 제어시스템실험실",
      "220 열유체실험실습실",
      "221 신원규 교수연구실",
      "222 김홍집 교수연구실",
      "223 김용훈 교수연구실",
      "224 이원균 교수연구실",
      "225 생산시스템제어연구실",
      "226 박승환 교수연구실",
      "227 특수가공자료실",
      "228 기술정보실",
      "229 첨단기계설계실",
      "308 전산유체설계실",
      "308-1 전산유체실험실",
      "309 구조역학설계 연구실",
      "309-1 구조 및 재료 설계 실험실",
      "310 회의실",
      "311 일반강의실",
      "313 기초역학실습실",
      "315 생산 및 로봇설계실",
      "315-1 생산 및 로봇연구실",
      "316 창의공학세미나실",
      "317 시청각강의실",
      "318 기계공학부 컴퓨터실1",
      "319 레이저 통합 제조 및 공학 연구실",
      "320 에너지변환시스템실험준비실",
      "321 친환경차량제어연구실",
      "322 ASPEN 해석컴퓨터실",
      "323 유상석 교수연구실",
      "324 조성진 교수연구실",
      "325 김병재 교수연구실",
      "326 오동호 교수연구실",
      "327 남한구 교수연구실",
      "328 오진우 교수연구실",
      "329 김용하 교수연구실",
      "330 친환경차량제어자료실",
      "408 첨단로봇시스템실험실",
      "408-1 첨단나노로봇시스템연구실",
      "409 CAD/CAM실험실",
      "409-1 지능설계실험실",
      "410 파동 및 구조설계실험실",
      "411 기계설계정보실",
      "412 학생회실",
      "413 기계공학부 컴퓨터실2",
      "414 시청각강의실",
      "415 컴퓨터설계실습실",
      "416 일반강의실",
      "417 세미나실",
      "418 김윤영 교수연구실",
      "420 정원석 교수연구실",
      "421 이경민 교수연구실",
      "422 이중석 교수연구실",
      "423 장성민 교수연구실",
      "424 정덕현 교수연구실",
      "425 고성호 교수연구실",
      "426 박상호 교수연구실",
      "515 기계역학실험실",
      "515-1 복합재구조및설계최적화연구실",
      "606 레이저열공학연구실",
      "606-1 레이저광계측실험실",
      "709 일반강의실",
      "711 바이오기계설계실험실",
      "712 기계재료실험실",
      "211 메카트로닉스실험실",
      "508 기전시스템실험실",
      "509 지능형생산실험실",
      "510 지능시스템 및 감성공학실험실",
      "511 전산역학준비실",
      "512 열유체제어공학실험실",
      "514 영상시스템연구실",
      "514-1 영상시스템실험실",
      "516 산학융합지원실",
      "517 메카트로닉스공학과사무실",
      "518 AI·로보틱스준비실",
      "520 지능다물체동역학연구실",
      "521 지능제어및로보틱스연구실",
      "522 안미치코 교수연구실",
      "523 박진성 교수연구실",
      "524 노명규 교수연구실",
      "525 김도영 교수연구실",
      "526 정슬 교수연구실",
      "527 고윤호 교수연구실",
      "528 한성지 교수연구실",
      "530 양석조 교수연구실",
      "531 연구교수실",
      "607 메카트로닉스실습실",
      "608 지능로봇실습실",
      "609 Capstone Design 제작실",
      "610 메카트로닉스공학과학생회실",
      "611 시청각강의실",
      "612 일반강의실",
      "613 메카트로닉스공학과컴퓨터실",
      "707 생체공학실험실",
      "708 대학원세미나실",
      "710 일반강의실",
      "215 공무직 휴게실(여)",
      "217 네트워크장비실",
      "218 공무직 휴게실(남)",
      "513 휴게실",
      "706 학생과제도서실",
    ],
  },
  {
    code: "E5",
    name: "제2학생회관",
    alias: "2학·인재개발원",
    x: 56,
    y: 66,
    lat: 36.365978,
    lng: 127.345767,
    zone: "student",
    rooms: ["학생식당(2학)", "인재개발원(취업)", "헌혈의 집", "매점"],
  },
  {
    code: "E5-1",
    name: "융합교육혁신센터",
    alias: "Inno-Factory·창의융합대학",
    x: 52,
    y: 62,
    zone: "student",
    rooms: ["창의융합대학(203·204호)", "융합 강의실"],
  },
  {
    code: "E6",
    name: "경상대학",
    alias: "경상관",
    x: 64,
    y: 46,
    zone: "soc",
    rooms: ["경영학부", "경제학과", "무역학과", "경N·경S·경W"],
  },
  {
    code: "E7",
    name: "대학본부",
    alias: "본부·행정",
    x: 56,
    y: 40,
    zone: "admin",
    rooms: ["총장실", "교무처", "학생처", "입학본부", "행정 부서"],
  },
  {
    code: "E8",
    name: "KT&G농업생명공학관",
    alias: "농생공",
    x: 70,
    y: 40,
    zone: "agri",
    rooms: ["응용생물학", "식품공학", "강의실"],
  },
  {
    code: "E10-1",
    name: "농업생명과학대학 1호관",
    alias: "농1",
    x: 74,
    y: 34,
    zone: "agri",
    rooms: ["농학과", "원예학과", "강의실"],
  },
  {
    code: "E10-2",
    name: "농업생명과학대학 2·3호관",
    alias: "농2·농3",
    x: 78,
    y: 38,
    zone: "agri",
    rooms: ["산림환경자원학과", "동물자원과학부", "지역환경토목학과"],
  },
  {
    code: "E9",
    name: "상록회관",
    alias: "제4학생회관",
    x: 72,
    y: 48,
    zone: "student",
    rooms: ["식당", "편의시설", "회의실"],
  },

  // ─ 북쪽(N zone) ─
  {
    code: "N1",
    name: "중앙도서관",
    alias: "도서관·창조학술정보관",
    x: 50,
    y: 30,
    zone: "lib",
    rooms: ["1층 종합열람실", "자료실", "그룹스터디룸", "전자정보실"],
  },
  {
    code: "N2",
    name: "정보화본부",
    alias: "전산",
    x: 56,
    y: 26,
    zone: "admin",
    rooms: ["정보화본부", "전산교육관(N2-1)", "헬프데스크"],
  },
  {
    code: "N11",
    name: "생명시스템과학대학",
    alias: "생명관",
    x: 60,
    y: 20,
    zone: "agri",
    rooms: ["생물과학과", "미생물·분자생명과학과", "동물실험센터"],
  },
  {
    code: "N12",
    name: "법학전문대학원",
    alias: "법전원",
    x: 52,
    y: 16,
    zone: "soc",
    rooms: ["로스쿨 강의실", "모의법정", "지적재산권교육연구센터"],
  },
  {
    code: "N9-1",
    name: "예술대학 미술관",
    alias: "미술관",
    x: 42,
    y: 20,
    zone: "art",
    rooms: ["회화과", "조소과", "전시실"],
  },
  {
    code: "N9-2",
    name: "예술대학 디자인관",
    alias: "디자인관",
    x: 38,
    y: 24,
    zone: "art",
    rooms: ["디자인창의학과", "실기실", "강의실"],
  },
  {
    code: "N10-1",
    name: "예술대학 음악관",
    alias: "음악1·2호관",
    x: 44,
    y: 15,
    zone: "art",
    rooms: ["음악과", "관현악", "오케스트라홀", "연습실"],
  },
  {
    code: "N13-1",
    name: "수의과대학",
    alias: "수의학관",
    x: 68,
    y: 14,
    zone: "vet",
    rooms: ["수의학과", "강의실", "동물병원(N13-2)"],
  },
  {
    code: "N14",
    name: "생활과학대학",
    alias: "생활관",
    x: 64,
    y: 10,
    zone: "hum",
    rooms: ["식품영양학과", "의류학과", "소비자학과", "아동·주거"],
  },
  {
    code: "N15",
    name: "실내체육관",
    alias: "체육관·스포렉스",
    x: 30,
    y: 16,
    zone: "etc",
    rooms: ["체육관", "헬스장", "댄스스포츠장", "스포렉스 수영장"],
  },
  {
    code: "N5-1",
    name: "학생생활관(기숙사)",
    alias: "대덕관·기숙사",
    x: 22,
    y: 12,
    zone: "dorm",
    rooms: ["대덕관", "이인구인재관(N5-2)", "생활관 행정실"],
  },
  {
    code: "N8",
    name: "박물관",
    alias: "박물관",
    x: 36,
    y: 12,
    zone: "art",
    rooms: ["전시실", "수장고"],
  },

  // ── 수집 목적지 (운동장 등, 좌표 직접 지정) ──────────
  // lat/lng가 있으면 카카오 검색을 건너뛰고 이 좌표로 바로 핀을 찍는다.
  { code: "SP-S",  name: "남부운동장",      alias: "남부운동장",                         lat: 36.364567, lng: 127.344524, zone: "etc", rooms: [] },
  { code: "SP-C",  name: "종합운동장",      alias: "종합운동장·대운동장",                lat: 36.373206, lng: 127.342570, zone: "etc", rooms: [] },
  { code: "SP-N",  name: "북부운동장",      alias: "북부운동장",                         lat: 36.375027, lng: 127.342364, zone: "etc", rooms: [] },
  { code: "SP-FT", name: "풋살장·테니스장", alias: "풋살장·테니스장·테니스코트",         lat: 36.374591, lng: 127.343387, zone: "etc", rooms: [] },
  { code: "SP-R",  name: "학군단운동장",    alias: "학군단운동장·학군단",                lat: 36.372038, lng: 127.347510, zone: "etc", rooms: [] },
  { code: "SP-A",  name: "농대운동장",      alias: "농대운동장·농업생명과학대학 운동장", lat: 36.368315, lng: 127.351059, zone: "etc", rooms: [] },

  // ── 수집 목적지 (건물·시설) ──────────
  { code: "HRD",  name: "인재개발원",   alias: "인재개발원·인재개발원본부",  lat: 36.365978, lng: 127.345767, zone: "admin",   rooms: [] },
  { code: "W8-3", name: "제3학생회관",  alias: "3학·제3학생회관",           lat: 36.371434, lng: 127.344688, zone: "student", rooms: [] },
];

// ── 출발 지점 후보 ─────────────────────────────────────────
// 교문은 카카오 장소검색 오류를 피하기 위해 직접 수집한 좌표(lat/lng)를 사용한다.
// lat/lng가 있으면 검색을 건너뛰고 이 좌표로 바로 핀을 찍는다.
const ORIGINS = [
  { id: "maingate",  label: "정문",           lat: 36.362331, lng: 127.344859, x: 50, y: 92 },
  { id: "sidegate",  label: "쪽문",           lat: 36.363234, lng: 127.347476, x: 60, y: 88 },
  { id: "westgate",  label: "서문",           lat: 36.369873, lng: 127.340371, x: 8,  y: 56 },
  { id: "northgate", label: "북문(자운대방면)", lat: 36.365875, lng: 127.351965, x: 90, y: 50 },
  { id: "vetgate",   label: "수의대입구",      lat: 36.376914, lng: 127.342597, x: 40, y: 4 },
  { id: "library",   label: "중앙도서관 앞", lat: 36.369880, lng: 127.345907, x: 50, y: 30 },
  { id: "student1",  label: "제1학생회관 앞", lat: 36.367896, lng: 127.343179, x: 30, y: 62 },
];

const ROUTE_TIPS = {
  shade: "🌳 그늘이 많은 길 요청으로 이해했어요. 경로 엔진은 다음 단계에서 붙일 수 있어요.",
  indoor: "🏢 실내 이동 위주 요청으로 이해했어요. 실내 우회 경로는 다음 단계에서 붙일 수 있어요.",
  quiet: "🚶 한산한 길 요청으로 이해했어요. 혼잡 회피 경로는 다음 단계에서 붙일 수 있어요.",
  fast: "⚡ 빠른 길 요청으로 이해했어요. 현재는 우선 지도 기반 위치 확인에 집중한 버전이에요.",
};

// ── 축약어 동의어 사전 ──────────────────────────────────────
const SYNONYM = {
  공대: "공과대학",
  사회대: "사회과학대학",
  자연대: "자연과학대학",
  인문대: "인문대학",
  경상대: "경상대학",
  농대: "농업생명과학대학",
  생활대: "생활과학대학",
  수의대: "수의과대학",
  약대: "약학대학",
  예대: "예술대학",
  사대: "사범대학",
  법대: "법학전문대학원",
  로스쿨: "법학전문대학원",
  생명대: "생명시스템과학대학",
  캡스톤: "capstone",
};

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

function searchBuildings(q) {
  return smartSearch(q).map((x) => x.b);
}

function bestMatch(q) {
  const r = smartSearch(q);
  if (!r.length) return null;
  return { building: r[0].b, room: r[0].rooms[0] || "", rooms: r[0].rooms, all: r };
}

const ZONE_COLOR = {
  eng: "#c75c3c",
  sci: "#3a8f8f",
  hum: "#7b5ea7",
  soc: "#4a6db5",
  admin: "#5a6478",
  agri: "#5f9a45",
  art: "#cc5d8a",
  lib: "#c79a3a",
  vet: "#3f8f6a",
  dorm: "#a06b3a",
  student: "#d4823a",
  center: "#888",
  etc: "#9aa0a8",
};

// ════════════════ Kakao Map ─═══════════════
const KAKAO_MAP_KEY = import.meta.env.VITE_KAKAO_MAP_KEY;

function loadKakaoMap() {
  return new Promise((resolve, reject) => {
    if (!KAKAO_MAP_KEY) {
      reject(new Error("Kakao Map API key is missing"));
      return;
    }

    if (window.kakao && window.kakao.maps) {
      window.kakao.maps.load(() => resolve(window.kakao));
      return;
    }

    const existingScript = document.querySelector("script[data-kakao-map='true']");
    if (existingScript) {
      existingScript.addEventListener("load", () => {
        window.kakao.maps.load(() => resolve(window.kakao));
      });
      existingScript.addEventListener("error", () => reject(new Error("Kakao Map SDK load failed")));
      return;
    }

    const script = document.createElement("script");
    script.dataset.kakaoMap = "true";
    script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${encodeURIComponent(
      KAKAO_MAP_KEY
    )}&libraries=services&autoload=false`;
    script.async = true;

    script.onload = () => {
      window.kakao.maps.load(() => resolve(window.kakao));
    };

    script.onerror = () => reject(new Error("Kakao Map SDK load failed"));
    document.head.appendChild(script);
  });
}

function originQueryOf(origin) {
  if (!origin) return "충남대학교 정문";
  return origin.searchLabel || `충남대학교 ${origin.label.replace(/\(.*?\)/g, "").trim()}`;
}

function buildingQueriesOf(building) {
  if (!building) return ["충남대학교"];
  const arr = [
    `충남대학교 ${building.name}`,
    building.alias ? `충남대학교 ${building.alias}` : "",
    `충남대학교 ${building.code}`,
    `충남대학교 ${building.name} ${building.code}`,
  ].filter(Boolean);

  return [...new Set(arr)];
}

// OSRM 공개 서버(키 불필요)로 도보 경로 좌표열을 받아온다.
// 실패 시 null 반환 → 기존 직선 폴백.
async function fetchWalkingRoute(o, d) {
  try {
    const url =
      `https://routing.openstreetmap.de/routed-foot/route/v1/foot/` +
      `${o.lng},${o.lat};${d.lng},${d.lat}?overview=full&geometries=geojson`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const json = await res.json();
    if (json.code !== "Ok" || !json.routes?.length) return null;
    const route = json.routes[0];
    return {
      coords: route.geometry.coordinates, // [lng, lat] 배열
      distance: route.distance, // m
      duration: route.duration, // s
    };
  } catch {
    return null;
  }
}

function KakaoSearchMap({ origin, building }) {
  const mapRef = useRef(null);
  const [mapError, setMapError] = useState("");

  useEffect(() => {
    let cancelled = false;
    let cleanupItems = [];

    async function initMap() {
      try {
        setMapError("");
        const kakao = await loadKakaoMap();
        if (cancelled || !mapRef.current) return;

        const defaultCenter = new kakao.maps.LatLng(36.3699, 127.3442);

        const map = new kakao.maps.Map(mapRef.current, {
          center: defaultCenter,
          level: 4,
        });

        if (COLLECT_MODE) {
          kakao.maps.event.addListener(map, "click", (e) => {
            const lat = e.latLng.getLat().toFixed(6);
            const lng = e.latLng.getLng().toFixed(6);
            console.log(`n??: { lat: ${lat}, lng: ${lng} }, // 설명`);
            new kakao.maps.Marker({ map, position: e.latLng }); // 클릭한 자리 표시
          });
        }

        const places = new kakao.maps.services.Places();

        const keywordSearchOne = (query) =>
          new Promise((resolve) => {
            places.keywordSearch(query, (data, status) => {
              if (status === kakao.maps.services.Status.OK && data.length > 0) {
                const best = data[0];
                resolve({
                  query,
                  lat: Number(best.y),
                  lng: Number(best.x),
                  placeName: best.place_name,
                  address: best.address_name,
                });
              } else {
                resolve(null);
              }
            });
          });

        const searchWithFallback = async (queries) => {
          for (const q of queries) {
            const found = await keywordSearchOne(q);
            if (found) return found;
          }
          return null;
        };

        // 좌표가 박힌 출발지(교문 등)는 카카오 검색을 건너뛴다.
        const originPlace = origin
          ? origin.lat != null && origin.lng != null
            ? { lat: origin.lat, lng: origin.lng, placeName: origin.label, query: origin.label }
            : await searchWithFallback([originQueryOf(origin)])
          : null;

        // 목적지에 좌표(lat/lng)가 있으면 카카오 검색을 건너뛰고 그 좌표로 바로 핀을 찍는다.
        // (기존 건물들은 lat/lng이 없으므로 그대로 카카오 검색으로 동작한다.)
        const destPlace = building
          ? building.lat != null && building.lng != null
            ? { lat: building.lat, lng: building.lng, placeName: building.name, query: building.name }
            : await searchWithFallback(buildingQueriesOf(building))
          : null;

        if (cancelled) return;

        if (!originPlace && !destPlace) {
          setMapError("카카오맵에서 출발지와 목적지를 찾지 못했어요. 검색어를 더 구체적으로 입력해주세요.");
          return;
        }

        const bounds = new kakao.maps.LatLngBounds();

        if (originPlace) {
          const pos = new kakao.maps.LatLng(originPlace.lat, originPlace.lng);
          const marker = new kakao.maps.Marker({
            map,
            position: pos,
            title: origin?.label || originPlace.placeName,
          });

          const info = new kakao.maps.InfoWindow({
            content: `<div style="padding:7px 10px;font-size:13px;line-height:1.4;">출발지<br/><b>${
              origin?.label || originPlace.placeName
            }</b></div>`,
          });

          kakao.maps.event.addListener(marker, "click", () => info.open(map, marker));
          cleanupItems.push(marker);
          bounds.extend(pos);
        }

        if (destPlace) {
          const pos = new kakao.maps.LatLng(destPlace.lat, destPlace.lng);
          const marker = new kakao.maps.Marker({
            map,
            position: pos,
            title: building?.name || destPlace.placeName,
          });

          const roomText = building?.matchedRoom ? `<br/>${building.matchedRoom}` : "";
          const info = new kakao.maps.InfoWindow({
            content: `<div style="padding:7px 10px;font-size:13px;line-height:1.4;">목적지<br/><b>${
              building?.name || destPlace.placeName
            }</b><br/>${building?.code || ""}${roomText}</div>`,
          });

          kakao.maps.event.addListener(marker, "click", () => info.open(map, marker));
          cleanupItems.push(marker);
          bounds.extend(pos);
        }

        if (originPlace && destPlace) {
          // 두 경로를 동시에 계산한다.
          //  - normal  : OSRM 공식 보행로 경로 (빨간색)
          //  - shortcut: 자체 캐퍼스 그래프 지름길 (파란색)
          const shortcut = routeOnCampusGraph(originPlace, destPlace); // 동기 계산
          const osrm = await fetchWalkingRoute(originPlace, destPlace);
          if (cancelled) return;

          const normal = osrm
            ? {
                coords: osrm.coords.map(([lng, lat]) => ({ lat, lng })),
                distance: osrm.distance,
                duration: osrm.duration,
              }
            : null;

          const toPath = (r) => r.coords.map((c) => new kakao.maps.LatLng(c.lat, c.lng));

          const badge = (pos, borderColor, textColor, html) => {
            const overlay = new kakao.maps.CustomOverlay({
              map,
              position: pos,
              yAnchor: 1.4,
              content:
                `<div style="background:#fff;border:1.5px solid ${borderColor};border-radius:8px;` +
                `padding:4px 9px;font-size:12px;font-weight:600;color:${textColor};` +
                `box-shadow:0 1px 4px rgba(0,0,0,.2);white-space:nowrap;">${html}</div>`,
            });
            cleanupItems.push(overlay);
          };

          const fmt = (r) =>
            `도보 ${Math.round(r.duration / 60)}분 · ${
              r.distance >= 1000 ? (r.distance / 1000).toFixed(2) + "km" : Math.round(r.distance) + "m"
            }`;

          // ① 정상 경로 (빨간색)
          if (normal) {
            const path = toPath(normal);
            cleanupItems.push(
              new kakao.maps.Polyline({
                map, path,
                strokeWeight: 5, strokeColor: "#e03131", strokeOpacity: 0.75, strokeStyle: "solid",
              })
            );
            path.forEach((p) => bounds.extend(p));
            badge(path[Math.floor(path.length / 2)], "#e03131", "#e03131", `정상 경로 · ${fmt(normal)}`);
          }

          // ② 지름길 경로 (파란색)
          if (shortcut) {
            const path = toPath(shortcut);
            cleanupItems.push(
              new kakao.maps.Polyline({
                map, path,
                strokeWeight: 6, strokeColor: "#1c62d6", strokeOpacity: 0.85, strokeStyle: "solid",
              })
            );
            path.forEach((p) => bounds.extend(p));
            badge(path[Math.floor(path.length / 2)], "#1c62d6", "#1c62d6", `🌿 지름길 · ${fmt(shortcut)}`);
          }

          // ③ 둘 다 있으면 단축 효과 비교 배지 (출발지 위)
          if (normal && shortcut) {
            const dtMin = Math.round((normal.duration - shortcut.duration) / 60);
            const ddM = Math.round(normal.distance - shortcut.distance);
            const html =
              dtMin > 0 || ddM > 0
                ? `⏱ 지름길로 ${dtMin > 0 ? `${dtMin}분` : "1분 미만"} 단축 · ${ddM}m 절약`
                : `🌡️ 더 빠르진 않지만 여름엔 시원하고 겨울엔 따뜻한 경로예요`;
            badge(
              new kakao.maps.LatLng(originPlace.lat, originPlace.lng),
              "#333", "#333", html
            );
          }

          // ④ 둘 다 없을 때만 직선 폴백 (점선)
          if (!normal && !shortcut) {
            const path = [
              new kakao.maps.LatLng(originPlace.lat, originPlace.lng),
              new kakao.maps.LatLng(destPlace.lat, destPlace.lng),
            ];
            cleanupItems.push(
              new kakao.maps.Polyline({
                map, path,
                strokeWeight: 5, strokeColor: "#e8501f", strokeOpacity: 0.8, strokeStyle: "shortdash",
              })
            );
          }
        }

        if (originPlace && destPlace) {
          map.setBounds(bounds);
        } else if (destPlace) {
          map.setCenter(new kakao.maps.LatLng(destPlace.lat, destPlace.lng));
          map.setLevel(3);
        } else if (originPlace) {
          map.setCenter(new kakao.maps.LatLng(originPlace.lat, originPlace.lng));
          map.setLevel(3);
        }
      } catch (err) {
        console.error(err);
        if (!cancelled) {
          setMapError(
            "카카오맵을 불러오지 못했습니다. .env의 JavaScript 키와 카카오 플랫폼 설정을 확인해주세요."
          );
        }
      }
    }

    initMap();

    return () => {
      cancelled = true;
      cleanupItems.forEach((obj) => {
        if (obj && typeof obj.setMap === "function") obj.setMap(null);
      });
    };
  }, [origin, building]);

  if (!KAKAO_MAP_KEY) {
    return (
      <div className="cnu-map-notice" style={S.mapNotice}>
        Kakao Map API 키가 필요합니다.
        <br />
        프로젝트 루트에 <b>.env</b> 파일을 만들고
        <br />
        <b>VITE_KAKAO_MAP_KEY=본인_JavaScript_키</b>
        <br />
        를 추가한 뒤 서버를 다시 실행해주세요.
      </div>
    );
  }

  return (
    <div>
      {mapError && <div style={S.mapWarn}>{mapError}</div>}
      <div
        ref={mapRef}
        style={{
          width: "100%",
          height: "380px",
          borderRadius: "12px",
        }}
      />
    </div>
  );
}

// ════════════════ 자연어 대화 파서 ─═══════════════
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

  // 출입구로 등록되지 않은 건물도 출발지로 사용할 수 있게 한다.
  const match = bestMatch(t);
  if (match) return { ...match.building, label: match.building.name };
  return null;
}

function splitFromTo(t) {
  const m = t.match(/(.+?)(?:에서|부터)\s*(.+)/);
  if (m) return { fromPart: m[1], toPart: m[2] };
  return { fromPart: null, toPart: t };
}

function detectRouteTip(t) {
  const s = t.replace(/\s/g, "");
  if (/(그늘|더운|더위|여름|햇볕|땡볕)/.test(s)) return "shade";
  if (/(비|우산|실내|눈오|장마|비올)/.test(s)) return "indoor";
  if (/(한산|사람없|조용|붐비지|한적)/.test(s)) return "quiet";
  if (/(빠른|최단|빨리|급해|지름)/.test(s)) return "fast";
  return null;
}

function makePlaceSummary(origin, building, room) {
  const out = [];
  out.push(`📍 출발지: **${origin.label}**`);
  out.push(`🏁 목적지: **${building.name}** (${building.code})`);
  if (room) out.push(`🚪 매칭된 호실/시설: **${room}**`);
  if (building.alias) out.push(`🏷️ 별칭: ${building.alias}`);
  if (building.rooms?.length) {
    out.push(`🧭 참고 시설: ${building.rooms.slice(0, 4).join(", ")}`);
  }
  out.push(`🗺️ 현재 지도는 카카오맵 검색 결과 좌표 기준으로 표시됩니다.`);
  return out;
}

// ════════════════ 메인 ─═══════════════
// (구버전 채팅 UI는 아래에 CNUChatbot 으로 보존해 둡니다. 필요하면 이걸 export default 로 바꾸면 채팅 버전으로 복귀합니다.)
function CNUChatbot() {
  const [messages, setMessages] = useState([
    {
      role: "bot",
      type: "text",
      content:
        '안녕하세요! 충남대학교 대덕캠퍼스 길안내 챗봇 **두리번**이에요 🐾\n어디로 가시는지 편하게 말해주세요.\n예: "정문에서 인문대 가는 길", "공대1호관 어떻게 가", "행정학부 위치"',
    },
  ]);
  const [text, setText] = useState("");
  const [origin, setOrigin] = useState(null);
  const [pending, setPending] = useState(null);
  const [typing, setTyping] = useState(false);
  const scrollRef = useRef(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 9e9, behavior: "smooth" });
  }, [messages, typing]);

  const pushUser = (t) => setMessages((p) => [...p, { role: "user", type: "text", content: t }]);

  const pushBot = (msgs) => {
    setTyping(true);
    setTimeout(() => {
      setTyping(false);
      setMessages((p) => [...p, ...(Array.isArray(msgs) ? msgs : [msgs])]);
    }, 420);
  };

  const runRoute = (o, b, tipKey, room = "") => {
    const buildingForMap = { ...b, matchedRoom: room || "" };
    const destLabel = room ? `${b.name}(${b.code}) ${room}` : `${b.name}(${b.code})`;

    const out = [
      {
        role: "bot",
        type: "text",
        content: `**${o.label}**에서 **${destLabel}**까지 위치를 지도에서 확인해드릴게요! 🗺️`,
      },
      { role: "bot", type: "map", origin: o, building: buildingForMap },
      { role: "bot", type: "placeSummary", lines: makePlaceSummary(o, b, room) },
    ];

    if (tipKey) out.push({ role: "bot", type: "text", content: ROUTE_TIPS[tipKey] });

    out.push({
      role: "bot",
      type: "text",
      content:
        '현재 버전은 **지도 기반 위치 확인**에 맞춰져 있어요.\n다음 단계에서 두리번 전용 캠퍼스 경로를 추가할 수 있어요 😊',
    });

    pushBot(out);
  };

  const handle = (raw) => {
    const t = raw.trim();
    if (!t) return;
    pushUser(t);
    setText("");

    if (/^(안녕|하이|hi|hello|ㅎㅇ|도움|help|뭐해|누구)/i.test(t)) {
      pushBot({
        role: "bot",
        type: "text",
        content:
          '저는 충남대 길안내 챗봇 두리번이에요 🐾\n"○○에서 ○○ 가는 길" 또는 그냥 "○○ 어디"라고 물어보세요!',
      });
      return;
    }

    const tip = detectRouteTip(t);
    const { fromPart, toPart } = splitFromTo(t);

    let foundOrigin = fromPart
      ? findOriginInText(fromPart)
      : findOriginInText(t) && !smartSearch(t).length
      ? findOriginInText(t)
      : null;

    const destSource = fromPart ? toPart : t;
    const match = bestMatch(destSource);

    if (!match && tip && origin) {
      pushBot({ role: "bot", type: "text", content: ROUTE_TIPS[tip] });
      return;
    }

    if (!match) {
      if (foundOrigin) {
        setOrigin(foundOrigin);
        pushBot({
          role: "bot",
          type: "text",
          content: `**${foundOrigin.label}**에서 출발이군요! 어디로 가시나요? (예: 공대4호관 학생회실, 인문대, 523호)`,
        });
        return;
      }

      // 기존 규칙 검색이 못 잡음 → Gemini 의도 분석(parse)으로 넘김
      // Gemini는 출발지/목적지를 "이해"만 하고, 실제 장소 검증은 아래에서
      // 기존 두리번 DB(ORIGINS / bestMatch)가 담당한다.
      setTyping(true);
      askGeminiParse(t).then(async (parsed) => {
        if (!parsed) {
          const reply = await askGemini(t);
          setTyping(false);
          setMessages((p) => [
            ...p,
            {
              role: "bot",
              type: "text",
              content:
                reply ||
                '음... 지금 AI 응답을 받지 못했어요. 잠시 후 다시 시도해주세요.',
            },
          ]);
          return;
        }

        // Gemini가 뽑은 출발지/목적지를 기존 두리번 DB로 검증
        const gOrigin = parsed && parsed.origin ? findOriginInText(parsed.origin) : null;
        const gMatch = parsed && parsed.destination ? bestMatch(parsed.destination) : null;

        // A) 목적지를 두리번 DB에서 확인한 경우 → 실제 길찾기로 연결
        if (gMatch) {
          const b = gMatch.building;
          const o = gOrigin || origin;
          if (gOrigin) setOrigin(gOrigin);

          if (o) {
            runRoute(o, b, null, gMatch.room); // 기존 길찾기 함수 그대로 호출
          } else {
            // 목적지는 있는데 출발지가 없음 → 출발지 선택 요청
            setPending({ building: b, tip: null, room: gMatch.room });
            const destLabel = gMatch.room
              ? `**${b.name}**(${b.code}) ${gMatch.room}`
              : `**${b.name}**(${b.code})`;
            pushBot([
              { role: "bot", type: "text", content: `${destLabel}(으)로 안내할게요! 지금 어디 계세요?` },
              { role: "bot", type: "choices", items: ORIGINS, kind: "origin" },
            ]);
          }
          return;
        }

        // B) 목적지는 못 찾고 출발지만 인식된 경우
        if (gOrigin) {
          setOrigin(gOrigin);
          pushBot({
            role: "bot",
            type: "text",
            content: `**${gOrigin.label}**에서 출발이군요! 어디로 가시나요? (예: 공대4호관 학생회실, 인문대, 523호)`,
          });
          return;
        }

        // C) 두리번 DB에서 장소를 못 찾음 → Gemini의 안내 문장으로 대화 응답
        setTyping(false);
        setMessages((p) => [
          ...p,
          {
            role: "bot",
            type: "text",
            content:
              (parsed && parsed.reply) ||
              '음... 그 장소는 제가 아직 못 찾겠어요 😅 건물명·학과·호실·교수님 성함으로 다시 말해주실래요?\n예: "공대4호관 메카트로닉스 학생회실", "523호", "정슬 교수님"',
          },
        ]);
      });
      return;
    }

    const b = match.building;
    const o = foundOrigin || origin;
    if (foundOrigin) setOrigin(foundOrigin);

    if (!o) {
      setPending({ building: b, tip, room: match.room });
      const destLabel = match.room ? `**${b.name}**(${b.code}) ${match.room}` : `**${b.name}**(${b.code})`;
      pushBot([
        { role: "bot", type: "text", content: `${destLabel}(으)로 안내할게요! 지금 어디 계세요?` },
        { role: "bot", type: "choices", items: ORIGINS, kind: "origin" },
      ]);
      return;
    }

    runRoute(o, b, tip, match.room);
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const from = params.get("from");
    const to = params.get("to");

    if (!from || !to) return;

    handle(`${from}에서 ${to} 가는 길 알려줘`);
    window.history.replaceState({}, document.title, window.location.pathname);
  }, []);

  const onChoice = (item, kind) => {
    if (kind === "origin") {
      pushUser(`현재 위치: ${item.label}`);
      setOrigin(item);

      if (pending) {
        const { building, tip, room } = pending;
        setPending(null);
        runRoute(item, building, tip, room || "");
      } else {
        pushBot({
          role: "bot",
          type: "text",
          content: `**${item.label}**에서 출발이군요! 목적지를 말해주세요 😊`,
        });
      }
    } else {
      pushUser(`목적지: ${item.name}`);
      const o = origin;
      if (!o) {
        setPending({ building: item, tip: null, room: "" });
        pushBot([
          { role: "bot", type: "text", content: `**${item.name}**(${item.code})로 안내할게요! 지금 어디 계세요?` },
          { role: "bot", type: "choices", items: ORIGINS, kind: "origin" },
        ]);
      } else {
        runRoute(o, item, null, "");
      }
    }
  };

  return (
    <div className="cnu-app" style={S.wrap}>
      <style>{`
@import url('https://fonts.googleapis.com/css2?family=Gowun+Dodum&family=Jua&display=swap');
.pop{animation:pp .34s cubic-bezier(.18,.89,.32,1.28)}
@keyframes pp{from{opacity:0;transform:translateY(8px) scale(.97)}to{opacity:1;transform:none}}
.chip:hover{transform:translateY(-2px);filter:brightness(1.06)}
.chip:active{transform:translateY(0)}
.send:hover{filter:brightness(1.08)}
.cnu-in::-webkit-scrollbar{width:0}
.dot{display:inline-block;width:6px;height:6px;border-radius:50%;background:#bbb;margin:0 2px;animation:bl 1.2s infinite}
.dot:nth-child(2){animation-delay:.2s}.dot:nth-child(3){animation-delay:.4s}
@keyframes bl{0%,60%,100%{opacity:.3;transform:translateY(0)}30%{opacity:1;transform:translateY(-3px)}}
@media (max-width:768px){
  .cnu-app{height:100dvh!important;max-width:none!important;border-radius:0!important}
  .cnu-chat{padding:14px 12px!important}
  .cnu-quick{padding:8px 12px 0!important;flex-wrap:wrap!important;overflow:visible!important}
  .cnu-map-frame,.cnu-map-frame>div{height:280px!important}
  .cnu-map-notice{height:280px!important}
  .cnu-map-bubble{max-width:100%!important}
  .cnu-input-bar{padding:10px 12px calc(12px + env(safe-area-inset-bottom))!important}
}
@media (max-width:480px){
  .cnu-chat{gap:8px!important}
  .cnu-input-bar{gap:6px!important}
  .cnu-quick{gap:6px!important}
  .cnu-quick button{padding:7px 10px!important}
  .cnu-map-frame,.cnu-map-frame>div{height:240px!important}
  .cnu-map-notice{height:240px!important}
}
`}</style>

      <header style={S.header}>
        <div style={S.badge}>🐾</div>
        <div style={{ flex: 1 }}>
          <div style={S.title}>두리번</div>
          <div style={S.sub}>충남대학교 대덕캠퍼스 길안내</div>
        </div>
        <div style={S.live}>● CNU</div>
      </header>

      <div ref={scrollRef} className="cnu-in cnu-chat" style={S.chat}>
        {messages.map((m, i) => (
          <Bubble key={i} m={m} onChoice={onChoice} />
        ))}
        {typing && (
          <div className="pop" style={{ ...S.line, justifyContent: "flex-start" }}>
            <div style={{ ...S.bot, padding: "12px 16px" }}>
              <span className="dot" />
              <span className="dot" />
              <span className="dot" />
            </div>
          </div>
        )}
      </div>

      <div className="cnu-quick" style={S.quick}>
        {["인문대 가는 길", "공대1호관 어디", "중앙도서관", "행정학부", "경상대"].map((q) => (
          <button key={q} className="chip" style={S.qchip} onClick={() => handle(q)}>
            {q}
          </button>
        ))}
      </div>

      <div className="cnu-input-bar" style={S.inputBar}>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handle(text);
          }}
          placeholder="메시지를 입력하세요 (예: 정문에서 인문대 가는 길)"
          style={S.textInput}
        />
        <button className="send" style={S.sendBtn} onClick={() => handle(text)}>
          ➤
        </button>
      </div>
    </div>
  );
}

// ════════════════ 지도 전용 메인 (채팅 UI 없음) ─═══════════════
// 화면에는 [지도] + [위치 정보 카드]만 표시합니다.
// 출발지/목적지는 URL 파라미터로 지정할 수 있어요:
//   예) ?from=정문&to=인문대   /   ?from=중앙도서관&to=공대4호관
// 파라미터가 없으면 아래 기본값(정문 → 제1학생회관)으로 표시됩니다.
export default function CNUNavigator() {
  const params = new URLSearchParams(window.location.search);
  const fromParam = params.get("from") || "정문";
  const toParam = params.get("to") || "제1학생회관";

  const origin = findOriginInText(fromParam);
  const match = bestMatch(toParam);
  const building = match ? match.building : null;
  const room = match ? match.room : "";
  const buildingForMap = building ? { ...building, matchedRoom: room || "" } : null;

  return (
    <div className="cnu-app" style={S.mapOnlyWrap}>
      <style>{`
@import url('https://fonts.googleapis.com/css2?family=Gowun+Dodum&family=Jua&display=swap');
.pop{animation:pp .34s cubic-bezier(.18,.89,.32,1.28)}
@keyframes pp{from{opacity:0;transform:translateY(8px) scale(.97)}to{opacity:1;transform:none}}
@media (max-width:768px){
  .cnu-app{min-height:100dvh!important;max-width:none!important;border-radius:0!important}
  .cnu-map-frame,.cnu-map-frame>div,.cnu-map-frame>div>div{height:320px!important}
  .cnu-map-notice{height:320px!important}
}
`}</style>

      {building ? (
        <>
          <div className="pop cnu-map-bubble" style={S.mapCard}>
            <div style={S.lbl}>🗺️ Kakao Map — 위치 확인</div>
            <div
              className="cnu-map-frame"
              style={{ borderRadius: 12, overflow: "hidden", border: "1px solid #e3ddd0" }}
            >
              <KakaoSearchMap origin={origin} building={buildingForMap} />
            </div>
          </div>

          <div className="pop" style={S.infoCard}>
            <div style={S.lbl}>📌 위치 정보</div>
            {makePlaceSummary(origin || { label: fromParam }, building, room).map((s, i) => (
              <div key={i} style={S.step} dangerouslySetInnerHTML={{ __html: md(s) }} />
            ))}
          </div>
        </>
      ) : (
        <div className="pop" style={S.infoCard}>
          <div style={S.lbl}>📌 위치 정보</div>
          <div style={S.step}>
            "<b>{toParam}</b>" 목적지를 찾지 못했어요.
            <br />
            주소창에 <b>?from=정문&amp;to=인문대</b> 형태로 지정해주세요.
          </div>
        </div>
      )}
    </div>
  );
}

// ════════════════ 말풍선 ─═══════════════
function Bubble({ m, onChoice }) {
  const isUser = m.role === "user";

  if (m.type === "map") {
    return (
      <div className="pop" style={{ ...S.line, justifyContent: "flex-start" }}>
        <div className="cnu-map-bubble" style={{ ...S.bot, padding: 10, width: "100%", maxWidth: 430 }}>
          <div style={S.lbl}>🗺️ Kakao Map — 위치 확인</div>
          <div className="cnu-map-frame" style={{ borderRadius: 12, overflow: "hidden", border: "1px solid #e3ddd0" }}>
            <KakaoSearchMap origin={m.origin} building={m.building} />
          </div>
        </div>
      </div>
    );
  }

  if (m.type === "placeSummary") {
    return (
      <div className="pop" style={{ ...S.line, justifyContent: "flex-start" }}>
        <div style={{ ...S.bot, maxWidth: 430 }}>
          <div style={S.lbl}>📌 위치 정보</div>
          {m.lines.map((s, i) => (
            <div key={i} style={S.step} dangerouslySetInnerHTML={{ __html: md(s) }} />
          ))}
        </div>
      </div>
    );
  }

  if (m.type === "choices") {
    return (
      <div className="pop" style={{ ...S.line, justifyContent: "flex-start" }}>
        <div style={{ ...S.bot, maxWidth: 430 }}>
          <div style={S.row}>
            {m.items.map((it) => {
              const label = m.kind === "origin" ? `📍 ${it.label}` : `🏢 ${it.alias ? it.alias.split("·")[0] : it.name}`;
              const bg = m.kind === "origin" ? "#2563a8" : ZONE_COLOR[it.zone] || "#888";
              return (
                <button
                  key={it.id || it.code}
                  className="chip"
                  style={{ ...S.chip, background: bg }}
                  onClick={() => onChoice(it, m.kind)}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="pop" style={{ ...S.line, justifyContent: isUser ? "flex-end" : "flex-start" }}>
      <div style={isUser ? S.user : S.bot} dangerouslySetInnerHTML={{ __html: md(m.content) }} />
    </div>
  );
}

function md(t) {
  return String(t)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/\*\*(.+?)\*\*/g, "<b>$1</b>")
    .replace(/\n/g, "<br/>");
}

const S = {
  wrap: {
    fontFamily: "'Gowun Dodum',sans-serif",
    width: "100%",
    maxWidth: 520,
    margin: "0 auto",
    height: "min(760px, calc(100dvh - 40px))",
    minHeight: 0,
    display: "flex",
    flexDirection: "column",
    background: "#fffdf8",
    borderRadius: 22,
    overflow: "hidden",
    boxShadow: "0 18px 50px rgba(40,50,40,0.18)",
    border: "1px solid #e9e3d4",
  },
  header: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "15px 18px",
    background: "linear-gradient(120deg,#1f5fa8,#2f8f6f)",
    color: "#fff",
  },
  badge: {
    width: 42,
    height: 42,
    borderRadius: 12,
    background: "rgba(255,255,255,.22)",
    display: "grid",
    placeItems: "center",
    fontSize: 22,
  },
  title: { fontFamily: "'Jua',sans-serif", fontSize: 21, lineHeight: 1.1 },
  sub: { fontSize: 11.5, opacity: 0.92 },
  live: { fontSize: 11, opacity: 0.9, fontWeight: 700 },
  chat: {
    flex: 1,
    overflowY: "auto",
    padding: "18px 15px",
    display: "flex",
    flexDirection: "column",
    gap: 10,
    background:
      "radial-gradient(circle at 15% 8%,#eef5ff 0%,transparent 38%),radial-gradient(circle at 88% 85%,#eef7ef 0%,transparent 42%),#fffdf8",
  },
  line: { display: "flex" },
  bot: {
    background: "#fff",
    border: "1px solid #ece4d4",
    padding: "11px 14px",
    borderRadius: "4px 16px 16px 16px",
    fontSize: 14.5,
    lineHeight: 1.55,
    color: "#39332a",
    boxShadow: "0 2px 8px rgba(70,60,30,.05)",
    maxWidth: "min(360px, 86%)",
  },
  user: {
    background: "linear-gradient(120deg,#1f5fa8,#3a7bc8)",
    color: "#fff",
    padding: "11px 14px",
    borderRadius: "16px 4px 16px 16px",
    fontSize: 14.5,
    lineHeight: 1.5,
    maxWidth: "min(300px, 86%)",
    boxShadow: "0 2px 8px rgba(30,60,120,.18)",
  },
  lbl: {
    fontSize: 12,
    fontWeight: 700,
    color: "#1f7a5f",
    marginBottom: 8,
    fontFamily: "'Jua',sans-serif",
  },
  step: {
    fontSize: 13.5,
    lineHeight: 1.6,
    padding: "5px 0",
    borderBottom: "1px dashed #eee6d6",
    color: "#39332a",
  },
  row: { display: "flex", flexWrap: "wrap", gap: 8 },
  chip: {
    border: "none",
    color: "#fff",
    padding: "9px 13px",
    borderRadius: 20,
    fontSize: 13,
    fontFamily: "'Gowun Dodum',sans-serif",
    cursor: "pointer",
    transition: "all .15s ease",
    boxShadow: "0 3px 9px rgba(0,0,0,.12)",
  },
  quick: {
    display: "flex",
    gap: 7,
    padding: "10px 14px 0",
    flexWrap: "wrap",
    overflow: "visible",
  },
  qchip: {
    border: "1px solid #d8e0d8",
    background: "#fff",
    color: "#4a6b5a",
    padding: "7px 12px",
    borderRadius: 16,
    fontSize: 12.5,
    fontFamily: "'Gowun Dodum',sans-serif",
    cursor: "pointer",
    whiteSpace: "nowrap",
    transition: "all .15s ease",
    flexShrink: 0,
  },
  inputBar: {
    display: "flex",
    gap: 8,
    padding: "12px 14px 16px",
    borderTop: "1px solid #efe8d8",
    background: "#fffdf8",
    alignItems: "center",
  },
  textInput: {
    flex: 1,
    minWidth: 0,
    boxSizing: "border-box",
    padding: "12px 15px",
    borderRadius: 22,
    border: "1.5px solid #d8e0d8",
    fontSize: 16,
    fontFamily: "'Gowun Dodum',sans-serif",
    outline: "none",
    background: "#fbfdfb",
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: "50%",
    border: "none",
    flexShrink: 0,
    background: "linear-gradient(120deg,#1f5fa8,#2f8f6f)",
    color: "#fff",
    fontSize: 16,
    cursor: "pointer",
    transition: "all .15s ease",
    boxShadow: "0 3px 9px rgba(30,90,80,.25)",
  },
  mapNotice: {
    height: 380,
    display: "grid",
    placeItems: "center",
    textAlign: "center",
    padding: 18,
    boxSizing: "border-box",
    color: "#5f4b32",
    background: "#fff7e8",
    borderRadius: 12,
    lineHeight: 1.6,
    fontSize: 13.5,
  },
  mapOnlyWrap: {
    fontFamily: "'Gowun Dodum',sans-serif",
    width: "100%",
    maxWidth: 460,
    margin: "0 auto",
    minHeight: "100dvh",
    display: "flex",
    flexDirection: "column",
    gap: 12,
    padding: 14,
    boxSizing: "border-box",
    background:
      "radial-gradient(circle at 15% 8%,#eef5ff 0%,transparent 38%),radial-gradient(circle at 88% 85%,#eef7ef 0%,transparent 42%),#fffdf8",
  },
  mapCard: {
    background: "#fff",
    border: "1px solid #ece4d4",
    padding: 10,
    borderRadius: 16,
    boxShadow: "0 2px 10px rgba(70,60,30,.06)",
  },
  infoCard: {
    background: "#fff",
    border: "1px solid #ece4d4",
    padding: "12px 14px",
    borderRadius: 16,
    boxShadow: "0 2px 10px rgba(70,60,30,.06)",
  },
  mapWarn: {
    marginBottom: 8,
    padding: "8px 10px",
    borderRadius: 10,
    background: "#fff4d8",
    color: "#6b4a00",
    fontSize: 12.5,
    lineHeight: 1.45,
  },
};
