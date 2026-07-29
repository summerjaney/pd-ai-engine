# PAE v0.3.0 第四批验收计划——验收覆盖映射与缺口补测

**文档目的**：基于已建立的产品功能覆盖矩阵（29 项）与 70 项自动化测试映射结果，识别剩余覆盖缺口，建立第四批验收测试用例，确保 v0.3.0 全量验收具备完整覆盖证据。

> **时间边界**：本计划记录第四批执行前验收设计。实际结果以第四批验收报告为准：TC-046～TC-049 PASS，TC-050 FAIL，第四批已执行但未通过，PAE-030-015 待修复和回归。

**建立日期**：2026-07-24
**基线 Commit**：33781d8
**版本**：v1.0

---

## 一、第四批目标

1. **完成 CLI 端到端覆盖**：针对 `pae requirement create` 与 `pae run` 两条命令，建立 CLI 进程级执行测试，覆盖正常、异常、参数校验、个人绝对路径与路径格式检查等场景；
2. **关闭已识别的覆盖缺口**：补齐 C-17（CLI requirement create 端到端）与 C-18（CLI run 兼容命令端到端）两项"部分覆盖"覆盖点；
3. **完成 TC-046～TC-050 实际执行证据**：在现有 15 个 TC 基础上新增 5 个 TC，使 C-17、C-18 两个"部分覆盖"项具备端到端 CLI 执行证据；
4. **形成 v0.3.0 全量验收基线**：在 29 项覆盖点全部具备测试证据、20 个 TC 全部通过的前提下，方可进入发布前检查。

---

## 二、第四批执行前基线

| 项目 | 值 |
|---|---|
| 基线 Commit | 33781d8 |
| 当前 main 分支 | 与 origin/main 一致 |
| 第四批执行前工作区 | 仅三份 docs/testing 测试管理文档为未跟踪文件，无业务代码及其他非预期变化 |
| 基线代码状态 | 基线 Commit 33781d8 对应的业务代码未发生变化 |
| 当前自动化测试 | 70/70 PASS（Node.js + Vitest） |
| 当前已执行 TC | 15（TC-031~TC-045，全部 PASS） |
| 当前已确认缺陷 | 4（PAE-030-009/010/011/013，已关闭） |
| 第四批执行前覆盖点 | 29 项（27 已覆盖 + 2 部分覆盖 + 0 未覆盖 + 0 人工确认 + 0 不适用） |
| 第四批新编号段 | TC-046~TC-050 |

> 注：当前"部分覆盖" 2 项为 C-17 与 C-18，均属于 CLI 端到端执行覆盖。

---

## 三、不追溯 TC-001～TC-030 的说明

### 3.1 证据边界

TC-001~TC-030 与 PAE-030-001/002/005/006/007/008/012/014 编号在**当前可访问的 Git 全历史中未发现定义或使用记录**。

Git 全历史搜索只能证明编号没有在当前可访问的仓库历史和分支中留下记录，不能证明编号从未在仓库外的人工记录、聊天或临时文档中使用。

### 3.2 处理原则

1. **不补测**：无仓库证据证明其属于 v0.3.0 验收范围，无需补测；
2. **不追溯**：不再追溯这些无定义记录的编号；
3. **允许空缺**：编号空缺是正常情况，不得为补齐而虚构记录；
4. **新建编号段**：第四批使用 TC-046 开始的新编号段。

### 3.3 第四批编号分配

| 编号段 | 用途 |
|---|---|
| TC-046~TC-050 | 第四批新增 CLI 端到端验收测试用例 |
| PAE-030-015 起 | 第四批若发现新缺陷时使用 |

---

## 四、第四批执行前功能覆盖矩阵（29 项）

> 本节列出第四批执行前的覆盖状态。已覆盖 27 项、部分覆盖 2 项；部分覆盖项需通过第四批补测后升级为已覆盖。

