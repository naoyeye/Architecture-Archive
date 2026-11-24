# Development Status

## 2026-11-24 | Phase: Dezeen 文章共享图集弹窗修复 | Status: 完成

- **目标**: 修复 Open Byre 页面误报 `Dezeen gallery lightbox is not loaded`，保留当前文章完整图片及图注。
- **证据**: 页面将 `#article-lightbox` 放在文章节点外；21 张图库缩略图与头图、正文中的另外 3 张图片共用含 24 张图片的弹窗。现有查找仅限文章节点，且完整性检查假设单个图库覆盖整个弹窗。
- **变更**: `server/scraper.py` 仅按当前文章图库显式关联从完整文档查找弹窗；共享 `#article-lightbox` 的每张图片必须出现在待归档头图或清洗、展开后的正文中，独立图库继续逐个严格核对。新增 `server/fixtures/dezeen-shared-lightbox.html` 和 4 项回归，覆盖外置共享弹窗、多图集与克隆、缺失或不匹配图片、推荐内容无法填补缺图；同步 server/README.md。
- **验证**: 57 项 Python、72 项 JS 测试、构建、脚本语法和 git diff --check 通过。Open Byre 公开 HTML 解析得到 Open Byre / ConForm、24 张唯一图片，与共享弹窗图片集合完全相等；正文 25 个图片引用对应 23 张图片且全部指向下载清单，保留 Ground floor plan、First floor plan 图注与末段摄影署名。Minimalist House 公开页面继续解析为 44 张图片及 4 条 Plan/Section 图注。
- **服务更新**: 确认已有任务均已结束后更新现有常驻后端；新进程健康检查正常，端口只有一个监听进程。用户脚本未修改，无需重新安装。
- **边界**: 使用公开 HTML 与合成回归验证，未执行真实完整下载或付费模型调用，未修改 projects/。
- **下一步**: 在 Open Byre 页面重新抓取。

## 2026-11-07 | Phase: Dezeen 改版、归档修复与服务更新 | Status: 完成

- **目标**: 兼容新版 Dezeen 正文、头图和完整图集，移除顶部广告、Recommended stories 与订阅栏，保留单独查看讨论区。
- **证据**: Minimalist House 示例页正文为 `.single-content__content`，头图为 `.single-hero`；`.gallery-slider__slider` 有 43 张照片/图纸，关联弹窗提供大图与图注，正文和弹窗存在重复图片。
- **变更**: `server/scraper.py` 兼容新旧正文及头图，将当前图集与显式关联弹窗逐图匹配、核对完整集合，保留图注和正文图片位置并去重下载，排除推荐、分享与弹窗控制文字；延续 Dezeen 原有尺寸后缀归一化策略。`tampermonkey/src/widget.css` 限定 Dezeen 隐藏顶部广告、Recommended stories 和 `.dcm-bar`，保留讨论区独立链接。版本更新为 2026-11-07.1，重建产物并同步 README.md、server/README.md。
- **计划**: `.agents/plan-2026-11-07-dezeen-redesign.md`。
- **验证**: 72 项 JS、53 项 Python 测试、构建、脚本语法与 git diff --check 通过；覆盖新旧 DOM、重复图片、图注、缺失正文/图片/弹窗、图库集合不完整、其他项目隔离、讨论区 iframe 即时/延迟加载以及构建脚本 HTML 上传至 Python 渲染。公开示例解析出 44 张唯一图片（43 张图集加头图），保留 4 张图纸的 Plan/Section 图注；抽样头图、竖图与末图 HEAD 均为 200/image/jpeg。公开页面静态副本加载实际构建脚本后，浏览器确认三处推广 display 为 none、高度为零，正文、头图和讨论区保留。
- **初次适配边界**: 源码适配阶段只核对公开页面、静态预览及合成回归，未执行真实完整图片下载或付费翻译；后续指定归档的实际修复与服务更新见下文。
- **后续问题**: 更新浏览器脚本但未重启后端时，常驻进程仍保留旧解析器，Minimalist House 只归档头图且中英文正文为空；旧解析得到的空正文还导致 AI 将完整标题误判为项目名称。新进程读取当前源码仍解析出 44 张图。
- **归档修复**: 定向修复 `projects/Minimalist House in Japan by FORM-Kouichi Kimura is “reduced to the essentials” - 2026-10-29-minimalist-house-form-kouichi-kimura/`，追加下载缺少的 43 张图片，原头图与当前来源逐字节一致并保留；恢复完整英文及中文正文、图纸图注和图片位置，修正既有 meta.json 中的 building、studio 与 image_count，不扩展字段、不更名目录。
- **修复验证**: 44 个 JPEG 全部读取尺寸成功，最小宽度 2364、最小高度 1329；中英文各有 47 个图片引用，对应 43 张唯一正文/图库图片，引用顺序完全一致、文件均存在，另有头图 01.jpg；图片合计约 28.8 MB。未调用外部付费模型，未改动其他归档。已有两个后台任务均已结束。
- **服务更新**: 已重启现有 LaunchAgent 后端，服务健康检查正常，新的进程加载当前源码并提供 2026-11-07.1 用户脚本。
- **下一步**: 刷新文章页；该归档已修复，无需再次抓取。

