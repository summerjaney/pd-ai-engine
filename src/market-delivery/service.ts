import { createHash } from "node:crypto";
import { createWriteStream } from "node:fs";
import { copyFile, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { ZipArchive } from "archiver";
import { DiscoveryService } from "../discovery/service.js";
import { MarketEvidenceService } from "../market-evidence/service.js";
import { ReleaseObjectiveService } from "../release-objective/service.js";
import { ReleaseRetrospectiveService } from "../release-retrospective/service.js";
import type { ReleaseScopeDecision } from "../release-planning/types.js";
import { ValueChainService } from "../value-chain/service.js";

const digest = (content: Buffer | string): string => createHash("sha256").update(content).digest("hex");
const releaseDirectory = (projectDirectory: string, version: string): string => path.join(projectDirectory, "releases", `v${version.replace(/^v/, "")}`);

export async function finalizeMarketDelivery(projectDirectory: string, version: string, evidenceDirectory: string, discoveryDirectory: string): Promise<{ acceptance: { schemaVersion: "1.9"; status: "PASS" | "FAIL"; checks: Array<{ id: string; status: "PASS" | "FAIL"; message: string }> }; manifestPath: string; zipPath: string }> {
  const release = releaseDirectory(projectDirectory, version); const decision = JSON.parse(await readFile(path.join(release, "release-scope-decision.json"), "utf8")) as ReleaseScopeDecision;
  const evidence = await new MarketEvidenceService().load(evidenceDirectory); const discovery = await new DiscoveryService().status(evidenceDirectory, discoveryDirectory); const objective = await new ReleaseObjectiveService().check(projectDirectory, version);
  let retrospectiveExists = true; try { await readFile(path.join(release, "release-retrospective.json"), "utf8"); } catch { retrospectiveExists = false; }
  const valueService = new ValueChainService(); const valueChecks = await Promise.all(decision.includedRequirementIds.map(async (id) => {
    const entries = await (await import("node:fs/promises")).readdir(path.join(projectDirectory, "requirements"), { withFileTypes: true }); const entry = entries.find((item) => item.isDirectory() && item.name.startsWith(`${id}-`));
    if (!entry) return { id, valid: false, message: "未找到需求目录。" };
    const result = await valueService.check(path.join(projectDirectory, "requirements", entry.name), discoveryDirectory); return { id, valid: result.check.valid, message: result.check.issues.join("；") || "价值链有效。", directory: path.join(projectDirectory, "requirements", entry.name) };
  }));
  const checks = [
    { id: "evidence", status: evidence.evidence.length ? "PASS" as const : "FAIL" as const, message: `已登记 ${evidence.evidence.length} 项市场证据。` },
    { id: "discovery", status: !discovery.stale && discovery.report.status === "reviewed" ? "PASS" as const : "FAIL" as const, message: discovery.stale ? "发现草稿已失效。" : `发现审核状态：${discovery.report.status}` },
    { id: "value-chain", status: valueChecks.every((item) => item.valid) ? "PASS" as const : "FAIL" as const, message: valueChecks.map((item) => `${item.id}: ${item.message}`).join("；") },
    { id: "release-objective", status: objective.check.valid ? "PASS" as const : "FAIL" as const, message: objective.check.issues.join("；") || "版本目标有效。" },
    { id: "retrospective", status: retrospectiveExists ? "PASS" as const : "FAIL" as const, message: retrospectiveExists ? "发布后复盘已记录。" : "尚未记录发布后复盘。" },
  ];
  const acceptance = { schemaVersion: "1.9" as const, status: checks.every((item) => item.status === "PASS") ? "PASS" as const : "FAIL" as const, checks };
  if (acceptance.status !== "PASS") throw new Error(`v1.9.0 市场决策交付验收失败：${checks.filter((item) => item.status === "FAIL").map((item) => item.message).join("；")}`);
  const delivery = path.join(release, "market-decision-delivery"); const artifacts = path.join(delivery, "artifacts"); await mkdir(artifacts, { recursive: true });
  const publicEvidencePath = await new MarketEvidenceService().exportPublic(evidenceDirectory, path.join(artifacts, "public-market-evidence.json"));
  const sources = [{ name: "release-objective.json", source: path.join(release, "release-objective.json") }, { name: "release-metrics.md", source: path.join(release, "release-metrics.md") }, { name: "release-retrospective.json", source: path.join(release, "release-retrospective.json") }, { name: "release-retrospective.md", source: path.join(release, "release-retrospective.md") }, ...valueChecks.map((item) => ({ name: `${item.id}-value-chain.json`, source: path.join(item.directory!, "13-value-chain", "requirement-value-chain.json") }))];
  const listed = [{ name: path.basename(publicEvidencePath), source: publicEvidencePath }, ...sources]; const manifestArtifacts: Array<{ name: string; size: number; sha256: string }> = [];
  for (const item of listed) { const target = path.join(artifacts, item.name); if (item.source !== target) await copyFile(item.source, target); const content = await readFile(target); manifestArtifacts.push({ name: item.name, size: content.length, sha256: digest(content) }); }
  const acceptancePath = path.join(delivery, "acceptance-report.json"); const acceptanceMarkdown = path.join(delivery, "acceptance-report.md"); await Promise.all([writeFile(acceptancePath, `${JSON.stringify(acceptance, null, 2)}\n`, "utf8"), writeFile(acceptanceMarkdown, `# PAE v1.9.0 市场决策正式验收\n\n- 结论：PASS\n\n${checks.map((item) => `- [${item.status}] ${item.message}`).join("\n")}\n\n> 正式包只包含公开市场证据及其最小必要引用，不包含 internal 或 confidential 原始证据。\n`, "utf8")]);
  const zipPath = path.join(delivery, "market-decision-delivery.zip"); await new Promise<void>((resolve, reject) => { const output = createWriteStream(zipPath); const archive = new ZipArchive({ zlib: { level: 9 } }); output.on("close", resolve); output.on("error", reject); archive.on("error", reject); archive.pipe(output); archive.directory(artifacts, "artifacts"); archive.file(acceptancePath, { name: "acceptance-report.json" }); archive.file(acceptanceMarkdown, { name: "acceptance-report.md" }); void archive.finalize(); });
  const zip = await readFile(zipPath); if (zip.subarray(0, 2).toString() !== "PK") throw new Error("v1.9.0 市场决策 ZIP 交付包结构无效。"); const metadata = await stat(zipPath); const manifestPath = path.join(delivery, "delivery-manifest.json"); await writeFile(manifestPath, `${JSON.stringify({ schemaVersion: "1.9", status: "PASS", generatedAt: new Date().toISOString(), artifacts: manifestArtifacts, archive: { name: path.basename(zipPath), size: metadata.size, sha256: digest(zip) } }, null, 2)}\n`, "utf8");
  return { acceptance, manifestPath, zipPath };
}
