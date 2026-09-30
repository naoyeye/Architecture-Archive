# Architecture Archive Local Server

配合 Tampermonkey 脚本 `tampermonkey/architecture-archive.user.js` 使用：浏览器向本服务 POST 当前页面 URL，Dezeen 传 HTML，Dwell home / article、Archello project 和 ArchDaily 项目传结构化文章 JSON，本服务负责解析、下载站点大图、保存中英 Markdown 到仓库根目录下的 `projects/<建筑名> - <工作室> - <url路径>/`（与 `server/`、`tampermonkey/` 同级）。

### ArchDaily 项目支持（2026-09-28.1）

2026-09-28.2 修复广告占位误判：忽略 js-publift 广告、related-products 和 Products 推荐骨架屏，不等待其加载，也不把它们当项目字段或正文；真实正文加载标记与真实项目字段缺失仍会阻止抓取。此修复仅更新浏览器脚本，无需重启已支持 ArchDaily 的后端。

- 支持 `https://www.archdaily.com/<数字ID>/<slug>` 项目主页，不支持列表或独立图片页。以 canonical、`#single-content` 的文章 URL、图库链接和查看器 `data-path` 共同校验归属。
- 正文有 `#content-placeholder` / `picture.loader` 时等待网站自行加载，不归档只有首段的残缺正文，不自行访问隐藏正文接口。等待和图库请求都可取消；单请求上限 20 秒，总时限 60 秒，导航变化会中止。
- `#gallery-thumbs` 是完整相册清单，包含照片和图纸。优先使用明确的 `data-largesrc`；属性或图注缺失时，访问清单第一张图片的同源链接，从 `#gallery-items[data-images]` 读取明确的 `url_slideshow` 和 caption，核对项目、媒体 ID、类型、数量与完整链接集合。缺失 caption 与明确空 caption 区分处理；不抓推荐图片或产品广告。
- 仅接受 `https://images.adsttc.com/media/images/<六段四位十六进制ID>/slideshow/<文件名>`，允许页面给出的纯数字缓存时间戳，媒体 ID 必须一致。不从 medium/thumb URL 猜图，不使用 large_jpg 替代用户指定的 slideshow；这里的大图是网站展示版本，不承诺摄影原始文件。
- 保留正文和逐图图注；项目参数、署名、隐藏但已在 DOM 中的 More Specs、Materials and Tags 写入 Markdown 表格。Description 与 Photos 分组输出，不恢复原文图文穿插位置。复用 schema version 1（`source: archdaily`），不扩展 meta.json，不恢复 article.cn.md。
- 后端拒绝 ArchDaily HTML 通道，启动任务前校验 JSON、来源、图片白名单及数量；下载携带公开 ArchDaily Referer，拒绝 HTML 错误页。测试全部 mock 翻译与模型调用，输出使用临时目录，不写 projects/。
- 升级时构建脚本，按本文运维方式重启已有服务，再从 `/script.user.js` 更新 Tampermonkey 并刷新项目页；不要另启第二个服务。公开页面和图库数据核对不等于真实浏览器完整下载/翻译验收。

工作区布局（`<repo>` 为克隆后的仓库根目录）：

```
<repo>/
├── projects/                 # 所有抓取的案例目录（OUTPUT_ROOT）
├── server/                   # 本服务（Flask）
│   └── set_case_folder_icons.sh  # 文件夹图标脚本（抓取任务完成后由 app 调用）
└── tampermonkey/
    ├── src/                               # 模块化源码和 CSS
    ├── build.mjs                          # esbuild 构建入口
    ├── metadata.txt                       # userscript 安装头和版本
    └── architecture-archive.user.js         # 构建产物，不手工修改
```

## 安装

```bash
cd server    # 在仓库根目录执行
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

## 启动

```bash
source .venv/bin/activate
python app.py
```

默认监听 `http://127.0.0.1:8765`，仅本机可访问。

## 翻译配置（Gemini / OpenAI / DeepSeek 三选一）

服务启动时会自动读取 `server/.env`。通过 `TRANSLATION_PROVIDER` 选择引擎：

