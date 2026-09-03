# 设置页厂商卡片内加模型可见性开关

**Status:** done

**Blocked by:** 02

**构建内容：** 「设置→模型」页的厂商卡片内，为每个模型行新增可见性开关（checkbox）。默认可见；勾选/取消写入该模型条目的 `visible` 并经 settings 持久化，重新加载后回读勾选状态一致。只读部署（writable=false）时开关禁用。

**验收标准：**

- [ ] 厂商卡片模型列表出现可见性开关，默认选中（可见）

- [ ] 取消勾选写入 `visible=false` 并经 settings 持久化；重新加载回读状态一致

- [ ] 只读部署或 pending 写时开关禁用

- [ ] 新增文案经类型化 locale 字典（zh/en 对齐）

- [ ] 对应组件 spec 通过；`pnpm run test:gui` 绿

## 评论

- 2026-09-03 done。DeepSeekModelsEditor（deepseek官方卡）与 ModelListEditor（pi-ai/自定义卡）两卡模型行各加可见性 checkbox；勾选删除 `visible` 字段、取消写 `visible:false`，经现有 settings mutate 持久化（Schemastery 保留额外字段）。locale `modelVisible` en/zh 对齐。审查三轮通过（终审无硬性违规；0 缺失 + 2 非阻塞残留）。
