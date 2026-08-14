import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { PlatformAnalysisReport } from "../platform-analysis/types.js";
import { loadValidPlatformDecision } from "../platform-analysis/confirmation.js";
import type { DesignGateConfirmation, RealRequirementGate, RealRequirementGateId, RealRequirementLoopReport } from "./types.js";

const CONFIRMABLE_ARTIFACTS = {
  requirement: ["01-requirement-analysis.md"],
  solution: ["02-product-outline.md", "03-product-architecture.md", "04-core-flow.md"],
  prd: ["09-prd.md"],
} as const;

const GATE_NAMES: Record<RealRequirementGateId, string> = {
  platform: "平台与项目边界确认",
  requirement: "需求理解确认",
  solution: "功能方案确认",
  prototype: "原型确认",
  prd: "PRD 确认",
};

async function readOptional(file: string): Promise<string | undefined> {
  try { return await readFile(file, "utf8"); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}

async function hashArtifacts(requirementDirectory: string, artifacts: readonly string[]): Promise<string | undefined> {
  const contents = await Promise.all(artifacts.map((artifact) => readOptional(path.join(requirementDirectory, artifact))));
  if (contents.some((content) => content === undefined)) return undefined;
  const hash = createHash("sha256");
  artifacts.forEach((artifact, index) => hash.update(artifact).update("\0").update(contents[index]!));
  return hash.digest("hex");
}

function confirmationPath(requirementDirectory: string, gate: "requirement" | "solution" | "prd"): string {
  return path.join(requirementDirectory, "12-design-confirmations", `${gate}-confirmation.json`);
}

export async function confirmDesignGate(requirementDirectory: string, gate: "requirement" | "solution" | "prd", note?: string): Promise<{ confirmation: DesignGateConfirmation; path: string }> {
  const artifacts = CONFIRMABLE_ARTIFACTS[gate];
  const artifactHash = await hashArtifacts(requirementDirectory, artifacts);
  if (!artifactHash) throw new Error(`${GATE_NAMES[gate]}失败：所需成果物不完整（${artifacts.join("、")}）。`);
  const confirmation: DesignGateConfirmation = {
    schemaVersion: "1.3", gate, status: "confirmed", artifactHash,
    note: note?.trim() || undefined,
    confirmedAt: new Date().toISOString(), confirmedBy: "product-manager",
  };
  const target = confirmationPath(requirementDirectory, gate);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, `${JSON.stringify(confirmation, null, 2)}\n`, "utf8");
  return { confirmation, path: target };
}

async function evaluatedConfirmationGate(requirementDirectory: string, gate: "requirement" | "solution" | "prd"): Promise<RealRequirementGate> {
  const artifacts = [...CONFIRMABLE_ARTIFACTS[gate]];
  const artifactHash = await hashArtifacts(requirementDirectory, artifacts);
  if (!artifactHash) return { id: gate, name: GATE_NAMES[gate], status: "WAITING", artifacts, blockers: ["所需成果物尚未生成完整。"] };
  const raw = await readOptional(confirmationPath(requirementDirectory, gate));
  if (!raw) return { id: gate, name: GATE_NAMES[gate], status: "READY", artifacts, blockers: ["成果物已生成，等待产品经理确认。"] };
  const confirmation = JSON.parse(raw) as DesignGateConfirmation;
  if (confirmation.schemaVersion !== "1.3" || confirmation.gate !== gate || confirmation.artifactHash !== artifactHash) {
    return { id: gate, name: GATE_NAMES[gate], status: "INVALIDATED", artifacts, blockers: ["成果物已变化，原确认失效，需要重新确认。"] };
  }
  return { id: gate, name: GATE_NAMES[gate], status: "CONFIRMED", artifacts, blockers: [], confirmedAt: confirmation.confirmedAt };
}

