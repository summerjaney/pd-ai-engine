import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { PortfolioAdmissionCheck, PortfolioRequirement, ReleaseAdmissionStatus, RequirementPortfolio } from "./types.js";

async function optionalJson<T>(file: string): Promise<T | undefined> {
  try { return JSON.parse(await readFile(file, "utf8")) as T; }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined; throw error; }
}

function admissionStatus(checks: PortfolioAdmissionCheck[]): ReleaseAdmissionStatus {
  if (checks.some((check) => check.id === "change-status" && check.status === "FAIL")) return "STALE";
  if (checks.some((check) => check.status === "FAIL")) return "BLOCKED";
  if (checks.some((check) => check.status === "PENDING" || check.status === "NOT_AVAILABLE")) return "CONDITIONAL";
  return "READY";
}

async function inspectRequirement(projectDirectory: string, entry: string): Promise<PortfolioRequirement> {
  const directory = path.join(projectDirectory, "requirements", entry);
  const metadata = await optionalJson<{ requirementId?: string; requirementName?: string; productVersion?: string; revision?: number }>(path.join(directory, "requirement.json"));
  const decision = await optionalJson<{ status?: string; selectedOptionId?: string }>(path.join(directory, "02-product-outline", "solution-options", "solution-decision.json"));
  const plan = await optionalJson<{ units?: Array<{ moduleId?: string }> }>(path.join(directory, "02-product-outline", "design-units", "design-unit-plan.json"));
  const acceptance = await optionalJson<{ status?: string }>(path.join(directory, "12-acceptance", "complex-requirement", "acceptance-report.json"));
  const change = await optionalJson<{ status?: string }>(path.join(directory, "11-change-impact", "requirement-change", "requirement-change-report.json"));
  const checks: PortfolioAdmissionCheck[] = [
    { id: "requirement-metadata", status: metadata?.requirementId && metadata.requirementName ? "PASS" : "FAIL", message: metadata ? "需求元数据已登记。" : "缺少 requirement.json。" },
    { id: "solution-selection", status: decision?.status === "selected" ? "PASS" : "PENDING", message: decision?.status === "selected" ? `已选择方案 ${decision.selectedOptionId}。` : "尚未完成产品经理方案选择。" },
    { id: "design-units", status: plan?.units?.length ? "PASS" : "PENDING", message: plan?.units?.length ? `已建立 ${plan.units.length} 个设计单元。` : "尚未建立设计单元计划。" },
    { id: "complex-acceptance", status: acceptance?.status === "PASS" ? "PASS" : acceptance?.status === "FAIL" ? "FAIL" : "NOT_AVAILABLE", message: acceptance?.status === "PASS" ? "复杂需求整合验收通过。" : acceptance?.status === "FAIL" ? "复杂需求整合验收失败。" : "尚未完成复杂需求整合验收。" },
    { id: "change-status", status: change?.status === "CHANGE_DETECTED" ? "FAIL" : "PASS", message: change?.status === "CHANGE_DETECTED" ? "需求变化已使正式设计失效。" : "未发现使设计失效的增量变化。" },
  ];
  const fallbackId = entry.split("-")[0] ?? entry;
  return {
    requirementId: metadata?.requirementId ?? fallbackId,
    requirementName: metadata?.requirementName ?? entry.slice(fallbackId.length + 1),
    productVersion: metadata?.productVersion ?? "unknown",
    revision: metadata?.revision ?? 0,
    directory: path.relative(projectDirectory, directory),
    admissionStatus: admissionStatus(checks), selectedOptionId: decision?.selectedOptionId,
    moduleIds: [...new Set((plan?.units ?? []).flatMap((unit) => unit.moduleId ? [unit.moduleId] : []))].sort(),
    designUnitCount: plan?.units?.length ?? 0, checks,
  };
}

export async function buildRequirementPortfolio(projectDirectory: string): Promise<{ portfolio: RequirementPortfolio; jsonPath: string; markdownPath: string }> {
  const project = await optionalJson<{ projectId?: string; projectName?: string }>(path.join(projectDirectory, "project.json"));
  if (!project?.projectId) throw new Error("无法建立需求组合：项目缺少有效的 project.json。");
  let entries: string[];
  try { entries = (await readdir(path.join(projectDirectory, "requirements"), { withFileTypes: true })).filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort(); }
  catch { throw new Error("无法建立需求组合：项目不存在 requirements 目录。"); }
  const requirements = await Promise.all(entries.map((entry) => inspectRequirement(projectDirectory, entry)));
  const summary = { total: requirements.length, READY: 0, CONDITIONAL: 0, BLOCKED: 0, STALE: 0 };
  for (const requirement of requirements) summary[requirement.admissionStatus] += 1;
  const portfolio: RequirementPortfolio = { schemaVersion: "1.7", generatedAt: new Date().toISOString(), project: { id: project.projectId, name: project.projectName ?? project.projectId }, requirements, summary };
  const target = path.join(projectDirectory, "product", "portfolio");
  await mkdir(target, { recursive: true });
  const jsonPath = path.join(target, "requirement-portfolio.json");
  const markdownPath = path.join(target, "requirement-portfolio.md");
  await Promise.all([writeFile(jsonPath, `${JSON.stringify(portfolio, null, 2)}\n`, "utf8"), writeFile(markdownPath, renderRequirementPortfolio(portfolio), "utf8")]);
  return { portfolio, jsonPath, markdownPath };
}

export function renderRequirementPortfolio(portfolio: RequirementPortfolio): string {
  const rows = portfolio.requirements.map((item) => `| ${item.requirementId} | ${item.requirementName} | ${item.productVersion} | ${item.revision} | ${item.admissionStatus} | ${item.selectedOptionId ?? "-"} | ${item.moduleIds.join("、") || "-"} | ${item.designUnitCount} |`).join("\n");
  return `# 需求组合与版本准入\n\n- 项目：${portfolio.project.name}（${portfolio.project.id}）\n- 候选需求：${portfolio.summary.total}\n- READY / CONDITIONAL / BLOCKED / STALE：${portfolio.summary.READY} / ${portfolio.summary.CONDITIONAL} / ${portfolio.summary.BLOCKED} / ${portfolio.summary.STALE}\n\n| 需求编号 | 需求名称 | 目标版本 | 修订 | 准入状态 | 已选方案 | 影响模块 | 设计单元 |\n|---|---|---|---:|---|---|---|---:|\n${rows}\n`;
}
