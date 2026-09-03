import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { registerPrimaryRequirementSource } from "../requirement-sources/service.js";
import type { AiMvpDecision } from "../ai-product-planning/types.js";
import type { AiRequirementDesignInput, AiRequirementDesignManifest } from "./types.js";

const text = (value: unknown): value is string => typeof value === "string" && Boolean(value.trim());
const safeSegment = (value: string, field: string): string => {
  const normalized = value.trim().replace(/\s+/g, "-");
  if (!normalized || normalized.includes("..") || !/^[A-Za-z0-9._-]+$/.test(normalized)) throw new Error(`${field} 只能包含字母、数字、点、下划线和连字符。`);
  return normalized;
};
const unique = (values: string[]): string[] => [...new Set(values)];

function assertInput(value: unknown): asserts value is AiRequirementDesignInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("AI 需求设计输入必须是 JSON 对象。");
  const input = value as Partial<AiRequirementDesignInput>;
  for (const field of ["scenarioId", "title", "problem", "targetOutcome"] as const) if (!text(input[field])) throw new Error(`AI 需求设计缺少 ${field}。`);
  for (const field of ["actors", "businessObjects", "flow", "states", "exceptions", "acceptanceCriteria"] as const) if (!Array.isArray(input[field]) || !input[field]?.length) throw new Error(`AI 需求设计必须提供非空 ${field}。`);
  if (!input.validationCase || !text(input.validationCase.name) || !text(input.validationCase.prompt) || !input.validationCase.expectedArtifacts?.length) throw new Error("AI 需求设计必须提供完整 validationCase。");
  const valid = input as AiRequirementDesignInput;
  const ids = [
    ...valid.actors.map((item) => item.id),
    ...valid.businessObjects.map((item) => item.id),
    ...valid.flow.map((item) => item.id),
    ...valid.states.map((item) => item.id),
    ...valid.exceptions.map((item) => item.id),
    ...valid.acceptanceCriteria.map((item) => item.id),
  ];
  if (ids.some((id) => !text(id)) || new Set(ids).size !== ids.length) throw new Error("业务对象、流程、状态、异常和验收标准 ID 必须有效且全局唯一。");
  if (!valid.flow.some((item) => item.requiresConfirmation)) throw new Error("AI 端到端流程必须至少包含一个人工确认节点。");
  if (!valid.states.some((item) => item.terminal)) throw new Error("AI 任务状态必须至少包含一个终态。");
}

function renderRequirement(input: AiRequirementDesignInput, guardrails: string[]): string {
  return `# ${input.title}

## 问题与目标

${input.problem}

目标：${input.targetOutcome}

## 目标用户与职责

${input.actors.map((item) => `- **${item.name}**（${item.id}）：${item.responsibility}`).join("\n")}

## 业务对象

| ID | 对象 | 说明 | 关键字段 |
|---|---|---|---|
${input.businessObjects.map((item) => `| ${item.id} | ${item.name} | ${item.description} | ${item.keyFields.join("、")} |`).join("\n")}

## 端到端主流程

${input.flow.map((item, index) => `${index + 1}. **${item.name}**（${item.id}）\n   - 执行角色：${item.actor}\n   - 输入：${item.input}\n   - 输出：${item.output}\n   - 人工确认：${item.requiresConfirmation ? "必须" : "否"}`).join("\n")}

## 任务状态

| ID | 状态 | 是否终态 |
|---|---|---|
${input.states.map((item) => `| ${item.id} | ${item.name} | ${item.terminal ? "是" : "否"} |`).join("\n")}

## 异常与恢复

| ID | 触发条件 | 处理方式 | 可恢复 |
|---|---|---|---|
${input.exceptions.map((item) => `| ${item.id} | ${item.trigger} | ${item.handling} | ${item.recoverable ? "是" : "否"} |`).join("\n")}

## 产品护栏

${guardrails.map((item) => `- ${item}`).join("\n")}

## 首个验证案例

- 案例：${input.validationCase.name}
- 用户指令：${input.validationCase.prompt}
- 预期产物：${input.validationCase.expectedArtifacts.join("、")}

## 验收标准

${input.acceptanceCriteria.map((item) => `- **${item.id}**：${item.description}`).join("\n")}
`;
}

function renderObjectModel(input: AiRequirementDesignInput): string {
  return `# AI 应用搭建业务对象模型\n\n| ID | 对象 | 职责 | 关键字段 |\n|---|---|---|---|\n${input.businessObjects.map((item) => `| ${item.id} | ${item.name} | ${item.description} | ${item.keyFields.join("、")} |`).join("\n")}\n`;
}

function renderFlow(input: AiRequirementDesignInput): string {
  return `# AI 应用搭建端到端流程\n\n| 顺序 | ID | 环节 | 角色 | 输入 | 输出 | 人工确认 |\n|---:|---|---|---|---|---|---|\n${input.flow.map((item, index) => `| ${index + 1} | ${item.id} | ${item.name} | ${item.actor} | ${item.input} | ${item.output} | ${item.requiresConfirmation ? "是" : "否"} |`).join("\n")}\n`;
}

function renderStateModel(input: AiRequirementDesignInput): string {
  return `# AI 搭建任务状态与异常\n\n## 状态\n\n| ID | 状态 | 终态 |\n|---|---|---|\n${input.states.map((item) => `| ${item.id} | ${item.name} | ${item.terminal ? "是" : "否"} |`).join("\n")}\n\n## 异常\n\n| ID | 触发条件 | 处理方式 | 可恢复 |\n|---|---|---|---|\n${input.exceptions.map((item) => `| ${item.id} | ${item.trigger} | ${item.handling} | ${item.recoverable ? "是" : "否"} |`).join("\n")}\n`;
}

