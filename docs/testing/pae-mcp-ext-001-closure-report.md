# MCP-EXT-001 闭环报告

**建立日期**：2026-07-30
**关联版本**：PAE v0.3.1
**基线 Commit**：1557acb05bfd1fc163040654cf008b12f2673a84
**报告版本**：v1.0
**关联文档**：pae-mcp-ext-001-closure-plan.md、pae-v0.3.0-mcp-external-risk-acceptance.md

---

## 一、背景

### 1.1 MCP-EXT-001 原始定义

MCP-EXT-001 是 PAE v0.3.0 第五批验收中发现的外部工具能力边界风险：MasterGo MCP 在接收非法或严重不完整 HTML 时，可能返回成功并生成残缺画布，存在被误认为正式成果的风险。

### 1.2 TC-054 为什么属于 INVALID TEST DESIGN

TC-054 原测试使用异常的 `mastergo-data.json` 作为输入，但 MasterGo MCP 的实际画布提交链路主要接受 HTML 字符串（`code` 参数）或 HTML 文件路径（`filePath` 参数）。测试输入与接口能力不匹配，因此 TC-054 被判定为 BLOCKED / INVALID TEST DESIGN。

### 1.3 TC-054-R 历史结果

TC-054-R 使用异常 HTML 作为替代用例，结果为 **FAIL**（永久保留）。MCP 对残缺 HTML 返回成功并生成残缺画布，满足 FAIL 判定标准（"MCP 无任何明确响应，或产生不可识别、可能被误认为正式成果的残缺画布"）。

### 1.4 v0.3.1 发布基线

PAE v0.3.1 基于 v0.3.0 正式验收结果发布，发布状态为 RELEASED，PASS WITH ACCEPTED RISK。MCP-EXT-001 是唯一保留风险，状态为 ACCEPTED EXTERNAL RISK。

## 二、测试环境

| 项目 | 内容 |
|---|---|
| 测试日期 | 2026-07-30 |
| Trae 版本 | 3.5.69（CLI 1.107.1） |
| MCP 名称 | MasterGo-Vibe-MCP |
| MCP Package | @mastergo/vibe-mcp |
| MCP 当前版本 | 1.0.26 |
| MCP latestVersion | 1.0.26 |
| MasterGo 文件标识 | 新文件（local-199596058014266） |
| 连接状态 | 已连接 |
| 测试文件类型 | 独立 MasterGo 测试设计文件（非业务设计文件） |
| 项目根目录 | /Users/summerjaney/Documents/Project/pd-ai-engine |

## 三、测试用例与结果

### 3.1 EXT-TC-001：合法完整 HTML 基准测试

| 项目 | 内容 |
|---|---|
| 输入文件 | ext-tc-001-valid.html（443 字节） |
| 输入内容 | 完整 HTML 结构，含标题"MCP-EXT-001-VALID"和唯一标识 |
| 调用工具 | submit_page_to_canvas |
| 请求参数 | filePath=/tmp/mcp-ext-001-tests/inputs/ext-tc-001-valid.html |
| MCP 响应 | ✅ 设计稿生成已成功完成 |
| 预期结果 | 明确成功，画布真实生成 |
| 实际结果 | MCP 返回成功；画布截图确认已生成完整VALID页面，标题、说明文字和唯一标识均清晰可见 |
| 判定 | **PASS**（MCP 响应层面） |
| 响应文件 | responses/ext-tc-001-response.txt |

### 3.2 EXT-TC-002：空 HTML 文件

| 项目 | 内容 |
|---|---|
| 输入文件 | ext-tc-002-empty.html（0 字节） |
| 输入内容 | 空文件 |
| 调用工具 | submit_page_to_canvas |
| 请求参数 | filePath=/tmp/mcp-ext-001-tests/inputs/ext-tc-002-empty.html |
| MCP 响应 | 参数错误: 请提供非空 code 或 filePath |
| 预期结果 | 明确拒绝 |
| 实际结果 | MCP 正确拒绝空输入，返回清晰错误信息 |
| 判定 | **PASS** |
| 响应文件 | responses/ext-tc-002-response.txt |

### 3.3 EXT-TC-003：非法残缺 HTML

