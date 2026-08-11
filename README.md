# PAE — Product Design AI Engine

PAE（仓库名 `pd-ai-engine`，中文名“产品设计 AI 引擎”）是面向产品经理的 AI 产品设计工作流引擎。

愿景：**One Prompt → One Product**。

当前开发版本为 `v0.9.0`。v0.8.0 已完成产品手册、操作手册、影响分析和交付打包；v0.9.0 正在建设统一 Document DSL、Word/PDF 正式文档导出和可归档交付包。

## 成果物组织模型

```text
output/
└── {project}/
    ├── project.json
    ├── product/
    │   ├── product-overview.md
    │   ├── product-architecture.md
    │   ├── product-roadmap.md
    │   └── requirement-index.md
    └── requirements/
        └── {requirement-id}-{requirement-name}/
            ├── requirement.json
            ├── 00-requirement-input.md
            ├── 01-requirement-analysis.md
            ├── ...
            └── manifest.json
```

- `product/` 维护产品当前全貌，属于项目级成果物。
- `requirements/` 保存每次需求迭代的完整上下文和成果物。
- 同一项目下的不同需求使用独立目录，运行新需求不会覆盖旧需求。
- PAE 引擎版本、产品版本、需求修订版本分别记录，不再共用一个版本字段。

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
