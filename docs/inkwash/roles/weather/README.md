# 天气模块：双轨天气、十二水域预取与渲染状态交接

日期：2026-10-23（Asia/Shanghai）。基线：水塘时钟 1.1.1。负责人：天气模块 agent。
本轮只新增本文；功能代码、数值坐标、真实 IP／天气请求及功能验收均未执行。
先读[总入口](../../README.md)、[需求 R／A 编号](../requirements/README.md)、[美术地点](../art-direction/README.md)、[架构契约](../architecture/README.md)。

## 1. 职责与现状依据

- R08／A08：顶部始终取现实 IP 地天气；场景只取 `game.currentRegion` 对应的代表景点。两者地点、来源和错误分别显示。
- R09／A09：IP 识别启动时同步安排全部 12 区天气，包括未解锁区；任何失败都不阻塞读档、钓鱼、交易或旅行。
- R10／A10、R12／A13：抵达展示景点名／地址及天气；设置查看器仅切换查看目标，不写出行、金币、解锁或游戏位置。
- R04–R07／A04–A07：输出统一视觉状态，供天空、倒影、降水、水面与人物共同消费；粒子与遮罩由渲染角色负责。
- 已读 `weatherRefresh.js`、`environment.js`、`useClockWeather.js`、`services.js`、`environmentEndpoints.cjs`、`desktop/environment.cjs` 及现有测试；适用目录未发现 AGENTS.md。
- 当前请求只含 `temperature_2m,weather_code`；解析后丢弃原码，仅剩晴／多云／小雨／雪，阴、雾、冻结降水和强度会失真。
- 既有刷新 15 分钟、缓存最长 6 小时、手动节流 2 秒、天气等待 6 秒、失败退避 1–15 分钟；桌面运输超时 8 秒。
- 当前单控制器已有 generation、AbortController、按三位小数坐标键缓存；不等于已具备十二地点仓库或全局并发预算。

## 2. 后续文件所有权与禁止边界

以下为未来实施划分，路径由架构角色收敛；本轮不创建这些实现文件。

| 范围／建议文件 | 主责 | 交接限制 |
| --- | --- | --- |
| `src/services/environment.js`、`weatherRefresh.js`、新增 `weatherScheduler.js`／`regionWeatherStore.js` | 天气独占 | 扩字段、校验、缓存、调度；保留注入时钟／请求／storage 能力 |
| 新增 `src/domain/weatherVisualState.js` | 天气独占 | 归一化与唯一纯视觉转换，不导入游戏状态、存档或渲染组件 |
| `src/config/services.js` 的 weather 配置 | 天气；架构复核 | 刷新、并发、预算集中配置，不能各 hook 各设一份 |
| `src/data/sceneSites.js`、`src/config/sceneDefinitions.js` 与主契约 | 架构／数据独占 | 负责坐标核实；美术交地标，天气消费，不自改景点 |
| `useClockWeather.js`、新增 `src/hooks/useRegionWeather.js` | 天气独占 | 不在 React render 内请求，不替换现实 IP 语义 |
| `src/pages/Index.jsx` | Leader 独占 | 天气只提交入口 API 与接线说明 |
| `src/index.css`、header／layout／panels（含天气查看器） | UI 独占 | 消费只读 entry；只持有自己的查看 regionId |
| `src/components/pond/**`（含场景地点标签） | 渲染独占 | 只消费统一 WeatherVisualState，不再独立猜天气 |
| `tests/environment.test.js`、`weather-refresh.test.js` 与新增队列／映射测试 | 天气；独立验收复核 | 全部用假响应、假时钟，后续另留真实联网验收证据 |

不得修改 `REGION_LOCATIONS`、132 航段、票价／耗时、鱼价、存档 schema 或 IP 免费解锁逻辑，不自行扩大 HTTPS 请求安全边界。
必要 desktop 环境适配与白名单维护归天气角色实施，架构／独立审查审核边界；跨 IPC 取消或 batch 扩展另行评审，本轮不改 main／preload。

## 3. 数据契约与地点绑定

与架构采用同名契约；字段的正式定义以[架构 README](../architecture/README.md)为唯一入口。

