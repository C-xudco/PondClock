# 《水塘时钟》Web 原型 · 开发者手册

> 定位：桌面挂机钓鱼时钟 / 增量收集 / 轻交易
> 当前形态：**Web 原型 + 桌面挂件式 UI**（半透明天空、玻璃面板、功能坞收起态）
> 目标平台：桌面软件（正式版建议 Electron/Tauri 包壳或 Godot 重实现，见文末「桌面化迁移」）

这份 README 面向**第一次接手这个项目的开发者**：读完应该能知道项目怎么跑、每个文件负责什么、
数据怎么流动、常见需求改哪里、怎么验证，以及往桌面软件迁移要做什么。

---

## 1. 快速开始

环境要求：Node.js 18+（仓库 `.nvmrc` 写的是 18），npm 或 yarn 均可。

```bash
npm install       # 安装依赖
npm run dev       # 开发服务器，默认 http://localhost:8080
npm run build     # 生产构建，输出到 build/（注意不是 dist/）
npm run preview   # 本地预览生产构建
```

开发服务器支持热更新，改 `src/` 下的文件会即时生效。

> 本项目是纯前端 SPA（HashRouter，无后端），构建后可以直接丢到任意静态托管。
> 依赖里体积较大的 `components/ui/*` 是 shadcn/ui 组件库，游戏本身没有用到全部。

---

## 2. 技术栈与关键约束

| 项 | 选择 |
|---|---|
| 构建 | Vite 5 + React 18 + JSX（JavaScript，非 TypeScript） |
| 样式 | Tailwind CSS 3 + tailwindcss-animate + shadcn/ui |
| 场景 | 纯 SVG 绘制（1000×440 坐标系等比缩放），无 canvas、无图片资源 |
| 状态 | React hooks + refs；**无全局状态库、无后端、当前无持久化** |
| 路由 | `HashRouter`（只有一页，路由配置在 `src/nav-items.jsx`） |
| 图标 | `lucide-react` |
| 提示 | `sonner`（右下角 toast） |
| 外部服务 | IP 属地 `https://ipapi.co/json/`（失败自动降级）；天气目前为本地模拟 |

**必须知道的约定：**

1. 路径别名 `@/` 指向 `src/`，例如 `@/lib/gameConfig`。
2. 所有游戏数值都在 `src/lib/gameConfig.js`，组件/hook 里不要写死平衡数字。
3. 钓鱼状态只有两种：`"idle"`（挂机等待）和 `"bite"`（浮漂下沉、判定窗口）。
4. 台词语气只有四种：`"idle" | "success" | "high" | "miss"`（决定气泡配色），
   台词内容池的 key 另有 `rare / impatient / airForce`。
5. 场景坐标统一在 `src/components/pond/scene.js` 的 1000×440 视角里；不要按屏幕像素摆 SVG。
6. 深色主题靠 `index.html` 的 `<html class="dark">` + `src/index.css` 里的 CSS 变量；
   改主题不要逐个组件改，优先改这两处。
7. `src/components/ui/*` 是通用组件库，**尽量不要动**，除非是全局主题/交互 bug。

---

## 3. 架构总览

```
┌──────────────────────────────────────────────────────────────┐
│ 入口                                                         │
│ src/main.jsx → App.jsx(HashRouter/Provider) → pages/Index.jsx │
└───────────────────────────────┬──────────────────────────────┘
                                │ 组合页面，持有"当前展开面板"状态
┌───────────────────────────────▼──────────────────────────────┐
│ 表现层（React 组件）                                          │
│  ├─ components/header/ClockPanel.jsx   半透明时钟条            │
│  ├─ components/pond/*                  水塘场景 + 交互 HUD     │
│  ├─ components/layout/*                桌面底层/功能坞/面板窗   │
│  └─ components/panels/*                鱼篓/图鉴/渔具店/漫游    │
└───────────────────────────────┬──────────────────────────────┘
                                │ 只通过 props / hooks 读写
┌───────────────────────────────▼──────────────────────────────┐
│ 玩法层（hooks）                                               │
│  ├─ useFishingGame.js   状态机 + 产出结算 + 经济 + 说话 + 漫游 │
│  ├─ useClockWeather.js  本地时钟 + 模拟天气                    │
│  └─ useGeoRegion.js     IP → 中国水域（含缓存与降级）          │
└───────────────────────────────┬──────────────────────────────┘
                                │ 纯函数 / 配置表
┌───────────────────────────────▼──────────────────────────────┐
│ 数据与规则层（lib）                                           │
│  ├─ gameConfig.js  鱼种 / 水域 / 品质 / 鱼竿 / 判定 / 节奏      │
│  ├─ gameUtils.js   加权随机、产出、卖价、图鉴、省份映射         │
│  ├─ speech.js      台词库                                     │
│  └─ utils.js       className 合并工具                         │
└──────────────────────────────────────────────────────────────┘
```

