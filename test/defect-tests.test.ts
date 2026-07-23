import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { MockStageExecutor } from "../src/execution/mock-executor.js";
import { ProductDesignWorkflow } from "../src/workflow/workflow.js";

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