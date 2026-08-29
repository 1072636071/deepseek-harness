# system-prompt 装配记忆化 + PTC 改用 view keys

**Status:** done
**Blocked by:** 无——可立即开始

**构建内容：** system-prompt 的 `assemble()` 按 registry generation 记忆化——工具 schema 只在 tools/change 时变，不再每个 agent 步骤（含每次 buildRequest 循环）都 `structuredClone` 全部工具 parameters；PTC 执行 run_code 前取工具名列表改走 `view().visible.keys()`，不再为读 name 而对每个工具 schema 做全量克隆。对用户可感知：每步请求构建延迟下降；提示词内容与工具变更生效时机完全不变。

**验收标准：**

- [ ] 同 generation 下重复 assemble 不重复克隆且内容相同（计数断言 + 对比测试）
- [ ] 工具注册/移除后下一次 assemble 立即反映变更（测试覆盖）
- [ ] PTC 收到的工具名列表与旧实现一致（对比测试）
- [ ] agent 循环每步 buildRequest 的装配开销不再随工具数量线性重复（微基准）

## 评论

## 评论

- **PTC 半边（已实现）**：ToolRuntime 新增公共 `toolNames(scope)`（view 键列表，走 01 号工单的视图缓存），ptc.ts 的 run_code 绑定枚举不再为读名字克隆全部工具 parameters。`tests/view-cache.spec.ts` 的 toolNames 组断言名单与 schemas 逐名一致（含 ptc 模式 run_code 出现/消失）。
- **system-prompt 半边（偏差：按契约不可行，未实现）**：`assemble` 每步为每个工具 `structuredClone(parameters)` 无法跨步复用——`tests/system-prompt.spec.ts` 的「assembles snapshots so one-step mutations do not leak into future assemblies」把「消费方可就地变更 assembly 的工具参数（含深层 properties）且不得泄漏到未来 assembly」钉成了权威契约，复用缓存必然破坏它。曾实现 WeakMap 冻结克隆缓存，被该既有测试拒绝后回退（原地保留契约注释）。原审查报告的「buildRequest 每循环重复 assemble」前提也不成立（assembly 在步骤内已复用）。验收第 1、4 条按契约口径作罢；第 2、3 条由 toolNames 一致性测试覆盖。剩余优化方向（若未来需要）：改「one-step 变更」契约为「返回替换式 assembly」，属上游契约变更，超出本单 scope。
- 全绿：tools 408 + system-prompt 490，仓库级 typecheck 通过。
