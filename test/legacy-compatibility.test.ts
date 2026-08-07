import assert from "node:assert/strict";
import { access, cp, mkdtemp, readdir, readFile, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { MockStageExecutor } from "../src/execution/mock-executor.js";
import { LlmWorkflowExecutor } from "../src/execution/llm-workflow-executor.js";
import { MockLlmProvider } from "../src/llm/mock-provider.js";
import { ProductDesignWorkflow } from "../src/workflow/workflow.js";

const test = (globalThis as any).test ?? (await import("node:test")).default;

const FIXTURE_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "fixtures",
  "legacy-compatibility",
);

interface LegacyManifest {
  engine: string;
  version: string;
  runId: string;
  startedAt: string;
  input: { sourcePath: string; title: string };
  stages: Array<{
    id: string;
    status: string;
    file?: string;
    type?: string;
    files?: string[];
  }>;
}

async function readJson<T>(filePath: string): Promise<T> {
  return JSON.parse(await readFile(filePath, "utf8")) as T;
}

test("legacy-compatibility: 固定夹具目录存在且可读", async () => {
  await access(FIXTURE_ROOT);
  const entries = await readdir(FIXTURE_ROOT);
  assert.ok(entries.includes("manifest.json"), "应包含 manifest.json");
  assert.ok(entries.includes("project.json"), "应包含 project.json");
  assert.ok(entries.includes("01-requirement-analysis.md"), "应包含需求分析产物");
  assert.ok(entries.includes("09-prd.md"), "应包含 PRD 产物");
});

test("legacy-compatibility: 旧版目录结构完整可识别", async () => {
  const manifest = await readJson<LegacyManifest>(path.join(FIXTURE_ROOT, "manifest.json"));
  assert.equal(manifest.engine, "pd-ai-engine");
  assert.ok(/^\d+\.\d+\.\d+/.test(manifest.version), "旧夹具 version 应为合法语义化版本");

  const completedStages = manifest.stages.filter(s => s.status === "completed");
  assert.ok(completedStages.length >= 9, "至少应包含 9 个已完成阶段");

  const stageIds = completedStages.map(s => s.id);
  const expectedStages = [
    "requirement-analysis",
    "product-outline",
    "product-architecture",
    "core-flow",
    "page-structure",
    "prototype",
    "mastergo",
    "prototype-confirmation",
    "prd",
  ];
  for (const stageId of expectedStages) {
    assert.ok(stageIds.includes(stageId), `阶段 ${stageId} 应存在`);
  }
});

test("legacy-compatibility: 新生成的 manifest.version 与根 package.json.version 完全一致", async () => {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const rootPackageJson = await readJson<{ version: string }>(
    path.resolve(__dirname, "..", "package.json"),
  );
  const tempOut = await mkdtemp(path.join(os.tmpdir(), "pae-legacy-newmanifest-"));
  try {
    const workflow = new ProductDesignWorkflow(new LlmWorkflowExecutor(
      new MockLlmProvider(),
      new MockStageExecutor(),
      1,
    ));
    await workflow.run({
      sourcePath: "legacy-test.md",
      title: "Legacy 版本测试",
      content: "# Legacy 版本测试\n\n这是一个 legacy 模式测试。",
    }, tempOut);

    const newManifest = await readJson<LegacyManifest>(path.join(tempOut, "manifest.json"));
    assert.equal(
      newManifest.version,
      rootPackageJson.version,
      "新生成的 manifest.version 必须等于根 package.json.version",
    );
  } finally {
    await rm(tempOut, { recursive: true, force: true });
  }
});

test("legacy-compatibility: 旧版 manifest 字段结构保持兼容", async () => {
  const manifest = await readJson<LegacyManifest>(path.join(FIXTURE_ROOT, "manifest.json"));
  assert.ok(typeof manifest.runId === "string" && manifest.runId.length > 0, "runId 应为非空字符串");
  assert.ok(typeof manifest.startedAt === "string", "startedAt 应为字符串");
  assert.ok(typeof manifest.input.sourcePath === "string", "input.sourcePath 应为字符串");
  assert.ok(typeof manifest.input.title === "string", "input.title 应为字符串");

  // runId 应为 UUID 格式
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  assert.ok(uuidRegex.test(manifest.runId), "runId 应为合法 UUID 格式");

  // startedAt 应为可解析的 ISO 时间
  const parsedDate = new Date(manifest.startedAt);
  assert.ok(!isNaN(parsedDate.getTime()), "startedAt 应为可解析的 ISO 时间");
});

test("legacy-compatibility: 固定夹具不包含个人绝对路径", async () => {
  const manifest = await readJson<LegacyManifest>(path.join(FIXTURE_ROOT, "manifest.json"));
  assert.ok(
    !manifest.input.sourcePath.includes("/Users/"),
    "sourcePath 不得包含个人用户路径",
  );
  assert.ok(
    !manifest.input.sourcePath.includes("/home/"),
    "sourcePath 不得包含 Linux 用户路径",
  );

  // 扫描整个夹具目录中的 JSON 文件
  const jsonFiles = [
    "manifest.json",
    "project.json",
    "08-prototype-confirmation.json",
    "06-prototype/prototype.json",
    "06-prototype/prototype-manifest.json",
    "06-prototype/mastergo-data.json",
    "07-mastergo/mastergo-data.json",
    "07-mastergo/mastergo-result.json",
    "requirements/REQ-001-leave-request/requirement.json",
  ];
  for (const file of jsonFiles) {
    const content = await readFile(path.join(FIXTURE_ROOT, file), "utf8");
    assert.ok(!content.includes("/Users/summerjaney"), `${file} 不得包含个人路径`);
    assert.ok(!content.includes("\\Users\\"), `${file} 不得包含 Windows 用户路径`);
  }
});

