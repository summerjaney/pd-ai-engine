# PAE v0.5.0 技术设计

## 1. 开发基线

- 基线版本：v0.4.0。
- 基线提交：`859b29f`。
- 基线能力：真实 LLM 10 阶段工作流、Prototype DSL、结构校验、重试、失败诊断和生成元数据。
- 基线测试：94/94 通过。

## 2. 目标架构

```text
Requirement Input
  → Knowledge Selector
  → Knowledge Context
  → Prompt Builder
  → LLM Provider
  → Output Validator
  → Knowledge Compliance
  → Stage Artifact + Trace
```

知识关系保持为：

```text
Business uses Pattern
Pattern contains Component
Component references Rule
Rule constrains Component
```

## 3. 目录规划

```text
knowledge/
├── catalog.json
├── businesses/
├── patterns/
├── components/
└── rules/

src/knowledge/
├── types.ts
├── loader.ts
├── validator.ts
├── selector.ts
└── trace.ts
```

知识数据与执行代码分离。`knowledge/` 是可维护资产，`src/knowledge/` 负责加载、校验、选择和追踪。

## 4. 核心数据契约

所有知识实体共享以下基础字段：

- `id`：稳定唯一 ID。
- `type`：`business | pattern | component | rule`。
- `name`、`description`：人类可读说明。
- `version`：知识条目版本。
- `status`：`active | deprecated`。
- `tags`：选择器使用的标准标签。
- `appliesTo`：适用业务、页面或组件范围。
- `references`：指向其他知识条目的 ID。

规则额外包含 `severity`、`checkType` 和结构化 `assertion`，避免只有自然语言描述而无法验证。

## 5. 选择策略

v0.5.0 使用确定性选择器，不引入向量数据库：

1. 从需求元数据和正文提取业务、页面及操作关键词。
2. 匹配知识条目的 `tags` 与 `appliesTo`。
3. 沿引用关系补齐依赖的 Pattern、Component 和 Rule。
4. 合并 CLI 或需求配置中的显式知识 ID。
5. 去重并按实体类型、优先级和 ID 稳定排序。

选择结果必须包含 `knowledgeId`、`reason`、`source` 和 `score`；`source` 为 `automatic` 或 `explicit`。

## 6. Prompt 注入

- 需求分析与产品概要设计：注入 Business 和高层 Rule。
- 页面结构：注入 Pattern、Component 和页面级 Rule。
- Prototype：注入可结构化执行的 Component 和 Rule 约束。
- PRD：注入已选知识摘要及 Prototype 中实际使用的知识。
- Review：注入完整知识追踪，输出合规矩阵。

Prompt 版本升级为 `0.5.0`，但引擎版本在发布前保持 `0.4.0`。

## 7. 追踪设计

每个阶段的生成元数据新增：

- `knowledgeCatalogVersion`。
- `selectedKnowledge[]`：知识 ID、版本、选择来源和原因。
- `complianceStatus`：`passed | warning | failed | not-checked`。

需求级 manifest 汇总所有阶段的知识使用情况，但不重复写入知识全文。

## 8. 校验策略

- Schema 校验：知识数据结构和字段类型。
- Reference 校验：所有引用目标存在且类型正确。
- Selection 校验：显式知识 ID 无效时立即失败。
- Artifact 校验：Prototype DSL 满足可执行规则。
- Cross-artifact 校验：PRD 与原型使用相同知识语义。
- Review 校验：阻断级规则不得处于未检查状态。

## 9. 兼容策略

- 现有 `B2B_RULES` 在迁移完成前保留兼容导出，内部数据改由 Loader 提供。
- 未指定知识配置的旧命令仍可运行，使用默认 catalog。
- v0.4.0 的 manifest 读取逻辑保持兼容；新增字段均为可选。

## 10. 实施顺序

1. 知识 Schema、样例数据、Loader 与 Validator。
2. 确定性 Selector 与选择追踪。
3. Prompt 分阶段注入。
4. Prototype 和 Review 知识合规校验。
5. 基础平台“用户管理”真实需求对照验收。
6. 第二业务样本回归、缺陷修复与发布收口。