| 项目 | 内容 |
|---|---|
| 输入文件 | ext-tc-003-incomplete.html（30 字节） |
| 输入内容 | `<div><span>MCP-EXT-001-INVALID`（未闭合标签，无结束标签） |
| 调用工具 | submit_page_to_canvas |
| 请求参数 | filePath=/tmp/mcp-ext-001-tests/inputs/ext-tc-003-incomplete.html |
| MCP 响应 | ✅ 设计稿生成已成功完成 |
| 预期结果 | 应拒绝或明确报告输入异常 |
| 实际结果 | MCP 接受残缺 HTML 并返回成功 |
| 判定 | **FAIL**（风险确认：MCP 接受非法残缺 HTML） |
| 响应文件 | responses/ext-tc-003-response.txt |

### 3.4 EXT-TC-004：严重不完整 HTML

| 项目 | 内容 |
|---|---|
| 输入文件 | ext-tc-004-severe.html（1 字节） |
| 输入内容 | `<`（仅 1 字节，严重不完整） |
| 调用工具 | submit_page_to_canvas |
| 请求参数 | filePath=/tmp/mcp-ext-001-tests/inputs/ext-tc-004-severe.html |
| MCP 响应 | ❌ 发送失败: CreateNodesFailed |
| 预期结果 | 应拒绝 |
| 实际结果 | MCP 正确拒绝严重不完整 HTML |
| 判定 | **PASS** |
| 响应文件 | responses/ext-tc-004-response.txt |

### 3.5 EXT-TC-005：不存在的本地文件路径

| 项目 | 内容 |
|---|---|
| 输入文件 | ext-tc-005-nonexistent.html（不存在） |
| 输入内容 | 不存在的文件路径 |
| 调用工具 | submit_page_to_canvas |
| 请求参数 | filePath=/tmp/mcp-ext-001-tests/inputs/ext-tc-005-nonexistent.html |
| MCP 响应 | ❌ 读取文件失败: ENOENT: no such file or directory |
| 预期结果 | 明确失败，无画布变化 |
| 实际结果 | MCP 正确拒绝，返回清晰的文件不存在错误 |
| 判定 | **PASS** |
| 响应文件 | responses/ext-tc-005-response.txt |

### 3.6 EXT-TC-006：相同合法 HTML 重复提交

| 项目 | 内容 |
|---|---|
| 输入文件 | ext-tc-001-valid.html（443 字节，与 EXT-TC-001 相同） |
| 输入内容 | 与 EXT-TC-001 完全相同的合法 HTML |
| 调用工具 | submit_page_to_canvas（第二次调用） |
| 请求参数 | filePath=/Users/summerjaney/Documents/Project/pd-ai-engine/docs/testing/evidence/mcp-ext-001/inputs/ext-tc-001-valid.html |
| MCP 响应 | ✅ 设计稿生成已成功完成 |
| 预期结果 | 记录外部 MCP 的真实重复提交语义 |
| 实际结果 | 画布截图显示图层面板出现多个"AI Generating Page"节点，组号从"组 3"递增为"组 7"，确认追加行为 |
| 判定 | **RECORDED** — 追加行为（与 TC-055 历史观察一致） |
| 响应文件 | responses/ext-tc-006-response.txt |

### 3.7 EXT-TC-007：成功响应与画布一致性

| 项目 | 内容 |
|---|---|
| 目标 | 针对所有返回成功的调用，复核画布实际结果 |
| 涉及用例 | EXT-TC-001、EXT-TC-003、EXT-TC-006 |
| 验证方法 | 通过画布截图验证页面、节点、唯一文本是否存在 |
| 当前状态 | **已完成** — 基于 6 个截图文件条目完成一致性判断；这些文件实际对应 3 张不同的 MasterGo 工作区全景截图，每张同时覆盖 canvas 与 layers 两类逻辑证据 |
| 关键核查项 | 1. 页面是否存在 ✅ 2. 节点是否存在 ✅ 3. 唯一文本"MCP-EXT-001-VALID"是否存在 ✅ 4. 是否为空画布 ❌（EXT-TC-003 生成极简内容）5. 是否产生非预期页面或节点 ✅（EXT-TC-006 追加行为已记录）|

## 四、成功响应与画布一致性矩阵

