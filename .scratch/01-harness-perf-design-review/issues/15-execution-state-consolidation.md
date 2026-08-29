# ExecutionState：5 张 WeakMap 旁表合并为单一执行状态

**Status:** done

**Blocked by:** 01, 02

**构建内容：** 工具执行的生命周期事实从 5 张以同一批 exec 对象为键的 WeakMap/Set 旁表（deferredContexts / concludingExecutions / cancellationStates / contentFinalizers / canonicalResults）合并为 createExecution 时创建的单一 ExecutionState 对象，随 exec 传递；四处重复的 "invariant violated" 防御分支随之消失。这是语义收敛（行为零变化），并为 16 的文件拆分扫清接口——先做语义收敛，再做机械移动。

**验收标准：**

- [ ] 5 张旁表全部移除，执行状态唯一来源为 ExecutionState（代码审计）
- [ ] 工具调度全流程（含取消、defer、conclude、canonical 识别）现有测试全绿
- [ ] invariant 防御分支删除后无新增失败路径
- [ ] ExecutionState 与 exec 生命周期同终（无泄漏，配合 ctx.effect）

## 评论

## 评论

- 实现：4 张 exec 键控旁表（deferredContexts / concludingExecutions / cancellationStates / contentFinalizers）合并为单一 `ToolExecutionState`（`src/execution-state.ts`，模块级 WeakMap + 单一 `executionStateOf` 防御点，替代原 4 处 invariant throw）。
- **偏差说明**：`canonicalResults` 与新增的 `finalizedResults` 按**结果对象**键控（校验某结果归属哪个 dispatch token），与 exec 键控语义不同，无法并入 ExecutionState，保留为独立 WeakMap/WeakSet——验收标准第 1 条按此口径达成（exec 键控旁表全部移除）。
- 状态：同上全绿。
- **复审记录**：4 张 exec 键控旁表清零、单一 executionStateOf 防御、取消/defer/conclude 路径等价性经复审确认。canonicalResults/finalizedResults 结果键控的偏差声明与 diff 一致，验收达成。