### 一局游戏的数据流

```
每秒 tick（useFishingGame 内 setInterval）
  ├─ idle：等待倒计时 -1；到 0 → status="bite"，窗口=20s+鱼竿加成
  │        等待期间若长时间没鱼 → 随机说"怎么还不上鱼…"
  ├─ bite：窗口倒计时 -1；到 0 → status="idle"，小人物说"太可惜了…"
  └─ 玩家点击（判定窗口内）
        → catchFish()
        → rollFish(regionId,{qualityBonus,pity})  种类→品质→长度/重量
        → bucket 追加、codex 更新、pity 重置/累加、鱼饵消耗
        → 小人根据品质说"太棒了 / 大赚一笔"；toast 展示鱼获
        → 回到 idle，重新抽取下一次咬钩等待
```

卖鱼、买鱼饵/鱼竿、买机票都只改 `coins / baitCount / rodLevel / unlockedRegions / currentRegion` 这些状态；
图鉴记录与资产解耦（卖鱼不会删图鉴）。

### UI 布局（桌面挂件式）

```
┌────────────────────────────────────────────┐
│ ClockPanel（半透明玻璃条：时间/日期/天气/水域）│
├────────────────────────────────────────────┤
│ Pond（SVG 场景：半透明天空 + 水面 + 小人 + 浮漂）│
├────────────────────────────────────────────┤
│ ActionDock（金币 + 鱼篓/图鉴/渔具店/漫游 按钮） │
├────────────────────────────────────────────┤  ← 默认到这里为止，面板不展开
│ PanelWindow（只有点击功能坞后才插入 DOM）      │
└────────────────────────────────────────────┘
```

- `Index.jsx` 用 `activePanel`（null / bucket / codex / shop / travel）控制展开；
  同一个按钮再点一次或点面板右上角 ×、按 `Esc` 都会收起。
- 面板内容只在展开时挂载，收起时 DOM 里不存在，符合"不点击不展开"。
- 半透明天空靠两个东西配合：
  1. `palette.js` 的 `SKY_ALPHA`（默认 0.6）控制天空底色不透明度；
  2. `layout/DesktopBackdrop.jsx` 在 Web 预览里模拟"桌面壁纸"，让透明效果可见。
     正式桌面版应删掉这个组件，改为真正的透明窗口（见桌面化迁移）。

---

## 4. 目录与文件职责

