# PAE v0.5.0 用户管理 A/B 对照验收报告

## 1. 验收结论

- `TC-050-029`：**PASS**。A/B 两组均使用真实 LLM 完成 10 个阶段，运行状态为 `completed`。
- `TC-050-031`：**PASS**。两组成果物分别归档，A 组为 `knowledge.mode=off`，B 组为 `knowledge.mode=auto`，模式及知识选择记录可区分。
- `TC-050-032`：**PASS（评审活动完成）**。已形成六维量化评分、具体差异和可定位证据。
- `PAE-050-001～003`：**CLOSED**。修复后的 B 组真实 LLM 回归通过，三类 DSL 缺陷均有成果物证据。
- v0.5.0 发布门槛：**已达到**。最终真实 LLM 回归完成 10/10 阶段，Review 为 0 个 Error；`PAE-050-001`～`PAE-050-004` 均已关闭，可以执行 `TC-050-034`。

## 2. 运行信息

| 项目 | A 组 | B 组 |
|---|---|---|
| 知识模式 | `off` | `auto` |
| Provider / Model | `openai` / `qwen3.7-plus` | `openai` / `qwen3.7-plus` |
| Run ID | `bcd28344-2a25-4533-817c-8f3395122433` | `5dac2357-55fe-4c21-b70c-72e0482ae5a2` |
| Revision | `1` | `1` |
| 运行时间（UTC） | 2026-08-06 07:54:54—08:04:33 | 2026-08-06 08:05:46—08:16:32 |
| 阶段状态 | 10/10 `completed` | 10/10 `completed` |
| 知识选择 | 0 条 | 20 条（业务 1、模式 5、组件 7、规则 7） |
| 密钥检查 | 未发现 API Key | 未发现 API Key |

## 3. 量化评分

评分采用 1—5 分制。评分对象是最终成果物质量，不把篇幅或知识引用数量直接等同于质量。

| 维度 | A 组 | B 组 | 具体差异与证据 |
|---|---:|---:|---|
| 需求覆盖 | 5 | 5 | 两组均覆盖组合检索、新增/编辑/查看、启停与批量停用、多岗位与主岗位、三类角色权限、四类异常反馈。证据：两组 `05-page-structure.md`、`09-prd.md`。 |
| 页面完整性 | 4 | 4 | 两组均形成列表、表单、详情和危险操作确认设计；但 Prototype DSL 都未显式表达表格列、分页和空状态。B 组还在 `user_list.actions` 中缺少文档已声明的“查询/重置”。证据：两组 `06-prototype/prototype.json`，B 组 `09-prd.md:35-50`。 |
| 组件合理性 | 3 | 4 | A 组详情页状态使用可编辑语义的 `select`；B 组改为只读 `text`，且详情页补充启用/停用动作。两组仍未表达 `main_post` 对 `posts` 的数据源依赖，列表字段也未区分筛选字段与表格列。证据：两组 `06-prototype/prototype.json`。 |
| 业务规则覆盖 | 4 | 5 | B 组将 7 条规则贯穿页面结构、核心流程、PRD、Review 和 manifest，并自动验证必填、状态可见、危险操作确认；人工评审还识别出权限、空状态等 DSL 缺口。A 组规则内容基本齐全，但没有规则 ID、版本和逐阶段追踪。 |
| 跨成果物一致性 | 3 | 3 | A 组 Review 识别出 4 处 DSL/PRD 不一致；B 组 Review 识别出权限、主岗位联动、确认影响说明、分页/空状态及筛选/表格边界 5 类问题。B 组文档明确要求查询/重置，但 Prototype 动作未包含这两个操作。 |
| 可追踪性 | 2 | 5 | A 组只能追踪阶段和生成信息；B 组 manifest 记录知识 ID、版本、类型、选择来源、命中原因、分数及合规结果，各阶段也保留所用知识，可从需求追到规则和成果物。 |
| **总分（满分 30）** | **21** | **26** | B 组提升 5 分，主要来自规则覆盖、组件语义和端到端可追踪性。 |

