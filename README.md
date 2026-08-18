# PAE — Product Design AI Engine

PAE（仓库名 `pd-ai-engine`，中文名“产品设计 AI 引擎”）是面向产品经理的 AI 产品设计工作流引擎。

愿景：**One Prompt → One Product**。

当前版本为 `v1.7.0`。PAE 已能将多个真实平台需求汇总为需求组合，完成准入、价值成本评估、跨需求关系分析、版本方案比较、范围确认、正式基线和版本规划交付。

## 成果物组织模型

```text
output/
└── {project}/
    ├── project.json
    ├── product/
    │   ├── product-overview.md
    │   ├── product-architecture.md
    │   ├── product-roadmap.md
    │   ├── requirement-index.md
    │   ├── change-log.md
    │   ├── product-baseline.json
    │   └── history/
    └── requirements/
        └── {requirement-id}-{requirement-name}/
            ├── requirement.json
            ├── 00-requirement-input.md
            ├── 00-sources/
            ├── 01-requirement-analysis.md
            ├── ...
            ├── 12-design-confirmations/
            └── manifest.json
```

- `product/` 维护产品当前全貌，属于项目级成果物。
- `requirements/` 保存每次需求迭代的完整上下文和成果物。
- 同一项目下的不同需求使用独立目录，运行新需求不会覆盖旧需求。
- PAE 引擎版本、产品版本、需求修订版本分别记录，不再共用一个版本字段。

## 产品增量演进（v1.1.0）

项目首次成功运行会建立带哈希和来源追踪的正式产品基线。后续需求自动加载相关历史事实，并在需求目录生成：

- `11-change-impact/change-impact-report.json`：结构化变更、冲突和成果物影响。
- `11-change-impact/change-impact-report.md`：面向评审的影响报告。
- `11-change-impact/product-diff.json`：当前基线与本次设计的产品 Diff。

普通运行只预览影响，不修改正式产品基线。确认需求成果和冲突处理后，显式接受：

```bash
npm run dev -- product accept output/<project>/requirements/<requirement>
```

接受操作会拒绝 `ERROR`、过期报告和重复修订，保存旧基线快照，递增基线序号，并更新产品概览、总体架构、路线图、需求索引和变更日志。查看当前产品状态：

```bash
npm run dev -- product status --project-dir output/<project>
```

## MVP 工作流

```text
需求输入 → 需求分析 → 产品概要设计 → 产品架构图 → 核心业务流程图
        → 页面结构设计 → Prototype Bundle → PRD → Review
```

每个需求运行后会生成一个需求设计包：

- `01-requirement-analysis.md`：需求分析
- `02-product-outline.md`：产品概要设计
- `03-product-architecture.md`：产品架构图（Mermaid）
- `04-core-flow.md`：核心业务流程图（Mermaid）
- `05-page-structure.md`：页面结构设计
- `06-prototype/`：目录化原型产物
  - `prototype.json`：机器可读的 Prototype DSL（单一事实来源）
  - `prototype.html`：可直接打开的交互式 HTML 原型
  - `prototype-manifest.json`：页面、组件与跳转关系索引
  - `mastergo-data.json`：MasterGo / 设计工具适配数据
  - `preview/*.svg`：页面预览图
- `07-mastergo/`：MasterGo 适配数据与生成结果
- `08-prototype-confirmation.json`：原型确认状态
- `09-prd.md`：由原型派生的 PRD
- `10-review.md`：设计评审结果
- `manifest.json`：本次运行的阶段状态与产物清单

## 快速开始

要求 Node.js 20+。

```bash
npm install
npm run example
```

产物位于 `output/example-product/requirements/REQ-001-leave-request/`。

### 一键正式交付（v1.0.0）

`deliver` 会依次完成 10 阶段产品设计、产品手册与操作手册生成、手册一致性检查、DOCX/PDF 导出、正式 ZIP 打包和严格一致性校验：

