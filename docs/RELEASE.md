# V2.0.1 场景铺满修复（免安装交付）

2026-10-28。修复不同窗口比例下场景两侧的透明留白；统一画面与人物/浮漂热区的等比变换，照顾低岸人物和对白可读性。玩法、天气获取与存档schema不调整，沿用PondClock-Focus进度。

主交付：`X:/game/水塘时钟-V2.0.1-免安装版.zip`，172689681字节（约164.7MiB）。SHA256：`b3037d34dc691fbdca437502d2b19b28a3c09094f5964b03c0017274b28973f8`。与开发输出ZIP完全一致；解压到 `X:/game/PondClock-2.0.1`，76个运行文件逐个匹配构建，65项包内资源匹配源码和生产输出。受影响46项测试、lint、生产构建与ZIP打包通过。

生产渲染器的浏览器/mock核验完成两档窗口、两画风、晴雨雪12组合、实际人物/浮漂点击，以及不重载的商城换画风和低岸水域旅行；报告与截图见本轮索引。未将历史2.0.0真实EXE检查当作2.0.1原生验收；本次未重验安装器，也不生成新版安装器。旧包、旧目录与用户正式存档均保留。

[本轮需求/架构/验证](v2.0.1/README.md) · [资源一致性](v2.0.1/RELEASE_CHECK.json) · [完整ZIP检查](v2.0.1/ZIP_CHECK.json) · [交付](v2.0.1/PORTABLE_DELIVERY.json)。

---

# V2.0.0 第一版 · 专注与钓鱼（历史免安装交付）

2026-10-28。已实现番茄钟与日票奖励、普通30%自动钓鱼/开停、15次主动竿与四色收鱼条、五新增水域/六新鱼、经典默认小人、最新拾物与约50金币毛均；删除数值鱼竿升级，专注版独立存档。第二版尚未定义。

主交付：`X:/game/水塘时钟-V2.0.0-免安装版.zip`（172688487字节，约164.7MiB），与 `release/PondClock-2.0.0-x64.zip` 完全一致。SHA256：`93ecf10046df91bee964b2483f7b2475b37e0ce180b363d19c2c5cbe00df1677`。76个文件完整解压到 `X:/game/PondClock-2.0.0` 并逐一核对；运行PondClock.exe，保留全部资源。

最终自动回归325通过/1默认跳过/0失败，跳过的原生NSIS进程检查另显式通过；lint、生产构建、Windows ZIP/NSIS生成和65项包内资源核对通过。最终真实EXE经正常桌面入口启动后，CDP界面检查完成两档布局、番茄奖励、主动竿键盘绿区收鱼及五新水域付费旅行/本地图像解码；清晰预览后正常保存退出。使用独立样本、断网与加速时钟，未声称第二台电脑或真实IP/VPN整链通过。

安装器 `PondClock-Setup-2.0.0-x64.exe` 已生成，但本机安装注册/快捷方式与后续流程未通过，普通入口还复现“无法关闭”提示。用户随后改要免安装ZIP，因此安装器不作为此次推荐交付；不以退出码或解压成功冒称安装成功。原版安装与存档保留。

[需求/参数/架构](v2.0.0/README.md) · [实际验收](v2.0.0/ACCEPTANCE.md) · [ZIP](v2.0.0/ZIP_CHECK.json) · [交付](v2.0.0/PORTABLE_DELIVERY.json) · [UI证据](v2.0.0/UI_CHECK.json)。实现分支 `edition/first-focus`，代码检查点 `620de14`；修改前完整封存 `874cdac`。

---
# 1.3.0 自选风格与天气

2026-10-25（Asia/Shanghai）。恢复免费简洁默认；十二地水墨改为游戏金币资源包，新增人物/鱼竿外观独立混搭；天气可选现实所在地、钓点或手动晴阴雨雪。漫游实际到达后自动跟随目的地，上方始终现实所在地。

| 交付 | 结果 |
| --- | --- |
| 推荐完整ZIP | `release/PondClock-1.3.0-x64.zip`，171221637字节（约163.3MiB） |
| ZIP SHA256 | `6c757cccc0e93d7f35205008a89d2d7f213b1146e3d19a3e8a85f23aeb0ed8bc` |
| 已解压程序 | `X:/game/PondClock-1.3.0/PondClock.exe`，76文件逐个匹配构建 |
| 正常EXE | 普通沙箱配置，440ms显示窗口；实际新天气设置/版本1.3.0可读，X退出后窗口与进程消失；独立离线档 |
| 自动与UI | 272项271通过/1安装跳过/0失败；独立生产UI10组通过，54截图、24布局、13次到达回读，全部12区两风格本地解码 |
| 旧存档 | schema1/2原件备份后迁移schema3，默认简洁；旧金币/鱼/物品/秘籍/航程保留，不免费发商品或自动扣款 |
| 安装候选 | `PondClock-Setup-1.3.0-x64.exe`，125229136字节；SHA256 `984bb07849bd648aeb9dc70b4b7b16328cdebd427788965bf88814e449a901d9`；升级/卸载仍未实测，主交付ZIP |