## 4. 四项人工规则评审

| 规则 | 结论 | 证据与判断 |
|---|---|---|
| `rule.error-feedback@1.0.0` | **PASS** | B 组核心流程和 PRD 覆盖账号重复、组织失效、保存失败、无权限等场景，均要求阻断提交、明确反馈、保留表单数据或提供重试。证据：`04-core-flow.md:84-87`、`09-prd.md:85-90`。 |
| `rule.list-search@1.0.0` | **PARTIAL** | 文档和 Prototype 字段覆盖姓名、账号、手机号、组织、岗位、状态；PRD 明确查询与重置。但 B 组 `user_list.actions` 没有 `search/reset`，因此 DSL 闭环不完整。 |
| `rule.permission-visibility@1.0.0` | **FAIL（阻断）** | 页面及文档描述了角色权限，但 Prototype 的 `actions[]` 没有 `roles/authorization`，无法表达新增、批量停用、编辑、启停的按钮级权限和数据范围。B 组 `10-review.md` 已准确识别此问题。 |
| `rule.empty-state@1.0.0` | **PARTIAL** | 页面结构、核心流程和 PRD 均描述空数据与无结果引导，但 Prototype DSL 未声明 `emptyState`，无法驱动原型与实现。 |

## 5. 知识驱动带来的明确提升

1. **知识选择可解释**：B 组自动命中 20 条知识，并记录关键词、依赖补齐、分数和版本。
2. **规则覆盖可验证**：状态可见、必填字段、危险操作确认已由门禁自动验证，不再只依赖文本评审。
3. **缺陷发现更具体**：B 组 Review 能把权限、分页、空状态、字段联动等问题定位到 Prototype DSL 路径，而不是只给出笼统建议。
4. **成果物可追踪**：知识 ID 与版本贯穿页面结构、流程、PRD、Review 和 manifest，便于后续回归与知识升级影响分析。

## 6. 缺陷记录

### PAE-050-001：Prototype DSL 无法表达操作级权限

- 严重程度：**Blocker**
- 关联用例：`TC-050-029`、`TC-050-032`
- 现象：B 组文档明确区分平台管理员、组织管理员和普通用户，但 `pages[].actions[]` 没有 `roles` 或 `authorization`。
- 影响：PRD 中的按钮显示/隐藏与授权组织范围控制没有原型结构依据，无法满足 Prototype First 与权限可追踪要求。
- 修复建议：扩展 Prototype DSL Action Schema，支持角色/权限和数据范围约束；生成 Prompt 根据 `rule.permission-visibility` 注入可执行约束；校验器自动检查操作级权限；补回归测试。
- 关闭标准：B 组 Prototype 中新增、批量停用、编辑、启停动作均具备明确权限；Review 不再报告该 Error；真实 LLM 回归 10/10 完成。

### PAE-050-002：列表页结构化组件表达不完整

- 严重程度：**Major**
- 关联用例：`TC-050-032`
- 现象：Prototype DSL 未区分筛选区与表格列，未显式表达分页和空状态；B 组还缺少查询/重置动作。
- 影响：文档虽覆盖列表模式，但 DSL 无法完整驱动原型和后续实现，跨成果物一致性不足。
- 修复建议：在 Page Schema 中增加 `filterFields/tableColumns/pagination/emptyState`，或以统一 `components` 结构表达；生成器和校验器同步支持。

### PAE-050-003：表单字段联动与确认影响说明缺少 DSL 结构

- 严重程度：**Major**
- 关联用例：`TC-050-032`
- 现象：`main_post` 未声明候选值来源于已选 `posts`；危险动作只有 `confirmation: true`，没有承载影响说明的结构。
- 影响：主岗位可能脱离关联岗位形成脏数据；停用确认无法保证呈现业务影响。
- 修复建议：增加字段依赖/条件校验结构，并将 `confirmation` 升级为包含标题、内容或影响说明的对象。

## 7. 发布判断与下一步