| 覆盖编号 | 功能模块 | 当前覆盖状态 | 第四批计划 |
|---|---|---|---|
| C-01 | 需求输入与结构化解析 | 已覆盖 | 维持 |
| C-02 | 需求分析 | 已覆盖 | 维持 |
| C-03 | 产品概要设计 | 已覆盖 | 维持 |
| C-04 | 产品架构 | 已覆盖 | 维持 |
| C-05 | 核心流程 | 已覆盖 | 维持 |
| C-06 | 页面结构 | 已覆盖 | 维持 |
| C-07 | Prototype Bundle | 已覆盖 | 维持 |
| C-08 | MasterGo 数据输出 | 已覆盖（数据产物） | 维持（实际画布由第五批 C-30 覆盖） |
| C-09 | 原型确认 | 已覆盖 | 维持 |
| C-10 | PRD 派生 | 已覆盖 | 维持 |
| C-11 | Review | 已覆盖 | 维持 |
| C-12 | project.json | 已覆盖 | 维持 |
| C-13 | requirement.json | 已覆盖 | 维持 |
| C-14 | manifest.json | 已覆盖 | 维持 |
| C-15 | product/ 目录 | 已覆盖 | 维持 |
| C-16 | requirements/ 目录 | 已覆盖 | 维持 |
| C-17 | `requirement create` 命令 | **部分覆盖** | **TC-046、TC-048、TC-049 补测（CLI 进程级证据）；TC-050 仅用于 C-28 验证，不作为 C-17 通过证据** |
| C-18 | `run` 兼容命令 | **部分覆盖** | **TC-047 补测（CLI 进程级证据）** |
| C-19 | 多项目 | 已覆盖 | 维持 |
| C-20 | 多需求 | 已覆盖 | 维持 |
| C-21 | 同一需求更新 | 已覆盖 | 维持 |
| C-22 | revision 自动递增与校验 | 已覆盖 | 维持 |
| C-23 | projectId/requirementId 身份识别 | 已覆盖 | 维持 |
| C-24 | 路径安全 | 已覆盖 | 维持 |
| C-25 | 错误输入 | 已覆盖 | 维持 |
| C-26 | 重复执行和幂等性 | 已覆盖 | 维持 |
| C-27 | legacy compatibility | 已覆盖 | 维持 |
| C-28 | 敏感信息和个人绝对路径 | **部分覆盖** | **TC-050 失败，PAE-030-015 待修复和回归** |
| C-29 | 产物之间的引用和内容一致性 | 已覆盖 | 维持 |

---

## 五、第四批执行前风险覆盖矩阵

| 风险类型 | 覆盖点 | 当前覆盖状态 | 第四批计划 |
|---|---|---|---|
| 路径安全 | C-24 | 已覆盖 | 维持 |
| 幂等性 | C-21、C-22、C-26 | 已覆盖 | 维持 |
| 数据隔离 | C-19、C-20 | 已覆盖 | 维持 |
| 身份识别 | C-23 | 已覆盖 | 维持 |
| 版本控制 | C-22 | 已覆盖 | 维持 |
| 输入验证 | C-25 | 已覆盖 | TC-048 强化（CLI 层） |
| 错误处理 | C-25 | 已覆盖 | TC-048 强化（CLI 层） |
| 兼容性 | C-27 | 已覆盖 | 维持 |
| 敏感信息 | C-28 | **部分覆盖** | **TC-050 失败，PAE-030-015 待修复和回归** |
| 流程完整性 | C-02~C-06、C-09、C-10、C-14 | 已覆盖 | 维持 |
| 产物完整性 | C-07、C-08、C-12、C-13 | 已覆盖 | 维持 |
| 内容一致性 | C-10、C-29 | 已覆盖 | 维持 |
| 元数据完整性 | C-12、C-13、C-14 | 已覆盖 | 维持 |
| 业务准确性 | C-01、C-02~C-06 | 已覆盖 | 维持 |
| 数据可追溯 | C-02~C-06、C-10 | 已覆盖 | 维持 |
| 命令完整性（端到端） | C-17、C-18 | **部分覆盖** | **TC-046（C-17）、TC-047（C-18）、TC-048（C-17）、TC-049（C-17）补测；TC-050 仅用于 C-28 验证，不作为 C-17/C-18 有效通过证据** |
| 敏感信息（个人绝对路径） | C-28 | **部分覆盖** | **TC-050 失败，PAE-030-015 待修复和回归** |

---

## 六、70 项自动化测试映射结果

### 6.1 70 项覆盖结论

- **已映射**（68 项）：68 项自动化测试关联至少 1 个覆盖点；其中 21 项为 PAE-030 缺陷回归场景（⊂ 70 项）。
- **未映射**（2 项）：D-17（package-lock.json 版本）、D-19（package.json 版本）为版本一致性辅助质量检查，不直接对应正式覆盖点。
- **重叠关系**：
  - 缺陷回归场景 21 项 ⊂ 自动化测试 70 项，**不得与 70 项相加**；
  - 正式 TC 15 项是人工执行维度，与 70 项属于不同统计维度，**不得与 70 项相加**；
  - 21 项 + 15 项 = 36 项的累加不构成"测试总数"。

### 6.2 70 项覆盖点分布（按覆盖点统计）

