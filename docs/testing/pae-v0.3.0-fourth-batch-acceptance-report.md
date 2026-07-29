# PAE v0.3.0 第四批验收执行报告

**报告名称**：PAE v0.3.0 第四批验收执行报告
**执行日期**：2026-07-27
**基线 Commit**：33781d8
**版本**：v1.0
**执行人**：AI Agent（Trae）

---

## 一、执行摘要

### 1.1 执行范围

第四批验收覆盖 TC-046～TC-050 共 5 个正式 TC、7 个验证子场景，目标是关闭 C-17（CLI `requirement create` 端到端）和 C-18（CLI `run` 兼容命令端到端）的"部分覆盖"缺口。

### 1.2 执行结果概览

| 指标 | 结果 |
|---|---|
| 正式 TC | 5（TC-046～TC-050） |
| 正式 TC PASS | 4（TC-046、TC-047、TC-048、TC-049） |
| 正式 TC FAIL | 1（TC-050，产物含 sourcePath 个人绝对路径） |
| 验证子场景 | 7（TC-049 含 A/B/C 三个子场景） |
| 子场景 PASS | 6（TC-046、TC-047、TC-048、TC-049-A/B/C） |
| 子场景 FAIL | 1（TC-050） |
| 新发现缺陷 | 1（PAE-030-015） |
| 自动化测试 | 70/70 PASS（Node.js）、70/70 PASS（Vitest） |
| C-17 状态 | **已覆盖**（TC-046、TC-048、TC-049 已建立 CLI 进程级证据） |
| C-18 状态 | **已覆盖**（TC-047 已建立 CLI 进程级证据） |
| C-28 状态 | **部分覆盖**（TC-050 失败，PAE-030-015 待修复） |
| C-30 状态 | **未覆盖**（第五批待执行） |
| 第四批整体结论 | **已执行，未通过** |

### 1.3 关键结论

1. **C-17、C-18 的 CLI 功能覆盖证据已建立**：TC-046～TC-049 提供了 CLI 进程级执行证据；
2. **C-28 因 TC-050 失败调整为部分覆盖**：TC-050 验证产物路径不含个人绝对路径失败，PAE-030-015 待修复；
3. **C-08 范围已明确**：C-08 当前仅代表 MasterGo 数据输出（JSON 产物）已覆盖，不含 MasterGo 实际画布；
4. **新增 C-30 覆盖点**：MasterGo 实际画布成果物作为新增专项覆盖点，由第五批执行；
5. **新发现 PAE-030-015**：`sourcePath` 字段在 `requirement.json` 和 `manifest.json` 中泄露个人绝对路径；
6. **v0.3.0 全量验收仍未完成**：PAE-030-015 待修复，C-28 未完全覆盖，第五批未执行。

---

## 二、逐项执行结果

### 2.1 TC-046：CLI `requirement create` 命令端到端执行

| 项目 | 内容 |
|---|---|
| **实际命令** | `npx tsx src/cli.ts requirement create examples/b2b-requirement.md --project hr-system --id REQ-001 --name leave-request --output-root /tmp/pae-fourth-batch/tc046` |
| **输入** | examples/b2b-requirement.md + --project hr-system --id REQ-001 --name leave-request |
| **退出码** | 0 |
| **stdout** | `PAE 已完成 10 个阶段。Run ID: db22a18a-e6e4-44ce-874b-0c9f8ccc1f85 需求设计包: /tmp/pae-fourth-batch/tc046/hr-system/requirements/REQ-001-leave-request` |
| **stderr** | 无 |
| **产物路径** | `/tmp/pae-fourth-batch/tc046/hr-system/requirements/REQ-001-leave-request/` |
| **验证结果** | 1. project.json 存在，projectId=hr-system ✅<br>2. requirement.json 存在，元数据正确 ✅<br>3. manifest.json 中 10 阶段全部 completed ✅<br>4. 10 阶段产物文件全部存在 ✅ |
| **PASS/FAIL** | **PASS** |
| **证据文件** | `/tmp/pae-fourth-batch/tc046/hr-system/project.json`<br>`/tmp/pae-fourth-batch/tc046/hr-system/requirements/REQ-001-leave-request/manifest.json` |
| **关联缺陷** | 无 |

### 2.2 TC-047：CLI `run` 兼容命令端到端执行