## 2026-11-06 | Phase: ArchDaily 厂家字段修复与验证 | Status: 完成

- **目标**: 修复 Anzio Laneway House 因 Manufacturers 字段结构不同而误报项目信息未完整加载。
- **证据**: 公开页面将 5 家厂家放在 `.afd-specs__key` 内的 `.project_spec_manufacturers`，没有 `.afd-specs__value`；现有解析将厂家名称并入字段名并判断值缺失。
- **变更**: `tampermonkey/src/archdaily/capture.js` 兼容明确的厂家值容器，在字段名副本中移除嵌套值，保留全部厂家名称及真实字段缺失校验；不修改页面 DOM。版本升至 2026-11-06.1，重新构建产物并同步 README.md、server/README.md。
- **验证**: 页面实际厂家结构在修复前复现相同报错，修复后通过；68 项 JS、49 项 Python 测试、构建、脚本语法与 git diff --check 通过。新增嵌套厂家、链接厂家、DOM 不变、JS → Python Markdown 表格及缺失名称/值回归。
- **边界**: 未执行真实完整图片下载或翻译；测试使用 mock，不写入 projects/。
- **下一步**: 更新 Tampermonkey 至 2026-11-06.1 并刷新项目页重试；此次无需重启已支持 ArchDaily 的后端。

## 2026-10-16 | Phase: 新文章公制换算与自动补注 | Status: 完成

- **目标**: 补齐近期新增中文文章的英制单位，并让后续归档自动写入公制对照。
- **变更**: 补齐近期 4 篇 article.zh.md 中的 15 处英制长度和面积；新增 server/metric_units.py，在 server/app.py 写入中文文章前补注公制值，支持阿拉伯/中文数字、英尺半、尺寸组合及表格数值，跳过已有对照和 Markdown 链接目标。server/README.md 补充行为说明。
- **验证**: 49 项 Python 测试与 git diff --check 通过；换算器复扫现有 182 篇中文文章，均未产生额外修改。测试使用 mock 翻译及临时目录，未调用真实模型。
- **下一步**: 重启已有后端服务以启用自动换算；无需更新浏览器脚本。

## 2026-10-16 | Phase: Dwell article 图文顺序修复 | Status: 完成

- **目标**: 保留 Dwell article 正文图片的位置，修复 Before / After 标题与图片分离的问题，并定向修复 Casa Yamagoya 的现有中英文归档。
- **证据**: Casa Yamagoya 的 21 张图片均在文末 Photos，厨房 Before 图为 images/03.jpg；story.js 删除 dwell-photo 标记，article_payload.py 将全部图片统一追加至文末。
- **变更**: story.js 保留 figure 照片 ID 引用，common.js 仅在 article 正文清洗时保留引用属性；article_payload.py 按已验证的图片清单输出本地图片及图注，拒绝未知或畸形引用，未出现在正文的照片仍附于 Photos。无引用的旧载荷和其他站点维持原有输出。schema version 1 根字段、meta.json 不变。版本 2026-10-16.2，已构建并更新说明。
- **归档修复**: 定向移动 projects/Casa Yamagoya - Alex Fawcett - article-casa-yamagoya-alex-fawcett-4bb7b5b6/ 的 article.md、article.zh.md 共 21 个图片/图注块，恢复厨房、入口、客厅、卧室 Before / After 及其余正文位置。逐块比对确认原有文字、图注与译文保留，图片引用各 21 个且无重复、无失效路径。
- **验证**: 66 项 JS、45 项 Python 测试、npm run check、git diff --check 通过；覆盖图文顺序、重复引用单次下载清单、仅图片正文、空图注、非法引用/原图/未知图注拒绝及 JS → Python 渲染。实际当前 story 的关联清单及正文各 21 张，厨房 Before 指向用户指定照片 ID，正文无未支持的 img 标签。
- **计划**: .agents/plan-2026-10-16-dwell-inline-photos.md。
- **边界**: 未调用真实翻译，未重新下载图片，未重启用户服务；归档修复使用现有图片与译文。
- **下一步**: 重启已有后端服务，再更新 Tampermonkey 至 2026-10-16.2 并刷新 Dwell article 页面，后续采集使用新的图文布局；本篇现有中英文已修复，无需重新抓取。

