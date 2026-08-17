import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { promotePlatformKnowledgeEntities } from "../platform-knowledge/promotion.js";
import type { MaterialKnowledgeComparisonReport, MaterialKnowledgeDerivation, MaterialPromotionPackage, MaterialReviewDecisionFile } from "./types.js";

export async function prepareMaterialPromotionPackage(
  derivationPath: string,
  comparisonPath: string,
  reviewPath: string,
  outputDirectory?: string,
): Promise<{ promotion: MaterialPromotionPackage; jsonPath: string; markdownPath: string }> {
  const derivation = JSON.parse(await readFile(derivationPath, "utf8")) as MaterialKnowledgeDerivation;
  const comparison = JSON.parse(await readFile(comparisonPath, "utf8")) as MaterialKnowledgeComparisonReport;
  const review = JSON.parse(await readFile(reviewPath, "utf8")) as MaterialReviewDecisionFile;
  if (derivation.schemaVersion !== "1.5" || comparison.schemaVersion !== "1.5" || review.schemaVersion !== "1.5") throw new Error("资料候选审核文件版本无效。");
  if (new Set([derivation.sourceId, comparison.sourceId, review.sourceId]).size !== 1) throw new Error("资料候选、比较报告与审核决定的来源不一致。");
  if (comparison.catalogVersion !== review.catalogVersion) throw new Error("比较报告与审核决定的知识目录版本不一致。");
  if (!review.reviewedAt) throw new Error("审核决定缺少 reviewedAt，必须由产品经理完成审核。");
  if (review.decisions.some((item) => item.action === "pending")) throw new Error("仍有待审核候选，不能生成晋升包。");
  const byCandidate = new Map(derivation.candidates.map((item) => [item.id, item]));
  const byComparison = new Map(comparison.comparisons.map((item) => [item.candidateId, item]));
  if (review.decisions.some((item) => !byCandidate.has(item.candidateId) || !byComparison.has(item.candidateId))) throw new Error("审核决定包含不存在的候选。");
  const approved = review.decisions.filter((item) => item.action === "accept-new").map((decision) => {
    const comparisonItem = byComparison.get(decision.candidateId)!;
    if (comparisonItem.decision !== "new-knowledge") throw new Error(`候选 ${decision.candidateId} 不是新增知识，不能使用 accept-new。`);
    return byCandidate.get(decision.candidateId)!;
  });
  if (!approved.length) throw new Error("审核结果中没有可作为新增知识晋升的候选。");
  const promotion: MaterialPromotionPackage = { schemaVersion: "1.5", sourceId: derivation.sourceId, catalogVersion: comparison.catalogVersion,
    status: "approved-for-explicit-promotion", approvedAt: review.reviewedAt, approvedBy: "product-manager", candidates: approved };
  const directory = outputDirectory ?? path.join(path.dirname(reviewPath), "promotion");
  await mkdir(directory, { recursive: true });
  const jsonPath = path.join(directory, "promotion-package.json");
  const markdownPath = path.join(directory, "promotion-package.md");
  const markdown = `# 产品资料知识晋升包\n\n- 来源：${promotion.sourceId}\n- 审核人：产品经理\n- 审核时间：${promotion.approvedAt}\n- 正式目录版本：${promotion.catalogVersion}\n- 待显式晋升：${promotion.candidates.length}\n\n${promotion.candidates.map((item) => `- ${item.id} [${item.kind}] ${item.entity.name}`).join("\n")}\n\n> 生成晋升包不会修改正式知识；仍需显式执行 material promote。\n`;
  await Promise.all([writeFile(jsonPath, `${JSON.stringify(promotion, null, 2)}\n`, "utf8"), writeFile(markdownPath, markdown, "utf8")]);
  return { promotion, jsonPath, markdownPath };
}

export async function promoteMaterialPackage(packagePath: string, knowledgeDirectory: string): Promise<{ acceptedIds: string[]; catalogPath: string; snapshotPath: string; acceptancePath: string }> {
  const promotion = JSON.parse(await readFile(packagePath, "utf8")) as MaterialPromotionPackage;
  if (promotion.schemaVersion !== "1.5" || promotion.status !== "approved-for-explicit-promotion" || promotion.approvedBy !== "product-manager") throw new Error("产品资料知识晋升包无效或尚未完成产品经理审核。");
  const result = await promotePlatformKnowledgeEntities(knowledgeDirectory, promotion.candidates.map((item) => item.entity), {
    expectedCatalogVersion: promotion.catalogVersion, acceptedBy: promotion.approvedBy,
  });
  const acceptancePath = path.join(path.dirname(packagePath), "promotion-acceptance.json");
  await writeFile(acceptancePath, `${JSON.stringify({ schemaVersion: "1.5", status: "accepted", sourceId: promotion.sourceId, acceptedAt: new Date().toISOString(), acceptedIds: result.accepted.map((item) => item.id), catalogVersion: promotion.catalogVersion, snapshotPath: result.snapshotPath }, null, 2)}\n`, "utf8");
  return { acceptedIds: result.accepted.map((item) => item.id), catalogPath: result.catalogPath, snapshotPath: result.snapshotPath, acceptancePath };
}
