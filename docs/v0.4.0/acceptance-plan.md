# PAE v0.4.0 验收计划

## 1. 验收层级

- 自动化回归：Mock 模式、离线执行。
- Provider 集成：使用受控响应验证请求、解析、异常和重试。
- 真实 LLM 验收：单独执行，不纳入默认 `npm test`。
- 产品人工评审：使用“员工调动管理”需求。

## 2. 发布门槛

- `npm test`、`npm run build`、`npm run check` 全部通过。
- v0.3.1 原有 77 项测试无回归。
- 真实 Provider 完成全流程。
- 原型先于 PRD，PRD 能反映原型主要页面、字段和操作。
- 空输出、缺失依赖和无效结构能被阻断。
- API Key 安全用例全部通过。
- 阻断缺陷全部关闭并具备证据。

## 3. 缺陷编号

v0.4.0 缺陷统一使用 `PAE-040-XXX`；测试用例统一使用 `TC-040-XXX`，并在缺陷记录中维护双向关联。

## 4. 验收需求

- 项目：`hr-system`（人力资源管理系统）
- 需求：`REQ-003-employee-transfer`（员工调动管理）
- 覆盖：发起、审批、驳回、撤回、生效、权限、数据范围、列表、表单和详情。
- 正式输入：`examples/hr-employee-transfer.md`。
- 执行方法：`docs/v0.4.0/real-llm-acceptance-runbook.md`。
- 验收结果：`docs/v0.4.0/acceptance-report.md`。

## 5. 发布控制

- 未完成真实 LLM 验收时，版本号继续保持 `0.3.1`。
- 不得使用 Mock 或受控响应结果替代真实模型验收结论。
- 人工评审发现的阻断缺陷关闭前，不得创建 `v0.4.0` Tag 或 Release。
