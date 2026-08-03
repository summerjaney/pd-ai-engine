# PAE v0.4.0 验收报告

## 1. 当前结论

状态：**真实 LLM 验收未通过，缺陷修复待复测**。

真实验收已使用阿里云百炼 OpenAI-compatible 接口执行。前五个真实生成阶段通过，`prototype` 阶段因固定 60 秒超时失败，后续阶段正确标记为 `skipped`。已登记 `PAE-040-001` 并将默认超时提高至 180 秒，同时新增 `PAE_LLM_TIMEOUT_MS` 配置；全流程真实模型回归通过前不能发布 v0.4.0。

## 2. 已完成项

- v0.3.1 基线验证。
- Provider、PromptBuilder、OutputValidator 接口与实现。
- Mock Provider 与 OpenAI-compatible Provider。
- 8 个真实 LLM 生成阶段和 2 个确定性阶段的完整工作流。
- 阶段上下文传递、Prototype First 和 PRD 原型依赖。
- 结构校验、跨成果物一致性校验、自动重试和失败状态记录。
- API Key 不落盘的自动化安全检查。
- “员工调动管理”真实验收输入与人工评审清单。

## 3. 待执行项

| 项目 | 状态 | 完成条件 |
|---|---|---|
| 真实 Provider 健康检查 | 待执行 | 使用真实模型成功返回 |
| 真实 LLM 全流程 | 待执行 | 10 个阶段完成，manifest 为 completed |
| 人工成果物评审 | 待执行 | 产品经理确认内容可用或登记缺陷 |
| 缺陷关闭 | 待执行 | 阻断缺陷全部关闭并回归 |
| 安全复核 | 待执行 | 输出与日志无密钥 |
| 发布升版 | 待执行 | package、README、CHANGELOG、Tag、Release 一致 |

## 4. 缺陷矩阵

| 缺陷 | 触发用例 | 现象 | 修复 | 状态 |
|---|---|---|---|---|
| PAE-040-001 | TC-040-022 | Prototype DSL 在固定 60000ms 后超时 | 默认超时改为 180000ms；支持 `PAE_LLM_TIMEOUT_MS`，兼容旧 `PAE_LLM_TIMEOUT` | 待真实模型复测 |

## 5. 发布判定

在真实 LLM 全流程及人工评审完成前：

- 保持 `package.json` 和运行 manifest 的版本为 `0.3.1`；
- 不创建 `v0.4.0` Git Tag 或 Release；
- 不将本报告状态改为“通过”。

真实验收通过后，补录模型、运行时间、Run ID、产物路径、测试结果、缺陷矩阵和最终发布结论。
