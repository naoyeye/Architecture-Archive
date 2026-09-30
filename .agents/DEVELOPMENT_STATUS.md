# Development Status

## 2026-09-30 | Phase: 项目目录更名 | Status: 完成

- **目标**: 将已支持多个建筑网站的项目目录从 Dezeen 更名为 Architecture-Archive，并保持本地服务路径配置有效。
- **证据**: 仓库内容未写死当前目录绝对路径；已安装的 LaunchAgent plist 包含旧目录的 Python、app.py 和工作目录路径，但服务当前未加载。
- **变更**: 项目目录更名为 Architecture-Archive；同步更新已安装 LaunchAgent 的 Python、app.py 和工作目录绝对路径。不修改代码中作为站点名称出现的 Dezeen。
- **验证**: 新目录保留 Git 元数据和原工作区状态，旧目录已不存在；LaunchAgent plist 语法有效且不再引用旧路径，服务保持未加载状态。未运行代码测试。
- **下一步**: 后续从新目录继续开发；需要启用后台服务时再按 server/README.md 安装或加载 LaunchAgent。

## 2026-09-30 | Phase: Git 忽略规则整理 | Status: 完成

- **目标**: 在仓库初始化后按项目实际目录职责整理 .gitignore，隔离用户归档、依赖、虚拟环境、密钥和本地生成文件。
- **证据**: 当前规则已忽略 projects/、node_modules/、server/.venv/、server/.env 和系统缓存，但同时误忽略需要共享的 .agents/，且 Python、测试和编辑器临时产物覆盖不完整。
- **变更**: .gitignore 按用户归档、Node、Python、本地密钥、运行时、编辑器和系统文件分组；不再忽略 .agents/，并显式保留 .env.example。Tampermonkey 构建产物继续纳入版本控制候选。
- **验证**: git check-ignore 确认 projects/、node_modules/、server/.venv/、server/__pycache__/、server/.env 和系统元数据被忽略；git status 确认 .agents/、server/.env.example、源码、测试和 tampermonkey/architecture-archive.user.js 仍可跟踪。
- **下一步**: 首次提交前复核 git status 中的源码与配置文件；本任务不执行 add、commit 或 push。

## 2026-09-28 | Phase: ArchDaily 广告占位误判修复 | Status: 完成

- **目标**: 广告和 Products 推荐模块不阻塞正文与项目字段采集。
- **证据**: 公开示例页 Products 骨架屏复用了 afd-specs__item，缺少 key/value，触发项目信息未完整加载；js-publift 侧栏带 loading-animation，但不属于正文。
- **变更**: tampermonkey/src/archdaily/capture.js 定向排除 js-publift、related-products 和没有字段标记的 Products 骨架屏；正文等待与提取不纳入广告，不修改现场 DOM。真实字段缺失继续报错并显示字段名。版本升至 2026-09-28.2，重新构建并同步 server/README.md。
- **验证**: 59 项 JS、40 项 Python 测试和 npm run check 通过。新增持续加载广告、加载前后产品模块、真实字段与骨架屏并存回归；公开示例页 16 个 specs 容器中精确排除 1 个推广项，保留 15 个有效字段。未进行真实下载/翻译验收。
- **下一步**: 更新 Tampermonkey 至 2026-09-28.2 并刷新页面重试；后端未变，无需因本次修复重启已支持 ArchDaily 的服务。

## 2026-09-28 | Phase: ArchDaily 适配与回归完成 | Status: 完成

