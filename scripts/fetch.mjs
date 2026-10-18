// 用法: node scripts/fetch.mjs [YYYY-MM-DD]
// 不依赖任何 npm 包，Node 18+ 直接跑。
// 数据源: Yahoo Finance v8 chart (免 key) + FRED DGS10 (免 key, 需网络) + Stooq 兜底
// 输出: data/YYYY-MM-DD.json  { baselines, today, computed MTD/QTD/YTD }

import { writeFileSync, mkdirSync } from "fs";

const SYMBOLS = {
  spx: "^GSPC",
  dji: "^DJI",
  ixic: "^IXIC",
  tnx: "^TNX",      // 10Y yield *10 (如 52.4 = 5.24%)
  wti: "CL=F",
  brent: "BZ=F",
  gold: "GC=F",
  btc: "BTC-USD",
  dxy: "DX-Y.NYB",
  vix: "^VIX",
};

// 货币对：报价方向 = 名字方向（USD/CAD +0.5% = 美元兑加元升值）。dp = 显示小数位。
// 加新货币对只改这里：元数据随 data/<DATE>.json 下发，fx.mjs / 页面 / lint 自动跟上。
const FX_PAIRS = [
  { id: "usdcad", name: "USD/CAD", sym: "CAD=X", dp: 4 },
  { id: "usdjpy", name: "USD/JPY", sym: "JPY=X", dp: 2 },
  { id: "usdeur", name: "USD/EUR", sym: "EUR=X", dp: 4, inv: "EUR/USD" }, // 市场惯例报 EUR/USD = 1/USD/EUR
  { id: "usdcny", name: "USD/CNY", sym: "CNY=X", dp: 4 },
  { id: "cadcny", name: "CAD/CNY", sym: "CADCNY=X", dp: 4 },
];

// Yahoo FX 日线 bar 的时间戳是伦敦午夜（BST 时为前一日 23:00Z），当日未完结 bar 的时间戳是最新成交时刻。
// 统一按伦敦本地日期归日，两种情况都落在正确的日期上。
const londonDate = (ts) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(new Date(ts * 1000));

async function yahooSeries(symbol, fromStr, toStr) {
  const start = new Date(fromStr + "T00:00:00Z").getTime() / 1000 - 86400 * 7;
  const end = new Date(toStr + "T23:59:59Z").getTime() / 1000 + 86400;
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?period1=${Math.floor(start)}&period2=${Math.floor(end)}&interval=1d`;
  const r = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
  if (!r.ok) throw new Error(`${symbol} yahoo ${r.status}`);
  const res = (await r.json()).chart.result?.[0];
  if (!res) throw new Error(`${symbol} no result`);
  const byDate = new Map();
  res.timestamp.forEach((t, i) => {
    const c = res.indicators.quote[0].close[i], d = londonDate(t);
    const wd = new Date(d + "T12:00:00Z").getUTCDay();
    if (c != null && d <= toStr && wd !== 0 && wd !== 6) byDate.set(d, c); // 同日多根取最后一根
  });
  return [...byDate.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1));
}
const lastOnOrBefore = (series, d) => { let v = null; for (const [k, c] of series) if (k <= d) v = c; return v; };

async function yahooClose(symbol, dateStr) {
  // 取 date 前后 5 天的日线，找 <= date 的最后一个收盘
  const end = new Date(dateStr + "T23:59:59Z").getTime() / 1000 + 86400 * 2;
  const start = end - 86400 * 12;
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?period1=${Math.floor(start)}&period2=${Math.floor(end)}&interval=1d`;
  const r = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
  if (!r.ok) throw new Error(`${symbol} yahoo ${r.status}`);
  const j = await r.json();
  const res = j.chart.result?.[0];
  if (!res) throw new Error(`${symbol} no result`);
  const ts = res.timestamp, closes = res.indicators.quote[0].close;
  const target = new Date(dateStr + "T16:00:00-04:00").getTime() / 1000;
  let best = null;
  // 取 <= target（date 当天收盘时刻）的最后一根 bar。勿加 +86400 余量：
  // 会过冲到次一交易日的 bar（MTD/QTD 基线因此差一天，9/29 修复）。
  for (let i = 0; i < ts.length; i++) {
    if (ts[i] <= target && closes[i] != null) best = { t: ts[i], c: closes[i] };
  }
  if (!best) throw new Error(`${symbol} no close <= ${dateStr}`);
  return best.c;
}