```bash
npm run dev -- deliver path/to/requirement.md \
  --project hr-management-system \
  --project-name 人力资源管理系统 \
  --id REQ-003 \
  --name employee-entry \
  --product-version 1.2.0
```

执行成功时终端输出 `PAE 正式交付：PASS`，正式交付包位于需求目录的 `12-delivery/formal-delivery-package.zip`。任一生成步骤或质量门禁失败都会阻止正式交付并返回非零退出码。

中断后可追加 `--resume` 继续执行。PAE 会校验需求内容 SHA-256，仅复用同一输入下已经成功的阶段；输入变化时自动将旧成果视为失效并完整重建。`pae.config.json` 的 `execution.retries` 可设置阶段失败后的自动重试次数。

交付前可检查本机环境，交付完成后可独立复跑 Release 级质量门禁：

```bash
npm run dev -- doctor
npm run dev -- validate output/<project>/requirements/<requirement> --level release
```

环境诊断覆盖 Node.js、PAE 配置、输出权限、LLM、Git 和 GitHub CLI。Release 门禁统一核对端到端运行状态、追踪完整性、DOCX/PDF 文件签名、SHA-256、元数据与内容安全，并在 `12-delivery/` 生成质量报告、正式验收报告、追踪矩阵和 `delivery-summary.md`。

也可以使用自己的需求文件：

```bash
npm run dev -- requirement create path/to/requirement.md \
  --project hr-management-system \
  --project-name 人力资源管理系统 \
  --id REQ-003 \
  --name employee-entry \
  --product-version 1.2.0
```

查看帮助：

```bash
npm run dev -- --help
```

### MasterGo 多页面执行与验收（v0.7.0）

先配置 MasterGo MCP，再运行诊断：

```bash
export PAE_MASTERGO_MCP_CONFIG=/absolute/path/to/mcp.json
npm run dev -- mastergo doctor
```

配置文件既支持标准的 `mcpServers.mastergo` 结构，也支持直接提供 `{ "command": "...", "args": [...] }`。还可以用 `PAE_MASTERGO_MCP_COMMAND` 和 JSON 数组格式的 `PAE_MASTERGO_MCP_ARGS` 配置。

可先安全生成操作计划，不修改真实画布：

```bash
npm run dev -- prototype push output/<project>/requirements/<requirement> --dry-run
```

确认计划后，使用双重门禁执行真实写入：

```bash
npm run dev -- prototype push output/<project>/requirements/<requirement> --write --confirm-write
```

写入中断后可从失败页面续跑：

```bash
npm run dev -- prototype push output/<project>/requirements/<requirement> \
  --write --confirm-write --resume
```

MasterGo 返回 `accepted` 时，PAE 会记录为 `PENDING_VERIFICATION`。人工核验画布中的页面完整且可编辑后，再回写最终结果：

```bash
npm run dev -- prototype verify output/<project>/requirements/<requirement> \
  --page P1 --pass --evidence "页面内容非空、图层可选择且可编辑"
```

全部页面验收完成后，执行交付检查并生成正式验收报告：

```bash
npm run dev -- delivery check output/<project>/requirements/<requirement>
npm run build
node dist/cli.js document export output/<project>/requirements/<requirement> --format all
node dist/cli.js delivery package output/<project>/requirements/<requirement>
node dist/cli.js delivery validate output/<project>/requirements/<requirement>
npm run dev -- acceptance report output/<project>/requirements/<requirement>
```

doctor 会分别报告配置、启动命令和 MCP 连接状态，并通过标准输入输出向 MCP Server 发出真实 `initialize` 探测；只有握手成功才会把连接检查标记为 `PASS`。

为兼容 v0.2.0，旧命令仍可使用：

```bash
npm run dev -- run path/to/requirement.md --out output/legacy-example
```

兼容模式不会创建项目级和需求级上下文，建议新需求统一使用 `requirement create`。

## MVP 架构

```text
Product Workflow   固定阶段、顺序、上下文和产物契约
Knowledge Engine   B 端产品设计规则与模式（MVP 为轻量规则集）
Execution Engine   阶段执行器（支持 Mock 与 OpenAI-compatible LLM Provider）
```

