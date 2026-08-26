import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { AiProductPlanningService } from "../src/ai-product-planning/service.js";
import { AiRequirementDesignService } from "../src/ai-requirement-design/service.js";
import { AiConfigContractService } from "../src/ai-config-contract/service.js";
import { AiPrototypeDesignService } from "../src/ai-prototype-design/service.js";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const input = path.join(repositoryRoot, "examples", "lowcode-ai-v2.1.0", "planning-input.json");
const designInput = path.join(repositoryRoot, "examples", "lowcode-ai-v2.1.0", "ai-app-builder-design.json");
const dslInput = path.join(repositoryRoot, "examples", "lowcode-ai-v2.1.0", "purchase-approval-dsl.json");

async function preparedRequirement(): Promise<string> {
  const project = await mkdtemp(path.join(os.tmpdir(), "pae-ai-contract-"));
  const planning = new AiProductPlanningService();
  await planning.plan(project, input);
  await planning.confirm(project, ["ai-app-builder"], "采购审批应用端到端搭建");
  return (await new AiRequirementDesignService().create(project, designInput, "AI-001", "ai-app-builder")).requirementDirectory;
}

async function preparedValidatedRequirement(): Promise<string> {
  const requirement = await preparedRequirement();
  await new AiConfigContractService().validate(requirement, dslInput);
  return requirement;
}

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

test("v2.1.0 五类低代码 DSL 校验通过后只生成待确认发布与回滚计划", async () => {
  const requirement = await preparedRequirement();
  const result = await new AiConfigContractService().validate(requirement, dslInput);
  assert.equal(result.report.status, "PASS");
  assert.equal(result.report.checks.length, 5);
  assert.equal(result.publishPlan?.status, "WAITING_PUBLISH_CONFIRMATION");
  assert.equal(result.publishPlan?.rollback.snapshotRequired, true);
  assert.match(result.publishPlan?.rollback.strategy ?? "", /失败即停止/);
  assert.equal(result.regenerationPlan, undefined);
});

test("v2.1.0 单独流程错误只重新生成流程并保留其他模块", async () => {
  const requirement = await preparedRequirement();
  const bundle = JSON.parse(await readFile(dslInput, "utf8"));
  bundle.workflows[0].transitions[0].targetId = "NODE-NOT-FOUND";
  const broken = path.join(path.dirname(requirement), "broken-workflow.json"); await writeFile(broken, JSON.stringify(bundle));
  const result = await new AiConfigContractService().validate(requirement, broken);
  assert.equal(result.report.status, "FAIL");
  assert.deepEqual(result.regenerationPlan?.regenerateModules, ["workflow"]);
  assert.deepEqual(result.regenerationPlan?.preservedModules, ["application", "entity", "form", "permission"]);
  assert.equal(result.publishPlan, undefined);
});

test("v2.1.0 实体错误按依赖扩散但不误伤应用模块", async () => {
  const requirement = await preparedRequirement();
  const bundle = JSON.parse(await readFile(dslInput, "utf8"));
  bundle.entities[0].fields[0].type = "unsupported";
  const broken = path.join(path.dirname(requirement), "broken-entity.json"); await writeFile(broken, JSON.stringify(bundle));
  const result = await new AiConfigContractService().validate(requirement, broken);
  assert.deepEqual(result.regenerationPlan?.regenerateModules, ["entity", "form", "workflow", "permission"]);
  assert.deepEqual(result.regenerationPlan?.preservedModules, ["application"]);
});

test("v2.1.0 DSL 未通过契约校验时禁止生成正式产品原型", async () => {
  const requirement = await preparedRequirement();
  await assert.rejects(() => new AiPrototypeDesignService().generate(requirement), /缺少低代码 DSL 契约/);
});

test("v2.1.0 生成十四页 AI 应用搭建助手原型并通过三类一致性检查", async () => {
  const requirement = await preparedValidatedRequirement();
  const result = await new AiPrototypeDesignService().generate(requirement);
  assert.equal(result.status, "PASS");
  assert.equal(result.pageCount, 14);
  assert.equal(result.prototype.pages[0]?.id, "task-list");
  assert.ok(result.prototype.pages.some((item) => item.id === "publish-confirm" && item.actions.some((action) => action.confirmation)));
  const pageDirectory = path.join(requirement, "04-page-structure");
  for (const file of ["page-plan-validation.json", "design-consistency.json", "interaction-consistency.json"]) {
    assert.equal(JSON.parse(await readFile(path.join(pageDirectory, file), "utf8")).valid, true);
  }
  const masterGo = JSON.parse(await readFile(path.join(result.prototypeDirectory, "mastergo-data.json"), "utf8"));
  assert.equal(masterGo.screens.length, 14);
  assert.match(await readFile(path.join(result.prototypeDirectory, "prototype.html"), "utf8"), /AI 应用搭建助手/);
});
