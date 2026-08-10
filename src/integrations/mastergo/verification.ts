import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export interface MasterGoVerificationOutput {
  resultPath: string;
  status: "PASS";
}

export async function verifyMasterGoCanvas(
  requirementDirectory: string,
  evidence: string,
  now: () => Date = () => new Date(),
): Promise<MasterGoVerificationOutput> {
  const trimmedEvidence = evidence.trim();
  if (!trimmedEvidence) throw new Error("人工画布验收必须提供 --evidence 证据说明。");
  const resultPath = path.join(requirementDirectory, "07-mastergo", "mastergo-write-result.json");
  const result = JSON.parse(await readFile(resultPath, "utf8")) as Record<string, unknown>;
  if (result.status !== "PENDING_VERIFICATION") {
    throw new Error(`仅允许回写 PENDING_VERIFICATION 结果；当前状态：${String(result.status ?? "UNKNOWN")}`);
  }
  const pages = result.pages;
  if (!Array.isArray(pages) || pages.length === 0) throw new Error("写入结果缺少可验收页面。");
  if (pages.some((page) => !page || typeof page !== "object" || !["PASS", "PENDING_VERIFICATION"].includes(String((page as Record<string, unknown>).status)))) {
    throw new Error("存在未受理或失败页面，禁止回写 PASS。");
  }
  const verifiedAt = now().toISOString();
  for (const page of pages as Array<Record<string, unknown>>) {
    page.status = "PASS";
    page.verification = { status: "PASS", method: "manual-canvas-review", verifiedAt };
  }
  Object.assign(result, {
    status: "PASS",
    verificationRequired: false,
    verification: { status: "PASS", method: "manual-canvas-review", verifiedAt, evidence: trimmedEvidence },
  });
  await writeFile(resultPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  return { resultPath, status: "PASS" };
}
