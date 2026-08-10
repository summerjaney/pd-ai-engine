import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { RequirementDesignContext, RequirementInteractionMap, RequirementPagePlan } from "../src/domain/types.js";
import { MockStageExecutor } from "../src/execution/mock-executor.js";
import { ProductDesignWorkflow } from "../src/workflow/workflow.js";

const test = (globalThis as any).test ?? (await import("node:test")).default;
const readJson = async <T>(file: string): Promise<T> => JSON.parse(await readFile(file, "utf8")) as T;

test("TC-070-001: 工作流输出需求级页面规划、设计上下文和交互图", async () => {
  const output = await mkdtemp(path.join(os.tmpdir(), "pae-v070-"));
  const workflow = new ProductDesignWorkflow(new MockStageExecutor());
  await workflow.run({
    sourcePath: "user-management.md",
    title: "用户管理",
    content: "# 用户管理\n\n管理员维护用户并配置权限。",
  }, output, {
    projectId: "base-platform",
    projectName: "基础平台",
    productVersion: "1.0.0",
    requirementId: "REQ-070",
    requirementName: "user-management",
    revision: 1,
  });

  const directory = path.join(output, "05-page-plan");
  const pagePlan = await readJson<RequirementPagePlan>(path.join(directory, "page-plan.json"));
  const designContext = await readJson<RequirementDesignContext>(path.join(directory, "design-context.json"));
  const interactionMap = await readJson<RequirementInteractionMap>(path.join(directory, "interaction-map.json"));

  assert.equal(pagePlan.schemaVersion, "0.7");
  assert.equal(pagePlan.requirementId, "REQ-070");
  assert.ok(pagePlan.pages.length > 0);
  assert.ok(pagePlan.pages.every((page) => page.status === "GENERATED"));
  assert.ok(pagePlan.pages.every((page) => page.id && page.name && page.route));
  assert.equal(designContext.frame.width, 1440);
  assert.deepEqual(designContext.tokens, (await readJson<any>(path.join(output, "06-prototype", "prototype.json"))).designTokens);
  assert.ok(interactionMap.interactions.length > 0);
  const pageIds = new Set(pagePlan.pages.map((page) => page.id));
  assert.ok(interactionMap.interactions.every((item) => item.sourcePageId === "global-navigation" || pageIds.has(item.sourcePageId)));
  assert.ok(interactionMap.interactions.every((item) => pageIds.has(item.targetPageId)));
});

test("TC-070-002: 页面规划输出具有确定性且不存在重复页面", async () => {
  const input = { sourcePath: "requirement.md", title: "测试", content: "# 测试\n\n创建并审批申请。" };
  const first = await mkdtemp(path.join(os.tmpdir(), "pae-v070-a-"));
  const second = await mkdtemp(path.join(os.tmpdir(), "pae-v070-b-"));
  await new ProductDesignWorkflow(new MockStageExecutor()).run(input, first);
  await new ProductDesignWorkflow(new MockStageExecutor()).run(input, second);
  const a = await readJson<RequirementPagePlan>(path.join(first, "05-page-plan", "page-plan.json"));
  const b = await readJson<RequirementPagePlan>(path.join(second, "05-page-plan", "page-plan.json"));
  assert.deepEqual(a, b);
  assert.equal(new Set(a.pages.map((page) => page.id)).size, a.pages.length);
});
