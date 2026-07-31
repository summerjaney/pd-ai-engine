# MCP-EXT-001 闭环证据索引

**建立日期**：2026-07-30
**最后更新日期**：2026-07-30
**证据目录**：`docs/testing/evidence/mcp-ext-001/`
**关联文档**：pae-mcp-ext-001-closure-plan.md、pae-mcp-ext-001-closure-report.md

---

## 一、证据目录结构

```
docs/testing/evidence/mcp-ext-001/
├── evidence-index.md          ← 本文件
├── environment/                ← 环境信息
├── inputs/                     ← 测试输入文件
│   ├── ext-tc-001-valid.html
│   ├── ext-tc-002-empty.html
│   ├── ext-tc-003-incomplete.html
│   └── ext-tc-004-severe.html
├── responses/                  ← MCP 原始响应
│   ├── ext-tc-001-response.txt
│   ├── ext-tc-002-response.txt
│   ├── ext-tc-003-response.txt
│   ├── ext-tc-004-response.txt
│   ├── ext-tc-005-response.txt
│   └── ext-tc-006-response.txt
└── screenshots/                ← 画布截图（已归档）
    ├── EXT-TC-001-canvas.png      ✅ 已归档
    ├── EXT-TC-001-layers.png      ✅ 已归档
    ├── EXT-TC-003-canvas.png      ✅ 已归档
    ├── EXT-TC-003-layers.png      ✅ 已归档
    ├── EXT-TC-006-canvas.png      ✅ 已归档
    └── EXT-TC-006-layers.png      ✅ 已归档
```

## 二、环境信息

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

## 三、输入文件清单

| 序号 | 文件名 | 关联用例 | 内容说明 | 大小 | 校验状态 |
|---|---|---|---|---|---|
| 1 | ext-tc-001-valid.html | EXT-TC-001 | 完整 HTML，含唯一标识"MCP-EXT-001-VALID" | 443 字节 | ✅ 通过 |
| 2 | ext-tc-002-empty.html | EXT-TC-002 | 空 HTML 文件 | 0 字节 | ✅ 通过 |
| 3 | ext-tc-003-incomplete.html | EXT-TC-003 | 残缺 HTML：`<div><span>MCP-EXT-001-INVALID` | 30 字节 | ✅ 通过 |
| 4 | ext-tc-004-severe.html | EXT-TC-004 | 严重残缺 HTML：`<` | 1 字节 | ✅ 通过 |

## 四、MCP 响应清单

| 序号 | 文件名 | 关联用例 | 调用工具 | MCP 响应 | 判定 | 校验状态 |
|---|---|---|---|---|---|---|
| 1 | ext-tc-001-response.txt | EXT-TC-001 | submit_page_to_canvas | ✅ 设计稿生成已成功完成 | PASS | ✅ 已归档 |
| 2 | ext-tc-002-response.txt | EXT-TC-002 | submit_page_to_canvas | 参数错误: 请提供非空 code 或 filePath | PASS | ✅ 已归档 |
| 3 | ext-tc-003-response.txt | EXT-TC-003 | submit_page_to_canvas | ✅ 设计稿生成已成功完成 | FAIL（风险确认） | ✅ 已归档 |
| 4 | ext-tc-004-response.txt | EXT-TC-004 | submit_page_to_canvas | ❌ 发送失败: CreateNodesFailed | PASS | ✅ 已归档 |
| 5 | ext-tc-005-response.txt | EXT-TC-005 | submit_page_to_canvas | ❌ 读取文件失败: ENOENT | PASS | ✅ 已归档 |
| 6 | ext-tc-006-response.txt | EXT-TC-006 | submit_page_to_canvas | ✅ 设计稿生成已成功完成 | RECORDED（追加行为已确认） | ✅ 已归档 |

## 五、截图证据清单（已归档）

