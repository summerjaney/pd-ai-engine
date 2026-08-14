# PAE v1.2.0 发布前检查报告

## 1. 检查结果

| 检查项 | 状态 | 说明 |
|---|---|---|
| 正式基线 | PASS | 从远端 `main` 的 v1.1.0 正式标签提交建立分支 |
| 版本一致性 | PASS | package、lock 和根包均为 1.2.0 |
| TypeScript | PASS | build 与 noEmit 检查通过 |
| 专项验收 | PASS | 扩展、门禁、回流和双需求复用通过 |
| 全量测试 | PASS | 254/254 |
| 历史兼容 | PASS | v0.3.0—v1.1.0 无回退 |
| 发布目录 | PASS | package.json.files 声明的所有根目录存在 |
| npm pack 清单 | NOT RUN | 当前执行环境将本地 dry-run 误判为网络审批并取消 |
| MasterGo 真实画布 | NOT RUN | 本阶段尚未使用真实公司需求和真实画布 |

## 2. 发布前剩余事项

1. 在正常本地环境执行 `npm pack --dry-run`，确认 tarball 清单包含 `domains/lowcode-platform` 和 `schemas/v1.2`。
2. 推送 `feat/v1.2.0-extension-framework` 并创建 PR。
3. PR 合并前重跑 CI。
4. 合并后从 `main` 创建 v1.2.0 Tag 和 Release。
5. 真实公司需求与 MasterGo 画布验证作为产品工作接入验收，不阻断扩展框架代码发布，但不能在完成前宣称真实画布验收通过。

## 3. 当前判定

代码与自动化验收具备候选发布质量；正式发布状态为 `READY_WITH_MANUAL_CHECKS`，仍需完成 npm tarball 清单检查和 GitHub 发布流程。