本次 A/B 对照证明 v0.5.0 的知识驱动链路在**规则覆盖和可追踪性**上有明确提升，达到“对照评审形成可说明差异”的目标；但 B 组成果物尚未通过最终产品验收。

发布前必须先关闭 `PAE-050-001`，并建议一并修复 `PAE-050-002`、`PAE-050-003`，随后使用同一用户管理需求执行 B 组真实 LLM 回归。回归通过且人工规则全部为 PASS 后，才能执行 `TC-050-034` 和 v0.5.0 正式发布。

## 8. 缺陷修复进展

本次评审后已直接完成代码修复，当前状态如下：

- `PAE-050-001`：已扩展 `actions[].roles`，将权限可见性改为 Prototype 自动校验；缺失操作权限时由 error 级规则阻断。
- `PAE-050-002`：已增加 `tableColumns`、`pagination`、`emptyState`，并自动校验列表页查询与重置动作。
- `PAE-050-003`：已增加字段 `optionsSource` 和动作 `confirmationMessage`，危险操作校验同时检查确认机制与影响说明。
- Prompt 已将上述知识翻译为逐页可执行生成清单，不再只注入机器断言。
- Mock、真实 Provider 测试夹具与旧版兼容测试已同步更新。
- 自动化验证：`npm run check` 通过，127/127 项测试通过；TypeScript 无类型错误。

三个缺陷已在下述真实 LLM 回归中完成关闭；本节保留其代码修复记录。

## 9. 修复后 B 组真实 LLM 回归

### 9.1 回归结果

| 项目 | 结果 |
|---|---|
| Run ID | `64eef5b0-0f41-4fb4-8a8c-01d2a9454dec` |
| 知识模式 | `auto` |
| 知识目录版本 | `0.5.0` |
| 知识选择 | 20 条 |
| 工作流 | 10/10 `completed` |
| 自动合规 | `valid=true`；6 条自动规则 `passed`，`rule.error-feedback` 保持 `manual` |
| Debug 产物 | 0（无门禁失败） |

### 9.2 缺陷关闭证据

| 缺陷 | 回归证据 | 状态 |
|---|---|---|
| `PAE-050-001` 操作级权限 | `user_list`、`user_form`、`user_detail` 的所有 `actions[]` 均声明 `roles`；`rule.permission-visibility` 自动结果为 `passed` | **CLOSED** |
| `PAE-050-002` 列表结构 | `user_list` 已包含 `search/reset`、`tableColumns`、`pagination.enabled=true`、`emptyState`；`rule.list-search` 与 `rule.empty-state` 均为 `passed` | **CLOSED** |
| `PAE-050-003` 字段联动与确认影响 | `main_post.optionsSource="posts"`；全部 `danger` 操作均包含 `confirmation=true` 和非空 `confirmationMessage`；`rule.destructive-confirmation` 为 `passed` | **CLOSED** |

结构化复核未发现上述三类问题，修复后的真实 LLM 回归满足其关闭标准。

### 9.3 回归中新发现的问题

#### PAE-050-004：待确认项未闭环却写入确定性 PRD

- 严重程度：**Blocker**
- 来源：修复后 B 组 `10-review.md`
- 现象：需求分析提出的组织管理员权限边界、密码策略、账号唯一性校验时机等待确认项，未形成明确确认记录；PRD 却将部分内容写为确定性需求，并遗漏部分待确认结果。
- 影响：违反“不虚构确定性事实”和 Prototype First 原则，Review 明确判定需修复后方可进入开发阶段。
- 关闭标准：未确认事项在 PRD 中保持“待确认”，或由结构化确认结果提供依据；Review 不再输出该 Error；真实 LLM 回归 10/10 完成。

以下两项作为非阻断一致性问题一并记录，建议与 `PAE-050-004` 同批修复：

- Prototype 的 `rule.required-field.description` 遗漏“主岗位”，与实际字段及 PRD 不一致。
- `rule.error-feedback` 已在核心流程与 PRD 中通过人工评审，但 Prototype DSL 尚无结构化 `errorFeedback` 表达，Review 判定为部分合规。

