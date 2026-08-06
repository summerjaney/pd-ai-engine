# PAE v0.5.0 测试用例清单

| 用例 | 模块 | 验证点 |
|---|---|---|
| TC-050-001 | 基线 | v0.4.0 原有 94 项测试全部通过 |
| TC-050-002 | Loader | 默认 catalog 可加载且版本正确 |
| TC-050-003 | Loader | 知识文件缺失时返回明确错误 |
| TC-050-004 | Schema | 缺少必填字段的知识条目被拒绝 |
| TC-050-005 | Schema | 非法实体类型、状态或版本被拒绝 |
| TC-050-006 | ID | 重复知识 ID 被拒绝 |
| TC-050-007 | Reference | 不存在的引用目标被拒绝 |
| TC-050-008 | Reference | 引用目标类型不匹配时被拒绝 |
| TC-050-009 | Selector | 列表管理需求选择列表页 Pattern |
| TC-050-010 | Selector | 危险操作选择确认 Rule 与确认弹窗 Component |
| TC-050-011 | Selector | 流程型需求选择状态流转 Pattern |
| TC-050-012 | Selector | 无关知识不会被注入 |
| TC-050-013 | Selector | 相同输入的选择结果稳定且顺序一致 |
| TC-050-014 | Override | 显式知识 ID 合并并覆盖自动选择结果 |
| TC-050-015 | Override | 无效显式知识 ID 立即失败 |
| TC-050-016 | Prompt | 不同阶段只注入必要知识类型 |
| TC-050-017 | Prompt | Prompt 包含知识 ID、版本及约束，不泄漏无关知识 |
| TC-050-018 | Trace | 阶段元数据记录选择来源、原因和知识版本 |
| TC-050-019 | Manifest | manifest 汇总知识库版本和使用条目 |
| TC-050-020 | Security | API Key 不进入知识追踪、日志或成果物 |
| TC-050-021 | Validation | 必填字段规则可校验 Prototype DSL |
| TC-050-022 | Validation | 状态可见规则可校验列表和详情页 |
| TC-050-023 | Validation | 危险操作缺少确认机制时产生问题 |
| TC-050-024 | Validation | 阻断级规则失败会阻断阶段完成 |
| TC-050-025 | Review | Review 输出知识合规矩阵 |
| TC-050-026 | Consistency | PRD 与 Prototype 使用的知识语义一致 |
| TC-050-027 | Compatibility | 未指定知识配置的旧命令仍可运行 |
| TC-050-028 | Compatibility | v0.4.0 manifest 可继续读取 |
| TC-050-029 | Real LLM | 用户管理需求完成 10 阶段 |
| TC-050-030 | Real LLM | 员工调动管理需求完成 10 阶段回归 |
| TC-050-031 | Comparison | 用户管理 A/B 两组成果物可独立归档 |
| TC-050-032 | Review | 人工对照评审形成量化评分和具体差异 |
| TC-050-033 | Revision | 同一需求重复运行 revision 正常递增且知识追踪不覆盖 |
| TC-050-034 | Release | package、manifest、README、CHANGELOG、Tag 版本一致 |

## 执行状态说明

- TC-050-001—028、031、033：默认自动化或受控响应测试覆盖。
- TC-050-029、030：必须使用真实 API Key 单独执行。
- TC-050-032：必须由产品经理人工评审。
- TC-050-034：仅在真实验收、人工评审和阻断缺陷关闭后执行。
