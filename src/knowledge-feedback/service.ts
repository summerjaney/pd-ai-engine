import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { PrototypeDsl, RequirementContext, WorkflowContext } from "../domain/types.js";
import { loadExtensionWorkspace } from "../extensions/workspace.js";
import type { AcceptedKnowledgeEntry, KnowledgeFeedbackCandidate, KnowledgeFeedbackReport, ProductKnowledgeIndex } from "./types.js";

function candidateId(type: KnowledgeFeedbackCandidate["type"], requirement: RequirementContext, suffix: string): string {
  return `${type}:${requirement.requirementId.toLowerCase()}:r${requirement.revision}:${suffix}`;
}

export function buildKnowledgeFeedback(context: Pick<WorkflowContext, "requirement" | "platformDecision" | "artifacts">, now = new Date().toISOString()): KnowledgeFeedbackReport | undefined {
  const requirement = context.requirement;
  const decision = context.platformDecision;
  const prototype = context.artifacts.prototype as PrototypeDsl | undefined;
  if (!requirement || !decision || !prototype) return undefined;
  const source = { requirementId: requirement.requirementId, requirementRevision: requirement.revision, artifact: `requirements/${requirement.requirementId}-${requirement.requirementName}` };
  const candidates: KnowledgeFeedbackCandidate[] = [{
    id: candidateId("decision", requirement, "platform-boundary"), type: "decision", name: `${requirement.requirementId} 平台边界决策`, status: "candidate",
    summary: `${decision.decision.path}：${decision.decision.scope}${decision.decision.note ? `；${decision.decision.note}` : ""}`,
    source, evidence: ["00-platform-analysis/platform-analysis.json", "00-platform-analysis/platform-decision-confirmation.json"],
  }];
  if (!["configuration", "project-customization", "project-validation"].includes(decision.decision.path)) {
    candidates.push({
      id: candidateId("capability", requirement, "delivered-scope"), type: "capability", name: decision.decision.scope, status: "candidate",
      summary: `由 ${requirement.requirementId} 交付的产品能力，包含 ${prototype.pages.length} 个页面、${prototype.rules.length} 条规则。`, source,
      evidence: ["06-prototype/prototype.json", "09-prd.md"],
    });
  }
  for (const rule of prototype.rules) candidates.push({
    id: candidateId("rule", requirement, rule.id), type: "rule", name: rule.description, status: "candidate", summary: rule.description, source,
    evidence: ["06-prototype/prototype.json", "09-prd.md"],
  });
  for (const pattern of [...new Set(prototype.pages.map((page) => page.pattern))]) candidates.push({
    id: candidateId("pattern", requirement, pattern), type: "pattern", name: `${pattern} 页面模式应用`, status: "candidate",
    summary: `${requirement.requirementId} 使用 ${pattern} 模式的页面：${prototype.pages.filter((page) => page.pattern === pattern).map((page) => page.name).join("、")}`, source,
    evidence: ["05-page-structure.md", "06-prototype/prototype.json"],
  });
  return { schemaVersion: "1.2", requirement: { id: requirement.requirementId, revision: requirement.revision, name: requirement.requirementName }, platformDecision: decision.decision, generatedAt: now, status: "pending-human-acceptance", candidates };
}

export function renderKnowledgeFeedback(report: KnowledgeFeedbackReport): string {
  const rows = report.candidates.map((item) => `| ${item.id} | ${item.type} | ${item.name} | ${item.summary} |`).join("\n");
  return `# 产品知识回流候选\n\n- 需求：${report.requirement.id} r${report.requirement.revision}\n- 平台判断：${report.platformDecision.path}\n- 状态：${report.status}\n\n| 候选 ID | 类型 | 名称 | 摘要 |\n|---|---|---|---|\n${rows}\n\n> 候选不会自动修改产品工作空间。请由产品经理审核后使用 knowledge accept 接受。\n`;
}

export async function acceptKnowledgeFeedback(requirementDirectory: string, workspacePath: string, selectedIds?: string[]): Promise<{ accepted: AcceptedKnowledgeEntry[]; indexPath: string; snapshotPath?: string; sequence: number }> {
  const loadedWorkspace = await loadExtensionWorkspace(workspacePath);
  const reportPath = path.join(requirementDirectory, "13-knowledge-feedback", "knowledge-feedback-candidates.json");
  let report: KnowledgeFeedbackReport;
  try { report = JSON.parse(await readFile(reportPath, "utf8")) as KnowledgeFeedbackReport; }
  catch (error) { throw new Error(`无法读取知识回流候选：${(error as Error).message}`); }
  if (report.status !== "pending-human-acceptance" || !Array.isArray(report.candidates)) throw new Error("知识回流候选状态无效。");
  const requirement = JSON.parse(await readFile(path.join(requirementDirectory, "requirement.json"), "utf8")) as RequirementContext;
  if (report.requirement.id !== requirement.requirementId || report.requirement.revision !== requirement.revision) throw new Error("知识回流候选与当前需求修订不一致。");
  const chosen = selectedIds?.length ? report.candidates.filter((item) => selectedIds.includes(item.id)) : report.candidates;
  if (selectedIds?.some((id) => !report.candidates.some((item) => item.id === id))) throw new Error("包含不存在的知识候选 ID。");
  if (!chosen.length) throw new Error("没有可接受的知识候选。");
  const knowledgeDirectory = path.join(path.dirname(loadedWorkspace.path), "accepted-knowledge");
  const indexPath = path.join(knowledgeDirectory, "product-knowledge-index.json");
  await mkdir(path.join(knowledgeDirectory, "history"), { recursive: true });
  let current: ProductKnowledgeIndex = { schemaVersion: "1.2", workspaceId: loadedWorkspace.workspace.id, sequence: 0, updatedAt: new Date(0).toISOString(), entries: [] };
  let snapshotPath: string | undefined;
  try {
    current = JSON.parse(await readFile(indexPath, "utf8")) as ProductKnowledgeIndex;
    if (current.workspaceId !== loadedWorkspace.workspace.id) throw new Error("知识索引与工作空间身份不一致。");
    snapshotPath = path.join(knowledgeDirectory, "history", `product-knowledge-index-${current.sequence}.json`);
    await cp(indexPath, snapshotPath, { force: false, errorOnExist: true });
  } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  const existingIds = new Set(current.entries.map((item) => item.id));
  const now = new Date().toISOString();
  const accepted = chosen.filter((item) => !existingIds.has(item.id)).map((item): AcceptedKnowledgeEntry => ({ ...item, status: "accepted", acceptedAt: now, acceptedBy: "product-manager" }));
  if (!accepted.length) throw new Error("所选知识候选已经全部接受，禁止重复写入。");
  const next: ProductKnowledgeIndex = { ...current, sequence: current.sequence + 1, updatedAt: now, entries: [...current.entries, ...accepted].sort((a, b) => a.id.localeCompare(b.id)) };
  await writeFile(indexPath, `${JSON.stringify(next, null, 2)}\n`, "utf8");
  await writeFile(path.join(requirementDirectory, "13-knowledge-feedback", "knowledge-feedback-acceptance.json"), `${JSON.stringify({ schemaVersion: "1.2", status: "accepted", workspaceId: loadedWorkspace.workspace.id, indexSequence: next.sequence, acceptedAt: now, acceptedIds: accepted.map((item) => item.id) }, null, 2)}\n`, "utf8");
  return { accepted, indexPath, snapshotPath, sequence: next.sequence };
}