| 用例 | MCP 响应 | 预期画布 | 实际画布 | 一致性 |
|---|---|---|---|---|
| EXT-TC-001 | ✅ 成功 | 页面含"MCP-EXT-001-VALID" | 生成完整 VALID 页面，标题、说明文字、标识框均可见 | ✅ 一致 |
| EXT-TC-003 | ✅ 成功 | 应拒绝/不生成 | 生成极简 INVALID 页面（仅文字，无完整 HTML 结构） | ⚠️ 不一致 — MCP 返回成功但实际内容不完整，风险确认 |
| EXT-TC-006 | ✅ 成功 | 覆盖/追加/重复 | 追加新页面（图层面板多个 AI Generating Page，组号递增） | ✅ 一致 — 追加行为已记录 |

## 五、外部限制

### 5.1 已确认的外部限制

| 限制项 | 描述 | 影响范围 |
|---|---|---|
| MCP 接受非法残缺 HTML | EXT-TC-003 证明 MCP 接受未闭合标签的残缺 HTML 并返回成功 | 外部 MCP 输入校验边界 |
| MCP 对不同残缺程度的 HTML 处理不一致 | 轻度残缺（未闭合标签）被接受，严重残缺（仅 `<`）被拒绝 | 外部 MCP HTML 转换能力边界 |
| 浏览器无法访问 MasterGo 桌面画布 | MasterGo Web 返回 500 错误，桌面端画布无法通过 MCP 工具直接截图 | 自动化截图限制 |
| boolean 参数序列化问题 | 历史已发现 run_mcp 调用中 boolean 参数被序列化为 string 的问题 | MCP 调用链限制（本轮未触发） |

### 5.2 未触发的限制

- 空 HTML 正确拒绝 ✅
- 严重不完整 HTML 正确拒绝 ✅
- 不存在的文件路径正确拒绝 ✅

## 六、对 PAE v0.3.1 的影响

| 维度 | 影响描述 |
|---|---|
| 正常业务场景 | **不影响**。PAE 正常业务链路生成的 HTML 是完整、规范的，不会出现 EXT-TC-003 类型的残缺 HTML |
| 异常输入场景 | 风险主要出现在人为构造或外部传入非法 HTML 的场景，非 PAE 正常业务流程 |
| PAE 代码缺陷 | **未发现**。所有测试结果指向 MasterGo MCP 输入校验和 HTML 转换能力边界，非 PAE 业务代码缺陷 |
| 发布状态 | **不影响**。PAE v0.3.1 发布状态维持 RELEASED，PASS WITH ACCEPTED RISK |

## 七、PAE 侧临时使用建议

| 建议 | 说明 | 优先级 |
|---|---|---|
| 提交前 HTML 结构校验 | 在调用 submit_page_to_canvas 前，对 HTML 做基本结构校验（闭合标签检查、最小长度检查） | 中 |
| 成功后画布复核 | 在 MCP 返回成功后，通过截图或节点读取复核画布实际内容 | 中 |
| 原始响应回写 | 将 MCP 原始响应回写到 mastergo-result.json，便于追溯 | 低 |

## 八、后续版本候选规避方向

以下为候选方向，**不在本轮实现**，也不创建 v0.4.0 需求或代码：

| 方向 | 说明 |
|---|---|
| 提交前输入校验 | 在 PAE ↔ MasterGo MCP 接入层增加 HTML 结构校验（基本闭合、标签白名单、属性合法性） |
| 最小可用性检查 | 在调用 submit_page_to_canvas 前对输入 HTML 做最小可用性检查（至少包含一个有效可视元素） |
| 成功后画布复核 | MCP 返回成功后，主动通过 get_selection_node 或 get_screenshot 复核画布实际状态 |
| 重复提交策略 | 明确重复提交的预期行为，在文档中说明并在必要时增加防护 |
| 原始响应记录 | 在 mastergo-result.json 中记录 MCP 原始响应，便于问题追溯 |

## 九、MCP-EXT-001 最终状态

### 9.1 判定依据