先退出旧版，再完整解压新版。没有人民币支付、公开上传或修改真实用户档。真实IP/VPN/天气、第二台干净电脑、长期性能/真人听感、额外DPR整轮未测；mock UI和普通最终EXE证据分开。

[实际验收](style-packs/ACCEPTANCE.md)、[本轮需求/分工](style-packs/README.md)、[开发规范](style-packs/DEVELOPMENT_STANDARD.md)、[ASAR50文件](RELEASE_CHECK.json)、[ZIP76文件](ZIP_1.3.0_CHECK.json)、[普通EXE](NATIVE_1.3.0_CHECK.json)、[生产UI](STYLE_PACKS_1.3.0_UI_CHECK.json)。以下为历史版本。

---

# 1.2.0 水墨垂钓版

2026-10-25（Asia/Shanghai）。已完成本地实现、审查、打包与普通EXE离线启动核验，主交付完整免安装ZIP；未公开上传。完整[验收说明](inkwash/roles/acceptance/2026-10-25-production.md)、[汇总JSON](ITERATION_1.2.0_CHECK.json)。

| 交付 | 结果 |
| --- | --- |
| 推荐ZIP | `release/PondClock-1.2.0-x64.zip`，171205233字节（约163.3MiB），可发送整个ZIP |
| ZIP SHA256 | `865a7026d4006988ebe4bcc1afc6d48957a56cbb4c4583e0441477fa20f8c111` |
| 已解压程序 | `X:/game/PondClock-1.2.0/PondClock.exe`，76文件含使用说明；完整解压后运行，不依赖Node/pnpm/WebView2 |
| 普通EXE | 正常沙箱配置，无禁沙箱/调试参数，426ms到WINDOW_READY，实际显示水墨窗口与1.2.0设置，X退出后测试进程消失；独立离线profile，未动原存档 |
| 功能 | 12景水墨/晴雨渔翁/雨雪接触、双轨天气/全区查看、50鱼、对白/鱼讯声、拾物/修表/秘籍、schema2安全迁移 |
| 自动与UI | 234项233pass/1安装skip/0fail；lint及两种构建通过；生产UI10组、12区查看补验8组、DPR1/2各2组通过，模拟服务与普通EXE证据分开 |
| 安装候选 | `release/PondClock-Setup-1.2.0-x64.exe`，125216336字节；SHA256 `881d92ba8956fc21d1a02c6154eaa8dbb4754366cd74e11a70c7ab00a56e51fe`。旧版升级/重装/卸载仍待真实验收，不建议用候选替代已核对ZIP |

先退出正在运行的旧版，再解压/打开新版。默认存档仍在 `%APPDATA%/PondClock/saves`；schema1原件先备份再迁移，不清空旧鱼、图鉴、金币和航程。

本轮定位/天气均采用受控fixture验收；真实IP/天气、第二台干净电脑、人工听感和长期性能没有冒称已测。两类天气只在联网时请求服务，断网时明确显示缓存/离线模拟。

[ZIP核对](ZIP_1.2.0_CHECK.json)、[包内46文件](RELEASE_1.2.0_CHECK.json)、[普通EXE](NATIVE_1.2.0_CHECK.json)、[生产UI](ITERATION_1.2.0_UI_CHECK.json)、[素材/内置imagegen提示词](inkwash/roles/rendering/README.md)、[环境](ENVIRONMENT_1.2.0_CHECK.json)。此前版本与失败记录保留在以下历史部分。

---

# 1.1.1 定位与天气修复

2026-10-21，Asia/Shanghai。主交付完整免安装ZIP，保留无边框挂件与原存档目录；退出旧程序再完整解压新版。新增备用定位、独立代理连接、天气重试/错误说明和可复制脱敏诊断。

