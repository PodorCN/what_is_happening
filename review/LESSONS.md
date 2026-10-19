# Lessons — 累积复审反馈（写快照前必读）

每条 = reviewer 曾经抓到过一次的真实错误。**写 `snapshots/<DATE>.json` 之前先读这份清单，逐条对照；新快照里再犯就是失职。**

来源：每次 review 跑完后由 fixer job 追加。格式固定：`日期 | 类别 | 症状 | 规则`。规则末尾标 `[lint]` 的已由 `scripts/lint.mjs` 自动检查——仍要遵守，但写手可以把注意力放在没标的条目上。

---

## 数据基线 / 口径

| 日期 | 类别 | 症状 | 规则 |
|---|---|---|---|
| 2026-09-28 | 数据 | `fetch.mjs` MTD/QTD 基线取了**下一个**交易日的 bar（8/31 取成 9/1、6/30 取成 7/1），四档全部偏移一天 | 基线 = ≤ 基线日的最后一根 bar。取数后用 `node scripts/build.mjs <DATE>` 的校准表核对，与前一快照同档数字应连续 |
| 2026-09-28 | 数据 | `^TNX` 被 `/10` 两次 → 10Y 显示 0.52% 而不是 5.24% | Yahoo 对 `^TNX` 有时返回 ×10（52.4）、有时已是百分数（5.24）。按数量级判别（>20 才 ÷10），写入前确认量级合理（10Y 应在 2%–6%） |
| 2026-09-29 | 数据 | 跨日复核失守：9/28 快照多处手填约数偏离 Yahoo（Nasdaq MTD 基线 ~26,890 → 26,370.89；30Y ~5.28% → 5.56%；WTI $93.33 → $92.60；Gold $4,155 → $4,168.40；Gold/BTC/10Y/Russell 的 QTD/YTD 基数与派生值同批全偏） | 发现跨日不连续 → 先重拉 Yahoo 判定错侧；**错侧快照按 Yahoo 收盘精确值整表重算覆盖**（tbl/kpi/badges/heat/链内数字/脚注一处不漏）。任何手填值不得偏离真值 >1%，超了必须换精确值或记 null |
| 2026-09-30 | 数据 | 9/29 快照+data 的 WTI/Gold 收盘取了 fetch 时点的**未定稿值**：$88.96/$4,214.10（结算价应为 $89.38/$4,179.70；日变动 -3.9%→-3.5% / +1.1%→+0.3%）。Yahoo 期货 bar 收盘后数小时才把 last 修正为结算价，跨日因此不连续 | 期货收盘以**结算价**为准：写快照的『昨收』必须当天重拉 CL=F/GC=F，不得沿用昨日文件；跨日不连续用『重拉 Yahoo 值 + 通讯社结算价报道』双源判错侧，错侧文件按结算价整表重算覆盖（一处不漏） |
| 2026-09-30 | 数据 | 快照『今收』同样是未定稿值：writer 17:04 fetch 得 WTI $90.35 / Gold $4,189.00，晚间结算应为 **$90.42 / $4,186.2**（fetch 值到晚间还会漂移 ±0.3；Yahoo 修正滞后于 fetch 时点） | 快照『今收』也以结算价为准：收盘后取数须用 Yahoo 5m/1m 线核对结算窗口（活跃月结算 ≈ 13:29-13:30 ET 的 VWAP），并用尾盘报道（CNBC/OAOA/BNN 等）双源确认；定稿值须同步写入快照 + data + 派生百分比 |
| 2026-10-01 | 逻辑 | Brent 换月合约混用：正文 '+4.4% to $102.31'（Dec 合约）与 foot 基线 'Brent ~$103.5'（9/30 尚在报价的 Nov 合约）互斥——按 $103.5 起算会读成 -1.2%；foot 不注明换月，次日写手会继续拿 $103.5 当基准 | Brent 的『昨收/基线』与『日变动』必须同合约同口径：换月周在 foot 与正文注明合约（如 'Brent +4.4% to $102.31 (Dec front; Nov expired ~$103.5)'），禁止用 Yahoo BZ=F 日线做 Brent 日环比/MTD%，也禁止把 +4.4% 改成 Yahoo 口径的 -0.9% |
| 2026-10-01 | 逻辑 | 换期首日 mtd/qtd 的 labels/data 未按新窗口重建：10/1 两档序列与 today 逐点相同（9/24–10/1），序列首点 7,704.1 ≠ tbl 期初 7,651.54，违反『四档 tbl 期初/期末必须与 data 序列首尾一致』 | 换期首日（新月/新季/新年）必须重建 mtd/qtd/ytd 的 labels/data：首点 = 新窗口基期收盘、末点 = 当日收盘；不得沿用上一窗口的滚动 6 日序列 |
| 2026-10-01 | 数字 | 10/1 foot 的 26-09-30 Gold/BTC（$4,186.2/$83,698）与本文件期初及重拉值（$4,186.7/$83,554）不一致；9/30 文件同值为 fetch 时点旧值（Yahoo 收盘后修正），跨日不连续 | foot 的『昨收/基线』必须用当天重拉值并逐项对齐本文件 tbl/data 期初（Gold/BTC 同 WTI 待遇）；发现跨日不一致按『重拉 Yahoo + 通讯社/来源双源判错侧』整表覆盖错侧 |
| 2026-10-02 | 取数 | 期货三价沿用 Yahoo 未修订日线 bar（收盘后数小时才修订为结算价）：WTI $91.26/-1.7%（应 $91.11/-1.9%）、Brent ~$102.7/+0.4%（应 ~$102.25/-0.06%，方向翻转）、Gold $4,172.1/-0.7%（应 ~$4,162.5/-0.9%）；全部派生 % 需整表同步 | 期货三价一律取结算价：通讯社结算报道优先，或结算窗 1m VWAP 复现（CL/BZ≈14:28–14:30 ET、GC≈13:28–13:30 ET）；禁止直接用 Yahoo 日线 bar 值；修正后同步全部派生 %（tbl/HEAT/kpi/徽章/c1/链/foot 一处不漏），4pm 类盘中引用须标注口径 |
| 2026-10-02 | 取数 | data 的 Brent mtd/qtd 跨合约混算（mtdBase 103.53=9/30 Nov、today=10/2 Dec），得假值 -0.8；Dec 口径应为 98.0→102.25=+4.3% | Brent 跨期%（日/MTD/QTD/YTD）必须同一合约序列（换月后=Dec 前月）现算；data 的 mtdBase/today 不得跨合约混用 |
| 2026-10-02 | schema | ytd 序列静默删掉 9/29–10/1 一直保留的年内峰值锚点 8/13（7,799），正文 'about 1% from its August record' 失去对照点 | ytd 序列年内峰值锚点（8/13=7799）在非换期日不得静默删除；腾位须明确取舍（扩点或说明）并保持与正文 'August record' 可对照 |
| 2026-10-07 | 取数 | data 期货三价未回写结算价（回归 10-02 同类）：data.today 88.99/100.98/4134.10 vs 结算 88.28/100.20/4141，全部派生 % 同错（快照侧为正确结算口径） | 结算价修正必须同时回写 data/<DATE>.json 的 today 与全部派生 %（mtdPct/qtdPct/ytdPct），data computed 与快照逐项相等后才 commit——只修快照不修 data = 半修 |
| 2026-10-07 | 取数 | Brent mtdBase/qtdBase 回归 103.53（Nov 值），与 10-02 后沿用的 Dec 口径 98 断裂，computed -2.46 为跨合约假值（Dec 口径 +2.2） | Brent 的 mtdBase/qtdBase 固定取 Dec 前月序列的上月末收盘（本季=98.0），禁止回写 Nov 值；每日构建后跑『今日 mtdBase == 昨日 mtdBase』连续性检查（build.mjs 已内置自动告警） |
| 2026-10-07 | 取数 | BTC 定稿值不统一：data 83379.86（17:01 fetch）vs foot 83212.25 vs 链文 -2.7%，HEAT -0.4/-4.9 仅与 83212.25 成立 | BTC 重拉一次定稿，同一值写入 data+foot+链文；派生值按定稿值重算并全文件逐项对齐（24h 品种日环比以 Yahoo previousClose 为准） |
| 2026-10-09 | 取数 | Gold 收盘误把 Kitco 0842 GMT 盘中值 $4,215 当收盘（结算价应为 $4,216.3：Reuters『gained 1.4% to settle at $4,216.3』；13:28–13:30 结算窗 VWAP 4216.4 复现）。陷阱：17:00 电子盘最后一笔 $4,220.30（=Yahoo 日线 C/CNBC 4:59PM 报价）≠ 结算价，勿误采 | 期货收盘=官方结算价：优先通讯社『settled at』句，无稿用结算窗 1m VWAP（GC≈13:28–13:30 ET、CL/BZ≈14:28–14:30 ET）；禁止用电子盘最后一笔/Yahoo 日线 close/CNBC 收盘报价充当结算价；正文引用盘中时点值须加注『intraday』或替换为结算/更新值；修正后回写 data today 与全部派生 %（tbl/HEAT/c1/链/foot/引用句 一处不漏） |
| 2026-10-19 | 取数 | 跨日 1bp 断点：10/16 快照把 Yahoo ^TNX 5.098 当 Treasury 收盘写成 5.10%/5.44%（Treasury 10/16 = 5.09%/5.43%，10Y -1bp、30Y 0bp），10/19 的期初 5.09/5.43 因此对不上 | 收益率一律以 Treasury daily yield curve 定稿（^TNX 只做盘中参考）；跨日 tbl 期初必须等于上一快照期末，不一致先查 Treasury 判错侧，错侧整表改（tbl/HEAT/徽章/链/foot + MTD/QTD/YTD 的 bp 一并重算） |

