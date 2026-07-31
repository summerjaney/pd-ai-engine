# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

### Added

- v0.4.0 开发中：新增统一 LLM Provider、OpenAI-compatible Provider 与 Mock Provider。
- 新增按阶段 Prompt、必要上下文传递、结构化输出校验、自动重试和生成元数据。
- 新增页面结构与 Prototype、Prototype 与 PRD 的基础一致性校验。
- 新增工作流整体运行状态、失败阶段与后续跳过状态记录。
- 新增“员工调动管理”真实 LLM 验收输入、执行手册和验收报告模板。

### Release Gate

- 在真实 LLM 端到端验收及人工评审完成前，不升级版本号、不创建 `v0.4.0` Tag 或 Release。

## [0.3.1] - 2026-07-29

### Changed

- **版本升级**：因历史 `v0.3.0` 标签已指向旧 commit（`6e16433`），不可移动、覆盖或删除，当前正式验收通过的 main 代码改用 `v0.3.1` 发布。
- 继承 `v0.3.0` 已验证的安全修复、验收证据和发布包范围，无新增业务功能。

### Risk

- **MCP-EXT-001**：唯一保留风险（MasterGo MCP 对非法 HTML 缺少明确拒绝响应）。

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
