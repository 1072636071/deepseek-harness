# 模型可见性数据 seam：profile 模型字段 + 读写通道

**Status:** done

**Blocked by:** 无——可立即开始

**构建内容：** 使"某厂商的某模型是否可见"成为可编程读写的数据。可见性作为该厂商 provider profile 的模型条目字段（缺省视为可见），经现有 settings `mutate`/`describe` 通道写入与读取；未自定义 models 数组的厂商（内置 catalog 模型）无此字段，一律视为可见。客户端新增读取该可见性的通道，供设置页与会话下拉消费。

**验收标准：**

- [ ] 模型条目可携带 `visible` 布尔；缺省时读取视为可见

- [ ] settings `mutate` 写入某模型 `visible=false` 后，`describe` 读回一致；needs 写入前为空时缺省可见

- [ ] 内置 catalog 模型（无 profile models 数组）读取可见性一律为可见，不报错

- [ ] 读取通道通过 client Data-access ladder 提供给设置页与会话下拉，不新增 Host catalog 变更

- [ ] 对应 store/数据层 spec 通过（写入 payload 正确、读回一致、缺省可见）

## 评论

- 2026-09-03 审查后修复：resolver teardown 挂 `ctx.effect` 调 `visibility.dispose()`（消除 mirror 订阅泄漏）；`derive()` 删除冗余 diff 条件，error==null 且 view 未就绪时保持 loading 状态、失败时置 error；补 dispose 退订/文件回读(visible true/false)/error 态测试。

- 作用域说明：「写入 payload 正确」的写路径属于 ui-settings-models 的模型编辑器（PRD D3 配置入口，工单 03），02 仅建读取 seam；03 落地时补写回对拍测试。

- 二轮审查通过（无硬性违规）。PRD #4「提供与会话下拉」的**消费侧**（把 `modelVisibility` hidden 集接进 ModelSelect 过滤 + 过滤组件测试）按用户确认移交工单 04（已更新 04 构建内容与验收）。02 完成范围为：读取 seam + ModelVisibilityDirectory + modelVisibility getter + 读侧测试。置 done。
