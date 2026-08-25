import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { AiProductPlanningService } from "../src/ai-product-planning/service.js";
import { AiRequirementDesignService } from "../src/ai-requirement-design/service.js";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const input = path.join(repositoryRoot, "examples", "lowcode-ai-v2.1.0", "planning-input.json");
const designInput = path.join(repositoryRoot, "examples", "lowcode-ai-v2.1.0", "ai-app-builder-design.json");

test("v2.1.0 生成低代码 AI 产品规划五类成果并停在人工门禁", async () => {
  const project = await mkdtemp(path.join(os.tmpdir(), "pae-ai-planning-"));
  const result = await new AiProductPlanningService().plan(project, input);
  assert.equal(result.gate.status, "WAITING_PM_CONFIRMATION");
  assert.deepEqual(result.gate.recommendedScenarioIds, ["ai-app-builder", "ai-configuration-assistant"]);
  assert.equal(result.files.length, 10);
  const priority = JSON.parse(await readFile(path.join(result.directory, "scenario-priority.json"), "utf8"));
  assert.equal(priority.scenarios[0].id, "ai-app-builder");
  const scope = JSON.parse(await readFile(path.join(result.directory, "mvp-scope-draft.json"), "utf8"));
  assert.match(scope.guardrails.join("\n"), /不允许无确认直接发布/);
});

test("v2.1.0 只有产品经理显式选择有效场景后才开放详细设计", async () => {
  const project = await mkdtemp(path.join(os.tmpdir(), "pae-ai-confirm-"));
  const service = new AiProductPlanningService();
  await service.plan(project, input);
  await assert.rejects(() => service.confirm(project, ["unknown"], "首期"), /不存在/);
  const result = await service.confirm(project, ["ai-app-builder"], "采购审批应用端到端搭建", "先验证应用、表单、流程和权限草案");
  assert.equal(result.decision.status, "CONFIRMED");
  const gate = JSON.parse(await readFile(path.join(project, "product", "ai-planning", "planning-gate.json"), "utf8"));
  assert.equal(gate.status, "CONFIRMED");
  assert.deepEqual(gate.blockers, []);
});

test("v2.1.0 未确认 MVP 时禁止生成 AI 标准需求设计包", async () => {
  const project = await mkdtemp(path.join(os.tmpdir(), "pae-ai-design-blocked-"));
  await new AiProductPlanningService().plan(project, input);
  await assert.rejects(
    () => new AiRequirementDesignService().create(project, designInput, "AI-001", "ai-app-builder"),
    /尚未确认/,
  );
});

test("v2.1.0 为 AI 应用搭建助手生成可追踪业务对象、流程、状态和异常", async () => {
  const project = await mkdtemp(path.join(os.tmpdir(), "pae-ai-design-"));
  const planning = new AiProductPlanningService();
  await planning.plan(project, input);
  await planning.confirm(project, ["ai-app-builder"], "采购审批应用端到端搭建");
  const result = await new AiRequirementDesignService().create(project, designInput, "AI-001", "ai-app-builder");
  assert.equal(result.manifest.status, "READY_FOR_DETAILED_DESIGN");
  assert.equal(result.manifest.artifacts.length, 6);
  const requirement = await readFile(path.join(result.requirementDirectory, "00-requirement-input.md"), "utf8");
  assert.match(requirement, /AI 搭建任务/);
  assert.match(requirement, /金额超过5万元/);
  assert.match(requirement, /EX-PUBLISH-FAILED/);
  const traceability = JSON.parse(await readFile(path.join(result.requirementDirectory, "00-ai-design-brief", "traceability.json"), "utf8"));
  assert.equal(traceability.objectIds.length, 6);
  assert.equal(traceability.flowIds.length, 7);
  assert.equal(traceability.stateIds.length, 10);
  assert.equal(traceability.exceptionIds.length, 6);
  assert.equal(traceability.acceptanceCriteriaIds.length, 8);
});
