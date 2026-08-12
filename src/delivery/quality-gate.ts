import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { validateFormalDelivery } from "./formal-validator.js";

type GateStatus = "PASS" | "PASS_WITH_WARNINGS" | "FAIL";
export interface ReleaseQualityGateReport {
  schemaVersion: "1.0"; generatedAt: string; level: "release"; status: GateStatus;
  checks: { formalDelivery: "PASS" | "FAIL"; runCompletion: "PASS" | "FAIL"; traceability: "PASS" | "FAIL" };
  issues: Array<{ code: string; severity: "error" | "warning"; message: string }>;
}

async function readJson<T>(file: string): Promise<T | undefined> { try { return JSON.parse(await readFile(file, "utf8")) as T; } catch { return undefined; } }

export async function runReleaseQualityGate(requirementDirectory: string): Promise<{ report: ReleaseQualityGateReport; jsonPath: string; markdownPath: string; summaryPath: string; traceabilityPath: string }> {
  const root = path.resolve(requirementDirectory);
  const directory = path.join(root, "12-delivery");
  await mkdir(directory, { recursive: true });
  const formal = await validateFormalDelivery(root);
  const run = await readJson<{ status?: string; stages?: Array<{ status?: string }> }>(path.join(root, "run.json"));
  const trace = await readJson<{ summary?: { missingCount?: number } }>(path.join(root, "10-product-manual", "traceability-matrix.json"));
  const issues: ReleaseQualityGateReport["issues"] = [];
  if (!formal.report.valid) issues.push({ code: "FORMAL_DELIVERY_FAILED", severity: "error", message: "正式文档、清单或内容安全检查未通过。" });
  const runComplete = run?.status === "SUCCEEDED" && !(run.stages ?? []).some((item) => item.status === "FAILED");
  if (!runComplete) issues.push({ code: "RUN_NOT_COMPLETE", severity: "error", message: "端到端运行尚未成功完成。" });
  const traceComplete = trace?.summary?.missingCount === 0;
  if (!traceComplete) issues.push({ code: "TRACEABILITY_GAP", severity: "error", message: "手册追踪矩阵缺失或仍有未覆盖项。" });
  const report: ReleaseQualityGateReport = { schemaVersion: "1.0", generatedAt: new Date().toISOString(), level: "release", status: issues.some((item) => item.severity === "error") ? "FAIL" : issues.length ? "PASS_WITH_WARNINGS" : "PASS", checks: { formalDelivery: formal.report.valid ? "PASS" : "FAIL", runCompletion: runComplete ? "PASS" : "FAIL", traceability: traceComplete ? "PASS" : "FAIL" }, issues };
  const requirement = await readJson<{ requirementId?: string; requirementName?: string; revision?: number; productVersion?: string }>(path.join(root, "requirement.json"));
  const jsonPath = path.join(directory, "quality-gate-report.json");
  const markdownPath = path.join(directory, "quality-gate-report.md");
  const summaryPath = path.join(directory, "delivery-summary.md");
  const traceabilityPath = path.join(directory, "traceability-matrix.json");
  const issueText = issues.length ? issues.map((item) => `- [${item.severity.toUpperCase()}] ${item.code}：${item.message}`).join("\n") : "无。";
  const markdown = `# PAE v1.0.0 Release 质量门禁\n\n- 结论：${report.status}\n- 正式交付：${report.checks.formalDelivery}\n- 运行完成：${report.checks.runCompletion}\n- 追踪完整：${report.checks.traceability}\n\n## 问题\n\n${issueText}\n`;
  const summary = `# PAE v1.0.0 正式交付总览\n\n- 需求编号：${requirement?.requirementId ?? "未指定"}\n- 需求标识：${requirement?.requirementName ?? "未指定"}\n- 产品版本：${requirement?.productVersion ?? "未指定"}\n- Revision：${requirement?.revision ?? "未指定"}\n- 质量门禁：${report.status}\n\n## 正式成果\n\n- 产品设计 DOCX：documents/product-design.docx\n- 产品设计 PDF：documents/product-design.pdf\n- 正式交付包：formal-delivery-package.zip\n- 正式验收报告：acceptance-report.md\n- Release 质量报告：quality-gate-report.md\n- 追踪矩阵：traceability-matrix.json\n`;
  const writes: Array<Promise<unknown>> = [writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8"), writeFile(markdownPath, markdown, "utf8"), writeFile(summaryPath, summary, "utf8"), writeFile(path.join(directory, "acceptance-report-v1.0.md"), markdown.replace("Release 质量门禁", "正式验收报告"), "utf8")];
  if (trace) writes.push(copyFile(path.join(root, "10-product-manual", "traceability-matrix.json"), traceabilityPath));
  await Promise.all(writes);
  return { report, jsonPath, markdownPath, summaryPath, traceabilityPath };
}
