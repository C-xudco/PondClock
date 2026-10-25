# 天气展示选择 · 开发交接

日期：2026-10-25（Asia/Shanghai）。角色：`weather_modes`；阶段：纯模块实现与单测完成，等待 Leader 接线和独立生产 UI 验收。本记录以本次用户追加需求为基线，沿用原有天气运输、缓存、隐私与存档规范。

## 意图与用户确认

背景地区与天气来源可以分开。用户确认的例子：玩家人在东莞，游戏背景在广州，可在广州背景上选择显示东莞的天气，或者广州钓点的天气；实际漫游到新地点后自动跟随目的地。顶部时钟始终使用现实所在地，与场景的选择独立。

首条需求同时提到太阳、阴云、雨雪。本模块保留第三种“手动天气”模式，提供晴、阴、小雨、小雪；手动只影响画面，明确标注“手动 · 仅画面”。日夜仍随钓点时区，手选晴在夜间显示月光，不能把晴天预设冒称白昼太阳或真实天气。

用户的“当地”按此次东莞/广州例子解释为两个明确来源：`local` 是现实 IP 城市；`fishing` 是当前已提交游戏钓点的代表地点。均不把岭南等广域鱼群名当成具体城市。

## 输入、输出与所有权

本角色独占的文件：

- [集中选项配置](../../../../src/config/weatherPresentation.js)：三模式、四手动预设与安全默认值。
- [纯展示选择](../../../../src/domain/weatherPresentation.js)：`selectSceneWeather`、`manualWeatherSnapshot`。
- [组合 hook](../../../../src/hooks/useSceneWeather.js)：仅 memo 组合，既不订阅服务，也不发请求。
- [独立单测](../../../../tests/weather-presentation.test.js)。

未修改 `Index`、`useClockWeather`、`useRegionWeather`、天气 store/queue、存档、设置面板和 `Pond`。这些共享文件由各自唯一负责人接线，避免多人写同一接口。

接口：

```js
const displayedScene = selectSceneWeather({
  settings: game.settings,
  localWeather: env,      // useClockWeather 的现有返回对象
  fishingWeather: scene, // useRegionWeather 的现有返回对象
  nowMs: Date.now(),
});

// 或在 React 组件顶层：
const displayedScene = useSceneWeather(game.settings, env, scene);
```

`settings.sceneWeatherMode`：`fishing | local | manual`，默认 `fishing`。`settings.manualWeather`：`clear | cloudy | rain | snow`，默认 `clear`。枚举与默认值均由集中配置导出，存档校验应直接引用。

输出保留 `fishingWeather.site`、`sceneDefinition`、当前背景几何等场景身份。`snapshot`、`entry/weatherEntry`、`visualState`、`weather`、`temperature`、刷新/错误字段切换到所选来源。手动模式没有实际温度、观测时间、测量降水量或刷新函数，不创建网络请求。

`presentation` 专供标签展示：

| 字段 | 示例与含义 |
| --- | --- |
| `mode / modeLabel` | `local / 现实所在地天气` |
| `originLabel` | `现实 · 广东省东莞市`、`钓点 · 珠江·沙面`、`手动 · 仅画面` |
| `sourceLabel` | 联网天气、缓存天气、天气待获取、手动设置 |
| `detail` | 标题说明；尚无 IP 坐标时明确“参考城市，不代表已识别现实所在地” |
| `weatherPlace` | 所选天气的具体地点，手动为空 |
| `locationSource` | `ip / ip-cached / reference / scene-site / manual / unknown` |

`Pond` 接收 `weatherPresentation={displayedScene.presentation}`，背景的 `sceneSite.place/address` 继续显示当前钓点；第二行天气来源另行显示，不能用东莞替换广州背景地址。参考城市短标签使用“现实参考”，避免只在 tooltip 里解释定位尚未成功。

## 到达与状态约定

`appearance_domain` 负责人已收到交接：在真正改变地点的 `ARRIVE` 或 `REAL_VISIT` 中，同笔状态变化将 `settings.sceneWeatherMode` 重置为 `fishing`。`START_TRAVEL` 不切换目的地天气；到达前 `ARRIVE`、无地点变化的 `REAL_VISIT`、单纯 `GEO_VISIT` 不重置。

展示选择器没有旅行命令权限，只读当前已提交钓点；预取的目的地或只读天气查看器不能提前切图或切换来源。手动预设保存在设置中，即使到达改为钓点模式也保留预设供下次选择。

## 依赖与决定

继续使用现有天气快照和 `toWeatherVisualState`，让天空、日月、水面、雨雪接触与人物防护共用一份状态。手动预设以 WMO 风格代码描述画面，但 `provider/source/quality` 明确为 `manual`；真实缓存校验器会拒收它，测量值全部为空。

真实和钓点模式不互相降级替代：现实来源缺失时仍显示未知，不借广州钓点的雪假装东莞正在下雪。缓存标明缓存，参考城市标明参考。晴雨切换不改变鱼类掉落、市场报价、金币、皮肤拥有权、地区解锁或真实天气缓存。

没有新增服务、第三方依赖或网络流量。现有顶部与 12 水域后台预取仍归原 store 的统一队列和配额管理。选择天气本身不触发重新识别或额外刷新。

## 验证与未测项

已执行：

```powershell
node --test tests/weather-presentation.test.js
node node_modules/eslint/bin/eslint.js src/config/weatherPresentation.js src/domain/weatherPresentation.js src/hooks/useSceneWeather.js tests/weather-presentation.test.js --max-warnings 0
```

结果：10 项单测通过，0 失败；所负责文件 lint 通过。覆盖三模式、四手动预设的统一视觉、东莞/广州背景与来源分离、夜间晴天、手动无虚构观测/不可入真实缓存、未知来源、缓存与参考标记、深冻结输入纯度、回调无调用、飞行目的地不提前切换。详见[机器记录](IMPLEMENTATION_CHECK.json)。

本角色未执行真实 IP/天气请求、Windows 网络切换、生产 UI 或普通 EXE 验收。到达重置由领域角色实现与测试；最终设置控件、标签可读性、外观混搭和发行包应由 Leader 整合后独立验收，不能用这里的纯函数通过数代替。
