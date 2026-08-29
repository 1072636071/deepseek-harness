# LLM 错误规范化共享模块

**Status:** done
**Blocked by:** 无——可立即开始

**构建内容：** 在 dsh-llm 层新建共享的 HTTP 错误规范化模块：状态码 / 配额 / 限流 / 负载过大等 → 稳定错误码的映射收敛为单一来源；llm-deepseek（状态码口径）与 llm-pi-ai（消息正则口径）迁移到同一判定，适配器只保留传输差异。消除两套判定口径已经出现的漂移。对用户可感知：不同 provider 下同类错误（限流、配额、上下文超长）产生一致的稳定错误码，重试/退避行为更可预测。

**验收标准：**

- [x] 两个适配器对同一错误分类产生相同稳定码（跨适配器对比测试）
- [x] 现有重试/退避行为不变（retry 相关测试全绿）
- [x] 错误码映射有单一来源（新增 provider 无需复写分类逻辑，以模板或文档体现）
- [x] 传输特有错误（如 pi-ai 流中断）仍可携带 provider 侧细节（信息不丢失）

## 评论

**实现（2026-08-29）**：dsh-llm 新增 `http-failure.ts` 的 `normalizeHttpFailureCode({status?, detail})` 作为共享分类器（类别顺序钉死：auth(状态) → 配额(细节) → 体积上限 → 限流 → 上下文溢出(细节) → 畸形请求 → 服务端 → 调用方回退；状态保住时状态相等判定，状态文本正则仅在纯文本模式生效）。llm-deepseek `httpErrorCode` 委托共享模块保留 `HTTP_<status>` 回退；llm-pi-ai `classifyPiAiError`（改为导出）委托共享模块后仅保留传输尾部（TIMEOUT / 流中断 / socket 断开 / PI_AI_ERROR）。跨适配器对比表测钉住同码；新增 provider 以模块 JSDoc 为接入模板。

**偏差声明**（审查后修订）：共享序对两侧既有语义的统一边缘——(1) pi-ai 文本模式：体积上限类别先于限流（原为先限流），细节驱动的上下文溢出在原先落 `PI_AI_ERROR` 的输入上改判 `CONTEXT_WINDOW_EXCEEDED`（与 mapStopReason 既有检查对齐）；(2) 配额细节检查先于 413（deepseek 旧序 413 先于配额）——413+配额措辞由 INVALID_REQUEST 改判 QUOTA（两者均不可重试）；(3) **审查修复**：细节驱动的上下文溢出检查限定 text-only 与 400 状态（deepseek 既有语义），5xx 响应体引用上下文措辞保持 `SERVER` 可重试——避免改变重试行为，已补钉测。状态承载适配器的 status-decides 语义不变；跨适配器对比测试置于 llm-deepseek/tests（避免 dsh-llm 反向依赖下游包源码）。

验收：llm 全车道 1089 测试全绿（含 retry 语义套件）；typecheck 通过。Agent Note：`.agents/notes/implemented/simplification/2026-08-29-llm-error-normalization.*`。