```
.
├─ index.html                  HTML 入口，<html class="dark">，标题/图标/主题色
├─ vite.config.js              Vite 配置：@ 别名、端口 8080、dev watcher 忽略临时文件
├─ tailwind.config.js          Tailwind：shadcn 颜色变量、动画插件
├─ postcss.config.js           PostCSS（Tailwind + autoprefixer）
├─ jsconfig.json               @/* 路径提示（编辑器用）
├─ components.json             shadcn/ui 生成配置
├─ package.json                scripts：dev / build / preview
├─ .nvmrc                      Node 18
├─ hmr-client.js               平台 HMR 日志桥（一般不用改）
└─ src
   ├─ main.jsx                 React 挂载入口
   ├─ App.jsx                  QueryClient/Tooltip/sonner/HashRouter 路由
   ├─ nav-items.jsx           路由表（只有 "/" → pages/Index）
   ├─ index.css               Tailwind 指令 + 明暗主题 CSS 变量
   │
   ├─ pages
   │  └─ Index.jsx            页面总装：时钟/水塘/功能坞/面板 + 开发调试参数
   │
   ├─ hooks
   │  ├─ useFishingGame.js    ★ 核心玩法 hook（状态机/产出/经济/说话/IP 跟随）
   │  ├─ useClockWeather.js   每秒刷新本地时间 + 模拟天气（5 分钟随机变）
   │  └─ useGeoRegion.js      IP 定位 → 省份映射 → 水域；失败降级默认水域
   │
   ├─ lib
   │  ├─ gameConfig.js        ★ 策划配置表（鱼种/12 水域/品质/鱼竿/判定/节奏/省份映射）
   │  ├─ gameUtils.js         ★ 纯函数：加权随机、rollFish、卖价、图鉴、省份匹配
   │  ├─ speech.js            台词库 + pickLine 随机不重复
   │  └─ utils.js             cn()：clsx + tailwind-merge
   │
   ├─ components
   │  ├─ header
   │  │  └─ ClockPanel.jsx    半透明时钟条（时间/日期/季节/天气/当前水域）
   │  ├─ pond
   │  │  ├─ Pond.jsx          ★ 场景总装 + 交互 HUD + 点击热区 + 开发调试覆盖
   │  │  ├─ SkyLayer.jsx      天空渐变/星月/柔云/三层远山/远岸芦苇（天空底色用 SKY_ALPHA）
   │  │  ├─ WaterLayer.jsx    水面/倒影/碎光/浅滩湖床/波纹/岸体
   │  │  ├─ Fisherman.jsx     斗笠剪影渔人 + 鱼竿 + 鱼线（咬钩姿态由 pose 驱动）
   │  │  ├─ Bobber.jsx        立式浮漂（上红下白/顶珠/水线裁切/咬钩波纹）
   │  │  ├─ WeatherLayer.jsx  雨/雪粒子（纯视觉、不拦截点击）
   │  │  ├─ SpeechBubble.jsx  小人对话气泡（tone 映射配色，锚在斗笠上方）
   │  │  ├─ palette.js        ★ 昼夜/天气色板、SKY_ALPHA、日月轨道
   │  │  ├─ scene.js          ★ 1000×440 坐标常量、几何/旋转数学、确定性装饰点
   │  │  └─ useTween.js       0→1 缓动，驱动竿梢/前倾/浮漂下沉
   │  ├─ layout
   │  │  ├─ DesktopBackdrop.jsx   Web 预览用桌面壁纸层（桌面端删除）
   │  │  ├─ ActionDock.jsx        功能坞：金币 + 4 个面板按钮；DOCK_ITEMS 在此
   │  │  └─ PanelWindow.jsx       玻璃面板容器（标题/关闭/滚动/展开动画）
   │  ├─ panels
   │  │  ├─ BucketPanel.jsx   鱼篓列表、单条卖出、全部卖出
   │  │  ├─ CodexPanel.jsx    图鉴：按水域筛选、三项最佳、首获、偏好水域
   │  │  ├─ ShopPanel.jsx     渔具店：鱼竿升级、高级鱼饵
   │  │  └─ TravelPanel.jsx   漫游：12 水域、机票、本地水域、IP 降级提示
   │  └─ ui/                  shadcn/ui 组件库（按钮/弹窗/Tabs 等，非游戏逻辑）
   │
   └─ （无静态资源目录；所有画面都是 SVG/CSS 生成）
```

★ = 改玩法/数值时最常打开的文件。

---

## 5. 核心文件详解

### 5.1 `src/hooks/useFishingGame.js`（核心）

调用方式：`useFishingGame(geoRegionId)`；`geoRegionId` 来自 `useGeoRegion`。

返回值：

| 字段 | 含义 |
|---|---|
| `coins` | 金币 |
| `currentRegion / homeRegion` | 当前水域 / IP 匹配到的本地水域 |
| `unlockedRegions` | 已解锁水域 id 数组（含本地水域） |
| `rodLevel / baitCount / baitLeft` | 鱼竿档位 / 鱼饵库存份数 / 当前一份剩余次数 |
| `bucket` | 待卖鱼数组（每条含 uid/speciesId/name/quality/length/weight/caughtAt/regionId） |
| `codex` | 图鉴：`{ [speciesId]: {maxLength,maxWeight,bestQuality,firstCaughtAt,catchCount} }` |
| `pityCounter` | 距上次高品质（史诗/传说）的连续次数 |
| `status / windowLeft / waitLeft` | 状态（idle/bite）/ 判定窗口剩余秒 / 下次咬钩剩余秒 |
| `speech` | 当前气泡 `{text, tone, id}` 或 `null` |
| `catchFish()` | 判定窗口内收竿（只有 bite 状态有效） |
| `pokeBobber()` | 待机时点击浮漂：说"别急"；10 秒内第 5 次说"准空军" |
| `sellOne(uid) / sellAll()` | 卖鱼（只加金币，不动图鉴） |
| `buyBait() / buyRod()` | 买鱼饵 / 升级鱼竿 |
| `travelTo(regionId)` | 前往水域；未解锁则扣机票并永久解锁 |

