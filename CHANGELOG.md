# Changelog

## [1.2.0] - Unreleased

### Added

- 建立 PAE 扩展清单、发现、校验、依赖排序和上下文组合基础能力。
- 支持领域与产品扩展对同名资源进行可追踪覆盖，禁止缺失及循环依赖。
- 新增首个 `lowcode-platform` 领域扩展，包含领域对象、平台边界、模型与表单、生命周期、设计器模式及功能迭代工作流。
- 新增 `pae extension validate` 与 `pae extension compose` 命令。
- 支持通过 `pae.workspace.json` 组合领域扩展和具体产品扩展，并提供脱敏基础平台工作空间示例。
- 扩展上下文已接入工作流、阶段 Prompt 与需求 manifest，可重现每次设计使用的规则及来源。
- 新增低代码平台前置分析，输出平台现状、能力匹配、影响模块、差异、平台化建议和强制人工确认状态。
- 新增平台判断人工确认门禁；正式阶段必须在确认实现路径和版本范围后才能继续，旧确认会在需求或分析变化后失效。
- 新增知识回流候选和人工接受机制；已接受的能力、规则、模式及决策形成带快照的产品增量知识，并在后续需求中自动复用。
- 新增两项连续低代码平台需求验收，证明已接受能力参与下一需求的平台前置分析；平台门禁状态正式记录为 `WAITING_CONFIRMATION`。

All notable changes to this project will be documented in this file.

## [Unreleased]

## [1.1.0] - 2026-08-13

### Added

- 新增带稳定 ID、来源追踪和 SHA-256 完整性校验的产品正式基线。
- 新增按需求相关性选择并注入的只读产品上下文，manifest 可追踪基线及事实来源。
- 新增产品变更分类、跨成果物影响分析、Product Diff 和三级冲突门禁。
- 新增 `pae product status` 与 `pae product accept`，支持显式接受、历史快照和增量更新。
- 产品概览、总体架构、路线图、需求索引及变更日志由正式产品基线自动维护。

### Validation

- 用户管理基础能力、批量导入和权限调整三个连续需求通过产品演进验收。
- v0.3.0—v1.0.0 历史测试、TypeScript、构建及 npm 独立安装检查通过。
- v1.1.0 远端发布须在 v1.0.0 合并、Tag 和 Release 完成后执行。

## [0.9.0] - 2026-08-11

### Added

- 启动 v0.9.0 正式文档与交付包迭代，新增统一 Document DSL、标准模板元数据、渲染器接口及文档导出清单。
- 新增 `pae document export <需求目录> --format docx|pdf|all` 命令；DOCX 与 PDF 均支持真实渲染并共用 Document DSL。
- 新增嵌入式中文 PDF 字体、分页、页码、列表与表格渲染，避免依赖操作系统字体。
- `pae delivery package <需求目录>` 可生成 DOCX/PDF、带 SHA-256 的正式包清单和 ZIP 交付包。
- 新增正式交付严格一致性检查，覆盖文档签名、清单哈希、需求元数据、本地绝对路径和未处理模板占位符；阻断错误会拒绝交付。
- DOCX 标准模板支持封面、自动目录、多级标题、页眉页脚、页码、列表、表格、代码块和 PNG/JPEG 图片。

## [0.8.0] - 2026-08-11

### Added

- 新增产品手册、操作手册、手册追踪矩阵、需求变更影响分析和增量更新。
- 新增手册一致性检查、完整交付清单、文件哈希与正式验收报告。

### Validation

- 自动化测试：186/186 通过；TypeScript 构建与检查通过。
- 基础平台组织结构管理真实需求、MasterGo 画布验收及最终交付检查均通过。

## [0.7.0] - 2026-08-10

### Added

- 新增需求级页面规划、统一设计上下文、交互关系图和页面规划完整性校验。
- 新增多页面设计一致性与交互一致性检查，覆盖字段冲突、主操作、危险操作、分页、空状态、无效导航和业务流偏差。
- 新增 MasterGo 多页面严格串行写入、逐页状态持久化、失败停止、`--resume` 续跑和防重复写入。
- 新增确定性画布布局与逐页人工验收，支持 `P1`～`P6` 页面编号简写。
- 新增 PRD 页面、字段、规则和验收标准稳定追踪矩阵。
- 新增完整交付一致性检查，以及 `pae delivery check`、`pae acceptance report` 命令。

### Fixed

