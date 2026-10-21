# 开发留痕

下表为2026-10-20首轮记录，Asia/Shanghai。主agent负责统筹/会话/界面；规则agent负责航线市场、随后环境服务；桌面agent负责壳/文件存档/打包；监督agent独立写测试和审查。2026-10-21修复记录见文末。

| 阶段 | 动作与证据 | 状态 |
| --- | --- | --- |
| G0 | 完整审阅原README与源码，工具检查；旧Web构建成功，旧lint缺配置失败；输出独立审查包与图 | 完成 |
| 需求修订 | 用户明确现实IP每次登录免费解锁并接受VPN，交付安装EXE，当地天气简单显示；采用最新口径 | 已接纳 |
| G1 | 90个原始文件复制至 `X:/game/pondclock-baseline-20261020`；建立本地Git | 完成。首个Git提交与agent并行开始时包含一个早期desktop文件，纯原始基线以90文件快照为准 |
| 工具链 | pnpm导入旧锁，再固定Electron44.9.1/builder26.15.3/playwright-core1.64.1；迁至HTTPS与单pnpm锁；frozen install exit0 | 完成，范围内依赖按已有版本约束解析，React仍18、Vite仍5.4.11 |
| G2 | 12地区/42鱼；GeoNames城市坐标；132有向航段、504市场格、七天最高优先规则 | 自动规则测试通过 |
| G3 | gameState/saveSchema/GameSession；所有资产命令串行提交；文件双槽/fsync/校验/去重/恢复；导入纳入队列 | domain28+session15+storage12通过；含真实文件仓库完整链路 |
| G4 | 每次IP新增解锁、免费现实水域入口；当地天气/缓存/模拟；航线图、鱼龄、倒计时、设置及导入导出UI | 环境16项通过；合计71项自动检查通过 |
| 构建与静态检查 | 桌面Vite构建通过，原Web构建另做回归；ESLint配置补齐覆盖JS/JSX/CJS（通用原UI库保持不改） | 桌面构建、lint已通过；最终结果见ACCEPTANCE |
| G5 | NSIS完整安装包、默认保留Chromium沙箱；本地资源与固定存档目录 | 构建/桌面实测进行中，最终证据见ACCEPTANCE |
| 最终回归 | 78项自动检查、10组真实Electron诊断；实际UI购票自动抵达、导入旧档后重施当前广东IP、主题截图均通过 | 诊断明确禁沙箱；生产默认设置保留 |
| 联网检测 | 首次真实ipapi请求被自动审批要求具体目的地授权；用户回复允许后执行 | Open-Meteo成功；ipapi本机HTTP403，未记录完整IP；不能据此声称真实定位成功 |
| 打包修复 | 首轮与主题更新碰撞读旧bundle失败；后续NSIS临时目录不可写，改project .cache后生成安装器；静态校验脚本的Windows路径处理曾误报嵌套文件缺失 | 已修path.normalize；图标改显式extraResources，保留资源编辑、无签名；不交付失败中间件 |
| 最终安装包 | NSIS exit0，116619415字节；18个运行时文件与源码/最终bundle逐字节匹配；SHA-256见RELEASE_CHECK.json和release/SHA256SUMS.txt | 完成，未上传外部 |
| 隔离安装 | `/S /currentuser /D=项目test-results隔离目录` exit0；实际安装的asar在隔离profile+阻断外网+禁沙箱诊断下成功读档与建档 | 安装/打包资源链路通过，不是普通安装EXE沙箱运行通过 |
| 隔离卸载 | 普通静默卸载在宿主等待；标准直接目录模式退出0但未删EXE | 未通过完整清理；验证是本次安装资源后手动清理隔离目录，未删用户档案 |
| 宿主限制 | 受管宿主Electron默认沙箱启动0x80000003；显式诊断无沙箱可启动，生产设置仍sandbox:true | 不把诊断测试当普通电脑沙箱通过，不降低产品设置 |

独立监督发现并已修复：提交回执未知不能直接当回滚、UI订阅异常不能破坏提交结论、导入与普通命令需共用队列、IP缓存不能冒充新定位、禁网设置须在读档前避免请求。

后续每次修改仍先检查实际差异、跑受影响检查，再记录通过/失败/未测。当前无远程发布或上传。

## 2026-10-21 用户安装失败修复

Leader统筹并核对最终产物；installer_fix独占NSIS检查和配置；startup_audit先只读审查、后独占退出/启动保护；repair_supervisor独立制定真实验收门禁、审查实现并维护真正EXE测试器。各agent没有并发安装或全局结束进程。

- 用户截图提供“不能写Uninstall PondClock.exe”和“无法关闭PondClock”事实；当前原截图目录不存在、桌面无该错误窗口，因此没有声称现场复现锁持有者。
- 源码证据：1.0.0关闭仅最小化；builder26.15.3按安装目录StartsWith搜索/终止进程，会包含卸载器及同前缀兄弟目录。已替换为Win32精确目标EXE检查，不强杀，增加旧卸载器写锁预检；保留标准临时卸载升级，不复制整套模板。
- 关闭/Alt+F4/菜单退出真正结束，等待main已接受的存档/导入/导出写入；主窗口显示超时、加载失败、renderer退出会写脱敏日志并提示退出。生产保持sandbox/contextIsolation，不加禁沙箱参数。
- 最终全套90项：89通过，1项native默认skip；native专项实际执行1/1通过，覆盖中文空格单引号、兄弟目录、别目录同名、卸载器、真实目标进程及写锁。lint、两种前端构建、frozen install通过。pnpm明确拒绝不使用的electron-winstaller构建脚本，避免未决placeholder配置。
- 1.0.1安装包/ZIP最终构建并核对19运行时文件；ZIP解压75文件，EXE和ASAR hash一致。1.0.0安装器原哈希保留。
- 最终真正PondClock.exe正常沙箱启动仍失败，工具记录passed:false/0 checks（docs/PACKAGED_REPAIR_CHECK.json）。独立的--version检测也退出0x80000003。工具shell可观察为Low IL与Job内，但没有堆栈证明根因，不能把受限宿主推测当作用户机器诊断。
- 只读参考Electron原生初始化源码：沙箱先于JS、Windows常规日志及应用Crashpad，故JS前失败无法由新startup.log兜底；该限制已披露。未关闭系统防护或产品沙箱。
- ACL测试先被自动审批拒绝；采用不改权限的副本仍失败。随后用户明确只批准runtime-copy-probe增加沙箱RX，该测试仍失败；仅此副本被修改，之后核验绝对路径并删除。没有修改系统/原程序目录权限。
- 整包安装脚本先拒绝已有注册/快捷方式，使用独占目录；Shell启动停在文件安全提示（工具进程窗口标题可见），已中止本轮会话，无安装通过证据。普通桌面软件安装需用户确认，不能代点绕过安全提示；后续依赖用户回复。

实际通过与未通过以REPAIR_ACCEPTANCE.md为准。没有把编译、辅助测试、文件hash、禁沙箱诊断或手动清理当作普通Windows安装运行成功。
