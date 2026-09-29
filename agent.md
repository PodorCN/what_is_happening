# Agent — 每日 Bloomberg Market Wrap 生成流程

> 目标：每天美东收盘后产出一份交易日快照，网页（纯壳）自动加载渲染。
> 架构：**`index.html` 是壳（不存数据）+ `snapshots/*.json` 是数据**。加新的一天 = 加一个 json，不改网页。

## 0. Repo 结构

```
index.html                  # 壳：只管渲染，从 snapshots/ 加载数据（双击可看内嵌快照）
shell.html                  # 壳的源码模板（改样式/布局只改这里，再跑 build-shell）
snapshots/index.json        # 快照清单，如 ["2026-09-28"]
snapshots/YYYY-MM-DD.json   # 当天全量 payload：{ date, updatedAt, label, foot, P, HEAT }
data/YYYY-MM-DD.json        # 数字基线（fetch 产出，供写快照时抄数）
scripts/fetch.mjs           # 拉数：Yahoo v8 chart，免 key，Node 18+，`node scripts/fetch.mjs 2026-09-29`
scripts/build.mjs           # 校数：打印校准表（贴快照前先核对）
scripts/build-shell.mjs     # 合成：shell.html + 最新快照 → index.html（改完壳/加完快照必跑）
scripts/verify.mjs          # 校验：内嵌快照可解析、四档齐全、挂载点都在
scripts/extract-snapshot.mjs# 已退役（2026-09-28 从旧硬编码 html 迁快照用过一次）
agent.md                    # 本文件
```

工具链：`websearch` 找新闻 → `webfetch` 读收盘细节 → `scripts/fetch.mjs` 拉数 → 写 `snapshots/<date>.json`
→ `node scripts/build-shell.mjs` → `browser.preview` 验收。

## 1. 快照 schema（写文件前对照）

```json
{
  "date": "2026-09-29",
  "updatedAt": "2026-09-29T21:30:00Z",
  "label": "2026-09-29 周二收盘",
  "foot": "收盘基线(auto ...)…信息分享，非投资建议。",
  "P": {
    "today": { "h": "标题", "d": "一句话", "badges": ["S&P …"],
      "c1": "1·发生了什么(html)", "c4": "<ul class='play'>…</ul>",
      "kpi": [["S&P","7,6xx","-0.x%",0], …],
      "tbl": [["S&P","期初","期末","-0.x%"], …],
      "labels": ["9/22",…], "data": [77xx,…],
      "chains": [{ "t": "① …", "main": 1, "steps": ["A","B"],
        "d": "一句话推导",
        "news": [{ "time": "9/29 盘中", "fact": "…", "src": "Investopedia", "u": "https://…" }] }] },
    "mtd": { … }, "qtd": { … }, "ytd": { … }
  },
  "HEAT": {
    "today": [{ "sec": "US 指数", "items": [["S&P 500","7,6xx","-0.77"]]} …],
    "mtd": […], "qtd": […], "ytd": […]
  }
}
```

- 四档 `today/mtd/qtd/ytd` 必须齐全；每档 `chains[].news[]` 每条带 `time + fact + src + u`（真 URL，不编）。
- 快照文案一律用**英文**（页面是 FT/WSJ 英文报纸风格）；`today.d` 只写当日副题，不写方法论说明。
- HEAT 格子显示 `name + 价位(小字) + return`，颜色二值：`+`开头绿、`-`开头红，其余灰。`items` 第三列就是 return 字符串（如 `"-0.77"`、`"+106bp"`）；纯数字在渲染时自动补 `%`，带 bp/pp/文字的保持原样。
- `tbl` 第四列涨跌同规则。`labels`/`data` 等长（已不渲染走势图，留作数据参考，可省）。
- 最省事：复制前一天快照改数字和 chains，不要从零写。

## 2. 明天 Schedule 流程（照抄）

```bash
node scripts/fetch.mjs 2026-09-29
node scripts/build.mjs 2026-09-29
# 按校准表手填 snapshots/2026-09-29.json（chains 的 time+fact 来自新闻，见 §3）
node scripts/verify.mjs   # 先自检旧页无损也行
# 写完快照后：
# snapshots/index.json 末尾追加 "2026-09-29"（保持升序）
node scripts/build-shell.mjs 2026-09-29
```

给 agent 的 prompt 模板：

> 今天是 YYYY-MM-DD，美东已收盘。按 agent.md 跑：
> 1) websearch 今日主线 + webfetch Investopedia/Barron's 收盘帖；
> 2) 跑 scripts/fetch+build，数字以校准表为准；
> 3) 写 `snapshots/YYYY-MM-DD.json`（抄昨天文件的结构，四档齐全，每条 chain 挂 time+fact+来源链接），`snapshots/index.json` 追加日期；
> 4) 跑 `node scripts/build-shell.mjs YYYY-MM-DD` + `node scripts/verify.mjs`；
> 5) `browser.preview` 验收。URL 必须真实，数字必须来自 fetch 或帖子原文。

## 3. 当天新闻抓法（2026-09-28 实录，供参考）

- 主线三连搜：`stock market today <date> S&P 500 Nasdaq` / `Bloomberg market news <date>` / `global markets Asia Europe <date>`。
- 收盘细节必读：Investopedia 当日帖（含指数/收益率/个股/板块/比特币/黄金/美元）+ Barron's Live（含 30Y/2Y 极值、Dow 点数）。
- 历史基线：Yahoo `^GSPC/history`、WSJ DJIA historical、CNBC 12/31 与 6/30 收盘帖、FRED DGS10。
-  Ark级事实各归各链：拒案归主链（Reuters/NYT/AlJazeera）、回购归 AI 链、MAX 故障归个股链、$30B 清单归缓释链（Spectrum/The Hill）。

## 4. 本地看多日期（重要）

- `file://` 双击：浏览器禁 fetch，只能看**内嵌的最新快照**，日期选择器不可用（页内有提示）。
- 看全量/切日期：`npx serve .` 或 `python -m http.server` 后打开 `http://localhost:3000/?date=YYYY-MM-DD`。
- 验收用后者，前者只确认不白屏。

## 5. 定时方式（三选一）

- **GitHub Actions**：cron `30 21 * * 1-5`（UTC，美东收盘后），跑 fetch+build 提 PR，agent 补快照文案。
- **Windows 任务计划**：`node scripts\fetch.mjs` 每工作日 17:05 跑，结果进 `data/`，再喊 agent 写快照。
- **OpenCode scheduled session**：存 §2 的 prompt 模板，附带 `data/` 最新 json 当上下文。

注意：脚本只搞定“数”，**chain 因果必须 LLM 读新闻写**，别指望全自动。

## 6. 坑

- `^TNX` Yahoo 返回 yield*10，记得 /10。
- MTD 基线 = 上月最后**交易日**（不是 1 号），周末 `yahooClose` 自动回退。
- Gold 区分期货/现货，写明口径（本 repo 用期货）。
- Yahoo v8 偶发 429，加 `User-Agent` + 重试；拿不到就用帖子原文数并在 json 里记 `null`。
- 改样式只改 `shell.html`，改完必跑 `build-shell`，否则 `index.html` 还是旧的。
- 本机无 python，用 node（v22 已验证）。
