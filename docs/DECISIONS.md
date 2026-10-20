# 工程与玩法决策

2026-10-20，v1.0.0。用户最新指令优先于旧 README 与开工草案。

| 决策 | 结果与理由 |
| --- | --- |
| 地区解锁 | 每次启动联网/手动重新识别时按公网 IP 所在省级区域免费累计解锁，接受 VPN。游戏单机、无个体间交易，不加代理检测或账号 |
| 地区使用 | 有效定位更新 realRegion；不强行取消游戏航程或改 home/current。漫游面板提供“在当地垂钓·免费”，不让现实到访者再花虚拟机票。未识别地区不伪称成功 |
| 默认地区 | 新档定位成功用实际对应区，失败/首次离线回退江南；仅解锁该初始区。之后联网识别别区会累计保留，旧进度不清空 |
| 地理模型 | 12水系区域各采用固定城市，Haversine距离生成66对/132有向直达航段；坐标来源见COORDINATES.md。它是游戏距离，不是假称现实航班航路 |
| 航程与机票 | 全图统一最短60s、最长180s，线性插值；票价200–6000金币、十金币取整。普通游戏飞行每次收费，已解锁代表永久到访记录 |
| 市场 | 同一权重表派生504格供应；最高相对供应地0.8倍、无产出地2倍，连续插值。销售地区决定报价，捕获地不重置鱼龄 |
| 保鲜 | 捕获起现实168小时，到期每条1金币，优先于鱼种/品质/重量/市场倍率；不自动删除，图鉴永久保留 |
| 离线推进 | 航程和保鲜在关闭期间继续；不自动获得离线鱼获。定时器只刷新UI，资产变化经命令提交 |
| 桌面交付 | Electron + NSIS完整EXE安装包，内含Chromium/Node与本地资源；不用账号、服务器或收件者开发环境。首版有系统标题栏，非点击穿透透明挂件 |
| 数据记忆 | 固定用户目录、单实例、JSON双槽与校验、fsync/rename、修订号和命令去重，导出导入支持换机；损坏/未来schema不静默重置 |
| 天气 | 未找到适合直接读取Windows任务栏天气缓存的受支持公共API，不逆向私人缓存。提供相似的本地温度/天气外观；IP坐标优先，Open-Meteo在线模型天气、6小时缓存、明确离线状态 |
| 简洁天气 | 跟随电脑现实所在地，与游戏买票漫游独立；每15分钟刷新，429退避。关闭联网增强后仍可玩 |
| 桌面权限 | sandbox:true、contextIsolation:true、nodeIntegration:false；preload仅固定方法，存档路径不来自renderer；环境请求端点/字段白名单 |
| 工具链 | Node24、pnpm11.25.0、唯一pnpm-lock.yaml。pnpm11配置放workspace YAML，项目缓存独立；esbuild构建脚本明确批准，Electron运行时显式下载 |
| 存档版本 | 首版schema1没有既有正式旧游戏档可迁移；保留版本检查/备份机制。未来schema变更必须先实现并测试迁移，不宣称当前已验证不存在的旧格式 |
| 防作弊 | 不做在线防作弊。逻辑时间尽量不倒退，完整离线不能证明用户没有修改系统钟/存档；校验和只查损坏 |

票价与市场均为可调的首版基准，不承诺所有初始地区收益相同。现有鱼种产出差异保留。

官方依据：

- [Windows Widgets](https://learn.microsoft.com/en-us/windows/apps/develop/widgets/)提供小组件宿主/供给接口；本轮没有找到读取任务栏天气数据的公开本地接口。
- [MSN Weather connector](https://learn.microsoft.com/en-us/connectors/msnweather/)面向云工作流；[Azure Maps天气](https://learn.microsoft.com/en-us/rest/api/maps/weather/get-current-conditions?view=rest-maps-2025-01-01)需要Azure认证，不是本地系统天气缓存接口。
- [Open-Meteo](https://open-meteo.com/en/docs)、[ipapi](https://ipapi.co/api/)、[Electron安全建议](https://www.electronjs.org/docs/latest/tutorial/security)、[NSIS打包](https://www.electron.build/nsis.html)。
