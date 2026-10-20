# 验收记录

日期：2026-10-20（Asia/Shanghai）。独立监督者维护本文件；通过、失败与未测分别记录。构建成功不等于安装、联网或离线使用已通过。

## 当前授权规则

- 每次启动联网获取当前公网出口对应的鱼群地区，接受 VPN 出口；成功后免费、永久累计解锁该地区。失败不冒称成功，不删除已有解锁。
- IP 更新 `realRegion`，不改 `homeRegion`，不强制切换保存的游戏位置，也不取消正在进行的旅行。
- “现实所在地垂钓”免费前往存档里记录的 `realRegion`，不允许通过目标参数任意选择地区；在途不能使用。普通游戏旅行每次购票。
- 航程按全图距离映射为 60–180 秒，票价候选 200–6000；市场倍率连续 0.8–2；现实连续七天后任何鱼均售 1 金币。
- Windows x64 最终交付为 NSIS 安装 EXE；旧版规划中的仅 ZIP 交付与仅首次 IP 解锁不再适用。
- 天气按电脑所在地 IP 坐标请求；游戏内飞行不改变电脑当地天气。没有有效 IP 坐标时才用配置中的代表点降级。

## 基线证据

| 项目 | 状态 | 证据及限制 |
| --- | --- | --- |
| 原型生产构建 | 通过 | Leader 已执行 Vite 基线构建，1653 模块 / 3.02 秒；输出在独立审查目录，不覆盖原型 build。不是修改后发行版验证 |
| 原型 lint | 失败 | `node node_modules/eslint/bin/eslint.js . --ext js,jsx --report-unused-disable-directives --max-warnings 0` 返回 1：原项目缺 ESLint 配置 |
| 原型数据结构 | 通过 | 42 鱼种、12 地区、4 品质；无重复 ID/未知鱼群或省映射引用，区域鱼权重均为正；仅结构检查 |
| 初始环境 | 已检查 | Node 24.19.0、pnpm 11.25.0 可运行；npm/yarn 不在当前 PATH；是否能干净重装另测 |

修改后的工程检查由 leader 运行并记录：Web构建、桌面构建、JS/JSX/CJS lint、冻结锁文件安装均退出0；当前命令与锁文件见 README、package.json 和 pnpm-lock.yaml。原型 lint 失败记录保留为历史基线，不代表修改后仍失败。监督者另独立执行下列78项自动测试。

`docs/generated/` 已输出实际配置派生的 `routes.csv`、`markets.csv`、`trade-estimates.csv` 和 `BALANCE.md`。收益表仅作首版估算，不把基础权重/中位体重的20条鱼增值当作完整挂机收益模拟。

## 独立自动化

运行命令：

```powershell
node --test tests/*.test.js
```

使用 Node 内置 test runner，不要求安装 Vitest。domain 28 项、session 15 项、desktop-storage 12 项、environment 16 项、web-storage 7 项；规则/状态测试使用确定输入，文件测试仅写入并清理 workspace 的 `tests/.tmp/` 隔离目录，Web适配测试只用内存存储，不接触真实用户存档。HTTP bridge/服务测试使用模拟响应，没有请求用户 IP/真实天气或运行 Electron。

监督者最新运行以上联合命令，退出码 **0**，**78 个测试全部通过**，无跳过/取消，test runner 报告约 227ms。包括 domain、提交协调、隔离目录文件故障注入、正式 schema→session→双槽存档重启链路、模拟环境服务与Web存档保护；未据此声称真实服务、实际断电恢复或安装版已通过。

运行留痕：首次 domain 23 项中 22 通过，1 项测试 fixture 缺少现有 rollFish 输入约定 `regionId`；补全 fixture 后 23/23 通过。增加新规则边界后 domain 28/28；随后 session 14/14、三套联跑 54/54；新增实际文件链路后55/55，加入环境测试后71/71，Web存档回归后78/78。监督者未修改实现以迁就测试。发现订阅者异常可能误归为存档失败，通知 leader 隔离异常后已加入回归并通过。

session 故障场景覆盖：提交先于通知、初始化回执丢失、保存成功但回执丢失后恢复及重启去重、明确写失败保持旧态、恢复读也失败时 blocked、串行双卖、防队列被失败命令污染、系统前跳再回拨仍单调推进、捕获/抵达统一提交。文件测试覆盖双槽损坏回退、校验和、rename 前失败、rename 后验证回执丢失、未来版本保护、导入原件保留。实际链路使用正式 validateSave 和 createSaveRepository，验证鱼获、图鉴、已付机票及抵达结果经文件重启后保持一致。