```bash
cd server    # 在仓库根目录执行
# 编辑 .env
# TRANSLATION_PROVIDER=gemini   # 或 openai / deepseek
# TRANSLATE_MAX_CHARS=12000     # 单次翻译文本长度上限（默认 12000）
# TRANSLATE_READ_TIMEOUT=180    # 等待模型响应的超时秒数（默认 180）
# GEMINI_API_KEY=...            # provider=gemini 时必填
# GEMINI_MODEL=gemini-2.5-flash
# OPENAI_API_KEY=...            # provider=openai 时必填
# OPENAI_MODEL=gpt-4.1-mini
# DEEPSEEK_API_KEY=...          # provider=deepseek 时必填
# DEEPSEEK_MODEL=deepseek-v4-flash  # 可改为 deepseek-v4-pro
```

若所选 provider 缺少对应 API Key，翻译阶段会报错并在任务状态里返回错误信息。
DeepSeek V4 请求会显式关闭思考模式，避免纯翻译和元数据提取产生不必要的延迟。

## AI 校正建筑名 / 工作室名

抓取流程在解析页面后会调用 LLM 复核 `building`、`studio` 两个字段，避免遇到没有 "X by Y" 模式的标题（例如 "Agricultural sheds inform 'unfussy and honest' home in New Zealand"）时把分类标签 `Posts` 当作建筑名、把作者 `Jon Astbury` 当成工作室。

- 默认调用 `DEEPSEEK_API_KEY` + `DEEPSEEK_MODEL`，prompt 输出严格 JSON。
- 可在 `.env` 用 `ANALYSIS_PROVIDER=deepseek|openai|gemini` 单独指定；不填则跟随 `TRANSLATION_PROVIDER`。
- 调用失败 / 模型返回 null 时保留 scraper 的原值，整个任务不阻塞。
- 进度条新增一项 `AI 校正建筑/工作室`，会在 detail 里显示是否做了修改。

### 目录命名策略

- LLM 返回明确的建筑名 → 三段：`<building> - <studio> - <url-slug>`，例如：
  `Openfield House - Keshaw McArthur - 2025-05-11-agricultural-sheds-inform-home-new-zealand-keshaw-mcarthur`
- LLM 判定为合辑 / 多项目 / 无单一项目（`building=null`） → 两段：`<title> - <url-slug>`，例如：
  `Eight contemporary houses raised on stilts - 2026-03-22-houses-on-stilts`

### 修复历史目录

对启用 AI 校正之前已经抓取的目录，可以单独跑：

```bash
cd server
source .venv/bin/activate

# 1) 单个目录，dry-run 预览（默认 projects 根 = 仓库根下的 ../projects）
python refine_meta.py --dir "../projects/<某个目录>"

# 2) 写入 meta.json，但不重命名
python refine_meta.py --dir "..." --apply

# 3) 写入 meta.json，并把目录名同步成 <building> - <studio> - <slug>
python refine_meta.py --dir "..." --apply --rename

# 4) 扫描整个 projects 根（默认与 app.py 一致：<repo>/projects），dry-run
python refine_meta.py --all

# 5) 扫描并实际修复
python refine_meta.py --all --apply --rename

# 6) 自定义根（如把 projects 放到别处时）
python refine_meta.py --all --root /path/to/projects --apply --rename
```

## 抓取后自动套用目录图标

默认开启：每次任务写完 `article.zh.md` 后，会调用 `server/set_case_folder_icons.sh`（对 `projects/` 传 `--root`，对当前案例目录传 `--test-dir`）自动套用 Finder 文件夹图标。

### 系统依赖（macOS）

自动套用与手动运行脚本均依赖本机已安装的可执行文件（仅 macOS + Finder 有意义）：

| 工具 | 用途 | 安装 |
|------|------|------|
| ImageMagick | 合成文件夹预览图（`magick`） | `brew install imagemagick` |
| fileicon | 将 PNG 写入 Finder 文件夹图标 | `brew install fileicon` |

安装后可用 `command -v magick fileicon` 确认 PATH 中能找到二者。脚本还会使用系统自带的 `sips`（可选，用于读取 macOS 系统文件夹图标）。未安装上述依赖时脚本会失败并在任务日志的「设置文件夹图标」阶段报错，**不影响**解析、下载与 Markdown 写入。

