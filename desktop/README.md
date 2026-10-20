# Windows 桌面壳

`main.cjs` 只加载仓库 `build-desktop/index.html`，用系统标题栏实现移动、缩放和最小化。关闭按钮最小化，彻底退出用“文件 → 退出水塘时钟”。“窗口 → 总在最前”是当前窗口的临时控制；启动时会恢复存档的 `settings.alwaysOnTop`。

## 文件职责

| 文件 | 职责 |
| --- | --- |
| `main.cjs` | 单实例锁、窗口生命周期、受信主页面 IPC、文件对话框、固定存档目录 |
| `preload.cjs` | 向沙箱渲染进程暴露最小 `window.pondDesktop` API |
| `saveRepository.cjs` | 校验、修订冲突检测、串行写入、SHA-256、双槽与损坏恢复 |
| `environment.cjs` | 固定 IP/天气端点、参数白名单、超时与响应大小上限 |

生产存档位于 `%APPDATA%/PondClock/saves`，不会随安装目录或版本改变。开发态标准 `--user-data-dir=<绝对路径>` 可使用隔离目录；打包应用不接受该覆盖。Web 开发服务器只允许未打包时通过 `POND_DEV_SERVER_URL` 指定本机回环地址。

## 桥接契约

| 调用 | 成功返回 |
| --- | --- |
| `loadSave()` | `{ snapshot: null 或完整存档, recovery: { recovered, invalidSlots, backupAvailable } }` |
| `saveGame(snapshot)` | `{ status: 'committed' 或 'already-committed', snapshot, recovery }` |
| `exportSave(snapshot)` | 原生保存对话框；`{ canceled }`；不改变本地存档 |
| `importSave()` | 原生打开及替换确认对话框；`{ canceled: true }` 或 `{ canceled: false, status, snapshot, recovery }` |
| `getAppInfo()` | 应用名称、版本、平台、打包状态、当前置顶状态 |
| `windowAction(action)` | 仅 `minimize`、`close`、`alwaysOnTop:on`、`alwaysOnTop:off`、`toggleAlwaysOnTop`、`quit`；返回 `{ alwaysOnTop }` |
| `requestEnvironment(url)` | 校验后的固定端点 JSON；不接受任意 URL/文件路径 |

失败抛出带 `code` 的 Error。写入初始修订允许 0 或 1；已有存档仅允许最新修订 + 1。相同修订且完整规范存档相同的重试不会再次提交。若调用超时、进程中断或收到 `SAVE_WRITE_FAILED`/`SAVE_COMMIT_UNKNOWN`，调用方必须先 `loadSave()` 检查实际提交状态，不能继续按猜测的资产状态提交下一笔。

`save-a.json` 与 `save-b.json` 交替保存完整快照。每次写入唯一临时文件、同步文件、关闭、同目录 rename，再读取校验。上一有效槽保留。SHA-256 检测文件损坏，不提供防作弊或加密。不能将文件同步视为所有硬件断电情形的绝对保证。

有效备用槽可恢复最新坏槽；两个槽都坏则停止自动写入。显式导入先保存损坏原件 `.recovery-*.bak`，再提交新档。未来 schema/封装版本会阻止旧应用读取或覆盖。v1 没有历史正式版本迁移；后续发布必须同时扩展共享迁移与测试。

安全边界为 `sandbox: true`、`contextIsolation: true`、`nodeIntegration: false`，仅受信任主页面可调用 IPC；拒绝子窗口、外部导航、webview 与设备权限。生产 CSP 禁止远程脚本和渲染进程外网请求。联网增强走主进程固定服务桥；IP/天气失败不影响离线规则和存档。

## 验证

```powershell
node --test tests/desktop-storage.test.js
pnpm run build:desktop
pnpm run smoke:desktop
pnpm run package:win
```

存储测试使用 `tests/.tmp` 的隔离目录，验证重启、修订冲突、回执未知、写盘失败、损坏恢复及未来版本保护。烟测使用 Electron 自带 Chromium，不额外下载浏览器；在 `test-results/electron-cold-*` 和 `electron-smoke-*` 创建独立存档，先阻断全部 HTTP/WS，再检查新档初始化、实际 UI 收竿与售鱼、存档往返、原生文件对话框、重复重试与进程重启旅行保留。公开浏览器时钟推进生产计时器，验证实际 UI 购票及自动抵达；测试内替换主进程 `net.fetch` 返回广东 IP，验证重新识别免费解锁及导入旧档后重新应用本次 IP。测试替换不进入产品源代码或构建产物。

`test-results/electron-smoke.json` 记录检查结果和宿主沙箱状态；`electron-main.png`、`electron-travel.png`、`electron-bucket.png`、`electron-caught.png` 分别展示主界面、航线、过期及异地行情、真实收竿鱼获。深色主题也有生产样式断言，避免构建裁掉根节点主题类。测试通过 DevTools/Playwright 操作正常公开桥，产品 UI 没有调试后门。

`electron-builder.yml` 输出 `release/PondClock-Setup-版本-x64.exe`，采用 NSIS 安装包。没有代码签名证书，产物不承诺已签名；Windows 签名信誉属于后续发布工作。

部分受管运行环境无法创建 Chromium 沙箱，连 `electron --version` 都可能以 `0x80000003` 退出。仅在这种测试宿主中，可设置 `POND_SMOKE_NO_SANDBOX=1` 运行烟测；报告明确记录 `hostSandboxEnabled: false`。这不会修改产品配置，也不能作为真实 Windows 机器上进程沙箱已验证的证据。正常烟测默认启用 Chromium 沙箱。