| ID | 验收项 | 当前状态 | 自动化/实测范围 |
| --- | --- | --- | --- |
| R01 | 12 地区完整 132 有向航段，504 市场格，无自身/未知航线 | domain 通过 | 全组合检查 |
| R02 | 全图 60/180 秒端点、200/6000 票价、单调与往返对称 | domain 通过 | 全航段公式、已知赤道/对跖距离、非法坐标；坐标来源见 COORDINATES.md，未独立重新测绘 |
| R03 | 购票原子、余额不足/无效目标拒绝、重放不二扣 | 自动测试/诊断UI通过 | 实际存档后丢失回执+重启不二扣；诊断UI实际购票扣款一次 |
| R04 | 在途禁钓鱼/售鱼/再次起飞/现实入口，退出后按原时间抵达一次 | 自动测试/诊断UI通过 | 进程重启保留航程；生产UI定时器在受控推进时钟后自动抵达；真实Windows系统重启/休眠未测 |
| R05 | 供应概率导出的 0.8–2 倍、销售地决定价格、单卖/全卖一致 | 自动测试/诊断UI通过 | 42×4×12 新鲜报价、销售地入账；诊断UI展示稀缺倍数并出售 |
| R06 | 七天−1ms/七天/七天+1ms，所有鱼种品质地区到期均=1 | 自动测试/诊断UI通过 | 42×4×12 时间边界；诊断UI中预置过期传说鱼售=1，未现实等待七天 |
| R07 | 鱼获/图鉴/鱼饵/装备与命令去重一致 | 自动测试/诊断UI部分通过 | 不可变输入、文件重启去重、并发同鱼仅卖一次；诊断UI收竿/售鱼保图鉴，装备UI未逐项实测 |
| R08 | 档案格式往返、坏资产/坏 ID/未来 schema/重复 UID/坏航程拒绝 | schema/双槽故障注入通过 | rename 前失败、写成功但回执丢失、恢复失败 blocked、坏槽回退/未来版本/导入备份；真实断电与完整升级迁移未测 |
| R09 | 每次启动 IP 免费累计解锁，不污染当前地区或家乡；现实入口受约束 | 自动测试/模拟IP诊断UI通过；真实服务403 | 模拟省映射/缓存/换VPN/超时/429通过；诊断UI导入后同步通过；授权后真实ipapi请求HTTP403，已验证降级，真实服务成功地区仍未验 |
| R10 | 天气地区隔离、来源/更新时间/缓存有效期、断网可玩 | 自动测试/离线诊断UI/真实HTTPS通过 | 开发宿主Open-Meteo直连HTTPS成功并解析online；不代表所有网络可达，也不代替正常沙箱安装EXE内的在线UI验收 |
| R11 | 桌面资源、最小 IPC、重开保留档案、窗口交互、导入导出 | 诊断模式部分通过 | 10组诊断通过，新主题截图已复验；原生人工对话框体验、正常生产沙箱启动未验 |
| R12 | Windows NSIS 安装/启动/重启/升级/卸载，断网且无 Node 可用 | 构建/安装通过；卸载不完整；启动部分诊断通过 | 当前用户静默安装exit0；实际安装app.asar受限诊断通过；卸载进程退出0但EXE未删除，不能标卸载通过。正常安装EXE沙箱启动/升级/第二机未测 |

## 最终代码复核留痕

监督者只报告问题，由 leader 修实现；新增回归测试及本验收记录由监督者维护。

- 导入后当前 IP 同步：发现 Index 原先按同一地区永久去重，导入旧档可能覆盖当前已识别的 realRegion/解锁。leader 已按实际存档字段同步，仅限制正在执行的请求；桌面 agent 新增模拟广东IP→UI导入黄河旧档的回归，已通过。
- Web未来档覆盖：已用内存存储复现旧版有效槽掩盖新版schema，并在下一次写入覆盖新版槽。leader 已整体拒绝未来版本读写、同revision内容冲突，并修复recovery.recovered标记；新增7项Web存档测试全部通过。
- 到达提交：已加 error/blocked 门禁、单一在途提交与明确失败30秒重试间隔，避免每秒重复排队与错误提示；静态复核通过，慢盘/blocked界面行为尚无独立UI故障注入。
- 模拟天气已改为“离线模拟”；生产主题构建补入 index.html 内容源，通用ui组件未为此修改。新构建诊断加入body实际深色断言并通过，主界面/漫游/鱼篓截图已由桌面 agent 及leader复验，无旧白底问题。

## Electron 诊断与宿主限制

桌面 agent 在 `test-results/electron-smoke.json` 留下最新10组功能诊断结果：`passed: true`、`hostSandboxEnabled: false`、无页面 consoleErrors。监督者已读取最新报告及脚本，尚未独立操作桌面 UI。

本宿主默认运行 Electron（包括 `--version`）报 `0x80000003`；加入全局 `--no-sandbox` 才能启动。诊断通过显式 `POND_SMOKE_NO_SANDBOX=1` 启用；这实质禁用 Chromium 沙箱。即使脚本读到 BrowserWindow 的 `sandbox:true` 偏好，也不能因此声称生产沙箱运行已验证。产品配置保持 `sandbox:true`，未把诊断降级加入正常发布启动流程。

诊断实际覆盖：新档完全断网初始化、生产钓鱼计时/点击收竿/出售与图鉴、IPC存档往返及重复提交、导出/导入、Electron进程重开保留已付航程与鱼获、过期传说鱼出售=1、真实UI购票后由生产定时器自动抵达、模拟广东IP后导入旧档再同步现实地区。导出/导入对话框在脚本中替换为固定文件选择结果，数据链路有运行，人工文件选择体验尚未验证。

