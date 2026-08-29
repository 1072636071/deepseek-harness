# Agent Note：LLM HTTP 失败分类收敛为共享模块

Status: implemented

[English](2026-08-29-llm-error-normalization.md) | 中文

## 问题

两个适配器用两套渐行渐远的规则本分类 provider 失败：llm-deepseek 按 HTTP 状态判定、细节措辞做例外；llm-pi-ai 对被上游展平的消息文本做正则匹配（pi-ai 在上游丢弃原始 Error）。配额、限流、体积上限、上下文溢出虽已共享两个谓词（`isQuotaExceededError` / `isContextWindowExceededError`），但周边的状态逻辑各自复制且顺序分歧——同一个逻辑失败在不同 provider 下可能得到不同稳定码。

## 决策

dsh-llm 的 `normalizeHttpFailureCode({ status?, detail })` 现在是共享类别（AUTH、QUOTA、INVALID_REQUEST、RATE_LIMIT、CONTEXT_WINDOW_EXCEEDED、SERVER）的唯一分类器。顺序是承重契约并被双方套件钉住：状态判 auth，细节判终端配额（压过 429——耗尽不是节流），请求体体积上限（压过上下文措辞——413 是请求侧故障），瞬态限流，细节判上下文溢出，畸形请求，服务端故障，调用方回退。传输层保住了状态就用状态相等判定；"状态即文本"的正则只在纯文本模式生效，provider 措辞里引用的无关数字不会改判已知状态。llm-deepseek 的 `httpErrorCode` 委托共享模块（保留其 `HTTP_<status>` 回退）；pi-ai 的 `classifyPiAiError`（现导出）委托共享模块后只保留自己的传输尾部——超时、流中断措辞、socket 断开与 `PI_AI_ERROR` 兜底。

## 曾考虑的替代方案

**共享 provider 措辞正则表。** 拒绝：表还会再漂移；稳定契约是类别顺序而非措辞清单——provider 的措辞一直在变。

**把 pi-ai 的传输尾部也搬进共享模块。** 拒绝：中断/超时措辞是 pi-ai 的展平伪影，不是 provider 中立概念；留在 provider 侧正是"适配器只保留传输差异"的切分。

**统一为细节永远压过状态。** 拒绝：provider 措辞引用无关数字会改判已知状态；双方套件都钉住了"状态决定"。

## 后果

同类失败现在跨 provider 得到相同稳定码，由跨适配器表测钉住（`http-failure.spec.ts` 把等价的状态/响应体与展平文本分别喂给两个适配器并断言同码）。pi-ai 文本模式有两处有意对齐的边缘，已记录在模块注释：体积上限类别现在排在限流之前；细节驱动的上下文溢出在 pi-ai 原先落入 `PI_AI_ERROR` 的位置被识别。重试/退避行为不变——每个类别的可重试性保持原样，llm 全车道 1089 测试全绿。
