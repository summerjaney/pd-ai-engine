# Changelog

All notable changes to this project will be documented in this file.

## [0.3.0] - 2026-07-29

### Added

- **Requirement-centric Output Model**: 引入以需求为中心的成果物组织模型，项目（Project）作为长期容器，需求（Requirement）作为核心迭代单元。
- **CLI Commands**:
  - `pae requirement create`: 新增需求创建命令，支持独立的需求输入、项目/需求元数据存储。
  - `pae run`: 优化 legacy 运行命令，支持从 `project.json` / `requirement.json` 读取元数据，与 `requirement create` 无缝衔接。
- **Metadata**: `project.json` 和 `requirement.json` 用于持久化项目与需求元数据，脱离 CLI 参数依赖。
- **MasterGo Integration**: 支持生成符合 MasterGo DSL 的原型设计稿，作为第五批验收核心能力。

### Fixed

- **PAE-030-015 (Security)**: 修复 `sanitizeSourcePath` 缺陷，防止 CLI 将用户本地绝对路径（如 `/Users/xxx/...`）泄露到产物中。新增 `isMainModule` 判断防止模块导入时自动执行。

### Tests

- 全量自动化测试：77/77 PASS。
- TypeScript 类型检查：通过。
- 第五批 MasterGo 画布验收：通过，附已接受外部风险（MCP-EXT-001）。
- 风险接受说明：
  - TC-054: BLOCKED / INVALID TEST DESIGN
  - TC-054-R: FAIL，永久保留（归属于 MCP-EXT-001）
  - MCP-EXT-001: 已接受（MasterGo MCP 对非法 HTML 缺少明确拒绝响应）