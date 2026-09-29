// 把当前 index.html 里硬编码的 const P / const HEAT 抽成 snapshots/2026-09-28.json
// 只跑一次（迁移用）。之后每天由 agent 直接写新 snapshot 文件，不再从 html 反提。
import { readFileSync, writeFileSync, mkdirSync } from "fs";

const html = readFileSync("index.html", "utf8");

function extractConst(name) {
  const key = `const ${name}=`;
  const start = html.indexOf(key);
  if (start < 0) throw new Error(`not found ${name}`);
  let i = start + key.length;
  while (html[i] !== "{" && html[i] !== "[") i++;
  const open = html[i];
  const close = open === "{" ? "}" : "]";
  let depth = 0, inStr = null, esc = false;
  for (let j = i; j < html.length; j++) {
    const ch = html[j];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === "\\") esc = true;
      else if (ch === inStr) inStr = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") { inStr = ch; continue; }
    if (ch === open) depth++;
    if (ch === close) { depth--; if (depth === 0) return html.slice(i, j + 1); }
  }
  throw new Error(`unbalanced ${name}`);
}

const P = new Function(`return (${extractConst("P")})`)();
const HEAT = new Function(`return (${extractConst("HEAT")})`)();
const date = "2026-09-28";
mkdirSync("snapshots", { recursive: true });
writeFileSync(`snapshots/${date}.json`, JSON.stringify({ date, updatedAt: new Date().toISOString(), P, HEAT }, null, 2));
writeFileSync("snapshots/index.json", JSON.stringify([date], null, 2));
console.log(`snapshots/${date}.json bytes:`, readFileSync(`snapshots/${date}.json`, "utf8").length);
console.log("periods:", Object.keys(P).join(","), "| heat keys:", Object.keys(HEAT).join(","));
