import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { RequirementContext, WorkflowContext } from "../domain/types.js";
import type { PlatformDecisionConfirmation } from "../platform-analysis/confirmation.js";
import type { PlatformKnowledgeConsistencyReport } from "./consistency.js";
import type { CapabilityGapAssessment, PlatformCapability, PlatformKnowledgeEntity } from "./types.js";
import { promotePlatformKnowledgeEntities } from "./promotion.js";

export interface PlatformKnowledgeCandidate {
  id: string;
  status: "draft";
  reason: string;
  evidence: string[];
  entity: PlatformKnowledgeEntity;
}

export interface PlatformKnowledgeFeedbackReport {
  schemaVersion: "1.4";
  requirement: { id: string; revision: number; name: string; fingerprint: string };
  platformDecision: PlatformDecisionConfirmation["decision"];
  catalogVersion: string;
  generatedAt: string;
  status: "pending-product-manager-review";
  candidates: PlatformKnowledgeCandidate[];
}

function safeId(value: string): string {
  return value.toLowerCase().replace(/^gap\./, "").replace(/[^a-z0-9.-]+/g, "-").replace(/^-|-$/g, "") || "new-capability";
}

function capabilityCandidate(requirement: RequirementContext, gap: CapabilityGapAssessment["gaps"][number], assessment: CapabilityGapAssessment): PlatformKnowledgeCandidate {
  const baseCapability = assessment.reuse.capabilities[0];
  const domain = baseCapability?.split(".")[1] ?? "platform";
  const id = `capability.${domain}.${safeId(gap.id)}`;
  const entity: PlatformCapability = {
    id, kind: "capability", name: gap.description, description: gap.evidence, version: "1.0.0", status: "draft", tags: [domain, "PAE候选", gap.description],
    source: { type: "pae-feedback", document: `${requirement.requirementId} r${requirement.revision}`, section: "能力差距分析" },
    domain, module: baseCapability?.split(".").slice(1).join("-") ?? "platform", level: "platform",
    supportedScenarios: [gap.description], constraints: [],
    references: baseCapability ? [{ id: baseCapability, kind: "capability" }] : [],
  };
  return { id, status: "draft", reason: gap.evidence, evidence: ["00-platform-analysis/capability-gap.json", "06-prototype/prototype.json", "09-prd.md"], entity };
}

export function buildPlatformKnowledgeFeedback(context: Pick<WorkflowContext, "requirement" | "platformDecision" | "platformAnalysis" | "platformKnowledgeConsistency">, now = new Date().toISOString()): PlatformKnowledgeFeedbackReport | undefined {
  const requirement = context.requirement;
  const decision = context.platformDecision;
  const assessment = context.platformAnalysis?.capabilityGap;
  if (!requirement || !decision || !assessment || !context.platformKnowledgeConsistency?.valid || !assessment.gaps.length) return undefined;
  return {
    schemaVersion: "1.4",
    requirement: { id: requirement.requirementId, revision: requirement.revision, name: requirement.requirementName, fingerprint: assessment.requirement.fingerprint },
    platformDecision: decision.decision,
    catalogVersion: assessment.platformKnowledge.catalogVersion,
    generatedAt: now,
    status: "pending-product-manager-review",
    candidates: assessment.gaps.map((gap) => capabilityCandidate(requirement, gap, assessment)),
  };
}

export function renderPlatformKnowledgeFeedback(report: PlatformKnowledgeFeedbackReport): string {
  const rows = report.candidates.map((item) => `| ${item.id} | ${item.entity.kind} | ${item.entity.name} | ${item.status} | ${item.reason} |`).join("\n");
  return `# 平台知识候选审核\n\n- 需求：${report.requirement.id} r${report.requirement.revision}\n- 平台判断：${report.platformDecision.path}\n- 状态：${report.status}\n\n| 候选 ID | 类型 | 名称 | 状态 | 形成依据 |\n|---|---|---|---|---|\n${rows}\n\n> 候选默认是 draft，不参与后续正式能力匹配。只有产品经理执行 knowledge accept --knowledge-dir 后才会晋级为 confirmed。\n`;
}

