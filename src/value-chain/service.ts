import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { DiscoveryService } from "../discovery/service.js";
import type { SuccessMetric, RequirementValueChain, ValueChainCheck } from "./types.js";

const DIRECTORY = "13-value-chain";
const FILE = "requirement-value-chain.json";
const hash = (value: string): string => createHash("sha256").update(value).digest("hex");

function assertMetric(value: unknown): asserts value is SuccessMetric {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error("成功指标必须是 JSON 对象。");
  const item = value as Record<string, unknown>;
  for (const field of ["id", "name", "definition", "baseline", "target", "observationWindow", "dataSource"]) if (typeof item[field] !== "string" || !item[field].trim()) throw new Error(`成功指标缺少有效字段：${field}`);
}

async function requirement(requirementDirectory: string): Promise<{ id: string; fingerprint: string }> {
  const metadata = JSON.parse(await readFile(path.join(requirementDirectory, "requirement.json"), "utf8")) as { requirementId?: string };
  const input = await readFile(path.join(requirementDirectory, "00-requirement-input.md"), "utf8");
  if (!metadata.requirementId) throw new Error("需求目录缺少有效 requirement.json。");
  return { id: metadata.requirementId, fingerprint: hash(input) };
}

function discoveryHash(report: Awaited<ReturnType<DiscoveryService["load"]>>): string {
  return hash(JSON.stringify({ evidenceCatalogHash: report.evidenceCatalogHash, problems: report.problems.map((item) => ({ id: item.value.id, status: item.review.status })), opportunities: report.opportunities.map((item) => ({ id: item.value.id, status: item.review.status })), valueHypotheses: report.valueHypotheses.map((item) => ({ id: item.value.id, status: item.review.status })) }));
}

export class ValueChainService {
  async link(requirementDirectory: string, discoveryDirectory: string, ids: { problemId: string; opportunityId: string; valueHypothesisId: string }, metricInputPath: string): Promise<{ chain: RequirementValueChain; jsonPath: string; markdownPath: string }> {
    const discovery = await new DiscoveryService().load(discoveryDirectory);
    const problem = discovery.problems.find((item) => item.value.id === ids.problemId);
    const opportunity = discovery.opportunities.find((item) => item.value.id === ids.opportunityId);
    const hypothesis = discovery.valueHypotheses.find((item) => item.value.id === ids.valueHypothesisId);
    if (!problem || !opportunity || !hypothesis) throw new Error("需求价值链引用了不存在的发现草稿。");
    if ([problem, opportunity, hypothesis].some((item) => item.review.status !== "confirmed")) throw new Error("需求价值链只能引用产品经理已确认的问题、机会和价值假设。");
    if (!opportunity.value.problemIds.includes(problem.value.id)) throw new Error("机会点未关联所选问题，不能建立价值链。");
    if (hypothesis.value.opportunityId !== opportunity.value.id) throw new Error("价值假设未关联所选机会点，不能建立价值链。");
    const metric = JSON.parse(await readFile(metricInputPath, "utf8")) as unknown; assertMetric(metric);
    const current = await requirement(requirementDirectory);
    const chain: RequirementValueChain = { schemaVersion: "1.9", requirementId: current.id, requirementFingerprint: current.fingerprint, discoveryHash: discoveryHash(discovery), problemId: problem.value.id, opportunityId: opportunity.value.id, valueHypothesisId: hypothesis.value.id, successMetric: metric, linkedAt: new Date().toISOString(), linkedBy: "product-manager" };
    const target = path.join(requirementDirectory, DIRECTORY); await mkdir(target, { recursive: true });
    const jsonPath = path.join(target, FILE); const markdownPath = path.join(target, "requirement-value-chain.md");
    const markdown = `# 需求价值链\n\n- 需求：${chain.requirementId}\n- 问题：[problem:${chain.problemId}]\n- 机会：[opportunity:${chain.opportunityId}]\n- 价值假设：[value-hypothesis:${chain.valueHypothesisId}]\n- 成功指标：[success-metric:${chain.successMetric.id}] ${chain.successMetric.name}\n\n## 指标口径\n\n- 定义：${chain.successMetric.definition}\n- 基线：${chain.successMetric.baseline}\n- 目标：${chain.successMetric.target}\n- 观察窗口：${chain.successMetric.observationWindow}\n- 数据来源：${chain.successMetric.dataSource}\n\n> 价值链由产品经理确认；需求输入或发现审核变化后，必须重新校验。\n`;
    await Promise.all([writeFile(jsonPath, `${JSON.stringify(chain, null, 2)}\n`, "utf8"), writeFile(markdownPath, markdown, "utf8")]);
    return { chain, jsonPath, markdownPath };
  }

  async check(requirementDirectory: string, discoveryDirectory: string): Promise<{ chain?: RequirementValueChain; check: ValueChainCheck; jsonPath: string; markdownPath: string }> {
    const target = path.join(requirementDirectory, DIRECTORY); const jsonPath = path.join(target, "value-chain-check.json"); const markdownPath = path.join(target, "value-chain-check.md");
    const issues: string[] = []; let chain: RequirementValueChain | undefined;
    try { chain = JSON.parse(await readFile(path.join(target, FILE), "utf8")) as RequirementValueChain; } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") issues.push("尚未建立需求价值链。"); else throw error; }
    let stale = false;
    if (chain) {
      const current = await requirement(requirementDirectory); if (chain.schemaVersion !== "1.9" || chain.requirementId !== current.id) issues.push("需求价值链结构或需求标识无效。");
      if (chain.requirementFingerprint !== current.fingerprint) { stale = true; issues.push("需求输入已变化，价值链需要重新确认。"); }
      const discovery = await new DiscoveryService().load(discoveryDirectory);
      if (chain.discoveryHash !== discoveryHash(discovery)) { stale = true; issues.push("发现草稿或审核状态已变化，价值链需要重新确认。"); }
    }
    const check = { valid: issues.length === 0, stale, issues };
    await mkdir(target, { recursive: true });
    await Promise.all([writeFile(jsonPath, `${JSON.stringify(check, null, 2)}\n`, "utf8"), writeFile(markdownPath, `# 需求价值链校验\n\n- 结论：${check.valid ? "PASS" : "FAIL"}\n- 已失效：${stale ? "是" : "否"}\n\n${issues.length ? issues.map((item) => `- ${item}`).join("\n") : "- 需求、发现审核和成功指标引用均有效。"}\n`, "utf8")]);
    return { chain, check, jsonPath, markdownPath };
  }
}
