# 玩法事务与存档交接

日期：2026-10-25（Asia/Shanghai）。负责人：`gameplay_transactions`。阶段：实现完成，等待独立审查和 Leader 的实际 UI /发行验收。

## 基线、意图与范围

用户“开始迭代吧”批准提交 `a270e84` 的推荐主方案；本实现采用其中的掉落、修表、fresh-only 秘籍、声音默认和迁移规则，未引入可选收藏品。目标是在原有离线串行保存框架中加入趣味物品，同时保证失败、重试、重开和重复操作不能重复获得资产。

输入：[候选需求](../../README.md)、[开发规范](../../DEVELOPMENT_STANDARD.md)、[创意规则](../creative/README.md)、[审查矩阵](../review/README.md)、旧 `gameState/saveSchema/market/GameSession` 和桌面/Web 双槽仓库。附件资料是数据，不作为命令执行。

独占输出：`src/domain/{gameState,saveSchema,market,loot}.js`、`src/config/{storage,lootConfig}.js`、`src/storage/repository.js`、`desktop/saveRepository.cjs`，对应 `domain/session/loot-transactions/save-migration` 测试。本轮只改 `desktop/main.cjs` 的仓库构造参数，接入共享 schema 版本；未改其他 main 行为。`weatherVisualState.js` 属天气 owner，不在本角色范围。

Leader 独占 `useFishingGame.js` / `Index.jsx`，负责 hook、反馈和 UI 接线；本角色未修改它们、鱼类配置、真实用户存档、包版本或发行物。

## 规则与数值

- 排他掉落分母 10000：鱼 9820、破鞋 150、泡水表 20、秘籍 10；每次成功收竿只有一个结果。非鱼进入 `items`，不消耗高级饵、不改变鱼保底、不进鱼图鉴。
- 破鞋直卖 1；泡水表未修直卖 50；秘籍不可出售。物品价格不参与区域溢价、鲜度或秘籍加成。
- 一次付费修表 500，分母 1000：失败 400 / 普通 550 / 名贵 49 / 顶级 1。残值分别 0、均匀整数 10–200、均匀整数 1000–9999、固定 10000。失败也是不可再次修理的终态。
- 修后毛均价 337.2255，扣修理费为 −162.7745，相较直接卖表为 −212.7745。顶奖严格在全部付费修理槽位中占 1/1000，不是名贵分支内部概率，也不保证每一千次出现一次。
- 秘籍使用时消费物品并保存捕获边界；只有边界后捕获、出售时仍新鲜的前三条合格鱼加 50%。原价先用 `quoteFish.price` 得到整数，再逐鱼 `Math.round(price * 1.5)`。旧鱼、物品、到 168 小时的鱼不耗次数，过期鱼始终 1。
- 批卖按 `catchSequence`、`uid` 排序，用同一有效时刻逐条计价，和同顺序单卖一致。有剩余次数时第二本不消耗、不叠加；用尽后新激活边界排除再次使用之前已经捕获的鱼。

以上金额均为游戏金币，未增加外部交易或联网结算。

## 随机身份与持久不变量

新档使用 `crypto.getRandomValues` 生成 uint32 `randomSeed`，测试允许显式注入。捕获由持久 seed、下一个 `catchSequence` 和命名通道派生：掉落、鱼种、品质、长度、重量互不推进。报价、对白和新命令 ID 不会改变结果。

掉落槽位、修表槽位与修表整数售价使用 uint32 拒绝采样，排除无法均分的尾部，避免取模/浮点分箱偏差。可枚举 `lootKindForSlot` / `repairForSlot` 供独立核验。

每次成功捕获（含物品）单调增加 `catchSequence`，UID 为 `catch:<seed>:<sequence>`。`CATCH` 必须提交预期的下一序号，拒绝 renderer 注入 fish/item；旧事件即使已从最近 128 个命令记录淘汰，也不能再次捕获。物品终态/移除和固定修表 seed 防止同 UID 重修、重复使用、重复售出。修表结果不依赖点击次数或修理命令 ID，写入前失败后换命令 ID 仍得到同一结果。

