# Architecture Archive

归档 Dezeen 建筑文章、Dwell home / article、Archello project 和 ArchDaily 项目页面，下载站点提供的大图并生成 `article.md`、`article.zh.md`、`meta.json` 和 `images/`。浏览器脚本复用当前登录权限，Flask 服务负责归档和翻译；无需配置或上传网站密码、Cookie。

## 开发与构建

需要 Node.js 20+、npm，以及按 `server/README.md` 安装的 Python 虚拟环境。

```bash
npm ci
npm run build
npm run dev
```

`npm run dev` 为可选 watch 命令，按 Ctrl+C 退出。只修改 `tampermonkey/src/` 和 `tampermonkey/metadata.txt`，不要手工修改构建产物。修改版本号后执行一次构建；watch 不负责更新已安装的 Tampermonkey 脚本。

## 安装与使用

1. 执行 `npm run build`，生成 `tampermonkey/architecture-archive.user.js`。
2. 按 `server/README.md` 配置并启动本地服务。
3. 浏览器打开 `http://127.0.0.1:8765/script.user.js`，安装或更新 Tampermonkey 脚本。
4. 打开支持的文章或项目页面（Dwell 需先确认当前登录权限下正文已加载），刷新页面后使用 Boom 抓取。

Archello 支持 `https://archello.com/project/<slug>`，例如 Virginia Water。脚本会读取完整照片/图纸列表，逐张访问同源查看器确认原图和描述，并补齐署名；页面显示的部分缩略图不会直接作为完整相册归档。收集过程可取消，单次请求超时 20 秒，总时限 5 分钟。多 story 页面按项目头图附件链接确认唯一主故事，只归档该主故事并在日志说明范围，不合并其他参与方故事；主故事关联不明确、正文缺失、分页未完整加载或含不支持媒体时明确报错，不保存残缺结果。详见 `server/README.md`。

旧版升级后需要重启已有服务，以读取新的站点路由、CORS 与协议校验。不要同时启动多个服务。

ArchDaily 支持 `https://www.archdaily.com/<数字ID>/<slug>` 项目主页。等待正文异步加载完成后，按 `#gallery-thumbs` 收集全部照片及图纸，优先读取 `data-largesrc` 的 `/slideshow/` 大图；属性或图注不全时，读取图库实际链接中绑定本项目的 `data-images`，核对完整媒体集合并补齐明确提供的大图和图注。不把 `/medium_jpg/` 或缩略图当作大图，也不凭路径替换猜测地址。采集可取消，查看器请求超时 20 秒，总时限 60 秒；正文未加载、图库不完整、跨项目或不支持媒体会报错。大图为站点展示版本，不保证摄影源文件；Description 与 Photos 分组输出。

## 目录

- `tampermonkey/src/index.js`：界面、服务请求、任务状态和入口。
- `tampermonkey/src/widget.css`：隔离站点样式的控件样式。
- `tampermonkey/src/dwell/common.js`：数据读取、清洗和原图 URL 校验。
- `tampermonkey/src/dwell/home.js`：home 项目解析与快照校验。
- `tampermonkey/src/dwell/story.js`：article 正文、图片与署名解析。
- `tampermonkey/src/dwell/capture.js`：抓取编排、分页、描述补取和取消。
- `tampermonkey/src/archello/capture.js`：项目、完整相册、查看器原图和描述、署名与材料表采集。
- `tampermonkey/src/archdaily/capture.js`：ArchDaily 正文加载等待、完整图库大图与图纸、图注及信息表采集。
- `tampermonkey/build.mjs`、`tampermonkey/metadata.txt`：构建流程和安装头。
- `tampermonkey/architecture-archive.user.js`：可直接安装的单文件产物。
- `server/`：Flask 服务、归档、翻译和回归测试，详细说明见 `server/README.md`。
- `projects/`：用户归档数据，不用于源码或构建输出。
- `.agents/DEVELOPMENT_STATUS.md`：项目开发历史。
- `.agents/skills/archive-add-site/SKILL.md`：项目级「新增归档站点」技能，新增网站时读取；也可用 `$archive-add-site` 明确调用。

## 验证

```bash
npm test
npm run check
cd server
.venv/bin/python -m unittest discover -v
```

JS 测试会先构建，使用 esbuild 打包真实模块，并通过 linkedom 验证 DOM 解析。跨语言测试依赖 Python 虚拟环境。测试不调用付费模型；真实登录态、完整原图下载和翻译仍需浏览器验收。