| 序号 | 截图文件名 | 关联用例 | 内容说明 | 当前状态 |
|---|---|---|---|---|
| 1 | EXT-TC-001-canvas.png | EXT-TC-001 | MasterGo 工作区全景截图：中央画布展示 MCP-EXT-001-VALID 页面内容，左侧图层面板已展开 | ✅ 已归档（3420×2146，PNG） |
| 2 | EXT-TC-001-layers.png | EXT-TC-001 | 与 EXT-TC-001-canvas.png 为同一张原始全景截图（逐字节相同），同时承担 layers 证据分类 | ✅ 已归档（3420×2146，PNG） |
| 3 | EXT-TC-003-canvas.png | EXT-TC-003 | MasterGo 工作区全景截图：中央画布展示由残缺 HTML 生成的页面，左侧图层面板已展开 | ✅ 已归档（3420×2146，PNG） |
| 4 | EXT-TC-003-layers.png | EXT-TC-003 | 与 EXT-TC-003-canvas.png 为同一张原始全景截图（逐字节相同），同时承担 layers 证据分类 | ✅ 已归档（3420×2146，PNG） |
| 5 | EXT-TC-006-canvas.png | EXT-TC-006 | MasterGo 工作区全景截图：中央画布展示重复提交后的画布状态，左侧图层面板已展开含多个 AI Generating Page 节点 | ✅ 已归档（3420×2146，PNG） |
| 6 | EXT-TC-006-layers.png | EXT-TC-006 | 与 EXT-TC-006-canvas.png 为同一张原始全景截图（逐字节相同），同时承担 layers 证据分类 | ✅ 已归档（3420×2146，PNG） |

**截图统计口径说明：**

- 截图证据文件条目：6 个
- 不同原始截图内容：3 张（EXT-TC-001、EXT-TC-003、EXT-TC-006 各 1 张）
- 每张均为 MasterGo 工作区全景截图，同时包含中央画布和已展开的左侧图层面板
- 每组 canvas 与 layers 文件逐字节相同，是同一张原始全景截图对应两个逻辑证据分类
- 3 张原始截图共同覆盖 6 个 canvas/layers 逻辑证据项
- 不需要另行拍摄独立 layers 截图

## 六、截图校验结果

3 张不同原始截图（覆盖 6 个文件条目）均已完成以下校验：

| 校验项 | 方法 | 结果 |
|---|---|---|
| 文件存在 | LS 扫描 screenshots/ 目录 | ✅ 6/6 文件均存在 |
| 文件大小 > 0 | ls -la | ✅ 6/6 文件大小均非 0 字节 |
| PNG 文件头正确 | xxd 检查 | ✅ 6/6 文件头均为 89 50 4E 47 0D 0A 1A 0A |
| 尺寸正确 | 分辨率检查 | ✅ 6/6 均为 3420×2146 |
| canvas 与 layers 逐字节比对 | cmp 校验 | ✅ 每组 canvas 与 layers 文件逐字节相同（3 组均确认） |
| 内容与关联用例一致 | 人工核查 | ✅ 3/3 张全景截图同时包含画布内容和已展开图层面板，与用例描述一致 |
| 无敏感信息 | 人工核查 | ✅ 不包含账号、路径等敏感信息 |
| 非伪装文件 | 文件头校验 | ✅ 均为真实 PNG 格式 |

## 七、归档统计

| 统计项 | 数量 |
|---|---|
| 计划归档文件总数 | 16（4 输入 + 6 响应 + 6 截图条目） |
| 已归档并通过校验 | 16（4 输入 + 6 响应 + 6 截图条目） |
| 无待补充项 | 0 |
| 文件条目完整度 | 16/16 = 100% |
| 不重复实质证据 | 13 项（4 输入 + 6 响应 + 3 张不同原始截图） |

## 八、截图归档后校验标准

每张截图归档后需通过以下校验：

| 校验项 | 方法 | 通过标准 |
|---|---|---|
| 文件存在 | LS 扫描 | 文件实际存在于 screenshots/ 目录 |
| 文件大小 > 0 | ls -la | 大小非 0 字节 |
| PNG 文件头正确 | xxd 检查 | 89 50 4E 47 0D 0A 1A 0A |
| 内容与关联用例一致 | 人工核查 | 图片内容与用例描述一致 |
| 无敏感信息 | 人工核查 | 不包含账号、路径等敏感信息 |
| 非伪装文件 | 文件头校验 | 不得是 Markdown 或其他格式 |

---

**索引建立日期**：2026-07-30
**当前归档完成度**：16/16 文件条目（100%），含 13 项不重复实质证据（4 输入 + 6 响应 + 3 张不同原始截图）
