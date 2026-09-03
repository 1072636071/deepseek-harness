# 新增 hero 标题 slot（conversation.hero.headline）

**Status:** done

**构建内容：** 宿主为外部插件开放「新会话大标题」的接管能力。用户视角：没有插件占用时界面与今天完全一致（「探索未至之境」）；插件占用后显示占用者文案；插件卸载自动回落，无残留。

**验收标准：**

- [ ] slot 声明为 single / root 作用域，在 conversation 的 slot children 里与 brand.mark 并列注册
- [ ] 空态 hero 的标题文本改为经 renderSlot 输出；fallback 渲染现有 `hero.headline` locale key，包在原样式节点里
- [ ] 不新增任何 locale key；「预览版」badge（兄弟节点）不受影响
- [ ] 既有空态骨架测试的 5 处「探索未至之境」断言原样通过（hero / settling / engaging 各 phase 全绿）
- [ ] 新增行为测试：注册占用者后标题显示占用者文案；释放后回落 `hero.headline`（先例：brand.mark slot 的占用/回落测试）
- [ ] typecheck 与相关行为测试本地通过（不默认跑全量套件，覆盖面对齐证据）

## 评论

（评论与对话历史追加于此，新内容置于最前。）
