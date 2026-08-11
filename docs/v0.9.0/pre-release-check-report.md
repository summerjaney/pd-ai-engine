# PAE v0.9.0 发布前检查报告

## 1. 发布范围

- 统一 Document DSL 与标准文档模板
- DOCX/PDF 真实渲染
- 中文字体嵌入、标题、列表、表格、图片、页码与分页
- 正式交付目录、ZIP 与 SHA-256 清单
- 正式交付严格一致性检查及失败阻断

## 2. 发布门槛

| 检查项 | 要求 | 结果 |
|---|---|---|
| 引擎版本 | `package.json`、CLI 与文档模型一致为 0.9.0 | PASS |
| TypeScript | 构建与无输出类型检查通过 | PASS |
| 自动化测试 | 全量测试 100% 通过 | PASS |
| 正式交付 | DOCX、PDF、ZIP 与清单生成成功 | PASS |
| 严格检查 | 格式、哈希、元数据和内容安全通过 | PASS |
| 兼容性 | 历史测试与 legacy 输出不回退 | PASS |
| npm 发布包 | `npm pack --dry-run` 成功且仅包含允许文件 | PASS |

## 3. 发布操作

1. 推送 `feat/v0.9.0-formal-delivery`。
2. 创建并审查合并到 `main` 的 PR。
3. 合并后在 `main` 重跑全量检查。
4. 创建 `v0.9.0` Tag 和 GitHub Release。

## 4. 结论

本地发布前门槛全部通过。功能分支具备推送、创建 PR 和发布 v0.9.0 的条件。
