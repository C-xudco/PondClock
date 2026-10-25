# 1.3.0 独立监督与验收交接

日期：2026-10-25（Asia/Shanghai）。负责人：`style_supervisor`，独立于本轮规则、天气、美术和 UI 实现者。产品基线 `e4d87f3`（1.2.0），评审对象为当前 1.3.0 工作区。

**最终结论：未发现阻塞发行的外观/天气功能缺陷。** 独立规则4/4通过；Leader执行的最终生产UI10/10通过，独立核对报告、当前bundle哈希与截图一致。完整[监督核对JSON](REVIEW_CHECK.json)。安装器、真实联网和长期性能未据此标为已测。

## 意图与权限边界

用户要求自选风格拓展包、游戏金币购买、背景与天气来源分开，同时继续监督和 README 留痕。此角色验证实际实现是否满足这些要求；不会把美术相似气氛解释为可复制他人的角色或资产，不把“商业拓展包”解释成已获准人民币支付。

本角色仅写本目录、独立 [规则复核测试](../../../../tests/style-supervisor.test.js) 和 [生产 UI 脚本](../../../../scripts/smoke-style-packs.cjs)。不改实现文件，不弱化实现者的测试，不接触玩家真实存档、系统权限或外部网络。源码问题直接报 Leader，由原所有者修正，再独立复验。

## 阅读范围与判断

| 范围 | 复核结论与限制 |
| --- | --- |
| 商品、扣费、装备 | 配置稳定 ID/金币价格/三槽 grants；已拥有商品独立于 128 条命令历史，重购无扣费；购买不自动装备，未拥有和飞行中拒绝 |
| 确认保存与异常 | 沿用串行 GameSession，确认后才发布；未知回执先重读，无法确定时阻塞；独立测试覆盖“已落盘但回执和重读均失败” |
| schema1/2 → 3 | 共享校验器兼容，repository 先原字节备份再迁移；未见为新功能改写存储规则；独立测试再覆盖最新外观槽损坏时保留旧的有效已购权益 |
| 漫游与天气 | 实际 ARRIVE/REAL_VISIT 同事务改为 fishing；仅 GEO_VISIT/起飞不改模式；背景仍来源 currentRegion/site，天气覆盖用 env 或 scene |
| 现实城市 | local 使用 env.weatherPlace，能保留东莞，而非泛化成岭南或背景广州；manual 明确 source=manual，无温度/观测时间，不写真实缓存 |
| 渲染与资源 | 原有水墨资源保留，minimal 独立 SVG；目录与 renderer 的 slot ID 对应；未发现外观影响鱼竿等级/品质或 RNG 的路径 |
| 层次债务 | `domain/weatherPresentation.js` 导入 service 中两纯格式函数，没有执行请求或注册副作用，当前不构成功能阻塞。将来可下沉 snapshot 结构与展示词汇到 shared/domain，避免模块位置继续扩大 |

本轮阅读未发现阻塞性产品缺陷。代码阅读、自动规则检查和实际生产 UI 证据分别记录，不能互相替代。

## 独立规则证据

`node --test tests/style-supervisor.test.js`：4 项通过；限定 ESLint 通过。

1. 枚举五商品全部 120 种购买顺序，余额扣除精确一致、权益集合一致、装备不擅自改变、随机种子与等级不动。
2. 购买落盘后回执丢失且重读失败，会阻塞下一笔交易；重启读回后再次买相同商品不扣第二次。
3. 较新槽拥有“未购买却装备水墨”的无效状态时，从有效槽恢复已购水墨，读取不擦除任一原槽字节。
4. 广州背景在现实东莞雨/手动雪/钓点晴间反复切换，背景对象和所有输入观测不被修改，经济状态不受影响。

保留输出：[独立规则 TAP](RULE_CHECK.tap)。全项目测试与发行统计由 Leader 的最终记录提供，本角色不把自己的 4 项误报成全部测试。

## 生产 UI 脚本契约

运行方式：

```powershell
$env:POND_SMOKE_NO_SANDBOX='1'
node scripts/smoke-style-packs.cjs
```

使用真实 `desktop/main.cjs` 与当前 `build-desktop`；运行前必须完成 desktop build。显式无沙箱只用于开发 Electron 诊断，不更改产品默认 sandbox 配置。独立 profile 放在 `test-results/style-packs-smoke-*`；所有 HTTP 取消，并在 main 的 `net.fetch` 与独立定位 partition.fetch 注入 fixture。没有真实 IP/坐标流出。

夹具：现实东莞小雨 22℃，广州沙面钓点晴 25℃，东北黑龙江小雪 −7℃。咬钩声音在测试档关闭，本脚本不声称真人听感。

| 编号 | 实际调用与断言 |
| --- | --- |
| S01 | 新档免费 minimal、SVG 无位图；东莞与广州天气分开 |
| S02 | 未拥有的原生选项禁用、扣 1800 一次、不自动换装；三槽装备水墨后真实本地图解码 |
| S03 | 五商品实际按钮购买、两个新人物与两支竿跨风格混搭 |
| S04 | 广州背景覆盖东莞雨；手动晴/阴/雨/雪，顶部现实天气不动 |
| S05 | X 正常退出与重启，金币、权益、装备、手动雪保留 |
| S06 | 实际付费航班，到达前保留原景/模式，到达后切目的地天气，顶部东莞不变 |
| S07 | 两风格 × 两客户端尺寸 × 五面板边界、透明文档与内滚动 |
| S08 | 实际付费漫游至全部 12 区，每区两风格截图；每张水墨图真实本地解码 |
| S09 | 三槽免费恢复原初，不花金币、不丢权益 |
| S10 | 100 金币不足买任何商品，所有购买入口禁用且资产未变 |

