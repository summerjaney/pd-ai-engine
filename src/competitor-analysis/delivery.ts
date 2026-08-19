import { createHash } from "node:crypto";
import { createWriteStream } from "node:fs";
import { copyFile, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { ZipArchive } from "archiver";
import { buildCompetitorBacklog } from "./service.js";
import type { CompetitorAnalysisReport, CompetitorReview } from "./types.js";

const digest = (content: Buffer | string): string => createHash("sha256").update(content).digest("hex");

export interface CompetitorDeliveryAcceptance {
  schemaVersion: "1.8";
  generatedAt: string;
  status: "PASS" | "FAIL";
  checks: Array<{ id: string; status: "PASS" | "FAIL"; message: string }>;
  summary: { totalFeatures: number; reviewedFeatures: number; eligibleCandidates: number; confirmedPriorities: number; linkedRequirements: number };
}

const REQUIRED_FILES = [
  "competitor-analysis.json", "competitor-analysis.md", "competitor-review.json",
  "competitor-priority-review.json", "competitor-priority-assessment.json", "competitor-priority-assessment.md",
] as const;

export async function finalizeCompetitorDelivery(analysisDirectory: string, projectDirectory: string): Promise<{ acceptance: CompetitorDeliveryAcceptance; directory: string; manifestPath: string; acceptancePath: string; zipPath: string }> {
  const analysisRoot = path.resolve(analysisDirectory); const projectRoot = path.resolve(projectDirectory);
  const backlogResult = await buildCompetitorBacklog(analysisRoot, projectRoot);
  const report = JSON.parse(await readFile(path.join(analysisRoot, "competitor-analysis.json"), "utf8")) as CompetitorAnalysisReport;
  const review = JSON.parse(await readFile(path.join(analysisRoot, "competitor-review.json"), "utf8")) as CompetitorReview;
  const eligible = backlogResult.backlog.candidates;
  const reviewedFeatures = Object.keys(review.decisions ?? {}).length;
  const confirmedPriorities = eligible.filter((item) => item.reviewStatus === "CONFIRMED").length;
  const linkedRequirements = eligible.filter((item) => item.syncStatus === "LINKED").length;
  const checks: CompetitorDeliveryAcceptance["checks"] = [
    { id: "all-features-reviewed", status: review.status === "reviewed" && reviewedFeatures === report.assessments.length ? "PASS" : "FAIL", message: `${reviewedFeatures}/${report.assessments.length} 个竞品功能已完成取舍。` },
    { id: "priority-confirmed", status: confirmedPriorities === eligible.length ? "PASS" : "FAIL", message: `${confirmedPriorities}/${eligible.length} 个候选完成产品经理五维评分。` },
    { id: "requirements-linked", status: linkedRequirements === eligible.length ? "PASS" : "FAIL", message: `${linkedRequirements}/${eligible.length} 个候选已关联标准 PAE 需求。` },
  ];
  const acceptance: CompetitorDeliveryAcceptance = { schemaVersion: "1.8", generatedAt: new Date().toISOString(), status: checks.every((item) => item.status === "PASS") ? "PASS" : "FAIL", checks, summary: { totalFeatures: report.assessments.length, reviewedFeatures, eligibleCandidates: eligible.length, confirmedPriorities, linkedRequirements } };
  if (acceptance.status !== "PASS") throw new Error(`竞品分析正式验收失败：${checks.filter((item) => item.status === "FAIL").map((item) => item.message).join("；")}`);

  const directory = path.join(analysisRoot, "formal-delivery"); const artifactDirectory = path.join(directory, "artifacts"); await mkdir(artifactDirectory, { recursive: true });
  const sources = [...REQUIRED_FILES.map((name) => ({ name, source: path.join(analysisRoot, name) })),
    { name: "competitor-candidate-backlog.json", source: backlogResult.jsonPath }, { name: "competitor-candidate-backlog.md", source: backlogResult.markdownPath }];
  const artifacts = [] as Array<{ name: string; size: number; sha256: string }>;
  for (const item of sources) {
    const content = await readFile(item.source); const target = path.join(artifactDirectory, item.name); await copyFile(item.source, target);
    artifacts.push({ name: item.name, size: content.length, sha256: digest(content) });
  }
  const acceptancePath = path.join(directory, "acceptance-report.json");
  const acceptanceMarkdownPath = path.join(directory, "acceptance-report.md");
  await Promise.all([
    writeFile(acceptancePath, `${JSON.stringify(acceptance, null, 2)}\n`, "utf8"),
    writeFile(acceptanceMarkdownPath, `# PAE v1.8.0 竞品分析正式验收\n\n- 验收结论：${acceptance.status}\n- 竞品功能：${acceptance.summary.totalFeatures}\n- 已完成取舍：${acceptance.summary.reviewedFeatures}\n- 候选功能：${acceptance.summary.eligibleCandidates}\n- 已确认优先级：${acceptance.summary.confirmedPriorities}\n- 已关联标准需求：${acceptance.summary.linkedRequirements}\n\n${checks.map((item) => `- [${item.status}] ${item.message}`).join("\n")}\n`, "utf8"),
  ]);
  const zipPath = path.join(directory, "competitor-analysis-delivery.zip");
  await new Promise<void>((resolve, reject) => {
    const output = createWriteStream(zipPath); const archive = new ZipArchive({ zlib: { level: 9 } });
    output.on("close", resolve); output.on("error", reject); archive.on("error", reject); archive.pipe(output);
    archive.directory(artifactDirectory, "artifacts"); archive.file(acceptancePath, { name: "acceptance-report.json" }); archive.file(acceptanceMarkdownPath, { name: "acceptance-report.md" }); void archive.finalize();
  });
  const zip = await readFile(zipPath); if (zip.subarray(0, 2).toString() !== "PK") throw new Error("竞品分析 ZIP 交付包结构无效。");
  const zipMetadata = await stat(zipPath); const manifestPath = path.join(directory, "delivery-manifest.json");
  await writeFile(manifestPath, `${JSON.stringify({ schemaVersion: "1.8", generatedAt: new Date().toISOString(), status: "PASS", analysisHash: backlogResult.backlog.analysisHash, artifacts, archive: { name: path.basename(zipPath), size: zipMetadata.size, sha256: digest(zip) } }, null, 2)}\n`, "utf8");
  return { acceptance, directory, manifestPath, acceptancePath, zipPath };
}