| 项目 | 结果 |
| --- | --- |
| 完整ZIP | `release/PondClock-1.1.1-x64.zip`，162364901字节 |
| ZIP SHA-256 | `4589a77994cb6c511ef9533c82c490b6c7a77bc77cc1cfb7ae2dadd817eb1533` |
| 已解压入口 | `X:/game/PondClock-1.1.1/PondClock.exe`，76文件，使用说明齐全 |
| 完整性 | 22个运行时/前端文件逐字节匹配；ZIP中EXE、ASAR、使用说明与构建一致 |
| 普通EXE | 最终解压版经普通Windows入口启动，无禁沙箱/调试参数；独立离线profile，492ms到WINDOW_READY，实际设置显示1.1.1及独立IP/天气状态，退出按钮后窗口和主进程消失、位置落盘 |
| 自动检查 | 160项中159通过、1项原生安装器默认skip；lint、Web/desktop构建通过 |
| UI诊断 | 14组通过：原挂件完整回归，以及主定位403备用成功、同坐标天气恢复、双定位失败缓存与独立天气。显式no-sandbox、独立档与mock网络，非生产普通EXE联网验收 |
| 真实网络 | 经用户限定授权，IPWhois约1045ms成功且省区/坐标有效；返回坐标天气约1363ms成功。另行Electron诊断，不保存IP或位置，非朋友机器或实际VPN实测 |
| 安装候选 | `PondClock-Setup-1.1.1-x64.exe`，116623693字节，SHA `b640d4f68cf3ba405176d60c75086a1ba48a55e16cca3486078a25965241744a`；旧版升级/重装/卸载仍待验收，主交付ZIP |

打包先在受管shell遇到makensis无法启动，随后对既有win-unpacked目录从获批shell编译成功，无重装/无全局系统修改。frozen install的供应链元数据/attestation受DNS限制已中止，未修改锁文件或依赖版本；不能声称本轮该命令完整通过。普通EXE首次受管启动未显示，随后批准普通入口成功，两种方法不混淆。

详情：[修复及朋友复验](NETWORK_FIX.md)、[真实网络](NETWORK_1.1.1_CHECK.json)、[UI诊断](NETWORK_UI_CHECK.json)、[普通EXE](NATIVE_1.1.1_CHECK.json)、[ZIP](ZIP_1.1.1_CHECK.json)、[发行资源](RELEASE_1.1.1_CHECK.json)。没有公开上传或改写玩家存档。

---

# 1.1.0 无边框桌面挂件（历史）

2026-10-21，Asia/Shanghai。当前主交付为完整免安装ZIP：透明无边框、可拖动、置顶与两档大小，单独记住位置；换网络/VPN后自动重新检测IP。先退出旧版，再打开新版，默认进度目录保持一致。

| 项目 | 结果 |
| --- | --- |
| 完整 ZIP | `release/PondClock-1.1.0-x64.zip`，162363254字节 |
| ZIP SHA-256 | `e9c67195e69a0a91782ebeedbb0796ac278aef49fa5ef51f4a6fe847a39ba86e` |
| 已解压入口 | `X:/game/PondClock-1.1.0/PondClock.exe`，76个文件，含“使用说明.txt” |
| 完整性 | 20运行时/前端文件逐字节匹配；ZIP的EXE/ASAR与构建哈希相同；图标/使用说明一致 |
| 普通 Windows 启动 | 最终真正EXE由Windows入口运行，不带禁沙箱或调试参数，独立离线档；已观察透明挂件、时钟/鱼讯，Alt+F4后窗口消失、位置落盘 |
| 自动检查 | 116通过、1项native安装器默认skip；lint、frozen install、Web/desktop build通过 |
| 界面功能诊断 | 11组通过；严格客户端420×350/640×490，五面板、置顶、最小化、位置/资产重启、退出，以及mockIP网络/前台/定时更新 |
| 诊断边界 | 上一行用显式全局禁沙箱的开发Electron，不能把它冒充全部生产路径已测；实际VPN及原生鼠标拖动仍待人工实测 |
| 安装候选 | `release/PondClock-Setup-1.1.0-x64.exe`，116619387字节，SHA `23bb04e1475fabae7e96d4130348c573214298bf1257764d0a11c9eccd508c0b`；旧迁移/重装/卸载仍未通过，推荐ZIP |

IP新响应只累计解锁现实水域，不改变家乡/金币/当前游戏位置。切回挂件、恢复联网与2分钟可见轮询会触发fresh请求；自动30秒/手动2秒节流，普通错误退避，429遵守服务端等待时间。没有新增第三方定位服务或真实IP测试。

详见 [挂件验收](WIDGET_ACCEPTANCE.md)、[界面诊断](WIDGET_CHECK.json)、[普通EXE启动](NATIVE_WIDGET_CHECK.json)、[资源核验](RELEASE_CHECK.json)。原用户存档未被测试改写，旧版本产物与哈希保留；未上传公开托管。

---

# 1.0.1 Windows 修复候选包（历史）

