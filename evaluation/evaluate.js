// =====================================================================
// evaluate.js — 두리번 자연어 파싱 평가 파이프라인 (legacy vs Gemini)
//
// 실행:
//   node evaluation/evaluate.js                # legacy + Gemini (GEMINI_API_KEY 필요)
//   node evaluation/evaluate.js --legacy-only  # legacy만 (API 키 불필요, 오프라인)
//   node evaluation/evaluate.js --gemini-only  # Gemini만
//   node evaluation/evaluate.js --deterministic# Gemini temperature:0 경로로 호출
//   node evaluation/evaluate.js --runs=3        # 3회 반복(변동성 확인)
//   node evaluation/evaluate.js --delay=300     # Gemini 호출 간 간격(ms, 기본 250)
//   node evaluation/evaluate.js --limit=10      # 앞 N개만(빠른 점검)
//
// 산출물(evaluation/results/):
//   evaluation_results.csv  케이스별 원자료
//   summary.csv             지표 요약
//   summary.json            전체 지표 + 보고서용 문장(report_ko)
//
// 원칙: 수치는 전부 실제 실행 결과에서만 나온다. 임의 보정·과장 없음.
//       주장 범위는 "80개 테스트 명령 기준"으로 한정한다.
// =====================================================================

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { parseWithLegacyParser } from "./legacy_parser.js";
import { parseWithGemini, parseWithGeminiDeterministic } from "./gemini_parser.js";
import { canonicalPlace, samePlace } from "./normalize.js";

const __dir = dirname(fileURLToPath(import.meta.url));
const RESULTS_DIR = join(__dir, "results");

// ── CLI ───────────────────────────────────────────────────────
const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const opt = (name, def) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split("=")[1] : def;
};
const CFG = {
  legacyOnly: flag("legacy-only"),
  geminiOnly: flag("gemini-only"),
  deterministic: flag("deterministic"),
  runs: Math.max(1, parseInt(opt("runs", "1"), 10) || 1),
  delay: Math.max(0, parseInt(opt("delay", "250"), 10) || 0),
  limit: parseInt(opt("limit", "0"), 10) || 0,
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── .env 로더 (GEMINI_API_KEY 편의 로드) ────────────────────────
function loadDotEnv() {
  const p = join(__dir, "..", ".env");
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (m && !process.env[m[1]]) {
      let v = m[2].trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      process.env[m[1]] = v;
    }
  }
}
loadDotEnv();

// ── 테스트셋 로드 ───────────────────────────────────────────────
const testPath = join(__dir, "test_cases.json");
let CASES = JSON.parse(readFileSync(testPath, "utf8"));
if (CFG.limit > 0) CASES = CASES.slice(0, CFG.limit);

const runGemini = !CFG.legacyOnly;
const runLegacy = !CFG.geminiOnly;
const geminiFn = CFG.deterministic ? parseWithGeminiDeterministic : parseWithGemini;

// ── 채점 유틸 ──────────────────────────────────────────────────
const has = (v) => v != null && String(v).trim() !== "";
const askedOrigin = (origin, destination) => has(destination) && !has(origin); // 목적지는 있는데 출발지 없음 → 재질문

function gradeSide(pred, c) {
  const oOK = samePlace(pred.origin, c.expected_origin);
  const dOK = samePlace(pred.destination, c.expected_destination);
  return {
    origin_raw: pred.origin ?? "",
    destination_raw: pred.destination ?? "",
    origin_canon: canonicalPlace(pred.origin) ?? "",
    destination_canon: canonicalPlace(pred.destination) ?? "",
    origin_correct: oOK,
    destination_correct: dOK,
    pair_correct: oOK && dOK,
    asked_origin: askedOrigin(pred.origin, pred.destination),
  };
}