| 项目 | 内容 |
|---|---|
| **实际命令** | `npx tsx src/cli.ts run examples/b2b-requirement.md --out /tmp/pae-fourth-batch/tc047/legacy-example --project hr-system --id REQ-001 --name leave-request` |
| **输入** | examples/b2b-requirement.md + --out + --project + --id + --name |
| **退出码** | 0 |
| **stdout** | `PAE 已完成 10 个阶段。Run ID: e00746f6-8a3a-40b0-9074-c6cce3bb37fb 需求设计包: /tmp/pae-fourth-batch/tc047/hr-system/requirements/REQ-001-leave-request` |
| **stderr** | 无 |
| **产物路径** | `/tmp/pae-fourth-batch/tc047/hr-system/requirements/REQ-001-leave-request/` |
| **验证结果** | 1. project.json 存在，projectId=hr-system ✅<br>2. requirement.json 存在，元数据正确 ✅<br>3. manifest.json 中 10 阶段全部 completed ✅<br>4. 10 阶段产物文件全部存在 ✅<br>5. `run` 与 `requirement create` 生成相同目录结构 ✅ |
| **PASS/FAIL** | **PASS** |
| **证据文件** | `/tmp/pae-fourth-batch/tc047/hr-system/project.json`<br>`/tmp/pae-fourth-batch/tc047/hr-system/requirements/REQ-001-leave-request/manifest.json` |
| **关联缺陷** | 无 |

### 2.3 TC-048：CLI 异常退出码与错误信息

| 项目 | 内容 |
|---|---|
| **实际命令** | `npx tsx src/cli.ts requirement create test/fixtures/empty-requirement.md --project hr-system --id REQ-001 --name leave-request --output-root /tmp/pae-fourth-batch/tc048` |
| **输入** | test/fixtures/empty-requirement.md（0 字节空文件） |
| **退出码** | 1 |
| **stdout** | 无 |
| **stderr** | `需求文件内容无效：empty-requirement.md 请至少提供非空的一级标题和需求正文。` |
| **产物路径** | `/tmp/pae-fourth-batch/tc048/`（目录为空，无文件生成） |
| **验证结果** | 1. 退出码为 1 ✅<br>2. 错误信息明确（"需求文件内容无效"）✅<br>3. outputRoot 下未生成任何文件 ✅ |
| **PASS/FAIL** | **PASS** |
| **证据文件** | `/tmp/pae-fourth-batch/tc048/`（空目录） |
| **关联缺陷** | 无 |

### 2.4 TC-049：CLI 参数缺失/非法（3 个子场景）

#### TC-049-A：必填参数缺失

| 项目 | 内容 |
|---|---|
| **实际命令** | `npx tsx src/cli.ts requirement create examples/b2b-requirement.md` |
| **退出码** | 1 |
| **stderr** | `缺少 --project、--id 或 --name。` + 完整帮助信息 |
| **PASS/FAIL** | **PASS** |
| **证据** | 退出码 1，错误信息明确指向具体问题 |

#### TC-049-B：revision 非法

| 项目 | 内容 |
|---|---|
| **实际命令** | `npx tsx src/cli.ts requirement create examples/b2b-requirement.md --project hr-system --id REQ-001 --name leave-request --revision abc` |
| **退出码** | 1 |
| **stderr** | `--revision 必须是大于等于 1 的整数。` |
| **PASS/FAIL** | **PASS** |
| **证据** | 退出码 1，错误信息明确 |

#### TC-049-C：未知参数

| 项目 | 内容 |
|---|---|
| **实际命令** | `npx tsx src/cli.ts requirement create examples/b2b-requirement.md --project hr-system --id REQ-001 --name leave-request --unknown-flag` |
| **退出码** | 1 |
| **stderr** | `未知参数：--unknown-flag 请执行 requirement create --help 查看支持的参数。` |
| **PASS/FAIL** | **PASS** |
| **证据** | 退出码 1，错误信息明确 |

### 2.5 TC-050：CLI 个人绝对路径与路径格式检查

