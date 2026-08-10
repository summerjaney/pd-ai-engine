import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { DeliveryConsistencyReport, MasterGoData, MasterGoResult, PrdTraceabilityReport, PrototypeDsl, WorkflowArtifacts } from "../domain/types.js";
import { renderDeliveryConsistencyReport, validateDeliveryConsistency } from "./delivery-consistency-validator.js";

const readJson = async <T>(file: string): Promise<T> => JSON.parse(await readFile(file, "utf8")) as T;

export interface DeliveryCheckOutput {
  report: DeliveryConsistencyReport;
  jsonPath: string;
  markdownPath: string;
}

export async function runDeliveryCheck(requirementDirectory: string): Promise<DeliveryCheckOutput> {
  const root = path.resolve(requirementDirectory);
  const prototype = await readJson<PrototypeDsl>(path.join(root, "06-prototype", "prototype.json"));
  const data = await readJson<MasterGoData>(path.join(root, "07-mastergo", "mastergo-data.json"));
  const result = await readOptionalJson<MasterGoResult>(path.join(root, "07-mastergo", "mastergo-result.json"));
  const confirmation = await readOptionalJson<NonNullable<WorkflowArtifacts["prototype-confirmation"]>>(path.join(root, "08-prototype-confirmation.json"));
  const traceability = await readJson<PrdTraceabilityReport>(path.join(root, "09-validation", "prd-traceability.json"));
  const report = validateDeliveryConsistency(prototype, { data, result }, confirmation, traceability);
  const directory = path.join(root, "09-validation");
  const jsonPath = path.join(directory, "delivery-consistency-report.json");
  const markdownPath = path.join(directory, "delivery-consistency-report.md");
  await mkdir(directory, { recursive: true });
  await Promise.all([
    writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8"),
    writeFile(markdownPath, renderDeliveryConsistencyReport(report), "utf8"),
  ]);
  return { report, jsonPath, markdownPath };
}

async function readOptionalJson<T>(file: string): Promise<T | undefined> {
  try { return await readJson<T>(file); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}

export async function generateAcceptanceReport(requirementDirectory: string, report?: DeliveryConsistencyReport): Promise<{ status: "PASS" | "FAIL" | "PENDING"; reportPath: string }> {
  const root = path.resolve(requirementDirectory);
  const delivery = report ?? (await runDeliveryCheck(root)).report;
  const status = delivery.valid ? (delivery.checks.masterGoSubmission === "PENDING" ? "PENDING" : "PASS") : "FAIL";
  const issues = delivery.issues.length === 0 ? "无。" : delivery.issues.map((issue) => `- [${issue.severity.toUpperCase()}] ${issue.code}：${issue.message}`).join("\n");
  const content = `# PAE v0.7.0 正式验收报告\n\n- 需求编号：${delivery.requirementId ?? "未指定"}\n- 验收结论：${status}\n- Prototype → MasterGo：${delivery.checks.prototypeToMasterGo}\n- MasterGo 真实写入：${delivery.checks.masterGoSubmission}\n- 原型确认：${delivery.checks.prototypeConfirmation}\n- PRD 追踪：${delivery.checks.prdTraceability}\n- 阻断错误：${delivery.summary.errorCount}\n- 警告：${delivery.summary.warningCount}\n\n## 验收问题\n\n${issues}\n\n## 发布判定\n\n${status === "PASS" ? "满足本次交付验收门槛。" : status === "PENDING" ? "自动化检查通过，待完成 MasterGo 真实画布验收后方可发布。" : "存在阻断错误，暂不满足发布门槛。"}\n`;
  const directory = path.join(root, "10-review");
  const reportPath = path.join(directory, "acceptance-report.md");
  await mkdir(directory, { recursive: true });
  await writeFile(reportPath, content, "utf8");
  return { status, reportPath };
}