## 取数前提

| 日期 | 类别 | 症状 | 规则 |
|---|---|---|---|
| 2026-09-28 | 取数 | 对**尚未收盘**的日期跑 `fetch.mjs`，会静默返回上一交易日收盘价（期货/加密还会给出进行中的夜盘 bar） | 生成任何快照前先判定 DATE = 最近一个**已收盘**交易日。拿不准就看 Yahoo 日线最后一根 bar 的日期是否 = DATE。不满足就跳过，不许用旧数据充新日 |

## 数字与文案自检

| 日期 | 类别 | 症状 | 规则 |
|---|---|---|---|
| 2026-09-29 | 数字 | today 链写 "FICO -27% (~-50% YTD)"：把 9/28 崩盘前的 -50% 当成 9/29 崩盘后现值（当日 -26.5% 后应 ≈ -63% YTD），与链内自己的 news 互斥 | 个股 YTD 一律用**当日收盘**现算（今收 ÷ 年内首个收盘 − 1）；出现「今日跌 x% + YTD y%」必须自检 (1+y)×(1+x) ≈ (1+新YTD)，禁止沿用前一天引用过的 YTD |
| 2026-09-29 | 数字 | ytd 链写 "NVDA +25% YTD"，Yahoo 现算 +21.8%（9/28 文件同错，现算 +22.7%） | 写「某股 ±x% YTD」前用 Yahoo 当日收盘现算；来源数字与 Yahoo 不符时以 Yahoo 为准，或原文注明来源 |
| 2026-09-29 | 逻辑 | qtd "September gives a third back"：实算回吐 ≈42.7%（近半，应写 ~40%）；9/28 文件 "half" 实算 ≈38.3% —— 均与算式不符 | 写「回吐三分之一/一半/~x%」类比例必须带算式 (峰值−现值)/(峰值−期初)，按算值取整（42.7% → "~40%"），不得凭感觉挑分数词 |
| 2026-09-30 | 数字 | ytd 链写 'NVDA +17% in Q3 alone'（来源未现算）；Yahoo 现算 Q3 = **+14.1%**（6/30 收 200.09 → 9/30 收 228.38） | 个股季度涨幅同样必须现算（Q3 = 9/30 收 ÷ 6/30 收 − 1）；来源数字与现算不符时以现算为准，或注明口径 |
| 2026-09-30 | 数字 | qtd 链写 'Oil Above $90 Is the Regime' / 'Q3 average above $90'：实算 Q3 WTI 日收盘均值 **$85.68**（7 月 $79.2 / 8 月 $82.5 / 9 月 $95.7；仅 21/64 日 >$90）——$90+ 是 9 月现象，不是全季均值；9/28、9/29 文件同句已一并修正 | 写『Q3/区间平均』类论断必须用日收盘序列现算并把算值写进文案（'averaged ~$86' / 'the $90+ regime began in September'），禁止凭印象说区间均值 |
| 2026-10-01 | 数字 | 4 个单名涨跌幅用了盘中/早盘值：FICO +8%（收盘 +11.7%）、SNPS +10%（+12.8%）、MSGS -5%（-1.5%）、MPC +5.7%（+6.3%） | 单名涨跌幅写入前用 Yahoo 当日收盘现算（今收÷昨收−1）；引用盘中值必须标注口径或改用收盘值 |
| 2026-10-02 | 数字 | mtd/qtd 'Sectors' 面板复制当日值：Tech +1.0（应 +2.1）、Industrials +0.8（应 +1.8）、Health -0.01（应 -1.3）；best 标签应为 Energy +2.1 | mtd/qtd/ytd 的 Sectors 面板必须用窗口期初→期末的板块 ETF 现算值、逐日重算，禁止复制当日值；best/worst 标签必须与面板内数字一致 |
| 2026-10-02 | 引用 | 链② n4 尾句 'both benchmarks finished the week lower' 与所引 Reuters 稿矛盾（稿：'For the week, Brent was up 0.11% with WTI 1.6% lower'；Investopedia 原文亦无此句） | 周线收尾句必须用结算稿最终数字逐合约核方向（Brent +0.1%、WTI -1.6%），不得合成 'both lower' 类总结 |
| 2026-10-06 | 数字 | 主链 s1/辅③ s0 写 Brent『a session low around $97.4』；实际全时段低点 ≈ $97.06–97.08（97.4 只是 09:xx 的次级低点） | 写 session low/high 前用 Yahoo 5m/1m 全时段极值（或通讯社结算稿原文）核对，取两位小数；禁止用某一时段的局部低点冒充 session low；『around $X』偏差 >0.2% 必须改精确值 |
| 2026-10-06 | 引用 | 辅③ n2 的 Kpler『81% of pre-war』句不在所引 lufkin URL 内（实出自同日另一条 Reuters 稿），两句被合并挂在同一 URL 下 | news.fact 的每个来源句都必须能在 news.u 指向的页面内找到；合并两条来源时拆成两条 news（各配真实 URL）；一条 URL 只能背书其页内实际存在的句子 |
| 2026-10-06 | 逻辑 | 『above pre-war levels』与『over 81% of pre-war levels (September)』并置互斥（>100% vs 81% 均值）；10/5 文件曾带限定『4 of the last 7 days of September』，本日丢失 | 同一指标在文件中两次出现必须同口径同时间窗：『above pre-war』须带限定（如 on 4 of the last 7 days of September），『81%』须注明 September average；修改一处须同步另一处 |
| 2026-10-06 | 引用 | 并列观点中『Rosenberg sees selling pressure easing』不在所引 BI 文内（BI 全文仅 Sløk/BCA/JPMorgan 三家） | 并列观点清单逐人核对是否都在所引 URL 内；缺源的一条要么补真实 URL、要么删除；禁止把不同来源的观点合并挂在同一条 URL 下 |
| 2026-10-06 | 逻辑 | mtd/qtd『never reclaimed $92』为假（10/1 收盘 $92.87，已站上后回落）；且为 10/5 F1 已认定未修的重复，本日再犯两次 | 写『never/从未/尚未』类窗口级断言前，先把窗口内全部收盘（必要时含盘中极值）逐项列出核对；与序列不符即改写；重复出现的历史 minor（未 resolved）由 fixer 一并修复并沉淀进 LESSONS |
| 2026-10-07 | 数字 | mtd c1『re-tested twice / fresh 24-year highs twice』与 mtd ① s1 枚举（Oct 1、Oct 5、Oct 7 三次）矛盾 | 计数词（twice/three times）必须与链内枚举一致；每日新增一次时同步更新全部计数与 deck 表述 |
| 2026-10-07 | 数字 | today c1『the Nasdaq's six-day run ended』与收盘序列不符（9/30–10/6 连涨 5 日，10/7 为首跌日） | run/streak 表述按收盘序列逐日计数（连涨 5 日 →『five-day run』），或直接沿用来源口径『first down day in six』 |
| 2026-10-07 | 数字 | ② n3 照抄 Investopedia『down 35% YTD』，现算 SKYD = -33.7%（13.40→8.89） | 单名 YTD 数字引用前用收盘序列现算；现算与来源差 >1pp 时改为现算值（≈-34%）或加注来源口径（二选一，禁止直接照抄来源值当事实） |
| 2026-10-07 | 逻辑 | 同一 10Y 盘中高点文件内两值：正文 5.365%（=Yahoo 1m 高点 5.364）vs ytd ② n0 引用 5.350%（CNBC 同页两帖，前帖为盘中早值） | 同一天同一指标全文件只保留一个值（含引用句）；引用句与正文不一致时改引同源同值句或加注口径 |
| 2026-10-09 | 数字 | c1『yields holding below 5.25%』与 ① s1『yields hold below 5.25%』与全时段不符：10Y 开盘 5.257%、盘中峰值 5.28%（10:42 ET）、223 分钟高于 5.25%，仅收盘 5.244% 低于 | 写『收益率 hold 在 X% 之下』类阈值断言前用 Yahoo 1m 全时段极值核对（max>X 即不可写 below）；只对收盘成立的断言须写明『closed below』，或改峰值口径 |
| 2026-10-12 | 数字 | today ② s1『LITE entered the day up ~170% year-to-date』时点错误：进入当日应为 **~+199%**（10/9 收 $1,103.35 ÷ 12/31/25 收 $368.59）；~170% 是周一收盘后值（$995.41），来源句为盘中现值 | 写『某股进入当日时 ±x% YTD』前用**前一日收盘**现算（前收 ÷ 上年末 12/31 收盘 − 1）；引用来源的 YTD 值先核对它对应的时点（盘中/盘后），禁止把盘中现值改写成『进入当日』口径 |
| 2026-10-12 | 数字 | today ⑤ s0『KBW index more than 14% off its August peak』现算仅 **−11.6%**（收盘口径；含盘中最多 −12.7%，任何口径到不了 >14%）；同档 n4 为来源原句（保留为引用） | 指数回撤数字（『距 X 月峰值 −n%』）引用前用 Yahoo 日线现算（收盘口径）；现算与来源差 >1pp 时改用现算值或加注来源口径，禁止直接照抄来源数字当事实 |
| 2026-10-12 | 引用 | today ③ s2『the WSJ reported』（Bumble 私有化）出处错：被引页面（BNN Bloomberg／Reuters）全文 0 处 WSJ、34 处 Reuters（『a source familiar with the matter told Reuters』）；WSJ 只属同链 s3 的 Decart 条 | 链内写『某媒体 reported』前先在该链 news.u 指向的页面检索该媒体名；attribution 以被引页面为准，不得凭记忆或从邻条串写 |
| 2026-10-12 | 数字 | today ③ s4『Salesforce +2.1% … led the Dow's advance』与现算不符：按 Δ$（同除数，= 点数贡献）MSFT +6.08 > CRM +4.79，按涨幅 VZ +2.71% > CRM +2.09%，CRM 两种口径均非第一（c1『helped by』为来源口径，正确） | 写『X 领涨道指』前现算全 30 成分当日价格变动（道指价格加权、同除数 → 美元变动排名 = 点数贡献排名）；只有第一名可用 led，其余用 helped / among the biggest boosts |
| 2026-10-15 | 数字 | today HEAT 板块 5 格沿用盘中/旧值：Comms +0.6→+1.5、ConsDisc +1.2→+1.7、Staples +0.4→+0.7、RealEstate +1.0→+1.2、Tech -0.5→-0.7；Health/Materials 舍入边界一并复核（+1.8→+1.9、+1.7→+1.8）；与自身 mtd 面板及 ETF 收盘现算矛盾 | today 板块日值一律用板块 ETF（XLC/XLY/XLP/XLK/XLV/XLE/XLU/XLI/XLB/XLRE/XLF）今收÷昨收−1 现算、保留 1 位小数；定稿前做自洽检查 (1+当日mtd)÷(1+昨日mtd)−1 ≈ 当日值（±0.15pp）；盘中值不得当收盘值写入 |
| 2026-10-15 | 数字 | today c1『PPI +6.3% y/y, the fastest since March 2022』口径错：fastest（since March 2022）属 m/m +1.3%；y/y 6.3% 应写『the highest annual rate since December 2022』——同一来源两组数字混接 | 引用『fastest/biggest since…』前先在来源核对修饰的是 m/m 还是 y/y（本月基准：m/m=since March 2022、y/y=since December 2022）；同一比较级全文件只留一处且口径一致 |
| 2026-10-15 | 逻辑 | 窗口档 10Y 触值沿用当日盘内值：mtd c1 / qtd ① s4『touched 5.33%』（10/14 盘内高点），窗口峰值实为 5.364（10/7），与引用句『neared 5.37%』并存（10/14 F3 已犯未修，本日复现） | 窗口档写 10Y 触值一律用窗口最大口径：先 grep 全文件『5.3』核对，取 ^TNX 窗口内最高（5.36%）或沿用来源『neared 5.37 / fresh 24-year highs』；当日盘内触值只允许出现在 today 档 |
| 2026-10-15 | 数字 | today c1 / ① s2『climbed 1.4% — double the benchmark』倍数错：1.37% vs 0.33% ≈ 4.2 倍（RSP/SPY = 1.37/0.29 ≈ 4.8），非 double，且来源原句无倍数词 | 写『N 倍于基准』类倍数前用两个数字现算比值（1.4÷0.33≈4.2）；来源未给的倍数/比较级不得自行添加 |
| 2026-10-16 | 逻辑 | mtd/qtd/ytd 共 6 处『two record closes』挂在 S&P 名下；S&P 十月只有 1 次创纪录收盘（10/6 7,818.93），两次是 Nasdaq 的（10/5、10/6）——10/6 的原句被逐日照抄，主语漂移到 S&P | 『record close / fastest since / highest since』类断言必须在同一子句点名指数与口径，并与 `labels/data` 序列核对次数 `[lint]` |
| 2026-10-16 | 逻辑 | 『odds fell to ~29% despite hot prints / the market faded two hot prints』：FedWatch 实为 22%（CPI 前）→ 37% → 29%，窗口内净升 7pp；只与事件后峰值比就说 faded | 概率/预期变化写相对窗口期初或事件前的净变化（22% pre-CPI → 37% peak → 29%），用 half-faded 而非 faded `[lint 部分]` |
| 2026-10-16 | 逻辑 | qtd ①『5.2-5.35% is the band』+ kpi『ceiling held』与同档自己写的 5.365%（10/7 盘中）和 5.09%（10/15 收盘）矛盾 | 区间/上限断言写入前，把本档出现的该指标所有数值（期初、期末、触值）逐个放进区间核对；有一个在区间外就不能写 band/held `[lint]` |
| 2026-10-16 | 逻辑 | mtd ②『Goldman: narrowest breadth since the dotcom bubble』从 10/9 原样挂到 10/15，而窗口数据已转向扩散（Dow +2.50% vs Nasdaq -0.55% MTD，防御/能源领涨） | 连续 ≥3 天未改的窗口论断必须用当天窗口数据重验，被新数据推翻的改写为『X 日的警告已被 … 回应』或删除 `[lint：stale 告警]` |
| 2026-10-19 | 引用 | today ① n2 整段引文取自 Bloomberg live blog 的盘中旧版：芯片指标 2.9%（定稿 1.6%）、Nasdaq 100 1.3%（定稿 1.2%）、CoreWeave +4%（定稿页 0 次，且与本链「+7%→-0.4%」并列成两个收盘值） | 引用 live blog / 滚动稿一律以美东 16:00 后定稿版为准：定稿前在 news.u 页面全文检索每个数字与股票名，检索不到就换真正包含该句的 URL；盘中数字必须带 early/midday 时间标签，不得与收盘值并列成事实 |
| 2026-10-19 | 引用 | 同一 sw1 定稿页下另有 3 条 fact 检索不到（「more than 70 S&P 500 companies」「quality stocks / equal-weighted」「Fed communications blackout」），实出自同文早盘版或其他稿 | 每条 news.fact 定稿前用 2 个特征词（数字或专名）在 news.u 页面全文检索；检索不到就换到真正包含该句的 URL 或删除；同一 URL 只背书其页内实际存在的句子 |
| 2026-10-19 | 逻辑 | 芯片连跌天数同链两口径：n0（10/16 Bloomberg 盘中稿）写「eighth straight day」，而 d「nine-session」/ s1「first gain in 10 sessions」按 9 连跌；SOXX 收盘序列 10/6–10/16 实为 9 连跌 | 同一链内 streak 计数只保留一个口径并以收盘序列现算（SOXX 10/6–10/16 = 9 连跌）；引用盘中稿的较小计数必须标注时点（如「eight completed sessions at the time of writing」），否则删掉计数 |
| 2026-10-19 | 逻辑 | mtd c4「The month's last gate is the Fed…into the Oct 27-28 meeting」与同文件 qtd c1/c4/③「PCE Oct 29」矛盾——10 月最后一个 gate 是 10/29 PCE，不是 10/27-28 FOMC | 窗口档写「last/only gate」前先列出本档提到的全部日期并取最晚者；FOMC 与 PCE 同月时按日期排序写（FOMC 10/27-28 → PCE 10/29） |
| 2026-10-19 | 引用 | today ② s1「Paris -1.1%, Frankfurt -1.2% and London -1.1%」文件内无出处：所引 AP 原文只写「indexes slid more than 1%」，无三国具体值 | 链内具体指数的点位/百分比必须能对应本文件某条 news 的原句；否则改用来源口径（more than 1%）或补真实 URL；不得凭记忆补国别数字 |

