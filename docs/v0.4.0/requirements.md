# PAE v0.4.0 正式需求说明

## 1. 版本主题

PAE v0.4.0 — Real LLM Generation（真实 AI 产品设计生成）。

## 2. 版本目标

输入一份真实 B 端需求文档，PAE 能调用真实 LLM，沿固定工作流生成相互衔接、可校验、可评审的产品设计成果物。

## 3. 范围

- LLM-001：统一 `LlmProvider` 接口。
- LLM-002：接入一个真实 Provider。
- LLM-003：保留 Mock Provider。
- CFG-001：支持 Provider、模型、API 地址、超时和重试配置。
- CFG-002：密钥仅从环境变量读取并全链路脱敏。
- PRM-001：各阶段独立 Prompt。
- PRM-002：Prompt 版本可追踪。
- CTX-001：后序阶段读取必要的前序成果物。
- VAL-001：输出结构与依赖校验。
- VAL-002：原型、页面结构与 PRD 的基础一致性校验。
- RTY-001：校验失败后的有限重试。
- LOG-001：生成元数据进入 manifest。
- ERR-001：鉴权、超时、限流和无效响应处理。
- CLI-001：支持 `--provider`、`--model`。
- ACC-001：员工调动管理需求端到端验收。

## 4. 固定约束

- 项目是长期容器，需求是迭代单元。
- `prototype.json` 是需求级原型单一事实来源。
- Prototype First，PRD 必须在原型及原型确认之后生成。
- Mock 回归测试不依赖网络或真实密钥。
- API Key 不得进入 Git、日志、manifest 或成果物。

## 5. 不纳入范围

多 Agent、RAG、向量数据库、多用户权限、可视化后台、生产代码生成、自动部署、新设计工具适配及大规模 MasterGo MCP 扩展。