## 2026-10-16 | Phase: Archello 分页相册与 ArchDaily 投稿入口修复 | Status: 完成

- **目标**: 修复 Living in Alpine Village 相册分页阻塞和 House at the Top of the Hill 投稿入口误判为项目字段。
- **证据**: Archello 主故事 38574 相册首屏 36 张、第二页 5 张，查看器确认共 41 张；ArchDaily `.submit_yourself` 投稿入口复用 `.afd-specs__item`，没有字段 key/value。
- **变更**: 跟随当前 story/category 实际提供的分页链接，合并后核对连续位置、媒体身份与查看器总数；校验分页参数、页码、缺页、重复 ID 和数量上限，复用取消/超时。ArchDaily 仅排除有明确投稿标记且无字段标记的入口，保留真实字段缺失校验。版本升至 2026-10-16.1，重新构建并同步 README.md、server/README.md。
- **计划**: .agents/plan-2026-10-16-gallery-and-specs-fixes.md。
- **验证**: 64 项 JS、41 项 Python 测试、npm run check 与 git diff --check 通过。新增 41 张分页、三页与整页结尾、异常链接/缺页/重复身份、分页取消/超时/导航和投稿入口/真实缺失回归。实际相册 36+5 张、位置连续且 41 个媒体 ID 唯一；首尾查看器确认 1 of 41、41 of 41 和对应 S3 原图。ArchDaily 15 个 specs 容器保留 13 个有效字段，图库 15 张。
- **边界**: 未执行真实完整图片下载或付费翻译，不将公开页面结构核对与合成回归视为端到端归档验收。
- **下一步**: 更新 Tampermonkey 至 2026-10-16.1 并刷新两个项目页重试；此次无后端变更，无需重启已支持这两个站点的服务。

## 2026-10-13 | Phase: 中文文章英制单位换算 | Status: 完成

- **目标**: 检查 projects/ 下全部 article.zh.md，为缺少公制对照的英制长度和面积补充换算值。
- **变更**: 检查 175 篇中文文章，为其中 17 篇缺少对照的英尺、平方英尺、英寸和英亩补充米、平方米、厘米或公顷；覆盖正文、图片说明及表格，保留已有公制对照。
- **验证**: 全量检索英制单位并逐项核对未紧跟公制括注的用法；新增数值按标准换算系数核算。git diff --check 通过。未运行代码测试，修改仅涉及归档文本。
- **下一步**: 无。

## 2026-09-30 | Phase: 文件夹图标失败日志 | Status: 完成

- **目标**: 图标脚本失败时在任务日志与 stage detail 中展示 stderr，避免截断的 CalledProcessError 命令行误导。
- **变更**: server/app.py 新增 `_folder_icon_failure_detail`；`_apply_folder_icon` 捕获失败时使用 stderr/stdout。server/test_app.py 增加回归测试。
- **验证**: `python -m unittest test_app.ServerTests.test_apply_folder_icon_logs_script_stderr_on_failure` 通过。
- **下一步**: 无。

## 2026-09-30 | Phase: 文件夹图标依赖文档 | Status: 完成

- **目标**: 在 server/README.md 写明自动套用 Finder 目录图标所需的 ImageMagick 与 fileicon 安装方式。
- **变更**: 「抓取后自动套用目录图标」下新增「系统依赖（macOS）」小节，含 brew 命令、PATH 校验与失败对主流程的影响说明。
- **验证**: 文档与 set_case_folder_icons.sh 头部注释一致。
- **下一步**: 无。

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
