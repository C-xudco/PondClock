# V2.0.0 专注版发行验收

2026-10-28。本角色只准备隔离安装验收工具和说明；实际打包、原生UI、执行结果由Leader整合记录。这里没有将“已有安装器”或“脚本语法通过”写成安装通过。

## 专注版身份

| 项目 | 当前构建值 |
| --- | --- |
| appId | `cn.pondclock.focus` |
| 安装显示名称 | `PondClock Focus` |
| 主程序 | `PondClock.exe` |
| 桌面/开始菜单快捷方式 | `水塘时钟·专注版.lnk` |
| NSIS身份GUID | `2f2611ae-3f88-5de7-b8bc-6f8556d12449` |
| 卸载程序实际名称 | `Uninstall PondClock.exe` |
| 默认玩家档案 | `%APPDATA%\PondClock-Focus`；安装验收不启动它 |

卸载文件名与安装显示名称不同是当前electron-builder规则：`out/appInfo.js`把 `executableName: PondClock` 用作 `productFilename`，NSIS `templates/nsis/common.nsh`又按 `Uninstall ${PRODUCT_FILENAME}.exe`命名。已与Leader确认按真实名称检查，不改产品配置，不能写成不存在的 `Uninstall PondClock Focus.exe`。GUID按本地electron-builder对appId及其固定命名空间的UUIDv5生成规则核对；它与旧版身份分开。

## 工具及执行范围

工具：`scripts/check-focus-installer.ps1`。默认只做只读预检并输出JSON；只有显式指定 `-Execute` 才执行新安装、同版重装、普通卸载三步。当前仅接受版本2.0.0，不做旧版升级，不调用旧安装器，不处理第二版，也不做真实玩家数据迁移。

预检使用方式：`powershell -NoProfile -File scripts/check-focus-installer.ps1`。执行方式由Leader在最后一次打包完成后使用：`powershell -NoProfile -File scripts/check-focus-installer.ps1 -Execute`。本角色没有执行任何安装或卸载。

每次创建新的 `test-results/focus-installer-<GUID>`，安装叶目录固定为其中的 `安装 PondClock Focus`。JSON为该目录下 `installer-check.json`。报告、文件清单和失败现场全部保留，脚本没有手工删除注册表、快捷方式或递归删除测试目录来掩盖卸载失败。

预检只检查Focus显示名称、Focus精确GUID注册和专注版快捷方式；旧PondClock的注册或运行不阻塞隔离测试。若已有Focus注册、身份键或快捷方式，立刻拒绝，避免覆盖已安装的专注版。用户自己保留的同名快捷方式也不会被脚本移走。自定义安装身份/NSIS脚本或未经审查的自动运行钩子同样拒绝执行。

## 静默安装不会启动默认玩家档

已经读取当前本地electron-builder的 `installSection.nsh`、`assistedInstaller.nsh`、`include/installUtil.nsh` 与 `uninstaller.nsh`。当前 `oneClick:false` 的辅助式安装器，静默安装后启动应用的分支必须同时具有 `${isForceRun}` 和 `${Silent}`。脚本只传 `/S /currentuser /D=<本次目录>`，不传 `--force-run`；`/D=`在最后，保留路径空格。交互式完成页的运行勾选不影响这个静默流程。

脚本每次还会检查上述静默分支、辅助式模式、appId、产品名、快捷方式名以及 `deleteAppDataOnUninstall:false`，并保存模板和自定义include的SHA256。若不能确认安全不启动，预检失败，不执行安装器。卸载只传 `/S /currentuser`，没有删除玩家数据的参数。所有 `Start-Process` 都带 `-WindowStyle Hidden`，不启动 `PondClock.exe`。

因此本轮安装脚本不打开、导入、导出或扫描任何真实存档；它不能证明系统中其他应用没有同时改变玩家档案。实际窗口试玩须另用专用 `--user-data-dir`，由Leader的UI脚本验收，不通过普通桌面快捷方式启动默认档。

## 必须通过的检查

1. 安装前不存在Focus身份和专注版快捷方式，目标必须是本次新建证据目录下的固定叶目录；目录和子树有重解析点时拒绝。
2. 安装器与 `release/win-unpacked`存在，主程序产品名/版本正确，保存安装器SHA256和全部未安装文件清单哈希。
3. 新安装完成后，主程序和真实卸载程序存在，Focus安装位置、卸载注册和版本精确指向本次目录；桌面与开始菜单快捷方式必须存在，并通过Windows快捷方式对象读取其真实TargetPath，精确等于本次 `PondClock.exe`且无额外启动参数。
4. 安装后的每一个发行文件SHA256须与本次 `win-unpacked`清单匹配；同版重装后重复整套检查。报告区分这两阶段。
5. 卸载前再次验证本次路径、子树、注册和快捷方式所有权，才调用本次目录的卸载程序。等待后要求所有本次安装文件、Focus注册/安装键和专注版快捷方式消失；空安装目录可残留，报告保留。

脚本不以“退出码0”代替卸载结果。若超时，记录本次启动PID，保留现场，不强制结束不相关进程；若发现本次安装的主程序意外运行，停止后续自动操作并记录，不强行关闭它。失败后的注册表或文件不会被手工清理后再标成功。

## 当前验证状态

