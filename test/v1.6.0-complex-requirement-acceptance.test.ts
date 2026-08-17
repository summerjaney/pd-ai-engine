import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { finalizeComplexRequirement, prepareComplexRequirement, renderComplexRequirementAcceptance } from "../src/complex-requirement/service.js";
import { MockStageExecutor } from "../src/execution/mock-executor.js";
import { selectSolution } from "../src/solution-options/service.js";
import { ProductDesignWorkflow } from "../src/workflow/workflow.js";

async function input() {
  const sourcePath = path.resolve("test/fixtures/v1.6.0/cross-module-data-permission.md");
  const content = await readFile(sourcePath, "utf8");
  return { sourcePath, title: "跨模块数据权限控制", content };
}

test("v1.6.0 complex workflow stops at solution selection before formal design", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "pae-v160-complex-waiting-"));
  const requirementInput = await input();
  const prepared = await prepareComplexRequirement(directory, requirementInput);
  assert.equal(prepared.status, "WAITING_SOLUTION_SELECTION");
  await assert.rejects(() => finalizeComplexRequirement(directory, requirementInput), /产品经理选择/);
});

test("v1.6.0 complex preparation preserves a still-valid product-manager decision", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "pae-v160-complex-preserve-"));
  await prepareComplexRequirement(directory, await input());
  await selectSolution(directory, "platform-enhancement", "组织、权限、表单、流程和报表");
  const preparedAgain = await prepareComplexRequirement(directory, await input());
  assert.equal(preparedAgain.status, "SOLUTION_SELECTED");
});

test("v1.6.0 completes the desensitized cross-module business acceptance loop", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "pae-v160-complex-pass-"));
  const requirementInput = await input();
  const prepared = await prepareComplexRequirement(directory, requirementInput);
  assert.equal(prepared.impact.summary.direct, 5);
  await selectSolution(directory, "platform-enhancement", "组织、权限、表单、流程和报表", "移动端和开放接口保留扩展点");
  const context = await new ProductDesignWorkflow(new MockStageExecutor()).run(requirementInput, directory, {
    projectId: "base-platform", projectName: "基础平台", productVersion: "3.1.0", requirementId: "REQ-160", requirementName: "cross-module-data-permission", revision: 1,
  });
  assert.equal(context.stageResults?.filter((item) => item.status === "completed").length, 10);
  const finalized = await finalizeComplexRequirement(directory, requirementInput);
  assert.equal(finalized.report.status, "PASS");
  assert.equal(finalized.report.solution.selectedOptionId, "platform-enhancement");
  assert.equal(finalized.report.designUnits.count, 14);
  assert.equal(finalized.report.designUnits.traceability, "PASS");
  assert.equal(finalized.report.snapshotSequence, 1);
  assert.ok(finalized.report.designUnits.referenceCount > finalized.report.designUnits.count);
});

test("v1.6.0 injects stable design-unit references into all required formal artifacts", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "pae-v160-complex-trace-"));
  const requirementInput = await input();
  await prepareComplexRequirement(directory, requirementInput);
  await selectSolution(directory, "platform-enhancement", "完整跨模块范围");
  await new ProductDesignWorkflow(new MockStageExecutor()).run(requirementInput, directory);
  await finalizeComplexRequirement(directory, requirementInput);
  for (const artifact of ["01-requirement-analysis.md", "02-product-outline.md", "03-product-architecture.md", "04-core-flow.md", "05-page-structure.md", "09-prd.md", "10-review.md"]) {
    assert.match(await readFile(path.join(directory, artifact), "utf8"), /\[design-unit:DU-/u, artifact);
  }
  const prototype = JSON.parse(await readFile(path.join(directory, "06-prototype", "prototype.json"), "utf8"));
  assert.ok(Array.isArray(prototype.designUnitReferences));
  assert.ok(prototype.designUnitReferences.every((item: string) => item.startsWith("[design-unit:DU-")));
});

test("v1.6.0 acceptance remains explicit about reserved real-world validation", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "pae-v160-complex-reserved-"));
  const requirementInput = await input();
  await prepareComplexRequirement(directory, requirementInput);
  await selectSolution(directory, "platform-enhancement", "完整跨模块范围");
  await new ProductDesignWorkflow(new MockStageExecutor()).run(requirementInput, directory);
  const finalized = await finalizeComplexRequirement(directory, requirementInput);
  assert.deepEqual(finalized.report.reservedManualValidation, ["真实OpenAI-compatible Provider生成质量", "MasterGo真实多页面画布", "私有公司资料下的产品专业性评审"]);
  assert.match(renderComplexRequirementAcceptance(finalized.report), /保留人工验收/);
});
