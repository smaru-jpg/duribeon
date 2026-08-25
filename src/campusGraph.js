// =====================================================================
// campusGraph.js — 충남대 캠퍼스 도보 그래프 (수작업 데이터 + 경로 탐색)
// 위치: src/campusGraph.js
//
// 사용법:
//  1) CNUNavigator.jsx에서 COLLECT_MODE = true 로 켜고 npm run dev
//  2) 지도를 클릭하면 F12 콘솔에 노드 좌표 한 줄씩 출력됨 → 복사해서
//     아래 NODES에 붙여넣기 (id는 의미 있게 직접 수정: gate1, eng2 등)
//  3) 실제 길로 이어진 노드 쌍을 EDGES에 등록
//  4) COLLECT_MODE = false 로 끄면 그래프 라우팅이 활성화됨
// =====================================================================

// ---------------------------------------------------------------------
// 1. 노드: 갈림길(교차점), 지름길 입구/출구, 건물 앞 지점만 찍는다.
//    직선 구간의 중간 지점은 찍을 필요 없음.
// ---------------------------------------------------------------------
export const NODES = {
  // 교문 (ORIGINS와 동일 좌표 — 교문 출발 시 스냅 0m 보장)
  maingate:  { lat: 36.362331, lng: 127.344859 }, // 정문
  sidegate:  { lat: 36.363234, lng: 127.347476 }, // 쪽문(BHC 옆 통로)
  westgate:  { lat: 36.369873, lng: 127.340371 }, // 서문
  northgate: { lat: 36.365875, lng: 127.351965 }, // 북문(자운대방면)
  vetgate:   { lat: 36.376914, lng: 127.342597 }, // 수의대입구

  // 출발지 보조 (ORIGINS와 동일)
  lib:       { lat: 36.369880, lng: 127.345907 }, // 중앙도서관 앞
  student1:  { lat: 36.367896, lng: 127.343179 }, // 제1학생회관 앞

  // 목적지: 공대 1호관 (각 루트 종점들의 중앙 접속점)
  gong1:     { lat: 36.367600, lng: 127.344580 },

  // ── 정문 → 공1 ──
  m1:  { lat: 36.366119, lng: 127.345355 },
  m2:  { lat: 36.366616, lng: 127.345079 },
  m3:  { lat: 36.367053, lng: 127.345103 },

  // ── 쪽문 → 공1 (북문·정문과 공유) ──
  s1:  { lat: 36.363211, lng: 127.347437 },
  s2:  { lat: 36.363216, lng: 127.347259 }, // 북문 루트 합류점
  s3:  { lat: 36.363785, lng: 127.347105 },
  s4:  { lat: 36.363974, lng: 127.346883 },
  s5:  { lat: 36.364398, lng: 127.346885 },
  s6:  { lat: 36.364499, lng: 127.346351 },
  s7:  { lat: 36.364791, lng: 127.346375 },
  s8:  { lat: 36.364851, lng: 127.345907 },
  s9:  { lat: 36.365194, lng: 127.345970 },
  s10: { lat: 36.365286, lng: 127.345385 },
  s11: { lat: 36.365934, lng: 127.345477 },
  s12: { lat: 36.365962, lng: 127.345282 },
  s13: { lat: 36.366097, lng: 127.345305 },
  s14: { lat: 36.366723, lng: 127.345386 },
  s15: { lat: 36.366715, lng: 127.344851 },
  s16: { lat: 36.367095, lng: 127.344557 }, // 공1 남쪽 입구 (정문 루트의 종점과 병합)

  // ── 북문 → 쪽문 합류(s2) ──
  n1:  { lat: 36.365339, lng: 127.351737 },
  n2:  { lat: 36.364898, lng: 127.351723 },
  n3:  { lat: 36.364501, lng: 127.351566 },
  n4:  { lat: 36.364313, lng: 127.351453 },
  n5:  { lat: 36.364106, lng: 127.351319 },
  n6:  { lat: 36.363501, lng: 127.348530 },
  n7:  { lat: 36.363258, lng: 127.348552 },
  n8:  { lat: 36.363225, lng: 127.347538 },
  n9:  { lat: 36.363189, lng: 127.347504 },
  // (마지막 점 36.363198,127.347259는 s2와 오차 3 이하 → s2로 병합)

  // ── 서문 → 공1 (수의대는 westgate로 합류) ──
  w1:  { lat: 36.370285, lng: 127.342844 },
  w2:  { lat: 36.369870, lng: 127.343199 },
  w3:  { lat: 36.369779, lng: 127.343483 },
  w4:  { lat: 36.369472, lng: 127.343671 },
  w5:  { lat: 36.369242, lng: 127.343648 },
  w6:  { lat: 36.368673, lng: 127.344046 },
  w7:  { lat: 36.368104, lng: 127.344601 }, // 공1 북쪽 입구 (1학 루트 종점과 병합)
  // (수의대 루트의 36.370040,127.340314는 westgate와 오차 5 이하 → westgate로 병합)

  // ── 중앙도서관 → 공1 ──
  l2:  { lat: 36.368448, lng: 127.345644 },
  l3:  { lat: 36.368486, lng: 127.344987 },
  l4:  { lat: 36.368387, lng: 127.344986 },
  l5:  { lat: 36.368305, lng: 127.345209 },
  l6:  { lat: 36.368188, lng: 127.345208 },
  l7:  { lat: 36.368099, lng: 127.344796 },

  // ── 제1학생회관 → 공1 ──
  t2:  { lat: 36.368029, lng: 127.343915 },
  // (종점 36.368036,127.344628은 w7과 사실상 동일 → w7로 병합)

  // ── 공대 2호관 ──
  gong2: { lat: 36.364040, lng: 127.346275 }, // 공2 (정문·쪽문 루트 종점 병합)
  a1: { lat: 36.362555, lng: 127.345206 },
  a2: { lat: 36.362758, lng: 127.345262 },
  a3: { lat: 36.363331, lng: 127.345775 },
  a4: { lat: 36.363775, lng: 127.345832 },
  x1: { lat: 36.363746, lng: 127.346185 }, // 공2 정문루트×공4 정문루트 교차점 (병합)

  // ── 공대 3호관 ──
  gong3a: { lat: 36.365255, lng: 127.346466 }, // 공3 정문쪽 입구
  gong3b: { lat: 36.364783, lng: 127.346369 }, // 공3 쪽문쪽 입구
  c1: { lat: 36.363832, lng: 127.346214 },
  c2: { lat: 36.363885, lng: 127.346844 }, // 공3·공4 쪽문루트 공유점 (병합)
  c3: { lat: 36.364371, lng: 127.346858 }, // 공3·공4 쪽문루트 공유점 (병합)
  c4: { lat: 36.364480, lng: 127.346418 },

  // ── 공대 4호관 ──
  gong4a: { lat: 36.364748, lng: 127.347444 }, // 공4 정문쪽 입구
  gong4b: { lat: 36.364883, lng: 127.347567 }, // 공4 쪽문·서문쪽 입구
  d1: { lat: 36.362835, lng: 127.345296 },
  d2: { lat: 36.363194, lng: 127.345755 },
  d3: { lat: 36.364047, lng: 127.346817 },
  d4: { lat: 36.364416, lng: 127.346885 },
  // 서문 루트 (s14에서 분기 — 36.366719,127.345336은 s14와 병합)
  f1: { lat: 36.365980, lng: 127.345266 },
  f2: { lat: 36.365907, lng: 127.345444 },
  // (36.365285,127.345396 → s10 병합 / 36.365194,127.345953 → s9 병합)
  f3: { lat: 36.365509, lng: 127.346155 },
  f4: { lat: 36.365425, lng: 127.347001 },
  f5: { lat: 36.365270, lng: 127.347580 },

  // ── 공대 5호관 ──
  gong5: { lat: 36.366649, lng: 127.344477 },
  k1: { lat: 36.366034, lng: 127.345310 },
  // (36.366575,127.345068 → m2 병합)

  // ── 정문 → 제1학생회관 (수집 경로, 6점 · 정문→1학 순서) ──
  tp1: { lat: 36.362340, lng: 127.344770 }, // 정문 앞
  tp2: { lat: 36.365998, lng: 127.345310 },
  tp3: { lat: 36.366549, lng: 127.344889 },
  tp4: { lat: 36.366723, lng: 127.343820 },
  tp5: { lat: 36.366950, lng: 127.343331 },
  tp6: { lat: 36.367769, lng: 127.343491 }, // 1학 근처 (≈ student1)

  // ══ 2차 수집 경로 노드 (운동장·농대) ══
  // ── maingate → SP-N(북부운동장) ──
  nb1: { lat: 36.362503, lng: 127.344626 },
  nb2: { lat: 36.369331, lng: 127.345771 },
  nb3: { lat: 36.370326, lng: 127.344282 },
  nb4: { lat: 36.370327, lng: 127.344014 },
  nb5: { lat: 36.370437, lng: 127.343502 },
  nb6: { lat: 36.370402, lng: 127.342856 },
  nb7: { lat: 36.371322, lng: 127.342860 },
  nb8: { lat: 36.373807, lng: 127.343651 },
  nb9: { lat: 36.374442, lng: 127.342205 },
  nb10: { lat: 36.374208, lng: 127.342048 },
  // ── maingate → 농대 ──
  ag1: { lat: 36.362178, lng: 127.344848 },
  ag2: { lat: 36.363781, lng: 127.345189 },
  ag3: { lat: 36.363669, lng: 127.346704 },
  ag4: { lat: 36.363740, lng: 127.347061 },
  ag5: { lat: 36.363235, lng: 127.347214 },
  ag6: { lat: 36.363249, lng: 127.348418 },
  ag7: { lat: 36.363573, lng: 127.348664 },
  ag8: { lat: 36.364089, lng: 127.350895 },
  ag9: { lat: 36.368126, lng: 127.350913 },
  ag10: { lat: 36.367172, lng: 127.350686 },
  ag11: { lat: 36.366631, lng: 127.350572 },
  ag12: { lat: 36.366180, lng: 127.350615 },
  ag13: { lat: 36.365783, lng: 127.350947 },
  ag14: { lat: 36.365225, lng: 127.350789 },
  // ── westgate → SP-A(농대운동장) ──
  af1: { lat: 36.369797, lng: 127.340424 },
  af2: { lat: 36.369850, lng: 127.340669 },
  af3: { lat: 36.370454, lng: 127.343703 },
  af4: { lat: 36.369927, lng: 127.345082 },
  af5: { lat: 36.369814, lng: 127.346976 },
  af6: { lat: 36.368833, lng: 127.349691 },
  af7: { lat: 36.368866, lng: 127.350672 },
  af8: { lat: 36.368342, lng: 127.351115 },
};