## 10. 最终发布判断

- `TC-050-029～032`：已完成并通过。
- `PAE-050-001～003`：真实 LLM 回归关闭。
- `PAE-050-004`：**OPEN / Blocker**。
- `TC-050-034`：**暂不执行**。
- v0.5.0：**暂不可发布**。

下一步应修复“待确认项闭环”以及两项 Prototype/PRD 一致性问题，完成最后一次 B 组真实 LLM 回归；Review 无 Error 后，方可开始版本号、package、manifest、README、CHANGELOG 与 Tag 一致性检查。

## 11. PAE-050-004 修复进展

已完成代码修复，等待最后一次真实 LLM 回归关闭：

- PRD Prompt 强制逐项继承需求分析中的待确认项；没有确认依据时必须保留为“待确认/TBD”，禁止转换为确定性需求。
- Review Prompt 明确区分“正确保留待确认”与“虚构确定性事实”。
- Prototype DSL 新增可选 `errorFeedback`，结构化表达校验失败、操作失败和恢复动作；新生成 Prompt 强制填写，旧 DSL 缺失时保持人工评审兼容。
- `rule.required-field` 生成约束要求规则描述覆盖全部实际必填字段。
- 自动化验证：`npm run check` 通过，129/129 项测试通过；TypeScript 无类型错误。

在真实 LLM 回归的 `10-review.md` 不再包含待确认项 Error，且 Prototype 包含 `errorFeedback` 后，可关闭 `PAE-050-004` 并进入 `TC-050-034`。

### 最终回归复核（2026-08-07）

- Run ID：`2eb00c84-9d68-497a-9ff4-f9cb804850cb`。
- 工作流 10/10 阶段完成，7 条 Prototype 自动知识门禁全部通过。
- `PAE-050-001～003` 保持关闭。
- `PAE-050-004` **仍未关闭**：需求分析将“手机号校验规则”列为 TBD，但 Prototype `errorFeedback.validationMessage` 写入“手机号格式是否正确”，PRD 随后继承该确定性表述；Review 输出 1 个 Error，结论为 `Conditionally Approved`。
- 根因：上一轮只约束 PRD 保留 TBD 清单，没有阻止 Prototype 的异常反馈、危险操作影响或规则描述提前固化未确认事实。
- 修复补强：Prototype Prompt 新增待确认项污染检查；生成 `errorFeedback` 前逐项对照 TBD，未确认的校验格式、唯一性、权限边界、操作影响和数量限制只能省略具体结论或显式标注 TBD。
- 发布判断：`TC-050-034` 暂不执行；需完成补强后的真实 LLM 回归，且 Review 无 Error 后再进入发布检查。

## 13. TBD 补强修复最终回归（2026-08-07）

最终回归包：`base-platform-ab-b-tbd-regression.zip`。

- Run ID：`7fd94653-252e-4a88-b3b2-028fb16ccf70`。
- Provider / Model：OpenAI-compatible / `qwen3.7-plus`。
- 工作流状态：`completed`，10/10 阶段全部完成且结构校验通过。
- Prototype 自动知识门禁：7 条规则全部通过。
- Prototype `errorFeedback.validationMessage` 已改为通用字段错误提示，不再固化手机号格式、位数或唯一性规则。
- PRD 未将手机号格式或唯一性写成确定性开发逻辑。
- Review：`Conditional Pass`，0 个 Error、2 个 Warning、1 个 Info；剩余项均为非阻断产品评审建议。
- `PAE-050-004`：**CLOSED**。
- `PAE-050-001`～`PAE-050-004`：全部关闭。
- `TC-050-034`：**进入发布一致性检查**。
- v0.5.0：**允许进行版本号升级、Tag 与 Release 收口**。

说明：本版本正式范围不包含直接写入 MasterGo 画布。回归包中的 `mastergo-result.json` 为适配数据阶段记录，不能替代真实 MasterGo 画布质量验收，也不作为本次知识驱动版本的发布阻断项。
