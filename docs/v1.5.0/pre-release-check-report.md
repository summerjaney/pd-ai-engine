# PAE v1.5.0 发布前检查报告

## 1. 结论

**PASS WITH RESERVED MANUAL VALIDATION**

真实产品资料登记、解析、知识候选、比较、审核、晋升包和显式安全晋升链路已通过自动化验收。真实公司资料质量评审、真实LLM调用和MasterGo真实画布继续作为独立保留项，不以Mock、脱敏夹具或静态产物替代。

## 2. 检查结果

| 检查项 | 结果 | 说明 |
|---|---|---|
| TypeScript | PASS | `tsc -p tsconfig.json --noEmit` |
| v1.5.0新增测试 | PASS | 14/14 |
| 全量自动化 | PASS | 288/288，失败0 |
| v1.4.0兼容 | PASS | 需求知识回流复用共享晋升服务，既有测试通过 |
| 资料安全 | PASS | 敏感分级、公开夹具排除、文件指纹及路径越界防护 |
| 文档解析 | PASS | Markdown、TXT、JSON、DOCX、PPTX、Axure HTML ZIP |
| LLM证据门禁 | PASS | 非原文证据、无效章节和非法结构被拒绝并受重试上限约束 |
| Axure静态关系 | PASS | 站点地图层级及页面链接关系可提取 |
| 审核与晋升 | PASS | pending默认门禁、完整审核、目录版本复验、禁止覆盖、历史快照 |
| 脱敏真实资料 | PASS | 组织机构资料完成端到端候选生产和比较 |
| 真实公司资料评审 | RESERVED | 必须在私有目录执行，不进入公开仓库 |
| 真实LLM调用 | RESERVED | 需配置实际Provider、模型和密钥后单独验收 |
| MasterGo真实画布 | RESERVED | 继续执行独立人工画布验收 |

## 3. 发布边界

- 当前仍为功能分支开发状态，版本号保持1.4.0，尚未进入正式发布提交。
- 未经用户明确授权，不推送分支、不创建或合并PR、不创建Tag与Release。
- `merge-source` 和 `create-version` 已能被审核记录表达，但本版本当前只允许 `accept-new` 进入显式晋升包，避免隐式覆盖历史知识。