若通过 LaunchAgent 跑服务，`com.architecture.archive.plist` 的 `PATH` 已包含 `/usr/local/bin`；Homebrew 装在本机默认前缀下即可。

手动补跑（在 `server/` 下执行， `--root` 指向案例根目录）：

```bash
cd server
chmod +x set_case_folder_icons.sh   # 若尚未可执行
./set_case_folder_icons.sh --root "../projects" --all
# 或单个目录：
./set_case_folder_icons.sh --root "../projects" --test-dir "<文件夹名>"
```

- 环境变量：`AUTO_SET_FOLDER_ICON=1`（默认开启）
- 关闭：`AUTO_SET_FOLDER_ICON=0`
- 该步骤失败不会影响抓取主流程，只会写入任务日志。

## API

- `POST /jobs`，body: `{"url": "...", "html": "...", "full_translate": false}`（`full_translate=true` 时翻译阶段一次性翻译全文）→ 返回 `{"job_id": "..."}`
- `GET  /jobs/<id>` → 返回 `{"status": "running|cancelling|cancelled|done|error", "stages": [...], "dir": "...", "error": "...", "logs": [...]}`（含任务实时日志，前端可展开查看）
- `POST /jobs/<id>/cancel` → 终止当前任务
- `GET  /scraped?url=<url>` → 返回 `{"scraped": bool, "dir": "..."}`，浏览器脚本据此把按钮变成"已抓取"
- `GET  /script.user.js` → 直接返回 Tampermonkey 脚本，可在 Tampermonkey 里以 URL 安装/自动更新
- `GET  /health` → `{"ok": true}`

## 目录结构（产出）

```
projects/
├── 单项目文章 (从 .extra-lightbox-images 抓原图，三段命名)
│   Westview Cottage - Hollaway Studio - 2026-04-30-hollaway-studio-westview-cottage/
│       ├── images/
│       │   ├── 01.jpg
│       │   └── ...
│       ├── article.md         # 英文原文
│       ├── article.zh.md      # 中文翻译
│       └── meta.json
└── 汇总 / 合辑文章 (LLM 判定 building=null，两段命名：title + slug)
    Seven tactile living spaces with blockwork walls - 2026-03-08-blockwork-walls-lookbooks/
        ├── images/
        │   ├── 01 - Photo courtesy of Roberts Gray Architects.jpg
        │   ├── 02 - Photo by Lorenzo Zandri.jpg
        │   └── ...
        ├── article.md
        ├── article.zh.md
        └── meta.json
```

## 开机自启（macOS LaunchAgent）

一键安装 / 卸载：

```bash
cd server
./install-launchd.sh        # 注册并立即启动
./uninstall-launchd.sh      # 停止并删除
```

安装后行为：

- 登录后自动启动（`RunAtLoad`）
- 进程异常退出会自动重启（`KeepAlive`）
- stdout / stderr 日志：`/tmp/architecture-archive.out.log` / `/tmp/architecture-archive.err.log`
- 验证：`curl -s http://127.0.0.1:8765/health` 应返回 `{"ok": true, ...}`

底层使用 [`com.architecture.archive.plist`](com.architecture.archive.plist)。仓库里的 plist 含占位符 `__SERVER_DIR__`（相对本脚本所在目录）；**`install-launchd.sh` 会展开为绝对路径** 再写入 `~/Library/LaunchAgents/`，因为 launchd 要求可执行路径为绝对路径。请勿把未展开的模板 plist 直接拷到 `~/Library/LaunchAgents/`。

常用配套命令：

```bash
# 重启 LaunchAgent 服务
launchctl kickstart -k gui/$(id -u)/com.architecture.archive

# 查看服务详细状态（是否存活、pid、最近退出原因）
launchctl print gui/$(id -u)/com.architecture.archive

# 健康检查
curl -s http://127.0.0.1:8765/health

# 若服务不存在，重新加载
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.architecture.archive.plist

# 卸载后重装（彻底重置）
launchctl bootout gui/$(id -u)/com.architecture.archive
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.architecture.archive.plist
```


## Dwell 页面与旧版迁移