2026-10-21，Asia/Shanghai。针对用户报告的“无法关闭 PondClock”和“不能写入卸载程序”修复安装进程检测、写锁提示和窗口退出行为，并提供完整免安装 ZIP。**代码和发行资源已核验；整包安装、升级、卸载、普通 Windows 正常启动仍未通过验收，不能标记稳定正式版。**

| 项目 | 当前结果 |
| --- | --- |
| 安装包 | `release/PondClock-Setup-1.0.1-x64.exe`，116611789 字节 |
| 安装包 SHA-256 | `b4598f611f2e1fcf897e2e3d3a306fc4b40ac2ebd8f504e3cdb06f48248d8859` |
| 完整 ZIP | `release/PondClock-1.0.1-x64.zip`，162354431 字节 |
| ZIP SHA-256 | `5bc8469ad48d7bca04cc967dda20336f505818699c7e3bbad1ed12bdfc4097cb` |
| 资源核验 | 19 个运行时文件/最终前端资源逐字节匹配，额外图标一致；中文空格路径完整解压 75 文件，EXE/ASAR 与构建结果 hash 相同 |
| 自动检查 | 89 项通过、1 项原生安装器检查默认跳过；原生专项显式执行另行通过；lint、Web/desktop build、frozen-lockfile install 均退出 0 |
| 真正 EXE 启动 | 正常沙箱、独立 profile、断网的最终候选尝试失败，`Process failed to launch!`，0 个产品界面通过项；报告已保存 |
| 整包安装 | 通过 Shell 启动的测试遇到 Windows 文件安全提示，已停止该测试会话；不算安装、重装或卸载通过 |
| 用户数据 | 未删除或重写用户存档；只有用户批准的测试副本曾增加沙箱 RX 访问，仍不能启动，测试副本已删除；系统和原程序目录权限未改 |

用户先关闭旧安装/卸载窗口，旧版游戏通过“文件→退出水塘时钟”退出，再从安装目录之外运行新版。若仍有占用，重启后再试，不要点击“忽略”跳过文件错误。安装完成后搜索“水塘时钟”；完整 ZIP 必须全部解压，再打开里面的 `PondClock.exe`。

详见 [修复说明](INSTALLER_FIX.md)、[真实验收门禁](REPAIR_ACCEPTANCE.md)、[构建核对](RELEASE_CHECK.json)、[ZIP 核对](ZIP_CHECK.json)。原 1.0.0 产物保留原哈希，作为后续升级输入；未上传公开托管。

---

# 1.0.0 历史测试安装包

2026-10-20，Asia/Shanghai。功能实现与安装包已经生成；下列环境限制尚未关闭，因此本包作为首版实机测试包交付，不标为跨电脑完整验收通过。

| 项目 | 结果 |
| --- | --- |
| 文件 | `release/PondClock-Setup-1.0.0-x64.exe` |
| 大小 | 116619415字节，约111.2MiB |
| SHA-256 | `994ea8f1aeb1854acca9c913f8e1f6fe763e449667d6624f23f1329c4036ea77` |
| 签名 | 未签名；应用图标与产品元数据已写入 |
| 内容核验 | 18个运行时文件/最终Web bundle逐字节匹配，额外图标一致 |
| 自动检查 | 78/78通过；JS/JSX/CJS lint通过；Web和desktop构建通过；frozen-lockfile安装通过 |
| Electron功能诊断 | 10组通过；实际收竿售鱼、UI购票自动抵达、重开恢复、IP免费解锁及导入同步、过期鱼¥1、主题截图 |
| NSIS安装 | 隔离目录实际安装退出0，主程序/卸载器存在 |
| 安装资源启动 | 实际安装app.asar由同版开发Electron加载，隔离存档/阻断外网/禁沙箱诊断通过 |
| 天气网络 | Open-Meteo真实HTTPS成功 |
| IP网络 | 用户明确授权该服务后检测，ipapi本测试主机HTTP403，降级可用；不存完整IP |
| 卸载 | 普通静默流程在宿主等待，直接目录模式退出0但主程序未删，不算通过；测试目录已手动清理 |
| 仍未验证 | 普通Windows正式EXE沙箱启动、真实休眠/系统重启、升级、第二台无Node电脑。生产仍sandbox:true |

用户变更已落地：每次启动联网按IP地区永久免费解锁，接受VPN；现实所在地免费进入；游戏内航线仍按起终点购票；离线存档、七天保鲜、地区行情、1–3分钟旅行均已实现。

这不是公开托管发布，未向外部上传文件。分享完整安装EXE即可，不单独发送win-unpacked中的程序。使用前应阅读 [README](../README.md) 和 [详细验收](ACCEPTANCE.md)。

