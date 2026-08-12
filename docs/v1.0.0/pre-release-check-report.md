# PAE v1.0.0 发布前检查报告

## 1. 发布门槛

| 检查项 | 要求 | 状态 |
|---|---|---|
| 版本一致性 | package、CLI、manifest 均为 1.0.0 | PASS |
| TypeScript | 构建与无输出类型检查通过 | PASS |
| 自动化测试 | 全量测试 100% 通过 | PASS |
| 真实业务 | 平台配置类与流程审批类端到端通过 | PASS |
| 兼容性 | v0.3.0—v0.9.0 历史测试无回退 | PASS |
| npm 发布包 | 干净安装、CLI 启动及包内容检查通过 | PASS |
| MasterGo | 真实多页面画布人工验收通过 | PASS |

## 2. 发布操作

1. 推送 `feat/v1.0.0-stable-delivery`。
2. 创建并审查合并到 `main` 的 PR。
3. 合并后在 `main` 重跑全量检查。
4. 创建 `v1.0.0` Tag 和 GitHub Release。

## 3. 当前结论

本地构建、全量测试、两类真实业务、历史兼容、npm 打包、独立安装、CLI 启动和 Schema 随包发布均已通过。

独立安装检查曾发现 npm bin 符号链接无法触发 CLI 的发布阻断缺陷，现已修复并增加 `TC-100-016` 回归测试。

2026-08-12 已在 MasterGo 文件 `MCP测试` 完成 4 个真实页面的写入与人工验收，页面内容、名称、图层可选择性和可编辑性均通过。证据归档于 `docs/v1.0.0/evidence/mastergo/`。

所有发布门槛均已满足，可以推送功能分支并进入 PR、合并、Tag 与 GitHub Release 流程。