- 新用户脚本：`../tampermonkey/architecture-archive.user.js`；安装地址仍为 `http://127.0.0.1:8765/script.user.js`。
- 脚本改了名称和 namespace。请先禁用/删除旧的 HideDezeenHeader 脚本，再安装新脚本，避免两个按钮或重复任务。
- 支持 `https://www.dwell.com/home/<slug>` 和 `https://www.dwell.com/article/<slug>`；不支持列表页或其他站点。相册子页面由脚本归一化为所属 home / article URL。
- 在同一浏览器中登录你自己的付费账号、确认正文可见后点击抓取。无需配置 Dwell 用户名、密码或 Cookie；脚本只向本机发送标题、正文、项目字段和相册图片/描述，不发送 INITIAL_STATE 中的 auth、支付、用户偏好等对象。后端不会登录 Dwell，也不会绕过付费墙。
- 翻译/建筑名分析仍使用 `.env` 配置的模型服务；文章文字会发送给该服务（与原有 Dezeen 流程相同）。
- 优先使用当前项目相册数据中的 `links.original`；DOM 补充时仅接受对应项目的 `img[data-photo-id]`。不抓头像和推荐项目图片。
- 图片 URL 只保留 Dwell CDN 的 `/photos/<owner>/<photo>/original.<ext>`，移除 `w`、`q`、`auto` 和跟踪参数；不下载缩略图，也不通过 Skimlinks 广告跳转。
- 如果图片数量不足，脚本尝试打开相册并滚动或翻页收集。无法收齐时明确报错，不静默输出不完整相册。可手动打开相册、加载全部照片后重试；网站改版、登录失效仍可能导致抓取失败。
- `article.md` 含 Description、Project information、Credits / Details / Tags 表格和 Photos。Photos 每张图后紧跟原始描述，无描述不生成替代文字；没有正文时省略 Description。
- Location / Year / Style / Structure / Credits / Details / Tags 只写 Markdown，不扩展 `meta.json`。
- 中文翻译统一输出 `article.zh.md`，不再生成重复的 `article.cn.md`；英文原文仍为 `article.md`。
- 图片下载失败或返回 HTML（如登录页）时任务报错，不标记完成。原图 CDN 请求不携带浏览器凭据；若原图也要求登录，需要另行设计浏览器下载流程，不能靠配置账号密码解决。
- launchd 名称改为 `com.architecture.archive`。重新执行 `./install-launchd.sh` 会停止并删除旧 `com.dezeen.scraper` LaunchAgent，再安装新服务，避免抢占 8765 端口。若手动启动服务，停止旧进程后重新运行 `python app.py`。

### 数据源与更新策略

Dwell 用户脚本 `2026-09-10.3` 起不再上传整页 HTML，也不再依赖 Dwell 编译生成的 class。流程如下：

1. 用当前 URL 的 slug 匹配 `INITIAL_STATE.slugs` 中的 collection ID，只解析该项目引用的照片、metadata、contributors 和公开署名。不会遍历上传所有照片、用户资料或认证状态。
2. 优先从 collection 读取标题和正文，从相册关系读取顺序和数量，从图片对象读取 `links.original`。描述优先使用项目关联描述，其次图片自身描述。
3. 语义 DOM 只作为补充：项目照片链接、`data-photo-id`、`figure/figcaption`、`aria-describedby`、标题、字段标签及 `dt/dd`、表格。正文可从 `From …` / `Description` 对应的 section 读取；已加载的完整正文比初始状态更长时使用 DOM 版本。
4. 缺图时优先在当前项目照片区域内按 `View More` 按钮文字加载下一批（不依赖按钮 class），再以滚动或语义 dialog / `Next` 控件兜底。不会重复点击仍在等待的同一批次，也不会点击其他项目的 View More。
5. `2026-09-10.4` 起，图片齐全但描述未确认时，会在浏览器内逐张请求当前项目的 `/home/<slug>/<photo-id>` 页面补齐数据。请求使用浏览器同源登录态，每张最多等待 20 秒，可以取消；不读取或向本地服务上传 Cookie。静态 `INITIAL_STATE` 不随 View More 更新，因此即使手动加载了全部图片，也会执行此补齐步骤。仅为缺少原图或描述的照片发起请求；详情中明确的 `null`/空字符串才表示无描述，403、登录跳转、缺字段、项目/图片 ID 不匹配仍会报错。
6. 以统一的文章 JSON 提交 `/jobs`。`server/article_payload.py` 只校验数据和渲染 Markdown，不再解析 Dwell 页面结构。Dezeen 继续使用原有 HTML 通道。