| 覆盖点 | 关联自动化测试数 | 备注 |
|---|---|---|
| C-01 | 7 | W-01、W-02、D-01、D-02、D-03、D-04、D-05 |
| C-02 | 9 | W-02、W-06、D-05、D-06、D-07、D-08、D-13、D-14、D-15 |
| C-03 | 6 | W-02、D-05、D-06、D-07、D-14、D-15 |
| C-04 | 5 | W-02、D-05、D-11、D-14、D-15 |
| C-05 | 4 | W-02、D-05、D-14、D-15 |
| C-06 | 5 | W-02、D-05、D-12、D-14、D-15 |
| C-07 | 12 | W-02、W-03、W-04、W-05、W-09、W-10、W-11、W-15、D-06、D-07、D-16、L-05 |
| C-08 | 2 | W-13、L-06 |
| C-09 | 2 | W-14、L-07 |
| C-10 | 4 | W-02、W-08、D-14、D-15 |
| C-11 | 2 | W-07、W-16 |
| C-12 | 1 | L-08 |
| C-13 | 1 | L-09 |
| C-14 | 6 | W-02、W-12、D-09、D-10、D-18、L-03 |
| C-15 | 9 | W-01、W-17、W-18、W-19、D-31、D-32、D-33、D-34、D-39 |
| C-16 | 6 | W-01、W-17、D-36、D-38、L-02、L-09 |
| C-17 | 2 | W-01、D-05（**部分覆盖，待 TC-046、TC-048、TC-049 补测**） |
| C-18 | 2 | W-02、W-09（**部分覆盖，待 TC-047 补测**） |
| C-19 | 3 | D-35、D-39、L-02 |
| C-20 | 3 | W-17、D-36、D-40 |
| C-21 | 3 | W-11、W-18、D-37 |
| C-22 | 5 | D-26、D-27、D-28、D-29、D-30 |
| C-23 | 4 | D-35、D-36、D-37、D-40 |
| C-24 | 6 | D-20、D-21、D-22、D-23、D-24、D-25 |
| C-25 | 4 | D-01、D-02、D-03、D-04 |
| C-26 | 5 | W-11、W-18、D-27、D-34、D-37 |
| C-27 | 10 | L-01、L-02、L-03、L-05、L-06、L-07、L-08、L-09、L-10、L-11 |
| C-28 | 3 | L-04、L-10、L-11 |
| C-29 | 5 | W-02、W-08、W-12、D-14、D-15 |

### 6.3 已覆盖项（27 项）

C-01、C-02、C-03、C-04、C-05、C-06、C-07、C-08、C-09、C-10、C-11、C-12、C-13、C-14、C-15、C-16、C-19、C-20、C-21、C-22、C-23、C-24、C-25、C-26、C-27、C-28、C-29

### 6.4 部分覆盖项（2 项）

- C-17（CLI `requirement create` 端到端执行）
- C-18（CLI `run` 兼容命令端到端执行）

### 6.5 未覆盖项（0 项）

无。

### 6.6 需要人工确认项（0 项）

无（CLI 端到端执行将通过第四批 TC-046~TC-050 补测，自动转为已覆盖）。

### 6.7 不适用项（0 项）

无。

### 6.8 映射完整性校验结果

| 校验项 | 数量 | 结果 |
|---|---|---|
| W 编号（workflow.test.ts） | 19 | W-01~W-19，全部有效 |
| D 编号（defect-tests.test.ts） | 40 | D-01~D-40，全部有效 |
| L 编号（legacy-compatibility.test.ts） | 11 | L-01~L-11，全部有效 |
| 唯一编号合计 | 70 | 19 + 40 + 11 = 70 |
| 已映射自动化测试 | 68 | W-01~W-19（19）、D-01~D-16/D-18/D-20~D-40（38）、L-01~L-11（11） |
| 未映射自动化测试 | 2 | D-17（package-lock.json 版本）、D-19（package.json 版本）——版本一致性辅助质量检查 |
| 无效引用编号 | 0 | 所有引用编号真实存在于测试明细 |
| 明细与覆盖点汇总双向一致 | 是 | 从测试明细反查覆盖点与从覆盖点反查测试编号完全一致 |

> 注：同一个自动化测试可以覆盖多个覆盖点，因此各覆盖点关联数量不得相加作为自动化测试总数。

---

## 七、执行前输入核查

### 7.1 输入文件存在性检查

本轮实际执行以下只读命令核查输入文件：

```bash
ls -l examples/b2b-requirement.md test/fixtures/empty-requirement.md
```

| 文件路径 | 存在性 | 大小 | 权限 | 处理方式 |
|---|---|---|---|---|
| `examples/b2b-requirement.md` | ✅ 存在 | 640 字节 | 可读 | 直接使用 |
| `test/fixtures/empty-requirement.md` | ✅ 存在 | 0 字节 | 可读 | 直接使用（只读，不修改） |

> - 两个文件均真实存在，TC-048 可直接使用现有夹具，无需动态创建临时文件。
> - 核查基于基线 Commit `33781d8`，未对两个文件进行修改。
> - 若第四批实际执行时基线 Commit 发生变化，应重新执行 `ls -l` 确认。

### 7.2 只读命令与代码基线

本轮使用以下只读命令核查 CLI 源码、参数解析逻辑和 run 完整调用链：

```bash
cat -n src/cli.ts
cat -n src/output/requirement-output.ts
cat -n src/workflow/workflow.ts
cat -n test/legacy-compatibility.test.ts
```

实际读取的文件路径：
- `src/cli.ts`（CLI 入口、参数解析、命令分发）
- `src/output/requirement-output.ts`（prepareRequirementOutput 实现）
- `src/workflow/workflow.ts`（workflow.run 输出逻辑）
- `test/legacy-compatibility.test.ts`（run 兼容输出相关测试）

> - 代码行号（如 src/cli.ts:95-98）仅作为定位辅助，后续若源码发生变更，行号可能漂移。
> - 实际执行 TC-046～TC-050 时，应以基线 Commit `33781d8` 下的真实 CLI 行为为准，验证退出码和错误信息。
> - 静态核查结论不替代实际执行证据。

