// 校验 index.html：占位已替换、内嵌快照可解析、关键节点都在
import { readFileSync } from "fs";
const h = readFileSync("index.html", "utf8");
console.log("placeholder left:", h.includes("<!--EMBEDDED-->"));
const a = h.indexOf('id="embedded-snap">') + 'id="embedded-snap">'.length;
const b = h.indexOf("</script>", a);
const s = JSON.parse(h.slice(a, b));
console.log("snap date:", s.date, "| periods:", Object.keys(s.P).join(","));
for (const k of Object.keys(s.P)) console.log(` ${k}: chains=${s.P[k].chains.length} tbl=${s.P[k].tbl.length} labels=${s.P[k].labels.length}`);
console.log("foot head:", (s.foot || "").slice(0, 30));
for (const id of ["prevDay", "curDay", "nextDay", "tabs", "heat", "chains", "foot", "topdate"]) {
  if (!h.includes(`id="${id}"`)) throw new Error("missing #" + id);
}
console.log("all mount nodes OK");