`INITIAL_STATE` 仍是网站内部数据结构，不是承诺稳定的公开 API。若它变化，脚本尝试语义 DOM；如果两者都不足以确认内容，任务明确失败，而不是保存缺失内容。SPA 导航后不会采用 slug 不匹配的旧数据；收集期间切换到另一个项目会中止。

### JSON 协议与空值

`POST /jobs` 的 Dwell 请求使用 `{ "url": "…", "article": { … }, "full_translate": true }`。`article` 的必需字段为：

| 字段 | 含义 |
| --- | --- |
| `schema_version` / `source` | 固定为 `1` / `dwell` |
| `url` | 与本次请求一致的规范 home URL |
| `title` / `building` / `studio` | 标题与目录命名字段 |
| `body` | 正文内容及确认状态 |
| `sections` | 项目字段 / Credits / Details / Tags 的 `{title, rows: [{label, value}]}` 表格 |
| `expected_photo_count` | 已确认的相册总数，1–1000 |
| `photos` | 有序的 `{id, url, caption}` 列表 |
| `warnings` | 采集策略提示，只显示在任务日志，不写入 meta.json |

`body` 和 `caption` 均为 `{status, value, format, source}`：

- `present`：已提取到内容。
- `empty`：数据源明确为空或对应语义容器确实为空。原文和译文均不补写虚构描述。
- `missing`：未定位或字段类型无法识别。不能转换为空字符串后继续；客户端和服务端都会阻止这类任务。
- `format` 为 `text` 或 `html`；`source` 标记 `state.…` 或 `dom.…` 的提取来源。

服务端还校验协议版本、项目 URL、图片 ID 与原图 URL 的一致性、重复图片、数量和表格结构。旧版 Dwell HTML 请求返回 400 并提示更新用户脚本；因此修改后必须同时重启服务、更新脚本并刷新项目页。

### 回归测试

先完成前面的 Python 虚拟环境安装，然后在仓库根目录执行：

```bash
npm ci
npm test
npm run check
cd server
.venv/bin/python -m unittest discover -v
```

Node.js 20+ 的测试使用开发依赖 `linkedom` 解析真实 DOM；它不参与油猴脚本和 Flask 服务运行。测试覆盖 class 替换/删除、结构化数据与语义 DOM 兜底、过期 SPA 数据、动态补图、未确认与明确为空、敏感数据过滤及 JS → Python Markdown 协议联调。测试中的模型调用使用 mock，不产生翻译费用。

Dwell 示例页的公开 HTML 用于本地解析验证，不代表已验证你的付费登录态。首次更新后，请确认实际页面的相册总数和正文/描述。

### Dwell article 与模块化构建（2026-09-10.5）

- 根目录执行 `npm ci`、`npm run build`，生成 `tampermonkey/architecture-archive.user.js`。Node.js 20+；esbuild 和 linkedom 仅为开发依赖，不在浏览器运行时加载。
- `npm run dev` 监听源码变动并重新打包；修改安装头或构建配置后重新启动 watch。构建不会自动替换 Tampermonkey 已安装的脚本，修改后仍需更新脚本并刷新网页。
- 服务的 `/script.user.js` 安装地址及脚本 name / namespace / grant 保持不变；版本来自 `tampermonkey/metadata.txt`。根目录旧生成文件已经迁移，不保留两份产物。
- 从旧版本迁移需先构建，再重启已有本地服务，使其读取新产物路径并接受 article URL，然后更新 Tampermonkey 脚本。
- article 根据 URL slug 匹配 `stories` 记录（位于 `INITIAL_STATE.articles`），收集 lead、body、封面、正文图片和文章关联照片。不会套用 home 的 View More 或照片补取流程，也不收集推荐文章图片。
- 正文中的 `dwell-photo` 可能包含未转义的 HTML 引号；先解析图片标记，再清洗描述中的 HTML。编辑器的 `Add a caption` 占位符及明确空值不写成虚构描述；缺失数据仍阻止抓取。
- 沿用 schema version 1 和现有 Markdown 布局：正文单独放 Description，图片按封面、正文出现顺序、剩余关联照片去重后放 Photos，并附描述；不是将图片穿插回原始正文段落。
- 文章署名和正文 Project Credits 转为 Credits 表格，已识别的位置等字段转为 Project information 表格；不扩展 meta.json。
- 测试覆盖 article URL、原图、带 HTML 的图注、描述缺失、项目隔离、构建安装头及启动、浏览器 JSON → Python Markdown。公开 HTML 解析验证不等于付费登录态端到端验证。


