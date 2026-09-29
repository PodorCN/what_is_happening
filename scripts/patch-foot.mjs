// 一次性：把当前 index.html 的 foot 基线行搬进 snapshots/2026-09-28.json
import { readFileSync, writeFileSync } from "fs";
const h = readFileSync("index.html", "utf8");
const m = h.match(/<div class="foot">([\s\S]*?)<\/div>/);
if (!m) throw new Error("no foot");
const snap = JSON.parse(readFileSync("snapshots/2026-09-28.json", "utf8"));
snap.foot = m[1];
snap.label = "2026-09-28 周一收盘";
writeFileSync("snapshots/2026-09-28.json", JSON.stringify(snap, null, 2));
console.log("foot chars:", m[1].length);