实现要点：

- **状态机**：单个 `setInterval(1000)` + refs（`statusRef/windowRef/waitRef`），避免依赖 state 的定时器重建。
- **咬钩等待**：`rollWaitSeconds(rodLevel, idleSeconds)` = 随机 55–125 秒 × 鱼竿 `intervalMult` × 挂机提速（最多 12%），下限 25 秒。
- **鱼饵**：判定窗口内成功收竿才消耗；当前一份用尽会自动启用库存下一份（`baitLeft/baitCount` 联动）。
- **说话**：`say(pool, tone)` 统一入口，4.6 秒后自动清空；台词池见 `lib/speech.js`。
  待机时每 30–75 秒触发一次 idle 台词；成功/稀有/高品质/超时分别触发不同语气。
- **IP 跟随**：`geoRegionId` 变化时，若玩家还没主动漫游，就把本地水域加入解锁、切到该水域。
- **开发调试**：`?bite=4` 缩短咬钩等待；`?coins=5000` 覆盖初始金币（仅 `import.meta.env.DEV`）。

### 5.2 `src/lib/gameConfig.js`（策划配置表）

所有平衡数值集中在这里，只改数据、不改逻辑。导出：

| 导出 | 说明 |
|---|---|
| `QUALITIES` | 4 档品质：id / 名称 / 卖价倍率 mult / 比较用 rank / Tailwind 文字色 |
| `FISH` | 42 种鱼：id / 中文名 / basePrice / len(cm) / wt(kg) / qw 品质权重 / habitat 习性 |
| `REGIONS` | 12 个中国水域：id / name / waterSystem / tier / flightPrice / fish:[[fishId,权重]] |
| `DEFAULT_REGION` | 默认本地水域（`"jiangnan"`） |
| `RODS` | 4 档鱼竿：cost / windowBonus / intervalMult / qualityBonus |
| `BAIT_COST / BAIT_CATCHES / BAIT_QUALITY_BONUS` | 鱼饵价格、次数、品质权重加成 |
| `BITE` | 咬钩等待区间（秒） |
| `JUDGE` | 判定窗口及"最佳点击区间"预留参数（`qualityBonusBest=0` 默认关闭） |
| `PITY_THRESHOLD` | 连续 N 条未出高品质后，`rollFish` 将史诗/传说权重 ×5 |
| `PROVINCE_TO_REGION` | 中国 34 个省级行政区（中文全称/简称/拼音/省码）→ 水域 id |

> 数值口径：初始水域史诗+传说约 1.3%，单条期望约 10 金币；新水域解锁中位约 3 小时。

### 5.3 `src/lib/gameUtils.js`（纯函数）

| 函数 | 说明 |
|---|---|
| `randInt(min,max)` | 闭区间整数随机 |
| `fishById / regionById / qualityById` | 查表（找不到有兜底） |
| `weightedPick(pairs)` | `[[值,权重],...]` 加权随机 |
| `rollFish(regionId,{qualityBonus,bestClickBonus,pity})` | 种类→品质→长度/重量；返回完整鱼对象 |
| `calcSellPrice(fish)` | 基础价 × 品质倍率 × 体重系数 |
| `updateCodex(codex,fish)` | 三项最佳 + 首获时间 + 累计次数 |
| `regionForProvince(...tokens)` | 省名/拼音/城市串 → 水域 id（无法识别回默认） |
| `fishRegions(fishId)` | 哪些水域会出现该鱼（图鉴"偏好水域"用） |

### 5.4 场景层 `src/components/pond/`

- `scene.js`：`VIEW={w:1000,h:440}`、`HORIZON`、岸线/浅滩路径、`FISHER`（人物锚点/握竿点/竿梢/气泡锚点）、
  `BOBBER`（浮漂 x/水线/高度/下沉距离）、姿态旋转数学、确定性装饰点（星星/云/波纹/卵石/芦苇）。
  **改构图先改这里**，再改对应图层。
- `palette.js`：昼夜四段（night/dawn/day/dusk）色板 + 天气微调 + `SKY_ALPHA` + 日月轨道。
  **换配色/调天空透明度只改这个文件**。
- `Pond.jsx`：镜头总装、点击热区（咬钩=整块水塘收竿；待机=浮漂戳点）、倒计时 HUD、气泡挂载、
  以及开发美术参数（`?hour/weather/status/wl/say/tone`）。