// ── 실행 (runs회 반복) ─────────────────────────────────────────
async function runOnce(runIdx) {
  const rows = [];
  for (const c of CASES) {
    const row = { run: runIdx, id: c.id, category: c.category, alias_type: c.alias_type,
                  input: c.input, expected_origin: c.expected_origin, expected_destination: c.expected_destination };

    if (runLegacy) {
      const lp = parseWithLegacyParser(c.input);
      const g = gradeSide(lp, c);
      row.legacy_origin = g.origin_raw;
      row.legacy_destination = g.destination_raw;
      row.legacy_origin_correct = g.origin_correct;
      row.legacy_destination_correct = g.destination_correct;
      row.legacy_pair_correct = g.pair_correct;
      row.legacy_asked_origin = g.asked_origin;
      row.legacy_status = lp.status;
    }

    if (runGemini) {
      const gp = await geminiFn(c.input, {});
      const g = gradeSide(gp, c);
      row.llm_origin = g.origin_raw;
      row.llm_destination = g.destination_raw;
      row.llm_origin_correct = g.origin_correct;
      row.llm_destination_correct = g.destination_correct;
      row.llm_pair_correct = g.pair_correct;
      row.llm_asked_origin = g.asked_origin;
      row.llm_status = gp.status;
      row.llm_response_time_ms = Math.round(gp.response_time_ms || 0);
      row.llm_attempts = gp.attempts || 1;
      row.llm_error = gp.error || "";
      if (CFG.delay) await sleep(CFG.delay);
    }
    rows.push(row);
    // 진행 표시 (터미널에서만; 로그 파이프 시 생략)
    if (process.stdout.isTTY) {
      const tag = runGemini ? (row.llm_status || "") : (row.legacy_status || "");
      process.stdout.write(`\r  run${runIdx} 진행: ${rows.length}/${CASES.length}  [${tag}]     `);
    }
  }
  if (process.stdout.isTTY) process.stdout.write("\n");
  return rows;
}

// ── 지표 계산 ──────────────────────────────────────────────────
const pct = (n, d) => (d ? (n / d) * 100 : 0);
const round1 = (x) => Math.round(x * 10) / 10;

function accFor(rows, side, field, subsetPred = () => true) {
  // side: 'legacy'|'llm', field: 'origin'|'destination'|'pair'
  let n = 0, ok = 0;
  for (const r of rows) {
    if (!subsetPred(r)) continue;
    if (side === "llm") {
      const st = r.llm_status;
      if (st === "API_ERROR" || st === "TIMEOUT") continue; // 인프라 오류는 분모 제외
    }
    n++;
    if (r[`${side}_${field}_correct`]) ok++;
  }
  return { n, ok, acc: round1(pct(ok, n)) };
}

function clarRate(rows, side) {
  let n = 0, asked = 0;
  for (const r of rows) {
    if (side === "llm") {
      const st = r.llm_status;
      if (st === "API_ERROR" || st === "TIMEOUT") continue;
    }
    n++;
    if (r[`${side}_asked_origin`]) asked++;
  }
  return round1(pct(asked, n));
}

function respTimeStats(rows) {
  const t = rows.filter((r) => r.llm_status === "SUCCESS" && r.llm_response_time_ms != null)
                .map((r) => r.llm_response_time_ms).sort((a, b) => a - b);
  if (!t.length) return null;
  const sum = t.reduce((a, b) => a + b, 0);
  const q = (p) => t[Math.min(t.length - 1, Math.floor(p * (t.length - 1)))];
  const median = t.length % 2 ? t[(t.length - 1) / 2] : Math.round((t[t.length/2 - 1] + t[t.length/2]) / 2);
  return { count: t.length, avg: Math.round(sum / t.length), min: t[0], max: t[t.length - 1], median, p95: q(0.95) };
}

function infraErrors(rows) {
  const api = rows.filter((r) => r.llm_status === "API_ERROR").length;
  const to = rows.filter((r) => r.llm_status === "TIMEOUT").length;
  const parse = rows.filter((r) => r.llm_status === "PARSE_ERROR").length;
  return { api, timeout: to, parse };
}

const CATS = ["formal", "abbreviation", "variant", "natural"];

function metricsBundle(rows) {
  const bundle = { overall: {}, byCategory: {} };
  const sides = [];
  if (runLegacy) sides.push("legacy");
  if (runGemini) sides.push("llm");

  for (const side of sides) {
    bundle.overall[side] = {
      origin: accFor(rows, side, "origin"),
      destination: accFor(rows, side, "destination"),
      pair: accFor(rows, side, "pair"),
      clarification_rate: clarRate(rows, side),
    };
    bundle.byCategory[side] = {};
    for (const cat of CATS) {
      const pred = (r) => r.category === cat;
      bundle.byCategory[side][cat] = {
        origin: accFor(rows, side, "origin", pred),
        destination: accFor(rows, side, "destination", pred),
        pair: accFor(rows, side, "pair", pred),
      };
    }
  }
  if (runGemini) {
    bundle.response_time = respTimeStats(rows);
    bundle.infra_errors = infraErrors(rows);
  }
  return bundle;
}