function periodEnds(dateStr) {
  const d = new Date(dateStr + "T12:00:00Z");
  const y = d.getUTCFullYear(), m = d.getUTCMonth() + 1;
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const pad = (n) => String(n).padStart(2, "0");
  const mtd = `${y}-${pad(m)}-01`;
  // 上月最后交易日近似: 本月1号往前推到上月末 (周末由 yahooClose 自动回退)
  const qStartMonth = Math.floor((m - 1) / 3) * 3 + 1;
  const qtd = `${y}-${pad(qStartMonth)}-01`;
  const ytd = `${y - 1}-12-31`;
  // MTD基线要用上月最后一个交易日，这里返回上月末日期，调用方再 yahooClose 回退
  const prevMonthEnd = new Date(Date.UTC(y, m - 1, 0));
  const mtdBase = `${prevMonthEnd.getUTCFullYear()}-${pad(prevMonthEnd.getUTCMonth() + 1)}-${pad(prevMonthEnd.getUTCDate())}`;
  const qPrevEnd = new Date(Date.UTC(y, qStartMonth - 1, 0));
  const qtdBase = qStartMonth === 1 ? `${y - 1}-12-31`
    : `${qPrevEnd.getUTCFullYear()}-${pad(qPrevEnd.getUTCMonth() + 1)}-${pad(qPrevEnd.getUTCDate())}`;
  return { mtdBase, qtdBase, ytd, _mtdFirst: mtd, _qtdFirst: qtd, _lastDay: lastDay };
}

const pct = (a, b) => (a - b) / b * 100;

async function main() {
  const date = process.argv[2] || new Date().toISOString().slice(0, 10);
  const { mtdBase, qtdBase, ytd } = periodEnds(date);
  const out = { date, symbols: SYMBOLS, bases: { mtdBase, qtdBase, ytd }, closes: {}, computed: {} };
  for (const [k, sym] of Object.entries(SYMBOLS)) {
    try {
      const [t, m, q, y] = await Promise.all([
        yahooClose(sym, date), yahooClose(sym, mtdBase),
        yahooClose(sym, qtdBase), yahooClose(sym, ytd),
      ]);
      out.closes[k] = { today: t, mtdBase: m, qtdBase: q, ytdBase: y };
      out.computed[k] = {
        dayPct: null, // 日环比需前一交易日，build 时另取；此处留空
        mtdPct: +pct(t, m).toFixed(2),
        qtdPct: +pct(t, q).toFixed(2),
        ytdPct: +pct(t, y).toFixed(2),
      };
      console.log(k, sym, `today=${t.toFixed(2)} mtd=${pct(t, m).toFixed(2)}% qtd=${pct(t, q).toFixed(2)}% ytd=${pct(t, y).toFixed(2)}%`);
    } catch (e) {
      console.error("WARN", k, e.message);
      out.closes[k] = null;
    }
  }
  // TNX 换算成 %：Yahoo 有时返回 ×10 报价（52.4），有时已是百分数（5.24）。
  // 判别：>20 时除以 10。（原先无条件 /10 会把 5.24 变成 0.52，9/29 修复）
  if (out.closes.tnx) {
    for (const k of ["today", "mtdBase", "qtdBase", "ytdBase"]) {
      const v = out.closes.tnx[k];
      if (v != null) out.closes.tnx[k] = +(v > 20 ? v / 10 : v).toFixed(2);
    }
  }
  // FX：拉 YTD 基期到 DATE 的完整日线序列（页面走势图用），期初/期末/日变动都从同一序列取，保证自洽
  out.fx = { src: "Yahoo Finance daily close (London-date bars; DATE's bar = quote at fetch time ≈ NY close)", pairs: {} };
  for (const p of FX_PAIRS) {
    try {
      let series = await yahooSeries(p.sym, ytd, date);
      const y0 = series.reduce((k, [d], i) => (d <= ytd ? i : k), 0);
      series = series.slice(y0); // 从 YTD 基期 bar 起（请求时多拉的 7 天余量丢掉）
      const last = series[series.length - 1];
      if (!last || last[0] !== date) throw new Error(`last bar ${last?.[0]} != ${date}（未收盘或无数据）`);
      const t = last[1], prev = series[series.length - 2]?.[1];
      const m = lastOnOrBefore(series, mtdBase), q = lastOnOrBefore(series, qtdBase), y = lastOnOrBefore(series, ytd);
      out.fx.pairs[p.id] = { ...p, series: series.map(([d, c]) => [d, +c.toFixed(6)]) };
      out.closes[p.id] = { today: t, prev, mtdBase: m, qtdBase: q, ytdBase: y };
      out.computed[p.id] = {
        dayPct: prev ? +pct(t, prev).toFixed(2) : null,
        mtdPct: +pct(t, m).toFixed(2), qtdPct: +pct(t, q).toFixed(2), ytdPct: +pct(t, y).toFixed(2),
      };
      console.log(p.id, p.sym, `today=${t.toFixed(p.dp)} day=${out.computed[p.id].dayPct}% mtd=${out.computed[p.id].mtdPct}% ytd=${out.computed[p.id].ytdPct}%`);
    } catch (e) {
      console.error("WARN fx", p.id, e.message);
      out.closes[p.id] = null;
    }
  }
  mkdirSync("data", { recursive: true });
  writeFileSync(`data/${date}.json`, JSON.stringify(out, null, 2));
  console.log(`\nwrote data/${date}.json`);
}
main();