核心知识关系：

```text
Business uses Pattern
Pattern contains Component
Component references Rule
Rule constrains Component
```

## 定制化扩展与产品工作空间（v1.2.0）

PAE Core 保持领域无关。领域知识、具体产品规则和交付方式通过扩展组合，不再混入统一 Prompt。

验证低代码领域扩展：

```bash
npm run build
node dist/cli.js extension validate domains/lowcode-platform
```

验证脱敏的基础平台工作空间：

```bash
node dist/cli.js workspace validate examples/base-platform-workspace/pae.workspace.json
```

在项目的 `pae.config.json` 中启用：

```json
{
  "schemaVersion": "1.0",
  "extensions": {
    "enabled": true,
    "workspace": "path/to/private-base-platform/pae.workspace.json"
  }
}
```

执行需求时，PAE 会将领域扩展和产品扩展按依赖顺序组合，注入各设计阶段，并在需求 `manifest.json` 的 `extensionContext` 中记录扩展版本、资源来源和覆盖冲突。不配置扩展时保持 v1.1.0 通用行为。

启用低代码工作空间后，首次运行只生成 `00-platform-analysis/` 并等待产品经理确认。查看报告后执行：

```bash
node dist/cli.js platform confirm output/<project>/requirements/<requirement> \
  --decision platform-enhancement \
  --scope "表单设计器字段联动" \
  --note "本版本不调整底层字段模型"
```

然后在原需求命令后增加 `--resume` 继续生成方案、原型和 PRD。确认记录与需求及分析内容哈希绑定；需求、能力地图或扩展规则变化后，旧确认自动失效。

正式设计完成后，PAE 在 `13-knowledge-feedback/` 生成能力、规则、模式和平台决策候选。候选默认不修改产品知识。审核后接受全部候选：

```bash
node dist/cli.js knowledge accept output/<project>/requirements/<requirement> \
  --workspace path/to/private-base-platform/pae.workspace.json
```

## 真实需求设计闭环（v1.3.0）

创建需求后，PAE 会自动将原始需求登记为 `SRC-000`。会议记录、截图说明、历史 PRD 或现有功能资料可以继续加入来源包：

```bash
node dist/cli.js source add output/<project>/requirements/<requirement> path/to/meeting-note.md \
  --type meeting-note \
  --sensitivity internal \
  --label "需求沟通记录"

node dist/cli.js source list output/<project>/requirements/<requirement>
```

机密资料如不应进入 AI 上下文，必须增加 `--exclude-from-analysis`。来源索引只保存安全文件名、相对存储路径和 SHA-256，不记录本机绝对路径。

平台判断确认并完成正式设计后，依次确认需求理解、功能方案和 PRD；原型确认继续使用既有原型确认记录：

```bash
node dist/cli.js design confirm output/<project>/requirements/<requirement> --gate requirement
node dist/cli.js design confirm output/<project>/requirements/<requirement> --gate solution
node dist/cli.js design confirm output/<project>/requirements/<requirement> --gate prd
node dist/cli.js design status output/<project>/requirements/<requirement>
```

统一设计检查会聚合来源、五节点确认、页面规划、设计与交互一致性、PRD追踪、MasterGo和变更影响：

```bash
node dist/cli.js design check output/<project>/requirements/<requirement>
```

问题分为 `BLOCKER`、`IMPORTANT`、`NORMAL` 和 `SUGGESTION`。存在阻断时结果为 `FAIL`；无阻断但仍有待确认重要问题时结果为 `PENDING`；全部关键问题关闭后方可达到 `READY_FOR_DEVELOPMENT_REVIEW`。

也可以使用 `--ids <ID1,ID2>` 只接受指定候选。接受结果写入工作空间的 `accepted-knowledge/product-knowledge-index.json`；每次更新前保存历史快照，并阻止同一候选重复接受。下一项需求加载工作空间时，会自动加载这些已确认的产品增量知识。