早先的航程恢复场景用domain预置在途/到达状态；最新新增场景已从UI点击购票，检查扣款后用Playwright的`page.clock.runFor(durationMs + 2000)`推进受控时钟，生产ARRIVE effect完成到达，确认不二扣。它验证实际UI与定时逻辑，不是现实等待1–3分钟，也不等于真实系统休眠恢复。广东定位由测试主进程net.fetch模拟，只验证UI/桥接/存档同步，不能声称真实ipapi成功。

最新主界面/漫游/鱼篓截图已刷新并复验；生产CSS深色主题断言通过。正常沙箱运行、真实Windows休眠/系统重启与其他无Node电脑仍未验证。最终安装包已按最后代码/构建生成并单独核对字节及哈希，详见下节；发生重建碰撞的中间文件未交付。

## 最终安装包、安装与资源核对

最终构建退出0，安装文件为 `release/PondClock-Setup-1.0.0-x64.exe`：

```text
大小：116619415 bytes
SHA-256：994ea8f1aeb1854acca9c913f8e1f6fe763e449667d6624f23f1329c4036ea77
```

监督者已独立读取文件大小并计算SHA-256，与 [RELEASE_CHECK.json](RELEASE_CHECK.json) 相同。`scripts/verify-release.cjs` 核对18个ASAR运行文件与最终src/build文件字节一致，另核对extraResources图标与源ICO相同。先前iconMissing是校验脚本没有对Windows的ASAR路径做normalize而误报；脚本已修复，图标已显式包含在extraResources。该核对不证明操作系统启动行为。

leader实际以当前用户 `/S` 静默安装到 `test-results/installed-PondClock`，退出0，确认应用EXE及卸载程序存在。随后 `scripts/smoke-installed.cjs` 从该实际安装目录的 `resources/app.asar` 运行，使用同版开发Electron、隔离profile、全局禁沙箱、阻断全部外部网络；报告 [installed-smoke.json](../test-results/installed-smoke.json) 为passed:true，首次存档100金币/revision0，资源加载与本地落盘通过。

上述安装内容诊断没有直接正常启动安装目录中的PondClock.exe，不能据此标“普通Windows正常沙箱启动已通过”，也不能声称收件人无开发环境已实测。升级、正常沙箱启动、真实休眠/系统重启及第二台无Node电脑仍未测试。

卸载结果见 [INSTALL_CHECK.json](INSTALL_CHECK.json)：最初普通`/S`卸载在受管宿主挂起后停止；再以NSIS直接目录模式`/S _?=目标路径`运行，进程退出0，但`executableRemoved:false`，PondClock.exe仍存在。因此只能记录卸载进程结束，**不能标卸载完整通过**；残留原因尚未确定，应在正常Windows环境复验。leader在核对安装ASAR与release ASAR哈希一致后，仅手动清理独占的`test-results/installed-PondClock`测试目录，记录`manualTestDirectoryCleanup:true`，没有触碰用户存档。手动清理不计作卸载成功。

构建留痕：首轮打包与并发主题重建碰撞导致ENOENT，该中间产物未交付；最终使用完成后的资源重新打包成功。人工安装界面、发布者数字签名与其他机器兼容性均不由文件哈希或静默安装代替。

## 真实环境服务检测

在用户明确授权具体ipapi服务后，leader执行开发宿主直连HTTPS检测，结果保存在 [NETWORK_CHECK.json](NETWORK_CHECK.json)，没有保存完整公网IP：

- ipapi：真实请求返回HTTP403，走失败降级；当前网络下尚未验证真实定位成功。
- Open-Meteo：真实HTTPS请求成功，解析结果类型online。

这是开发宿主单一网络的结果；不会保证所有地区、VPN或收件人的网络可达。模拟广东定位回归仍应单独标为模拟。实际安装EXE的正常沙箱在线界面链路尚未验证。

## Windows 天气接口调查

已查微软官方资料（2026-10-20）。MSN Weather 有公开文档的云连接器，但文档列出的使用产品为 Power Automate、Logic Apps、Power Apps、Copilot Studio，不能据此当作 Electron 直接读 Windows 天气缓存的接口。[MSN Weather](https://learn.microsoft.com/en-us/connectors/msnweather/)

Azure Maps 提供天气 REST API，使用 Azure 账户认证/订阅密钥或 SAS；属于联网服务。[Azure Maps 当前天气与认证](https://learn.microsoft.com/en-us/rest/api/maps/weather/get-current-conditions?view=rest-maps-2025-01-01)

Windows 的 Geolocator 公开提供位置且需权限，不提供天气数据。[Geolocator](https://learn.microsoft.com/en-us/uwp/api/windows.devices.geolocation.geolocator?view=winrt-26100)

本轮未找到受支持、可直接读取 Windows 天气缓存的公共 API；这不是“Windows 没有任何天气 API”的断言。天气 provider 保持可替换；没有读取或逆向系统天气应用缓存。

## 后续填写原则

每次记录实际命令、退出码、测试数、产物和具体未测边界。失败必须注明责任模块与处理结果；修复后重跑对应测试。未经实际运行，不将候选实现或文件存在标为通过。
