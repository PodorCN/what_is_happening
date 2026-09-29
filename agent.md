# Agent — 每日 Bloomberg Market Wrap 生成流程

> 目标：每天美东收盘后产出一份交易日快照，`git push` 到 GitHub，网页自动展示最新一天。
> 架构：**`index.html` 是壳（不存数据）+ `snapshots/*.json` 是数据**。加新的一天 = 加一个 json，不改网页。

## 0. Repo 结构

```
index.html                  # 壳：只管渲染，从 snapshots/ 加载数据（双击可看内嵌快照）
shell.html                  # 壳的源码模板（改样式/布局只改这里，再跑 build-shell）
snapshots/index.json        # 快照清单，如 ["2026-09-28","2026-09-29"]
snapshots/YYYY-MM-DD.json   # 当天全量 payload：{ date, updatedAt, label, foot, P, HEAT }
data/YYYY-MM-DD.json        # 数字基线（fetch 产出，供写快照时抄数）
scripts/fetch.mjs           # 拉数：Yahoo v8 chart，免 key，Node 18+
scripts/build.mjs           # 校数：打印校准表（贴快照前先核对）
scripts/build-shell.mjs     # 合成：shell.html + 最新快照 → index.html
scripts/verify.mjs          # 校验：内嵌快照可解析、四档齐全、挂载点都在
agent.md                    # 本文件
```

## 1. 思路：我是怎么收集的

定位是 **Bloomberg 编辑视角**，只回答四个问题：发生了什么、为什么（传导链）、数据怎么走、我该怎么办。
收集顺序固定，先框架后细节，避免被单条新闻带偏：

1. **先定涨跌**：搜 `stock market today <date> S&P 500 Nasdaq`，拿到三大指数涨跌幅、VIX，确认今天是 risk-on 还是 risk-off。
2. **再找导火索**：搜 `Bloomberg market news <date>`，找日内主线（9/28 就是 Trump 拒伊朗方案）。主线必须能解释股债汇商的**联动**，解释不了联动的不是主线。
3. **再挖分化**：读收盘细节帖，找指数内部的分裂——涨的板块/个股是谁、跌得最惨的是谁、反常的是谁（9/28：能源独涨、NVDA 独涨、黄金反常跌）。分裂处就是第 2、3、4 条链。
4. **最后找缓释**：什么因素让今天没更糟（沙特复供、中美关税清单），这是反转触发器，单列一条链。

来源分级（按信任度排序，高优先级对不上就降级采用）：

| 级别 | 来源 | 用途 |
|---|---|---|
| 收盘帖 | Investopedia 当日帖、Barron's Live | 指数/收益率/个股/板块/商品全量数字，一天只读这两篇基本够 |
| 通讯社 | Reuters、AP | 导火索事实（拒案、美元、油价），写进 Facts 首选 |
| 大报 | WSJ、NYT、CNBC | 补充细节（FAA、回购金额、Fed 措辞） |
| 数据 | Yahoo `^GSPC/history`、WSJ DJIA historical、FRED DGS10 | MTD/QTD/YTD 基线，交叉核对收盘帖数字 |
| 平替 | Bloomberg 同源 wrap 的转载（swissinfo、FinancialJuice） | Bloomberg 原文常付费墙，用同文转载代替，不编 URL |

核对铁律：**关键数字至少两个来源对上才写**（如 S&P 收盘点位：Yahoo 历史表 vs Investopedia 收盘帖）；
**URL 必须是搜出来或读过的真链接**，绝不凭记忆编；拿不到的数据记 `null` / 写约数并标注 `~`。

## 2. 思路：我是怎么整理的

### 2.1 四问即四节
`1·发生了什么`（一段定调）→ `2·热力图`（一眼扫涨跌）→ `3·多链+Facts`（因果）→ `4·怎么办`（playbook）。
顺序是刻意的：先给结论，再给证据，最后给动作。

### 2.2 Chain 设计原则
- **一条主链 + N 条辅链**，主链标 `MAIN`，解释当日 60% 左右波动；辅链解释分裂和反常。
- `steps` 只放传导节点（5~6 个，箭头连接），每个节点是事实不是观点。
- 每条链下挂 `news[]`，每条事实 = **时间 + Fact（一句话）+ 来源直链**，让读者自己能验算因果。
- 链的数量按信息量定，不套模板：9/28 是 5 链（主链/AI分化/个股雷/美元绞杀/缓释），平淡的日子 3 链也行。
- 个股只收录**拖累指数或异动最大**的 2~3 只（如 BA -7% 拖 Dow、MDB -18%），妖股（KOD +180%）一笔带过。