// ── 개선폭 계산 (legacy→llm) ───────────────────────────────────
function improvements(overall) {
  if (!(overall.legacy && overall.llm)) return null;
  const out = {};
  for (const field of ["origin", "destination", "pair"]) {
    const L = overall.legacy[field].acc, G = overall.llm[field].acc;
    const errL = 100 - L, errG = 100 - G;
    out[field] = {
      legacy: L, llm: G,
      diff_pp: round1(G - L),
      relative_pct: L > 0 ? round1(((G - L) / L) * 100) : null,
      error_reduction_pct: errL > 0 ? round1(((errL - errG) / errL) * 100) : null,
    };
  }
  return out;
}

// ── CSV 작성 ───────────────────────────────────────────────────
function toCSV(rows) {
  if (!rows.length) return "";
  const cols = Object.keys(rows[0]);
  const esc = (v) => {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const head = cols.join(",");
  const body = rows.map((r) => cols.map((c) => esc(r[c])).join(",")).join("\n");
  return head + "\n" + body + "\n";
}

// ── 보고서 문장 (실수치 기반, 과장 없음) ─────────────────────────
function buildReportKo(bundle, imp, meta) {
  const n = meta.caseCount;
  const lines = [];
  lines.push(`※ 아래 수치는 두리번 ${n}개 테스트 명령을 동일 조건으로 평가한 실제 실행 결과입니다.`);
  if (runLegacy && runGemini && imp) {
    const p = imp.pair, o = imp.origin, d = imp.destination;
    lines.push(
      `쌍(출발지+목적지 동시 정답) 정확도는 기존 규칙·키워드 방식 ${p.legacy}%에서 ` +
      `Gemini 의미 해석 방식 ${p.llm}%로 ${p.diff_pp >= 0 ? "+" : ""}${p.diff_pp}%p 변화했습니다` +
      (p.error_reduction_pct != null ? ` (오류 ${p.error_reduction_pct}% 감소).` : ".")
    );
    lines.push(
      `세부적으로 출발지 정확도는 ${o.legacy}%→${o.llm}% (${o.diff_pp >= 0 ? "+" : ""}${o.diff_pp}%p), ` +
      `목적지 정확도는 ${d.legacy}%→${d.llm}% (${d.diff_pp >= 0 ? "+" : ""}${d.diff_pp}%p)로 나타났습니다.`
    );
    const cl = bundle.overall;
    lines.push(
      `불필요한 출발지 재질문 비율은 기존 ${cl.legacy.clarification_rate}%에서 ` +
      `Gemini ${cl.llm.clarification_rate}%로 집계되었습니다.`
    );
  } else if (runLegacy) {
    const o = bundle.overall.legacy;
    lines.push(
      `기존 규칙·키워드 방식 기준: 출발지 ${o.origin.acc}%, 목적지 ${o.destination.acc}%, ` +
      `쌍 정확도 ${o.pair.acc}%, 재질문율 ${o.clarification_rate}%. ` +
      `(Gemini 측 수치는 GEMINI_API_KEY 설정 후 재실행 시 채워집니다.)`
    );
  } else if (runGemini) {
    const o = bundle.overall.llm;
    lines.push(`Gemini 방식 기준: 출발지 ${o.origin.acc}%, 목적지 ${o.destination.acc}%, 쌍 정확도 ${o.pair.acc}%.`);
  }
  if (bundle.response_time) {
    const rt = bundle.response_time;
    lines.push(`Gemini 평균 응답시간은 ${rt.avg}ms (중앙값 ${rt.median}ms, 최소 ${rt.min}ms, 최대 ${rt.max}ms, p95 ${rt.p95}ms)였습니다.`);
  }
  if (bundle.infra_errors && (bundle.infra_errors.api || bundle.infra_errors.timeout)) {
    lines.push(`참고: API 오류 ${bundle.infra_errors.api}건, 타임아웃 ${bundle.infra_errors.timeout}건은 인식 정확도 분모에서 제외했습니다.`);
  }
  return lines.join("\n");
}

// ── 콘솔 표 출력 ───────────────────────────────────────────────
function printSummary(bundle, imp) {
  const o = bundle.overall;
  console.log("\n================ 두리번 파싱 평가 요약 ================");
  console.log(`테스트 명령 수: ${CASES.length}개  |  반복: ${CFG.runs}회  |  모드: ${CFG.deterministic ? "deterministic(temp=0)" : "production(default temp)"}`);
  const rowfmt = (label, L, G) =>
    `${label.padEnd(14)} | legacy ${String(L ?? "-").padStart(6)}% | Gemini ${String(G ?? "-").padStart(6)}%`;
  if (runLegacy || runGemini) {
    console.log("\n[전체]");
    console.log(rowfmt("출발지 정확도", o.legacy?.origin.acc, o.llm?.origin.acc));
    console.log(rowfmt("목적지 정확도", o.legacy?.destination.acc, o.llm?.destination.acc));
    console.log(rowfmt("쌍 정확도", o.legacy?.pair.acc, o.llm?.pair.acc));
    console.log(rowfmt("재질문율", o.legacy?.clarification_rate, o.llm?.clarification_rate));
  }
  if (imp) {
    console.log("\n[개선폭] 쌍 정확도 " +
      `${imp.pair.diff_pp >= 0 ? "+" : ""}${imp.pair.diff_pp}%p` +
      (imp.pair.relative_pct != null ? ` (상대 ${imp.pair.relative_pct}%)` : "") +
      (imp.pair.error_reduction_pct != null ? ` · 오류 ${imp.pair.error_reduction_pct}% 감소` : ""));
  }
  console.log("\n[카테고리별 쌍 정확도]");
  for (const cat of CATS) {
    const L = bundle.byCategory.legacy?.[cat]?.pair.acc;
    const G = bundle.byCategory.llm?.[cat]?.pair.acc;
    console.log(`  ${cat.padEnd(13)} | legacy ${String(L ?? "-").padStart(6)}% | Gemini ${String(G ?? "-").padStart(6)}%`);
  }
  if (bundle.response_time) {
    const rt = bundle.response_time;
    console.log(`\n[Gemini 응답시간] avg ${rt.avg}ms · median ${rt.median}ms · min ${rt.min}ms · max ${rt.max}ms · p95 ${rt.p95}ms`);
  }
  if (bundle.infra_errors) {
    console.log(`[인프라] API오류 ${bundle.infra_errors.api} · 타임아웃 ${bundle.infra_errors.timeout} · JSON파싱실패 ${bundle.infra_errors.parse}`);
  }
  console.log("======================================================\n");
}

// ── main ───────────────────────────────────────────────────────
(async () => {
  console.log(`▶ 두리번 평가 시작 — ${CASES.length}개 명령, ${CFG.runs}회 반복` +
              `${runLegacy ? " · legacy" : ""}${runGemini ? " · Gemini" : ""}` +
              `${CFG.deterministic ? " (deterministic)" : ""}`);
  if (runGemini && !process.env.GEMINI_API_KEY) {
    console.log("  ⚠ GEMINI_API_KEY 가 없어 Gemini 호출은 API_ERROR 로 기록됩니다.");
    console.log("    → 오프라인에서 legacy만 보려면: node evaluation/evaluate.js --legacy-only");
  }

  const allRows = [];
  const perRunBundles = [];
  for (let k = 1; k <= CFG.runs; k++) {
    const rows = await runOnce(k);
    allRows.push(...rows);
    perRunBundles.push(metricsBundle(rows));
  }

  // 반복 평균 (runs>1): pair 정확도 평균±표준편차
  const primaryBundle = perRunBundles.length === 1
    ? perRunBundles[0]
    : metricsBundle(allRows); // 여러 run 합산 기준 지표
  const imp = improvements(primaryBundle.overall);

  let variance = null;
  if (CFG.runs > 1) {
    const grab = (b, side) => b.overall[side]?.pair.acc ?? null;
    const mkStats = (side) => {
      const xs = perRunBundles.map((b) => grab(b, side)).filter((x) => x != null);
      if (!xs.length) return null;
      const mean = xs.reduce((a, c) => a + c, 0) / xs.length;
      const sd = Math.sqrt(xs.reduce((a, c) => a + (c - mean) ** 2, 0) / xs.length);
      return { runs: xs, mean: round1(mean), stdev: round1(sd) };
    };
    variance = { legacy_pair: mkStats("legacy"), llm_pair: mkStats("llm") };
  }

  const meta = {
    generated_at: new Date().toISOString(),
    caseCount: CASES.length,
    runs: CFG.runs,
    mode: CFG.deterministic ? "deterministic(temperature=0)" : "production(default temperature)",
    gemini_evaluated: runGemini,
    legacy_evaluated: runLegacy,
    model: "gemini-3.6-flash",
    note: "수치는 실제 실행 결과이며 80개 테스트 명령 기준으로 해석해야 함. 임의 보정·과장 없음.",
  };
  const report_ko = buildReportKo(primaryBundle, imp, meta);

  // ── 파일 출력 ─────────────────────────────────────────────────
  writeFileSync(join(RESULTS_DIR, "evaluation_results.csv"), toCSV(allRows), "utf8");

  // summary.csv (지표 행렬)
  const scRows = [];
  const push = (metric, L, G) => scRows.push({
    Metric: metric,
    Legacy: L ?? "", LLM: G ?? "",
    Difference_pp: (L != null && G != null) ? round1(G - L) : "",
  });
  const ov = primaryBundle.overall;
  push("Origin Accuracy (%)", ov.legacy?.origin.acc, ov.llm?.origin.acc);
  push("Destination Accuracy (%)", ov.legacy?.destination.acc, ov.llm?.destination.acc);
  push("Pair Accuracy (%)", ov.legacy?.pair.acc, ov.llm?.pair.acc);
  push("Unnecessary Clarification Rate (%)", ov.legacy?.clarification_rate, ov.llm?.clarification_rate);
  for (const cat of CATS) {
    push(`Pair Accuracy · ${cat} (%)`,
      primaryBundle.byCategory.legacy?.[cat]?.pair.acc,
      primaryBundle.byCategory.llm?.[cat]?.pair.acc);
  }
  if (primaryBundle.response_time) {
    const rt = primaryBundle.response_time;
    scRows.push({ Metric: "Gemini Response avg (ms)", Legacy: "", LLM: rt.avg, Difference_pp: "" });
    scRows.push({ Metric: "Gemini Response median (ms)", Legacy: "", LLM: rt.median, Difference_pp: "" });
    scRows.push({ Metric: "Gemini Response p95 (ms)", Legacy: "", LLM: rt.p95, Difference_pp: "" });
    scRows.push({ Metric: "Gemini Response min/max (ms)", Legacy: "", LLM: `${rt.min}/${rt.max}`, Difference_pp: "" });
  }
  writeFileSync(join(RESULTS_DIR, "summary.csv"), toCSV(scRows), "utf8");

  // summary.json (전체)
  const summary = { meta, overall: primaryBundle.overall, byCategory: primaryBundle.byCategory,
                    improvements: imp, response_time: primaryBundle.response_time || null,
                    infra_errors: primaryBundle.infra_errors || null, variance, report_ko };
  writeFileSync(join(RESULTS_DIR, "summary.json"), JSON.stringify(summary, null, 2) + "\n", "utf8");

  // ── 콘솔 ─────────────────────────────────────────────────────
  printSummary(primaryBundle, imp);
  if (variance) {
    console.log("[반복 변동성 — 쌍 정확도]");
    if (variance.legacy_pair) console.log(`  legacy: ${variance.legacy_pair.mean}% ± ${variance.legacy_pair.stdev} (runs: ${variance.legacy_pair.runs.join(", ")})`);
    if (variance.llm_pair)    console.log(`  Gemini: ${variance.llm_pair.mean}% ± ${variance.llm_pair.stdev} (runs: ${variance.llm_pair.runs.join(", ")})`);
    console.log("");
  }
  console.log("── 보고서용 문장 ──");
  console.log(report_ko);
  console.log("\n산출물: evaluation/results/{evaluation_results.csv, summary.csv, summary.json}");
})();
