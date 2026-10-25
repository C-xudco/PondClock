# 外观资源包 · 美术与场景渲染

日期：2026-10-25（Asia/Shanghai）。阶段：实现交接，生产窗口截图与最终发行待 Leader 验收。需求基线是本轮用户的“简洁默认画面 + 可购买水墨拓展 + 人物/鱼竿混搭”，不把附件、历史待审说明当成额外指令。

## 意图与决定

默认恢复上一版的低饱和、留白、渐变天空、三层远山、微光水面和右岸剪影构图。天空与水体代码恢复自 Git `a270e84` 的原生 SVG（`SkyLayer.jsx` / `WaterLayer.jsx` / `scene.js`），保存为独立的 `MinimalSky.jsx`、`MinimalWater.jsx` 与 `minimalScene.js`。没有为此重新生成或下载图片。

当前水墨版的十二张地方背景、两张透明渔翁与降水接触表现继续保留，由外观场景槽选择。两套场景使用同一份天气视觉状态：日月、倒影、雨雪、防雨衣与积雪不会各自猜测天气。复用旧画面时已移除旧版“任何天气都画日月”的行为。

“类似光遇”只解释为简洁、轻盈、柔和气氛。新人物均为本项目手写 SVG，不采用其他游戏的人物、发型、面具、光翼或标识。

## 输入、输出与唯一所有权

| 文件 | 用途 |
| --- | --- |
| `src/components/pond/Pond.jsx` | 依据已装备外观选场景、人物、竿；显示背景地址与天气覆盖来源；保留现有钓鱼交互 |
| `src/components/pond/MinimalSky.jsx` / `MinimalWater.jsx` | 恢复的简洁场景图层；SVG 资源 ID 带实例前缀 |
| `src/components/pond/minimalScene.js` | 旧版纯视觉装饰常量；不包含鱼价、航线、天气服务或玩法参数 |
| `src/components/pond/scene.js` | 保留全部水墨几何；新增简洁场景的岸线/水面/人物定位 |
| `src/components/pond/Fisherman.jsx` | 原创 SVG 人物、原水墨人物、独立鱼竿装饰；共用姿态变换与竿梢连接 |
| `src/components/pond/SpeechBubble.jsx` | 纸墨与简洁深色气泡表现 |
| `src/data/appearanceVisuals.js` | 纯展示调色板与保守回退 |
| `tests/appearance-rendering.test.js` | 新外观组合、几何、天气控制及来源标签检查 |

本角色不修改 `Index.jsx`、玩法 hook、商城、设置、全局 CSS、金币/拥有权/存档。Leader 整合页面、全局主题和按钮；domain 角色维护商品规则及所有权。金额只在商品配置中定义，图层不得扣金币或解锁商品。

## 外观接口

`Pond` 新增 `appearance`，输入完整的持久状态：

```js
{
  ownedProducts: [/* domain 管理 */],
  equipped: {
    scene: 'minimal',     // minimal | inkwash
    character: 'minimal', // minimal | inkwash | cloudwalker | ember
    rod: 'minimal',       // minimal | inkwash | jade | dawn
  },
}
```

省略或未知视觉 ID 会回到免费 `minimal`；渲染器只消费 `equipped`，拥有与购买校验在 domain。场景、人物、鱼竿共 2×4×4=32 种组合可混搭。默认简洁组合不请求任何水墨位图，水墨人物可以站在简洁背景，原创剪影也可以站在水墨背景。

| ID | 原创设计或来源 |
| --- | --- |
| `minimal` 场景 | 上一版原生 SVG 构图与配色，恢复而非重新解释成水墨 |
| `inkwash` 场景/人物 | 1.2.0 已内置的十二地区水墨图与晴/雨渔翁；来源和提示词仍见[原素材记录](../../../inkwash/roles/rendering/README.md) |
| `minimal` 人物 | 无面部细节的斗笠长衫剪影，手写 SVG |
| `cloudwalker` 人物 | 灰青短兜帽与素色长披衫，原创、无品牌造型 |
| `ember` 人物 | 暖赤长衫、深褐斗笠与浅金腰带，原创 |
| `minimal` / `inkwash` 鱼竿 | 低饱和竹竿与墨竹调色，沿用共同竿梢与导环 |
| `jade` 鱼竿 | 青玉绿竿身与浅金绕线装饰 |
| `dawn` 鱼竿 | 曙光粉褐竿身与灰紫绕线装饰 |

所有皮肤/竿仅改变表现，不调整鱼种、品质、咬钩速度、判定窗口或任何经济概率。鱼竿等级仍由既有玩法决定。

## 天气覆盖接口

Leader 将天气角色产物传给 `visualState`、`weatherEntry`、`weather` 与新增的 `weatherPresentation`：

```js
{ originLabel: '现实 · 东莞', sourceLabel: '联网天气', detail: '…' }
```

背景地点和行政地址始终取 `sceneSite`，例如珠江沙面/广州；天气行可以明确写“现实 · 东莞”。因此选东莞天气不会把广州背景误标为东莞。手动天气的 `snapshot.source='manual'` 显示“手动设置”，空温度不显示 0°，空观测时刻不冒称实时测量。

## 几何、动画与性能

- 水墨现有十二场景几何 revision3 不变；简洁几何独立为 `MINIMAL_GEOMETRIES`，每个水域保留独立视觉身份，但同属上一版通用景观构图，不冒称十二张新的实景插画。
- 简洁水面由旧版同一条右岸三次曲线采样，右岸、左前景石头、人物支撑区域均排除降水落点。`geometryForAppearance(regionId, style)` 决定水面和站位，不能由人物皮肤改变几何。
- 人物、雨衣、积雪、手持竿、钓线起点、点击范围与气泡共用场景偏移。竿与人物的咬钩旋转仍与 `fisherTipAt` 一致，浮漂继续是世界坐标，不随皮肤偏移。
- 沿用有界雨滴/雪花粒子、各自触水与消融时间线、隐藏暂停、减少动态，不另建常驻动画循环。新皮肤无额外动画计时器。
- 所有 SVG 渐变和滤镜使用实例 ID，避免同时出现预览图时 ID 串用。

## 验证与局限

已执行：

1. `node --test tests/appearance-rendering.test.js`：5/5 通过。实际生产 JSX 经已有 esbuild 编译，用真实 React 静态渲染；检查全部32种组合独立资源、默认无位图、所有人物在两套场景中阴/雨/雪不露日月或倒影、晴夜月亮、手动与现实天气来源。
2. `node --test tests/ink-rendering.test.js`：旧水墨 8/8 通过，包括原素材头/alpha 与全部地区落地、竿线连接、粒子触水回归。
3. 新/受影响渲染代码与新测试的 ESLint 通过。

上述为几何与真实组件静态结构验证；不是人工视觉审美结论，也不替代桌面生产 UI 的420×350/640×490、深浅壁纸、连续帧、保存后换肤、商城实际购买和完整 ZIP 检验。最终证据由 Leader/独立验收角色补充。旧版安装器未验收事项继续保留。

新增 SVG 不需要 imagegen；这次是恢复并扩展已有代码原生图层。既有水墨包的生成方式没有改动。
