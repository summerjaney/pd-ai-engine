import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { access, mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import test from "node:test";

const execFileAsync = promisify(execFile);
const repoRoot = path.resolve(import.meta.dirname, "..");

test("TC-100-015: 流程审批类真实需求可完成 v1.0.0 正式交付", async () => {
  const outputRoot = await mkdtemp(path.join(os.tmpdir(), "pae-v100-expense-"));
  const requirement = path.join(repoRoot, "examples", "expense-reimbursement.md");

  const { stdout } = await execFileAsync(process.execPath, [
    "--import", "tsx",
    path.join(repoRoot, "src", "cli.ts"),
    "deliver", requirement,
    "--project", "expense-management",
    "--project-name", "费用报销管理系统",
    "--id", "REQ-100",
    "--name", "expense-reimbursement",
    "--product-version", "1.0.0",
    "--output-root", outputRoot,
  ], { cwd: repoRoot, timeout: 120_000, maxBuffer: 10 * 1024 * 1024 });

  const requirementRoot = path.join(
    outputRoot,
    "expense-management",
    "requirements",
    "REQ-100-expense-reimbursement",
  );
  assert.match(stdout, /PAE 正式交付：PASS/);

  await Promise.all([
    access(path.join(requirementRoot, "04-core-flow.md")),
    access(path.join(requirementRoot, "06-prototype", "prototype.json")),
    access(path.join(requirementRoot, "09-prd.md")),
    access(path.join(requirementRoot, "12-delivery", "delivery-summary.md")),
    access(path.join(requirementRoot, "12-delivery", "formal-delivery-package.zip")),
  ]);

  const gate = JSON.parse(await readFile(
    path.join(requirementRoot, "12-delivery", "quality-gate-report.json"),
    "utf8",
  )) as { status: string };
  const run = JSON.parse(await readFile(path.join(requirementRoot, "run.json"), "utf8")) as {
    engineVersion: string;
    status: string;
  };
  assert.equal(gate.status, "PASS");
  assert.equal(run.engineVersion, "1.0.0");
  assert.equal(run.status, "SUCCEEDED");
});
