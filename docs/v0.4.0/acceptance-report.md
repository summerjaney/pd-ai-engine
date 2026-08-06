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
| PAE-040-002 | TC-040-025 | 真实模型生成的规则缺少 `appliesTo` 时，对 `undefined` 调用 `.filter()` | 缺失字段按空数组处理，避免 Prototype 校验阶段异常退出 | 待真实模型复测 |
| PAE-040-003 | TC-040-026、TC-040-027 | 真实 LLM 阶段解析或校验失败时无法保留原始响应，且模型使用非标准字段（roles/groups/items/target_page/applies_to）导致校验器输出 "undefined 引用了 undefined" 误导信息 | 1. 阶段最终失败时将每次尝试的原始响应、解析结果和校验问题写入 `99-debug/<stage>-attempt-<attempt>.json`，manifest 登记 `debugArtifacts`；2. Prototype 阶段提示词附带严格字段级 JSON Schema 约束，重试时重新附带约束；3. 校验器改为报告具体字段路径（如 `navigation[0].pageId 缺失`），检测 snake_case 非标准字段；4. 不放宽 schemaVersion="0.2"、pages 非空及页面引用一致性校验 | 已由自动化测试覆盖 |
| PAE-040-004 | TC-040-028 | package.json 已升级为 0.4.0，但新生成的 manifest.version 仍为硬编码的 0.3.1 | 删除 workflow.ts 与 cli.ts 中的 0.3.1 硬编码，新增 `src/version.ts` 在运行时从根 package.json 读取 version 作为唯一来源，manifest.version 与 CLI 帮助文本均使用该值 | 已由自动化测试覆盖 |

## 5. 发布判定

在真实 LLM 全流程及人工评审完成前：

- 保持 `package.json` 和运行 manifest 的版本为 `0.3.1`；
- 不创建 `v0.4.0` Git Tag 或 Release；
- 不将本报告状态改为“通过”。

真实验收通过后，补录模型、运行时间、Run ID、产物路径、测试结果、缺陷矩阵和最终发布结论。
