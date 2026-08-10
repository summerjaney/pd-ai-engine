import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export interface MasterGoVerificationOutput {
  resultPath: string;
  status: "PASS" | "PENDING_VERIFICATION";
}

export async function verifyMasterGoCanvas(
  requirementDirectory: string,
  evidence: string,
  now: () => Date = () => new Date(),
  pageId?: string,
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
  if (pages.some((page) => !page || typeof page !== "object" || !["PASS", "PENDING_VERIFICATION", "VERIFIED"].includes(String((page as Record<string, unknown>).status)))) {
    throw new Error("存在未受理或失败页面，禁止回写 PASS。");
  }
  const verifiedAt = now().toISOString();
  const matchesPageId = (page: Record<string, unknown>, requestedId: string): boolean => {
    const screenId = String(page.screenId ?? "");
    return screenId === requestedId || screenId.startsWith(`${requestedId}-`);
  };
  const selected = pageId
    ? (pages as Array<Record<string, unknown>>).filter((page) => matchesPageId(page, pageId))
    : (pages as Array<Record<string, unknown>>).filter((page) => page.status === "PENDING_VERIFICATION");
  if (selected.length === 0) throw new Error(`未找到待验收页面：${pageId}`);
  if (selected.some((page) => page.status !== "PENDING_VERIFICATION")) throw new Error(`页面 ${pageId ?? ""} 不是 PENDING_VERIFICATION，禁止重复验收。`);
  for (const page of selected) {
    page.status = pageId ? "VERIFIED" : "PASS";
    page.verification = { status: "PASS", method: "manual-canvas-review", verifiedAt, evidence: trimmedEvidence };
  }
  const allVerified = (pages as Array<Record<string, unknown>>).every((page) => ["PASS", "VERIFIED"].includes(String(page.status)));
  Object.assign(result, {
    status: allVerified ? "PASS" : "PENDING_VERIFICATION",
    verificationRequired: !allVerified,
    verification: allVerified ? { status: "PASS", method: "manual-canvas-review", verifiedAt, evidence: trimmedEvidence } : undefined,
  });
  await writeFile(resultPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  return { resultPath, status: result.status as MasterGoVerificationOutput["status"] };
}
