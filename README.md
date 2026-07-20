# PAE — Product Design AI Engine

PAE（仓库名 `pd-ai-engine`，中文名“产品设计 AI 引擎”）是面向产品经理的 AI 产品设计工作流引擎。

愿景：**One Prompt → One Product**。

当前 `v0.1.0 MVP` 聚焦 B 端产品设计交付链路，并坚持 **Prototype First**：原型模型是产品定义的单一事实来源，PRD 从原型及前序设计结果派生。

## MVP 工作流

```text
需求输入 → 需求分析 → 产品概要设计 → 产品架构图 → 核心业务流程图
        → 页面结构设计 → Prototype DSL → PRD → Review
```

运行后会生成一个产品设计包：

- `01-requirement-analysis.md`：需求分析
- `02-product-outline.md`：产品概要设计
- `03-product-architecture.md`：产品架构图（Mermaid）
- `04-core-flow.md`：核心业务流程图（Mermaid）
- `05-page-structure.md`：页面结构设计
- `06-prototype.json`：机器可读的 Prototype DSL（单一事实来源）
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

MVP 暂不包含：多 Agent、MCP、插件市场、企业知识库、开放 API、自动开发与部署、多人协作。它们不会进入 `v0.1` 的实现范围。

## 下一步

1. 增加真实 LLM 执行器与结构化输出校验。
2. 完善 B 端 Pattern / Component / Rule 知识数据。
3. 增加可视化 Prototype Renderer。
4. 用真实产品需求回归各阶段质量。

## 许可证

MIT
