import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import type { ProductBaseline } from "../src/product-baseline/types.js";
import { calculateProductBaselineHash } from "../src/product-baseline/service.js";
import { analyzeChangeImpact } from "../src/change-impact/service.js";
import type { PrototypeDsl, RequirementContext } from "../src/domain/types.js";
import { ProductDesignWorkflow } from "../src/workflow/workflow.js";
import { MockStageExecutor } from "../src/execution/mock-executor.js";

const source = { requirementId: "REQ-001", requirementRevision: 1, artifact: "requirements/REQ-001-users/06-prototype/prototype.json" };
const requirement: RequirementContext = { projectId: "base-platform", projectName: "基础平台", productVersion: "1.1.0", requirementId: "REQ-002", requirementName: "user-import", revision: 1 };

function baseline(): ProductBaseline {
  const result: ProductBaseline = {
    schemaVersion: "1.1", project: { id: "base-platform", name: "基础平台" }, product: { name: "基础平台", description: "", version: "1.0.0" },
    baseline: { sequence: 1, status: "accepted", createdAt: "2026-08-12T00:00:00.000Z", updatedAt: "2026-08-12T00:00:00.000Z", hash: "" },
    requirements: [{ id: "REQ-001", name: "users", revision: 1, productVersion: "1.0.0", acceptedAt: "2026-08-12T00:00:00.000Z" }],
    modules: [{ id: "module:user-list", name: "用户管理", entryPageId: "user-list", roles: ["admin"], source }],
    pages: [{ id: "user-list", name: "用户列表", route: "/users", pattern: "list", roles: ["admin"], fields: [{ id: "account", name: "账号", type: "text", required: true, source }], actions: [{ id: "create", name: "新增", kind: "primary", roles: ["admin"], source }], source }],
    rules: [{ id: "account-unique", description: "账号唯一", appliesTo: ["account"], source }],
  };
  result.baseline.hash = calculateProductBaselineHash(result); return result;
}

function prototype(fieldType: "text" | "select" = "text"): PrototypeDsl {
  return { schemaVersion: "0.2", product: { name: "基础平台", description: "" }, navigation: [{ label: "用户管理", pageId: "user-list", roles: ["admin"] }], pages: [
    { id: "user-list", name: "用户列表", route: "/users", pattern: "list", fields: [{ id: "account", label: "账号", type: fieldType, required: true }], actions: [{ id: "create", label: "新增", kind: "primary", roles: ["admin"] }, { id: "import", label: "批量导入", kind: "secondary", roles: ["admin"] }] },
    { id: "user-import", name: "批量导入", route: "/users/import", pattern: "form", fields: [], actions: [] },
  ], rules: [{ id: "account-unique", description: "账号唯一", appliesTo: ["account"] }], transitions: [], errorFeedback: { validationMessage: "", operationFailureMessage: "", recoveryAction: "" }, designTokens: { colors: { primary: "#000", success: "#000", danger: "#000", warning: "#000", bgPage: "#fff", bgCard: "#fff", textPrimary: "#000", textSecondary: "#000", border: "#000" }, spacing: { s8: 8, s12: 12, s16: 16, s20: 20, s24: 24, s32: 32, s40: 40 }, radius: { r8: 8, r12: 12, r16: 16, r24: 24 }, typography: { fontSize: { xs: 12, sm: 14, md: 16, lg: 20, xl: 24, xxl: 28 }, fontWeight: { normal: 400, medium: 500, semibold: 600, bold: 700 }, lineHeight: { xs: 16, sm: 20, md: 24, lg: 28, xl: 32, xxl: 36 } } } };
}

const input = { sourcePath: "requirement.md", title: "用户批量导入", content: "# 用户批量导入\n\n新增批量导入页面与操作。" };

test("TC-110-010: 识别新增页面与操作并给出跨成果物影响", () => {
  const report = analyzeChangeImpact(baseline(), prototype(), input, requirement);
  assert.ok(report.changes.some((item) => item.kind === "page" && item.id === "user-import" && item.operation === "ADD"));
  assert.ok(report.changes.some((item) => item.kind === "action" && item.id === "import" && item.operation === "ADD"));
  assert.ok(report.affectedArtifacts.includes("MasterGo"));
  assert.equal(report.canProceed, true);
});

test("TC-110-011: 同 ID 字段类型变化按 ERROR 阻断", () => {
  const report = analyzeChangeImpact(baseline(), prototype("select"), input, requirement);
  assert.ok(report.conflicts.some((item) => item.code === "FIELD_DEFINITION_CONFLICT" && item.severity === "ERROR"));
  assert.equal(report.canProceed, false);
});

test("TC-110-012: 已发布页面删除必须人工确认", () => {
  const proposal = prototype(); proposal.pages = proposal.pages.filter((page) => page.id !== "user-list");
  const report = analyzeChangeImpact(baseline(), proposal, { ...input, content: "# 删除用户列表\n\n删除用户列表页面。" }, requirement);
  assert.ok(report.conflicts.some((item) => item.code === "UNCONFIRMED_DELETE" && item.severity === "CONFIRMATION_REQUIRED"));
  assert.equal(report.canProceed, false);
});

test("TC-110-013: 工作流写出影响报告、Diff 并记录 manifest", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "pae-impact-"));
  const project = path.join(root, "base-platform"); const output = path.join(project, "requirements", "REQ-002-user-import");
  await mkdir(path.join(project, "product"), { recursive: true });
  await writeFile(path.join(project, "product", "product-baseline.json"), JSON.stringify(baseline()), "utf8");
  await new ProductDesignWorkflow(new MockStageExecutor()).run(input, output, requirement);
  const [report, diff, manifest] = await Promise.all(["change-impact-report.json", "product-diff.json"].map((name) => readFile(path.join(output, "11-change-impact", name), "utf8")).concat(readFile(path.join(output, "manifest.json"), "utf8")));
  assert.equal(JSON.parse(report).schemaVersion, "1.1"); assert.equal(JSON.parse(diff).schemaVersion, "1.1"); assert.equal(JSON.parse(manifest).changeImpact.baseline.sequence, 1);
});