### 2.3 四个周期的叙事分工（不重复）
- **today**：讲日内传导，动词是"证伪/熄火/绞杀"，颗粒度到个股和基点。
- **MTD**：讲月内 regime 变化，动词是"反转/切换"（9 月：从 price-cut 到 price-hike），点出月内最高点和反转日。
- **QTD**：讲季度三段论（7 月吃财报 → 8 月滞涨 → 9 月回吐），回答"季度涨幅保住了吗"。
- **YTD**：讲年度双引擎和最大变量（AI+盈利 vs 利率+战争），回答"基本盘坏没坏"。
- MTD/QTD/YTD 的 chains 是**增量视角**，不复述 today 的日内细节。

### 2.4 热力图取舍
只放 `名字 + return`，颜色二值（`+`绿/`-`红），不要深浅、不要横条——扫一眼只分涨跌。
分组固定四组：US 指数 / S&P 板块 / 债券利率 / 商品全球加密；板块注明"11 仅 N 红"交代广度。

## 3. 快照 schema（写文件前对照）

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

- 四档齐全；`news[].u` 必须是真 URL；文案用英文（页面是英文报纸风格）。
- 最省事：**复制前一天快照文件改数字和 chains**，不要从零写。

## 4. 每日数据准备 + 推 GitHub（照抄，DATE 见下）

> **先定 DATE（重要）**：本 job 每天 06:30（多伦多）跑，目标是**最近一个已收盘交易日**的 wrap——通常是「昨天」，周一早 = 上周五，**不是「今天」**（今天还没收盘）。
> - 该日已有快照（查 `snapshots/index.json`）→ **无新交易日：跳过并在结果里说明**（不写 `data/`、不生成快照、不 commit/push；正常情况，不是失败）。
> - 没有 → 照抄下面流程，DATE = 该日。

```bash
DATE=2026-09-29

# 1) 拉数 + 校数（数字以校准表为准）
node scripts/fetch.mjs $DATE
node scripts/build.mjs $DATE

# 2) 按 §1 思路读新闻，按 §2 思路写快照（复制昨天文件改）
#    cp snapshots/2026-09-28.json snapshots/$DATE.json  # 起点，周一请确认周末无交易
#    写完后：snapshots/index.json 末尾追加 "$DATE"（保持升序、不重复）

# 3) 合成 + 校验
node scripts/build-shell.mjs $DATE
node scripts/verify.mjs

# 4) 预览验收（http 服务下看全量：http://localhost:8000/?date=$DATE）
#    npx serve .   # 或 python -m http.server
```

验收通过后推 GitHub（本 repo：`origin`，分支 `main`）：

```bash
git add snapshots/ snapshots/index.json data/$DATE.json index.html agent.md
git status --short          # 确认只有当天文件 + index.html
git commit -m "wrap($DATE): <一句话主线，如 Iran rejection sinks stocks, 10Y 5.27%"
git push origin main
git log --oneline -2        # 确认已推上去
```

- commit 信息格式固定为 `wrap(YYYY-MM-DD): 主线一句话`，方便回看。
- 若开了 GitHub Pages（源选 main / 根目录），push 后线上自动更新，无需额外操作。
- 若 `fetch.mjs` 拉不到数（节假日/429）：用收盘帖原文数字手填 `data/$DATE.json`，缺失记 `null`，commit 信息加 `(manual)`。

## 5. 给 agent 的 prompt 模板

> 今天是 YYYY-MM-DD（周X），美东已收盘。目标 DATE = 最近一个已收盘交易日；若其快照已存在（无新交易日）→ 跳过并说明。按 agent.md 跑：
> 1) §1 思路收集新闻（主线三连搜 + 必读 Investopedia/Barron's 收盘帖）；
> 2) §4 跑 fetch+build，数字以校准表为准；
> 3) 写 `snapshots/YYYY-MM-DD.json`（复制昨天文件改，四档+每链 time+fact+真链接），`snapshots/index.json` 追加日期；
> 4) 跑 `build-shell` + `verify`，http 服务下 `browser.preview` 验收；
> 5) §4 的 git 命令推到 `origin main`。
> 不编 URL，不编数字，对不上就标 `~` 或 `null`。

## 6. 坑

- `^TNX`（10Y）：Yahoo 报价可能是 ×10（52.4）、也可能已是百分数（5.24）；`fetch.mjs` 自动判别（>20 才 ÷10），手工取数先看数量级。
- **未收盘日期 fetch 会返回旧数据**：`today` = 上一交易日收盘（期货/加密等 24h 品种 = 进行中的部分 bar）；生成任何快照前先按 §4 判定 DATE，拿不准就看 Yahoo 日线最后一根 bar 的日期是否 = DATE。
- MTD 基线 = 上月最后**交易日**（不是 1 号），周末 `yahooClose` 自动回退；周一的 today 对比的是上周五。
- Gold 区分期货/现货，本 repo 用期货并注明口径。
- Yahoo v8 偶发 429，加 `User-Agent` + 重试；失败走 §4 的 manual 流程。
- 改样式只改 `shell.html`，改完必跑 `build-shell`，否则 `index.html` 还是旧的。
- 本机无 python，用 node（v22 已验证）；`file://` 双击只能看内嵌快照，切日期必须 http 服务。
