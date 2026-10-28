# V2.0.0 人物、场景与美术回归

负责人：`v2_render_finish`。更新：2026-10-28。用户已授权 V2.0.0 第一版开发；原候选封存于 `874cdac`。本角色负责渲染验证、可选人物包兼容和美术资源覆盖，不修改域规则、保存事务或运行时调度。

## 最终行为与接口

- 免费 `minimal` 人物使用 `ClassicFisherman.jsx`，恢复项目留存的 1.1.1 斗笠长衫剪影；全部原版字面路径均经对照校验，雨披和帽肩积雪作为天气叠层。
- 白发披风人物为独立 `whitecape_character_pack`（650 游戏金币），通过人物槽装备。原晴/雨透明 PNG、等比锚点、积雪透明蒙版均保留；不改变鱼获结果。
- 插画、人物、鱼竿仍独立选择。经典人物补齐统一的 `data-rod-art`、`data-fishing-line` 和实际竿尖坐标标识，便于与其他人物共用渲染验收。
- 17 个水域使用各自的场景几何与水面接触区域。新增太湖、洞庭、嘉陵江、白洋淀、胶东五景为项目原创 SVG，来源是 `scripts/build-focus-art.mjs`；已有十二景仍为原始栅格画作。天气继续由动态天空、降水和水面层叠加。
- 产地、真实天气来源和现实所在地时钟的选择契约保持；不能把景观插画视为某地真实生态调查或天气观测。

## 文件边界

本轮修改 `src/components/pond/ClassicFisherman.jsx` 的审计标识及六组测试：`appearance-rendering`、`default-character-review`、`ink-rendering`、`style-supervisor`、`dialogue-audio`、`review-repair-followup`。扩展 `scripts/audit-ink-art.cjs`，同时覆盖原 14 项资源和新增 5 张 SVG；新的清单写到本目录，不覆盖历史美术清单。

历史 1.3.1 的“美术修改未触及经济”校验继续针对封存提交执行；当前 V2 明确包含经批准的经济调整，因此另验证旧 50 种鱼身份不变、基础价格按 V2 公式转换、56 种鱼 × 17 地区共有 952 个唯一市场格。旧 50 鱼报告以封存的配置和报价实现复现，没有将当前代码伪装为旧报告。

## 已完成验证

2026-10-28 执行：

```powershell
node --test tests/appearance-rendering.test.js tests/default-character-review.test.js tests/ink-rendering.test.js tests/style-supervisor.test.js tests/dialogue-audio.test.js tests/review-repair-followup.test.js
node scripts/audit-ink-art.cjs
```

结果：36 / 36 通过，0 跳过；日志为 `test-results/v2-art-test.log`。覆盖所有场景/人物/鱼竿组合、17 地区经典与白发人物晴阴雨雪、统一竿线、原画路径、透明像素与锚点、天气文字来源、降水接触位置、720 种商城购买顺序、17 地区对白以及历史/当前市场边界。

美术审计共 19 项资源，运行资源总计 9,042,401 字节；结果及 SHA256 见 [art-production-manifest.json](art-production-manifest.json)。新增五张 SVG 检查了本地文件、逻辑画布、无脚本及外部 href；原栅格画作检查格式、尺寸和透明通道。

## 验收边界与交接

React 服务器渲染与文件结构检查不等于桌面窗口视觉验收。尚需 Leader 对真实打包窗口检查紧凑/展开布局、挥竿动画、资源显示、积雪与雨衣的最终观感。新增 SVG 的地区特色和美术精细度可继续迭代，当前不能宣称经过用户审美认可；没有发起真实定位或天气请求。

## 主动收竿手感与真实 EXE 验收接线

后续接手文件仅 `src/components/pond/ActiveFishingBar.jsx` 与 `scripts/smoke-packaged.cjs`。监督发现每秒计时保存时，通用 `game.busy` 会让及时停针被拒；收鱼条现只按自身提交锁、外部禁用、错误和面板遮挡决定是否接受操作。重复提交仍由 `submitted` 和 `sending` 保护，保存中的命令由会话串行执行；会话记录的按键接受时刻决定最终结果。

指针改为在250毫秒投影快照之间以 `requestAnimationFrame`、`performance.now()` 平滑显示，暂停立即停。该插值只用于画面，不把位置传给域规则，也不影响实际命中判定。

真实EXE脚本保留正常 Chromium 安全隔离、独立用户目录、禁用外网、实际窗口关闭及该测试进程退出验证。V2流程为：

1. 新档 UI 开始普通钓鱼，推进候鱼墙钟，收取一件鱼或物品，再 UI 停止；重开后出售或使用秘籍，再次重开核对。
2. 在另一 `fixture-profile` 写入经当前完整存档校验的显式测试数据：5000金币、太湖水墨场景、前三轮完成和第四轮最后5秒暂停。继续计划后核对单包鱼饵和每日单张通票，不把此数据当作本次挣得的完整25分钟记录。
3. UI 购买15次主动竿，逐次空挥不扣，进入条只扣一次，绿区使用键盘收鱼；核对鱼获、高级饵不消耗、重开不重领奖。保存太湖经典人物、专注奖励及绿区截图。

脚本与收鱼条局部 lint 已通过；harness 的拒绝启动、未处理拒绝和异常三种失败保留测试 **3/3** 通过。真实EXE的执行和截图检查由 Leader 进行，本角色没有把脚本改完声明为桌面验收通过。