### 7.2.1 run 命令完整调用链

基于基线 Commit `33781d8` 下的代码，`run` 命令的完整调用链如下：

1. **入口**：`src/cli.ts` 第 80 行，`isLegacyRun = args[0] === "run" && Boolean(args[1])`
2. **源文件读取**：第 82-84 行，`sourcePath = path.resolve(args[1])`，读取需求文件内容
3. **参数解析**：第 116-138 行
   - `--out` 参数（第 116 行）：`outputPath = option(args, "--out") ?? "output/latest"`
   - `resolvedOutput = path.resolve(outputPath)`（第 117 行）
   - `explicitProjectId = option(args, "--project")`（第 120 行）
   - `inferredProjectId = explicitProjectId ?? path.basename(resolvedOutput)`（第 125 行）——显式 `--project` 覆盖 `--out` 推断的 projectId
   - `explicitRequirementId = option(args, "--id")`（第 122 行）
   - `inferredRequirementId = explicitRequirementId ?? REQ-{随机3位数}`（第 128-129 行）
   - `explicitRequirementName = option(args, "--name")`（第 123 行）
   - `inferredRequirementName = explicitRequirementName ?? 文件名小写连字符化`（第 126-127 行）
4. **调用 prepareRequirementOutput()**：第 131-139 行
   - `outputRoot: path.dirname(resolvedOutput)`——`--out` 的父目录作为 outputRoot
   - `projectId: inferredProjectId || "default-project"`——显式 `--project` 优先
   - `requirementId`、`requirementName`、`revision` 等参数传入
5. **调用 workflow.run()**：第 141 行，`context = await workflow.run(input, outputDirectory, prepared.context)`
6. **输出目录**：`prepared.requirementDirectory`，即 `{outputRoot}/{projectId}/requirements/{requirementId}-{requirementName}/`

### 7.2.2 --out 转换为 outputRoot 和 projectId 的真实规则

| 参数 | 来源 | 转换规则 | 代码证据 |
|---|---|---|---|
| `--out <目录>` | CLI 参数 | `resolvedOutput = path.resolve(outputPath)` | src/cli.ts:116-117 |
| outputRoot | `--out` 的父目录 | `path.dirname(resolvedOutput)` | src/cli.ts:132 |
| projectId（推断） | `--out` 的 basename | `path.basename(resolvedOutput)` | src/cli.ts:125 |
| projectId（显式） | `--project` 参数 | `explicitProjectId ?? inferredProjectId` | src/cli.ts:120,125 |

**显式 --project 覆盖规则**：当同时传入 `--out <临时目录>/legacy-example --project hr-system` 时：
- `resolvedOutput = path.resolve("<临时目录>/legacy-example")`
- `path.basename(resolvedOutput)` = `"legacy-example"`（推断 projectId）
- `explicitProjectId` = `"hr-system"`（显式传入）
- 最终 `inferredProjectId` = `"hr-system"`（显式覆盖推断）

### 7.2.3 run 产物真实路径

基于 `prepareRequirementOutput()`（src/output/requirement-output.ts）和 `workflow.run()`（src/workflow/workflow.ts）的实现，当传入 `--out <临时目录>/legacy-example --project hr-system --id REQ-001 --name leave-request` 时：

| 产物 | 真实路径 | 代码证据 |
|---|---|---|
| project.json | `<临时目录>/hr-system/project.json` | requirement-output.ts:94,168-184 |
| product/ 目录 | `<临时目录>/hr-system/product/` | requirement-output.ts:95,163,186-189 |
| requirements/ 目录 | `<临时目录>/hr-system/requirements/` | requirement-output.ts:96,164 |
| requirement.json | `<临时目录>/hr-system/requirements/REQ-001-leave-request/requirement.json` | requirement-output.ts:114-124,196-203 |
| 00-requirement-input.md | `<临时目录>/hr-system/requirements/REQ-001-leave-request/00-requirement-input.md` | requirement-output.ts:204 |
| manifest.json | `<临时目录>/hr-system/requirements/REQ-001-leave-request/manifest.json` | workflow.ts:195 |
| 01-requirement-analysis.md | `<临时目录>/hr-system/requirements/REQ-001-leave-request/01-requirement-analysis.md` | workflow.ts:13,140 |
| 02-product-outline.md | `<临时目录>/hr-system/requirements/REQ-001-leave-request/02-product-outline.md` | workflow.ts:14,140 |
| 03-product-architecture.md | `<临时目录>/hr-system/requirements/REQ-001-leave-request/03-product-architecture.md` | workflow.ts:15,140 |
| 04-core-flow.md | `<临时目录>/hr-system/requirements/REQ-001-leave-request/04-core-flow.md` | workflow.ts:16,140 |
| 05-page-structure.md | `<临时目录>/hr-system/requirements/REQ-001-leave-request/05-page-structure.md` | workflow.ts:17,140 |
| 06-prototype/ 目录 | `<临时目录>/hr-system/requirements/REQ-001-leave-request/06-prototype/` | workflow.ts:18,86-114 |
| 07-mastergo/ 目录 | `<临时目录>/hr-system/requirements/REQ-001-leave-request/07-mastergo/` | workflow.ts:19,117-134 |
| 08-prototype-confirmation.json | `<临时目录>/hr-system/requirements/REQ-001-leave-request/08-prototype-confirmation.json` | workflow.ts:20,140 |
| 09-prd.md | `<临时目录>/hr-system/requirements/REQ-001-leave-request/09-prd.md` | workflow.ts:21,140 |
| 10-review.md | `<临时目录>/hr-system/requirements/REQ-001-leave-request/10-review.md` | workflow.ts:22,140 |
| requirement-index.md | `<临时目录>/hr-system/product/requirement-index.md` | requirement-output.ts:189,206-211 |

