# PAE v0.5.0 真实 LLM 验收执行手册

## 1. 前置条件

- 当前分支代码通过 `npm run check`。
- 本地配置 `PAE_LLM_API_KEY`，不得把密钥写入命令、文档或成果物。
- 将下文 `<MODEL>` 替换为本次正式验收使用的模型名。

## 2. TC-050-029：用户管理 A/B 对照

先运行 A 组（关闭知识驱动）：

```bash
npm run dev -- requirement create examples/base-platform-user-management.md \
  --project base-platform-ab-a \
  --project-name 基础平台-A组 \
  --id REQ-050-001 \
  --name user-management \
  --provider openai \
  --model <MODEL> \
  --knowledge-mode off
```

再运行 B 组（启用知识驱动）：

```bash
npm run dev -- requirement create examples/base-platform-user-management.md \
  --project base-platform-ab-b \
  --project-name 基础平台-B组 \
  --id REQ-050-001 \
  --name user-management \
  --provider openai \
  --model <MODEL> \
  --knowledge-mode auto
```

分别确认两组 `manifest.json`：状态为 `completed`、包含 10 个完成阶段、`knowledge.mode` 与分组一致，且文件中不存在 API Key。使用 `comparison-review-template.md` 完成人工评审（TC-050-032）。

## 3. TC-050-030：员工调动管理回归

```bash
npm run dev -- requirement create examples/hr-employee-transfer.md \
  --project hr-system \
  --project-name 人力资源管理系统 \
  --id REQ-050-002 \
  --name employee-transfer \
  --provider openai \
  --model <MODEL> \
  --knowledge-mode auto
```

确认 10 个阶段完成，并重点核查状态流转、调出/调入组织岗位、审批过程和跨成果物一致性。

## 4. 证据归档

- 保留三次运行的完整需求设计包和 manifest。
- 记录模型、执行时间、Run ID、revision、测试结论及发现的缺陷编号。
- 同一需求修复后重跑时，确认上一版已位于 `revisions/revision-N/`。
- 未完成真实运行与人工评审前，不得将 TC-050-029、030、032 标记为通过。
