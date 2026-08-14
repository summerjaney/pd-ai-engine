import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { confirmDesignGate, writeRealRequirementLoopReport } from "../src/real-requirement-loop/service.js";

async function fixture(): Promise<string> {
  const directory = await mkdtemp(path.join(os.tmpdir(), "pae-v130-loop-"));
  await mkdir(path.join(directory, "00-platform-analysis"), { recursive: true });
  await mkdir(path.join(directory, "06-prototype"), { recursive: true });
  const analysis = { schemaVersion: "1.2", requirement: { title: "字段联动", fingerprint: "fp-1" }, context: { extensions: [] }, currentState: { affectedModules: [], matchedCapabilities: [], applicableRules: [] }, gap: { summary: "", existingCapabilityCount: 0, unknowns: [] }, boundaryAssessment: { recommendation: "platform-enhancement", confidence: "medium", basis: [], alternatives: [], status: "pending-human-confirmation", requiresHumanConfirmation: true } };
  await writeFile(path.join(directory, "00-platform-analysis", "platform-analysis.json"), JSON.stringify(analysis));
  for (const [file, content] of Object.entries({ "01-requirement-analysis.md": "# 需求分析", "02-product-outline.md": "# 功能方案", "03-product-architecture.md": "# 架构", "04-core-flow.md": "# 流程", "09-prd.md": "# PRD" })) await writeFile(path.join(directory, file), content);
  await writeFile(path.join(directory, "06-prototype", "prototype.json"), "{}");
  await writeFile(path.join(directory, "08-prototype-confirmation.json"), JSON.stringify({ status: "confirmed", confirmedAt: "2026-08-14T00:00:00.000Z" }));
  return directory;
}

test("TC-130-001: 闭环状态按五个人工确认节点汇总", async () => {
  const directory = await fixture();
  const initial = await writeRealRequirementLoopReport(directory);
  assert.equal(initial.report.summary.total, 5);
  assert.equal(initial.report.currentGate, "platform");
  assert.equal(initial.report.gates.find((gate) => gate.id === "prototype")?.status, "CONFIRMED");
  assert.match(await readFile(initial.markdownPath, "utf8"), /真实需求设计闭环状态/);
});

test("TC-130-002: 设计成果物变化会使已有确认失效", async () => {
  const directory = await fixture();
  await confirmDesignGate(directory, "requirement", "需求范围已确认");
  let output = await writeRealRequirementLoopReport(directory);
  assert.equal(output.report.gates.find((gate) => gate.id === "requirement")?.status, "CONFIRMED");
  await writeFile(path.join(directory, "01-requirement-analysis.md"), "# 需求分析\n\n范围已变化");
  output = await writeRealRequirementLoopReport(directory);
  assert.equal(output.report.gates.find((gate) => gate.id === "requirement")?.status, "INVALIDATED");
});
