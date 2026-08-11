import { createHash } from "node:crypto";
import { readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";

export interface FormalDeliveryIssue {
  code: "MISSING_FILE" | "INVALID_FORMAT" | "HASH_MISMATCH" | "ABSOLUTE_PATH" | "UNRESOLVED_PLACEHOLDER" | "METADATA_MISMATCH" | "DELIVERY_GATE_FAILED";
  severity: "error";
  message: string;
  file?: string;
}

export interface FormalDeliveryValidationReport {
  schemaVersion: "0.9";
  generatedAt: string;
  valid: boolean;
  checks: {
    documentFormats: "PASS" | "FAIL";
    manifestIntegrity: "PASS" | "FAIL";
    metadataConsistency: "PASS" | "FAIL";
    contentSafety: "PASS" | "FAIL";
  };
  summary: { checkedFileCount: number; errorCount: number };
  issues: FormalDeliveryIssue[];
}

type PackageManifest = {
  documents: Array<{ format: string; path: string; size: number; sha256: string }>;
};

const digest = (content: Buffer) => createHash("sha256").update(content).digest("hex");
const isAbsoluteLike = (value: string) => path.isAbsolute(value) || /^[A-Za-z]:[\\/]/.test(value);

function render(report: FormalDeliveryValidationReport): string {
  const rows = report.issues.length
    ? report.issues.map((issue) => `| ${issue.code} | ${issue.file ?? "-"} | ${issue.message} |`).join("\n")
    : "| - | - | 无阻断问题 |";
  return `# PAE v0.9.0 正式交付一致性检查报告\n\n- 检查结论：${report.valid ? "PASS" : "FAIL"}\n- 已检查文件：${report.summary.checkedFileCount}\n- 阻断错误：${report.summary.errorCount}\n\n| 检查项 | 结果 |\n|---|---|\n| DOCX/PDF 格式 | ${report.checks.documentFormats} |\n| 文件清单与哈希 | ${report.checks.manifestIntegrity} |\n| 版本与需求元数据 | ${report.checks.metadataConsistency} |\n| 路径与占位符安全 | ${report.checks.contentSafety} |\n\n## 问题明细\n\n| 编码 | 文件 | 说明 |\n|---|---|---|\n${rows}\n`;
}

export async function validateFormalDelivery(requirementDirectory: string): Promise<{ report: FormalDeliveryValidationReport; jsonPath: string; markdownPath: string }> {
  const root = path.resolve(requirementDirectory);
  const deliveryDirectory = path.join(root, "12-delivery");
  const issues: FormalDeliveryIssue[] = [];
  let checkedFileCount = 0;
  let manifest: PackageManifest | undefined;
  try {
    manifest = JSON.parse(await readFile(path.join(deliveryDirectory, "formal-package-manifest.json"), "utf8")) as PackageManifest;
  } catch {
    issues.push({ code: "MISSING_FILE", severity: "error", file: "12-delivery/formal-package-manifest.json", message: "缺少或无法解析正式包清单。" });
  }

  for (const entry of manifest?.documents ?? []) {
    if (isAbsoluteLike(entry.path) || entry.path.split(/[\\/]/).includes("..")) {
      issues.push({ code: "ABSOLUTE_PATH", severity: "error", file: entry.path, message: "交付清单必须使用需求目录内的相对路径。" });
      continue;
    }
    try {
      const file = path.join(root, entry.path);
      const [content, metadata] = await Promise.all([readFile(file), stat(file)]);
      checkedFileCount++;
      const signatureValid = entry.format === "docx" ? content.subarray(0, 2).toString() === "PK" : entry.format === "pdf" && content.subarray(0, 5).toString() === "%PDF-";
      if (!signatureValid) issues.push({ code: "INVALID_FORMAT", severity: "error", file: entry.path, message: `${entry.format.toUpperCase()} 文件签名无效。` });
      if (metadata.size !== entry.size || digest(content) !== entry.sha256) issues.push({ code: "HASH_MISMATCH", severity: "error", file: entry.path, message: "文件大小或 SHA-256 与正式包清单不一致。" });
    } catch {
      issues.push({ code: "MISSING_FILE", severity: "error", file: entry.path, message: "清单中的正式文档不存在。" });
    }
  }

  const metadataFiles = ["documents/document-model.json", "documents/document-export-manifest.json"];
  let requirementId: string | undefined;
  try { requirementId = (JSON.parse(await readFile(path.join(root, "requirement.json"), "utf8")) as { requirementId?: string }).requirementId; } catch { /* legacy output may not have metadata */ }
  for (const relative of metadataFiles) {
    try {
      const text = await readFile(path.join(deliveryDirectory, relative), "utf8");
      checkedFileCount++;
      if (/\{\{[^}]+\}\}|<需求目录>|<project>|<requirement>/i.test(text)) issues.push({ code: "UNRESOLVED_PLACEHOLDER", severity: "error", file: `12-delivery/${relative}`, message: "交付元数据中仍包含模板占位符。" });
      if (/"(?:sourcePath|documentModelPath|outputPath|path)"\s*:\s*"(?:\/|[A-Za-z]:[\\/])/.test(text)) issues.push({ code: "ABSOLUTE_PATH", severity: "error", file: `12-delivery/${relative}`, message: "交付元数据泄露了本地绝对路径。" });
      if (requirementId && !text.includes(`"requirementId": "${requirementId}"`)) issues.push({ code: "METADATA_MISMATCH", severity: "error", file: `12-delivery/${relative}`, message: "需求编号与 requirement.json 不一致。" });
    } catch {
      issues.push({ code: "MISSING_FILE", severity: "error", file: `12-delivery/${relative}`, message: "缺少正式文档元数据。" });
    }
  }

  try {
    const delivery = JSON.parse(await readFile(path.join(deliveryDirectory, "delivery-manifest.json"), "utf8")) as { checks?: { artifactIntegrity?: string } };
    checkedFileCount++;
    if (delivery.checks?.artifactIntegrity !== "PASS") issues.push({ code: "DELIVERY_GATE_FAILED", severity: "error", file: "12-delivery/delivery-manifest.json", message: "基础成果物不完整，不能构建正式交付包。" });
  } catch {
    issues.push({ code: "MISSING_FILE", severity: "error", file: "12-delivery/delivery-manifest.json", message: "缺少基础交付清单。" });
  }

  const has = (...codes: FormalDeliveryIssue["code"][]) => issues.some((issue) => codes.includes(issue.code));
  const report: FormalDeliveryValidationReport = {
    schemaVersion: "0.9", generatedAt: new Date().toISOString(), valid: issues.length === 0,
    checks: {
      documentFormats: has("MISSING_FILE", "INVALID_FORMAT") ? "FAIL" : "PASS",
      manifestIntegrity: has("MISSING_FILE", "HASH_MISMATCH") ? "FAIL" : "PASS",
      metadataConsistency: has("METADATA_MISMATCH", "DELIVERY_GATE_FAILED") ? "FAIL" : "PASS",
      contentSafety: has("ABSOLUTE_PATH", "UNRESOLVED_PLACEHOLDER") ? "FAIL" : "PASS",
    },
    summary: { checkedFileCount, errorCount: issues.length }, issues,
  };
  const jsonPath = path.join(deliveryDirectory, "formal-delivery-validation.json");
  const markdownPath = path.join(deliveryDirectory, "formal-delivery-validation.md");
  await Promise.all([writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8"), writeFile(markdownPath, render(report), "utf8")]);
  return { report, jsonPath, markdownPath };
}
