import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { AiCapabilityBlueprintItem, AiMvpDecision, AiPlanningGate, AiPlanningScenario, AiProductPlanningInput, PrioritizedAiScenario } from "./types.js";

const text = (value: unknown): value is string => typeof value === "string" && Boolean(value.trim());
const unique = <T>(values: T[]): T[] => [...new Set(values)];
const targetDirectory = (projectDirectory: string): string => path.join(projectDirectory, "product", "ai-planning");

function assertScore(value: unknown, field: string): asserts value is number {
  if (!Number.isInteger(value) || Number(value) < 1 || Number(value) > 5) throw new Error(`${field} 必须是 1—5 的整数。`);
}

function assertInput(value: unknown): asserts value is AiProductPlanningInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("AI 产品规划输入必须是 JSON 对象。");
  const input = value as Partial<AiProductPlanningInput>;
  if (!input.project || !text(input.project.id) || !text(input.project.name) || !text(input.project.objective)) throw new Error("项目必须提供 id、name 和 objective。");
  if (!Array.isArray(input.project.productSystem) || !input.project.productSystem.length || input.project.productSystem.some((item) => !text(item))) throw new Error("项目必须提供非空 productSystem。");
  if (!Array.isArray(input.targetUsers) || !input.targetUsers.length) throw new Error("必须至少提供一类目标用户。");
  if (!Array.isArray(input.modules) || !input.modules.length) throw new Error("必须至少提供一个平台模块。");
  if (!Array.isArray(input.scenarios) || !input.scenarios.length) throw new Error("必须至少提供一个 AI 场景。");
  if (!input.constraints || !Array.isArray(input.constraints.security) || !Array.isArray(input.constraints.delivery)) throw new Error("必须提供 security 和 delivery 约束。");

  const userIds = new Set(input.targetUsers.map((item) => item.id));
  const moduleIds = new Set(input.modules.map((item) => item.id));
  if (userIds.size !== input.targetUsers.length || moduleIds.size !== input.modules.length) throw new Error("目标用户或平台模块 ID 重复。");
  const scenarioIds = new Set<string>();
  for (const scenario of input.scenarios) {
    if (!text(scenario.id) || !text(scenario.name) || !text(scenario.description)) throw new Error("AI 场景必须提供 id、name 和 description。");
    if (scenarioIds.has(scenario.id)) throw new Error(`AI 场景 ID 重复：${scenario.id}`);
    scenarioIds.add(scenario.id);
    for (const field of ["value", "frequency", "strategicFit", "complexity", "risk"] as const) assertScore(scenario[field], `${scenario.id}.${field}`);
    if (!scenario.targetUserIds.length || scenario.targetUserIds.some((id) => !userIds.has(id))) throw new Error(`${scenario.id} 引用了不存在的目标用户。`);
    if (!scenario.moduleIds.length || scenario.moduleIds.some((id) => !moduleIds.has(id))) throw new Error(`${scenario.id} 引用了不存在的平台模块。`);
    if (!scenario.capabilities.length || scenario.capabilities.some((item) => !text(item))) throw new Error(`${scenario.id} 必须提供非空 capabilities。`);
  }
}

function prioritize(scenario: AiPlanningScenario): PrioritizedAiScenario {
  const score = Number((scenario.value * 0.35 + scenario.frequency * 0.2 + scenario.strategicFit * 0.25 - scenario.complexity * 0.1 - scenario.risk * 0.1).toFixed(2));
  const priority = score >= 2.8 ? "P0" : score >= 2 ? "P1" : "P2";
  const recommendation = priority === "P0" && scenario.risk <= 4 ? "MVP_CANDIDATE" : priority === "P2" || scenario.risk === 5 ? "RESEARCH" : "ROADMAP";
  return { ...scenario, score, priority, recommendation };
}

function blueprint(input: AiProductPlanningInput): AiCapabilityBlueprintItem[] {
  const map = new Map<string, AiCapabilityBlueprintItem>();
  for (const scenario of input.scenarios) for (const capability of scenario.capabilities) {
    const id = `ai.${capability.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5]+/g, "-").replace(/^-|-$/g, "")}`;
    const current = map.get(id) ?? { id, name: capability, scenarioIds: [], moduleIds: [] };
    current.scenarioIds = unique([...current.scenarioIds, scenario.id]);
    current.moduleIds = unique([...current.moduleIds, ...scenario.moduleIds]);
    map.set(id, current);
  }
  return [...map.values()].sort((left, right) => left.id.localeCompare(right.id));
}

