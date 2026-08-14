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
| tarball 清单 | PASS | 使用 npm 内置 `libnpmpack` 本地生成 122 KB tarball 并逐项核对；标准 `npm pack --dry-run` 在当前环境被启动前误判为网络操作 |
| MasterGo 真实画布 | NOT RUN | 本阶段尚未使用真实公司需求和真实画布 |

## 2. 发布前剩余事项

1. 推送 `feat/v1.2.0-extension-framework` 并创建 PR。
2. PR 合并前重跑 CI。
3. 合并后从 `main` 创建 v1.2.0 Tag 和 Release。
4. 真实公司需求与 MasterGo 画布验证作为产品工作接入验收，不阻断扩展框架代码发布，但不能在完成前宣称真实画布验收通过。

## 3. 当前判定

代码、自动化验收及发布包内容检查均已通过；正式发布状态为 `READY_FOR_PR`，仍需完成 GitHub PR、合并、Tag 和 Release 流程。

## 4. Tarball 检查证据

- 生成方式：直接调用当前 npm 安装附带的 `libnpmpack`，仅处理本地工作区，不访问注册表。
- 文件：`pd-ai-engine-1.2.0.tgz`
- 大小：124393 bytes（约 122 KB）。
- 已包含：`dist/`、`knowledge/`、`domains/lowcode-platform/`、`schemas/v1.0/`、`schemas/v1.1/`、`schemas/v1.2/`、README、LICENSE 和 package.json。
- 未包含：`src/`、`test/`、`examples/`、验收输出、私有产品工作空间及公司资料。
