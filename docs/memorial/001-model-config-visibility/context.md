# 001-model-config-visibility

状态：已完成

## 诉求

设计聚焦「尽可能小改动代码」，三个点：
1. 会话选模型处加一个「模型配置」按钮，可直接跳转到配置模型的界面。
2. 配置模型时，可为每个模型配置「可见性」。
3. 会话选模型处改成两列：左列厂商，右列模型。

## 追问记录

### 2026-09-02 事实调研（未引用外部，直接读源码）
- 会话选模型入口 = `packages/client/ui-model-selection/src/client/ModelSelect.tsx`：单列下拉，root 菜单分 `model`/`effort` 两个 pane。`pane === 'model'` 时按 `state.groups`（即厂商分组）渲染为多个 `<section role=group>`，标题是厂商名 `group.name`，模型平铺其下。**当前非两列**。
- 模型数据模型 = `packages/api/session-controller/src/types.ts#L117-L122`：`ModelCatalogModel { id, name, description?, reasoning? }`。**无「可见性」字段**。
- 厂商分组 = `ModelProviderGroup { id, name, models }`。catalog 构建见 `catalog.ts#buildModelCatalog`：遍历 `ctx.llm.listProviders()`，逐 provider `listModels()`，失败进 `failures`，空组被过滤。
- 模型配置界面 = `packages/client/ui-settings-models/`：仅**厂商级**配置（`listConfigurableProviders` + settings profile + credential，见 `store.ts#joinProviderDirectory`）。**无模型级可见性配置**。
- 会话选模型与配置界面**当前无跳转入口**；ModelSelect 无「配置」按钮，root pane 只有 Model/Effort 两行。
- `ui-workspace/navigation.ts` 仅提供 workspace/session 导航，**无「打开设置→模型」路由跳转能力**。

### 决策问答
- Q1 可见性存储层 → **A Host settings**（非 local，非占位）。
- Q2 可见性语义 → **A 纯 boolean**（hidden/visible，非三态）。
- Q3 配置入口 → **A 厂商卡片内加模型子列表 + checkbox**（复用现有 settings 基础设施）。
- Q4 两列交互 → **A 左列选厂商 → 右列联动显模型**（右幕式）。
- Q5 过滤位置 + 跳转 → **A2 client 过滤**；跳转需**新注入回调**（ui-workspace 现无设置路由跳转）。

## 决策汇总

- **D1 [可见性存储]**：Host settings 持久化（settings.yaml/settings mirror），而非 localStorage 或占位。
- **D2 [可见性语义]**：纯 boolean（hidden/visible 二选一），不引入 favorite/default。
- **D3 [配置入口]**：在现有「设置→模型」页的厂商卡片内，加模型子列表 + 可见性 checkbox，复用现有 settings store/wire 基础设施。
- **D4 [两列交互]**：左列选厂商 → 右列联动显模型（右幕式），非静态分栏。
- **D5 [过滤位置]**：client 侧过滤 — client 读可见性设置，`ModelSelect` 渲染时裁剪 hidden 模型；不碰 Host。
- **D5b [跳转机制]**：「模型配置」按钮需**新注入回调**（`ui-settings` 端 provide，`ui-model-selection` 端 consume）；`ui-workspace` 现无设置路由跳转。

## 待澄清

## ADR

- [adr/adr-001-model-visibility-host-settings-client-filter.md](adr/adr-001-model-visibility-host-settings-client-filter.md)

## 完成声明

C1 诉求回应：三个诉求点均有对应决策。C2 决策完备：无待定。C3 待澄清为空。C4 调查闭环：源码直读、无挂起工单。C5 ADR 齐全：D1（难逆转 + 被否决的替代 + 未来读者会惊讶）已建 ADR。已按用户指示标记完成。
