// 文案 lint：拦截"复制昨天文件"带来的过期/自相矛盾表述。用法: node scripts/lint.mjs YYYY-MM-DD
// ERROR → exit 1，禁止 commit；WARN → 逐条修掉，或在 commit body 的 `lint-ack:` 段写明为何保留（reviewer 会核对）
import { readFileSync, existsSync } from "fs";
import { execFileSync } from "child_process";

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

// ---------- 11. 引文完整性：news.fact 是来源原句，修订时不得往里追加/改写文字 ----------
// 基准 = writer 首次提交的同日快照 + 前几份快照里同一 URL 的引文。
// 原句 + 尾巴 = ERROR（10/19：fixer 在 Bloomberg 原句后接了一句原文没有的话）；同 URL 下引文被改写 = WARN（须逐字核对定稿页并 lint-ack）。
const sq = s => String(s).replace(/\s+/g, " ").trim();
let firstVer = null;
try {
  const git = (...a) => execFileSync("git", a, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  const added = git("log", "--diff-filter=A", "--format=%H", "--", `snapshots/${DATE}.json`).trim().split("\n").pop();
  if (added) firstVer = JSON.parse(git("show", `${added}:snapshots/${DATE}.json`));
} catch (e) { /* 无 git 或文件未提交（writer 首写）→ 只比对前几份快照 */ }
const quotesByUrl = (ps, m = new Map()) => {
  for (const t of ["today", ...WIN]) for (const c of ps?.P?.[t]?.chains || []) for (const n of c.news || [])
    if (n.u) (m.get(n.u) || m.set(n.u, new Set()).get(n.u)).add(sq(n.fact));
  return m;
};
const origQ = firstVer ? quotesByUrl(firstVer) : new Map();
const knownQ = quotesByUrl(firstVer || {}, new Map());
for (const ps of prevSnaps) quotesByUrl(ps, knownQ);
for (const tier of ["today", ...WIN]) (snap.P[tier].chains || []).forEach((c, i) => (c.news || []).forEach((n, j) => {
  const at = `${tier}.chains.${i}.news.${j}`, f = sq(n.fact), known = knownQ.get(n.u);
  if (!known || known.has(f)) return;
  const base = [...known].find(k => k.length >= 40 && f !== k && (f.startsWith(k) || f.endsWith(k)));
  const extra = base && (f.startsWith(base) ? f.slice(base.length) : f.slice(0, f.length - base.length)).trim();
  if (base) E(at, `引文在原句基础上被追加了文字（原句见首版快照/前几份快照同一 URL）——news.fact 只能是来源原句，作者判断写进 steps/d：「${cut(extra)}」`);
  else if (origQ.has(n.u)) W(at, `同一 URL 下的引文与 writer 首版不同——须在 news.u 定稿页逐字检索确认，并在 commit body 的 lint-ack 写明：「${cut(f)}」`);
}));

// ---------- 12. 当日重要数据发布 CAL（只放 DATE 当天公布的） ----------
if (snap.CAL) {
  if (snap.CAL.board || snap.CAL.items?.some(it => it.grp)) E("CAL", "CAL 只保留 items（当日发布），不要 board/grp——见 agent.md §2.6");
  (snap.CAL.items || []).forEach((it, i) => {
    const at = `CAL.items.${i}`;
    if (it.date !== DATE) E(at, `${it.ev} 的 date "${it.date}" 不是快照日 ${DATE}——CAL 只放当天（发布地日期）公布的数据，不放历史或未来日程`);
    if (!/^https?:\/\//.test(it.u || "") || !it.src) E(at, `${it.ev}：缺 src 或 u 不是真 URL`);
    if (it.act == null) W(at, `${it.ev} 没有 actual——当日已公布的数据必须填实际值，拿不到就删掉该行`);
  });
}

for (const e of errs) console.log("ERROR " + e);
for (const w of warns) console.log("WARN  " + w);
console.log(`\nlint ${DATE}: ${errs.length} error(s), ${warns.length} warning(s)`);
if (errs.length) process.exit(1);