### 7.2.4 run 最终输出模式结论

`run` 命令最终生成 **requirement-centric 输出**（与 `requirement create` 相同的项目级 + 需求级目录结构），而非扁平 legacy 输出。

证据：
1. `run` 和 `requirement create` 均调用相同的 `prepareRequirementOutput()`（src/cli.ts:104 和 131）
2. `run` 和 `requirement create` 均调用相同的 `workflow.run()`（src/cli.ts:114 和 141）
3. `prepareRequirementOutput()` 生成 `{outputRoot}/{projectId}/project.json` 和 `{outputRoot}/{projectId}/requirements/{requirementId}-{requirementName}/requirement.json`
4. `workflow.run()` 在 `outputDirectory`（即 requirementDirectory）下生成 manifest.json 和 10 阶段产物
5. `test/legacy-compatibility.test.ts` 测试的是固定夹具目录中的旧版产物结构，不涉及 `run` 命令的实际输出

> 注：`run` 命令的"兼容"含义是兼容旧版 CLI 入口（`pae run <文件>`），而非生成旧版扁平目录结构。

### 7.3 CLI 参数静态核查结果

| 命令 | 参数 | 是否支持 | 是否必填 | 代码证据 | 对应 TC |
|---|---|---|---|---|---|
| requirement create | --project | ✅ | ✅（必填） | src/cli.ts:95-98 | TC-046、TC-049-A |
| requirement create | --id | ✅ | ✅（必填） | src/cli.ts:96-98 | TC-046、TC-049-A |
| requirement create | --name | ✅ | ✅（必填） | src/cli.ts:97-98 | TC-046、TC-049-A |
| requirement create | --output-root | ✅ | ❌（可选，默认 output） | src/cli.ts:105 | TC-046 |
| requirement create | --revision | ✅ | ❌（可选，默认 1） | src/cli.ts:99-103 | TC-049-B |
| run | --out | ✅ | ❌（可选，默认 output/latest） | src/cli.ts:116 | TC-047 |
| run | --project | ✅ | ❌（可选，可推断） | src/cli.ts:120 | TC-047 |
| run | --id | ✅ | ❌（可选，可推断） | src/cli.ts:122 | TC-047 |
| run | --name | ✅ | ❌（可选，可推断） | src/cli.ts:123 | TC-047 |
| run | --revision | ✅ | ❌（可选） | src/cli.ts:138 | TC-047 |
| 任意 | --unknown-flag | ❌ | — | src/cli.ts:52-65 | TC-049-C |

### 7.4 CLI 错误处理行为

| 错误场景 | 退出码 | 错误信息特征 | 代码证据 |
|---|---|---|---|
| 必填参数缺失（--project/--id/--name） | 1 | 包含"缺少 --project、--id 或 --name" | src/cli.ts:98 |
| --revision 非法（非整数/小于1） | 1 | 包含"--revision 必须是大于等于 1 的整数" | src/cli.ts:101-102 |
| 未知参数（如 --unknown-flag） | 1 | 包含"未知参数" | src/cli.ts:63-64 |
| 需求文件内容无效（空/空白/无标题/无正文） | 1 | 包含"需求文件内容无效"、"缺少有效标题"或"缺少正文内容" | src/cli.ts:42-49 |

---

## 八、第四批新增测试用例清单（TC-046~TC-050）

### 8.1 TC-046：CLI `requirement create` 命令端到端执行

| 项目 | 内容 |
|---|---|
| **目标** | 验证 `pae requirement create` 命令在 CLI 进程级可正确执行需求创建 |
| **输入** | `examples/b2b-requirement.md` + `--project hr-system --id REQ-001 --name leave-request --output-root <临时目录>` |
| **步骤** | 1. 创建临时 outputRoot 目录；2. 执行 `npx tsx src/cli.ts requirement create examples/b2b-requirement.md --project hr-system --id REQ-001 --name leave-request --output-root <临时目录>`；3. 验证退出码为 0；4. 验证 `<临时目录>/hr-system/project.json` 存在且 projectId 为 hr-system；5. 验证 `<临时目录>/hr-system/requirements/REQ-001-leave-request/` 目录存在；6. 验证 manifest.json 中 stages 状态为 completed |
| **预期结果** | 退出码 0；project.json 与 requirement.json 元数据正确；10 阶段全部 completed；产物路径使用 POSIX 相对路径或 `<临时目录>/...` 而非个人绝对路径 |
| **证据要求** | 完整执行日志（stdout/stderr）；`hr-system/project.json` 内容；`hr-system/requirements/REQ-001-leave-request/manifest.json` 内容；产物路径不包含任何个人用户目录前缀（macOS、Linux、Windows 的用户目录模式） |
| **覆盖点** | C-17（部分覆盖 → 已覆盖） |
| **风险类型** | 命令完整性（端到端）、敏感信息 |

