# AGENTS.md

本文档对整个项目生效。子目录中的同名文件可覆盖对应范围的规则。

## 会话开始前

1. 阅读本文件、README.md、package.json 及任务相关源码和测试。
2. 读取 `.agents/DEVELOPMENT_STATUS.md` 最新 10 条记录，了解已有进度与遗留问题。
3. 如项目存在 Git 元数据，执行 `git status --short` 区分已有改动和生成文件；当前工作目录可能不是 Git 仓库，不凭空推断分支或提交历史。
4. 以实际代码为准，不覆盖、回滚或清理归属不明的文件。

## 项目背景与必须保持的行为

Architecture Archive 由 Tampermonkey 脚本和本地 Flask 服务组成，支持 Dezeen、Dwell home / article、Archello project 及 ArchDaily 项目页面。

- Dezeen 传页面 HTML；Dwell、Archello、ArchDaily 由浏览器解析为 schema version 1 的结构化 JSON，后端不依赖站点 DOM class。
- ArchDaily 等待正文加载完成，按 #gallery-thumbs 核对全部照片和图纸；大图取 data-largesrc 或同项目图库明确给出的 url_slideshow，不从缩略图猜地址，图注未知时不得标为空。
- 新增归档站点时读取 `.agents/skills/archive-add-site/SKILL.md`；按当前站点实际页面证据接入，不机械复用其他站点的图片规则。
- Archello 原图必须由当前项目 story 的查看器明确提供，验证媒体 ID、相册数量和原图路径；不得从缩略图猜测 S3 URL，也不调用登录下载或 CAPTCHA 接口。
- 不使用前端编译产生的哈希 class；优先当前 URL 对应的结构化关系，再使用语义 DOM。不得混入其他项目或推荐内容。
- Dwell 使用浏览器已有登录态；不得配置、上传或记录账号密码、Cookie、auth、支付资料或整份 INITIAL_STATE。不得绕过访问控制。
- 只下载经过域名、照片 ID 校验的 Dwell original 图片，移除缩放及跟踪参数，不将缩略图当作原图。
- 明确区分 present / empty / missing；未知正文、图注和未完整加载的照片不能静默视为空内容或成功。
- 正文和图片描述保留；Location / Year / Style / Structure、Credits、Details、Tags 写 Markdown 表格，不扩展 meta.json。
- 中文只生成 article.zh.md；不恢复 article.cn.md。原文为 article.md。
- 保留 home 分页、取消、超时、控件样式隔离及 Dezeen 抓取回归行为。
- 模型调用可能收费；测试使用 mock，不为验证擅自发起真实翻译。

## 技术栈与目录职责

- Node.js 20+、npm、package-lock.json；不要引入其他包管理器或私有 registry 依赖。
- esbuild 将 ES modules 和 CSS 打包为单个 IIFE userscript；安装头必须位于第一行起始位置，保留 name、namespace、grant、match 和更新地址。
- tampermonkey/src/index.js：界面与本地服务通信；widget.css：样式。
- tampermonkey/src/dwell/common.js、home.js、story.js、capture.js：公共解析、home、article 和异步采集。
- tampermonkey/metadata.txt：版本和安装头；build.mjs：构建与 watch。
- tampermonkey/architecture-archive.user.js 为构建产物，不手工修改；源码变更后重新构建，避免产物过期。不在项目根目录恢复旧副本。
- tampermonkey/src/archello/capture.js：Archello 项目、完整相册、查看器、署名与材料表采集及取消。
- server/article_payload.py：结构化协议验证和 Markdown 渲染；server/scraper.py：来源分流与 Dezeen HTML 解析；server/app.py：HTTP 接口及任务管理。
- server/test_userscript.cjs 与 server/test_*.py：前后端回归测试；server/fixtures/：脱敏或合成测试输入。
- projects/ 为用户归档数据，不作重构、批量删除或测试写入目标。

## 常用命令与验证

```bash
npm ci
npm run build
npm run dev
npm test
npm run check
cd server
.venv/bin/python -m unittest discover -v
```

后端配置、启动及 launchd 运维以 server/README.md 为准。修改协议需同时验证浏览器解析、后端校验及 Markdown；修改构建需验证安装头、脚本启动和 /script.user.js 路径。不得将合成或公开页面测试称为真实登录态端到端验收。

## 变更与清理原则

- 只处理当前任务，不擅自提交、推送、创建分支或重启用户服务。
- 更改路径、构建和安装方式时同步 README 和测试。
- 调试进程启动时记录其归属；交付前停止本轮启动的 dev/watch/服务及子进程，不终止用户或其他项目的进程。
- 清理仅本轮生成且不属于交付的临时文件；不得删除用户归档、配置、凭据或归属不明的文件。

## 约定

### Plan & Spec

- 所有计划和规格文件放在 `.agents/`，命名为 `{plan|spec}-{YYYY-MM-DD}-{slug}.md`。
- 按具体任务命名，不将个人机器信息写入共享文档。

### DEVELOPMENT_STATUS

- 文件为 `.agents/DEVELOPMENT_STATUS.md`；新会话读取最近 10 条。
- 开始修改前和完成后都更新 phase，同一任务优先更新已有记录，最新记录在前。
- 记录目标、变更、问题、下一步、实际阶段日期及状态（进行中、完成、阻塞、已回滚）。
- 仅记录对功能、架构、协议、依赖、构建、验证和长期维护有用的事实；初始化时将已有能力标为基线，不伪造历史。
- 文件引用使用仓库相对路径；不得记录用户名、个人绝对路径、会话 ID、内部推理、工具调用、授权过程、临时 PID 或缓存路径。
- 只记录可复现的限制或验证缺口；一次性本机细节只在当前对话说明。

### Trace

创建 plan/spec 时保存文件；编码前记录 phase；完成后更新结果和验证；下一会话读取最新状态。Trace 到代码开发完成为止，不追踪提交 PR 或等待 review。
