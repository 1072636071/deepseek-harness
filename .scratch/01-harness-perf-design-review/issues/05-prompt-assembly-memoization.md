# system-prompt 装配记忆化 + PTC 改用 view keys

**Status:** ready-for-agent
**Blocked by:** 无——可立即开始

**构建内容：** system-prompt 的 `assemble()` 按 registry generation 记忆化——工具 schema 只在 tools/change 时变，不再每个 agent 步骤（含每次 buildRequest 循环）都 `structuredClone` 全部工具 parameters；PTC 执行 run_code 前取工具名列表改走 `view().visible.keys()`，不再为读 name 而对每个工具 schema 做全量克隆。对用户可感知：每步请求构建延迟下降；提示词内容与工具变更生效时机完全不变。

**验收标准：**

- [ ] 同 generation 下重复 assemble 不重复克隆且内容相同（计数断言 + 对比测试）
- [ ] 工具注册/移除后下一次 assemble 立即反映变更（测试覆盖）
- [ ] PTC 收到的工具名列表与旧实现一致（对比测试）
- [ ] agent 循环每步 buildRequest 的装配开销不再随工具数量线性重复（微基准）

## 评论
