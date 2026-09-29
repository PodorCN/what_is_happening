// 用法: node scripts/build-shell.mjs [YYYY-MM-DD]
// 把 shell.html + snapshots/<date>.json 合成 index.html（内嵌最新快照做 file:// 兜底）。
// 默认用 snapshots/index.json 里最后一个日期。
import { readFileSync, writeFileSync } from "fs";

const idx = JSON.parse(readFileSync("snapshots/index.json", "utf8"));
const date = process.argv[2] || idx[idx.length - 1];
const snap = JSON.parse(readFileSync(`snapshots/${date}.json`, "utf8"));
const shell = readFileSync("shell.html", "utf8");
if (!shell.includes("<!--EMBEDDED-->")) throw new Error("shell.html 缺少 <!--EMBEDDED--> 占位");
const out = shell.replace("<!--EMBEDDED-->", () => JSON.stringify(snap));
writeFileSync("index.html", out);
console.log(`index.html <= shell.html + snapshots/${date}.json (${JSON.stringify(snap).length} bytes embedded)`);
