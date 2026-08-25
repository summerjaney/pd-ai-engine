import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { AiProductPlanningService } from "../src/ai-product-planning/service.js";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const input = path.join(repositoryRoot, "examples", "lowcode-ai-v2.1.0", "planning-input.json");

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