### 8.2 TC-047：CLI `run` 兼容命令端到端执行

| 项目 | 内容 |
|---|---|
| **目标** | 验证 `pae run` 命令在 CLI 进程级可正确执行兼容模式需求创建 |
| **输入** | `examples/b2b-requirement.md` + `--out <临时目录>/legacy-example --project hr-system --id REQ-001 --name leave-request` |
| **步骤** | 1. 创建临时目录；2. 执行 `npx tsx src/cli.ts run examples/b2b-requirement.md --out <临时目录>/legacy-example --project hr-system --id REQ-001 --name leave-request`；3. 验证退出码为 0；4. 验证 `<临时目录>/hr-system/project.json` 存在且 projectId 为 hr-system；5. 验证 `<临时目录>/hr-system/requirements/REQ-001-leave-request/` 目录存在；6. 验证 `requirement.json` 元数据完整；7. 验证 manifest.json 中 stages 状态为 completed；8. 验证 10 阶段产物文件存在 |
| **预期结果** | 退出码 0；`run` 与 `requirement create` 生成相同目录结构；`project.json` 与 `requirement.json` 元数据正确；10 阶段全部 completed；产物路径使用 POSIX 相对路径或 `<临时目录>/...` 而非个人绝对路径 |
| **证据要求** | 完整执行日志（stdout/stderr）；`hr-system/project.json` 内容；`hr-system/requirements/REQ-001-leave-request/manifest.json` 内容；产物路径不包含任何个人用户目录前缀（macOS、Linux、Windows 的用户目录模式） |
| **覆盖点** | C-18（部分覆盖 → 已覆盖） |
| **风险类型** | 命令完整性（端到端）、兼容性 |
| **说明** | `run` 命令内部调用与 `requirement create` 相同的 `prepareRequirementOutput()` 和 `workflow.run()`，因此生成相同的项目级 + 需求级目录结构。`--out` 参数被解析为 `outputRoot = path.dirname(resolvedOutput)`，`projectId = path.basename(resolvedOutput)`，但显式传入的 `--project` 会覆盖推断的 projectId。 |

### 8.3 TC-048：CLI 异常退出码与错误信息

| 项目 | 内容 |
|---|---|
| **目标** | 验证 CLI 在错误输入下的退出码为非 0 且错误信息明确 |
| **输入** | 空文件 `test/fixtures/empty-requirement.md` 通过 CLI 传入 |
| **步骤** | 1. 执行 `npx tsx src/cli.ts requirement create test/fixtures/empty-requirement.md --project hr-system --id REQ-001 --name leave-request --output-root <临时目录>`；2. 验证退出码为 1；3. 验证 stderr/stdout 包含明确的错误信息（如"需求文件内容无效"）；4. 验证 `<临时目录>` 下未生成任何文件 |
| **预期结果** | 退出码 1；错误信息明确且不包含个人绝对路径；outputRoot 下不生成任何文件 |
| **证据要求** | 完整执行日志；退出码；错误信息文本；outputRoot 目录结构（应为空） |
| **覆盖点** | C-17、C-25 |
| **风险类型** | 命令完整性、错误处理 |

### 8.4 TC-049：CLI 参数缺失/非法（方案A：子场景）

| 项目 | 内容 |
|---|---|
| **目标** | 验证 CLI 在必填参数缺失或非法时的友好提示 |
| **子场景** | |
| **TC-049-A** | 必填参数缺失（缺 --project/--id/--name） |
| **TC-049-B** | revision 非法（非整数/小于1） |
| **TC-049-C** | 未知参数（如 --unknown-flag） |
| **输入** | 命令 A：`requirement create examples/b2b-requirement.md`；命令 B：`requirement create examples/b2b-requirement.md --project hr-system --id REQ-001 --name leave-request --revision abc`；命令 C：`requirement create examples/b2b-requirement.md --project hr-system --id REQ-001 --name leave-request --unknown-flag` |
| **步骤** | 1. 分别执行 3 条命令；2. 验证每条命令退出码为 1；3. 验证错误信息明确指向具体问题；4. 验证临时 outputRoot 下未生成任何文件 |
| **预期结果** | 3 条命令均退出码 1；错误信息分别提示"缺少 --project、--id 或 --name"、"--revision 必须是大于等于 1 的整数"、"未知参数"；outputRoot 下不生成任何文件 |
| **证据要求** | 3 条子场景的完整执行日志；退出码；错误信息文本 |
| **覆盖点** | C-17、C-25 |
| **风险类型** | 命令完整性、输入验证 |

### 8.5 TC-050：CLI 个人绝对路径与路径格式检查

