// 文案 lint：拦截"复制昨天文件"带来的过期/自相矛盾表述。用法: node scripts/lint.mjs YYYY-MM-DD
// ERROR → exit 1，禁止 commit；WARN → 逐条修掉，或在 commit body 的 `lint-ack:` 段写明为何保留（reviewer 会核对）
import { readFileSync, existsSync, readdirSync } from "fs";

const DATE = process.argv[2];
if (!/^\d{4}-\d{2}-\d{2}$/.test(DATE || "")) { console.error("用法: node scripts/lint.mjs YYYY-MM-DD"); process.exit(2); }
const load = d => JSON.parse(readFileSync(`snapshots/${d}.json`, "utf8"));
const snap = load(DATE);
const idx = JSON.parse(readFileSync("snapshots/index.json", "utf8"));
const prevDates = idx.filter(d => d < DATE).sort().reverse(); // 最近的在前
const WIN = ["mtd", "qtd", "ytd"];
const errs = [], warns = [];
const E = (where, msg) => errs.push(`${where}: ${msg}`);
const W = (where, msg) => warns.push(`${where}: ${msg}`);
const cut = (s, n = 90) => (s.length > n ? s.slice(0, n) + "…" : s);

// 窗口档的"作者文字"（不含 news——news.fact 是来源原句）
function authored(p) {
  const out = [];
  for (const k of ["h", "d", "c1", "c4"]) if (p[k]) out.push([k, p[k]]);
  (p.badges || []).forEach((b, i) => out.push([`badges.${i}`, b]));
  (p.kpi || []).forEach((r, i) => out.push([`kpi.${i}`, r.slice(0, 3).join(" ")]));
  (p.chains || []).forEach((c, i) => {
    out.push([`chains.${i}.t`, c.t || ""]);
    out.push([`chains.${i}.d`, c.d || ""]);
    (c.steps || []).forEach((s, j) => out.push([`chains.${i}.steps.${j}`, s]));
  });
  return out.map(([k, s]) => [k, String(s).replace(/<[^>]+>/g, "")]);
}
const sentences = s => s.split(/(?<=[.;:!?])\s+|\s+—\s+/);

// ---------- 1. HEAT 第二列重复涨跌幅（应为水平值或 "—"） ----------
for (const [tier, groups] of Object.entries(snap.HEAT || {}))
  for (const g of groups) for (const it of g.items)
    if (it[1] !== "—" && String(it[1]).trim() === String(it[2]).trim())
      E(`HEAT.${tier}/${g.sec}/${it[0]}`, `第二列 "${it[1]}" 与涨跌幅相同——应填水平值（点位/价格/收益率）或 "—"`);

// ---------- 1b. 每条 chain 标题必须以 ①②③④⑤ 编号（review 2026-10-29 F6）----------
for (const tier of ["today", "mtd", "qtd", "ytd"])
  (snap.P[tier]?.chains || []).forEach((c, i) => {
    const want = "①②③④⑤"[i];
    const m = String(c.t || "").match(/^([①②③④⑤])/);
    if (!m) E(`${tier}.chains.${i}.t`, `标题缺编号——应在开头写 "${want} ${String(c.t || "").slice(0, 30)}…"`);
    else if (m[1] !== want) E(`${tier}.chains.${i}.t`, `标题编号 ${m[1]} 与数组顺序不符（应为 ${want}）`);
  });

// 窗口几何：交易日列表（不含基期）
const mtd = snap.P.mtd, qtd = snap.P.qtd, ytd = snap.P.ytd;
const winDays = mtd.labels.slice(1);
const year = +DATE.slice(0, 4);
const toDate = md => { const [m, d] = md.split("/").map(Number); return new Date(Date.UTC(m > +DATE.slice(5, 7) ? year - 1 : year, m - 1, d)); };
const weekKey = dt => { const x = new Date(dt); x.setUTCDate(x.getUTCDate() - ((x.getUTCDay() + 6) % 7)); return x.toISOString().slice(0, 10); };
const nWeeks = new Set(winDays.map(l => weekKey(toDate(l)))).size;
const sessions = { mtd: mtd.labels.length - 1, qtd: qtd.labels.length - 1 };
const NUM = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20, "twenty-one": 21, "twenty-two": 22, "twenty-three": 23 };
const ORD = { first: 1, second: 2, third: 3, fourth: 4, fifth: 5 };
const num = w => (/^\d+$/.test(w) ? +w : NUM[w.toLowerCase()]);