- **目标**: 支持 ArchDaily 项目正文、完整图库大图、图注和信息表。
- **计划**: .agents/plan-2026-09-28-archdaily.md。
- **证据**: 示例项目图库含 58 张，正文异步加载；图库查看器提供绑定项目的 slideshow URL 与图注。
- **变更**: 新增 tampermonkey/src/archdaily/capture.js，等待正文原生异步加载，以 #gallery-thumbs 为完整清单，优先 data-largesrc，必要时通过同项目查看器 data-images 补齐 slideshow 大图和图注；校验媒体 ID、链接集合、数量与类型，支持照片和图纸，保留正文特有图注及项目表格。接入控件、取消、单请求 20 秒/整体 60 秒超时及导航检查；后端新增 URL、CORS、JSON 来源、图片白名单与下载 Referer。版本 2026-09-28.1，已构建产物并更新 README.md、server/README.md、AGENTS.md。
- **验证**: 57 项 JS 测试、40 项 Python 测试及 npm run check 通过；覆盖合成 58 张图片（含 17 张图纸）、正文等待、重复/缺失/跨项目拒绝、取消/超时/导航、控件 JSON 上传、JS → Python Markdown、HTTP/CORS、mock 下载及归档。模型与翻译均 mock。
- **公开页面检查**: 示例项目 1027911 的 58 个图库链接均与查看器大图和媒体 ID 对应；用户指定楼层图解析为 slideshow URL，图注 Plan - 1st floor 1.50，抽样 HEAD 返回 200/image/jpeg。浏览器可见正文原生加载完成；初始只有首段的公开 HTML 被解析器拒绝。
- **边界**: 未做真实浏览器完整下载/翻译端到端验收，未重启服务或修改 projects/。slideshow 是站点展示大图，不承诺摄影原始文件；独立图片页、列表页和未知媒体暂不支持。
- **下一步**: 按 server/README.md 重启已有服务，更新 Tampermonkey 至 2026-09-28.1，刷新 ArchDaily 项目主页后验收。

## 2026-09-20 | Phase: Archello 主故事与供应商占位修复 | Status: 完成

- **目标**: 修复 Jackson Hole House 因额外供应商 story 空占位而无法抓取的问题。
- **证据**: 公开 DOM 中 stories-grid 含主故事 82368 和两个空占位 106865/135773；项目头图明确指向 82368，Stories By 列出主作者及供应商。
- **变更**: tampermonkey/src/archello/capture.js 使用项目头图的同源附件链接选择唯一主故事，不依赖故事顺序或首个非空内容；其他参与方不纳入正文/相册并通过 warnings 提示。没有头图关联时保留单故事兜底；主故事缺失、身份冲突及分页未完整加载仍拒绝，署名展开不得切换故事。版本更新为 2026-09-20.1 并构建产物；同步 README.md、server/README.md。
- **验证**: 45 项 JS 测试、34 项 Python 测试、npm run check 通过。新增空占位与已加载供应商隔离、供应商排在主故事前、无头图/跨域/重复 ID/关联冲突/空主故事、署名展开变化与跨语言渲染回归。实际公开 DOM 选择逻辑定位到 McLean Quinlan 的 82368 主故事，抽样查看器显示 1 of 16 并提供兼容现有白名单的 S3 原图。
- **边界**: 当前归档项目头图关联的主故事，不合并其他参与方独立故事。未执行完整浏览器下载或付费翻译；未重启用户服务，未修改 projects/。
- **下一步**: 更新 Tampermonkey 至 2026-09-20.1 并刷新原页面重试；本次无后端协议变更，不需要因本次修复重启服务。

## 2026-09-16 | Phase: Archello 支持与新增站点技能 | Status: 完成