`examples/base-platform-workspace` 只用于展示目录和最小知识骨架，不应存放公司真实资料。真实基础平台工作空间建议使用独立私有仓库或私有目录。

## 平台知识闭环（v1.4.0）

v1.4.0 增加独立于产品工作空间的平台知识目录。平台能力、模式、组件和约束以带版本、状态及来源的实体维护；工作流会输出能力匹配、缺口、知识使用计划和跨成果物一致性报告。

```bash
node dist/cli.js knowledge validate --knowledge-dir knowledge/platform
node dist/cli.js knowledge list --knowledge-dir knowledge/platform
node dist/cli.js knowledge search "组织结构" --knowledge-dir knowledge/platform
node dist/cli.js capability analyze output/<project>/requirements/<requirement> \
  --knowledge-dir knowledge/platform
```

只有平台判断已确认、能力缺口仍有效且知识引用一致时，工作流才会在 `14-platform-knowledge-feedback/` 生成草稿候选。候选不会自动进入正式目录；产品经理审核后显式晋升：

```bash
node dist/cli.js knowledge review output/<project>/requirements/<requirement>
node dist/cli.js knowledge accept output/<project>/requirements/<requirement> \
  --knowledge-dir knowledge/platform \
  --ids capability.history-version
```

接受操作会再次校验需求修订、能力缺口指纹和知识一致性，保存目录历史快照，并将选中候选以 `confirmed` 状态写入正式平台知识目录。成果物中的 `[platform-knowledge:<id>@<version>]` 标记用于追踪设计结论的知识来源。

## 真实产品资料知识生产（v1.5.0 开发中）

v1.5.0 在平台知识闭环之上增加真实产品资料入口。资料与正式知识严格分离：资料先登记、留存内容指纹并按敏感级别管理，再解析为统一章节结构，随后生成带原文证据的草稿候选。候选与正式平台知识比较后仍需产品经理复核，不会自动覆盖或晋升。

```bash
node dist/cli.js material add path/to/platform-design.docx \
  --source-root private-sources/platform \
  --type product-design --sensitivity confidential --product base-platform --version 2.0
node dist/cli.js material extract source.platform-design --source-root private-sources/platform
node dist/cli.js material derive private-sources/platform/extracted/source.platform-design/extraction.json --extractor rule
# 配置OpenAI-compatible Provider后可使用受证据约束的LLM提取
node dist/cli.js material derive extraction.json --extractor llm --provider openai --model <model>
node dist/cli.js material compare private-sources/platform/extracted/source.platform-design/knowledge-candidates/candidates.json \
  --knowledge-dir knowledge/platform
node dist/cli.js material package candidates.json comparison.json review-decision.json
node dist/cli.js material promote promotion/promotion-package.json --knowledge-dir knowledge/platform
```

当前自动解析 Markdown、TXT、JSON、DOCX、PPTX 和 Axure HTML 导出 ZIP。Axure HTML 仅提取页面与静态文本，动态交互仍需人工或真实画布验收；`.rp` 专有文件不会被猜测性解析。`internal` 与 `confidential` 资料会自动标记为不得进入公开测试夹具；真实公司资料不应提交到公开仓库。

资料知识提取器默认使用确定性的 `rule` 模式，也可选择 `llm`。LLM模式不是自由生成：返回值必须是严格JSON，候选类型、章节ID、置信度均需通过结构校验，且 `evidenceExcerpt` 必须逐字存在于来源章节。无法提供原文证据的候选在重试后仍会被拒绝。

`material compare` 会同时生成 `review-decision.json`，所有候选默认是 `pending`。产品经理必须填写 `reviewedAt` 并将每项明确设为 `accept-new`、`merge-source`、`create-version` 或 `reject`。只有比较结果为 `new-knowledge` 的候选可以使用 `accept-new`；生成晋升包本身仍不会修改正式知识，必须再显式执行 `material promote`。

## 跨模块复杂需求设计（v1.6.0）