// S&P 窗口内创纪录收盘：用 ytd 序列中基期及以前的最大值作前高
const baseLbl = mtd.labels[0], bi = ytd.labels.indexOf(baseLbl);
let spxRecords = null;
if (bi >= 0) {
  let hi = Math.max(...ytd.data.slice(0, bi + 1));
  spxRecords = [];
  mtd.data.slice(1).forEach((v, i) => { if (v > hi) { hi = v; spxRecords.push(winDays[i]); } });
}

for (const tier of WIN) {
  const p = snap.P[tier];
  for (const [k, s] of authored(p)) {
    const at = `${tier}.${k}`;
    // ---------- 2. 窗口档出现当日时间词（§2.3：不复述 today） ----------
    const tw = s.match(/\b(tonight|this morning|this afternoon|overnight|at the close today)\b/i);
    if (tw) E(at, `窗口档出现当日时间词 "${tw[0]}"——属于 today 档：「${cut(s)}」`);
    else if (/\btoday\b/i.test(s)) W(at, `窗口档出现 "today"，确认不是在复述当日：「${cut(s)}」`);

    // ---------- 2b. 窗口档禁用相对时间词（next week / this week / last week） ----------
    const rw = s.match(/\b(next|this|last)\s+week\b/i);
    if (rw) E(at, `窗口档出现相对时间词 "${rw[0]}"——改用绝对日期区间（如 10/26-30）：「${cut(s)}」`);

    // ---------- 3. "N sessions" 与窗口交易日数 ----------
    if (tier !== "ytd" || /Q4|quarter|October|month/i.test(s))
      for (const m of s.matchAll(/\b(\d+|[a-z]+(?:-[a-z]+)?) sessions\b/gi)) {
        const n = num(m[1]);
        if (n && n >= 3 && n !== sessions.mtd && n !== sessions.qtd)
          W(at, `"${m[0]}" 与窗口交易日数不符（MTD ${sessions.mtd} / QTD ${sessions.qtd}）——是否抄自前几天未更新？`);
      }

    // ---------- 4. "week two / week-plus" 与窗口所处周次 ----------
    for (const m of s.matchAll(/\bweek[- ](one|two|three|four|five|plus)\b|\b(first|second|third|fourth|fifth) week\b|\bweek-plus\b/gi)) {
      if (/\b(in|during|since|by)\s+(the\s+)?$/i.test(s.slice(0, m.index))) continue; // "came in week one" = 特指某周，放行
      const w = m[1] ? (m[1].toLowerCase() === "plus" ? 1.5 : num(m[1])) : m[2] ? ORD[m[2].toLowerCase()] : 1.5;
      if (w < nWeeks) W(at, `"${m[0]}"：窗口已进入第 ${nWeeks} 周。若在描述当前状态，这是过期标签；若特指某一周，请写出日期区间：「${cut(s)}」`);
    }

    // ---------- 5. 创纪录收盘计数必须点名指数且与序列一致 ----------
    for (const sen of sentences(s))
      for (const m of sen.matchAll(/\b(\d+|one|two|three|four|five|six|seven|eight)\s+record(?:-high)? closes?\b/gi)) {
        const n = num(m[1]);
        const namesOther = /Nasdaq|Dow|Russell|Stoxx|Nikkei|Kospi/i.test(sen);
        if (spxRecords && !namesOther && n !== spxRecords.length)
          W(at, `"${m[0]}"，但 S&P 序列本窗口只有 ${spxRecords.length} 次创纪录收盘（${spxRecords.join(", ") || "无"}）。若指别的指数，必须在同一子句点名：「${cut(sen)}」`);
      }
  }

  // ---------- 5b. 预期概率的"回落/被消化"必须带对照基准 ----------
  for (const [k, s] of authored(p))
    if (/odds|FedWatch|probabilit/i.test(s) && /\b(fell|faded?|eased|dropped|retreated)\b/i.test(s) && !/\b(from|vs\.?|versus|pre-\w+|before|peak)\b/i.test(s))
      W(`${tier}.${k}`, `概率"回落/被消化"没有对照基准——写明相对窗口期初或事件前的净变化（如 22% pre-CPI → 29%），不能只对比事件后峰值：「${cut(s)}」`);

  // ---------- 6. 10Y "band" 断言 vs 本档自己写的 10Y 值 ----------
  const all = authored(p).map(x => x[1]).join(" \n ");
  const band = all.match(/(\d\.\d+)\s*[-–]\s*(\d\.\d+)%\s*(?:is the band|band)/i) || all.match(/band of (\d\.\d+)\s*[-–]\s*(\d\.\d+)%/i);
  if (band) {
    const lo = +band[1], hi = +band[2];
    const vals = [];
    const r10 = (p.tbl || []).find(r => r[0] === "10Y");
    if (r10) vals.push(parseFloat(r10[1]), parseFloat(r10[2]));
    for (const m of all.matchAll(/(?:touch\w*|high of|peak\w*|nea?r(?:ed)?)\D{0,30}?(\d\.\d{2,3})%/gi)) vals.push(+m[1]);
    const out = vals.filter(v => v > 3 && v < 7 && (v < lo - 1e-9 || v > hi + 1e-9));
    if (out.length) W(`${tier}`, `断言 "${band[0]}"，但本档自己写的 10Y 值 ${[...new Set(out)].join("/")}% 落在区间外——删掉 band 说法或改写区间`);
  }

  // ---------- 7. news 日期标签 vs 正文星期 ----------
  (p.chains || []).forEach((c, i) => (c.news || []).forEach((n, j) => {
    const m = String(n.time || "").match(/^(\d{1,2})\/(\d{1,2})/);
    if (!m) return;
    const wd = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][toDate(`${m[1]}/${m[2]}`).getUTCDay()];
    const said = [...String(n.fact).matchAll(/\b(Monday|Tuesday|Wednesday|Thursday|Friday)\b/g)].map(x => x[1]);
    if (said.length && !said.includes(wd))
      W(`${tier}.chains.${i}.news.${j}`, `time "${n.time}" 是 ${wd}，但 fact 讲的是 ${[...new Set(said)].join("/")}——time 应标事件日期，不是文章 URL 日期`);
  }));
}

