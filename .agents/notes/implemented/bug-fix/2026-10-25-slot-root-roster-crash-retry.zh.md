# Agent Note: 重试由标准 source 撤走引发的 slot 崩溃

Status: implemented

[English](2026-10-25-slot-root-roster-crash-retry.md) | 中文

## Problem

Web 客户端热替换 Client 插件 entry 时，先拆掉旧 fiber，再导入替代者。`ui-workspace` 这类 provider 在拆卸期间释放自己的 `ctx.slots.provideRoot()` 贡献，于是 `SlotRegistry.rebuildRootBinding()` 在这一小段时间里发布的根级绑定缺少它的座位，而消费方仍在渲染。读取被撤走座位的消费方（`useWorkspaces`）拿到 `undefined` 并抛错；逐 entry 边界隔离这次崩溃并上报，使该 entry 在其注册生命周期余下时间内被 abdicate；Factory 边界的 key 只含名字、definition 版本与 scope 身份，因此保持 failed。provider 重新注册后两者都不会重试，区域一直停在崩溃面直到刷新页面。同一缺陷还有第二条触发链：`ctx.uiSession.provide()` 会重建 Session 作用域绑定，HMR 拆卸时同样撤走这些座位，被 abdicate 的 Session entry 会一直缺席，除非恰好随后发生一次根级发布——而那条轴从不保证这一点。

## Decision

标准 source 名单共用一个 epoch，它就是被隔离崩溃的重试信号。计数器由 `SlotCore` 独占持有：`advanceRosterEpoch()` 在每次发布名单后自增并返回新值，`rosterEpoch()` 读取它。两条轴推进它：`SlotRegistry.rebuildRootBinding()` 对应 `ctx.slots.provideRoot()` 贡献；`SlotRegistry.installScope()` 在已安装的 `SlotScopeAdapter.rosterRevision` 变化时推进——`ui-session` 在每次 `ctx.uiSession.provide()` 重建后推进该 revision，订阅挂在该 scope 的安装 effect 里，因此 adapter 被替换或作用域卸载后不再转发。`SlotRegistry` 与任何 adapter 都不保存计数器副本；host 的 `rosterEpoch` observable 读取 core 的值，因此投影过滤与重试信号不会分叉。abdication 记录保存上报时刻的 epoch；`entriesOfSlot()` 仅在该值仍等于 `rosterEpoch()` 时过滤该 entry，因此崩溃之后的下一次发布会把该 entry 重新投影出来。epoch 存在于 `SlotCore` 实例上，绝不放进模块级或全局状态。

`SlotErrorBoundary` 与 `FactoryErrorBoundary` 接收 epoch，并共享同一套复位策略（`retryOnEpochChange`）：epoch 变化时记录新值并清除 `failed`，使重试渲染中的再次崩溃不会在下一轮重新复位。只有失败的边界会复位；每个边界都以相同的元素身份重新渲染，因此健康子树保留局部状态、绝不重新挂载。若上报发生在恢复发布之后，记录携带的仍是更早的 epoch，该 entry 会等到下一次发布——只会延后，不会永久锁死。装配错误仍然抛出——接线错误的 shell 依旧 fail loud，名单撤走则是可重试的运行时崩溃，不是装配故障。

每次名单重建都会逐个记录它撤走的座位，点名消费方渲染所用的 prop（`use<Name>`），并说明在其返回前消费方会崩溃：根级贡献走 `rebuildRootBinding()`，Session 贡献走 `UiSession.rebuildBindings()`。撤走不是加载错误；需要这条诊断，是因为它引发的崩溃原本只能归因到消费方。

## Alternatives considered

**用名单 epoch 作为崩溃边界的 key。** key 变化会让整个边界子树在每次发布时重新挂载，包括健康兄弟节点；恰在 provider 重建时丢失局部状态并闪烁。epoch 属于边界状态，不属于身份。

**自动重试所有崩溃，或取消 abdication。** 永久性的注册方故障会崩溃—重试—再崩溃，无限循环；被清空的 shadowing cell 也永远无法呈现崩溃面。

**保持失败边界直到刷新页面。** 这正是本次缺陷：HMR 拆卸是常规过程，provider 几秒后就回来。

**把缺失的根级座位当作装配错误。** 已声明的座位有严格的缺失 source 检查，但名单整体缺少某个座位时根本没有 source 可查；把暂时撤走当作接线错误，会让整个应用黑屏，而不是隔离一个区域。

**把 epoch 放在模块级或 `globalThis` 单例。** 注册表与 core 的实例在测试和组合中相互独立；共享状态属于它自己的服务实例。

## Consequences

短暂的名单收缩无需刷新即可自愈；永不返回的 source 保留可见崩溃面（`data-slot-error` / `data-factory-error`）、已记录的成因，且不会形成重试循环。重试只跟随名单发布，因此一直缺席的座位不会带来反复渲染；epoch 是共用的，因此复位是粗粒度的——任一条轴上的无关被隔离故障，也会在每次名单发布时重试一次。关闭与 HMR 拆卸现在会记录每个被撤走的座位，这在真实 provider 卸载时是预期噪声。在恢复发布与下一次发布之间上报的崩溃，会晚一次发布才恢复，而不是立即恢复。覆盖落在 `ui-slots` core 的 epoch spec、渲染器 registry host-face spec（根级与作用域两条轴）、`ui-session` 的名单 revision spec，以及真实组合的 `root-roster` / `session-roster` spec（针对 entry、chain 与 Factory 消费方分别撤走并恢复根级与 Session source）。