| 对象 | 天气模块输入／输出及约束 |
| --- | --- |
| `SceneDefinition` | `sceneId/regionId/siteId/revision` 与画面层／几何引用；由架构将 game.currentRegion 解析到对应 SceneSite |
| `SceneSite` | `sceneId/regionId/siteId/siteRevision/place/address/timeZone/weatherLocation/coordinateSource/verification`；经纬度、来源和核实日期独立，pending 时坐标可 null |
| `locationKey` | 提供者＋请求坐标规范化＋字段／单位版本；属于天气数据身份，不能只用 regionId 或地点文字 |
| `targetKey` | 现实 IP 上下文或 `scene:siteId@siteRevision`；属于订阅身份，放在 WeatherEntry，不写进共享快照 |
| `WeatherSnapshot` | `schemaVersion:2/locationKey/provider/weatherCode/temperatureC/isDay/cloudCoverPct/precipitation/observedAtMs/fetchedAtMs/source/quality`；不存 UI 地点名 |
| `WeatherEntry` | `targetKey/generation/snapshot/status/errorCode/retryAtMs`；刷新、错误、排队均为运行态，不进经济存档 |
| `WeatherVisualState` | `sky/celestial/precipitation/waterResponse/fisherman/daylight/quality` 七组；由 Snapshot 统一派生，结构不再另起一套 |

`source` 区分 online／cached／simulated；`quality` 为 complete／partial／legacy／simulated，不能靠来源替代完整度。
Snapshot 的 precipitation 固定为 `totalMm/rainMm/showersMm/snowfallCm/intervalSeconds`，未知均 null；原始 weatherCode 保留在 Snapshot，不复制成另一份渲染事实。
scene 与 viewer 共享同一景点 entry／网络结果，但各有独立 selector；header 即使恰好同坐标也重新绑定自己的 IP 地点标签。
仅完全相同请求坐标、提供者、单位和字段版本可合并底层请求；不以旧三位小数键碰巧相等合并不同景点。
SceneSite 坐标或版本变化必须换 targetKey；缓存命中后仍验证 locationKey，再绑定当前 place／address，禁止复用缓存里的旧名称。

| 消费端 | 目标来源 | 更新时序 |
| --- | --- | --- |
| header | 有效 IP 坐标；失败沿既有现实参考点／缓存规则并诚实标注 | IP 更新只换现实目标，不跟航程或 viewer 改变 |
| scene | `game.currentRegion → SceneSite` | 出发后保留出发地；实际抵达更新 currentRegion 后才切换背景、标签和天气 |
| viewer | 设置内独立选择的 12 区之一 | 可看未解锁区；切换只订阅缓存／提升过期任务优先级，无任何游戏写命令 |

十二景点先沿用美术候选：文德桥、涂山淮河、花园口、汉阳江滩、金山寺、沙面、夔门、洱海东岸、博鳌河口、北极村、轮南塔里木河、纳木错。
全部数字坐标仍 pending；洱海东岸等须先明确机位。禁止用南京／哈尔滨等航线城市补齐未核实景点；未配置点显示待配置／模拟，不伪称已取得真实天气。

## 4. 预取调度、并发与配额

优先沿用当前单地点 HTTPS 请求与一个全局有界队列，不为 12 区各创建独立轮询器。
以下数值是本轮实现建议，待假响应调度测试后确认，不宣称服务商配额或已测性能。

| 项目 | 建议预算／规则 |
| --- | --- |
| 真实运输并发／启动间隔 | 最多 2 个；相邻启动至少 1 秒；同 locationKey in-flight 合并 |
| 常规一轮 | 最多 13 个唯一地点：12 景点＋1 现实 IP；已有新鲜结果不再请求 |
| 滚动 15 分钟总预算 | 最多 26 次天气网络尝试，含手动、重连、IP 更新、取消后重发及重试；不计本地缓存读取 |
| 单地点失败上限 | 每滚动 15 分钟最多 3 次尝试，即首次＋最多 2 次重试；仍受全局预算约束 |
| 新鲜度／超时 | 沿用 15 分钟刷新、6 小时可用缓存；等待 6 秒与 main 8 秒界限分别计量 |
| 优先级 | header／当前 scene → 打开的 viewer → 在途目的地 → 其余景点；同级 FIFO，后台首次优先于后台重试 |

1. 联网启动、每次 IP 识别启动、顶部正常刷新均调用同一 `prefetchAll(reason, epoch)`；不等待 IP 成功才启动景点预取。
2. 每次触发枚举完整 12 ID，freshness／epoch 合并已排队任务；geo 每 2 分钟轮询不会每次再发 12 个请求。
3. IP 结果产生后更新 header 目标；scene／viewer 变化仅提升既有任务或为过期条目入队，不重建整批。
4. 缓存立即可读，预取在后台渐进完成；预算耗尽显示等待，不绕道新 requester，也不阻塞游戏。
5. focus／online／30 秒 poll 只唤醒同一调度器；隐藏窗口暂停低优先自动派发，恢复后补齐过期目标而不补发历史轮次。
6. 普通失败沿用 1 分钟起、指数增长至 15 分钟的退避；预算或 origin 冷却更晚时取较晚时间，可加可测试的小抖动。

