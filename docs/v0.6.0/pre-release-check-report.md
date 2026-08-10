# PAE v0.6.0 发布前检查报告

## 1. 检查结论

本地代码、自动化测试、构建、版本一致性及 npm 发布包检查均通过。MasterGo 真实环境已完成连接与画布人工验收。待将本收尾提交更新到用户 Mac、执行一次正式验收回写后，可合并、推送并创建 `v0.6.0` Tag。

## 2. 验收门槛

| 检查项 | 结果 |
|---|---|
| `npm run check` | PASS |
| 自动化测试 | 154/154 PASS |
| `npm run build` | PASS |
| MasterGo MCP 真实连接 | PASS，`READY` |
| MasterGo 真实工具发现 | PASS，24 个工具 |
| P1 用户列表页真实写入 | PASS |
| P2 用户表单/详情页真实写入 | PASS |
| 可编辑图层人工核验 | PASS |
| npm 发布包范围 | PASS，87 个文件，约 59.8 kB |

## 3. 版本一致性

| 检查项 | 预期 | 结果 |
|---|---:|---|
| `package.json` | `0.6.0` | PASS |
| `package-lock.json` 根版本 | `0.6.0` | PASS |
| README 候选版本 | `v0.6.0` | PASS |
| CHANGELOG 发布版本 | `0.6.0` / `2026-08-07` | PASS |
| Prompt 版本 | `0.6.0` | PASS |
| 运行时 manifest 版本来源 | `package.json` | PASS |
| Git Tag | `v0.6.0` | 待发布提交后创建 |

## 4. 发布包检查

`npm --cache /tmp/pae-pack-cache pack --dry-run --json` 检查通过：

- 包名：`pd-ai-engine@0.6.0`
- 文件数：87
- 打包大小：59,841 bytes
- 解包大小：227,239 bytes
- 包含：`dist/`、`knowledge/`、README、LICENSE、`package.json`
- 不包含：源码、测试、验收文档、截图和本地输出成果物

## 5. 发布前剩余动作

1. 用户 Mac 更新至本收尾提交并运行 `npm run build`。
2. 对已通过人工画布核验的用户管理成果执行 `prototype verify --pass --evidence`。
3. 确认 `mastergo-write-result.json` 总状态与两个页面状态均为 `PASS`。
4. 推送功能分支并创建 Pull Request，或按项目发布流程合并至 `main`。
5. 在最终发布提交创建并推送 `v0.6.0` Tag。