- **目标**: 支持 Archello project 的正文、完整照片/图纸、描述与项目信息；沉淀项目级新增站点技能。
- **变更**: 新增 tampermonkey/src/archello/capture.js，按 canonical/story 关系采集完整相册和查看器原图，保留正文图注并展开 Credits/材料表；接入控件、取消、单请求 20 秒/整体 5 分钟超时及导航检查。后端扩展来源分流、CORS、schema version 1 来源与原图校验、下载 Referer；版本升级为 2026-09-16.3 并重新构建。同步 README.md、server/README.md、AGENTS.md。
- **技能**: 新增 .agents/skills/archive-add-site/SKILL.md 及 agents/openai.yaml，记录页面证据、项目隔离、原图和完整性校验、协议/路由/构建接入及验证边界；技能结构校验通过。
- **验证**: 42 项 JS 测试、34 项 Python 测试和 npm run check 通过。包含合成 32 张照片 + 1 张图纸、署名补齐、图注、跨语言渲染、CORS、mock 归档、原图白名单、取消/超时/跨项目拒绝及真实构建脚本 JSON 上传回归，保留既有 Dezeen/Dwell 测试。
- **公开页面检查**: Virginia Water 主页面显示 24 张相册预览，独立相册含 32 张照片和 1 张图纸；查看器提供明确 S3 原图，署名展开后为 7 项。抽样原图 HEAD 返回 200/image/jpeg。未执行全部原图下载或真实翻译，不将公开 DOM 检查和合成回归称为浏览器端到端验收。
- **边界**: 当前要求单个已完整加载的 story；多 story、未完整加载的分页、视频等未知媒体或无法校验的图片会明确失败。命令行读取项目页可能遇到 403，采集使用浏览器同源已有权限；不调用登录下载/CAPTCHA 接口，不绕过访问控制。
- **下一步**: 按 server/README.md 重启已有服务，从 /script.user.js 更新 Tampermonkey 后刷新 Archello 项目页验收；未自动重启服务、写入 projects/ 或调用付费模型。

## 2026-09-16 11:52 | Phase: Dezeen 阅读布局覆盖 | Status: 完成

- **目标**: 覆盖 Dezeen 文章页在 768px 以上的正文段落宽度、头图内联 max-width，将 `.page-columns` 居中限制为 70vw，并收成单列。
- **变更**: tampermonkey/src/widget.css, tampermonkey/metadata.txt, tampermonkey/architecture-archive.user.js, server/test_userscript.cjs
- **验证**: 33 项 JS 测试通过。Bather's Cabin 文章页上 `.page-columns` 为单列 70vw，左栏、头图和段落宽度与之一致，右侧栏不再占位。
- **问题**: 头图 HTML 内联 `max-width: 852px` 仍在，但被 `!important` 覆盖。
- **下一步**: 更新 Tampermonkey 脚本后刷新 Dezeen 文章页验收。

## 2026-09-10 | Phase: Article 支持与脚本模块化 | Status: 完成

- **目标**: 支持 Dwell article，拆分 Tampermonkey 源码并建立构建流程、项目规范和开发历史。
- **变更**: 新增 tampermonkey/src 中的界面、CSS、Dwell 公共解析、home、story 和 capture 模块；引入 esbuild 构建和 watch，安装头独立维护，版本升级为 2026-09-10.5，产物迁移至 tampermonkey/architecture-archive.user.js。后端接受 article URL 并从新路径提供脚本。新增 README.md、AGENTS.md，更新 server/README.md 和测试。
- **验证**: 32 项 JS 测试、28 项 Python 测试、构建和语法检查通过。测试编译实际模块并覆盖安装头与启动、home 分页与取消、article 图注和跨语言渲染。示例 article 的公开 HTML 去除全部 class 后，仍解析出 16 张原图，保留含未转义 HTML 引号的完整图注。
- **问题**: article 采用 stories 及 dwell-photo 标记，不能复用 home 集合结构。沿用 schema version 1，正文和 Photos 分组输出，不恢复原文图文穿插位置；未执行付费登录态、真实下载和翻译的端到端验收。
- **下一步**: 升级时先构建，重启已有服务以生效新路径和 article 路由，更新 Tampermonkey 脚本并刷新网页后进行浏览器验收。

## 2026-09-10 | Phase: 既有能力基线 | Status: 完成

- **目标**: 记录初始化开发历史时已有的项目功能，非逐次提交历史。
- **变更**: 支持 Dezeen 和 Dwell home、原图下载、中英 Markdown（article.zh.md）、项目字段表格；浏览器输出结构化 JSON；支持 View More 分页与缺失图片描述补取。
- **问题**: Dwell 依赖浏览器当前登录权限，不配置或上传账号密码；未知描述不能当作空描述。
- **下一步**: 后续开发按任务持续更新历史。