- `SpeechBubble.jsx`：4 种 tone 的玻璃气泡 + 指向人物的小尾巴 + 弹出动画。
- 其余图层各管一块画面；所有动画 keyframes 都写在组件内 `<style>` 或 Tailwind 类里，不污染全局样式。

### 5.5 服务层 hooks

- `useClockWeather.js`：每秒更新 `now`；天气每 5 分钟随机一次。
  返回 `{time,date,hour,weather,season}`。接真实天气 API 时替换天气部分即可。
- `useGeoRegion.js`：请求 `https://ipapi.co/json/`（4.5 秒超时）→ 判断 `country_code === "CN"`
  → `regionForProvince(region, region_code, city)`；结果缓存到 `localStorage["pondclock.geo"]`；
  失败/境外网络回退 `DEFAULT_REGION` 并把 `source` 标成 `fallback/oversea` 供 UI 提示。
  返回值：`{regionId, source, detail, cached}`。

---

## 6. 常见需求怎么改

### 6.1 加一条鱼

1. 在 `gameConfig.js` 的 `FISH` 里加一项：
   ```js
   { id: "newfish", name: "新鱼", basePrice: 10, len: [20, 40], wt: [0.5, 2],
     qw: { common: 89, rare: 9.6, epic: 1.2, legendary: 0.2 }, habitat: "某水系底层" }
   ```
2. 把 `newfish` 加进一个或多个 `REGIONS[].fish`：`["newfish", 18]`（权重）。
3. 重新加载页面即可；图鉴会自动出现（按水域筛选）。
   注意：`qw` 四档最好合计 100；权重必须 > 0。

### 6.2 加一个水域

1. 在 `REGIONS` 里加一项（保持 `id` 唯一）：
   ```js
   { id: "newregion", name: "某·水系", waterSystem: "某某干流与湖泊",
     tier: 13, flightPrice: 6500, fish: [["jiyu", 30], ["newfish", 10]] }
   ```
2. 在 `PROVINCE_TO_REGION` 里把对应省份/拼音指过来。
3. 图鉴、漫游面板、UI 全部按配置自动渲染；无需改组件。

### 6.3 调咬钩频率 / 判定窗口

- 频率：`BITE.minSeconds / BITE.maxSeconds`；鱼竿 `RODS[].intervalMult`；`useFishingGame` 里的
  `WAIT_FLOOR`（25 秒）与挂机提速系数。
- 窗口：`JUDGE.windowSeconds`；鱼竿 `RODS[].windowBonus`。
- 想临时快进测试：URL 加 `?bite=3`。

### 6.4 调品质与保底

- 单鱼种品质：`FISH[].qw`。
- 装备加成：`RODS[].qualityBonus`、`BAIT_QUALITY_BONUS`；
  `gameUtils.js` 内部的 `QUALITY_BONUS_RATE`（稀有 +1.0/点、史诗 +0.3/点、传说 +0.1/点）控制加成曲线。
- 保底：`PITY_THRESHOLD`（默认 30）；触发时史诗/传说权重 ×5（`PITY_WEIGHT_MULT`）。
  `codex` 面板顶部会显示当前计数。

### 6.5 调经济

- 单条回收：`FISH[].basePrice` × `QUALITIES[].mult` × 体重系数（`calcSellPrice`）。
- 机票：`REGIONS[].flightPrice`（当前为固定价；要做距离定价就改 `travelTo` 里的价格来源，
  并给区域补坐标，见原始策划案）。
- 鱼竿：`RODS[].cost`；鱼饵：`BAIT_COST / BAIT_CATCHES / BAIT_QUALITY_BONUS`。

### 6.6 改小人台词

编辑 `src/lib/speech.js` 的 `SPEECH`：

- `idle`：久等没鱼；`success`：普通鱼；`rare`：稀有鱼；`high`：史诗/传说；
  `miss`：咬钩没点；`impatient`：待机戳浮漂；`airForce`：10 秒内戳 5 次。
- 数组里随便增删句子；`pickLine` 会随机且避免连续重复。
- 台词长度建议 ≤ 18 个汉字（气泡会换行，过长会被裁切）。

### 6.7 改桌面挂件外观

- 天空透明度：`src/components/pond/palette.js` 的 `SKY_ALPHA`（0–1，越小越透）。
- 桌面壁纸（Web 预览用）：`src/components/layout/DesktopBackdrop.jsx`，可换成图片/纯色；
  打包成桌面软件时**删掉该组件**，改为真实透明窗口。