// ---------------------------------------------------------------------
// 2. 간선: ["노드A", "노드B", 가중치배율(생략 시 1)]
//    - 실제 거리(하버사인)에 배율을 곱해 비용으로 사용
//    - 평지 지름길: 1 / 계단 많은 길: 1.3 / 언덕: 1.2 등으로 튜닝
//    - 양방향으로 자동 처리되므로 한 번만 적으면 됨
// ---------------------------------------------------------------------
export const EDGES = [
  // 정문 → 공1
  ["maingate", "m1"], ["m1", "m2"], ["m2", "m3"], ["m3", "s16"],

  // 쪽문 → 공1
  ["sidegate", "s1"], ["s1", "s2"], ["s2", "s3"], ["s3", "s4"], ["s4", "s5"],
  ["s5", "s6"], ["s6", "s7"], ["s7", "s8"], ["s8", "s9"], ["s9", "s10"],
  ["s10", "s11"], ["s11", "s12"], ["s12", "s13"], ["s13", "s14"],
  ["s14", "s15"], ["s15", "s16"],

  // 북문 → 쪽문 루트 합류(s2)
  ["northgate", "n1"], ["n1", "n2"], ["n2", "n3"], ["n3", "n4"], ["n4", "n5"],
  ["n5", "n6"], ["n6", "n7"], ["n7", "n8"], ["n8", "n9"], ["n9", "s2"],

  // 수의대 → 서문 합류
  ["vetgate", "westgate"],

  // 서문 → 공1
  ["westgate", "w1"], ["w1", "w2"], ["w2", "w3"], ["w3", "w4"], ["w4", "w5"],
  ["w5", "w6"], ["w6", "w7"],

  // 중앙도서관 → 공1
  ["lib", "l2"], ["l2", "l3"], ["l3", "l4"], ["l4", "l5"], ["l5", "l6"], ["l6", "l7"],

  // 제1학생회관 → 공1 (종점은 w7과 병합)
  ["student1", "t2"], ["t2", "w7"],

  // 공1 접속점들 ↔ 공1 중앙 노드
  ["w7", "gong1"], ["s16", "gong1"], ["l7", "gong1"],

  // ── 공2 ──
  // 정문 루트
  ["maingate", "a1"], ["a1", "a2"], ["a2", "a3"], ["a3", "a4"], ["a4", "x1"], ["x1", "gong2"],
  // 쪽문 루트 (여름 시원·겨울 따뜻)
  ["s3", "gong2"],

  // ── 공3 ──
  // 정문 루트
  ["maingate", "c1"], ["c1", "gong3a"],
  // 쪽문 루트
  ["s3", "c2"], ["c2", "c3"], ["c3", "c4"], ["c4", "gong3b"],
  // 공3 두 입구 연결
  ["gong3a", "gong3b"],

  // ── 공4 ──
  // 정문 루트
  ["maingate", "d1"], ["d1", "d2"], ["d2", "x1"], ["x1", "d3"], ["d3", "d4"], ["d4", "gong4a"],
  // 쪽문 루트
  ["c3", "gong4b"],
  // 서문 루트 (s14에서 분기, s10-s9 기존 간선 경유)
  ["s14", "f1"], ["f1", "f2"], ["f2", "s10"], ["s9", "f3"], ["f3", "f4"], ["f4", "f5"], ["f5", "gong4b"],
  // 공4 두 입구 연결
  ["gong4a", "gong4b"],

  // ── 공5 ──
  ["maingate", "k1"], ["k1", "m2"], ["m2", "gong5"],

  // ── 정문 → 제1학생회관 (수집 경로, 정문→1학 순서) ──
  ["maingate", "tp1"], ["tp1", "tp2"], ["tp2", "tp3"], ["tp3", "tp4"],
  ["tp4", "tp5"], ["tp5", "tp6"], ["tp6", "student1"],

  // ══ 2차 수집 경로 간선 ══
  // maingate → SP-N(북부운동장)
  ["maingate", "nb1"], ["nb1", "nb2"], ["nb2", "nb3"], ["nb3", "nb4"],
  ["nb4", "nb5"], ["nb5", "nb6"], ["nb6", "nb7"], ["nb7", "nb8"],
  ["nb8", "nb9"], ["nb9", "nb10"],
  // maingate → 농대
  ["maingate", "ag1"], ["ag1", "ag2"], ["ag2", "ag3"], ["ag3", "ag4"],
  ["ag4", "ag5"], ["ag5", "ag6"], ["ag6", "ag7"], ["ag7", "ag8"],
  ["ag8", "ag9"], ["ag9", "ag10"], ["ag10", "ag11"], ["ag11", "ag12"],
  ["ag12", "ag13"], ["ag13", "ag14"],
  // westgate → SP-A(농대운동장)
  ["westgate", "af1"], ["af1", "af2"], ["af2", "af3"], ["af3", "af4"],
  ["af4", "af5"], ["af5", "af6"], ["af6", "af7"], ["af7", "af8"],
];