// ---------- 8. 窗口档论断连续多日基本未改（照抄昨天文件的典型症状） ----------
const norm = s => String(s).toLowerCase().replace(/<[^>]+>/g, "").replace(/[^a-z0-9%$.+-]+/g, " ").trim();
const prevSnaps = prevDates.slice(0, 8).filter(d => existsSync(`snapshots/${d}.json`)).map(load);
const STALE = { mtd: 3, qtd: 3, ytd: 6 }; // YTD 是年度叙事，变化慢，阈值放宽避免告警疲劳
const tokset = s => new Set(norm(s).split(" ").filter(w => w.length > 2));
const jacc = (a, b) => { let i = 0; for (const x of a) if (b.has(x)) i++; return i / (a.size + b.size - i || 1); };
// 只删/加一个尾巴子句也算"没改"：token Jaccard ≥ 0.75
const near = (ns, set) => { if (set.has(ns)) return true; const t = tokset(ns); for (const x of set) if (jacc(t, tokset(x)) >= 0.75) return true; return false; };
for (const tier of WIN) {
  const prevSets = prevSnaps.map(ps => new Set(authored(ps.P[tier] || {}).map(x => norm(x[1]))));
  for (const [k, s] of authored(snap.P[tier])) {
    if (!/^chains\.\d+\.(steps|d)/.test(k) || s.length < 40) continue;
    const ns = norm(s);
    let streak = 0;
    while (streak < prevSets.length && near(ns, prevSets[streak])) streak++;
    if (streak >= STALE[tier])
      W(`${tier}.${k}`, `已连续 ${streak} 份快照基本未改（最早见 ${prevDates[streak - 1]}）——用本窗口最新数据重新验证它是否仍成立，否则改写/删除：「${cut(s)}」`);
  }
}