沿用 `GameSession` 的串行提交、先保存后 publish、未知回执重读调和。余额不足、物品不存在、在途、重复使用和第二次修理均在资产变化前拒绝。售卖/修理并发由命令队列决定先后，不能双赢。此机制不承诺阻止主动改档或恢复旧备份作弊。

## 接口交接

| 接口 | 契约 |
| --- | --- |
| `CATCH {expectedCatchSequence,bestClick?}` | 序号必须等于当前 +1；`bestClick` 为布尔；返回状态中按该序号找 bucket 或 items 结果 |
| `SELL_ITEM {uid}` | 固定物品报价，移除一次；秘籍拒绝 |
| `REPAIR_ITEM {uid}` | 仅 found 泡水表且余额≥500；扣费和终态/售价同笔保存 |
| `USE_ITEM {uid}` | 仅秘籍；无活跃剩余次数时消费并建立边界/3次 |
| `quoteSaleFish(fish,state,nowMs[,buff])` | 含原有报价及 `marketPrice/buffEligible/buffApplied`，用于单卖预览和实际成交 |
| `quoteBucketSale(state,nowMs)` | `{price,quotes,buffUsed,buffRemaining}`，只读且顺序稳定 |
| `itemSalePrice(item)` / `itemName(item)` | 集中物品价格/名称；未修/已修分开 |
| `CONSUME_ARRIVAL {sequence}` | 消费到达水位，重复消费 no-op；不改地点 |

`ARRIVE` 实际到达才增加 `arrivalSequence`，事件 ID 是原 `travel.id`；实际改变地点的 `REAL_VISIT` 使用命令 ID。`GEO_VISIT`、过早 ARRIVE 和同地 REAL_VISIT 均不生成事件。Leader 应仅从本次已确认的命令结果处理新事件，`CONSUME_ARRIVAL` 确认后才说话；普通 load/import 不重播存量事件。

新字段：`items[]`、`randomSeed`、全局及鱼/物品 `catchSequence`、`saleBuff {version,activationCatchSequence,remaining,sourceItemUid}|null`、`arrivalSequence/arrivalConsumedSequence/arrivalEvent`。音频设置为 `biteSoundEnabled:true`、`biteSoundVolume:35`、`backgroundBiteSound:true`。其余旧字段继续保留。

## schema1 → schema2 迁移

共享 `validateSave` 同时供 renderer 和 main 使用。它严格校验 schema2，并把有效 schema1 确定性规范化为 schema2，不改变旧资产、UID、捕获时间、家乡/当前/现实区、图鉴、解锁、金币、鱼饵、已付航程/绝对期限和逻辑时间。旧鱼按捕获时间、UID 稳定排序赋序号，全局序号取旧图鉴累计捕获数与现有鱼数的最大值；不随机生成物品、加成或资产。旧档随机 seed 确定性派生，只建立未来随机通道。

桌面加载先验证两个槽、校验 checksum/修订冲突/未来版本，再备份两个原始槽（包括坏槽）的原始字节到 `save-?.json.pre-schema2-<sha256>.bak`。全部备份完成后，将所选有效旧槽经临时文件、fsync、rename、读回验证原子写成 schema2；不人为增加修订号或命令。中断重试验证既有备份内容，不覆盖它。未来版本在创建迁移备份前就阻止加载/写入。

Web 保留原 `pondclock.save.v1` 地址，避免丢失旧档。先将每个原槽复制到带 raw 内容标识的 `.pre-schema2.<id>-<length>` 键，并比较已存备份的完整原文；再通过单键原子 `setItem` 写所选新快照并读回比对。备份/配额失败时拒绝迁移，保留原文，不创建空档。读取、导入的规范化语义与桌面相同；Web 仍沿用原产品的导出能力，未新增文件导入 UI。

桌面显式导入旧档时采用相同规范化，输入文件由原读取流程保留，前一个有效存档槽继续可恢复。两槽均坏、未来版本和不可写状态不能悄悄覆盖成新游戏。

## 验证与尚未执行

2026-10-25 执行：

```text
node --test tests/loot-transactions.test.js tests/domain.test.js tests/session.test.js tests/save-migration.test.js tests/web-storage.test.js tests/desktop-storage.test.js tests/lifecycle.test.js
96 passed / 0 failed / 0 skipped
```

