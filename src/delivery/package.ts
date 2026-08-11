import { createHash } from "node:crypto";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { runManualCheck } from "../manual/service.js";
import type { DeliveryPackageManifest } from "../manual/types.js";
import { runDeliveryCheck } from "../planning/delivery-check.js";

const REQUIRED_ARTIFACTS = [
  ["prototype", "06-prototype/prototype.json"],
  ["mastergo-data", "07-mastergo/mastergo-data.json"],
  ["prototype-confirmation", "08-prototype-confirmation.json"],
  ["prd", "09-prd.md"],
  ["product-manual", "10-product-manual/product-manual.md"],
  ["product-manual-data", "10-product-manual/product-manual.json"],
  ["traceability", "10-product-manual/traceability-matrix.json"],
  ["operation-manual", "11-operation-manual/operation-manual.md"],
  ["operation-manual-data", "11-operation-manual/operation-manual.json"],
  ["operation-paths", "11-operation-manual/operation-paths.json"],
] as const;

async function inspectArtifact(root: string, id: string, relativePath: string) {
  try {
    const absolutePath = path.join(root, relativePath);
    const [content, metadata] = await Promise.all([readFile(absolutePath), stat(absolutePath)]);
    return { id, path: relativePath, required: true, exists: true, sha256: createHash("sha256").update(content).digest("hex"), size: metadata.size };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { id, path: relativePath, required: true, exists: false };
    throw error;
  }
}

function renderAcceptanceReport(manifest: DeliveryPackageManifest): string {
  const missing = manifest.artifacts.filter((item) => !item.exists);
  const missingText = missing.length === 0 ? "无。" : missing.map((item) => `- ${item.path}`).join("\n");
  const verdict = manifest.status === "PASS"
    ? "设计成果、手册和交付文件均通过检查，满足交付门槛。"
    : manifest.status === "PENDING"
      ? "交付文件与手册检查通过，仍待完成 MasterGo 真实画布验收。"
      : "存在阻断问题，暂不满足交付门槛。";
  return `# PAE v0.8.0 正式验收报告\n\n- 需求编号：${manifest.requirementId ?? "未指定"}\n- 验收结论：${manifest.status}\n- 设计交付链路：${manifest.checks.designDelivery}\n- 手册一致性：${manifest.checks.manualConsistency}\n- 交付文件完整性：${manifest.checks.artifactIntegrity}\n- 必需文件：${manifest.summary.presentCount}/${manifest.summary.requiredCount}\n\n## 缺失文件\n\n${missingText}\n\n## 发布判定\n\n${verdict}\n`;
}

function renderDeliveryCheckReport(manifest: DeliveryPackageManifest): string {
  const rows = manifest.artifacts.map((item) => `| ${item.id} | ${item.path} | ${item.exists ? "PASS" : "FAIL"} | ${item.sha256 ?? "-"} |`).join("\n");
  return `# PAE v0.8.0 交付检查报告\n\n- 检查结论：${manifest.status}\n- 必需文件：${manifest.summary.presentCount}/${manifest.summary.requiredCount}\n\n| 成果 | 路径 | 状态 | SHA-256 |\n|---|---|---|---|\n${rows}\n`;
}

export async function packageDelivery(requirementDirectory: string): Promise<{ manifest: DeliveryPackageManifest; manifestPath: string; checkReportPath: string; acceptanceReportPath: string }> {
  const root = path.resolve(requirementDirectory);
  const artifacts = await Promise.all(REQUIRED_ARTIFACTS.map(([id, artifactPath]) => inspectArtifact(root, id, artifactPath)));
  const delivery = await runDeliveryCheck(root).catch(() => undefined);
  const manuals = await runManualCheck(root).catch(() => undefined);
  const missingCount = artifacts.filter((item) => !item.exists).length;
  const designDelivery = delivery?.report.valid
    ? (delivery.report.checks.masterGoSubmission === "PENDING" ? "PENDING" : "PASS")
    : "FAIL";
  const manualConsistency = manuals?.report.valid ? "PASS" : "FAIL";
  const artifactIntegrity = missingCount === 0 ? "PASS" : "FAIL";
  const status = designDelivery === "FAIL" || manualConsistency === "FAIL" || artifactIntegrity === "FAIL"
    ? "FAIL"
    : designDelivery === "PENDING" ? "PENDING" : "PASS";
  const manifest: DeliveryPackageManifest = {
    schemaVersion: "0.8",
    requirementId: delivery?.report.requirementId ?? manuals?.report.requirementId,
    generatedAt: new Date().toISOString(),
    status,
    checks: { designDelivery, manualConsistency, artifactIntegrity },
    artifacts,
    summary: { requiredCount: artifacts.length, presentCount: artifacts.length - missingCount, missingCount },
  };
  const directory = path.join(root, "12-delivery");
  const manifestPath = path.join(directory, "delivery-manifest.json");
  const checkReportPath = path.join(directory, "delivery-check-report.md");
  const acceptanceReportPath = path.join(directory, "acceptance-report.md");
  await mkdir(directory, { recursive: true });
  await Promise.all([
    writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8"),
    writeFile(checkReportPath, renderDeliveryCheckReport(manifest), "utf8"),
    writeFile(acceptanceReportPath, renderAcceptanceReport(manifest), "utf8"),
  ]);
  return { manifest, manifestPath, checkReportPath, acceptanceReportPath };
}
