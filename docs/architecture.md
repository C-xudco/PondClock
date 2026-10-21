# 实现架构与流程

```mermaid
flowchart TD
  UI[React场景与面板] --> HOOK[useFishingGame / 会话适配]
  HOOK --> SESSION[GameSession 串行事务与提交确认]
  SESSION --> STATE[gameState / saveSchema]
  STATE --> RULES[routes / market 纯函数]
  RULES --> DATA[gameConfig + regionLocations + 分区config]
  SESSION --> REPO[存储接口]
  REPO --> BRIDGE[preload 白名单]
  BRIDGE --> MAIN[Electron主进程 / 单实例]
  MAIN --> SAVE[userData双槽JSON / 校验 / 原子替换]
  REPO --> WEB[Web预览localStorage双槽]
  UI --> ENV[geo / clockWeather hooks]
  ENV --> SERVICE[environment超时缓存与来源]
  SERVICE --> BRIDGE
  MAIN --> NET[白名单ipapi / IPWhois / Open-Meteo]
  NET --> SERVICE
  SERVICE --> GEO[每次有效IP永久免费解锁]
  GEO --> SESSION
```

```mermaid
flowchart TD
  START[启动] --> LOAD[读档 / schema校验 / 双槽恢复]
  LOAD --> VALID{有有效档?}
  VALID -->|有| RESTORE[恢复资产/家乡/游戏位置/航程]
  VALID -->|无| GEO[本次IP识别或离线默认]
  VALID -->|损坏或未来版本| KEEP[保留原文件 / 报错 / 允许显式导入]
  GEO --> NEW[创建唯一初始地区并保存]
  RESTORE --> PLAY[本地钓鱼可玩]
  NEW --> PLAY
  PLAY --> IP[联网时按当前IP免费累计解锁]
  IP --> REAL[可免费进入现实所在地水域]
  PLAY --> WEATHER[当地天气：在线 / 缓存 / 离线]
  PLAY --> TIME[绝对时间恢复航程和鱼龄]
```

```mermaid
flowchart LR
  CMD[带唯一ID的命令] --> CHECK[校验状态与参数]
  CHECK --> NEXT[完整nextState与新revision]
  NEXT --> SAVE[保存并验证]
  SAVE --> RESULT{提交结果}
  RESULT -->|确认| PUBLISH[发布状态与成功提示]
  RESULT -->|明确未提交| OLD[保留旧状态可重试]
  RESULT -->|结果未知| READ[暂停后重读有效槽]
  READ --> ID[按持久化命令ID恢复]
  ID -->|无法确认| BLOCK[阻止后续经济命令，保留文件]
```

```mermaid
stateDiagram-v2
  [*] --> Docked
  Docked --> Flying: 购票扣款与航程一起提交成功
  Flying --> Flying: 退出重启，尚未到达
  Flying --> Docked: now达到已保存arriveAt，仅抵达一次
  Docked --> Docked: REAL_VISIT免费进入已识别现实水域
  note right of Flying
    保存起点、终点、票价、版本与绝对时间
    暂停钓鱼和卖鱼，IP解锁仍可累计
  end note
```
# 1.0.1 安装、启动与退出补充

```mermaid
flowchart TD
  A[下载新版完整安装包] --> B[只检查安装目标路径的 PondClock.exe]
  B -->|正在运行或无法安全核实| C[提示退出后重试 不强杀]
  B -->|未运行| D[探测旧卸载器是否可写]
  D -->|文件占用或权限不足| C
  D -->|可写| E[标准临时卸载旧版本 保留用户存档]
  E --> F[安装运行时 重建桌面与开始菜单入口]
  F --> G[正常沙箱启动 单实例锁]
  G --> H{窗口正常显示}
  H -->|是| I[离线游戏与自动存档]
  H -->|失败或超时| J[脱敏日志与错误提示 退出释放锁]
  I --> K[点击关闭或 Alt+F4]
  K --> L[拒绝新写入 等待已接受存档及导出]
  L --> M[真正退出 释放文件与单实例锁]
  Z[完整 ZIP 解压] --> G
```

此图描述修复后的实现设计。真实安装、升级与正常沙箱运行的通过情况以 [修复验收](REPAIR_ACCEPTANCE.md) 为准，设计图不能代替实测结果。

## 1.1.0 悬浮挂件与网络变化

```mermaid
flowchart LR
  A[透明无边框窗口] --> B[顶部拖动区与非拖动按钮]
  B --> C[小挂件与展开档位]
  B --> D[置顶和最小化]
  C --> E[窗口坐标与档位]
  E --> F[window-state.json]
  F --> G[重开及显示器变化 校正到可见屏幕]
  H[启动 联网 前台 每两分钟] --> I[节流与在途去重]
  J[手动立即识别] --> I
  I --> K[固定IP服务]
  K -->|本次新响应| L[最新请求获胜 地区与天气坐标]
  K -->|失败| M[缓存标记 原因与退避]
  M --> I
  L --> N[会话队列永久解锁真实地区]
  N --> O[保持家乡 资产 游戏位置]
```

窗口位置与游戏存档分开；置顶设置仍随完整游戏状态保存。透明区域只负责外观，顶部为明确的拖动区，按钮为非拖动区，不将整个水塘变成拖动区域。实现参考 [Electron 自定义窗口交互](https://www.electronjs.org/docs/latest/tutorial/custom-window-interactions)。没有开启整窗鼠标穿透，收竿与面板仍正常接收点击。

新档定位宽限最多1秒，已有档案立即读取；后台 IP 返回成功后才新增现实到访记录。窗口前台与网络恢复事件只触发服务，不直接结算资产。429冷却保留在主进程与前端，VPN切换不绕过供应商限制。

## 1.1.1 双定位服务与独立天气

```mermaid
flowchart TD
  A[启动 前台 联网 手动 两分钟] --> B[节流 最新请求控制]
  B --> C[独立定位session 重载代理 清理旧连接]
  C --> D[最近成功服务 或默认ipapi]
  D -->|403 超时 无效响应| E[固定备用IPWhois 或另一服务]
  D -->|有效地区| F[IP新位置 坐标 来源 时间]
  E -->|有效地区| F
  E -->|均失败| G[带日期缓存 或默认 无伪造成功]
  D -->|429或配额JSON| H[该服务独立冷却 main门禁]
  H --> E
  F --> I[会话队列 免费永久解锁]
  F --> J[现实坐标天气]
  G --> K[历史或固定参考城市 明确标注]
  K --> L[独立天气控制器]
  J --> L
  L --> M[Open-Meteo 成功15分钟 缓存6小时]
  L --> N[普通失败1至15分钟 429等待 手动恢复]
  N --> O[模拟晴雨 无温度 不影响IP]
  F --> P[脱敏可复制诊断]
  G --> P
  N --> P
```

端点唯一表`src/config/environmentEndpoints.cjs`由main与renderer共同引用；`services.js`集中时限；IP故障切换和资产解锁分开；`weatherRefresh.js`只拥有天气网络状态。依据：[Electron session](https://www.electronjs.org/docs/latest/api/session)、[IPWhois官方端点与配额](https://ipwhois.io/documentation)。真实与模拟证据分别见[网络修复验收](NETWORK_FIX.md)。