v1.6.0 在正式平台知识之上建立平台模块图谱，能够识别需求对组织机构、权限、表单、流程、报表等模块的直接、间接和回归影响，并生成多个可比较的实施方案。方案只作为建议，必须由产品经理明确选择并填写实施范围。

```bash
node dist/cli.js complex prepare <需求目录> path/to/requirement.md
node dist/cli.js solution list <需求目录>
node dist/cli.js solution select <需求目录> \
  --option platform-enhancement \
  --scope "组织、权限、表单、流程和报表"
```

正式设计完成后执行整合验收：

```bash
node dist/cli.js complex finalize <需求目录> path/to/requirement.md
```

PAE 会将复杂需求拆分为稳定的 `DU-*` 设计单元，并通过 `[design-unit:<ID>]` 追踪需求分析、方案、架构、流程、页面、原型、PRD和评审。成果物或引用缺失时验收失败。完成后可建立显式快照，并在需求变化时只重算受影响单元：

```bash
node dist/cli.js change snapshot <需求目录> <需求文件> <影响分析JSON>
node dist/cli.js change detect <需求目录> <新需求文件> <新影响分析JSON>
node dist/cli.js change status <需求目录>
```

未受影响的设计单元会原样保留；变化模块重新计算；退出范围的单元明确移除。变更不会隐式覆盖原正式设计计划，必须重新完成方案确认。

## 平台版本规划与需求组合管理（v1.7.0）

v1.7.0 将 v1.6.0 的单需求设计能力提升为多需求版本规划。PAE 会汇总项目需求池，区分 `READY`、`CONDITIONAL`、`BLOCKED` 和 `STALE`，生成结构价值、交付成本和技术建议指数；业务紧急程度、客户覆盖及战略匹配仍必须由产品经理复核。

```bash
node dist/cli.js portfolio build output/<project>
node dist/cli.js portfolio assess output/<project>
node dist/cli.js portfolio relate output/<project>
node dist/cli.js release plan output/<project> --version 2.1.0
node dist/cli.js release select output/<project> --version 2.1.0 --option foundation-first
```

版本范围确认会阻断未知需求、失效需求和缺失前置依赖。确认后显式建立版本基线，并在需求修订、准入状态或跨需求关系变化时使原确认失效，但不会自动覆盖正式基线：

```bash
node dist/cli.js release baseline output/<project> --version 2.1.0
node dist/cli.js release detect output/<project> --version 2.1.0
node dist/cli.js release finalize output/<project> --version 2.1.0 --objective "完善组织与权限基础能力"
```

整合验收通过后，`releases/v{version}/` 会包含版本目标与范围、需求矩阵、模块影响、依赖关系、风险登记、回归范围、验收报告和带 SHA-256 的交付清单。

## 当前边界

MVP 暂不包含：多 Agent、插件市场、企业知识库、开放 API、自动开发与部署、多人协作。MasterGo MCP 已支持受控的真实画布写入，其他设计工具尚未接入。

## 原型产物说明

`06-prototype/` 是当前工作流的核心输出目录：

- `prototype.json` 仍然是单一事实来源，PRD 与 Review 依赖它派生。
- `prototype.html` 提供无需额外依赖的本地交互预览，适合评审和演示。
- `prototype-manifest.json` 描述页面、组件数量与跳转关系，便于后续自动化处理。
- `mastergo-data.json` 提供面向设计工具的适配数据，可作为后续接入 MasterGo 写入能力的中间层。
- `preview/*.svg` 为每个页面输出静态预览图，便于目录浏览和外部引用。

当前已经实现“需求级页面规划 + DSL + 可交互 HTML 原型 + MasterGo 多页面可编辑画布串行写入 + PRD 追踪 + 完整交付一致性验收”。真实写入必须经过预演、双重确认和人工逐页画布验收。

## 下一步

1. 扩大真实业务需求回归范围，持续提升多页面生成质量。
2. 完善 B 端 Pattern / Component / Rule 知识数据和设计上下文复用。
3. 在后续版本补充产品手册和操作手册生成。

## 许可证

MIT
