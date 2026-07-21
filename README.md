# PAE — Product Design AI Engine

PAE（仓库名 `pd-ai-engine`，中文名“产品设计 AI 引擎”）是面向产品经理的 AI 产品设计工作流引擎。

愿景：**One Prompt → One Product**。

当前 `v0.2.0 MVP` 聚焦 B 端产品设计交付链路，并坚持 **Prototype First**：原型模型是产品定义的单一事实来源，PRD 从原型及前序设计结果派生。

## MVP 工作流

```text
需求输入 → 需求分析 → 产品概要设计 → 产品架构图 → 核心业务流程图
        → 页面结构设计 → Prototype Bundle → PRD → Review
```

运行后会生成一个产品设计包：

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
- `07-prd.md`：由原型派生的 PRD
- `08-review.md`：设计评审结果
- `manifest.json`：本次运行的阶段状态与产物清单

## 快速开始

要求 Node.js 20+。

```bash
npm install
npm run example
```

产物位于 `output/example/`。

也可以使用自己的需求文件：

```bash
npm run dev -- run path/to/requirement.md --out output/my-product
```

查看帮助：

```bash
npm run dev -- --help
```

生成完成后，可直接用浏览器打开 `output/example/06-prototype/prototype.html` 查看交互式原型。

## MVP 架构

```text
Product Workflow   固定阶段、顺序、上下文和产物契约
Knowledge Engine   B 端产品设计规则与模式（MVP 为轻量规则集）
Execution Engine   阶段执行器（MVP 默认 Mock，可替换为 LLM）
```

核心知识关系：

```text
Business uses Pattern
Pattern contains Component
Component references Rule
Rule constrains Component
```

## 当前边界

MVP 暂不包含：多 Agent、MCP、插件市场、企业知识库、开放 API、自动开发与部署、多人协作。它们不会进入 `v0.2` 的实现范围。

## 原型产物说明

`06-prototype/` 是当前工作流的核心输出目录：

- `prototype.json` 仍然是单一事实来源，PRD 与 Review 依赖它派生。
- `prototype.html` 提供无需额外依赖的本地交互预览，适合评审和演示。
- `prototype-manifest.json` 描述页面、组件数量与跳转关系，便于后续自动化处理。
- `mastergo-data.json` 提供面向设计工具的适配数据，可作为后续接入 MasterGo 写入能力的中间层。
- `preview/*.svg` 为每个页面输出静态预览图，便于目录浏览和外部引用。

当前已经实现的是“DSL + 可交互 HTML 原型 + MasterGo 适配数据”。如果要直接在 MasterGo 画布中生成可编辑设计稿，仍需要后续开发 MasterGo 插件或接入其写入能力。

## 下一步

1. 增加真实 LLM 执行器与结构化输出校验。
2. 完善 B 端 Pattern / Component / Rule 知识数据。
3. 将 `mastergo-data.json` 对接到真实 MasterGo 插件或设计工具写入能力。
4. 用真实产品需求回归各阶段质量。

## 许可证

MIT
