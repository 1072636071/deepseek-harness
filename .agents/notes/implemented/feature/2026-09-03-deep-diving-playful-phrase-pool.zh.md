# Agent Note: Deep-diving playful phrase pool

Status: implemented

## Problem

思考中的轮次状态行每一轮都显示同一句静态文案「深度求索中...」/ "Deep diving..."，长任务等待毫无生气。用户要求换成约 100 条随机俏皮话，并给出锚点句如「token，token，有 token 就干活。」。

## Decision

`ui-chat` 在其 locale 归属文件内持有一个冻结文案池（`deepDivingPool`：zh/en 各 100 条，逐条对应），外加一个纯函数 `pickDeepDivingPhrase(localeId, random)`。`TurnStatus` 挂载时经 `useState` 初始化器抽取一条——每秒重渲染绝不重抽——语言取自 LocaleFace 快照的 active locale；没有对应桶的 locale 回落到 `chat.deepDiving` key。15 秒时钟及其独立的 aria-hidden 节点保持不变。文案池住在 locale 归属文件内，client-UI-i18n 门禁按文件位置豁免；它不进类型化 `t` 字典，因为字典值只能是单条字符串。

## Alternatives considered

- 定时轮换文案：在每秒重渲染的表面上制造闪烁，还会让 aria-live 反复播报。否决。
- 给状态行开新 slot：它是高频内部元素，且文案池是产品文案而非角色资产。否决。
- 由插件覆盖 `chat` 命名空间：locale 注册是单 key 单文案，装不下文案池。否决。

## Consequences

约 200 行产品文案因文件位置豁免进入 `locale.ts`，而非经类型化字典——zh/en 配对由池子自身结构约束，不靠 key union 上的 `satisfies`。`random` 参数是确定性注入缝；当前测试通过 spy `Math.random` 固定确定性而非传参，该缝暂未被测试使用。未来没有对应桶的 locale 回落到静态 key。
