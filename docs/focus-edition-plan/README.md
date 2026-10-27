# 第一版 · 专注与钓鱼规划

2026-10-27（Asia/Shanghai）。本次所有新需求属于第一版；第二版尚未定义。这里是第一版实施前的评审资料，尚未改变产品、版本号或实际存档。

- [总方案与待审批参数](SPEC.md)
- [五水域、鱼种、市场和航线](REGIONS.md)
- [玩法与存档角色](roles/gameplay/README.md)
- [经济计算角色](roles/economy/README.md)
- [独立监督角色](roles/review/README.md)
- [需求分流记录](FORK_RECORD.json)
- [决定与实际协作记录](DECISIONS.md)
- [文档、图表和产品未改动核对](PLAN_CHECK.json)

需求分流点是本次聊天的2026-10-27请求。首次功能修改前再封存准确代码基线与候选取舍；不能将已有未提交1.3.1候选当作已发布基线。第二版只有后续明确需求后才建立产品配置，当前不替它预设玩法。

Leader维护总方案、需求收件台和数据规划；玩法角色负责状态机与存档边界，经济角色负责收益与付费参数，监督角色独立核对冲突和验收条件。每个角色只写自己的目录；主文档作为统一语义来源。

文档复算：`node docs/focus-edition-plan/build-region-plan.mjs`、`node docs/focus-edition-plan/roles/economy/calculate.mjs`、`node docs/focus-edition-plan/roles/review/verify-plan.mjs`、`node docs/focus-edition-plan/check-plan.mjs`。这些脚本只输出本规划目录；不运行新功能、不写真实存档。