- 面板/时钟/功能坞：Tailwind 类直接改 `bg-slate-950/35`、`backdrop-blur-md` 等即可。
- 深色主题变量：`src/index.css` 的 `.dark` 段 + `index.html` 的 `class="dark"`。

### 6.8 增加一个"点击展开"的功能面板

1. 在 `src/components/layout/ActionDock.jsx` 的 `DOCK_ITEMS` 加一项 `{ id, label, icon }`。
2. 在 `src/pages/Index.jsx` 的 `PANEL_TITLES` 加标题、在 `renderPanelContent` 的 `switch` 里返回内容。
3. 新面板组件放 `src/components/panels/`，接收 props 即可。
   收起/展开、Esc、点按钮高亮都由 `Index` 统一处理，不用重复写。

### 6.9 加入本地存档（当前未实现）

推荐做法：在 `useFishingGame` 里用 `useEffect` 监听 `coins/unlockedRegions/codex/rodLevel/...`，
节流写入 `localStorage["pondclock.save"]`；初始化 state 时读取并做版本号/字段兜底。
注意 `bucket`/`speech`/`status` 属于瞬时状态，不建议存。正式桌面版建议 SQLite/文件存档。

---

## 7. 开发调试参数（仅开发模式，生产构建自动移除）

| 参数 | 作用 |
|---|---|
| `?bite=3` | 咬钩等待缩短到 3 秒 |
| `?coins=5000` | 覆盖初始金币 |
| `?tab=bucket\|codex\|shop\|travel` | 启动时直接展开对应面板 |
| `?demo=bite` | 预览咬钩态与倒计时 UI |
| `?demo=idle\|success\|high\|miss` | 预览对应语气的台词气泡 |
| `?hour=12&weather=晴&status=bite&wl=14&say=文本&tone=high` | 水塘美术自检参数 |
| `?hour=21` / `?weather=多云` | 固定昼夜/天气（不改变玩法） |

> 生产环境这些参数无效：`import.meta.env.DEV` 守卫 + Vite 死代码消除。

---

## 8. 验证清单（改完至少跑一遍）

```bash
npm run build          # 必须通过
npm run preview        # 打开 build 产物检查
```

手动验收：

1. 开局金币 100、本地水域已解锁、其余水域锁定。
2. 挂机 55–125 秒左右浮漂下沉；点击水塘/小人收竿；超时不点出现"太可惜了…"。
3. 鱼获进入鱼篓，图鉴出现记录；卖鱼后金币增加、图鉴记录保留。
4. 鱼饵钓到鱼时自动消耗，用尽自动启用下一份。
5. 点击浮漂：单击出"别急"类台词；10 秒内连点 5 次出"你这样钓鱼准空军"。
6. 功能坞默认收起；点击按钮展开面板、再点收起、Esc 收起；同时只有一个面板。
7. 半透明天空能透出桌面壁纸层；时钟/功能坞/面板都是玻璃质感。
8. 700–1100px 宽度不塌、不横向滚动；夜晚/白天/雨雪有区分。
9. 生产构建下 `?demo=` 等调试参数不生效。

---

## 9. 桌面化迁移（正式版方向）

当前 Web 原型验证的是玩法与数值。要做真正的"桌面软件"，有三条路线：

### 方案 A：Electron 包壳（最快复用现有代码）

```js
// main.js（Electron 主进程示意）
const win = new BrowserWindow({
  width: 760,
  height: 560,
  transparent: true,      // 透明窗口
  frame: false,           // 无边框
  resizable: false,
  alwaysOnTop: true,      // 置顶
  skipTaskbar: false,
  hasShadow: false,
  webPreferences: { contextIsolation: true },
});
win.loadFile("build/index.html");
```

需要配合的改动：

1. **删除** `src/components/layout/DesktopBackdrop.jsx`（桌面端不再需要假壁纸）；
2. `src/index.css` 把 `body` 背景改为 `background: transparent;`；
3. `vite.config.js` 生产 `base` 改成 `'./'`（`file://` 加载资源需要相对路径）；
4. 天空透明度保持 `SKY_ALPHA`（0.6 左右），水面仍不透明，保证可读性；
5. 若要"不抢焦点/点击穿透"，用 `win.setIgnoreMouseEvents(true, { forward: true })`，
   在鼠标进入浮漂/按钮等热区时临时关闭；判定窗口内可临时 `focusable`；