test("legacy-compatibility: 原型目录结构完整", async () => {
  const prototypeDir = path.join(FIXTURE_ROOT, "06-prototype");
  await access(prototypeDir);

  const entries = await readdir(prototypeDir);
  assert.ok(entries.includes("prototype.json"), "应包含 prototype.json");
  assert.ok(entries.includes("prototype.html"), "应包含 prototype.html");
  assert.ok(entries.includes("prototype-manifest.json"), "应包含 prototype-manifest.json");
  assert.ok(entries.includes("mastergo-data.json"), "应包含 mastergo-data.json");
  assert.ok(entries.includes("preview"), "应包含 preview 目录");

  const previewDir = path.join(prototypeDir, "preview");
  const previewFiles = await readdir(previewDir);
  assert.ok(previewFiles.length >= 6, "preview 目录应至少包含 6 个 SVG 文件");
  for (const file of previewFiles) {
    assert.ok(file.endsWith(".svg"), `预览文件 ${file} 应为 SVG 格式`);
  }
});

test("legacy-compatibility: MasterGo 目录结构完整", async () => {
  const mastergoDir = path.join(FIXTURE_ROOT, "07-mastergo");
  await access(mastergoDir);

  const entries = await readdir(mastergoDir);
  assert.ok(entries.includes("mastergo-data.json"), "应包含 mastergo-data.json");
  assert.ok(entries.includes("mastergo-result.json"), "应包含 mastergo-result.json");

  const result = await readJson<{ createdAt: string; status: string }>(
    path.join(mastergoDir, "mastergo-result.json"),
  );
  assert.ok(typeof result.createdAt === "string", "createdAt 应为字符串");
  assert.ok(typeof result.status === "string", "status 应为字符串");
});

test("legacy-compatibility: 原型确认状态结构兼容", async () => {
  const confirmation = await readJson<{
    status: string;
    confirmedAt: string;
    confirmedBy: string;
    comments: string[];
  }>(path.join(FIXTURE_ROOT, "08-prototype-confirmation.json"));

  assert.equal(confirmation.status, "confirmed");
  assert.ok(typeof confirmation.confirmedAt === "string", "confirmedAt 应为字符串");
  assert.ok(typeof confirmation.confirmedBy === "string", "confirmedBy 应为字符串");
  assert.ok(Array.isArray(confirmation.comments), "comments 应为数组");
});

test("legacy-compatibility: 项目元数据结构兼容", async () => {
  const project = await readJson<{
    schemaVersion: string;
    projectId: string;
    projectName: string;
    productVersion: string;
    createdAt: string;
  }>(path.join(FIXTURE_ROOT, "project.json"));

  assert.ok(project.schemaVersion, "应包含 schemaVersion");
  assert.ok(project.projectId, "应包含 projectId");
  assert.ok(project.projectName, "应包含 projectName");
  assert.ok(project.productVersion, "应包含 productVersion");
  assert.ok(typeof project.createdAt === "string", "createdAt 应为字符串");
});

test("legacy-compatibility: 需求目录结构兼容", async () => {
  const requirementDir = path.join(FIXTURE_ROOT, "requirements", "REQ-001-leave-request");
  await access(requirementDir);

  const entries = await readdir(requirementDir);
  assert.ok(entries.includes("requirement.json"), "应包含 requirement.json");
  assert.ok(entries.includes("00-requirement-input.md"), "应包含需求输入文件");

  const requirement = await readJson<{
    requirementId: string;
    requirementName: string;
    revision: number;
  }>(path.join(requirementDir, "requirement.json"));

  assert.equal(requirement.requirementId, "REQ-001");
  assert.equal(requirement.requirementName, "leave-request");
  assert.ok(requirement.revision >= 1, "revision 应大于等于 1");
});

test("legacy-compatibility: 读取固定夹具不会修改原文件", async () => {
  // 测试前记录固定夹具的 manifest.json 修改时间
  const manifestPath = path.join(FIXTURE_ROOT, "manifest.json");
  const beforeStat = await stat(manifestPath);

  // 执行读取操作
  await readJson<LegacyManifest>(manifestPath);
  await readdir(FIXTURE_ROOT);
  await readdir(path.join(FIXTURE_ROOT, "06-prototype"));

  // 测试后验证修改时间未变化
  const afterStat = await stat(manifestPath);
  assert.equal(
    beforeStat.mtimeMs,
    afterStat.mtimeMs,
    "读取操作不应修改固定夹具文件",
  );
});

test("legacy-compatibility: 复制夹具到临时目录进行操作不影响原夹具", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "pae-legacy-"));
  try {
    // 复制固定夹具到临时目录
    await cp(FIXTURE_ROOT, tempDir, { recursive: true });

    // 在副本上执行修改操作
    const tempManifestPath = path.join(tempDir, "manifest.json");
    const manifest = await readJson<LegacyManifest>(tempManifestPath);
    manifest.runId = "modified-test-id";
    const { writeFile } = await import("node:fs/promises");
    await writeFile(tempManifestPath, JSON.stringify(manifest, null, 2), "utf8");

    // 验证原夹具未被修改
    const originalManifest = await readJson<LegacyManifest>(
      path.join(FIXTURE_ROOT, "manifest.json"),
    );
    assert.notEqual(
      originalManifest.runId,
      "modified-test-id",
      "原固定夹具不应被副本操作修改",
    );
    assert.equal(
      originalManifest.runId,
      "00000000-0000-4000-8000-000000000001",
      "原固定夹具 runId 应保持稳定值",
    );
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});
