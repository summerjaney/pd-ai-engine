# MCP-EXT-001 闭环计划

**建立日期**：2026-07-30
**关联版本**：PAE v0.3.1
**基线 Commit**：1557acb05bfd1fc163040654cf008b12f2673a84
**关联文档**：pae-v0.3.0-mcp-external-risk-acceptance.md、第五批验收报告

---

## 一、背景

MCP-EXT-001 是 PAE v0.3.0 第五批验收中发现的外部工具能力边界风险：MasterGo MCP 在接收非法或严重不完整 HTML 时，可能返回成功并生成残缺画布，存在被误认为正式成果的风险。

历史 TC-054（BLOCKED / INVALID TEST DESIGN）和 TC-054-R（FAIL，永久保留）已记录此风险。v0.3.1 发布时将此风险列为唯一保留风险（ACCEPTED EXTERNAL RISK）。

本轮目标是在真实 MasterGo MCP 环境下，使用与接口能力匹配的 HTML 输入，补齐测试证据，给出 MCP-EXT-001 最终状态。

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
| 测试文件类型 | 独立 MasterGo 测试设计文件 |

## 三、测试用例

### EXT-TC-001：合法完整 HTML 基准测试

- **输入**：完整 HTML 结构，包含可见标题和唯一标识"MCP-EXT-001-VALID"
- **工具**：submit_page_to_canvas(filePath=合法HTML文件)
- **预期**：明确成功，且画布真实生成
- **实际结果**：✅ 成功（MCP 返回"设计稿生成已成功完成"）

### EXT-TC-002：空 HTML 文件

- **输入**：零字节 HTML 文件
- **工具**：submit_page_to_canvas(filePath=空HTML文件)
- **预期**：明确拒绝，不产生有效画布内容
- **实际结果**：✅ 正确拒绝（"参数错误: 请提供非空 code 或 filePath"）

### EXT-TC-003：非法残缺 HTML

- **输入**：`<div><span>MCP-EXT-001-INVALID`（未闭合标签）
- **工具**：submit_page_to_canvas(filePath=残缺HTML文件)
- **预期**：应拒绝或明确报告输入异常
- **实际结果**：⚠️ 接受并返回成功（"设计稿生成已成功完成"）— **风险确认**

### EXT-TC-004：严重不完整 HTML

- **输入**：`<`（仅 1 字节）
- **工具**：submit_page_to_canvas(filePath=严重残缺HTML文件)
- **预期**：应拒绝
- **实际结果**：✅ 正确拒绝（"发送失败: CreateNodesFailed"）

### EXT-TC-005：不存在的本地文件路径

- **输入**：明确不存在的临时 HTML 路径
- **工具**：submit_page_to_canvas(filePath=不存在的路径)
- **预期**：明确失败，无画布变化
- **实际结果**：✅ 正确拒绝（"读取文件失败: ENOENT: no such file or directory"）

### EXT-TC-006：相同合法 HTML 重复提交

- **输入**：连续两次提交 EXT-TC-001 的同一个文件
- **工具**：submit_page_to_canvas(filePath=合法HTML文件) × 2
- **预期**：记录外部 MCP 的真实重复提交语义（覆盖/追加/重复/幂等）
- **实际结果**：两次均返回成功；截图确认采用追加行为，生成新的AI Generating Page节点，未覆盖原页面

### EXT-TC-007：成功响应与画布一致性

- **目标**：针对所有返回成功的调用，复核画布实际结果
- **方法**：通过画布截图验证页面、节点、唯一文本是否存在
- **状态**：已完成；EXT-TC-001、003、006均已完成响应与画布一致性复核

## 四、证据清单

### 已归档证据（原始输入和 MCP 响应）

| 证据类型 | 文件路径 | 说明 |
|---|---|---|
| 输入文件 | docs/testing/evidence/mcp-ext-001/inputs/ext-tc-001-valid.html | EXT-TC-001 合法完整 HTML |
| 输入文件 | docs/testing/evidence/mcp-ext-001/inputs/ext-tc-002-empty.html | EXT-TC-002 空 HTML（0 字节） |
| 输入文件 | docs/testing/evidence/mcp-ext-001/inputs/ext-tc-003-incomplete.html | EXT-TC-003 非法残缺 HTML |
| 输入文件 | docs/testing/evidence/mcp-ext-001/inputs/ext-tc-004-severe.html | EXT-TC-004 严重不完整 HTML |
| MCP 响应 | docs/testing/evidence/mcp-ext-001/responses/ext-tc-001-response.txt | EXT-TC-001 MCP 原始响应 |
| MCP 响应 | docs/testing/evidence/mcp-ext-001/responses/ext-tc-002-response.txt | EXT-TC-002 MCP 原始响应 |
| MCP 响应 | docs/testing/evidence/mcp-ext-001/responses/ext-tc-003-response.txt | EXT-TC-003 MCP 原始响应 |
| MCP 响应 | docs/testing/evidence/mcp-ext-001/responses/ext-tc-004-response.txt | EXT-TC-004 MCP 原始响应 |
| MCP 响应 | docs/testing/evidence/mcp-ext-001/responses/ext-tc-005-response.txt | EXT-TC-005 MCP 原始响应 |
| MCP 响应 | docs/testing/evidence/mcp-ext-001/responses/ext-tc-006-response.txt | EXT-TC-006 MCP 原始响应 |

