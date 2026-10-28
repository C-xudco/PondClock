# 调试、验收与常见改动位置

先读根README的版本/安装限制和 [架构](ARCHITECTURE.md)。使用Node24、pnpm11与锁文件；`pnpm install --frozen-lockfile`，然后`pnpm run dev`（浏览器）或`pnpm run build:desktop`、`pnpm run desktop`（桌面）。不要为启动测试关闭安全隔离。

| 现象 | 先看哪里 | 怎样确认 |
| --- | --- | --- |
| 背景两侧透明、点击漂移、脚被裁 | Pond、sceneViewport/useSceneViewport、index.css | 测420×350/640×490，统一画布矩阵横纵相等；换画风/低岸不重载也更新 |
| 人物丑或手/鱼线断开 | ClassicFisherman/Fisherman、classicScene/scene、defaultCharacter、appearanceVisuals | 区分默认minimal和付费whitecape，检查晴雨雪、人物/竿独立槽位 |
| 爆率/品质/售价值不对 | lootConfig、balance、loot、market、editionGameplay | 分清鱼讯成功、鱼/物品抽取、鱼种、品质四层；按固定种子重现 |
| 金币扣两次/奖励重复 | GameSession、gameState、editionGameplay、保存仓库 | 同命令ID重放、未知回执、失败落盘与超128条历史后重复购买 |
| 图鉴少鱼/不保存 | gameConfig/focusRegions、fishSources、CodexPanel、gameState、saveSchema | 鱼必须进入当前水域鱼池，id唯一；卖鱼不删图鉴 |
| 换网地区不更新 | useGeoRegion、services/environment、desktop/environment*、services/geo*相关文件 | 看实际定位提示和备用服务失败原因；只记录状态/耗时，不公开IP |
| 背景天气和顶部天气不同 | domain/weatherPresentation、useSceneWeather、useClockWeather | 可能是用户选择的现实/钓点来源不同；看来源标签，不直接改地理位置 |
| 天气请求太多/429 | weatherScheduler、weatherRefresh、regionWeatherStore | 保留2路运输、启动间隔、TTL及冷却；不要新增绕过队列fetch |
| 专注不走/突然暂停 | fishingRuntime、GameSession、lifecycle、FocusPanel | 调度缺口10s会保守暂停；会话最大信用上限在focus配置30s，休眠恢复不补计时 |
| 主动条按键无效 | ActiveFishingBar、会话计时、焦点/输入框/遮挡条件 | 仅聚焦游戏，避开IME/长按/系统组合键；不能用普通busy挡住及时收竿 |
| 安装器说无法关闭 | desktop/installer.nsh、历史installer检查脚本 | 提示可能来自复制/卸载阶段，不一定真有游戏进程；不要强杀所有同名程序 |
| 找不到/打不开应用 | 完整ZIP、使用说明、版本/架构、退出旧进程 | 完整解压到新目录，运行PondClock.exe；不要只复制EXE |

## 保存和测试隔离

正式存档为`%APPDATA%/PondClock-Focus/saves`。测试应指定独立`--user-data-dir`并使用createNewGame/validateSave生成显式样本；不要把自己的真实进度提交到仓库。旧档迁移读原PondClock目录并备份到新目录，不能在旧目录直接改JSON。

```powershell
pnpm test
pnpm run lint
pnpm run build:desktop
pnpm run package:portable
node scripts/verify-release.cjs --portable-only
```

按改动范围先跑相关测试，通过后不无理由反复扩大验证。`tests/v2-domain`覆盖核心第一版规则，session/review-transactions/desktop-storage覆盖保存失败与重试，weather/geo覆盖调度，appearance/ink/scene-viewport覆盖渲染结构与几何。默认安装器测试跳过不是安装成功；需要原生工具的脚本可能受桌面环境限制。

scripts/smoke-v2-*与check-scene-cover是不同证据：浏览器mock、真实EXE附着、原生启动都要明确标记；加速时间不能替代真实25分钟、真实旅行时长或休眠验收。Windows安全确认需要使用者手动处理，不能在脚本里绕过。

提交问题时附版本、最短复现步骤、修改的配置、窗口尺寸、预期/实际结果、脱敏错误和相关测试结果。完整公网IP、家庭坐标、用户名目录、密钥和玩家存档不要发到公开Issue。
