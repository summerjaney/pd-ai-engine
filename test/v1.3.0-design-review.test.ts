import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { runDesignReview } from "../src/design-review/service.js";
import { addRequirementSource } from "../src/requirement-sources/service.js";

test("TC-130-006: 机密材料纳入分析被统一检查判定为阻断", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "pae-v130-review-"));
  const source = path.join(root, "secret.txt");
  await writeFile(source, "真实公司机密资料");
  await addRequirementSource(root, source, { type: "other", sensitivity: "confidential", includeInAnalysis: true });
  const output = await runDesignReview(root);
  assert.equal(output.report.status, "FAIL");
  assert.ok(output.report.issues.some((issue) => issue.code === "CONFIDENTIAL_SOURCE_INCLUDED" && issue.level === "BLOCKER"));
});

test("TC-130-007: 既有验证报告的错误和警告被映射为统一问题等级", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "pae-v130-review-"));
  await mkdir(path.join(root, "05-page-plan"), { recursive: true });
  await writeFile(path.join(root, "05-page-plan", "validation-report.json"), JSON.stringify({ valid: false, issues: [{ code: "INVALID_TARGET_PAGE", severity: "error", message: "目标页面不存在" }, { code: "ISOLATED_PAGE", severity: "warning", message: "页面孤立" }] }));
  const output = await runDesignReview(root);
  assert.ok(output.report.issues.some((issue) => issue.code === "INVALID_TARGET_PAGE" && issue.level === "BLOCKER"));
  assert.ok(output.report.issues.some((issue) => issue.code === "ISOLATED_PAGE" && issue.level === "NORMAL"));
});