### 已归档的截图证据

| 截图文件名 | 关联用例 | 内容说明 | 当前状态 |
|---|---|---|---|
| EXT-TC-001-canvas.png | EXT-TC-001 | MasterGo 工作区全景截图：中央画布展示 MCP-EXT-001-VALID 页面内容，左侧图层面板已展开 | ✅ 已归档并通过校验 |
| EXT-TC-001-layers.png | EXT-TC-001 | 与 EXT-TC-001-canvas.png 为同一张原始全景截图（逐字节相同），同时承担 layers 证据分类 | ✅ 已归档并通过校验 |
| EXT-TC-003-canvas.png | EXT-TC-003 | MasterGo 工作区全景截图：中央画布展示由残缺 HTML 生成的页面内容，左侧图层面板已展开 | ✅ 已归档并通过校验 |
| EXT-TC-003-layers.png | EXT-TC-003 | 与 EXT-TC-003-canvas.png 为同一张原始全景截图（逐字节相同），同时承担 layers 证据分类 | ✅ 已归档并通过校验 |
| EXT-TC-006-canvas.png | EXT-TC-006 | MasterGo 工作区全景截图：中央画布展示重复提交后的画布状态，左侧图层面板已展开含多个 AI Generating Page 节点 | ✅ 已归档并通过校验 |
| EXT-TC-006-layers.png | EXT-TC-006 | 与 EXT-TC-006-canvas.png 为同一张原始全景截图（逐字节相同），同时承担 layers 证据分类 | ✅ 已归档并通过校验 |

**截图统计口径说明：**

- 截图证据文件条目：6 个
- 不同原始截图内容：3 张（EXT-TC-001、EXT-TC-003、EXT-TC-006 各 1 张）
- 每张均为 MasterGo 工作区全景截图，同时包含中央画布和已展开的左侧图层面板
- 每组 canvas 与 layers 文件逐字节相同，是同一张原始全景截图对应两个逻辑证据分类
- 3 张原始截图共同覆盖 6 个 canvas/layers 逻辑证据项
- 文件条目完整度：16/16（100%）
- 不重复实质证据：13 项，包括 4 个输入文件、6 个响应文件和 3 张不同原始截图
- 不需要另行拍摄独立 layers 截图

## 五、截图归档结果

3 张不同原始 MasterGo 工作区全景截图（覆盖 6 个文件条目）均已完成归档：

- 分辨率均为 3420×2146
- 文件头校验通过（PNG 格式：89 50 4E 47 0D 0A 1A 0A）
- 文件大小均大于 0 字节
- 每张全景截图同时包含中央画布内容和已展开的左侧图层面板
- 内容已人工核查，与关联用例描述一致
- 无敏感信息
- 无需用户继续补充截图

## 六、最终状态判定规则

满足以下全部条件时，MCP-EXT-001 可判定 **CLOSED**：
- 空 HTML 被明确拒绝 ✅
- 非法残缺 HTML 被明确拒绝 ❌（EXT-TC-003 接受了残缺 HTML）
- 严重不完整 HTML 被明确拒绝 ✅
- 不存在的文件路径被明确拒绝 ✅
- 所有成功响应均已完成真实画布复核 ✅
- 证据完整

最终状态：**CLOSED AS CONFIRMED EXTERNAL LIMITATION**

理由：
- EXT-TC-003 证明 MCP 确实接受非法残缺 HTML 并返回成功
- 这是外部 MCP 的能力边界，不是 PAE 代码缺陷
- 3 张 MasterGo 工作区全景截图已全部归档（覆盖 6 个 canvas/layers 逻辑证据项），完成一致性验证

## 七、本轮约束

- 不修改 src、test、package.json 等产品代码
- 不创建 Commit
- 不 git push
- 不修改 tag 或 Release
- 不开始 v0.4.0
- 所有变更仅位于 docs/testing/ 目录下
