# PAE v0.4.0 真实 LLM 验收操作手册

## 1. 验收对象

- 项目：`hr-system`（人力资源管理系统）
- 需求：`REQ-003-employee-transfer`（员工调动管理）
- 输入：`examples/hr-employee-transfer.md`
- 输出：`output/v0.4.0-acceptance/hr-system/requirements/REQ-003-employee-transfer/`

## 2. 前置条件

- Node.js 20 或更高版本。
- 已执行 `npm install` 和 `npm run build`。
- 已获得 OpenAI-compatible API 的地址、模型名和 API Key。
- API Key 只通过当前终端的环境变量提供，不写入 `.env`、命令参数或验收材料。

## 3. 执行命令

```bash
export PAE_LLM_API_KEY="<API Key>"
export PAE_LLM_MODEL="<模型名称>"
# 仅非默认兼容接口需要设置：
# export PAE_LLM_BASE_URL="https://example.com/v1"

npm run dev -- requirement create examples/hr-employee-transfer.md \
  --project hr-system \
  --project-name 人力资源管理系统 \
  --id REQ-003 \
  --name employee-transfer \
  --product-version 1.0.0 \
  --output-root output/v0.4.0-acceptance \
  --provider openai \
  --model "$PAE_LLM_MODEL"
```

## 4. 自动检查

执行完成后检查：

```bash
npm test
npm run build
npm run check
git diff --check
```

并确认 `manifest.json`：

- `runStatus` 为 `completed`；
- 10 个阶段全部为 `completed`；
- 真实生成阶段的 `generationMode` 为 `llm`；
- Provider、模型、Prompt 版本、尝试次数和生成时间已记录；
- 不包含 API Key 或 Authorization Header；
- Prototype 阶段早于 PRD 阶段。

## 5. 产品经理人工评审

人工评审以下成果物：

1. `01-requirement-analysis.md`：角色、范围、规则、异常是否完整。
2. `02-product-outline.md`：模块和业务边界是否合理。
3. `03-product-architecture.md`：模块关系是否清晰。
4. `04-core-flow.md`：审批、驳回、撤回、待生效和生效失败是否覆盖。
5. `05-page-structure.md`：六类核心页面是否覆盖。
6. `06-prototype/prototype.html`：页面可打开、主要跳转可用。
7. `06-prototype/prototype.json`：页面、字段、操作及跳转结构正确。
8. `09-prd.md`：与原型页面、字段和操作基本一致。
9. `10-review.md`：能够指出遗漏、不一致和残余风险。

## 6. 缺陷登记

缺陷编号使用 `PAE-040-XXX`，必须关联触发用例 `TC-040-XXX`，至少记录：

- 缺陷标题与严重级别；
- 复现步骤；
- 预期结果与实际结果；
- 涉及成果物和阶段；
- 修复提交；
- 回归结果与证据路径。

## 7. 安全收尾

验收结束后在当前终端执行：

```bash
unset PAE_LLM_API_KEY
```

提交前确认输出目录未被纳入 Git，并再次搜索敏感信息。
