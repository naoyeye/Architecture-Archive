---
name: archive-add-site
description: 为 Architecture Archive 新增建筑或设计网站的文章/项目抓取适配，覆盖浏览器采集、原图完整性、结构化协议、后端路由与回归验证。在本项目要求支持新网站或新页面类型时使用；不用于单次运行已有抓取、普通网页下载或绕过登录/付费限制。
---

# 新增归档站点

在 Architecture Archive 项目中为用户指定的网站建立可验证的适配器，保留现有站点行为和归档格式。以当前仓库为准，不复制固定页面选择器或猜测图片 CDN。

## 定位与页面证据

读取仓库根目录 `AGENTS.md`、`README.md`、`package.json`、`server/README.md`、最近开发状态，以及本次相关源码/测试。遵循项目的 plan/phase 记录约定；无 Git 元数据时不假设分支，也不自动提交、推送或重启服务。

从用户给出的实际页面确认：
- 当前 URL、canonical、项目/文章 ID、所属图片关系；页面正文是否完整，是否含多个故事、分页、懒加载或付费内容。
- 正文、图注、署名、项目信息的语义边界，以及广告、推荐项目和产品推广的排除边界。
- 原图来源、完整相册数量及可核对的图片身份；thumbnail/srcset 最大项未必是原图。

优先关联当前 URL 的结构化数据，再使用语义 DOM。不得依赖编译哈希 class。命令行返回 403 而浏览器能访问时，可检查浏览器公开 DOM，不能猜测其内容、读取凭据或把登录下载/CAPTCHA 接口作为后门。无法确认结构或完整性时明确说明缺口，不以成功空内容掩盖。

测试输入使用合成或脱敏 DOM；不保存完整登录态脚本、Cookie、auth、账号或支付数据。提取器只输出归档所需字段。

## 选择接入方式

先检查现有职责，按需要修改，不做无关重构：
- `tampermonkey/src/index.js`：站点识别、URL 规范化、采集入口、取消分发、界面；站点布局覆盖和额外 observer 不能落到其他网站。
- `tampermonkey/src/<site>/`：独立解析与异步采集；现有 Dwell、Archello 可参考模式，但字段/URL 规则必须来自新站点证据。
- `server/scraper.py`：精确 HTTPS 域名/路径白名单与来源分流。
- `server/article_payload.py`：结构化 JSON 校验和 Markdown；不放站点 DOM 选择器。
- `server/app.py`：CORS、请求校验、任务分发；无效数据应在启动任务前被拒绝。
- `server/downloader.py`：按已验证来源设置必要的非敏感下载请求头，拒绝把 HTML 错误页保存成图片。
- `tampermonkey/metadata.txt`：匹配规则与版本；保留 name、namespace、grant、更新和安装地址。

新站点优先复用 schema version 1，不为来源差异无端升级协议。只有实际需求无法表达时才设计兼容迁移。现有协议包含 `source`、规范 `url`、`title/building/studio`、`body`、`sections`、`expected_photo_count`、`photos`、`warnings`。

`body` 和 `photos[].caption` 使用 `{status, value, format, source}`，区分 present / empty / missing。来源明确为空才标 empty；加载失败、未知字段、找不到容器不能强行变为空。按新来源验证图片域名、路径、身份、去重和数量，不放宽 Dwell 的 original/照片 ID 规则去适应其他站点。

## 完整性与请求约束

相册列表、查看器、原图必须属于当前项目。对多 story、分页、视频等未知结构，应正确处理或显式拒绝，不只截取第一部分。若更完整的署名/字段有页面提供的展开链接，使用该同项目链接并检查展开结果；不要猜测隐藏接口。

异步补取限定必要的同源页面、已有浏览器权限和已观察的链接。提供单次及整体时限、取消、导航变化检查；403、重定向、内容格式变化、数量不匹配和失败请求不得变成成功结果。收集完整以后才上传本地任务，不上传整个状态树或认证头。

原文为 `article.md`，中文仅 `article.zh.md`，图片位于 `images/`。正文与图注保留；Location/Year/Style/Structure、Credits、Details、Tags 等写已有 Markdown 表格，不扩展 `meta.json`。若图文位置不能保留，文档说明分组输出方式。站点特有字段和未支持类型应有明确边界。

## 验证与交付

围绕实际风险验证，而不是只匹配源码字符串：
- 当前项目与推荐内容隔离、过期 canonical/状态、正文及图注缺失与确认空值。
- 懒加载/分页的完整集合、重复图片、原图/缩略图、跨域/跨项目/错误 ID、403 和跳转。
- 异步取消、超时及切换页面；控件不能上传半成品，也不能误走 HTML 通道。
- 浏览器输出传入真实 Python 校验和 Markdown 渲染；HTTP/CORS、构建安装头及 `/script.user.js`。
- 既有 Dezeen、Dwell 和其他已支持来源的回归。

通常执行 `npm test`、`npm run check`，以及 `cd server && .venv/bin/python -m unittest discover -v`。根据环境授权运行；翻译与模型调用一律 mock，真实付费验收另获用户授权。测试使用临时目录，不能写入 `projects/`。

源码变更后重新构建 `tampermonkey/architecture-archive.user.js`，不手改产物或恢复根目录旧副本。同步 README、站点边界和开发状态；说明服务重启、脚本更新、网页刷新这三步，不擅自操作用户服务。

交付时区分合成回归、真实公开 DOM 检查、抽样原图请求和完整浏览器端到端归档/翻译。未经执行的层级不得标已验收。清理本轮临时资源与自建进程，不清理用户数据或其他任务资源。