| 条件 | 状态 | 说明 |
|---|---|---|
| 空 HTML 被明确拒绝 | ✅ 满足 | EXT-TC-002 通过 |
| 非法残缺 HTML 被明确拒绝 | ❌ 不满足 | EXT-TC-003 证明 MCP 接受残缺 HTML |
| 严重不完整 HTML 被明确拒绝 | ✅ 满足 | EXT-TC-004 通过 |
| 不存在的文件路径被明确拒绝 | ✅ 满足 | EXT-TC-005 通过 |
| 所有成功响应均已完成真实画布复核 | ✅ 满足 | EXT-TC-001、EXT-TC-003、EXT-TC-006均已完成截图核查；EXT-TC-003确认存在成功响应但接受残缺HTML的外部限制 |
| 证据完整 | ✅ 满足 | 6 个截图文件条目已全部归档，实际对应 3 张不同原始全景截图；一致性矩阵已填写 |

### 9.2 最终状态判定

**CLOSED AS CONFIRMED EXTERNAL LIMITATION**

判定理由：

1. EXT-TC-003 明确证明 MasterGo MCP v1.0.26 接受非法残缺 HTML（`<div><span>MCP-EXT-001-INVALID`）并返回成功，这是 MCP 输入校验和 HTML 转换能力的边界
2. 该风险属于外部工具能力边界，不是 PAE 业务代码缺陷
3. 风险不影响 PAE 正常业务链路（PAE 生成的 HTML 是完整规范的）
4. 风险影响范围已明确（仅影响人为构造的非法 HTML 场景）
5. 历史 TC-054-R FAIL 结论与本轮 EXT-TC-003 结果一致，相互印证
6. 3 张 MasterGo 工作区全景截图已全部归档（覆盖 6 个 canvas/layers 逻辑证据项），完成一致性验证

### 9.3 状态说明

"CLOSED AS CONFIRMED EXTERNAL LIMITATION" 表示：
- 风险真实存在，已通过真实环境测试确认
- 风险属于外部 MCP 能力边界，不是 PAE 缺陷
- 风险影响范围已明确（仅影响人为构造的非法 HTML 场景）
- PAE 正常业务链路不受影响
- 已完成证据记录和影响评估
- PAE 侧规避方向已记录

## 十、证据索引

### 10.1 已归档证据

| 序号 | 证据类型 | 文件路径 | 说明 | 校验状态 |
|---|---|---|---|---|
| 1 | 输入文件 | evidence/mcp-ext-001/inputs/ext-tc-001-valid.html | EXT-TC-001 合法完整 HTML | ✅ 已归档 |
| 2 | 输入文件 | evidence/mcp-ext-001/inputs/ext-tc-002-empty.html | EXT-TC-002 空 HTML（0 字节） | ✅ 已归档 |
| 3 | 输入文件 | evidence/mcp-ext-001/inputs/ext-tc-003-incomplete.html | EXT-TC-003 非法残缺 HTML | ✅ 已归档 |
| 4 | 输入文件 | evidence/mcp-ext-001/inputs/ext-tc-004-severe.html | EXT-TC-004 严重不完整 HTML | ✅ 已归档 |
| 5 | MCP 响应 | evidence/mcp-ext-001/responses/ext-tc-001-response.txt | EXT-TC-001 MCP 原始响应 | ✅ 已归档 |
| 6 | MCP 响应 | evidence/mcp-ext-001/responses/ext-tc-002-response.txt | EXT-TC-002 MCP 原始响应 | ✅ 已归档 |
| 7 | MCP 响应 | evidence/mcp-ext-001/responses/ext-tc-003-response.txt | EXT-TC-003 MCP 原始响应 | ✅ 已归档 |
| 8 | MCP 响应 | evidence/mcp-ext-001/responses/ext-tc-004-response.txt | EXT-TC-004 MCP 原始响应 | ✅ 已归档 |
| 9 | MCP 响应 | evidence/mcp-ext-001/responses/ext-tc-005-response.txt | EXT-TC-005 MCP 原始响应 | ✅ 已归档 |
| 10 | MCP 响应 | evidence/mcp-ext-001/responses/ext-tc-006-response.txt | EXT-TC-006 MCP 原始响应 | ✅ 已归档 |

### 10.2 已归档的截图证据

