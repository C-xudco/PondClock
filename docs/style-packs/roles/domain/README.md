# 外观商城、离线所有权与存档交接

日期：2026-10-25（Asia/Shanghai）。阶段：规则实现与模块回归通过，等待 Leader 整合生产 UI、独立审查及发行验收。代码基线：`e4d87f3`（1.2.0）。实现者：`appearance_domain` agent；Leader：`/root`。

## 意图与批准范围

用户要求恢复简洁默认美术，把水墨画面作为可购买、可选、可混搭的拓展包，并可购买鱼竿外观和人物皮肤。Leader 转达用户已确认本轮用卖鱼获得的**游戏金币**购买。所有资源随包离线提供；这里没有人民币支付、在线许可证、远程下载或交易市场。

默认价格是本轮工程取值，集中在 [appearance.js](../../../../src/config/appearance.js)，不是用户逐项指定的经济数字。外观不提供鱼价、咬钩间隔、品质或鱼竿属性加成。外观鱼竿与既有 `rodLevel` 的渔具升级完全独立。

## 所有权与文件范围

本角色唯一写入：`src/config/appearance.js`、`src/config/storage.js`、`src/domain/gameState.js`、`src/domain/saveSchema.js`、新增外观事务测试及本角色文档。既有三个迁移/独立审查测试文件只把写死的目标 schema/未来版本改成配置派生，未删除故障注入或弱化断言。

没有改 UI、渲染、天气运输、`useFishingGame.js`、`gameSession.js` 或 repository。已有 repository 按共享 validator 的目标 schema 自动先备份、再原子迁移，无需复制一套迁移实现。天气配置选项由 `weather_modes` agent 唯一维护，本角色导入选项与默认值。

## 商品与持久身份

| 商品 ID | 名称 | 金币 | 解锁内容 |
| --- | --- | ---: | --- |
| `inkwash_pack` | 山水入墨 · 美术拓展包 | 1800 | `scene/character/rod` 三类的 `inkwash` |
| `cloudwalker_skin` | 云游旅人 | 650 | `character: cloudwalker` |
| `ember_skin` | 暮色旅人 | 650 | `character: ember` |
| `jade_rod` | 青玉鱼竿 | 350 | `rod: jade` |
| `dawn_rod` | 晨光鱼竿 | 500 | `rod: dawn` |

三类的 `minimal` 永久免费。商品 ID 是保存的身份，不得重新用于其他资源。后续改变价格不影响旧所有权。扩容目录须同步校验、渲染资源、UI、测试和文档；删除旧 ID 必须有迁移方案。

## 对外接口

配置导出：

```js
APPEARANCE_PRODUCTS // [{ id, name, description, price, grants: { scene?, character?, rod? } }]
APPEARANCE_OPTIONS  // { scene: [{id,name}], character: [...], rod: [...] }
DEFAULT_APPEARANCE
appearanceProduct(productId) // definition | null
ownsAppearanceStyle(appearance, slot, styleId) // boolean
ownedStyleIds(appearance, slot) // string[]
```

存档新增：

```js
appearance: {
  ownedProducts: [],
  equipped: { scene: 'minimal', character: 'minimal', rod: 'minimal' }
}
settings: {
  // 仍保留全部既有设置
  sceneWeatherMode: 'fishing', // fishing | local | manual
  manualWeather: 'clear'      // clear | cloudy | rain | snow
}
```

`BUY_APPEARANCE { id, type, productId }` 校验落地状态、商品、余额，再一次性扣配置金币并记所有权；客户端提交的 `price/grants/equipped` 无效。购买不自动换装，避免消费者以为点击购买就是切换全部外观。相同命令重放、换命令 ID 再买或命令历史超过 128 条，均不会再次扣款。

`EQUIP_APPEARANCE { id, type, slot, styleId }` 只允许免费项或已购项；只修改选中的一类，其他分类可混搭。重复装配返回原状态，不产生额外保存。飞行中阻止买外观与换装，沿用现有地面商城规则。