export async function readPlatformKnowledgeFeedback(requirementDirectory: string): Promise<PlatformKnowledgeFeedbackReport> {
  const target = path.join(requirementDirectory, "14-platform-knowledge-feedback", "platform-knowledge-candidates.json");
  const report = JSON.parse(await readFile(target, "utf8")) as PlatformKnowledgeFeedbackReport;
  if (report.schemaVersion !== "1.4" || report.status !== "pending-product-manager-review" || !Array.isArray(report.candidates)) throw new Error("平台知识候选状态无效。");
  return report;
}

export async function extractPlatformKnowledgeFeedback(requirementDirectory: string): Promise<{ report: PlatformKnowledgeFeedbackReport; jsonPath: string; markdownPath: string }> {
  const requirement = JSON.parse(await readFile(path.join(requirementDirectory, "requirement.json"), "utf8")) as RequirementContext;
  const platformDecision = JSON.parse(await readFile(path.join(requirementDirectory, "00-platform-analysis", "platform-decision-confirmation.json"), "utf8")) as PlatformDecisionConfirmation;
  const capabilityGap = JSON.parse(await readFile(path.join(requirementDirectory, "00-platform-analysis", "capability-gap.json"), "utf8")) as CapabilityGapAssessment;
  const platformKnowledgeConsistency = JSON.parse(await readFile(path.join(requirementDirectory, "09-validation", "platform-knowledge-consistency.json"), "utf8")) as PlatformKnowledgeConsistencyReport;
  const report = buildPlatformKnowledgeFeedback({ requirement, platformDecision, platformAnalysis: { capabilityGap } as WorkflowContext["platformAnalysis"], platformKnowledgeConsistency });
  if (!report) throw new Error("当前需求没有可提取的平台知识候选，或平台知识一致性尚未通过。");
  const directory = path.join(requirementDirectory, "14-platform-knowledge-feedback");
  await mkdir(directory, { recursive: true });
  const jsonPath = path.join(directory, "platform-knowledge-candidates.json");
  const markdownPath = path.join(directory, "platform-knowledge-candidates.md");
  await Promise.all([
    writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8"),
    writeFile(markdownPath, renderPlatformKnowledgeFeedback(report), "utf8"),
  ]);
  return { report, jsonPath, markdownPath };
}

export async function acceptPlatformKnowledgeFeedback(requirementDirectory: string, knowledgeDirectory: string, selectedIds?: string[]): Promise<{ accepted: PlatformKnowledgeEntity[]; catalogPath: string; snapshotPath: string }> {
  const report = await readPlatformKnowledgeFeedback(requirementDirectory);
  const requirement = JSON.parse(await readFile(path.join(requirementDirectory, "requirement.json"), "utf8")) as RequirementContext;
  if (report.requirement.id !== requirement.requirementId || report.requirement.revision !== requirement.revision) throw new Error("平台知识候选与当前需求修订不一致。");
  const assessment = JSON.parse(await readFile(path.join(requirementDirectory, "00-platform-analysis", "capability-gap.json"), "utf8")) as CapabilityGapAssessment;
  if (assessment.requirement.fingerprint !== report.requirement.fingerprint) throw new Error("能力差距分析已变化，候选知识必须重新生成。");
  const consistency = JSON.parse(await readFile(path.join(requirementDirectory, "09-validation", "platform-knowledge-consistency.json"), "utf8")) as PlatformKnowledgeConsistencyReport;
  if (!consistency.valid) throw new Error("平台知识引用一致性检查未通过，禁止写入正式知识库。");
  const chosen = selectedIds?.length ? report.candidates.filter((item) => selectedIds.includes(item.id)) : report.candidates;
  if (selectedIds?.some((id) => !report.candidates.some((item) => item.id === id))) throw new Error("包含不存在的平台知识候选 ID。");
  if (!chosen.length) throw new Error("没有可接受的平台知识候选。");

  const now = new Date().toISOString();
  const promoted = await promotePlatformKnowledgeEntities(knowledgeDirectory, chosen.map((item) => item.entity), {
    expectedCatalogVersion: report.catalogVersion, acceptedBy: "product-manager", now,
  });
  await writeFile(path.join(requirementDirectory, "14-platform-knowledge-feedback", "platform-knowledge-acceptance.json"), `${JSON.stringify({ schemaVersion: "1.4", status: "accepted", acceptedAt: now, acceptedBy: "product-manager", acceptedIds: promoted.accepted.map((item) => item.id), catalogVersion: report.catalogVersion }, null, 2)}\n`, "utf8");
  return promoted;
}