async function updateIndex(projectDirectory: string, id: string, name: string, version: string): Promise<void> {
  const file = path.join(projectDirectory, "product", "requirement-index.md");
  let content = `# 需求索引\n\n| 需求编号 | 需求名称 | 产品版本 | 状态 |\n|---|---|---|---|\n`;
  try { content = await readFile(file, "utf8"); } catch {}
  const rows = content.trimEnd().split("\n");
  const row = `| ${id} | ${name} | ${version} | ready-for-detailed-design |`;
  const index = rows.findIndex((item) => item.startsWith(`| ${id} `));
  if (index >= 0) rows[index] = row; else rows.push(row);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, `${rows.join("\n")}\n`, "utf8");
}

export class AiRequirementDesignService {
  async create(projectDirectory: string, inputPath: string, requirementId: string, requirementName: string, productVersion = "2.1.0"): Promise<{ requirementDirectory: string; manifest: AiRequirementDesignManifest; files: string[] }> {
    const decisionPath = path.join(projectDirectory, "product", "ai-planning", "mvp-scope-decision.json");
    let decision: AiMvpDecision;
    try { decision = JSON.parse(await readFile(decisionPath, "utf8")) as AiMvpDecision; }
    catch { throw new Error("AI MVP 范围尚未确认，不能创建详细需求。请先执行 pae ai confirm。"); }
    if (decision.status !== "CONFIRMED") throw new Error("AI MVP 范围尚未确认，不能创建详细需求。");
    const raw = await readFile(inputPath, "utf8");
    const input = JSON.parse(raw) as unknown;
    assertInput(input);
    if (!decision.scenarioIds.includes(input.scenarioId)) throw new Error(`场景 ${input.scenarioId} 不在已确认的 MVP 范围内。`);

    const id = safeSegment(requirementId.toUpperCase(), "requirement-id");
    const name = safeSegment(requirementName, "requirement-name");
    const requirementDirectory = path.join(projectDirectory, "requirements", `${id}-${name}`);
    const briefDirectory = path.join(requirementDirectory, "00-ai-design-brief");
    await mkdir(briefDirectory, { recursive: true });
    const planningDraft = JSON.parse(await readFile(path.join(projectDirectory, "product", "ai-planning", "mvp-scope-draft.json"), "utf8")) as { guardrails?: string[] };
    const guardrails = unique([...(planningDraft.guardrails ?? []), "用户只能生成其自身权限范围内的配置。", "AI 生成内容必须经低代码引擎确定性校验。", "发布前必须提供预览、差异和回滚点。"]) ;
    const requirement = renderRequirement(input, guardrails);
    const artifacts = [
      { id: "requirement-input", path: "00-requirement-input.md" },
      { id: "design-brief", path: "00-ai-design-brief/design-brief.json" },
      { id: "business-object-model", path: "00-ai-design-brief/business-object-model.md" },
      { id: "end-to-end-flow", path: "00-ai-design-brief/end-to-end-flow.md" },
      { id: "state-exception-model", path: "00-ai-design-brief/state-exception-model.md" },
      { id: "traceability", path: "00-ai-design-brief/traceability.json" },
    ];
    const manifest: AiRequirementDesignManifest = {
      schemaVersion: "2.1", scenarioId: input.scenarioId, requirementId: id, requirementName: name, productVersion,
      status: "READY_FOR_DETAILED_DESIGN", artifacts, guardrails,
      reservedManualValidation: ["真实低代码平台能力边界", "AI 生成方案专业性", "权限与数据安全设计", "研发与业务评审"],
    };
    const traceability = {
      schemaVersion: "2.1",
      scenarioId: input.scenarioId,
      objectIds: input.businessObjects.map((item) => item.id),
      flowIds: input.flow.map((item) => item.id),
      stateIds: input.states.map((item) => item.id),
      exceptionIds: input.exceptions.map((item) => item.id),
      acceptanceCriteriaIds: input.acceptanceCriteria.map((item) => item.id),
    };
    await Promise.all([
      writeFile(path.join(requirementDirectory, "00-requirement-input.md"), requirement, "utf8"),
      writeFile(path.join(requirementDirectory, "requirement.json"), `${JSON.stringify({ schemaVersion: "2.1", requirementId: id, requirementName: name, productVersion, revision: 1, title: input.title, sourcePath: path.basename(inputPath), scenarioId: input.scenarioId, status: manifest.status }, null, 2)}\n`, "utf8"),
      writeFile(path.join(briefDirectory, "design-brief.json"), `${JSON.stringify(input, null, 2)}\n`, "utf8"),
      writeFile(path.join(briefDirectory, "business-object-model.md"), renderObjectModel(input), "utf8"),
      writeFile(path.join(briefDirectory, "end-to-end-flow.md"), renderFlow(input), "utf8"),
      writeFile(path.join(briefDirectory, "state-exception-model.md"), renderStateModel(input), "utf8"),
      writeFile(path.join(briefDirectory, "traceability.json"), `${JSON.stringify(traceability, null, 2)}\n`, "utf8"),
      writeFile(path.join(briefDirectory, "design-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8"),
    ]);
    await registerPrimaryRequirementSource(requirementDirectory, path.basename(inputPath), requirement);
    await updateIndex(projectDirectory, id, name, productVersion);
    return { requirementDirectory, manifest, files: artifacts.map((item) => path.join(requirementDirectory, item.path)) };
  }
}
