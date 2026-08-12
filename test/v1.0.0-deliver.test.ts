import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { access, mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import test from "node:test";

const execFileAsync = promisify(execFile);
const repoRoot = path.resolve(import.meta.dirname, "..");

test("TC-100-005: deliver 一个命令生成完整正式交付包", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "pae-v100-deliver-"));
  const requirement = path.join(repoRoot, "test", "fixtures", "v0.8.0", "organization-management.md");
  const { stdout } = await execFileAsync(process.execPath, [
    "--import", "tsx",
    path.join(repoRoot, "src", "cli.ts"),
    "deliver", requirement,
    "--project", "base-platform",
    "--project-name", "基础平台",
    "--id", "REQ-100",
    "--name", "organization-management",
    "--product-version", "3.0.0",
    "--output-root", root,
  ], { cwd: repoRoot, timeout: 120_000, maxBuffer: 10 * 1024 * 1024 });
  const requirementRoot = path.join(root, "base-platform", "requirements", "REQ-100-organization-management");
  assert.match(stdout, /PAE 正式交付：PASS/);
  await Promise.all([
    access(path.join(requirementRoot, "10-product-manual", "product-manual.md")),
    access(path.join(requirementRoot, "11-operation-manual", "operation-manual.md")),
    access(path.join(requirementRoot, "12-delivery", "documents", "product-design.docx")),
    access(path.join(requirementRoot, "12-delivery", "documents", "product-design.pdf")),
    access(path.join(requirementRoot, "12-delivery", "formal-delivery-package.zip")),
  ]);
  const validation = JSON.parse(await readFile(path.join(requirementRoot, "12-delivery", "formal-delivery-validation.json"), "utf8")) as { valid: boolean };
  assert.equal(validation.valid, true);
});

test("TC-100-006: deliver 缺少需求身份参数时明确失败", async () => {
  const requirement = path.join(repoRoot, "test", "fixtures", "purchase-request.md");
  await assert.rejects(
    execFileAsync(process.execPath, ["--import", "tsx", path.join(repoRoot, "src", "cli.ts"), "deliver", requirement], { cwd: repoRoot }),
    (error: unknown) => {
      assert.match((error as { stderr?: string }).stderr ?? "", /缺少 --project、--id 或 --name/);
      return true;
    },
  );
});