6. 存档改用文件/SQLite（参考 `useFishingGame` 的 6.9）；
7. Steam 接入用 `steamworks.js`（成就、云存档、库存）。

### 方案 B：Tauri 2 包壳（体积小，Rust）

```json
// tauri.conf.json（窗口部分示意）
"windows": [{
  "transparent": true,
  "decorations": false,
  "alwaysOnTop": true,
  "resizable": false
}]
```

同样需要删除 `DesktopBackdrop`、body 透明、`base: './'`；透明窗口在部分 Linux 桌面环境需要额外合成器支持。

### 方案 C：Godot 4 重实现（策划案首选）

策划案原本建议 Godot 4：`DisplayServer.window_set_flag(WINDOW_FLAG_ALWAYS_ON_TOP)`、
透明窗口、无边框、低响应点击都更原生。Web 原型里的数值、配置结构和状态机可以直接迁移：

- `gameConfig.js`/`gameUtils.js` → JSON 配置表 + GDScript 读取；
- `useFishingGame` 的状态机 → `FishingStateMachine` 节点；
- SVG 场景 → Godot 2D 场景（剪影/浮漂/水波 shader）；
- 存档 → SQLite/文件；Steam → Steamworks SDK。

### 分享给朋友体验（Web 原型）

- 构建后用任意静态托管：Netlify / Vercel / Cloudflare Pages 等，把 `build/` 目录上传即可
  （本项目用 HashRouter，不需要配置 SPA 重写；但资源路径是 `/assets/...`，请部署在域名根路径）；
- 或临时用内网穿透（cloudflared/ngrok）把 `npm run dev` 的 8080 端口暴露成公网 https 链接；
- 若使用本项目的 NoCode/低代码平台，也可以直接用平台的"预览/发布"入口生成分享链接。

---

## 10. 已知限制 / TODO

- **无存档**：刷新页面金币、图鉴、解锁水域全部重置（原型限制）。
- **天气是模拟数据**：`useClockWeather` 随机切换，未接真实天气 API；策划案要求的降温/降级逻辑未实现。
- **机票是固定价**：未实现按水域距离/档位的动态定价公式。
- **无音频**：环境音、咬钩提示音、收竿音效尚未接入。
- **无桌面窗口能力**：置顶/透明/点击穿透需要桌面壳（见第 9 节），浏览器做不到。
- **UI 未做移动端专门适配**：小屏可用但布局按桌面挂件设计。
- **无自动化测试**：目前靠构建 + 手动验收清单；可补 Vitest（纯函数）与 Playwright（交互）。

---

## 11. 踩坑记录（改代码前必看）

1. **不要直接在组件里写平衡数值**：全部进 `gameConfig.js`，否则策划改表会失效。
2. **判定窗口点击与待机点击是两套逻辑**：`bite` 时整块水塘是收竿热区（z-30）；
   `idle` 时只有浮漂处有戳点热区。加 UI 时注意 z-index 不要挡住这两块。
3. **SVG 场景是等比缩放**：HTML 覆盖层（气泡/倒计时/戳点）要用百分比坐标，
   并与 `scene.js` 的坐标换算（`x / VIEW.w * 100%`）。别用像素写死。
4. **台词气泡会被替换**：连续触发台词会直接覆盖上一句并重置 4.6 秒计时，这是预期行为。
5. **IP 定位可能失败**：headless 浏览器/离线/境外网络会降级到默认水域，属于正常；
   漫游面板会显示"定位失败，已使用默认水域"。
6. **Tailwind 的 `animate-in` 类来自 tailwindcss-animate**：新增动画先确认插件已启用。
7. **shadcn/ui 的按钮在深色下依赖 CSS 变量**：`index.html` 的 `class="dark"`
   不能删，否则会出现白底白字。
8. **构建产物在 `build/` 不是 `dist/`**：部署脚本别写错；`vite preview` 会读这个目录。

---

## 12. 原始策划案

玩法口径以项目根目录的策划案为准：桌面陪伴、轻张力等待、地域即内容、记录而非囤积、克制经济。
当前原型已经实现：钓鱼判定、随机产出、12 水域与 IP 跟随、漫游解锁、图鉴最佳记录、鱼竿/鱼饵、卖鱼、
时钟天气（模拟）、小人说话、半透明桌面挂件 UI。
