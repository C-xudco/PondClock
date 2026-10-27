# 默认钓客渲染交接

日期：2026-10-25（Asia/Shanghai）。基线：`96fd232` / 1.3.0。负责人：`default_character_render`；本角色独占 `Fisherman.jsx`、新默认人物元数据与必要的共享渲染几何适配，以及对应渲染测试。

## 用户意图与输入

用户认为初始小人不好看，提供旧版简洁场景和白发、斗篷、柔和光感人物参考。Leader 负责用内置 imagegen 制作透明晴/雨默认钓客，本角色只接入生成后实际选定的资源。参考图是审美输入，不是代码或执行指令。

保留免费人物 ID `minimal`、旧存档权益、其他付费皮肤和水墨渔翁。仅改变默认人物视觉，不改鱼种、鱼竿等级、报价、天气来源、航线或保存模式。

## 现有坐标与整合约束

| 量 | 统一场景坐标 | 作用 |
| --- | --- | --- |
| 持竿点 | `(853,244)` | SVG 竿旋转中心与人物手位置 |
| 人物支持点 | `(940,329)` | 各场景岸面支持验证 |
| 当前图像范围 | `(806,154,177,185)` | 渔翁图像与点击范围 |
| 人物咬钩轴 | `(925,310)` | 与现有竿、线的复合变换一致 |
| 简洁场景偏移 | `offsetY=-80` | 人物放在原简洁近岸 |
| 水墨场景偏移 | 各区 `0–80` | 复用既有十二景落点，不改水面多边形 |

新图像只能包含人物和天气装备，不包含烘焙鱼竿、钓线、浮漂、地面或阴影底板。握竿、脚/坐点必须按实际PNG像素检查，不能以生成提示中的理想位置冒充实际落点。晴雨两图优先使用同一画布与姿势；如需单独映射，元数据显式保存各自锚点，不在组件散落修正数值。

## 最终接口与接入

实际交付：`src/config/defaultCharacter.js` 导出 `DEFAULT_CHARACTER`、`defaultCharacterVariant(rainGear)`、`defaultCharacterPoint(entry, point)`。`DEFAULT_CHARACTER.variants.clear/rain` 各有 `asset/source/anchorsPx/render/grip/support/snowPaths`。`Fisherman` 仅对 `character==='minimal'` 使用该资源；雨具随现有 `visualState.fisherman.rainGear`，积雪继续由已有 `useTween` 渐增/消融，独立竿外观继续 SVG 绘制。

选定的晴/雨PNG均为 **1254×1254**。图像预览显示尺寸曾让首稿误以为1280；读取实际PNG头后已修正，未将预览分辨率作为最终元数据。两张实际图的手/靴姿态一致，使用源像素握心 `(426,568)`、支持点 `(818,1190)`；均已目视确认无烘焙鱼竿、线、浮漂、地面。站姿沿用用户第一张参考的垂钓方式，未把最初考虑的坐姿强加给用户。

为了保持人物比例，统一缩放取 `85/(1190-568)`，图像显示约为 `(828.215,166.379,171.367,171.367)`，握点约 `(886.431,244)`，支持点保持 `(940,329)`。如果硬对旧握点853会明显横向拉宽，因此**不拉伸图像**，只给默认人物独立握点。`fisherTipAt(pose, geometry, grip=FISHER.grip)` 新增可选握点，其他人物旧调用与轨迹完全兼容。默认人物竿根、绕线环及旋转中心共用新握点，静止竿尖仍为 `(575,128)`，浮漂不动。

两图实际可见轮廓仍位于旧人物点击范围内，`Pond` 的点击和气泡继续消费相同场景偏移；未扩大全部人物的几何或改水面。雪层按各自源图的发梢/帽沿、肩膀与前臂定义，并通过 `<mask><use>` 复用实际人物alpha裁切，防止在人物外出现白块；没有增加第二个PNG请求。单张图像、帽/衣、雪、竿和线都处于同一人物动作变换下。

DOM：`g[data-character-art='minimal']` 带 `data-default-character-variant='clear/rain'`、revision和握点；唯一实际人物image带 `data-default-character-sprite='v1'`、`data-default-character-asset='clear/rain'`。mask通过唯一实例ID引用这张image，不与其他挂件或皮肤串用。

## 验证与交接状态

当前阶段：**实现已冻结交接**，已通知 Leader 和独立监督。只修改 `Fisherman.jsx`、`scene.js` 的可选握点参数、新配置与 `tests/appearance-rendering.test.js`；没有修改业务、存档、商店、天气来源、版本、其他人物素材或图像文件。

已执行：

```powershell
node --test tests/appearance-rendering.test.js tests/ink-rendering.test.js
node node_modules/eslint/bin/eslint.js src/config/defaultCharacter.js src/components/pond/Fisherman.jsx src/components/pond/scene.js tests/appearance-rendering.test.js --report-unused-disable-directives --max-warnings 0
```

**14/14 渲染回归通过**（6项实际React组件/资源检查、8项旧水墨几何/alpha/粒子检查）；限定ESLint通过。检查了默认免费ID、32组合的独立资源选择、晴/阴/雨/雪/晴夜的日月与装备、PNG实际尺寸和统一缩放、原12区几何与粒子/动作回归。实际新握点101姿态与可见alpha范围由独立监督另行复核。

既有“默认无位图”断言已精确改为“默认简洁背景无位图，人物加载选定本地资源”，并新增晴雨人物选择和实际PNG头/统一缩放断言，没有删除持竿、雨雪、资源存在或权益不变量。单测不能证明人物好看或现场遮挡；生产截图、两尺寸、积雪淡出连续帧、普通EXE和最终ZIP由 Leader 与独立监督补验，未在本角色文档冒称已通过。