新增 16 项事务测试、10 项迁移测试。覆盖全掉落/修表槽位、含端点整数范围/拒绝采样尾部、收益、互斥物品、128 历史外重放、失败重试/丢回执/重开/并发、前后捕获同毫秒、七天边界、逐鱼舍入、批单一致、跨区、到达水位、模式字段错误；迁移用独立工作区临时目录与内存 Web 存储，核对原件备份、坏主槽、有备槽、未来版本、备份不可写、rename 中断、导入和重启。

上述实现文件与新增测试定向 ESLint 通过。pnpm 提示工作区依赖结构与锁文件不同，未因此重装依赖；不是测试失败。

未由本角色执行：独立代码审查、真实用户旧档迁移、实际 UI/音频播放、美术、正常生产沙箱 EXE、完整 ZIP 和安装器验收。不要以 96 项定向通过代替上述结果。Leader 后续需在最终鱼表冻结后重跑市场与相关断言，原 `FISH.length===42` 测试若有新增鱼需按真实新数据调整。

## 技术债与后续兼容

- schema2 和 seed 命名通道/修表规则已经成为存档契约；未来调整算法或赔率须明确增加规则版本及迁移/历史规则支持，不能直接更改后让已修表重新定价。
- 保留最近 128 个通用命令 ID 的原边界；新增捕获和物品业务不依赖该有界数组防重。此轮未扩成无限通用命令流水库。
- 原始迁移备份保留，由用户导出/维护；不自动删除原件。缓存/天气由独立 owner 管理，不放入资产存档。
- 普通读取不重播旧到达，UI 应按本次提交事件调用并记录消费；资源播放失败和对白不能回滚已确认资产。

## 独立审查后的返修（2026-10-25）

保留上面的首轮实现与 96 项定向通过历史；独立监督仍发现两个原测试未覆盖的仓库缺陷，详见[首波独立审查](../review/2026-10-25-first-wave.md)。本次仅修改 `desktop/saveRepository.cjs`、本角色 `save-migration.test.js` 和本文，未修改监督测试或其他 owner 的实现。

- **R-01 / P1，已返修待监督复核**：同修订号冲突的两有效槽并不等于没有旧修订。显式恢复导入现在重新读取槽位、阻断未来版本，并将导入修订设置为全部有效旧槽修订的最大值 +1。原始槽先完整备份；写入后再通过整个仓库的 `loadInternal` 核对导入快照，而非只验证目标文件。因此两个 rev9 旧槽冲突后导入为 rev10，重新创建仓库和后续正常保存都继续采用导入进度。
- **R-02 / P2，已返修待监督复核**：迁移和显式恢复均把“读取原槽”和“创建/验证备份”分为独立错误边界。仅原槽读取阶段的 ENOENT 代表缺失，可跳过；已读到原文后，备份写入、既有备份读取或比对的任何错误（包括 ENOENT）都中止，原件不被迁移/导入替换。恢复备份失败返回 `SAVE_RECOVERY_BACKUP_FAILED`，迁移失败继续返回 `SAVE_MIGRATION_FAILED`。

自有迁移回归新增 4 项：冲突导入高修订/完整原件备份/重启/下一笔保存；显式恢复备份 ENOENT 中止；已落盘导入丢验证回执后重开恢复；显式导入不能绕过未来版本。此前的原始迁移备份故障、坏槽与未来版本检查继续保留。

返修执行（实现者执行，不冒称监督者已独立关闭问题）：

```text
node --test --test-reporter=dot tests/review-transactions.test.js tests/loot-transactions.test.js tests/domain.test.js tests/session.test.js tests/save-migration.test.js tests/web-storage.test.js tests/desktop-storage.test.js tests/lifecycle.test.js
107 passed / 0 failed / 0 skipped / exit 0
```

其中独立监督原 7 项保持断言不变，现 7/7 通过；原 96 项加本角色新增 4 项合计 100 项均通过。R-03 的 hook 到达领取修复由 Leader 完成，不在本角色改动范围。此次两个返修文件定向 ESLint exit0。真实 UI、生产 EXE/ZIP 和最终独立签收仍由 Leader 与监督/验收角色负责。