const writeJson = async (file: string, value: unknown): Promise<void> => writeFile(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");

export class AiProductPlanningService {
  async plan(projectDirectory: string, inputPath: string): Promise<{ directory: string; gate: AiPlanningGate; files: string[] }> {
    const input = JSON.parse(await readFile(inputPath, "utf8")) as unknown;
    assertInput(input);
    const directory = targetDirectory(projectDirectory);
    await mkdir(directory, { recursive: true });
    const prioritized = input.scenarios.map(prioritize).sort((left, right) => right.score - left.score || left.id.localeCompare(right.id));
    const capabilities = blueprint(input);
    const recommendedScenarioIds = prioritized.filter((item) => item.recommendation === "MVP_CANDIDATE").slice(0, 3).map((item) => item.id);
    const fingerprint = createHash("sha256").update(JSON.stringify(input)).digest("hex");
    const baseline = { schemaVersion: "2.1", inputFingerprint: fingerprint, project: input.project, targetUsers: input.targetUsers, modules: input.modules, constraints: input.constraints };
    const mvp = { schemaVersion: "2.1", status: "DRAFT", objective: input.project.objective, recommendedScenarioIds, exclusions: prioritized.filter((item) => item.recommendation !== "MVP_CANDIDATE").map((item) => item.id), guardrails: unique(["AI 只生成可审查方案，不绕过平台规则直接发布。", "所有高风险操作必须经过人工确认。", ...input.constraints.security, ...input.constraints.delivery]) };
    const gate: AiPlanningGate = { schemaVersion: "2.1", status: "WAITING_PM_CONFIRMATION", recommendedScenarioIds, blockers: ["首期场景和产品范围尚未由产品经理确认。"], nextCommand: `pae ai confirm ${projectDirectory} --scenarios ${recommendedScenarioIds.join(",")} --scope <首期范围>` };

    const files = ["product-baseline", "ai-capability-blueprint", "scenario-priority", "mvp-scope-draft", "planning-gate"];
    await Promise.all([
      writeJson(path.join(directory, `${files[0]}.json`), baseline),
      writeFile(path.join(directory, `${files[0]}.md`), `# ${input.project.name} AI 产品规划基线\n\n- 产品体系：${input.project.productSystem.join("、")}\n- 规划目标：${input.project.objective}\n- 目标用户：${input.targetUsers.map((item) => `${item.name}（${item.share}%）`).join("、")}\n- 平台模块：${input.modules.map((item) => item.name).join("、")}\n\n## 安全约束\n\n${input.constraints.security.map((item) => `- ${item}`).join("\n")}\n\n## 交付约束\n\n${input.constraints.delivery.map((item) => `- ${item}`).join("\n")}\n`, "utf8"),
      writeJson(path.join(directory, `${files[1]}.json`), { schemaVersion: "2.1", capabilities }),
      writeFile(path.join(directory, `${files[1]}.md`), `# AI 能力蓝图\n\n| 能力 | 支撑场景 | 影响模块 |\n|---|---|---|\n${capabilities.map((item) => `| ${item.name} | ${item.scenarioIds.join("、")} | ${item.moduleIds.join("、")} |`).join("\n")}\n`, "utf8"),
      writeJson(path.join(directory, `${files[2]}.json`), { schemaVersion: "2.1", scoring: "价值35% + 频率20% + 战略匹配25% - 复杂度10% - 风险10%", scenarios: prioritized }),
      writeFile(path.join(directory, `${files[2]}.md`), `# AI 场景优先级\n\n> 本结果是确定性推荐，不能替代产品经理的范围决策。\n\n| 场景 | 得分 | 优先级 | 建议 |\n|---|---:|---|---|\n${prioritized.map((item) => `| ${item.name} | ${item.score} | ${item.priority} | ${item.recommendation} |`).join("\n")}\n`, "utf8"),
      writeJson(path.join(directory, `${files[3]}.json`), mvp),
      writeFile(path.join(directory, `${files[3]}.md`), `# MVP 范围草案\n\n- 状态：等待产品经理确认\n- 推荐场景：${recommendedScenarioIds.join("、") || "无，需继续研究"}\n\n## 产品护栏\n\n${mvp.guardrails.map((item) => `- ${item}`).join("\n")}\n\n## 暂不纳入\n\n${mvp.exclusions.map((item) => `- ${item}`).join("\n") || "- 无"}\n`, "utf8"),
      writeJson(path.join(directory, `${files[4]}.json`), gate),
      writeFile(path.join(directory, `${files[4]}.md`), `# AI 产品规划门禁\n\n- 状态：${gate.status}\n- 阻断：${gate.blockers.join("；")}\n- 下一步：\`${gate.nextCommand}\`\n`, "utf8"),
    ]);
    return { directory, gate, files: files.flatMap((name) => [path.join(directory, `${name}.json`), path.join(directory, `${name}.md`)]) };
  }

  async confirm(projectDirectory: string, scenarioIds: string[], scope: string, note?: string): Promise<{ decision: AiMvpDecision; path: string }> {
    const directory = targetDirectory(projectDirectory);
    const priority = JSON.parse(await readFile(path.join(directory, "scenario-priority.json"), "utf8")) as { scenarios?: PrioritizedAiScenario[] };
    const validIds = new Set((priority.scenarios ?? []).map((item) => item.id));
    const selected = unique(scenarioIds.map((item) => item.trim()).filter(Boolean));
    if (!selected.length || selected.some((id) => !validIds.has(id))) throw new Error("确认范围包含不存在的 AI 场景。");
    if (!text(scope)) throw new Error("确认 MVP 必须提供非空范围说明。");
    const decision: AiMvpDecision = { schemaVersion: "2.1", status: "CONFIRMED", scenarioIds: selected, scope: scope.trim(), note: note?.trim() || undefined, confirmedBy: "product-manager", confirmedAt: new Date().toISOString() };
    const decisionPath = path.join(directory, "mvp-scope-decision.json");
    const gate: AiPlanningGate = { schemaVersion: "2.1", status: "CONFIRMED", recommendedScenarioIds: selected, blockers: [], nextCommand: `pae requirement create <需求文件> --project <项目标识> --id <需求编号> --name <需求标识>` };
    await Promise.all([
      writeJson(decisionPath, decision),
      writeFile(path.join(directory, "mvp-scope-decision.md"), `# MVP 范围决策\n\n- 状态：已确认\n- 场景：${selected.join("、")}\n- 范围：${decision.scope}\n- 说明：${decision.note ?? "无"}\n`, "utf8"),
      writeJson(path.join(directory, "planning-gate.json"), gate),
      writeFile(path.join(directory, "planning-gate.md"), `# AI 产品规划门禁\n\n- 状态：${gate.status}\n- 下一步：进入首期需求详细设计。\n`, "utf8"),
    ]);
    return { decision, path: decisionPath };
  }
}