// 출발/도착 좌표가 그래프에서 이 거리(m) 이상 떨어져 있으면
// 그래프 라우팅을 포기하고 OSRM 폴백을 쓴다 (엉뚱한 스냅 방지)
export const SNAP_LIMIT_M = 120;

const WALK_SPEED = 1.25; // m/s — 도보 시간 계산용

// --------------------------- 이하 알고리즘 ---------------------------

export function haversine(a, b) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

function nearestNode(p) {
  let best = null;
  let bd = Infinity;
  for (const [id, n] of Object.entries(NODES)) {
    const d = haversine(p, n);
    if (d < bd) {
      bd = d;
      best = id;
    }
  }
  return best ? { id: best, dist: bd } : null;
}

function buildAdjacency() {
  const adj = {};
  for (const [a, b, w = 1] of EDGES) {
    if (!NODES[a] || !NODES[b]) {
      console.warn(`[campusGraph] EDGES에 정의되지 않은 노드: ${a} 또는 ${b}`);
      continue;
    }
    const d = haversine(NODES[a], NODES[b]) * w;
    (adj[a] ??= []).push([b, d]);
    (adj[b] ??= []).push([a, d]);
  }
  return adj;
}

function dijkstra(start, goal) {
  const adj = buildAdjacency();
  const dist = { [start]: 0 };
  const prev = {};
  const visited = new Set();
  for (;;) {
    let u = null;
    let ud = Infinity;
    for (const k in dist) {
      if (!visited.has(k) && dist[k] < ud) {
        u = k;
        ud = dist[k];
      }
    }
    if (u === null) return null; // 도달 불가 (그래프 끊김)
    if (u === goal) break;
    visited.add(u);
    for (const [v, w] of adj[u] || []) {
      if ((dist[v] ?? Infinity) > ud + w) {
        dist[v] = ud + w;
        prev[v] = u;
      }
    }
  }
  const nodes = [goal];
  while (nodes[0] !== start) nodes.unshift(prev[nodes[0]]);
  return { nodes, cost: dist[goal] };
}

