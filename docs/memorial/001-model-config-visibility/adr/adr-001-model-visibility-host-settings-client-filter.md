# ADR-001: 模型可见性存 Host settings，client 侧过滤

状态：已接受

## 背景

会话选模型处新增「模型配置」按钮跳转到配置界面；配置界面支持为每个模型设置可见性。当前 `ui-settings-models` 只配置厂商级（API key/profile），`ModelCatalogModel` 无可见性字段，会话选模型为单列分组列表。

## 决策

1. **可见性存储**：Host settings 持久化（settings.yaml/settings mirror），而非 localStorage 或 UI 占位。
2. **可见性语义**：纯 boolean（hidden/visible），不引入 favorite/default 三态。
3. **配置入口**：在现有「设置→模型」页的厂商卡片内加模型子列表 + 可见性 checkbox，复用现有 settings store/wire 基础设施。
4. **过滤位置**：client 侧过滤 —— client 读可见性设置，会话选模型渲染时裁剪 hidden 模型；不碰 Host `buildModelCatalog`。
5. **跳转机制**：「模型配置」按钮通过新注入回调（`ui-settings` provide / `ui-model-selection` consume）实现；`ui-workspace` 现无设置路由跳转。

## 为何选 Host settings + client 过滤

- **持久化**：settings 为稳定健壮的持久层，localStorage 每浏览端各自为政、不跨端共享，无法满足"每个模型的可见性"的全局配置意图。

- **client 过滤**：避免改 `buildModelCatalog`（Host 服务端），把改动收敛在两个 client 包内，符合"尽量小改代码"。Host 侧保留原始模型目录，便于路由可用性判断与故障诊断。

## 替代方案（被否决）

- **localStorage + 独立弹窗**：改动最小但非持久、不跨端共享，可见性意图落空。

- **Host 过滤（改 buildModelCatalog）**：从源头剔除 hidden 模型，语义上"隐藏"与"路由不可用/加载失败"混淆，且触及服务端，改动面更大。

- **UI 占位先落地**：只搭框架不实现功能，不满足需求。
