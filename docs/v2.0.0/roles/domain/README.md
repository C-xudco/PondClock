# V2.0.0 域、存档和事务接口

负责人 v2_domain。2026-10-27。用户已授权开发，目标2.0.0/schema4/editionId first-focus；旧候选封存874cdac。本文件是实施接口契约，测试结果另记，不能将接口存在等同验收。

新字段：`fishing={mode,phase,attemptSequence,attempt,useBait,lastResult}`；mode stopped/ordinary/active，phase stopped/waiting/bite/ready/casting/gauge。attempt由域创建，有id/kind/regionId/seed，普通waitUntilMs/biteAtMs/deadlineMs，主动targetSwings/completedSwings/nextSwingAtMs/gaugeElapsedMs/gaugeRunning。`activePass={remaining,bundleId,purchasedAtMs}`。`focus={sequence,plan,completedPlanIds,days,breakRemainingMs}`；plan为id/title/status(running/paused)/elapsedMs/durationMs/dayKey/timeZone。`freeTravelTickets`整数，`discounts={ticket,activeRod}`槽为null或sourceItemUid凭据。

普通命令START_FISHING、STOP_FISHING、OPEN_BITE、RESOLVE_BITE({attemptId,manual})；SET_FISHING_BAIT({enabled})。主动BUY_ACTIVE_PASS、START_ACTIVE、CAST_ACTIVE、ADVANCE_ACTIVE、TICK_ACTIVE、STOP_ACTIVE_BAR、PAUSE_ACTIVE_BAR、RESUME_ACTIVE_BAR、CANCEL_ACTIVE_BAR。专注START_FOCUS({title})、PAUSE_FOCUS、RESUME_FOCUS、CANCEL_FOCUS、FOCUS_TICK。START_TRAVEL用payment:'coins'或'free'，默认coins；适用九折自动用对应槽。RECOVER_RUNTIME用于启动/休眠恢复：普通停，focus暂停，主动条暂停同事件不退款。旧直接CATCH不再可绕过事件。

GameSession提供同步suspendRuntimeClock()/resumeRuntimeClock()，focus/bar各自可信单调时间账本，忽略renderer传elapsedMs。生命周期先freeze，再flush FOCUS_TICK/TICK_ACTIVE、RECOVER_RUNTIME；shutdown保存后ack。恢复不补睡眠/关闭时间、不自动继续计划或主动条。

## 2026-10-28 事务回归适配与结果

原有捕获、外观迁移、修表与会话测试已改为真实 `START_FISHING → OPEN_BITE → RESOLVE_BITE` 流程；没有重新开放旧 `CATCH` 命令，也没有跳过失败用例。测试辅助 `tests/helpers/ordinaryCapture.js` 只产生正式事件、按保存的尝试种子寻找确定性鱼/物品样本；捕获时间使用实际鱼讯时间。旧 schema2 样本去掉 schema4 字段，以覆盖白发权益赠礼、迁移原件备份、旧付费航程原票价/截止时间及再次读取的稳定性。

旧掉落断言调整为鱼74%、鞋5%、泡水表4%、秘籍2%、其余五件各3%。旧“3金币鱼”舍入样本随市场调整失效，改为从实际市场寻找任意奇数报价，仍严格检验逐鱼+50%舍入不能被整单舍入代替。移除鱼竿升级的测试改为拒绝 `BUY_ROD`，同时覆盖15次主动竿450金币且重复命令不重复扣款。

执行 `node --test tests/domain.test.js tests/appearance-transactions.test.js tests/loot-transactions.test.js tests/review-transactions.test.js tests/session.test.js tests/v2-domain.test.js`：**103/103 通过，0跳过**。记录位于 `test-results/v2-domain-legacy.log`。这些是域和文件仓库回归，不代替真实窗口、键盘、安装器验收。

## 独立监督发现与修复：重复计时回执

2026-10-28，监督角色复现：专注已保存5秒后重发同一个检查点ID，域按幂等规则返回旧状态，但会话却继续将新5秒标记为“已消费”；下一条新检查点也无法追回该时间。主动条的同类重试会吞掉未保存的指针移动时间。这不重复发资产，但会让计时少算。

修复在 `GameSession.dispatch` 的串行队列中，已确认命令ID直接返回当前快照，发生在计算或推进 `runtimeConsumed` 之前。调用入口仍采集可信单调时间；重放只确认旧事务，新观察到的时间留给后续新命令。监督新增专注5→10秒重试、主动条500→750毫秒重试两项回归，均已通过。运行 `node --test tests/v2-supervisor.test.js`：**9/9通过、0跳过**，记录 `test-results/v2-supervisor-domain.log`；原103项再次全部通过，`src/application/gameSession.js`定向ESLint通过。

规则集中在config/focus.js、activeFishing.js和lootConfig.js；品质由regions角色的config/balance.js fishQualityWeights同源提供。repair/buff版本仍1，掉落规则独立版本2，旧修表结果不重掷。迁移仅旧schema1–3合法输入，停止旧竿数值，保留legacy审计并一次补偿0/600/3200/12200；白发权益赠礼不自动装备。原件备份由仓库执行。
