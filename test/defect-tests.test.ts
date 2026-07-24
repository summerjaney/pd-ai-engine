import assert from "node:assert/strict";
import { access, mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { MockStageExecutor } from "../src/execution/mock-executor.js";
import { ProductDesignWorkflow } from "../src/workflow/workflow.js";

const test = (globalThis as any).test ?? (await import("node:test")).default;

async function readJson<T>(filePath: string): Promise<T> {
  const fs = await import("node:fs/promises");
  return JSON.parse(await fs.readFile(filePath, "utf8")) as T;
}

test("空文件输入应被拒绝", async () => {
  const output = await mkdtemp(path.join(os.tmpdir(), "pae-empty-"));
  const workflow = new ProductDesignWorkflow(new MockStageExecutor());
  
  let errorOccurred = false;
  try {
    await workflow.run({
      sourcePath: "empty.md",
      title: "",
      content: "",
    }, output);
  } catch {
    errorOccurred = true;
  }
  
  assert.ok(errorOccurred, "空文件应触发错误");
  
  const fs = await import("node:fs/promises");
  const files = await fs.readdir(output);
  assert.equal(files.length, 0, "不应生成任何文件");
});

test("仅空白字符输入应被拒绝", async () => {
  const output = await mkdtemp(path.join(os.tmpdir(), "pae-blank-"));
  const workflow = new ProductDesignWorkflow(new MockStageExecutor());
  
  let errorOccurred = false;
  try {
    await workflow.run({
      sourcePath: "blank.md",
      title: "",
      content: "   \n\t\n  ",
    }, output);
  } catch {
    errorOccurred = true;
  }
  
  assert.ok(errorOccurred, "仅空白字符应触发错误");
  
  const fs = await import("node:fs/promises");
  const files = await fs.readdir(output);
  assert.equal(files.length, 0, "不应生成任何文件");
});

test("只有 # 标题输入应被拒绝", async () => {
  const output = await mkdtemp(path.join(os.tmpdir(), "pae-only-hash-"));
  const workflow = new ProductDesignWorkflow(new MockStageExecutor());
  
  let errorOccurred = false;
  try {
    await workflow.run({
      sourcePath: "only-hash.md",
      title: "",
      content: "#",
    }, output);
  } catch {
    errorOccurred = true;
  }
  
  assert.ok(errorOccurred, "只有 # 应触发错误");
  
  const fs = await import("node:fs/promises");
  const files = await fs.readdir(output);
  assert.equal(files.length, 0, "不应生成任何文件");
});

test("有一级标题但没有正文应被拒绝", async () => {
  const output = await mkdtemp(path.join(os.tmpdir(), "pae-no-body-"));
  const workflow = new ProductDesignWorkflow(new MockStageExecutor());
  
  let errorOccurred = false;
  try {
    await workflow.run({
      sourcePath: "no-body.md",
      title: "测试",
      content: "# 测试标题",
    }, output);
  } catch {
    errorOccurred = true;
  }
  
  assert.ok(errorOccurred, "有标题但无正文应触发错误");
  
  const fs = await import("node:fs/promises");
  const files = await fs.readdir(output);
  assert.equal(files.length, 0, "不应生成任何文件");
});

test("有一级标题和有效正文可以正常执行", async () => {
  const output = await mkdtemp(path.join(os.tmpdir(), "pae-valid-"));
  const workflow = new ProductDesignWorkflow(new MockStageExecutor());
  
  await workflow.run({
    sourcePath: "valid.md",
    title: "测试产品",
    content: "# 测试产品\n\n## 用户角色\n\n- 用户\n\n## 核心需求\n\n- 创建申请",
  }, output);
  
  const fs = await import("node:fs/promises");
  const files = await fs.readdir(output);
  assert.ok(files.length > 0, "应生成文件");
});

test("采购申请需求生成采购相关成果物", async () => {
  const output = await mkdtemp(path.join(os.tmpdir(), "pae-purchase-"));
  const workflow = new ProductDesignWorkflow(new MockStageExecutor());
  const context = await workflow.run({
    sourcePath: "purchase.md",
    title: "采购申请管理",
    content: "# 采购申请管理\n\n## 用户角色\n\n- 采购申请人\n- 采购审批人\n- 财务审核员\n\n## 核心需求\n\n- 创建采购申请\n- 审批采购申请\n- 查看采购记录\n\n## 主要页面\n\n- 采购申请列表\n- 新建采购申请\n- 采购申请详情\n- 审批待办\n- 审批详情",
  }, output);
  
  const reqAnalysis = context.artifacts["requirement-analysis"] ?? "";
  assert.ok(reqAnalysis.includes("采购"), "需求分析应包含采购相关内容");
  
  const outline = context.artifacts["product-outline"] ?? "";
  assert.ok(outline.includes("采购"), "产品概要应包含采购相关内容");
  
  const prototype = context.artifacts.prototype;
  assert.ok(prototype, "Prototype DSL 必须存在");
  const pageNames = prototype.pages.map(p => p.name);
  assert.ok(pageNames.some(p => p.includes("采购")), "页面应包含采购相关名称");
  
  assert.ok(!reqAnalysis.includes("请假"), "需求分析不应包含请假内容");
  assert.ok(!outline.includes("请假"), "产品概要不应包含请假内容");
});

test("资产领用需求生成资产相关成果物", async () => {
  const output = await mkdtemp(path.join(os.tmpdir(), "pae-asset-"));
  const workflow = new ProductDesignWorkflow(new MockStageExecutor());
  const context = await workflow.run({
    sourcePath: "asset.md",
    title: "资产领用管理",
    content: "# 资产领用管理\n\n## 用户角色\n\n- 领用申请人\n- 资产管理员\n- 部门负责人\n\n## 核心需求\n\n- 申请领用资产\n- 审批领用申请\n- 管理资产库存\n\n## 主要页面\n\n- 资产列表\n- 领用申请\n- 申请详情\n- 审批待办\n- 资产库存管理",
  }, output);
  
  const reqAnalysis = context.artifacts["requirement-analysis"] ?? "";
  assert.ok(reqAnalysis.includes("资产"), "需求分析应包含资产相关内容");
  
  const outline = context.artifacts["product-outline"] ?? "";
  assert.ok(outline.includes("资产"), "产品概要应包含资产相关内容");
  
  const prototype = context.artifacts.prototype;
  assert.ok(prototype, "Prototype DSL 必须存在");
  const pageNames = prototype.pages.map(p => p.name);
  assert.ok(pageNames.some(p => p.includes("资产")), "页面应包含资产相关名称");
  
  assert.ok(!reqAnalysis.includes("请假"), "需求分析不应包含请假内容");
  assert.ok(!outline.includes("请假"), "产品概要不应包含请假内容");
});

test("不同需求生成的成果物存在业务差异", async () => {
  const output1 = await mkdtemp(path.join(os.tmpdir(), "pae-purchase-"));
  const output2 = await mkdtemp(path.join(os.tmpdir(), "pae-asset-"));
  const workflow = new ProductDesignWorkflow(new MockStageExecutor());
  
  const context1 = await workflow.run({
    sourcePath: "purchase.md",
    title: "采购申请管理",
    content: "# 采购申请管理\n\n## 用户角色\n\n- 采购申请人\n- 采购审批人\n\n## 核心需求\n\n- 创建采购申请\n- 审批采购申请\n\n## 主要页面\n\n- 采购申请列表\n- 新建采购申请\n- 采购申请详情",
  }, output1);
  
  const context2 = await workflow.run({
    sourcePath: "asset.md",
    title: "资产领用管理",
    content: "# 资产领用管理\n\n## 用户角色\n\n- 领用申请人\n- 资产管理员\n\n## 核心需求\n\n- 申请领用资产\n- 管理资产库存\n\n## 主要页面\n\n- 资产列表\n- 领用申请\n- 申请详情",
  }, output2);
  
  const reqAnalysis1 = context1.artifacts["requirement-analysis"] ?? "";
  const reqAnalysis2 = context2.artifacts["requirement-analysis"] ?? "";
  
  assert.notEqual(reqAnalysis1, reqAnalysis2, "不同需求的需求分析应不同");
  
  const pageNames1 = context1.artifacts.prototype?.pages.map(p => p.name) ?? [];
  const pageNames2 = context2.artifacts.prototype?.pages.map(p => p.name) ?? [];
  
  assert.ok(pageNames1.some(p => p.includes("采购")), "采购需求应有采购页面");
  assert.ok(pageNames2.some(p => p.includes("资产")), "资产需求应有资产页面");
});

test("阶段失败后后续阶段标记为 skipped", async () => {
  class FailingExecutor extends MockStageExecutor {
    async execute(stage: string, context: any) {
      if (stage === "requirement-analysis") {
        throw new Error("模拟阶段失败");
      }
      return super.execute(stage as never, context);
    }
  }
  
  const output = await mkdtemp(path.join(os.tmpdir(), "pae-fail-"));
  const workflow = new ProductDesignWorkflow(new FailingExecutor());
  
  let errorOccurred = false;
  try {
    await workflow.run({
      sourcePath: "test.md",
      title: "测试",
      content: "# 测试\n\n测试内容",
    }, output);
  } catch {
    errorOccurred = true;
  }
  
  assert.ok(errorOccurred, "阶段失败应触发错误");
  
  const manifest = await readJson<{ stages: Array<{ id: string; status: string }> }>(path.join(output, "manifest.json"));
  
  const failedStage = manifest.stages.find(s => s.id === "requirement-analysis");
  assert.ok(failedStage, "失败阶段应在 manifest 中");
  assert.equal(failedStage.status, "failed", "失败阶段应标记为 failed");
  
  const skippedStages = manifest.stages.filter(s => s.status === "skipped");
  assert.ok(skippedStages.length > 0, "后续阶段应标记为 skipped");
  
  const completedStages = manifest.stages.filter(s => s.status === "completed");
  assert.equal(completedStages.length, 0, "不应有 completed 阶段");
});

test("正常执行时所有阶段标记为 completed", async () => {
  const output = await mkdtemp(path.join(os.tmpdir(), "pae-success-"));
  const workflow = new ProductDesignWorkflow(new MockStageExecutor());
  
  await workflow.run({
    sourcePath: "test.md",
    title: "测试产品",
    content: "# 测试产品\n\n## 用户角色\n\n- 用户\n\n## 核心需求\n\n- 创建申请",
  }, output);
  
  const manifest = await readJson<{ stages: Array<{ id: string; status: string }> }>(path.join(output, "manifest.json"));
  
  const completedStages = manifest.stages.filter(s => s.status === "completed");
  assert.equal(completedStages.length, manifest.stages.length, "所有阶段应标记为 completed");
  
  const failedStages = manifest.stages.filter(s => s.status === "failed");
  assert.equal(failedStages.length, 0, "不应有 failed 阶段");
});

test("会议室和供应商产品架构存在业务差异", async () => {
  const output1 = await mkdtemp(path.join(os.tmpdir(), "pae-meeting-"));
  const output2 = await mkdtemp(path.join(os.tmpdir(), "pae-supplier-"));
  const workflow = new ProductDesignWorkflow(new MockStageExecutor());
  
  await workflow.run({
    sourcePath: "meeting.md",
    title: "会议室预约管理",
    content: "# 会议室预约管理\n\n## 用户角色\n\n- 预约人：发起会议室预约\n- 行政管理员：维护会议室\n\n## 主要页面\n\n- 我的预约\n- 会议室日历\n- 会议室管理",
  }, output1);
  
  await workflow.run({
    sourcePath: "supplier.md",
    title: "供应商准入管理",
    content: "# 供应商准入管理\n\n## 用户角色\n\n- 采购专员：提交准入申请\n- 风控人员：风险审查\n\n## 主要页面\n\n- 供应商列表\n- 准入申请详情\n- 风控审查",
  }, output2);
  
  const fs = await import("node:fs/promises");
  const arch1 = await fs.readFile(path.join(output1, "03-product-architecture.md"), "utf8");
  const arch2 = await fs.readFile(path.join(output2, "03-product-architecture.md"), "utf8");
  
  assert.notEqual(arch1, arch2, "产品架构文件不应完全相同");
  assert.ok(arch1.includes("预约人"), "会议室架构应包含预约人");
  assert.ok(arch1.includes("会议室"), "会议室架构应包含会议室");
  assert.ok(arch2.includes("采购专员"), "供应商架构应包含采购专员");
  assert.ok(arch2.includes("风控"), "供应商架构应包含风控");
});

test("所有主要页面均能找到归属分组", async () => {
  const output = await mkdtemp(path.join(os.tmpdir(), "pae-pages-"));
  const workflow = new ProductDesignWorkflow(new MockStageExecutor());
  
  await workflow.run({
    sourcePath: "test.md",
    title: "测试",
    content: "# 测试\n\n## 主要页面\n\n- 我的预约\n- 会议室日历\n- 预约详情\n- 审批待办\n- 统计报表",
  }, output);
  
  const fs = await import("node:fs/promises");
  const pageStructure = await fs.readFile(path.join(output, "05-page-structure.md"), "utf8");
  
  assert.ok(pageStructure.includes("我的预约"), "我的预约应出现在页面结构中");
  assert.ok(pageStructure.includes("会议室日历"), "会议室日历应出现在页面结构中");
  assert.ok(pageStructure.includes("预约详情"), "预约详情应出现在页面结构中");
  assert.ok(pageStructure.includes("审批待办"), "审批待办应出现在页面结构中");
  assert.ok(pageStructure.includes("统计报表"), "统计报表应出现在页面结构中");
});

test("角色解析保留名称和描述", async () => {
  const output = await mkdtemp(path.join(os.tmpdir(), "pae-roles-"));
  const workflow = new ProductDesignWorkflow(new MockStageExecutor());
  
  await workflow.run({
    sourcePath: "test.md",
    title: "测试",
    content: "# 测试\n\n## 用户角色\n\n- 预约人：发起会议室预约\n- 行政管理员：维护会议室及处理冲突预约\n- 风控人员: 执行风险审查\n- 普通员工",
  }, output);
  
  const fs = await import("node:fs/promises");
  const reqAnalysis = await fs.readFile(path.join(output, "01-requirement-analysis.md"), "utf8");
  
  assert.ok(reqAnalysis.includes("预约人：发起会议室预约"), "应保留完整角色描述");
  assert.ok(reqAnalysis.includes("行政管理员：维护会议室及处理冲突预约"), "中文冒号应正常解析");
  assert.ok(reqAnalysis.includes("风控人员: 执行风险审查"), "英文冒号应正常解析");
  assert.ok(reqAnalysis.includes("普通员工"), "无描述角色应正常处理");
});

test("缺失章节内容具有系统推导标识", async () => {
  const output = await mkdtemp(path.join(os.tmpdir(), "pae-derived-"));
  const workflow = new ProductDesignWorkflow(new MockStageExecutor());

  await workflow.run({
    sourcePath: "test.md",
    title: "公告发布",
    content: "# 公告发布\n\n管理员可以创建公告。",
  }, output);

  const fs = await import("node:fs/promises");
  const reqAnalysis = await fs.readFile(path.join(output, "01-requirement-analysis.md"), "utf8");
  const outline = await fs.readFile(path.join(output, "02-product-outline.md"), "utf8");
  const architecture = await fs.readFile(path.join(output, "03-product-architecture.md"), "utf8");
  const coreFlow = await fs.readFile(path.join(output, "04-core-flow.md"), "utf8");
  const pageStructure = await fs.readFile(path.join(output, "05-page-structure.md"), "utf8");
  const prd = await fs.readFile(path.join(output, "09-prd.md"), "utf8");

  assert.ok(reqAnalysis.includes("来源：根据需求正文推导"), "01-requirement-analysis.md 缺失角色章节应标识来源");
  assert.ok(reqAnalysis.includes("来源：系统默认非目标项"), "01-requirement-analysis.md 缺失非目标章节应标识来源");

  assert.ok(outline.includes("来源：系统通用推导，待用户确认"), "02-product-outline.md 核心模块应标识来源");
  assert.ok(outline.includes("来源：根据需求正文推导"), "02-product-outline.md 核心状态应标识来源");

  assert.ok(architecture.includes("来源：根据需求正文推导"), "03-product-architecture.md 应标识来源");

  assert.ok(coreFlow.includes("来源：根据需求正文推导"), "04-core-flow.md 应标识来源");

  assert.ok(pageStructure.includes("来源：根据需求正文推导"), "05-page-structure.md 应标识来源");

  assert.ok(prd.includes("来源：根据需求正文推导"), "09-prd.md 应标识来源");
});

test("用户明确输入的内容不会被误标为系统推导", async () => {
  const output = await mkdtemp(path.join(os.tmpdir(), "pae-explicit-"));
  const workflow = new ProductDesignWorkflow(new MockStageExecutor());

  await workflow.run({
    sourcePath: "test.md",
    title: "采购申请",
    content: "# 采购申请\n\n## 用户角色\n\n- 采购申请人\n- 采购审批人\n\n## 主要状态\n\n- 草稿\n- 审批中\n- 已通过\n\n## 主要页面\n\n- 采购申请列表\n- 新建采购申请\n\n## 暂不考虑范围\n\n- 外部系统集成",
  }, output);

  const fs = await import("node:fs/promises");
  const reqAnalysis = await fs.readFile(path.join(output, "01-requirement-analysis.md"), "utf8");
  const outline = await fs.readFile(path.join(output, "02-product-outline.md"), "utf8");
  const pageStructure = await fs.readFile(path.join(output, "05-page-structure.md"), "utf8");
  const prd = await fs.readFile(path.join(output, "09-prd.md"), "utf8");

  assert.ok(!reqAnalysis.includes("来源：根据需求正文推导"), "01-requirement-analysis.md 不应有推导标识，因为角色已显式定义");
  assert.ok(!reqAnalysis.includes("来源：系统默认非目标项"), "01-requirement-analysis.md 不应有非目标推导标识");

  assert.ok(!outline.includes("来源：根据需求正文推导"), "02-product-outline.md 状态不应被标为推导");
  assert.ok(outline.includes("来源：系统通用推导，待用户确认"), "02-product-outline.md 核心模块仍为系统推导");

  assert.ok(!pageStructure.includes("来源：根据需求正文推导"), "05-page-structure.md 页面不应被标为推导");
  assert.ok(!prd.includes("来源：根据需求正文推导"), "09-prd.md 页面不应被标为推导");
});

test("prototype.json 中包含 sourceAttribution", async () => {
  const output = await mkdtemp(path.join(os.tmpdir(), "pae-proto-source-"));
  const workflow = new ProductDesignWorkflow(new MockStageExecutor());

  await workflow.run({
    sourcePath: "test.md",
    title: "公告发布",
    content: "# 公告发布\n\n管理员可以创建公告。",
  }, output);

  const prototype = await readJson<{ product?: { sourceAttribution?: string } }>(path.join(output, "06-prototype", "prototype.json"));

  assert.ok(prototype.product?.sourceAttribution, "prototype.json 应包含 sourceAttribution");
  assert.ok(prototype.product.sourceAttribution.includes("系统通用推导"), "sourceAttribution 应说明推导来源");
});

test("package-lock.json 版本为 0.3.1", async () => {
  const { fileURLToPath } = await import("node:url");
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const lock = await readJson<{ version: string; packages?: Record<string, { version?: string }> }>(path.join(__dirname, "..", "package-lock.json"));
  assert.equal(lock.version, "0.3.1", "package-lock.json 顶层 version 应为 0.3.1");
  assert.equal(lock.packages?.[""]?.version, "0.3.1", "package-lock.json packages[''] version 应为 0.3.1");
});

test("manifest.version 为 0.3.1", async () => {
  const output = await mkdtemp(path.join(os.tmpdir(), "pae-version-"));
  const workflow = new ProductDesignWorkflow(new MockStageExecutor());
  
  await workflow.run({
    sourcePath: "test.md",
    title: "测试",
    content: "# 测试\n\n测试内容",
  }, output);
  
  const manifest = await readJson<{ version: string }>(path.join(output, "manifest.json"));
  
  assert.equal(manifest.version, "0.3.1", "manifest.version 应为 0.3.1");
});

test("package.json 版本为 0.3.1", async () => {
  const { fileURLToPath, pathToFileURL } = await import("node:url");
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const pkg = await readJson<{ version: string }>(path.join(__dirname, "..", "package.json"));
  assert.equal(pkg.version, "0.3.1", "package.json 版本应为 0.3.1");
});

// ===== PAE-030-011: safeSegment 路径安全测试 =====

import { prepareRequirementOutput } from "../src/output/requirement-output.js";

async function assertThrows(fn: () => Promise<unknown>, message: string) {
  let errorOccurred = false;
  try {
    await fn();
  } catch {
    errorOccurred = true;
  }
  assert.ok(errorOccurred, message);
}

test("safeSegment 拒绝包含路径分隔符的 project-id", async () => {
  const output = await mkdtemp(path.join(os.tmpdir(), "pae-segment-"));
  await assertThrows(
    () => prepareRequirementOutput({
      outputRoot: output,
      projectId: "hr/system",
      projectName: "HR",
      productVersion: "0.1.0",
      requirementId: "REQ-001",
      requirementName: "leave-request",
    }, { sourcePath: "test.md", title: "Test", content: "# Test\n\nbody" }),
    "project-id 包含 / 应被拒绝"
  );
});

test("safeSegment 拒绝包含路径分隔符的 requirement-id", async () => {
  const output = await mkdtemp(path.join(os.tmpdir(), "pae-segment-"));
  await assertThrows(
    () => prepareRequirementOutput({
      outputRoot: output,
      projectId: "hr-system",
      projectName: "HR",
      productVersion: "0.1.0",
      requirementId: "REQ/001",
      requirementName: "leave-request",
    }, { sourcePath: "test.md", title: "Test", content: "# Test\n\nbody" }),
    "requirement-id 包含 / 应被拒绝"
  );
});

test("safeSegment 拒绝路径穿越序列 ..", async () => {
  const output = await mkdtemp(path.join(os.tmpdir(), "pae-segment-"));
  await assertThrows(
    () => prepareRequirementOutput({
      outputRoot: output,
      projectId: "hr-system",
      projectName: "HR",
      productVersion: "0.1.0",
      requirementId: "REQ-001",
      requirementName: "leave-request..",
    }, { sourcePath: "test.md", title: "Test", content: "# Test\n\nbody" }),
    "requirement-name 包含 .. 应被拒绝"
  );
});

test("safeSegment 拒绝编码后的路径穿越", async () => {
  const output = await mkdtemp(path.join(os.tmpdir(), "pae-segment-"));
  await assertThrows(
    () => prepareRequirementOutput({
      outputRoot: output,
      projectId: "hr-system",
      projectName: "HR",
      productVersion: "0.1.0",
      requirementId: "REQ-001",
      requirementName: "leave%2e%2e%2frequest",
    }, { sourcePath: "test.md", title: "Test", content: "# Test\n\nbody" }),
    "编码后的路径穿越应被拒绝"
  );
});

test("safeSegment 拒绝以特殊字符开头的输入", async () => {
  const output = await mkdtemp(path.join(os.tmpdir(), "pae-segment-"));
  await assertThrows(
    () => prepareRequirementOutput({
      outputRoot: output,
      projectId: "~home",
      projectName: "HR",
      productVersion: "0.1.0",
      requirementId: "REQ-001",
      requirementName: "leave-request",
    }, { sourcePath: "test.md", title: "Test", content: "# Test\n\nbody" }),
    "以 ~ 开头的 project-id 应被拒绝"
  );
});

test("safeSegment 保留正常项目名称", async () => {
  const output = await mkdtemp(path.join(os.tmpdir(), "pae-segment-"));
  const result = await prepareRequirementOutput({
    outputRoot: output,
    projectId: "hr-system",
    projectName: "人力资源系统",
    productVersion: "0.1.0",
    requirementId: "REQ-001",
    requirementName: "leave-request",
  }, { sourcePath: "test.md", title: "Test", content: "# Test\n\nbody" });
  assert.equal(result.context.projectId, "hr-system", "正常 project-id 应被保留");
});

// ===== PAE-030-010: revision 自动递增测试 =====

test("首次创建需求 revision 默认为 1", async () => {
  const output = await mkdtemp(path.join(os.tmpdir(), "pae-revision-"));
  const result = await prepareRequirementOutput({
    outputRoot: output,
    projectId: "finance-system",
    projectName: "财务系统",
    productVersion: "0.1.0",
    requirementId: "REQ-001",
    requirementName: "expense-request",
  }, { sourcePath: "test.md", title: "Test", content: "# Test\n\nbody" });
  assert.equal(result.context.revision, 1, "首次创建 revision 应为 1");
});

test("重复运行同一需求 revision 自动递增", async () => {
  const output = await mkdtemp(path.join(os.tmpdir(), "pae-revision-"));
  const input = { sourcePath: "test.md", title: "Test", content: "# Test\n\nbody" };

  const first = await prepareRequirementOutput({
    outputRoot: output,
    projectId: "finance-system",
    projectName: "财务系统",
    productVersion: "0.1.0",
    requirementId: "REQ-001",
    requirementName: "expense-request",
  }, input);
  assert.equal(first.context.revision, 1, "首次创建 revision 应为 1");

  const second = await prepareRequirementOutput({
    outputRoot: output,
    projectId: "finance-system",
    projectName: "财务系统",
    productVersion: "0.1.0",
    requirementId: "REQ-001",
    requirementName: "expense-request",
  }, input);
  assert.equal(second.context.revision, 2, "第二次创建 revision 应自动递增为 2");

  const third = await prepareRequirementOutput({
    outputRoot: output,
    projectId: "finance-system",
    projectName: "财务系统",
    productVersion: "0.1.0",
    requirementId: "REQ-001",
    requirementName: "expense-request",
  }, input);
  assert.equal(third.context.revision, 3, "第三次创建 revision 应自动递增为 3");
});

test("用户传入 revision 大于当前版本时生效", async () => {
  const output = await mkdtemp(path.join(os.tmpdir(), "pae-revision-"));
  const input = { sourcePath: "test.md", title: "Test", content: "# Test\n\nbody" };

  await prepareRequirementOutput({
    outputRoot: output,
    projectId: "finance-system",
    projectName: "财务系统",
    productVersion: "0.1.0",
    requirementId: "REQ-001",
    requirementName: "expense-request",
  }, input);

  const result = await prepareRequirementOutput({
    outputRoot: output,
    projectId: "finance-system",
    projectName: "财务系统",
    productVersion: "0.1.0",
    requirementId: "REQ-001",
    requirementName: "expense-request",
    revision: 5,
  }, input);
  assert.equal(result.context.revision, 5, "用户传入更大的 revision 应生效");
});

test("用户传入 revision 小于当前版本时拒绝", async () => {
  const output = await mkdtemp(path.join(os.tmpdir(), "pae-revision-"));
  const input = { sourcePath: "test.md", title: "Test", content: "# Test\n\nbody" };

  await prepareRequirementOutput({
    outputRoot: output,
    projectId: "finance-system",
    projectName: "财务系统",
    productVersion: "0.1.0",
    requirementId: "REQ-001",
    requirementName: "expense-request",
  }, input);

  await assertThrows(
    () => prepareRequirementOutput({
      outputRoot: output,
      projectId: "finance-system",
      projectName: "财务系统",
      productVersion: "0.1.0",
      requirementId: "REQ-001",
      requirementName: "expense-request",
      revision: 1,
    }, input),
    "revision 小于当前版本应被拒绝"
  );
});

test("非法 revision 值被拒绝", async () => {
  const output = await mkdtemp(path.join(os.tmpdir(), "pae-revision-"));
  await assertThrows(
    () => prepareRequirementOutput({
      outputRoot: output,
      projectId: "finance-system",
      projectName: "财务系统",
      productVersion: "0.1.0",
      requirementId: "REQ-001",
      requirementName: "expense-request",
      revision: 0,
    }, { sourcePath: "test.md", title: "Test", content: "# Test\n\nbody" }),
    "revision = 0 应被拒绝"
  );

  await assertThrows(
    () => prepareRequirementOutput({
      outputRoot: output,
      projectId: "finance-system",
      projectName: "财务系统",
      productVersion: "0.1.0",
      requirementId: "REQ-001",
      requirementName: "expense-request",
      revision: -1,
    }, { sourcePath: "test.md", title: "Test", content: "# Test\n\nbody" }),
    "revision = -1 应被拒绝"
  );

  await assertThrows(
    () => prepareRequirementOutput({
      outputRoot: output,
      projectId: "finance-system",
      projectName: "财务系统",
      productVersion: "0.1.0",
      requirementId: "REQ-001",
      requirementName: "expense-request",
      revision: 1.5,
    }, { sourcePath: "test.md", title: "Test", content: "# Test\n\nbody" }),
    "revision = 1.5 应被拒绝"
  );
});

// ===== PAE-030-009: requirement-index.md 格式测试 =====

test("PAE-030-009: 索引文件表头与数据行之间无多余空行", async () => {
  const outputRoot = await mkdtemp(path.join(os.tmpdir(), "pae-009-format-"));
  const input = { sourcePath: "test.md", title: "Test", content: "# Test\n\nbody" };

  await prepareRequirementOutput({
    outputRoot,
    projectId: "hr-system",
    projectName: "HR",
    productVersion: "1.0.0",
    requirementId: "REQ-001",
    requirementName: "leave-request",
    revision: 1,
  }, input);

  const indexPath = path.join(outputRoot, "hr-system", "product", "requirement-index.md");
  const indexContent = await readFile(indexPath, "utf8");
  const lines = indexContent.split("\n");

  // 预期结构：# 需求索引 / 空行 / 表头 / 分隔符 / 数据行
  // 表头分隔符（|---|---|---|---|）后面应紧跟数据行，不应有空行
  const separatorIndex = lines.findIndex(line => line.includes("|---|---|---|---|"));
  assert.ok(separatorIndex >= 0, "应找到表格分隔符行");
  assert.ok(separatorIndex + 1 < lines.length, "分隔符后应有数据行");
  assert.ok(lines[separatorIndex + 1].startsWith("| REQ-001 |"), "分隔符后应紧跟数据行，不应有空行");
});

test("PAE-030-009: 连续添加多条记录不产生连续空行", async () => {
  const outputRoot = await mkdtemp(path.join(os.tmpdir(), "pae-009-multi-"));
  const input = { sourcePath: "test.md", title: "Test", content: "# Test\n\nbody" };
  const base = {
    outputRoot,
    projectId: "hr-system",
    projectName: "HR",
    productVersion: "1.0.0",
  };

  await prepareRequirementOutput({ ...base, requirementId: "REQ-001", requirementName: "leave-request", revision: 1 }, input);
  await prepareRequirementOutput({ ...base, requirementId: "REQ-002", requirementName: "overtime-request", revision: 1 }, input);
  await prepareRequirementOutput({ ...base, requirementId: "REQ-003", requirementName: "travel-request", revision: 1 }, input);

  const indexPath = path.join(outputRoot, "hr-system", "product", "requirement-index.md");
  const indexContent = await readFile(indexPath, "utf8");

  // 不应出现连续两个空行
  assert.ok(!/\n\n\n/.test(indexContent), "索引不应出现连续空行");

  const lines = indexContent.split("\n");
  // 检查每两条数据行之间没有空行
  const dataLines = lines.filter(line => line.startsWith("| REQ-"));
  assert.equal(dataLines.length, 3, "应有 3 条数据行");

  // 数据行在原文件中应连续出现（相邻行号差为 1）
  const dataLineIndices = lines
    .map((line, idx) => line.startsWith("| REQ-") ? idx : -1)
    .filter(idx => idx >= 0);
  for (let i = 1; i < dataLineIndices.length; i++) {
    assert.equal(dataLineIndices[i] - dataLineIndices[i - 1], 1, "数据行之间不应有空行");
  }
});

test("PAE-030-009: 文件结尾最多保留一个换行符", async () => {
  const outputRoot = await mkdtemp(path.join(os.tmpdir(), "pae-009-eol-"));
  const input = { sourcePath: "test.md", title: "Test", content: "# Test\n\nbody" };

  await prepareRequirementOutput({
    outputRoot,
    projectId: "hr-system",
    projectName: "HR",
    productVersion: "1.0.0",
    requirementId: "REQ-001",
    requirementName: "leave-request",
    revision: 1,
  }, input);

  const indexPath = path.join(outputRoot, "hr-system", "product", "requirement-index.md");
  const indexContent = await readFile(indexPath, "utf8");

  // 文件结尾最多一个换行符：不以 \n\n 结尾
  assert.ok(!indexContent.endsWith("\n\n"), "文件结尾不应有多余空行");
  // 文件应以换行符结尾
  assert.ok(indexContent.endsWith("\n"), "文件应以单个换行符结尾");
});

test("PAE-030-009: 重复运行同一需求不产生多余空行", async () => {
  const outputRoot = await mkdtemp(path.join(os.tmpdir(), "pae-009-dup-"));
  const input = { sourcePath: "test.md", title: "Test", content: "# Test\n\nbody" };
  const base = {
    outputRoot,
    projectId: "hr-system",
    projectName: "HR",
    productVersion: "1.0.0",
    requirementId: "REQ-001",
    requirementName: "leave-request",
  };

  // 连续运行 3 次
  await prepareRequirementOutput(base, input);
  await prepareRequirementOutput(base, input);
  await prepareRequirementOutput(base, input);

  const indexPath = path.join(outputRoot, "hr-system", "product", "requirement-index.md");
  const indexContent = await readFile(indexPath, "utf8");

  // 不应出现连续空行
  assert.ok(!/\n\n\n/.test(indexContent), "重复运行后不应出现连续空行");

  // REQ-001 应只出现一次
  const req001Count = (indexContent.match(/\| REQ-001 \|/g) ?? []).length;
  assert.equal(req001Count, 1, "重复运行后索引中应只有一行 REQ-001");
});

// ===== PAE-030-013: 项目身份与需求目录识别测试 =====

test("PAE-030-013: 同名项目但 projectId 不同必须生成不同项目目录", async () => {
  const outputRoot = await mkdtemp(path.join(os.tmpdir(), "pae-013-samename-"));
  const input = { sourcePath: "test.md", title: "Test", content: "# Test\n\nbody" };

  // 两个同名项目但 projectId 不同
  await prepareRequirementOutput({
    outputRoot,
    projectId: "hr-system-a",
    projectName: "人力资源系统",
    productVersion: "1.0.0",
    requirementId: "REQ-001",
    requirementName: "leave-request",
    revision: 1,
  }, input);

  await prepareRequirementOutput({
    outputRoot,
    projectId: "hr-system-b",
    projectName: "人力资源系统",
    productVersion: "1.0.0",
    requirementId: "REQ-001",
    requirementName: "leave-request",
    revision: 1,
  }, input);

  const projectA = await readJson<{ projectId: string; projectName: string }>(path.join(outputRoot, "hr-system-a", "project.json"));
  const projectB = await readJson<{ projectId: string; projectName: string }>(path.join(outputRoot, "hr-system-b", "project.json"));

  assert.equal(projectA.projectId, "hr-system-a", "项目 A 的 projectId 应为 hr-system-a");
  assert.equal(projectB.projectId, "hr-system-b", "项目 B 的 projectId 应为 hr-system-b");
  assert.equal(projectA.projectName, "人力资源系统", "项目 A 的 projectName 应一致");
  assert.equal(projectB.projectName, "人力资源系统", "项目 B 的 projectName 应一致");
});

test("PAE-030-013: 同一 projectId 下多个不同 requirementId 生成多个需求目录", async () => {
  const outputRoot = await mkdtemp(path.join(os.tmpdir(), "pae-013-multireq-"));
  const input = { sourcePath: "test.md", title: "Test", content: "# Test\n\nbody" };
  const base = {
    outputRoot,
    projectId: "hr-system",
    projectName: "人力资源系统",
    productVersion: "1.0.0",
  };

  const first = await prepareRequirementOutput({ ...base, requirementId: "REQ-001", requirementName: "leave-request", revision: 1 }, input);
  const second = await prepareRequirementOutput({ ...base, requirementId: "REQ-002", requirementName: "overtime-request", revision: 1 }, input);

  assert.notEqual(first.requirementDirectory, second.requirementDirectory, "两个需求目录路径应不同");

  const req1Json = await readJson<{ requirementId: string }>(path.join(first.requirementDirectory, "requirement.json"));
  const req2Json = await readJson<{ requirementId: string }>(path.join(second.requirementDirectory, "requirement.json"));
  assert.equal(req1Json.requirementId, "REQ-001");
  assert.equal(req2Json.requirementId, "REQ-002");

  // 两个需求目录都在同一项目下
  assert.ok(first.requirementDirectory.includes("hr-system/requirements/"), "需求 1 应在 hr-system 项目下");
  assert.ok(second.requirementDirectory.includes("hr-system/requirements/"), "需求 2 应在 hr-system 项目下");

  // project.json 只有一个
  const projectJson = await readJson<{ projectId: string }>(path.join(outputRoot, "hr-system", "project.json"));
  assert.equal(projectJson.projectId, "hr-system");
});

test("PAE-030-013: 同一 projectId + requirementId 重复运行视为更新同一需求", async () => {
  const outputRoot = await mkdtemp(path.join(os.tmpdir(), "pae-013-repeat-"));
  const input = { sourcePath: "test.md", title: "Test", content: "# Test\n\nbody" };
  const base = {
    outputRoot,
    projectId: "hr-system",
    projectName: "人力资源系统",
    productVersion: "1.0.0",
    requirementId: "REQ-001",
    requirementName: "leave-request",
  };

  const first = await prepareRequirementOutput(base, input);
  const second = await prepareRequirementOutput(base, input);

  assert.equal(first.requirementDirectory, second.requirementDirectory, "重复运行应指向同一需求目录");
  assert.equal(second.context.revision, 2, "第二次运行 revision 应递增为 2");

  // requirements 目录下只有一个需求目录
  const entries = await readdir(path.join(outputRoot, "hr-system", "requirements"));
  assert.equal(entries.length, 1, "requirements 目录下应只有一个需求目录");
  assert.equal(entries[0], "REQ-001-leave-request");
});

test("PAE-030-013: 同一 requirementId 修改 requirementName 时重命名目录", async () => {
  const outputRoot = await mkdtemp(path.join(os.tmpdir(), "pae-013-rename-"));
  const input = { sourcePath: "test.md", title: "Test", content: "# Test\n\nbody" };
  const base = {
    outputRoot,
    projectId: "hr-system",
    projectName: "人力资源系统",
    productVersion: "1.0.0",
    requirementId: "REQ-001",
  };

  // 首次创建
  const first = await prepareRequirementOutput({ ...base, requirementName: "leave-request", revision: 1 }, input);
  assert.ok(first.requirementDirectory.endsWith("REQ-001-leave-request"), "首次目录名应包含 leave-request");

  // 修改 requirementName
  const second = await prepareRequirementOutput({ ...base, requirementName: "vacation-request" }, input);
  assert.ok(second.requirementDirectory.endsWith("REQ-001-vacation-request"), "修改后目录名应包含 vacation-request");

  // requirements 目录下应只有一个需求目录（重命名后）
  const entries = await readdir(path.join(outputRoot, "hr-system", "requirements"));
  assert.equal(entries.length, 1, "修改 requirementName 后应只有一个需求目录");
  assert.equal(entries[0], "REQ-001-vacation-request", "目录应已重命名为新名称");

  // 旧目录不应存在
  await assert.rejects(
    access(path.join(outputRoot, "hr-system", "requirements", "REQ-001-leave-request")),
    "旧目录不应残留"
  );

  // revision 应递增（同一需求）
  assert.equal(second.context.revision, 2, "修改 requirementName 后 revision 应递增");
});

test("PAE-030-013: 同一 projectId 修改 projectName 时不创建第二个项目", async () => {
  const outputRoot = await mkdtemp(path.join(os.tmpdir(), "pae-013-rename-proj-"));
  const input = { sourcePath: "test.md", title: "Test", content: "# Test\n\nbody" };
  const base = {
    outputRoot,
    projectId: "hr-system",
    productVersion: "1.0.0",
    requirementId: "REQ-001",
    requirementName: "leave-request",
  };

  // 首次创建
  await prepareRequirementOutput({ ...base, projectName: "人力资源系统", revision: 1 }, input);

  // 修改 projectName，不传 revision 让其自动递增
  await prepareRequirementOutput({ ...base, projectName: "HR 管理平台" }, input);

  // 项目目录仍只有一个
  const projectEntries = await readdir(path.join(outputRoot));
  const hrDirs = projectEntries.filter(e => e === "hr-system");
  assert.equal(hrDirs.length, 1, "修改 projectName 后应只有一个项目目录");

  // project.json 中 projectName 应更新
  const projectJson = await readJson<{ projectId: string; projectName: string }>(
    path.join(outputRoot, "hr-system", "project.json")
  );
  assert.equal(projectJson.projectId, "hr-system", "projectId 应保持不变");
  assert.equal(projectJson.projectName, "HR 管理平台", "projectName 应更新为新值");
});

test("PAE-030-013: 不同 requirementId 不应误匹配同一需求目录", async () => {
  const outputRoot = await mkdtemp(path.join(os.tmpdir(), "pae-013-prefix-"));
  const input = { sourcePath: "test.md", title: "Test", content: "# Test\n\nbody" };
  const base = {
    outputRoot,
    projectId: "hr-system",
    projectName: "HR",
    productVersion: "1.0.0",
  };

  // REQ-001 和 REQ-010 不应互相匹配
  await prepareRequirementOutput({ ...base, requirementId: "REQ-001", requirementName: "leave", revision: 1 }, input);
  await prepareRequirementOutput({ ...base, requirementId: "REQ-010", requirementName: "travel", revision: 1 }, input);

  const entries = await readdir(path.join(outputRoot, "hr-system", "requirements"));
  assert.equal(entries.length, 2, "REQ-001 和 REQ-010 应生成两个独立目录");
  assert.ok(entries.includes("REQ-001-leave"), "应包含 REQ-001-leave");
  assert.ok(entries.includes("REQ-010-travel"), "应包含 REQ-010-travel");
});