// ---------- 9. 月=季同基期时，QTD 不得是 MTD 的复本 ----------
if (mtd.labels[0] === qtd.labels[0]) {
  // 整档词汇 Jaccard：不同基期的两档通常 <0.2，照抄改写的同基期两档 ≈0.4
  const toks = s => new Set(norm(s).split(" ").filter(w => w.length > 3));
  const whole = p => toks([p.c1, p.c4, ...p.chains.flatMap(c => [c.t, c.d, ...c.steps])].join(" "));
  const j = jacc(whole(mtd), whole(qtd));
  if (j > 0.3)
    W("qtd", `MTD 与 QTD 同基期，整档用词重合度 ${j.toFixed(2)}（>0.30）——QTD 应换视角（对比上季末、本季剩余关口），见 agent.md §2.3`);
}

// ---------- 10. 窗口档的金额/桶数必须能在 news 里找到出处 ----------
const factNums = new Set();
for (const ps of [snap, ...prevSnaps]) for (const t of ["today", ...WIN]) for (const c of ps.P[t]?.chains || []) for (const n of c.news || [])
  for (const m of String(n.fact).matchAll(/\$?(\d+(?:\.\d+)?)\s?(billion|bn|B|million barrels|M barrels)\b/g)) factNums.add(m[1]);
for (const tier of WIN) for (const [k, s] of authored(snap.P[tier])) {
  if (!k.startsWith("chains")) continue;
  for (const m of s.matchAll(/\$(\d+(?:\.\d+)?)\s?(?:B|bn|billion)\b|(\d+(?:\.\d+)?)M\+? barrels/g)) {
    const v = m[1] || m[2];
    if (!factNums.has(v)) W(`${tier}.${k}`, `"${m[0]}" 在本快照及前 ${prevSnaps.length} 份快照的 news[] 里都找不到出处——补来源 news 或删掉`);
  }
}

// ---------- 11. FX 块：必须是当天 fx.mjs 注入的，不能是复制昨天文件带过来的 ----------
const dataFx = existsSync(`data/${DATE}.json`) ? JSON.parse(readFileSync(`data/${DATE}.json`, "utf8")).fx : null;
const FX = snap.FX;
if (dataFx && Object.keys(dataFx.pairs || {}).length && !FX) E("FX", `data/${DATE}.json 有 FX 数据但快照没有 FX 块——跑 node scripts/fx.mjs ${DATE}`);
if (FX) {
  if (FX.asOf !== DATE) E("FX", `FX.asOf=${FX.asOf} ≠ ${DATE}——FX 块是从前一天文件复制来的，重跑 node scripts/fx.mjs ${DATE}`);
  for (const p of FX.pairs || []) {
    const last = p.series[p.series.length - 1];
    if (last[0] !== DATE) E(`FX.${p.id}`, `序列最后一根是 ${last[0]}，不是 ${DATE}`);
    const dp = dataFx?.pairs?.[p.id];
    if (dp) { const dl = dp.series[dp.series.length - 1][1]; if (Math.abs(dl - last[1]) > Math.abs(dl) * 1e-6) E(`FX.${p.id}`, `快照末值 ${last[1]} ≠ data 末值 ${dl}——重跑 fx.mjs`); }
  }
  // 文中引用的货币对涨跌幅 vs FX 序列现算（today = 日环比；其余档 = 相对基期）
  const pctOf = (p, tier) => {
    const s = p.series, last = s[s.length - 1][1];
    let ref = s[s.length - 2]?.[1];
    if (tier !== "today") { const b = FX.bases[tier]; for (const [d, c] of s) if (d <= b) ref = c; }
    return (last / ref - 1) * 100;
  };
  for (const tier of ["today", ...WIN]) for (const [k, s] of authored(snap.P[tier] || {})) for (const p of FX.pairs) {
    const nm = p.name.replace("/", "\\/?");
    for (const m of s.matchAll(new RegExp(`\\b${nm}\\b[^.;%]{0,40}?([+-−]?\\d+(?:\\.\\d+)?)%`, "gi"))) {
      const v = parseFloat(m[1].replace("−", "-")), calc = pctOf(p, tier);
      if (Math.abs(Math.abs(v) - Math.abs(calc)) > 0.06 || (Math.sign(v) && /^[+-−]/.test(m[1]) && Math.sign(v) !== Math.sign(calc)))
        W(`${tier}.${k}`, `"${m[0]}" 与 FX 序列现算 ${calc >= 0 ? "+" : ""}${calc.toFixed(2)}%（${tier === "today" ? "日环比" : "相对 " + FX.bases[tier]}）不符`);
    }
  }
}

