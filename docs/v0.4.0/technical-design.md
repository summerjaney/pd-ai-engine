# PAE v0.4.0 技术设计

## 1. 基线

- 开发基线：v0.3.1，commit `cea123b`。
- 基线测试：77/77 通过。
- 构建与检查：`npm run build`、`npm run check` 通过。

## 2. 架构

```text
ProductDesignWorkflow
  → PromptBuilder
  → LlmProvider
  → OutputValidator
  → Stage artifact
  → manifest generation metadata
```

## 3. 核心接口

- `LlmProvider`：`generate()`、`modelInfo()`、`healthCheck()`。
- `PromptBuilder`：组装阶段指令、原始需求和前序成果物；返回 Prompt 版本。
- `OutputValidator`：校验空内容、Markdown 结构、阶段依赖和跨成果物一致性。

## 4. 配置优先级

CLI 参数 > 环境变量 > 默认值。密钥只允许从 `PAE_LLM_API_KEY` 读取，不提供 CLI 密钥参数。

## 5. 重试策略

- 仅对可恢复错误重试：限流、超时、结构校验失败。
- 鉴权失败与配置缺失不重试。
- 默认最多重试 1 次。
- 每次重试记录 attempts，不覆盖已校验通过的阶段。

## 6. 实施顺序

1. 接口、Prompt 与校验骨架。
2. 单阶段真实 Provider 闭环。
3. 完整工作流接入与生成元数据。
4. 跨阶段一致性、异常与重试。
5. 真实需求验收。
