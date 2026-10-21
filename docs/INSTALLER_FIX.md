# 1.0.1 安装检查修复记录

日期：2026-10-21。负责人：安装器 agent；leader 负责最终打包、应用启动和真实安装升级验收。

## 用户现象与证据范围

用户提供的两张截图分别显示“PondClock 无法关闭”及无法写入 `X:\test\PondClock\Uninstall PondClock.exe`。这说明旧安装流程被进程判断或文件占用挡住，不能单凭截图断言是某个特定进程持有文件。程序窗口无法显示是另外一个需要 leader 独立验证的问题。

本地固定版本 `electron-builder 26.15.3` 的 `templates/nsis/include/allowOnlyOneInstallerInstance.nsh` 已核对：默认 PowerShell 分支通过 `Path.StartsWith(INSTDIR)` 匹配所有进程，没有检查 `PondClock.exe` 文件名，也没有目录边界。这会把目标目录中的安装器、卸载器，以及同前缀目录下的程序计入“应用正在运行”。CIM 查询失败与降级到按文件名检测也无法保证准确识别目标目录。本次修复不改动 `node_modules`。

## 改动及边界

- `electron-builder.yml` 通过受支持的 `nsis.include` 引入 `desktop/installer.nsh`。使用 `customHeader` 与 `customCheckAppRunning` 扩展点，让新安装器和新卸载器共用精确检查。
- 直接调用 Windows `CreateToolhelp32Snapshot`、`Process32FirstW/NextW`、`OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION)` 和 `QueryFullProcessImageNameW`。先按程序文件名筛选，再比较完整目标路径，区分相邻目录和其他位置的同名程序；不依赖网络、PowerShell 或 CIM。
- 发现目标游戏正在运行时，请用户正常关闭后重试；静默模式以退出码 `2` 取消。安装器不终止进程，避免强制结束游戏影响保存，也不会结束其他目录里的程序。
- 无法枚举进程、检查同名进程或比较路径时，按“无法安全检查”阻止继续，而非假定应用已关闭。若其他目录同名进程拒绝路径查询，也可能需要先正常关闭它后重试；不会据此强行结束进程。
- 仅在安装阶段，若旧卸载器存在，使用 `CreateFileW(GENERIC_WRITE, OPEN_EXISTING)` 试开并立即关闭。这个探测不写文件；如果卸载器正在运行、被占用或缺写权限，提前给出关闭旧安装/卸载窗口、检查目录写权限、必要时重启的具体提示。卸载阶段不进行这个探测，以免检查自身。
- 桌面快捷方式配置为 `always`，修复升级或安装中断后没有桌面入口的情况；仍保留开始菜单入口。
- 增加 Windows x64 ZIP 目标，安装器与 ZIP 分别命名 `PondClock-Setup-${version}-${arch}.exe`、`PondClock-${version}-${arch}.zip`。ZIP 必须完整解压后运行其中的 `PondClock.exe`，不能只取单独一个 EXE。

上述路径比较针对 Windows 正常返回的完整 DOS 路径；通过目录符号链接或短文件名别名安装不在本次已验证范围内。文件写锁探测与真正提取之间仍存在系统级时间差；防病毒程序稍后重新占用文件时，NSIS 仍可能报告文件不能写入。

## 旧版升级与卸载器占用

继续沿用相同 `appId`、注册表安装记录和标准升级流程，保留用户存档。模板的 `uninstallOldVersion` 先把旧卸载器复制到 `$PLUGINSDIR\old-uninstaller.exe`，再通过 `ExecWait /S /KEEP_APP_DATA --updated _?=旧目录` 等待完成，随后才写新程序。复制后从临时目录运行，正常情况下可以释放旧安装目录；执行受策略限制时，上游模板可能改为从原位置运行旧卸载器。

新 include 无法倒改已经写进 1.0.0 卸载器的旧判断逻辑。标准模板没有在运行旧卸载器前安全跳过它的独立扩展点；`customUnInstallCheck` 在运行之后才检查返回值。吞掉旧卸载失败再覆盖会留下文件锁和半升级风险，因此没有采用。复制整套安装模板也会引入不必要的维护负担。

请从下载目录运行新安装器，关闭旧的安装与卸载窗口，并正常退出游戏。若旧窗口已经卡住，可以重启电脑后再运行新包。不要在旧报错中选择“忽略”继续半安装，也不要手动删除存档目录。本次补丁不会清理用户的旧安装目录。

## 已执行的原生回归

测试文件：`tests/installer.test.js`。通用测试默认跳过本项，避免没有 NSIS 编译器的 CI 或无法启动 32 位工具的受限环境失败；通过环境变量显式运行：

```powershell
$env:PONDCLOCK_NATIVE_INSTALLER_TEST = '1'
node --test tests/installer.test.js
```

本次机器的普通沙箱无法启动 32 位 `makensis.exe`，报告“无效的系统 DLL 重定位” / `spawn UNKNOWN`；在获准的沙箱外执行后通过。所有文件均在唯一的 `tests/.tmp/pondclock-installer-*` 工作区目录生成并清理。测试不读用户存档，不修改注册表，不执行真实安装或卸载，只运行自行编译的临时进程；结束时只终止本测试创建的 PID。

最终命令实际通过，约 3 秒；NSIS 用 `/WX` 将编译警告当作错误。

| 检查 | 结果 |
| --- | --- |
| 普通安装器 helper 与 `BUILD_UNINSTALLER` 分支编译 | 通过；后者只编译，不运行卸载器 |
| 目标路径包含中文、空格、英文单引号 | 通过 |
| 无目标游戏运行 | 放行 |
| 同前缀兄弟目录或其他目录中的 `PondClock.exe` | 放行，不终止进程 |
| 目标目录中运行 Setup 文件 | 不误认为游戏 |
| 目标目录中运行 `Uninstall PondClock.exe` | 不误认为游戏；写锁探测阻止覆盖 |
| 精确目标路径的 `PondClock.exe` 正在运行 | 检测到；真实静默 hook 退出码为 `2` |
| 进程枚举调用失败（测试中注入） | 返回不能安全检查，非“未运行” |
| 检查前后测试进程存活 | 通过，安装检查没有结束任何进程 |
| 正常结束临时游戏和旧卸载器后 | 完整 hook 再次放行 |

## 最终交付仍需的验收

这些原生 helper 证据不能代替完整安装验收。leader 应记录正式 1.0.1 包编译、全新隔离安装、同目录修复安装、1.0.0 → 1.0.1 升级、快捷方式启动、普通权限与保留存档卸载的真实结果，并明确应用窗口启动限制。用户原目录和存档未经读取或修改；旧 1.0.0 产物保留作回归对照。