购买和装备都通过已有 `GameSession` 串行提交。UI 仅在保存确证后使用新状态；保存失败保持旧余额/所有权，已落盘但回执丢失时先重读并调和，不盲目再扣费。

## 天气与到达事务

设置保存 `fishing/local/manual` 和四种手动天气；枚举与默认值唯一来源是 [weatherPresentation.js](../../../../src/config/weatherPresentation.js)。手动天气只影响画面，不改变鱼池、掉落概率或交易。

实际完成 `ARRIVE` 或实际换区的 `REAL_VISIT`，在切换 `currentRegion` 的同一事务把 `sceneWeatherMode` 改为 `fishing`。开始飞行、航程未到、IP 只解锁或重复进入同一现实区不会重置。保存原有 `manualWeather` 选择，供以后再切手动时使用。顶部现实天气与时钟交给天气/UI 模块，本角色不修改。

## schema3 与旧档

`GAME_VERSION=1.3.0`、`STORAGE_CONFIG.schemaVersion=3`；Web 发现地址仍为 `pondclock.save.v1`。`validateSave` 同时接受旧 schema1、schema2 并确定性规范为 schema3：

- schema1 保持原有捕获序号/随机种子/物品迁移语义，再添加本版字段；schema2 完整保留物品、buff、种子、序号和到达水位。
- 金币、鱼获 UID/捕获时间、图鉴、鱼饵、渔具等级、家乡/解锁区、已付款航程及绝对到达时间保持不变。
- 两种旧档都恢复免费 `minimal`，不从旧版水墨画面自动赠送所有权，不扣金币；外观只由本版已确认购买记录产生。
- 旧 schema 中伪装存在的 `appearance` 或新天气字段忽略，按默认初始化；当前 schema3 严格验证所有权、重复商品、三类装备、已拥有关系与天气枚举。
- 桌面原始双槽先按原字节保留 `.pre-schema3-<sha256>.bak`，Web 先保留 `.pre-schema3.<hash>-<length>` 原字符串，再写规范化快照；备份失败不替换原档。
- 未来 schema 阻止读取、迁移和覆盖。新 schema3 存档无法直接在 1.2.0 打开；如需回退旧版，须使用迁移前备份，不把未来档当新游戏。

## 验证与结果

本角色新增 [appearance-transactions.test.js](../../../../tests/appearance-transactions.test.js) **19 项全部通过**。覆盖目录/分类、免费默认、整包三类授权、混搭全组合、余额边界、调用者伪造价格、重复购买超过历史窗口、纯外观不改捕获 RNG/属性、飞行限制、到达重置、schema3 非法字段、schema2 资产/航程不变、桌面双槽原字节备份/重启、备份失败重试、Web 迁移、保存未确认前不发布、并发两次购买仅扣一次、丢回执调和、保存拒绝与实际桌面重启。

第一次模块执行发现测试自身重复构建 fixture 导致命令 ID 不同（87/88 通过）；改为比较同一份原始 fixture 后通过，没有修改产品规则来适配测试。随后执行下列相关回归 **123/123 通过**：

```powershell
node --test tests/appearance-transactions.test.js tests/save-migration.test.js tests/review-transactions.test.js tests/review-repair-followup.test.js tests/domain.test.js tests/session.test.js tests/web-storage.test.js tests/desktop-storage.test.js tests/loot-transactions.test.js
```

相关代码与上述修改过的测试通过 ESLint，无新增依赖。测试只使用项目 `tests/.tmp/appearance-*` 临时独立目录和内存 Web storage；未访问真实用户存档或联网。

## 交接与未测

Leader 对接 hook、商店按钮、装配选择、视觉主题与最终生产验收；渲染 agent 消费 `appearance.equipped`，天气 agent 消费两个天气设置。独立监督者应重点复核重复购买、防未拥有装备、旧档原件保留和未知回执。

本角色没有声称真实用户存档升级、普通最终 EXE、商店生产 UI、最终 ZIP、安装器升级/卸载、真实 IP/天气或人工美术验收已经通过。最终发行以 Leader 合并后的证据为准。