| 项目 | 内容 |
|---|---|
| **目标** | 1. 当前执行环境的 CLI 输出不泄露个人绝对路径；2. 产物中的路径字段采用 POSIX 格式；3. 使用规则扫描 macOS、Linux 和 Windows 用户目录特征 |
| **输入** | 临时 outputRoot + 有效需求文件 + `requirement create` 与 `run` 两条命令 |
| **步骤** | 1. 创建临时 outputRoot 目录；2. 执行 `requirement create`：`npx tsx src/cli.ts requirement create examples/b2b-requirement.md --project hr-system --id REQ-001 --name leave-request --output-root <临时目录>/create-output`；3. 执行 `run`：`npx tsx src/cli.ts run examples/b2b-requirement.md --out <临时目录>/run-output/hr-system --project hr-system --id REQ-001 --name leave-request`；4. 收集两条命令的 stdout/stderr 全量输出；5. 扫描输出文本中是否包含个人用户目录模式（macOS: `/Users/`、Linux: `/home/`、Windows: `\Users\`）；6. 扫描 `requirement create` 产物文件：`create-output/hr-system/project.json`、`create-output/hr-system/requirements/REQ-001-leave-request/requirement.json`、`create-output/hr-system/requirements/REQ-001-leave-request/manifest.json`、`create-output/hr-system/product/requirement-index.md`；7. 扫描 `run` 产物文件：`run-output/hr-system/project.json`、`run-output/hr-system/requirements/REQ-001-leave-request/requirement.json`、`run-output/hr-system/requirements/REQ-001-leave-request/manifest.json`、`run-output/hr-system/product/requirement-index.md`；8. 验证所有路径字段为 POSIX 相对路径或以临时目录为根 |
| **预期结果** | CLI 输出不包含任何个人绝对路径；产物文件中路径字段为 POSIX 格式或以临时 outputRoot 为根的相对路径；规则扫描结果为空命中 |
| **证据要求** | 两条命令的完整执行日志；各产物文件路径字段示例；`grep` 扫描结果（应为空命中） |
| **覆盖点** | **C-28**（C-17、C-18 已分别由 TC-046/TC-048/TC-049 和 TC-047 覆盖，TC-050 仅用于 C-28 验证） |
| **风险类型** | 敏感信息、路径格式 |
| **边界说明** | 规则扫描只证明未写入这些路径模式，不等于在三个操作系统完成实际运行；跨操作系统实际执行不在本轮范围内 |

### 8.6 第四批用例统计

| 编号 | 名称 | 子场景 | 覆盖点 | 通过目标 |
|---|---|---|---|---|
| TC-046 | CLI `requirement create` 端到端执行 | 1 | C-17 → 已覆盖 | 目标为 PASS |
| TC-047 | CLI `run` 端到端执行 | 1 | C-18 → 已覆盖 | 目标为 PASS |
| TC-048 | CLI 异常退出码与错误信息 | 1 | C-17、C-25 → 已覆盖 | 目标为 PASS |
| TC-049 | CLI 参数缺失/非法 | 3（A/B/C） | C-17、C-25 → 已覆盖 | 目标为 PASS |
| TC-050 | CLI 个人绝对路径与路径格式检查 | 1 | **C-28**（TC-050 仅关联 C-28，不再作为 C-17/C-18 有效通过证据） | 目标为 PASS |
| **合计** | **5 个 TC** | **7 个子场景** | — | **5 项待执行，目标均为 PASS** |

---

## 九、执行顺序

| 顺序 | TC 编号 | 测试名称 | 依赖 |
|---|---|---|---|
| 1 | TC-046 | CLI `requirement create` 端到端执行 | 无 |
| 2 | TC-047 | CLI `run` 端到端执行 | 无 |
| 3 | TC-048 | CLI 异常退出码与错误信息 | TC-046、TC-047 |
| 4 | TC-049 | CLI 参数缺失/非法 | TC-046、TC-047 |
| 5 | TC-050 | CLI 个人绝对路径与路径格式检查 | TC-046、TC-047 |

> 建议先执行 TC-046 与 TC-047（基础端到端），再执行 TC-048~TC-050（衍生验证场景）。

---

## 十、阻断条件

以下任意一项发生，立即暂停第四批验收并报告：

1. **业务代码变化**：本批次若发现需要修改 src/ 业务代码才能通过的缺陷，暂停并记录为新缺陷（PAE-030-015 起）；
2. **自动化测试退化**：本批次执行前 npm test 或 npx vitest run 出现任何失败，立即暂停；
3. **个人绝对路径泄露**：CLI 输出或产物文件中出现任何个人用户目录前缀模式（macOS、Linux、Windows），立即暂停；
4. **未计划修改**：工作区出现非预期代码、夹具或运行产物变化，立即暂停；
5. **新发现的覆盖缺口**：执行过程中发现未在第 4 节功能覆盖矩阵或第 8 节用例清单识别的覆盖缺口，暂停并补充覆盖矩阵；
6. **缺陷回归**：21 项缺陷回归场景中的任何一项出现 FAIL，立即暂停。

---

## 十一、完成标准

第四批验收同时满足以下条件时，方可视为完成：

| 条件 | 要求 |
|---|---|
| 1. TC-046~TC-050 全部 PASS | 5/5 PASS |
| 2. 自动化测试通过 | npm test 与 npx vitest run 均 70/70 PASS（不得退化） |
| 3. 覆盖点状态 | C-17、C-18 升级为"已覆盖"；其余 27 项保持"已覆盖"；总覆盖点 29 项全部"已覆盖"或"不适用" |
| 4. 个人绝对路径扫描 | 第四批所有执行日志与产物文件经 `grep` 扫描无个人路径命中 |
| 5. 工作区清洁 | git status 仅显示 docs/testing/ 下的文档变更（除 baseline 修订外） |
| 6. 第四批报告 | 生成 [docs/testing/pae-v0.3.0-fourth-batch-acceptance-report.md](docs/testing/pae-v0.3.0-fourth-batch-acceptance-report.md)，包含每个 TC 的输入、步骤、实际结果与证据 |

---

## 十二、第四批执行前发布判断规则

第四批完成后，按以下规则判断：

| 条件 | 执行前状态 | 满足后结论 |
|---|---|---|
| TC-046～TC-050 全部 PASS | 待执行 | 可继续判断 |
| 自动化测试 70/70 PASS | 待第四批执行时复核 | 可继续判断 |
| 覆盖点全部已覆盖或不适用 | 当前未满足 | 可继续判断 |
| 4 个已确认缺陷关闭 | 已满足 | 可继续判断 |
| 工作区无非预期变化 | 待执行后确认 | 可继续判断 |
| 第四批报告生成 | 未完成 | 可继续判断 |
| 全部满足 | — | **可进入发布前检查** |
| 任意一项不满足 | — | **继续迭代** |

### 12.1 第四批通过后的下一步

1. 更新 [pae-v0.3.0-full-acceptance-coverage-audit.md](pae-v0.3.0-full-acceptance-coverage-audit.md) 中的覆盖状态统计与验收状态；
2. 更新 [pae-v0.3.0-acceptance-baseline.md](pae-v0.3.0-acceptance-baseline.md) 中的第五节 TC 表与第十一节覆盖状态统计；
3. 创建 [pae-v0.3.0-fifth-batch-mastergo-canvas-acceptance-plan.md](pae-v0.3.0-fifth-batch-mastergo-canvas-acceptance-plan.md)，执行 MasterGo 实际画布专项验收（**TC-051～TC-055 共 5 个 TC**，其中 TC-051 关联 C-08，TC-052～TC-055 关联 C-30）；
4. 重新判断验收状态，必须同时满足以下条件：
   - 三份文档统计全部一致；
   - 30 项覆盖点均为已覆盖或不适用（C-08 数据产物 + C-30 实际画布均已覆盖）；
   - 第四批和第五批实际执行证据完整；
   - **全量验收重新判断时，应核查 TC-031～TC-055 的正式结果**；
   - **TC-050 必须在修复后回归 PASS**；
   - 没有新增未处理覆盖缺口；
   - 没有阻断发布的缺陷；
   - 两套自动化测试全部通过；
   - 工作区没有非预期变化；
5. 满足上述全部条件后，方可得出以下结论：
   - 基线定义的 30 个覆盖点均有验收证据；
   - TC-031～TC-055 全部 PASS；
   - 自动化测试 70/70 PASS；
   - 已确认的缺陷均已关闭；
   - **v0.3.0 全量验收：完成**；
   - **发布前检查：可进入**；
6. 进入发布前检查流程（git diff、git status、typecheck、build、文档审查）。

> 注：不得仅依据 TC-046～TC-050 通过，就自动写成全量验收完成。必须同时满足上述所有条件，包括第五批 MasterGo 实际画布验收（TC-051～TC-055）以及 TC-050 修复后回归 PASS。

---

## 十三、本批次不修改的内容（明确边界）

第四批执行期间明确不修改：

- src/ 目录下的业务代码；
- test/ 目录下的自动化测试代码与夹具；
- examples/ 目录下的示例需求文件；
- package.json、package-lock.json、tsconfig.json、vitest.config.ts；
- .gitignore；
- docs/ 目录下非 docs/testing/ 的文档；
- 任何已有的临时 output、tmp、日志、运行产物。

仅允许修改或新增 docs/testing/ 下的测试管理文档：
- [pae-v0.3.0-full-acceptance-coverage-audit.md](pae-v0.3.0-full-acceptance-coverage-audit.md)
- [pae-v0.3.0-acceptance-baseline.md](pae-v0.3.0-acceptance-baseline.md)
- [pae-v0.3.0-fourth-batch-acceptance-plan.md](pae-v0.3.0-fourth-batch-acceptance-plan.md)
- [pae-v0.3.0-fourth-batch-acceptance-report.md](pae-v0.3.0-fourth-batch-acceptance-report.md)（新增）

---

**文档路径**：docs/testing/pae-v0.3.0-fourth-batch-acceptance-plan.md