`POND_STYLE_QUICK=1` 只跳过 S08；快速模式不冒称完整 12 区通过。`POND_ACCEPTANCE_DPR=1/2` 可指定额外像素比。脚本有 12 分钟总上限、独立进程清理与失败报告保留；报告包含 production HTML/JS/CSS SHA256、版本、诊断参数、截图和布局。

## 执行交接与未测边界

此角色编写脚本并执行独立 Node 规则测试。Leader 负责实际生产 UI 脚本运行及逐图查看；实际结果以 `test-results/style-packs-smoke-latest.json` 和 Leader 归档为准，脚本存在或 lint 通过不算实际 UI 通过。

前两轮执行反馈：受管 shell 未启动，0 组；随后普通获批 shell 通过 S01，但 S02 的 `option.isDisabled()` 报 false。脚本补原始 DOM 诊断后，现场三个 option.disabled 均为 true、outerHTML 有 disabled，父 select 与 Playwright 查询均 false。核对本地 Playwright 1.64.1 主源码，follow-label 会把 label 内 option 重定向到父 select；已确认这是测试 API 的重定向差异，产品选项没有失去禁用。

随后 S01–03 通过，S04 radio 精确标题查询超时；原生 label 同时包含标题与解释文字，因此改为标题前缀匹配，保留有益的完整无障碍说明。两处只修验收查询，没有修改产品或取消断言。完整实际重跑结果由 Leader 归档补充。

Leader 在实际混搭截图中另外发现装备成功 toast 连续堆叠，遮住底部功能坞。由 Leader 改为装备后只用确认的 select 状态和保存状态反馈；购买 toast 仍保留并使用同一 ID 合并、1.8 秒自动消失。这是实际产品可用性修正，需要按更新后的 bundle 重新验收和打包，不沿用旧 hash。截图脚本只等待通知自然计时消失（虚拟时钟启用时正常推进计时），不删除通知 DOM、不覆盖通知样式。

重复启动检查允许独立测试档中本夹具形成的新鲜缓存，不强制绕过缓存重发请求；未知/模拟仍不被接受为获取成功。

第三轮 S01–03 通过，`.check()` 立即检查受控 radio 时出现“点击后未改变”错误。现场磁盘 `save-a.json` revision14 已确认为 `sceneWeatherMode=local`，旧备槽 revision13 为 fishing，证明保存完成而框架即时检查早于确认发布。脚本改成一次 click → 等修订号增长 → 验证持久 mode → 等实际 input.checked，不跳过最终选中断言。装备选择同样已等待保存修订与实际 scene data，手动晴雨另等待真实视觉属性。

随后实际 S01–05 通过。S06 到达等待过早返回、读回仍为出发地/manual/未完成 travel。检查本地 Playwright 1.64.1 的 `waitForFunctionExpression` 主源码，轮询器立即把异步 predicate 返回的 Promise 视为 truthy，最终虽然会解析 Promise，却不会在解析 false 后再次轮询。脚本因此不再用异步 waitForFunction 读 IPC：改成 Node 侧最多 10 秒的 await loadSave → 显式条件轮询。到达另最多推进 10 次一秒虚拟时钟，最终分别断言 region、travel=null、mode=fishing；失败保留最近 20 次 revision/航程/模式/现实与逻辑时刻。所有交易修订等待也改用该有界轮询，未放松持久状态断言。

本角色独立查看了 `style-packs-smoke-3erMP2/default-minimal-guangzhou.png` 与 `mixed-ink-cloudwalker-jade.png` 两张真实生产 UI 诊断截图：默认矢量和水墨混搭区别清楚，顶部东莞小雨22℃与场景广州晴25℃同时可读，人物脚位于岸面、竿线连漂、五个底部入口完整可见，没有观察到通知堆叠或出框。这仅是两张图的独立复核，不等于全部12景的人工审美验收。

最终实际运行 `style-packs-smoke-Brmclw` 于2026-10-25 16:02–16:04（Asia/Shanghai）完成：10/10组通过、54截图、24布局检查、12区×2风格共24资源行、13次实际付费到达。页面错误与本地资源失败均为0。独立读取结果并逐项核对：所有到达保存 travel=null/mode=fishing；所有地区两个style均存在；12张水墨本图解码、minimal无本图；所有HTML/JS/CSS SHA256与当前build逐字节hash相同，最终JS为 `index-D3-7Q35x.js`（`920d77567a34dab383fd18a8d111965a4ddc959e71f068f529f8ec078f6c165d`）。

又独立查看该最终运行的广州背景/东莞雨、420小挂件水墨商城、640黑龙江阴雪三张截图：来源和地址不混淆、商城说明与已收藏状态可读且内滚动、阴雪无太阳、人物帽肩积雪、顶部仍东莞小雨且明确缓存。结合先前两张共查看5张；没有把54张全部称为人工逐图通过。最终正常EXE、ZIP与发行证据仍由Leader负责执行归档，本角色仅核对自己明示的范围。

未覆盖真人联网/VPN、第二台干净电脑、人民币支付（范围外）、安装器升级卸载、长时间性能与人工声音评审。普通 EXE、ZIP 完整性和发布状态由 Leader 独立留证。
