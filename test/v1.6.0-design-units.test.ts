import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { analyzeCrossModuleImpact } from "../src/cross-module-impact/service.js";
import { designUnitMarker, generateDesignUnitPlan, renderDesignUnitPlan, validateDesignUnitTraceability } from "../src/design-units/service.js";
import { PlatformModuleService } from "../src/platform-modules/service.js";
import { selectSolution, writeSolutionComparison } from "../src/solution-options/service.js";

async function report() {
  const sourcePath = path.resolve("test/fixtures/v1.6.0/cross-module-data-permission.md");
  const content = await readFile(sourcePath, "utf8");
  const catalog = await new PlatformModuleService().load(path.resolve("knowledge/platform/modules"));
  return analyzeCrossModuleImpact({ sourcePath, title: "跨模块数据权限控制", content }, catalog);
}

async function selectedRequirement() {
  const directory = await mkdtemp(path.join(os.tmpdir(), "pae-v160-design-units-"));
  const impact = await report();
  await writeSolutionComparison(directory, impact);
  await selectSolution(directory, "platform-enhancement", "组织、权限、表单、流程和报表");
  return { directory, impact };
}

test("v1.6.0 blocks design-unit generation before a valid solution selection", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "pae-v160-design-units-blocked-"));
  const impact = await report();
  await writeSolutionComparison(directory, impact);
  await assert.rejects(() => generateDesignUnitPlan(directory, impact), /等待产品经理选择/);
});

test("v1.6.0 decomposes a cross-module requirement into stable design units", async () => {
  const { directory, impact } = await selectedRequirement();
  const first = await generateDesignUnitPlan(directory, impact);
  const second = await generateDesignUnitPlan(directory, impact);
  assert.deepEqual(first.plan.units.map((item) => item.id), second.plan.units.map((item) => item.id));
  assert.ok(first.plan.units.some((item) => item.id === "DU-PERMISSION-PERMISSION"));
  assert.ok(first.plan.units.some((item) => item.id === "DU-WORKFLOW-WORKFLOW"));
  assert.ok(first.plan.units.some((item) => item.kind === "data-model"));
});

test("v1.6.0 binds design units to the selected solution and impact report", async () => {
  const { directory, impact } = await selectedRequirement();
  const { plan } = await generateDesignUnitPlan(directory, impact);
  assert.equal(plan.selectedOptionId, "platform-enhancement");
  assert.equal(plan.requirementFingerprint, impact.requirement.fingerprint);
  assert.equal(plan.solutionScope, "组织、权限、表单、流程和报表");
});

test("v1.6.0 rejects a stale selected solution when the impact report changes", async () => {
  const { directory, impact } = await selectedRequirement();
  impact.requirement.fingerprint = "changed";
  await assert.rejects(() => generateDesignUnitPlan(directory, impact), /当前需求或影响报告不一致/);
});

test("v1.6.0 traceability fails when artifacts or design-unit markers are missing", async () => {
  const { directory, impact } = await selectedRequirement();
  const { plan } = await generateDesignUnitPlan(directory, impact);
  await writeFile(path.join(directory, "01-requirement-analysis.md"), "# 需求分析\n", "utf8");
  const trace = await validateDesignUnitTraceability(directory, plan);
  assert.equal(trace.valid, false);
  assert.ok(trace.summary.missingArtifactCount > 0);
  assert.ok(trace.summary.missingReferenceCount > 0);
});

test("v1.6.0 traceability passes when every expected artifact preserves stable markers", async () => {
  const { directory, impact } = await selectedRequirement();
  const { plan } = await generateDesignUnitPlan(directory, impact);
  const artifacts = new Map<string, string[]>();
  for (const unit of plan.units) for (const artifact of unit.expectedArtifacts) {
    const markers = artifacts.get(artifact) ?? [];
    markers.push(designUnitMarker(unit.id));
    artifacts.set(artifact, markers);
  }
  for (const [artifact, markers] of artifacts) {
    const target = path.join(directory, artifact);
    await mkdir(path.dirname(target), { recursive: true });
    const content = artifact.endsWith(".json") ? `${JSON.stringify({ designUnitReferences: markers })}\n` : `# 成果物\n\n${markers.join("\n")}\n`;
    await writeFile(target, content, "utf8");
  }
  const trace = await validateDesignUnitTraceability(directory, plan);
  assert.equal(trace.valid, true);
  assert.equal(trace.summary.coveredReferenceCount, trace.summary.expectedReferenceCount);
});

test("v1.6.0 renders a product-readable design-unit matrix", async () => {
  const { directory, impact } = await selectedRequirement();
  const { plan } = await generateDesignUnitPlan(directory, impact);
  const markdown = renderDesignUnitPlan(plan);
  assert.match(markdown, /稳定标识/);
  assert.match(markdown, /design-unit:DU-PERMISSION-PERMISSION/);
  assert.match(markdown, /应覆盖成果物/);
});
