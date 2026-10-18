// 把 data/<DATE>.json 的 FX 序列注入 snapshots/<DATE>.json 的 FX 块。用法: node scripts/fx.mjs YYYY-MM-DD
// FX 卡片的数字全部来自这里（页面按档切片现算涨跌/高低），writer 不手填 FX 数字。
import { readFileSync, writeFileSync, existsSync } from "fs";

const DATE = process.argv[2];
if (!/^\d{4}-\d{2}-\d{2}$/.test(DATE || "")) { console.error("用法: node scripts/fx.mjs YYYY-MM-DD"); process.exit(2); }
const dataPath = `data/${DATE}.json`, snapPath = `snapshots/${DATE}.json`;
for (const f of [dataPath, snapPath]) if (!existsSync(f)) { console.error(`missing ${f}`); process.exit(1); }

const d = JSON.parse(readFileSync(dataPath, "utf8"));
const pairs = Object.values(d.fx?.pairs || {});
if (!pairs.length) { console.error(`${dataPath} 没有 fx 数据——先跑 node scripts/fetch.mjs ${DATE}（Yahoo 不通时 FX 卡片留空，不要手填）`); process.exit(1); }

const raw = readFileSync(snapPath, "utf8");
const snap = JSON.parse(raw);
snap.FX = {
  asOf: DATE,
  src: d.fx.src,
  bases: { mtd: d.bases.mtdBase, qtd: d.bases.qtdBase, ytd: d.bases.ytd },
  pairs: pairs.map(p => ({
    id: p.id, name: p.name, dp: p.dp, ...(p.inv ? { inv: p.inv } : {}),
    series: p.series.map(([dt, c]) => [dt, +c.toFixed(p.dp + 2)]),
  })),
};
const ind = (raw.match(/\n( +)"/) || [, " "])[1].length;
writeFileSync(snapPath, JSON.stringify(snap, null, ind) + (raw.endsWith("\n") ? "\n" : ""));
for (const p of snap.FX.pairs) {
  const s = p.series, last = s[s.length - 1];
  console.log(`${p.name}: ${s.length} bars ${s[0][0]}→${last[0]}  last ${last[1].toFixed(p.dp)}`);
}
console.log(`\nFX 块已写入 ${snapPath}`);