### Archello project 支持（2026-09-16.3）

- 支持 `https://archello.com/project/<slug>`。浏览器读取当前项目的 canonical 和 story 关系，抓取 `.mce-content-body` 正文；剔除正文内广告、产品推广模块和推荐项目。选择器来自可读的语义 class / ID，不使用编译哈希 class。
- 完整相册通过项目实际提供的 story 链接读取，照片和图纸分别校验连续位置；每张查看器必须同时匹配项目链接、story ID、媒体 ID、当前位置和总数量。主页的 `+N` 预览不是完整相册，缩略图不作为原图。
- 原图仅接受查看器明确提供的 `https://archello.s3.eu-central-1.amazonaws.com/images/YYYY/MM/DD/<filename>.<jpg|jpeg|png|webp|avif>`，并验证与相册图片路径一致。不猜测 S3 地址，不调用登录下载或 CAPTCHA 接口；遇到 403、跳转或验证页就失败，不能绕过访问限制。
- 描述来自查看器的描述/摄影署名段落，保留正文中特有的图注。查看器描述容器已确认且无段落才表示 empty；无法定位当前项目、图片、正文或描述容器时失败。Description 与 Photos 分组输出，不恢复原始图文穿插。
- Project data、完整 Project credits 和完整 Product spec sheet 的材料/品牌/产品写入 Project information、Credits、Details 表格。材料表中跨项目聚合的 Specified By 不作为本项目署名。署名有 View All 时按页面给出的同项目链接展开；展开后仍截断则失败。
- 复用 schema version 1，`source` 为 `archello`，`url` 为去除参数、fragment、尾斜杠后的项目 URL，`photos[].id` 为原图 `/images/...` 路径。后端按请求站点验证 source，Archello 和 Dwell 的原图白名单及 ID 校验相互隔离；Archello 不接受 HTML 通道。
- 请求只使用浏览器同源已有权限，不读取或上传 Cookie、账号、完整页面脚本或 auth 数据。取消立即中止在途请求；单次请求最多 20 秒，整个采集最多 5 分钟，切换项目会中止。收集完成后才提交本地 `/jobs`。
- 多 story 页面通过项目头图的同源附件链接选择唯一主故事，正文、作者、相册和署名展开均绑定该 story。其他参与方的空占位或已加载内容不纳入正文与相册，warnings 明确说明范围。没有头图关联时只允许单 story；头图冲突、主故事正文缺失、未完整加载的分页、非图片媒体或未知图片域名/格式仍显式失败。
- 更新步骤：根目录 `npm run build`，按本文已有运维方式重启服务，再从 `/script.user.js` 更新 Tampermonkey 并刷新网页。服务不会由开发脚本自动重启。
- `server/test_archello.cjs` 使用合成 DOM 覆盖 32 张照片 + 1 张图纸、署名补齐、取消/超时、控件上传、原图和归属校验，并实际调用 Python 渲染器；`server/test_archello.py` 覆盖协议、URL、CORS 和 mock 归档。公开页面结构检查与合成回归不等于真实浏览器完整下载/翻译验收；测试不调用付费模型。

### Archello 主故事识别修复（2026-09-20.1）

Jackson Hole House 的 stories-grid 包含主故事和供应商空占位。此前按 data-key 容器数量拒绝多 story，会误报无法确认归档范围。现在根据项目头图附件链接确认主故事，不凭 DOM 顺序或“第一个非空故事”选择；主故事缺失时不回退到供应商。只需更新 Tampermonkey 脚本并刷新页面，本次没有后端协议变更。已增加空占位/已加载供应商隔离、头图与主故事缺失或冲突、署名展开切换故事及 JS → Python 回归；公开 DOM 与抽样查看器检查不等于完整下载或翻译验收。
