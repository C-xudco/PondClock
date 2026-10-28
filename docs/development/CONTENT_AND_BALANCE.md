# 改爆率、鱼类、物品与图鉴

适用V2.0.1。这是实际实现导航，历史提案里的0.2%、旧升级代币等不是当前规则。不要只改README或演示随机函数；正式资产结果由领域命令、会话队列和保存共同提交。

## 三层概率必须分开

1. 普通鱼讯：及时手动点击捕获100%；无人操作只判一次30%，见 `src/config/activeFishing.js` 的 `automaticSuccess`、`src/domain/editionGameplay.js`。
2. 已成功捕获后，按 `src/config/lootConfig.js` 的10000分母表选择鱼或道具。鱼74%；破鞋5%；泡水表4%；秘籍2%；锈罐/蚌壳/渡口代币/饵盒/指南针各3%。总和必须10000。无人操作单鱼讯出鱼概率为30%×74%=22.2%，不是74%。
3. 判为鱼后，先按当前水域 `REGIONS[].fish` 的相对权重选鱼种，再按该鱼的 `qw` 和平衡修正选品质；品质价格倍率不是品质概率。

主动收鱼条是独立路径：450金币15次，2/3次挥竿后出条、空挥不扣，进入条扣一次。白0%、红10%、黄50%、绿100%；成功只出鱼，不走74%物品表、不耗普通高级饵、不借普通保底。参数位于 `activeFishing.js`，状态机在 `editionGameplay.js`。

## 数值的唯一入口

| 想修改 | 修改位置/字段 | 实际执行与检查 |
| --- | --- | --- |
| 鱼/物品总爆率 | config/lootConfig.js：denominator、weights | domain/loot.js：lootKindForSlot、catchOutcome；v2-domain、loot-transactions测试 |
| 修表 | 同文件repairCost、repairDenominator、repairWeights、价格区间 | domain/loot.js：watchRepairOutcome；gameState原子扣款和结果持久化 |
| 物品名字/介绍/直售价 | 同文件ITEM_DEFINITIONS；破鞋、泡水表另有专用价 | BucketPanel、domain/loot.itemName/itemSalePrice |
| 自动成功、普通等候、鱼讯窗口 | config/activeFishing.js | editionGameplay、hooks/fishingRuntime |
| 主动竿价格/次数/条速/色带 | activeFishing.js：bundlePrice、charges、oneWayMs、bands等 | editionGameplay、ActiveFishingBar、会话单调时间 |
| 鱼种品质底权重与体型 | lib/gameConfig.js的LEGACY_FISH，新增六鱼在data/focusRegions.js | 统一导出FISH，经fishBasePrice转换基础价格 |
| 实际品质修正 | config/balance.js：fishQualityWeights、rareFactors、activeMultipliers | domain/loot.js使用；不是lib/gameUtils.rollFish演示入口 |
| 鲜鱼价与区域稀缺系数 | config/economy.js、domain/market.js | 生产比例从REGIONS鱼池推导，不手写第二张市场表 |
| 七天过期 | economy.js：freshnessMs=168h，expiredPrice=1 | market.js统一报价/结算；改报价会影响旧鲜鱼库存 |
| 番茄奖励 | config/focus.js：25分钟、5分钟、dailyPlans=4、baitReward=1 | editionGameplay＋editionState账本，不在UI发币 |
| 高级饵包/商店售价 | lib/gameConfig.js的BAIT_*，ShopPanel读取 | 每包5条成功鱼；区分包数量与当前包剩余 |
| 外观商品/槽位 | config/appearance.js、data/appearanceVisuals.js | gameState购买/装备命令；不得直接在商城组件扣币 |
| 航线票价/时长 | config/travel.js、data/regionLocations.js、domain/routes.js | 17×16=272有向航段，60–180秒按距离缩放 |
| 天气显示选项 | config/weatherPresentation.js、domain/weatherPresentation.js | 只选择快照来源；不伪造真实缓存 |