| 序号 | 截图文件名 | 关联用例 | 内容说明 | 当前状态 |
|---|---|---|---|---|
| 1 | EXT-TC-001-canvas.png | EXT-TC-001 | MasterGo 工作区全景截图：中央画布显示 MCP-EXT-001-VALID 页面内容，左侧图层面板已展开 | ✅ 已归档（3420×2146，PNG，内容已人工核查） |
| 2 | EXT-TC-001-layers.png | EXT-TC-001 | 与 EXT-TC-001-canvas.png 为同一张原始全景截图（逐字节相同），同时承担 layers 证据分类 | ✅ 已归档（3420×2146，PNG，内容已人工核查） |
| 3 | EXT-TC-003-canvas.png | EXT-TC-003 | MasterGo 工作区全景截图：中央画布显示残缺 HTML 生成的页面，左侧图层面板已展开 | ✅ 已归档（3420×2146，PNG，内容已人工核查） |
| 4 | EXT-TC-003-layers.png | EXT-TC-003 | 与 EXT-TC-003-canvas.png 为同一张原始全景截图（逐字节相同），同时承担 layers 证据分类 | ✅ 已归档（3420×2146，PNG，内容已人工核查） |
| 5 | EXT-TC-006-canvas.png | EXT-TC-006 | MasterGo 工作区全景截图：中央画布显示重复提交后的状态，左侧图层面板已展开含多个 AI Generating Page 节点 | ✅ 已归档（3420×2146，PNG，内容已人工核查） |
| 6 | EXT-TC-006-layers.png | EXT-TC-006 | 与 EXT-TC-006-canvas.png 为同一张原始全景截图（逐字节相同），同时承担 layers 证据分类 | ✅ 已归档（3420×2146，PNG，内容已人工核查） |

**截图统计口径说明：**

- 截图证据文件条目：6 个
- 不同原始截图内容：3 张（EXT-TC-001、EXT-TC-003、EXT-TC-006 各 1 张）
- 每张均为 MasterGo 工作区全景截图，同时包含中央画布和已展开的左侧图层面板
- 每组 canvas 与 layers 文件逐字节相同，是同一张原始全景截图对应两个逻辑证据分类
- 3 张原始截图共同覆盖 6 个 canvas/layers 逻辑证据项
- 文件条目完整度：16/16（100%）
- 不重复实质证据：13 项，包括 4 个输入文件、6 个响应文件和 3 张不同原始截图
- 不需要另行拍摄独立 layers 截图

## 十一、未解决事项

| 事项 | 说明 | 处理方式 |
|---|---|---|
| boolean 参数序列化问题 | 历史已发现，本轮未触发 | 记录为已知外部限制，后续版本关注 |
| MasterGo Web 500 错误 | 浏览器无法访问 MasterGo Web 版 | 不影响桌面端 MCP 测试，需桌面端截图 |

## 十二、与历史结论的一致性

| 历史结论 | 本轮验证结果 | 一致性 |
|---|---|---|
| TC-054：BLOCKED / INVALID TEST DESIGN | 本轮使用正确的 HTML 输入接口（filePath），验证了接口能力 | ✅ 一致（原测试设计问题已确认） |
| TC-054-R：FAIL | EXT-TC-003 复现了 MCP 接受残缺 HTML 的行为 | ✅ 一致（风险行为再次确认） |
| MCP-EXT-001：ACCEPTED EXTERNAL RISK | 本轮通过真实环境测试确认风险存在 | ✅ 一致（风险已确认，闭环证据已完成归档） |
| MasterGo MCP 版本 1.0.25 | 当前版本 1.0.26（latest） | ✅ 版本升级，风险行为仍存在 |

## 十三、结论

MCP-EXT-001 已完成闭环，最终状态为 **CLOSED AS CONFIRMED EXTERNAL LIMITATION**。

核心结论：
1. MasterGo MCP v1.0.26 对空输入、严重不完整 HTML、不存在的文件路径均能正确拒绝
2. 但对轻度残缺 HTML（未闭合标签）接受并返回成功，属于 MCP 输入校验边界
3. 此风险属于外部工具能力边界，不是 PAE 代码缺陷
4. PAE 正常业务链路不受影响
5. 风险已完整记录，影响范围已明确，规避方向已归档
6. 3 张 MasterGo 工作区全景截图已全部归档（覆盖 6 个 canvas/layers 逻辑证据项），完成一致性验证

---

**报告完成日期**：2026-07-30
**最终状态**：CLOSED AS CONFIRMED EXTERNAL LIMITATION
**是否影响 PAE v0.3.1 已发布状态**：否
**是否发现 PAE 自身代码缺陷**：否