| 项目 | 内容 |
|---|---|
| **实际命令** | `npx tsx src/cli.ts requirement create examples/b2b-requirement.md --project hr-system --id REQ-001 --name leave-request --output-root /tmp/pae-fourth-batch/tc050-create-output` 及 `npx tsx src/cli.ts run examples/b2b-requirement.md --out /tmp/pae-fourth-batch/tc050-run-output/hr-system --project hr-system --id REQ-001 --name leave-request` |
| **退出码** | 0（两条命令均成功执行） |
| **CLI stdout 扫描** | ✅ 干净，无个人绝对路径泄露 |
| **产物文件扫描** | ⚠️ 发现个人绝对路径泄露 |
| **详细发现** | 1. `requirement.json` 中 `sourcePath` 字段：`"sourcePath": "/Users/summerjaney/Documents/Project/pd-ai-engine/examples/b2b-requirement.md"` <br> 2. `manifest.json` 中 `sourcePath` 字段：同上 |
| **扫描范围** | `/Users/`、`/home/`、`\Users\` 模式 |
| **命中文件** | tc050-create-output/hr-system/.../requirement.json、manifest.json<br>tc050-run-output/hr-system/.../requirement.json、manifest.json |
| **其他文件** | requirement-index.md、project.json、stage 文件（05~10）均未检测到个人路径 ✅ |
| **PASS/FAIL** | **FAIL**（产物文件含个人绝对路径，不符合验收标准） |
| **证据文件** | `grep -rn '/Users/' /tmp/pae-fourth-batch/tc050-*` 输出 |
| **关联缺陷** | **PAE-030-015** |

---

## 三、覆盖状态更新

### 3.1 C-17：CLI `requirement create` 命令

| 项目 | 更新前 | 更新后 |
|---|---|---|
| 覆盖状态 | 部分覆盖 | **已覆盖**（CLI 功能覆盖） |
| 新增证据 | — | TC-046（端到端执行）、TC-048（异常退出码）、TC-049（参数校验） |
| 覆盖点 | W-01、D-05（2 项自动化测试） | W-01、D-05 + TC-046/048/049（有效 CLI 进程级证据） |

### 3.2 C-18：CLI `run` 兼容命令

| 项目 | 更新前 | 更新后 |
|---|---|---|
| 覆盖状态 | 部分覆盖 | **已覆盖**（CLI 功能覆盖） |
| 新增证据 | — | TC-047（端到端执行） |
| 覆盖点 | W-02、W-09（2 项自动化测试） | W-02、W-09 + TC-047（有效 CLI 进程级证据） |

### 3.3 C-28：敏感信息和个人绝对路径

| 项目 | 更新前 | 更新后 |
|---|---|---|
| 覆盖状态 | 已覆盖 | **部分覆盖** |
| 缺口原因 | — | TC-050 失败，产物文件中 sourcePath 泄露个人绝对路径 |
| 缺陷编号 | — | PAE-030-015 |
| 待修复项 | — | 需修复后重新执行 TC-050 验证 |
| 当前证据 | L-04、L-10、L-11（夹具检查通过） | 夹具检查通过，但 CLI 产物检查失败 |

---

## 四、自动化测试结果

| 测试套件 | 通过 | 失败 | 总数 |
|---|---|---|---|
| npm test（Node.js） | 70 | 0 | 70 |
| npx vitest run（Vitest） | 70 | 0 | 70 |

两套自动化测试均无退化，与基线一致。

---

## 五、新发现缺陷

### PAE-030-015：sourcePath 个人绝对路径泄露

| 项目 | 内容 |
|---|---|
| **缺陷编号** | PAE-030-015 |
| **缺陷标题** | requirement.json 和 manifest.json 中 sourcePath 字段存储个人绝对路径 |
| **严重程度** | major |
| **关联 TC** | TC-050 |
| **缺陷描述** | CLI 执行成功后，产物文件中的 `sourcePath` 字段存储了输入文件的绝对路径，包含用户目录前缀 `/Users/summerjaney/`。该路径在 `requirement.json` 和 `manifest.json` 中均有出现。 |
| **复现步骤** | 1. 执行 `npx tsx src/cli.ts requirement create examples/b2b-requirement.md --project hr-system --id REQ-001 --name leave-request --output-root <临时目录>`；2. 检查 `<临时目录>/hr-system/requirements/REQ-001-leave-request/requirement.json` 和 `manifest.json`；3. 搜索 `sourcePath` 字段 |
| **预期结果** | sourcePath 应为相对路径或不包含个人用户目录前缀 |
| **实际结果** | sourcePath 为 `/Users/summerjaney/Documents/Project/pd-ai-engine/examples/b2b-requirement.md` |
| **影响范围** | 所有 CLI 执行生成的 requirement.json 和 manifest.json |
| **根因分析** | 初步怀疑 `prepareRequirementOutput()` 或 `workflow.run()` 在记录输入源时直接使用了 `path.resolve()` 后的绝对路径，未做相对路径转换或脱敏处理。待代码定位确认。 |
| **处理状态** | **已记录，待修复** |
| **修复优先级** | 中——不影响功能正确性，但涉及敏感信息泄露风险 |

---

## 六、当前真实 git status

```
$ git diff --check
# 无输出，无空白错误

