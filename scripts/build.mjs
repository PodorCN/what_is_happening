// 用法: node scripts/build.mjs [YYYY-MM-DD]
// 把 data/YYYY-MM-DD.json 的数值注入 index.html 的 KPI/表格/热力图基线注释。
// Chains(文字链) 仍由 agent 按 agent.md 流程写 —— 因为需要读新闻做因果。
// 这个脚本只做“数”的部分，保证 MTD/QTD/YTD 不再手算错。

import { readFileSync, writeFileSync, existsSync } from "fs";

const date = process.argv[2] || new Date().toISOString().slice(0, 10);
const fp = `data/${date}.json`;
if (!existsSync(fp)) { console.error(`missing ${fp}, 先跑 node scripts/fetch.mjs ${date}`); process.exit(1); }
const d = JSON.parse(readFileSync(fp, "utf8"));
const f2 = (n) => n == null ? "—" : Number(n).toFixed(2);
const s = (n) => (n == null ? "—" : (n >= 0 ? "+" : "") + Number(n).toFixed(2) + "%");

console.log("=== 校准表 (贴到网页 P.*.tbl / HEAT 前先核对) ===");
for (const k of ["spx", "dji", "ixic"]) {
  const c = d.closes[k]; if (!c) continue;
  const ytdBase = d.bases.ytd ?? d.bases.ytdBase;
  console.log(`${k}: today ${f2(c.today)} | MTD基(${d.bases.mtdBase}) ${f2(c.mtdBase)} ${s(d.computed[k].mtdPct)} | QTD基(${d.bases.qtdBase}) ${f2(c.qtdBase)} ${s(d.computed[k].qtdPct)} | YTD基(${ytdBase}) ${f2(c.ytdBase)} ${s(d.computed[k].ytdPct)}`);
}
for (const k of ["tnx", "wti", "brent", "gold", "btc", "dxy", "vix"]) {
  const c = d.closes[k]; if (!c) continue;
  const cp = d.computed[k];
  const pct2 = (a,b)=>b==null||a==null?"—":((a-b)/b*100>=0?"+":"")+((a-b)/b*100).toFixed(2)+"%";
  if (cp) console.log(`${k}: today ${f2(c.today)} | mtd ${s(cp.mtdPct)} | qtd ${s(cp.qtdPct)} | ytd ${s(cp.ytdPct)}`);
  else console.log(`${k}: today ${f2(c.today)} | mtd ${pct2(c.today,c.mtdBase)} | qtd ${pct2(c.today,c.qtdBase)} | ytd ${pct2(c.today,c.ytdBase)}`);
}

// 自动更新 index.html 底部的基线注释行，避免网页与 json 脱节
const htmlPath = "index.html";
if (existsSync(htmlPath)) {
  let html = readFileSync(htmlPath, "utf8");
  const line = `收盘基线(auto ${d.date}): ` +
    `SPX ${f2(d.closes.spx?.today)} (${s(d.computed.spx?.mtdPct)} MTD / ${s(d.computed.spx?.qtdPct)} QTD / ${s(d.computed.spx?.ytdPct)} YTD) · ` +
    `DJI ${f2(d.closes.dji?.today)} (${s(d.computed.dji?.mtdPct)} MTD) · ` +
    `IXIC ${f2(d.closes.ixic?.today)} (${s(d.computed.ixic?.ytdPct)} YTD) · ` +
    `10Y ${f2(d.closes.tnx?.today)}% · WTI ${f2(d.closes.wti?.today)} · Gold ${f2(d.closes.gold?.today)} · BTC ${f2(d.closes.btc?.today)}。`;
  if (html.includes("收盘基线(auto")) {
    html = html.replace(/收盘基线\(auto.*?。/, line);
  } else {
    html = html.replace("收盘基线：", "收盘基线：" + line + " [旧手动基线保留] ");
  }
  writeFileSync(htmlPath, html);
  console.log("\nindex.html 基线注释已更新。KPI/HEAT 表格仍需 agent 按校准表手填(见 agent.md Step 4)。");
}
