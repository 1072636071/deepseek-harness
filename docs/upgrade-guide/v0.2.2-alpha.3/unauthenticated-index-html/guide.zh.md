---
kind: upgrade-guide
description: "未认证的浏览器导航请求现在收到 HTML 登录引导页，不再收到纯文本 401 单行内容。"
---

# 未认证的索引响应对浏览器改为 HTML

[English](guide.md) | 中文

## 变更

没有有效浏览器 cookie 或启动 token 交换的索引请求，此前对所有调用方都返回 `401`、`content-type: text/plain; charset=utf-8` 与单行内容 `dsh web authentication required; reopen the URL printed by dsh web.`。

当请求的 `Accept` 头包含 `text/html`（浏览器导航即如此）时，现在返回 `401`、`content-type: text/html; charset=utf-8`、`content-security-policy: default-src 'none'`，正文是说明「请打开 `dsh web` 启动时打印的 URL」的页面，并附一条指向 `./` 的 `Retry` 链接。不接受 HTML 的请求（包括 `Accept: text/plain` 与 `Accept: */*`）保持原有的纯文本正文、状态码与 `cache-control: no-store`。

受影响的是未登录就请求索引的运维人员与脚本：浏览器现在看到引导页而不是一行无样式文本；任何对 `text/html` 请求断言响应 content type 的脚本，需要接受两种结果。

## 迁移

1. 使用 `dsh web` 启动时打印的 URL，每个浏览器打开一次以换取 cookie。`token` 查询参数属于当前进程：上一次启动留下的 URL 会得到 `401`。
2. 脚本请求索引且需要纯文本报告时，发送 `Accept: text/plain`，得到的正文仍为 `dsh web authentication required; reopen the URL printed by dsh web.`。
3. 迁移确认：不带 cookie 以 `Accept: text/html` 请求 `GET /`，应返回 `401`、`content-type: text/html; charset=utf-8`，正文包含 `DSH Web requires the URL printed by <code>dsh web</code>.`；同一请求改用 `Accept: text/plain`，仍返回单行报告。