// ---------- 12. data 的日环比必须齐全；HEAT today 必须等于 data 当日涨跌（review 2026-10-26 F2/F3）----------
const DATA = existsSync(`data/${DATE}.json`) ? JSON.parse(readFileSync(`data/${DATE}.json`, "utf8")) : null;
if (DATA) {
  for (const k of ["spx", "dji", "ixic", "vix", "wti", "brent", "gold", "btc", "dxy"]) {
    if (DATA.closes?.[k] && DATA.computed?.[k]?.dayPct == null)
      E(`data.${k}`, `computed.dayPct=null（缺 prev）——取数失败，重拉或按 agent.md §4 manual 流程补齐后再写快照`);
  }
  if (DATA.closes?.tnx && DATA.computed?.tnx?.dayPct == null)
    W("data.tnx", `computed.dayPct=null（缺 prev）——10Y 日变动无法从 data 复核，tbl 的 bp 行另按 Treasury 核对`);
  const HEATMAP = { "S&P 500": "spx", "Dow": "dji", "Nasdaq": "ixic", "VIX": "vix", Brent: "brent", WTI: "wti", "Gold fut": "gold", DXY: "dxy", BTC: "btc" };
  for (const g of snap.HEAT?.today || []) for (const it of g.items || []) {
    const key = HEATMAP[String(it[0]).trim()];
    if (!key) continue;
    const v = DATA.computed?.[key]?.dayPct;
    const shown = parseFloat(String(it[2]).replace("−", "-"));
    if (v == null || !isFinite(shown) || /bp/i.test(String(it[2]))) continue;
    if (Math.abs(shown - v) > 0.06)
      E(`HEAT.today/${it[0]}`, `涨跌幅 ${it[2]} ≠ data 日环比 ${v > 0 ? "+" : ""}${v}%——同一数字只留 data 现值，c1/链文/HEAT 同步改`);
  }

  // ---------- 13. 基线跨日漂移/回退（review 2026-10-28 F6：WTI 90.42 是 Nov 前月、88.42 才是 Dec）----------
  const dataFiles = readdirSync("data").filter(f => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort();
  const prevDataFile = dataFiles.filter(f => f < `${DATE}.json`).pop();
  if (prevDataFile) {
    const PD = JSON.parse(readFileSync(`data/${prevDataFile}`, "utf8"));
    const earlier = dataFiles.filter(f => f < prevDataFile).slice(-30)
      .map(f => { try { return JSON.parse(readFileSync(`data/${f}`, "utf8")); } catch { return null; } })
      .filter(Boolean);
    for (const sym of Object.keys(DATA.closes || {})) {
      const a = DATA.closes[sym], b = PD.closes?.[sym];
      if (!a || !b) continue;
      for (const f of ["mtdBase", "qtdBase", "ytdBase"]) {
        if (a[f] == null || b[f] == null) continue;
        if (Math.abs(a[f] - b[f]) <= Math.abs(b[f]) * 1e-6) continue;
        const reverted = earlier.some(pd => pd.closes?.[sym] && pd.closes[sym][f] != null &&
          Math.abs(pd.closes[sym][f] - a[f]) <= Math.abs(a[f]) * 1e-6);
        const msg = `${sym}.${f} ${b[f]} -> ${a[f]}（vs ${prevDataFile}）`;
        if (reverted)
          E(`data.${sym}`, `基线回退到更早文件用过的值：${msg}——先按合约代码判错侧（CLZ26=Dec vs CL=F=前月；BZZ26 vs BZ=F），禁止把上一合约的基期价当本期`);
        else
          W(`data.${sym}`, `基线变更：${msg}——若是换月/换期，把合约口径写进 foot 并用同合约序列重算`);
      }
    }
  }
}

for (const e of errs) console.log("ERROR " + e);
for (const w of warns) console.log("WARN  " + w);
console.log(`\nlint ${DATE}: ${errs.length} error(s), ${warns.length} warning(s)`);
if (errs.length) process.exit(1);