## 链结构（主链 / 辅链）

| 日期 | 类别 | 症状 | 规则 |
|---|---|---|---|
| 2026-10-06 | 逻辑 | today 档辅链与主链重复叙述同一件事（Brent 晨段、CEG +12%/utilities、AMD/Marvell、10-of-11 板块、DXY 101.86 多处近乎逐字；utilities +3.0% 出现 3 次） | chains 定稿前做『主链×每条辅链』逐对事实比对（对象+数字+方向）：任何事实在主链与辅链重复出现即改写——辅链只保留增量（新对象/新数字），主链只保留传导节点；today 档内同一数字不得出现两次以上（结构性表格字段除外） |
| 2026-10-07 | 逻辑 | today ④ s2『dip-buying…slide almost fully recovered』≈ 主链 ① s4（近乎逐字），③ s4 第三次转述『stocks pared losses』，④ d 亦有回响 | chains 定稿前做『主链×每条辅链』逐对事实比对：『跌深收复/尾盘拉回』叙事只归主链，辅链不得再转述；④ 只留拍卖/加息概率/gates/VIX |
| 2026-10-12 | 逻辑 | mtd ② s2『the first scare was walked back within a session; Monday's unwind stuck』复述主链 ① s2 同一事件且句式复用（walked back within a session） | mtd 辅链只保留主链未给的增量（计数/对比/新对象）；『walked back』『unwind』等事件细节与句式归主链，定稿前逐链比对同档内有无同句复用 |
| 2026-10-15 | 逻辑 | 窗口档复述 today 当日事件：mtd ③ s2（沉船/EIA draw/Aden 宫）与 qtd ③ s3（同两件）为 today ③ s1/s2 已展开细节（10/14 F1 已犯未修，本日复现） | 定稿前把 today 各链的具体事件（对象/地点/数字）与 mtd/qtd/ytd 链逐条比对：today 已展开的事件不得在窗口档再列，窗口档只写计数、层级或对比句 |
| 2026-10-16 | 逻辑 | 窗口档时间标签过期：第三周还写『The Barrel, Week Two』『Week two's new layers』『Q4's first week-plus』；qtd c1『first close above 7,800 came in week one』（10/6 实为第二周） | 描述当前状态的时间标签按当天窗口重数（交易日=labels.length-1，周次按自然周）；特指某周写日期区间 `[lint]` |
| 2026-10-16 | 逻辑 | 10/15 F4 的修法把具体事件换成『escalation kept coming — another round of the same fight』——空话，信息量为零；『Warsh tonight』仍留在 mtd/qtd c1 和 ytd ⑤（同类未全文件排查） | fixer 按类修：grep 全文件同一模式一次修完；替换句必须含可核对的对象/数字/日期，否则直接删 step；窗口档禁当日时间词 `[lint：tonight 类 ERROR]` |
| 2026-10-16 | 引用 | mtd ①/qtd ① 引 Investopedia『Stocks surged Friday … ended the week around 5.24%』标 time『10/12 close』（URL 日期），内容是周五 10/9 收盘 | news.time 标事件发生日，不是文章 URL/发布日期；fact 里出现星期几先核对 `[lint]` |
| 2026-10-16 | schema | qtd/ytd HEAT 第二列填了与涨跌幅相同的值（『+1.21』『-20bp』），页面重复显示同一个数（10/9 起每天沿用） | HEAT items 第二列只能是水平值（点位/价格/收益率）或『—』 `[lint ERROR]` |
| 2026-10-16 | 结构 | 季度首月 MTD 与 QTD 同基期，QTD 是 MTD 的改写（整档用词重合 0.39-0.43，正常 <0.2） | 季度首月 QTD 换视角：对比上季末、季内剩余关口（FOMC/财报季/数据），不复述 MTD 的月内叙事 `[lint：重合度>0.30 告警]` |

## 待补充

reviewer 每抓到新的坑，就在这里加一行。writer 和 fixer 每次开工先读这份文件。