$ git status --short --untracked-files=all
?? docs/testing/pae-v0.3.0-acceptance-baseline.md
?? docs/testing/pae-v0.3.0-fifth-batch-mastergo-canvas-acceptance-plan.md
?? docs/testing/pae-v0.3.0-fifth-batch-pre-execution-mechanism-verification.md
?? docs/testing/pae-v0.3.0-fourth-batch-acceptance-plan.md
?? docs/testing/pae-v0.3.0-fourth-batch-acceptance-report.md
?? docs/testing/pae-v0.3.0-fourth-batch-result-correction-summary.md
?? docs/testing/pae-v0.3.0-full-acceptance-coverage-audit.md

$ git diff --stat
# 无输出（未跟踪文件不在 diff 范围内）

$ git diff --name-status
# 无输出（未跟踪文件不在 diff 范围内）
```

**核查结论**：
- 仅 docs/testing/ 目录下 7 份测试管理文档为未跟踪文件；
- 第四批执行报告、第五批计划、机制核查报告、第四批纠正摘要、第四批计划、验收基线、全量覆盖核查报告均已包含在未跟踪列表内；
- src/、test/、examples/、配置文件、夹具均无变更；
- 无普通 output、tmp、日志或运行产物纳入 Git；
- 无业务代码变更；
- 未发现测试管理文档、业务代码或 Git 纳管文件新增个人绝对路径；第四批临时产物中已确认存在 sourcePath 个人绝对路径泄露，并登记为 PAE-030-015。

---

## 七、第四批完成状态

| 状态 | 结论 |
|---|---|
| 第四批 TC 执行 | **已执行** |
| TC-046～TC-049 | **PASS**（4 个 TC） |
| TC-050 | **FAIL**（产物含个人绝对路径） |
| C-17 覆盖状态 | **已覆盖**（CLI 功能覆盖证据已建立） |
| C-18 覆盖状态 | **已覆盖**（CLI 功能覆盖证据已建立） |
| C-28 覆盖状态 | **部分覆盖**（TC-050 失败，PAE-030-015 待修复） |
| 自动化测试 | **70/70 PASS**（无退化） |
| 第四批整体结论 | **已执行，未通过** |

---

## 八、全量验收状态判定

| 判定项 | 结果 |
|---|---|
| C-17、C-18 CLI 功能覆盖 | ✅ 已覆盖 |
| C-28 敏感路径覆盖 | ⚠️ 部分覆盖（PAE-030-015 待修复） |
| C-08 范围明确化 | ✅ 已明确（仅数据产物） |
| C-30 MasterGo 实际画布 | ❌ 未覆盖（第五批待执行） |
| PAE-030-015 | ⚠️ 已记录，待修复和回归 |
| 覆盖点总计 | 28 已覆盖 + 1 部分覆盖（C-28）+ 1 未覆盖（C-30）= 30 项 |
| v0.3.0 全量验收 | **尚未完成** |
| 进入发布前检查 | **暂不进入** |

---

## 九、后续步骤

1. **修复 PAE-030-015**：定位并修复 sourcePath 个人绝对路径泄露问题；
2. **TC-050 回归**：修复后重新执行 TC-050，验证 C-28 升级为已覆盖；
3. **第五批执行**：修复完成后执行 [pae-v0.3.0-fifth-batch-mastergo-canvas-acceptance-plan.md](pae-v0.3.0-fifth-batch-mastergo-canvas-acceptance-plan.md)，完成 MasterGo 实际画布全链路验收；
4. **第五批完成后**：重新判断 v0.3.0 全量验收状态；
5. **通过后**：方可进入发布前检查。

---

## 十、关联文档

| 文档 | 路径 |
|---|---|
| 第四批验收计划 | [docs/testing/pae-v0.3.0-fourth-batch-acceptance-plan.md](pae-v0.3.0-fourth-batch-acceptance-plan.md) |
| 第五批验收计划 | [docs/testing/pae-v0.3.0-fifth-batch-mastergo-canvas-acceptance-plan.md](pae-v0.3.0-fifth-batch-mastergo-canvas-acceptance-plan.md) |
| 全量验收覆盖核查报告 | [docs/testing/pae-v0.3.0-full-acceptance-coverage-audit.md](pae-v0.3.0-full-acceptance-coverage-audit.md) |
| 验收基线 | [docs/testing/pae-v0.3.0-acceptance-baseline.md](pae-v0.3.0-acceptance-baseline.md) |

---

**报告路径**：docs/testing/pae-v0.3.0-fourth-batch-acceptance-report.md