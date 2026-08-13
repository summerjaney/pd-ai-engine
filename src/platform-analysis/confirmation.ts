import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { PlatformAnalysisReport, PlatformBoundaryPath } from "./types.js";

export interface PlatformDecisionConfirmation {
  schemaVersion: "1.2";
  status: "confirmed";
  analysisHash: string;
  requirementFingerprint: string;
  decision: {
    path: PlatformBoundaryPath;
    scope: string;
    note?: string;
  };
  confirmedAt: string;
  confirmedBy: "product-manager";
}

export function calculatePlatformAnalysisHash(report: PlatformAnalysisReport): string {
  return createHash("sha256").update(JSON.stringify(report)).digest("hex");
}

export async function confirmPlatformDecision(requirementDirectory: string, decision: PlatformDecisionConfirmation["decision"]): Promise<{ confirmation: PlatformDecisionConfirmation; path: string }> {
  const analysisPath = path.join(requirementDirectory, "00-platform-analysis", "platform-analysis.json");
  let report: PlatformAnalysisReport;
  try { report = JSON.parse(await readFile(analysisPath, "utf8")) as PlatformAnalysisReport; }
  catch (error) { throw new Error(`无法读取平台前置分析：${(error as Error).message}`); }
  if (!decision.scope.trim()) throw new Error("平台判断确认必须填写本次范围。");
  const confirmation: PlatformDecisionConfirmation = {
    schemaVersion: "1.2",
    status: "confirmed",
    analysisHash: calculatePlatformAnalysisHash(report),
    requirementFingerprint: report.requirement.fingerprint,
    decision: { ...decision, scope: decision.scope.trim(), note: decision.note?.trim() || undefined },
    confirmedAt: new Date().toISOString(),
    confirmedBy: "product-manager",
  };
  const confirmationPath = path.join(requirementDirectory, "00-platform-analysis", "platform-decision-confirmation.json");
  await writeFile(confirmationPath, `${JSON.stringify(confirmation, null, 2)}\n`, "utf8");
  return { confirmation, path: confirmationPath };
}

export async function loadValidPlatformDecision(requirementDirectory: string, report: PlatformAnalysisReport): Promise<PlatformDecisionConfirmation | undefined> {
  try {
    const confirmation = JSON.parse(await readFile(path.join(requirementDirectory, "00-platform-analysis", "platform-decision-confirmation.json"), "utf8")) as PlatformDecisionConfirmation;
    if (confirmation.schemaVersion !== "1.2" || confirmation.status !== "confirmed") return undefined;
    if (confirmation.analysisHash !== calculatePlatformAnalysisHash(report) || confirmation.requirementFingerprint !== report.requirement.fingerprint) return undefined;
    if (!confirmation.decision?.path || !confirmation.decision.scope?.trim()) return undefined;
    return confirmation;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}
