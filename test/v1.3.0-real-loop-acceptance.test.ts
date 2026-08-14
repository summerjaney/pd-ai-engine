import assert from "node:assert/strict";
import { cp, mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { runDesignReview } from "../src/design-review/service.js";
import { MockStageExecutor } from "../src/execution/mock-executor.js";
import { loadExtensionWorkspace } from "../src/extensions/workspace.js";
import { prepareRequirementOutput } from "../src/output/requirement-output.js";
import { confirmPlatformDecision } from "../src/platform-analysis/confirmation.js";
import { buildRealRequirementLoopReport, confirmDesignGate } from "../src/real-requirement-loop/service.js";
import { addRequirementSource, readRequirementSourceIndex } from "../src/requirement-sources/service.js";
import { ProductDesignWorkflow } from "../src/workflow/workflow.js";

const repositoryRoot = path.resolve(import.meta.dirname, "..");

test("TC-130-008: 脱敏真实低代码需求完成五节点设计闭环并进入开发评审", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "pae-v130-real-loop-"));
  const workspaceDirectory = path.join(root, "workspace");
  await cp(path.join(repositoryRoot, "examples", "base-platform-workspace"), workspaceDirectory, { recursive: true });
  const workspacePath = path.join(workspaceDirectory, "pae.workspace.json");
  const workspaceJson = JSON.parse(await readFile(workspacePath, "utf8")) as { extensionDirectories: string[] };
  workspaceJson.extensionDirectories[0] = path.join(repositoryRoot, "domains", "lowcode-platform");
  const { writeFile } = await import("node:fs/promises");
  await writeFile(workspacePath, `${JSON.stringify(workspaceJson, null, 2)}\n`);

  const requirementPath = path.join(repositoryRoot, "examples", "v1.3-form-publish-validation.md");
  const content = await readFile(requirementPath, "utf8");
  const prepared = await prepareRequirementOutput({
    outputRoot: path.join(root, "output"), projectId: "base-platform-demo", projectName: "基础平台示例",
    productVersion: "3.3.0", requirementId: "REQ-301", requirementName: "form-publish-validation",
  }, { sourcePath: requirementPath, title: "表单发布前校验规则", content });
  await addRequirementSource(prepared.requirementDirectory, path.join(repositoryRoot, "examples", "v1.3-form-publish-validation-meeting-note.md"), {
    label: "需求沟通记录", type: "meeting-note", sensitivity: "internal",
  });
  assert.equal((await readRequirementSourceIndex(prepared.requirementDirectory)).sources.length, 2);

  const workspace = await loadExtensionWorkspace(workspacePath);
  const workflow = new ProductDesignWorkflow(new MockStageExecutor());
  const input = { sourcePath: "v1.3-form-publish-validation.md", title: "表单发布前校验规则", content };
  await assert.rejects(() => workflow.run(input, prepared.requirementDirectory, prepared.context, { extensionContext: workspace.context, requirePlatformConfirmation: true }), /WAITING_PLATFORM_CONFIRMATION/);
  await confirmPlatformDecision(prepared.requirementDirectory, { path: "platform-enhancement", scope: "表单设计器发布前配置校验", note: "不调整底层数据模型；兼容存量表单" });
  const completed = await workflow.run(input, prepared.requirementDirectory, prepared.context, { extensionContext: workspace.context, requirePlatformConfirmation: true, resume: true });
  assert.equal(completed.platformDecision?.decision.path, "platform-enhancement");

  await confirmDesignGate(prepared.requirementDirectory, "requirement", "需求范围和待确认项已核对");
  await confirmDesignGate(prepared.requirementDirectory, "solution", "功能方案、架构和流程已核对");
  await confirmDesignGate(prepared.requirementDirectory, "prd", "PRD 可进入开发评审");
  const loop = await buildRealRequirementLoopReport(prepared.requirementDirectory);
  assert.equal(loop.status, "READY_FOR_DEVELOPMENT_REVIEW");
  assert.equal(loop.summary.confirmed, 5);

  const review = await runDesignReview(prepared.requirementDirectory);
  assert.equal(review.report.summary.BLOCKER, 0);
  assert.equal(review.report.summary.IMPORTANT, 0);
  assert.equal(review.report.status, "PASS");
});
