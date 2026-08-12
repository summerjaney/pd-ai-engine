import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import test from "node:test";
import { diagnosePae } from "../src/diagnostics/doctor.js";

const execFileAsync = promisify(execFile);
const repoRoot = path.resolve(import.meta.dirname, "..");

test("TC-100-012: pae doctor 输出可操作的环境诊断", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "pae-v100-doctor-"));
  const report = await diagnosePae({ cwd: root, nodeVersion: "20.11.0", now: () => new Date(0) });
  assert.notEqual(report.status, "NOT_READY");
  assert.equal(report.checkedAt, new Date(0).toISOString());
  assert.equal(report.checks.find((item) => item.id === "node")?.status, "PASS");
  assert.equal(report.checks.find((item) => item.id === "output")?.status, "PASS");
});

test("TC-100-013: deliver 生成 Release 门禁与正式交付总览", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "pae-v100-gate-"));
  const requirement = path.join(repoRoot, "test", "fixtures", "purchase-request.md");
  await execFileAsync(process.execPath, ["--import", "tsx", path.join(repoRoot, "src", "cli.ts"), "deliver", requirement, "--project", "gate-project", "--id", "REQ-GATE", "--name", "purchase", "--output-root", root], { cwd: repoRoot, timeout: 120_000, maxBuffer: 10 * 1024 * 1024 });
  const delivery = path.join(root, "gate-project", "requirements", "REQ-GATE-purchase", "12-delivery");
  const gate = JSON.parse(await readFile(path.join(delivery, "quality-gate-report.json"), "utf8")) as { status: string };
  assert.equal(gate.status, "PASS");
  assert.match(await readFile(path.join(delivery, "delivery-summary.md"), "utf8"), /REQ-GATE/);
  assert.doesNotReject(readFile(path.join(delivery, "traceability-matrix.json"), "utf8"));
});

test("TC-100-014: Release 门禁可发现运行状态被篡改", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "pae-v100-gate-fail-"));
  const requirement = path.join(repoRoot, "test", "fixtures", "purchase-request.md");
  await execFileAsync(process.execPath, ["--import", "tsx", path.join(repoRoot, "src", "cli.ts"), "deliver", requirement, "--project", "gate-fail", "--id", "REQ-FAIL", "--name", "purchase", "--output-root", root], { cwd: repoRoot, timeout: 120_000, maxBuffer: 10 * 1024 * 1024 });
  const requirementRoot = path.join(root, "gate-fail", "requirements", "REQ-FAIL-purchase");
  const runPath = path.join(requirementRoot, "run.json");
  const run = JSON.parse(await readFile(runPath, "utf8")) as { status: string };
  run.status = "FAILED";
  await writeFile(runPath, `${JSON.stringify(run, null, 2)}\n`, "utf8");
  await assert.rejects(execFileAsync(process.execPath, ["--import", "tsx", path.join(repoRoot, "src", "cli.ts"), "validate", requirementRoot, "--level", "release"], { cwd: repoRoot }), (error: unknown) => {
    assert.match((error as { stdout?: string }).stdout ?? "", /Release 质量门禁：FAIL/);
    return true;
  });
});