- 修复真实“用户管理”需求被 Mock 生成器错误生成为申请审批页面的问题。
- 修复逐页验收只能识别完整页面 ID、无法识别页面编号简写的问题。
- 修复交付检查读取旧 dry-run 结果并对缺失字段调用 `.map()` 导致崩溃的问题。

### Validation

- 自动化测试：175/175 通过；TypeScript 构建与检查通过。
- 基础平台用户管理真实需求生成 6 个页面、56 个 MasterGo 操作，全部真实写入成功。
- 六个页面均非空白、名称及排列正确，图层可选择且可编辑，人工画布验收为 `PASS`。
- PRD 追踪 41 项全部覆盖；完整交付一致性检查与正式验收报告均为 `PASS`。

## [0.6.0] - 2026-08-07

### Added

- 新增 MasterGo MCP 配置诊断、真实握手、工具发现和完整 Schema 导出。
- 新增 `design_page → submit_page_to_canvas` 逐页写入链路及 `--write --confirm-write` 双重门禁。
- 新增 MasterGo 合规静态 HTML 生成、本地协议校验、逐页 HTML 与 MCP 原始响应留痕。
- 新增 `prototype verify --pass --evidence` 人工画布验收回写。

### Fixed

- 修复将 MCP `accepted` 回执误判为最终成功的问题，改为 `PENDING_VERIFICATION`。
- 修复多页面合并提交、交互原型隐藏页面及不兼容 HTML 导致空白画板或 `CreateNodesFailed` 的问题。
- 修复写入失败时未保存失败阶段、实际 HTML 和 MasterGo 原始错误的问题。

### Validation

- MasterGo Vibe MCP `1.0.27` 真实连接诊断为 `READY`，发现 24 个真实工具。
- 基础平台用户管理 P1 列表页与 P2 表单/详情页均成功写入 MasterGo，并通过人工画布核验。
- 两个页面均生成可编辑图层；未再出现空白画板或 `CreateNodesFailed`。

## [0.5.0] - 2026-08-07

### Added

- 新增 B 端产品设计知识目录，以及 Business、Pattern、Component、Rule 四类知识资产。
- 新增确定性知识选择、显式知识覆盖、按阶段 Prompt 注入和 manifest 知识追踪。
- 新增 Prototype DSL 知识合规门禁及 Review 知识合规矩阵。
- 新增用户管理 A/B 对照验收、员工调动回归样本和量化评审材料。

### Fixed

- 修复状态字段与危险操作确认规则未稳定落实到 Prototype DSL 的问题。
- 修复操作级权限、列表查询/重置、表格列、分页、空状态和字段联动表达缺口。
- 修复待确认项污染 Prototype 异常反馈并继承到 PRD 的问题。
- 为知识合规失败保留被拒绝原型和规则诊断产物。

### Validation

- 自动化测试：130/130 通过；`npm run build`、`npm run check` 通过。
- 用户管理 A/B 评分：A 组 21/30，B 组 26/30。
- 用户管理与员工调动真实 LLM 工作流均完成 10/10 阶段。
- `PAE-050-001`～`PAE-050-004` 全部关闭，最终 Review 为 0 个 Error。
- `TC-050-001`～`TC-050-033` 已完成；`TC-050-034` 在版本提交与 Tag 创建后完成最终一致性确认。

## [0.4.0] - 2026-08-06

### Added

- 新增统一 LLM Provider、OpenAI-compatible Provider 与 Mock Provider。
- 新增按阶段 Prompt、必要上下文传递、结构化输出校验、自动重试和生成元数据。
- 新增页面结构与 Prototype、Prototype 与 PRD 的基础一致性校验。
- 新增工作流整体运行状态、失败阶段与后续跳过状态记录。
- 新增真实 LLM 失败诊断产物，保留每次尝试的原始响应、解析结果与校验问题。
- 新增“员工调动管理”真实 LLM 验收输入、执行手册和最终验收报告。

### Fixed

- 修复 Prototype DSL 生成超时、缺失 `appliesTo` 引发异常及非标准字段导致的误导性校验信息。
- 移除运行时引擎版本硬编码，`manifest.version` 与根 `package.json.version` 保持一致。

### Validation

- 自动化测试：94/94 通过。
- `npm run build`、`npm run check` 通过。
- 真实 LLM 全链路 10 个阶段完成，Run ID：`21985532-3509-44b5-85b8-8f5bd36ef534`。
- `PAE-040-001`～`PAE-040-004` 全部关闭。

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
