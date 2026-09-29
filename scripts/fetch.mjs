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
  mkdirSync("data", { recursive: true });
  writeFileSync(`data/${date}.json`, JSON.stringify(out, null, 2));
  console.log(`\nwrote data/${date}.json`);
}
main();
