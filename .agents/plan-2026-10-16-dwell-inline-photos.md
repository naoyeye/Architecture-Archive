# Dwell article 图文顺序修复

- 日期：2026-10-16
- 状态：完成
- 目标：Dwell article 的照片及图注保留在原文位置，特别是 Before / After 对照区块。

## 方案与约束

1. 保留当前 story 的 dwell-photo 出现顺序，输出无 URL 的 HTML figure 照片 ID 引用；原图仍经当前 story 关系、照片 ID、CDN original 链接校验。
2. 后端只在 Dwell article 正文接受此引用，匹配已验证的照片清单，生成本地 images/ 链接及图注；拒绝未知、畸形引用。下载清单去重，允许同图在正文重复出现。
3. 未引用的封面/相册图片保留在 Photos；无引用的旧版载荷、Dwell home、Archello、ArchDaily 保持原有输出方式。schema version 1 根字段与 meta.json 不变。
4. 回归覆盖 Before / After 顺序、重复引用、仅图片正文、图注、原图校验、非法引用、旧载荷兼容及 JS → Python 渲染；全部翻译 mock。
5. 根据原文可见顺序移动 Casa Yamagoya 现有 article.md 和 article.zh.md 的图片块，保留图注及译文，不重新下载或翻译，不将 projects/ 用作测试目录。
6. 更新脚本版本、构建产物、README 与状态；不重启用户服务。

## 结果

- 已完成浏览器正文引用、受校验的后端图文渲染、重复图片去重下载清单及未引用图片的 Photos 兜底；无引用的旧版 JSON 保持兼容。
- 66 项 JS、45 项 Python 测试及构建、语法、差异检查通过。直接审查本次修改的来源约束、图片清单校验、清洗行为及兼容性，无待修复问题。
- 实际原文正文包含 21 个 dwell-photo，清单同为 21 张；已根据原文顺序移动现有中英文文章的全部图片/图注，逐块比较确认文字与译文不变，每个图片路径均存在。
- 版本 2026-10-16.2；后续使用需重启已有后端，再更新脚本。未执行真实翻译、重新下载或服务重启。
