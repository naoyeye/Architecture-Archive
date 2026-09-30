# ArchDaily 项目归档

1. 核对示例项目 canonical、正文异步加载标记、完整图库及大图来源。
2. 实现浏览器 schema version 1 采集，绑定项目与图片 ID，保留正文、图注和信息表。
3. 接入控件、取消/超时、后端 URL/CORS/图片白名单与下载 Referer。
4. 增加合成 DOM、跨语言及 HTTP 回归，构建并更新文档。

## 页面证据与边界

- 示例项目 1027911 的 `#gallery-thumbs` 包含 58 张图片；正文 `#single-content` 初始只有首段和 `picture.loader`，须等待网站自行完成加载。
- 优先使用图库 `data-largesrc`；当前公开页面无此属性，图库链接的 `#gallery-items[data-images]` 明确给出 `url_slideshow`、caption、link 与 MediaPicture 类型，`data-path` 绑定项目。
- 不改写 medium/thumb 地址，不抓推荐内容，不调用付费翻译。大图是站点 slideshow 版本，不承诺摄影源文件。
- 图片与正文分组输出；未加载、数量不一致、身份不一致或未知媒体均拒绝提交。

## 完成结果（2026-09-28）

- 四步实现完成，安装脚本版本 2026-09-28.1；新增浏览器适配、后端校验、CORS、下载 Referer、文档及回归。
- 57 项 JS、40 项 Python 测试及构建语法检查通过；使用 mock，不调用收费模型。
- 实际公开图库的 58 张图片（41 张照片、17 张图纸）与查看器逐一校验；用户提供楼层图大图抽样 HEAD 为 200/image/jpeg。
- 未进行完整浏览器归档/翻译验收；待用户重启已有服务、升级脚本并刷新页面。