async function platformGate(requirementDirectory: string): Promise<RealRequirementGate> {
  const artifacts = ["00-platform-analysis/platform-analysis.json", "00-platform-analysis/platform-decision-confirmation.json"];
  const raw = await readOptional(path.join(requirementDirectory, artifacts[0]));
  if (!raw) return { id: "platform", name: GATE_NAMES.platform, status: "WAITING", artifacts, blockers: ["平台前置分析尚未生成。"] };
  const report = JSON.parse(raw) as PlatformAnalysisReport;
  const confirmation = await loadValidPlatformDecision(requirementDirectory, report);
  return confirmation
    ? { id: "platform", name: GATE_NAMES.platform, status: "CONFIRMED", artifacts, blockers: [], confirmedAt: confirmation.confirmedAt }
    : { id: "platform", name: GATE_NAMES.platform, status: "READY", artifacts, blockers: ["等待产品经理确认平台与项目边界。"] };
}

async function prototypeGate(requirementDirectory: string): Promise<RealRequirementGate> {
  const artifacts = ["06-prototype/prototype.json", "08-prototype-confirmation.json"];
  if (!(await readOptional(path.join(requirementDirectory, artifacts[0])))) return { id: "prototype", name: GATE_NAMES.prototype, status: "WAITING", artifacts, blockers: ["原型尚未生成。"] };
  const raw = await readOptional(path.join(requirementDirectory, artifacts[1]));
  if (!raw) return { id: "prototype", name: GATE_NAMES.prototype, status: "READY", artifacts, blockers: ["原型已生成，等待产品经理确认。"] };
  const confirmation = JSON.parse(raw) as { status?: string; confirmedAt?: string };
  return confirmation.status === "confirmed"
    ? { id: "prototype", name: GATE_NAMES.prototype, status: "CONFIRMED", artifacts, blockers: [], confirmedAt: confirmation.confirmedAt }
    : { id: "prototype", name: GATE_NAMES.prototype, status: "READY", artifacts, blockers: ["原型确认记录不是 confirmed。"] };
}

export async function buildRealRequirementLoopReport(requirementDirectory: string): Promise<RealRequirementLoopReport> {
  const gates = await Promise.all([
    platformGate(requirementDirectory),
    evaluatedConfirmationGate(requirementDirectory, "requirement"),
    evaluatedConfirmationGate(requirementDirectory, "solution"),
    prototypeGate(requirementDirectory),
    evaluatedConfirmationGate(requirementDirectory, "prd"),
  ]);
  const confirmed = gates.filter((gate) => gate.status === "CONFIRMED").length;
  const currentGate = gates.find((gate) => gate.status !== "CONFIRMED")?.id;
  return {
    schemaVersion: "1.3", generatedAt: new Date().toISOString(), requirementDirectory,
    status: confirmed === gates.length ? "READY_FOR_DEVELOPMENT_REVIEW" : "IN_PROGRESS",
    currentGate,
    summary: { confirmed, total: gates.length, blockerCount: gates.reduce((count, gate) => count + gate.blockers.length, 0) },
    gates,
  };
}

export function renderRealRequirementLoopReport(report: RealRequirementLoopReport): string {
  const rows = report.gates.map((gate) => `| ${gate.name} | ${gate.status} | ${gate.blockers.join("；") || "—"} |`).join("\n");
  return `# 真实需求设计闭环状态\n\n- 状态：${report.status}\n- 已确认：${report.summary.confirmed}/${report.summary.total}\n- 当前节点：${report.currentGate ?? "已全部完成"}\n- 阻断项：${report.summary.blockerCount}\n\n| 确认节点 | 状态 | 阻断原因 |\n|---|---|---|\n${rows}\n`;
}

export async function writeRealRequirementLoopReport(requirementDirectory: string): Promise<{ report: RealRequirementLoopReport; jsonPath: string; markdownPath: string }> {
  const report = await buildRealRequirementLoopReport(requirementDirectory);
  const directory = path.join(requirementDirectory, "12-design-confirmations");
  await mkdir(directory, { recursive: true });
  const jsonPath = path.join(directory, "real-requirement-loop.json");
  const markdownPath = path.join(directory, "real-requirement-loop.md");
  await Promise.all([
    writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8"),
    writeFile(markdownPath, renderRealRequirementLoopReport(report), "utf8"),
  ]);
  return { report, jsonPath, markdownPath };
}