`System.Management.Automation.Language.Parser.ParseFile`语法检查通过。产品源、构建配置和真实存档均未由本角色修改。后续应引用实际 `focus-installer-*/installer-check.json`，只有其 `executionRequested:true`、`passed:true`且三个阶段证据齐全，才可写“安装链通过”。默认预检报告即使 `preflightPassed:true`，`passed`仍为false，明确不冒充已安装验收。

## 首次实际执行失败调查与安全续验

Leader实际执行产生 `test-results/focus-installer-21758a6ae7ae4feeab40cc4ae77bff2a/installer-check.json`：安装器返回0、发行文件及卸载程序已写入，但Focus注册和快捷方式检查失败，不能计为安装成功。本角色仅做只读调查，没有再次启动安装器/卸载器，也没有手工写入或删除注册和快捷方式。

调查区分了两个事实：受限检查进程读取部分注册表会得到“Requested registry access is not allowed”，旧检查器的 `Test-Path` 可能把不可读误作不存在；而在允许读取真实Windows注册的上下文中，HKCU/HKLM精确Focus身份和本次目录关联的卸载记录仍确实不存在，专注版快捷方式也不存在。不是等待注册刷新能解决的已验证状态。Leader已确认首次调用明确使用 `sandbox_permissions=require_escalated` 且获自动审核执行；因此不能把原因简单归为“忘记请求执行权限”。同一工具启动上下文中，Electron命令行启动曾报0x80000003，正常Explorer入口启动同一EXE成功。当前证据支持工具启动链仍可能继承进程限制的推断，但尚未证明NSIS写注册失败的精确原因；不能据此认定产品安装脚本有错误，也不应继续重复同一路径的命令行安装。正常Windows入口交互式安装若由Leader验收，须继续指定本次测试目标并单独留证。

检查器已将注册表容器的读取错误明确报为“无法证明不存在”，不再吞掉权限问题。失败现场原报告保留不改。

新增 `-ResumeReport <原installer-check.json绝对路径>`，只接受 `test-results/focus-installer-<GUID>` 中第一次原报告；输出另一个 `installer-check.resume-<GUID>.json`，不覆盖历史。续验要求原目标、appId、Focus GUID、原始启动命令、版本、安装器SHA256、完整发行清单和已安装文件SHA256全部匹配；目标/子树不能有重解析点。若有任何Focus注册或快捷方式，必须全部精确归属于本次目录，否则拒绝。没有合法原记录的目录不能通过续验指定为安装目标。

本角色已执行一次**不带 `-Execute` 的只读续验**，结果 `installer-check.resume-4e05a55dc6e948a2a8fb9bf3f2e0e917.json`：所有发行字节与原报告相同，安装器SHA256为 `30C5C83C94170A223716636BAD4FB542AEFBAC140D60BA00C56447F43077603D`；状态是“原payload完整，但没有Focus注册/快捷方式，需要重试安装”。`executionRequested:false`、`launchedProcesses:[]`、`passed:false`，没有将预检当成功。

后续由Leader在正确Windows执行上下文中决定是否为上述同一原报告加 `-Execute`：payload-only状态先通过同一个安装器恢复本次安装，再做同版重装与卸载；若原安装已完整，则先验证所有权再继续后两步。续验不新增真实玩家档案，也不允许更换为其他安装目录。实际结果必须另外留证。

## 正常Windows入口操作后的只读观察

为把正常Explorer启动与只读验证分开，工具增加 `-ObserveStage installed/reinstalled/uninstalled`。必须同时给 `-ResumeReport <原installer-check.json>`，且**禁止同时指定 `-Execute`**。观察模式不启动任何程序，不运行安装/卸载，也不清理注册、快捷方式或文件。本角色只编写并作语法检查，没有执行本次观察或安装。

Leader每一步从正常Windows入口执行后，可分别调用：

```powershell
./scripts/check-focus-installer.ps1 -ResumeReport '<原installer-check.json绝对路径>' -ObserveStage installed
./scripts/check-focus-installer.ps1 -ResumeReport '<同一原报告绝对路径>' -ObserveStage reinstalled
./scripts/check-focus-installer.ps1 -ResumeReport '<同一原报告绝对路径>' -ObserveStage uninstalled
```

前两阶段重新检查原发行SHA、原报告/目标身份、完整payload哈希、精确Focus注册/安装位置、专注版快捷方式TargetPath；卸载观察仍核对原发行SHA、原报告身份及原manifest，但**不要求已卸载的payload仍存在**，改为要求原测试目录没有任何文件、Focus注册/身份键/快捷方式全部消失。允许空目录留下，不自动清理。读取注册受限仍是明确失败，不能当“不存在”。

每次输出新的 `installer-check.observe-<阶段>-<GUID>.json`，保留首次失败报告和其他阶段报告。观察报告的 `passed:true` **仅表示该命名阶段当前状态通过**；同时固定 `executionRequested:false`、`launchedProcesses:[]`、`entireInstallChainVerified:false`、`resultScope`为单阶段观察，不能把单份报告宣传为安装全链通过。

正常Explorer链是否完成，需要Leader按实际顺序关联“安装→installed观察、同版重装→reinstalled观察、原目标卸载→uninstalled观察”的启动凭据及三份同一原报告、同一发行SHA的通过结果，另写整体验收结论。工具自身不伪造这些外部操作或阶段顺序。