/**
 * 캠퍼스 그래프 기반 경로 계산.
 * @param {{lat,lng}} o 출발 좌표  @param {{lat,lng}} d 도착 좌표
 * @returns {null | { coords: {lat,lng}[], distance: m, duration: s, source: "graph" }}
 *   null이면 호출 측에서 OSRM 폴백을 사용할 것.
 */
export function routeOnCampusGraph(o, d) {
  if (Object.keys(NODES).length < 2 || EDGES.length === 0) return null;

  const sn = nearestNode(o);
  const en = nearestNode(d);
  if (!sn || !en) return null;
  if (sn.dist > SNAP_LIMIT_M || en.dist > SNAP_LIMIT_M) return null; // 캠퍼스 밖 등
  if (sn.id === en.id) return null; // 같은 노드에 스냅되면 그래프 의미 없음

  const r = dijkstra(sn.id, en.id);
  if (!r) return null;

  const nodeCoords = r.nodes.map((id) => NODES[id]);
  const coords = [o, ...nodeCoords, d];

  // 실거리 = 스냅 접속 구간 + 그래프 구간(배율 제외한 실제 하버사인 합)
  let distance = sn.dist + en.dist;
  for (let i = 0; i < nodeCoords.length - 1; i++) {
    distance += haversine(nodeCoords[i], nodeCoords[i + 1]);
  }

  return {
    coords,
    distance,
    duration: distance / WALK_SPEED,
    source: "graph",
  };
}