429 必须按 `https://api.open-meteo.com` origin 暂停全部天气队列，等待 `max(既有15分钟下限, Retry-After)`；手动、重连和切区不能绕过。
若遇HTTP200但响应明确为供应商配额错误，防御性识别必须贯通renderer与main同origin闸门，不能重建页面后绕过；这不是已观察到的本轮真实服务响应。
继续识别 Retry-After 秒数／HTTP 日期，并沿用 main 的 429 闸门；403、超时、无效响应仅影响相应 entry，不把错误文字当地点或真实天气。
不增加 IP 供应商、天气域名、查询参数键或代理／探测请求；第 6 节只扩展 current 已允许的字段值。IP 失败不能把同一默认城市天气填进 12 区。

### 多坐标 batch 仅作为后续评估项

[Open-Meteo 官方文档](https://open-meteo.com/en/docs)支持逗号分隔多坐标，返回结构会变成数组；这不表示现有桌面桥已支持。
main 的经纬度验证使用 `Number(raw)`，当前拒绝多坐标；现有解析器也只接单对象。首版不更改此边界。
若后续证明单点队列不足，先评估服务计费／限额、数组一一对应及错序／部分失败、URL／响应大小、取消、429 和旧版本兼容，再单独审查 main 数组上限与测试；不得直接放宽为任意 URL。

## 5. 缓存失效、取消与晚响应

- 采用独立天气缓存 v2；只写校验成功的在线快照，不写模拟温度、错误或游戏状态。版本／坐标／字段不符即不命中。
- 旧 v1 只有粗分类，不得逆造 WMO、云量和强度；可暂作 legacy 缓存显示并安排刷新，无法恢复的字段保持 null。
- `observedAtMs` 与 `fetchedAtMs` 分别是数据有效时刻和本机获取时刻；沿用未来超过 15 分钟、年龄超过 6 小时及本机时钟回拨的拒收规则。
- 15 分钟以内复用，15 分钟至 6 小时标缓存并后台刷新，超过 6 小时回退该地点模拟；无温度就显示未知，不能编造数值或联网更新时间。
- 维护 per-target generation 与 requestId；提交前核对当前 targetKey、siteRevision、locationKey 和 generation，旧 A 晚于 B 返回也不能覆盖 B。
- 选择变化不使仍被预取订阅的 A entry 自动失效；原身份仍有效的 A 回复可更新 A 自身缓存，但不能改当前 B selector。
- viewer 关闭／切区只撤销自己的订阅；scene、header 或预取仍使用的同键任务继续。无人需要且不在预取计划的排队项可移除。
- 离线、禁用联网或 dispose 时停止派发、取消可取消运输并使旧 generation 失效；恢复后仅调度新鲜度不足条目，保留 429 截止时间。
- **现有桌面取消缺口**：renderer AbortSignal 只结束等待，`desktop.requestEnvironment(url)` 未把取消传到 main；天气 HTTPS 可能继续至完成／8 秒超时。
- 因此队列必须按实际运输结束占槽；取消 UI 等待不能立即释放并发额度。可保留底层 bridge promise 等 settle；如未来增加 requestId／cancel IPC，须另审查并验证真正取消。
- 迟到响应只有仍有效的原请求身份才可提交；被取消／被版本替代的响应丢弃，不能写缓存或冒充当前成功。日志只记目标／代码／耗时，不保存完整 IP。

## 6. WeatherVisualState 与真实字段

在已允许的 current 字段内追加 `is_day,cloud_cover,precipitation,rain,showers,snowfall`，显式 Celsius／mm／unixtime；逐字段校验并保留原值、单位、`current.interval`，缺失值留 null。
[官方字段说明](https://open-meteo.com/en/docs)中 is_day 是该时刻日夜，current 的 interval 是累计时段秒数，snowfall 使用 cm；不能把雪 cm 直接加到雨 mm，或把 15 分钟累计量冒写成 mm/h。

| 原始代码／组合 | 统一派生语义与渲染要求 |
| --- | --- |
| 0／1／2 | 晴／大部晴／多云；sky 保留区别，云量驱动覆盖与透明度，不固定出现太阳 |
| 3 | 阴；云覆盖，直射日光、太阳盘／光晕／太阳倒影共同隐藏 |
| 45／48 | 雾／雾凇雾；雾影响能见效果而非自动生成雪；关闭直射日光 |
| 51／53／55／56／57、61／63／65／66／67、80／81／82 | 毛毛雨／雨／阵雨；冻结语义由原码／文字保留，首版 kind=rain、waterResponse=rain-impact，不宣称有冻结物理 |
| 71／73／75／77／85／86 | 雪及阵雪／雪粒，保留轻中重或未知；waterResponse 为 snow-dissolve，人物启用雪承接层 |
| 雨量与雪量同时有效且为正 | kind=mixed；首版 waterResponse=none 的保守回退，不误称已实现双相接触；不因低温把雨强改雪 |
| 95／96／97／99 | 原码／文字保留雷暴／冰雹；无雹的有效降雨用 rain，含雹用 unknown／none 保守回退，不扩展闪电／冰雹物理 |

代码解释以[官方 WMO 表](https://open-meteo.com/en/docs)为准；2026-10-23 文档包含 97，现有 weatherCodes 未接纳，后续需补兼容测试；未知码保留原码并降级显示，禁止猜成晴天。
precipitation 统一带 kind、intensity、basis；kind 只用 none／rain／snow／mixed／unknown，intensity 只用 none／light／moderate／heavy／unknown，basis 与主契约一致。
优先原始有效量／interval，次用代码等级；数值阈值是可测试视觉参数，未知不当作实测小雨。扩展混合／冰雹接触时先更新主契约，不能在消费者私加枚举。
celestial 统一给太阳／月亮／星点及倒影门控；建议仅白昼、0／1／2、低遮蔽且无降水时允许太阳，云量阈值作为可审查视觉参数。
阴、雾、雨、雪和雷暴时直射门控为关；月亮／星点同样遵守日夜与遮蔽。水面只能消费同一门控，不能自行按电脑 hour 画金色光柱。
daylight 优先快照 isDay；过陈／缺失按架构的已核实景点时区回退且标派生，不能借 header 当地时刻冒称景点实测日夜；不新增游戏时间系统。
fisherman 只交雨装／雪承接及消退目标，积雪是表现状态；粒子密度、遮罩、消融时序与减弱动态由渲染角色配置，不写永久存档。

## 7. 后续验证场景与交接完成条件

以下均**待执行**，用请求注入、假时钟、deferred promise 和独立 storage 复现；真实联网核实另行记录。

| 追踪 | 验证输入 | 通过证据 |
| --- | --- | --- |
| R08／A08 | IP 甲晴、scene 乙雪、viewer 丙雨；分别改 IP、抵达及查看目标 | 三套地点／来源不混，太阳与人物仅消费 scene 状态 |
| R09／A09 | IP 成功／失败／频繁轮询，12 区包含未解锁区，部分超时 | 12 ID 均入计划；并发≤2、间隔≥1秒、滚动预算与优先级记录；游戏继续 |
| R10／A10 | 旅行中、实际抵达、离线重开 | 在途不提前切景；抵达景点标签、背景、快照一致，顶部不移动 |
| R11／A11 | A 迟到、B 已抵达，坐标版本改变、关联网后响应返回 | generation／targetKey 拒收旧结果，未写错缓存；桌面实际运输数有界 |
| R11／A11 | 旧 v1／坏缓存、未来时间、回拨、6 小时过期、存储不可写 | 诚实回退、null 字段、不伪造实时；各地点错误独立 |
| R09／A09 | 429 秒数／日期／缺头，手动点击、切区、重连和 renderer 重建 | origin 冷却不被绕过；到期渐进恢复，无重试风暴 |
| R04–R07／A04–A07 | 白昼阴小雪→雨→晴，雾、夜、多云、混合、97及未知码 | 映射断言＋渲染截图；太阳与倒影一致，雨击水／雪消融不同 |
| R12／A13、A12 | 逐一查看12区并记录操作前后游戏状态／132航段 | viewer 仅查看，资产与currentRegion不变；航线地点／票价不变 |

交给架构：七组视觉契约、entry／snapshot 地点分离与调度预算；交给 UI：只读订阅、来源／时间／错误；交给渲染：原码、强度质量、日夜及同源倒影门控。
当前完成：源码与约束只读核对、与架构／渲染角色协调、官方文档语义查证和本交接设计。未执行：坐标核实、代码实现、真实 IP／天气 API、单元／集成／视觉／性能／发行验收；不得标记 A 项通过。