修表当前分母1000：失败400、普通550、名贵49、顶级1；即40%/55%/4.9%/0.1%。花500，未修可卖50，普通10–200、名贵1000–9999、顶级10000；重开不重抽。秘籍只给启用后新钓获且出售时新鲜的前三条鱼+50%。指南针下一张付费机票九折，渡口代币下一组主动竿九折；同类未用时再次使用不叠加，也不吞第二件。

## 新增一条鱼

1. 选择稳定唯一id，提供name、basePrice、len、wt、qw、habitat。原50鱼在gameConfig.js；V2六条增量在focusRegions.js，二创可沿用该增量结构，避免维护两套同id。
2. 把id放入至少一个 `REGIONS[].fish` 的 `[id, weight]`，weight为正相对权重，鱼池不要求总和100。没有任何产地的鱼会触发市场初始化检查。
3. 在 `data/fishSources.js` 补学名、证据、来源链接和游戏化说明；不要把代表景点写成实地调查或垂钓许可。
4. 图鉴在 `components/panels/CodexPanel.jsx`，按地区鱼池自动列出，最佳体长/体重/品质和次数由 `gameState.js` 捕获提交时更新。卖鱼不删除记录。当前没有独立“物品图鉴”页面，物品入口是BucketPanel；新增物品图鉴需另做状态/页面，不能宣称现有已经提供。
5. 如果新增记录字段，同步 `domain/saveSchema.js` 校验/迁移和 `gameState.js` 写入；稳定id不可改名复用，旧档仍引用旧id。
6. 跑fish-data、v2-region-balance、appearance-rendering等相关测试，重新导出平衡矩阵，检查新增鱼是否让每成功捕获毛均偏离目标。

## 新增一件道具

必须联动：`lootConfig.js`注册定义和权重 → `domain/loot.js`名称/售卖/生成 → `domain/gameState.js`与`editionGameplay.js`原子使用逻辑 → `saveSchema.js`/`editionState.js`新增状态校验 → `BucketPanel.jsx`按钮/说明 → 对应事务与重放测试。仅配置一个名字不会自动拥有新功能。

新增3%道具示例：总分母仍10000，若从鱼扣300，应鱼7400→7100，并增加新id权重300；不能在原10000上再加300。此例只是说明操作方法，**本版没有执行这个新增**。新效果必须说明消耗时点、重复使用、失败保存、过期、重启和取消；需要随机结果的道具按既有命名随机流与保存结果实现，不能在React渲染中Math.random重抽。

## 新增水域、背景、对白

水域身份和鱼池：gameConfig.js / focusRegions.js；坐标与城市匹配：regionLocations.js；代表地点/时区：sceneSites.js；场景定义：config/sceneDefinitions.js；插画/水面/人物锚点：components/pond/scene.js；运行图：public/art；新增五地SVG可由scripts/build-focus-art.mjs再生成。地区数变动须覆盖航段、市场、天气列表、图鉴与不同画风。

对白文本在 `data/dialogueCatalog.js`，调度/防重复在 `lib/dialogueDirector.js`，行为参数在 `config/dialogue.js`；先确认实际文件函数再扩展事件。咬钩声音在 `services/biteAudio.js`，音源生成见 `scripts/generate-bite-audio.cjs`；静音、后台和一次鱼讯只播放一次要保留。

## 修改后的验证

```powershell
node --test tests/v2-domain.test.js tests/loot-transactions.test.js tests/fish-data.test.js tests/v2-region-balance.test.js
pnpm run lint
pnpm run balance
pnpm run build:desktop
```

`balance`会导出报价/航线数据，运行前看脚本输出目录并review差异，不能把旧签核报告直接当新参数验证。当前毛均约47.42–51.06：按成功普通捕获、鲜鱼本地立即出售+道具直售价，排除饵成本、秘籍、跨区溢价、修表中奖和优惠节省；不是每竿最低保证，也不等于每小时收益。
