import assert from "node:assert/strict";
import { cp, mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { MockStageExecutor } from "../src/execution/mock-executor.js";
import { loadExtensionWorkspace } from "../src/extensions/workspace.js";
import { acceptKnowledgeFeedback } from "../src/knowledge-feedback/service.js";
import { confirmPlatformDecision } from "../src/platform-analysis/confirmation.js";
import { ProductDesignWorkflow } from "../src/workflow/workflow.js";

const repositoryRoot = path.resolve(import.meta.dirname, "..");

async function privateWorkspace(root: string): Promise<string> {
  const target = path.join(root, "base-platform-workspace");
  await cp(path.join(repositoryRoot, "examples", "base-platform-workspace"), target, { recursive: true });
  const workspacePath = path.join(target, "pae.workspace.json");
  const workspace = JSON.parse(await readFile(workspacePath, "utf8")) as { extensionDirectories: string[] };
  workspace.extensionDirectories[0] = path.join(repositoryRoot, "domains", "lowcode-platform");
  await writeFile(workspacePath, `${JSON.stringify(workspace, null, 2)}\n`, "utf8");
  return workspacePath;
}

async function requirementInput(file: string) {
  const content = await readFile(path.join(repositoryRoot, "examples", file), "utf8");
  return { sourcePath: file, title: content.match(/^#\s+(.+)$/m)?.[1] ?? file, content };
}

test("TC-120-021: 两项低代码真实需求完成判断、设计、回流和复用闭环", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "pae-v120-real-business-"));
  const workspacePath = await privateWorkspace(root);
  const firstDirectory = path.join(root, "output", "base-platform", "requirements", "REQ-201-form-field-linkage");
  const firstRequirement = { projectId: "base-platform", projectName: "基础平台", productVersion: "3.1.0", requirementId: "REQ-201", requirementName: "form-field-linkage", revision: 1 };
  const firstInput = await requirementInput("lowcode-form-field-linkage.md");
  await mkdir(firstDirectory, { recursive: true });
  await writeFile(path.join(firstDirectory, "requirement.json"), `${JSON.stringify(firstRequirement, null, 2)}\n`, "utf8");

  let workspace = await loadExtensionWorkspace(workspacePath);
  const workflow = new ProductDesignWorkflow(new MockStageExecutor());
  await assert.rejects(() => workflow.run(firstInput, firstDirectory, firstRequirement, { extensionContext: workspace.context, requirePlatformConfirmation: true }), /WAITING_PLATFORM_CONFIRMATION/);
  await confirmPlatformDecision(firstDirectory, { path: "platform-enhancement", scope: "表单字段联动能力", note: "增强设计器，不调整底层字段模型" });
  const first = await workflow.run(firstInput, firstDirectory, firstRequirement, { extensionContext: workspace.context, requirePlatformConfirmation: true, resume: true });
  assert.equal(first.platformDecision?.decision.path, "platform-enhancement");
  assert.ok(first.knowledgeFeedback?.candidates.some((item) => item.type === "capability" && item.name === "表单字段联动能力"));
  await Promise.all(["01-requirement-analysis.md", "06-prototype/prototype.json", "09-prd.md", "10-review.md", "13-knowledge-feedback/knowledge-feedback-candidates.json"].map(async (file) => assert.ok((await readFile(path.join(firstDirectory, file))).length > 0)));

  const accepted = await acceptKnowledgeFeedback(firstDirectory, workspacePath, first.knowledgeFeedback!.candidates.filter((item) => ["capability", "decision"].includes(item.type)).map((item) => item.id));
  assert.equal(accepted.accepted.length, 2);
  assert.equal(accepted.sequence, 1);

  workspace = await loadExtensionWorkspace(workspacePath);
  assert.equal(workspace.context.extensions.at(-1)?.id, "base-platform-demo.accepted");
  const secondDirectory = path.join(root, "output", "base-platform", "requirements", "REQ-202-form-linkage-copy");
  const secondRequirement = { ...firstRequirement, requirementId: "REQ-202", requirementName: "form-linkage-copy", productVersion: "3.2.0" };
  const secondInput = await requirementInput("lowcode-form-linkage-copy.md");
  await mkdir(secondDirectory, { recursive: true });
  await writeFile(path.join(secondDirectory, "requirement.json"), `${JSON.stringify(secondRequirement, null, 2)}\n`, "utf8");
  await assert.rejects(() => workflow.run(secondInput, secondDirectory, secondRequirement, { extensionContext: workspace.context, requirePlatformConfirmation: true }), /WAITING_PLATFORM_CONFIRMATION/);
  const secondAnalysis = JSON.parse(await readFile(path.join(secondDirectory, "00-platform-analysis", "platform-analysis.json"), "utf8")) as { currentState: { matchedCapabilities: Array<{ name: string; source: { extensionId: string } }> }; boundaryAssessment: { recommendation: string } };
  assert.ok(secondAnalysis.currentState.matchedCapabilities.some((item) => item.name === "表单字段联动能力" && item.source.extensionId === "base-platform-demo.accepted"));
  assert.equal(secondAnalysis.boundaryAssessment.recommendation, "platform-enhancement");
  await confirmPlatformDecision(secondDirectory, { path: "platform-enhancement", scope: "字段联动规则复制", note: "复用已接受的字段联动能力" });
  const second = await workflow.run(secondInput, secondDirectory, secondRequirement, { extensionContext: workspace.context, requirePlatformConfirmation: true, resume: true });
  assert.equal(second.platformDecision?.decision.scope, "字段联动规则复制");
  const manifest = JSON.parse(await readFile(path.join(secondDirectory, "manifest.json"), "utf8")) as { extensionContext: { extensions: Array<{ id: string }> }; platformAnalysis: { currentState: { matchedCapabilities: Array<{ name: string }> } } };
  assert.ok(manifest.extensionContext.extensions.some((item) => item.id === "base-platform-demo.accepted"));
  assert.ok(manifest.platformAnalysis.currentState.matchedCapabilities.some((item) => item.name === "表单字段联动能力"));
});
