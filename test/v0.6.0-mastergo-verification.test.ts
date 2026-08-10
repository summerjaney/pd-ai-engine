import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { verifyMasterGoCanvas } from "../src/integrations/mastergo/verification.js";

async function fixture(status = "PENDING_VERIFICATION", pageStatus = "PENDING_VERIFICATION") {
  const root = await mkdtemp(path.join(os.tmpdir(), "pae-mastergo-verify-"));
  const directory = path.join(root, "07-mastergo");
  await mkdir(directory);
  await writeFile(path.join(directory, "mastergo-write-result.json"), JSON.stringify({
    schemaVersion: "0.3", status, verificationRequired: true,
    pages: [{ screenId: "P1", screenName: "用户列表页", status: pageStatus }],
  }));
  return root;
}

test("TC-060-020: 人工画布核验后将待验证结果回写为 PASS", async () => {
  const root = await fixture();
  const output = await verifyMasterGoCanvas(root, "P1、P2 页面截图与可编辑图层已核验", () => new Date("2026-08-07T06:00:00.000Z"));
  assert.equal(output.status, "PASS");
  const result = JSON.parse(await readFile(output.resultPath, "utf8"));
  assert.equal(result.status, "PASS");
  assert.equal(result.verificationRequired, false);
  assert.equal(result.pages[0].status, "PASS");
  assert.equal(result.verification.method, "manual-canvas-review");
  assert.match(result.verification.evidence, /可编辑图层/);
});

test("TC-060-021: 非待验证结果或缺少证据时禁止回写 PASS", async () => {
  const passed = await fixture("PASS", "PASS");
  await assert.rejects(verifyMasterGoCanvas(passed, "重复验收"), /仅允许回写 PENDING_VERIFICATION/);
  const pending = await fixture();
  await assert.rejects(verifyMasterGoCanvas(pending, "  "), /必须提供 --evidence/);
});

test("TC-060-022: 存在失败页面时禁止人工覆盖为 PASS", async () => {
  const root = await fixture("PENDING_VERIFICATION", "FAIL");
  await assert.rejects(verifyMasterGoCanvas(root, "画布截图"), /存在未受理或失败页面/);
});

test("TC-070-012: 支持逐页验收并仅在全部页面完成后汇总 PASS", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "pae-mastergo-page-verify-"));
  const directory = path.join(root, "07-mastergo");
  await mkdir(directory);
  await writeFile(path.join(directory, "mastergo-write-result.json"), JSON.stringify({
    schemaVersion: "0.4", status: "PENDING_VERIFICATION", verificationRequired: true,
    pages: [{ screenId: "P1", status: "PENDING_VERIFICATION" }, { screenId: "P2", status: "PENDING_VERIFICATION" }],
  }));
  const first = await verifyMasterGoCanvas(root, "P1 截图及图层检查通过", () => new Date("2026-08-10T01:00:00.000Z"), "P1");
  assert.equal(first.status, "PENDING_VERIFICATION");
  let result = JSON.parse(await readFile(first.resultPath, "utf8"));
  assert.deepEqual(result.pages.map((page: any) => page.status), ["VERIFIED", "PENDING_VERIFICATION"]);
  assert.match(result.pages[0].verification.evidence, /P1/);
  const second = await verifyMasterGoCanvas(root, "P2 截图及图层检查通过", () => new Date("2026-08-10T01:10:00.000Z"), "P2");
  assert.equal(second.status, "PASS");
  result = JSON.parse(await readFile(second.resultPath, "utf8"));
  assert.equal(result.verificationRequired, false);
  assert.deepEqual(result.pages.map((page: any) => page.status), ["VERIFIED", "VERIFIED"]);
});

test("TC-070-020: 逐页验收支持 P1 简写匹配 P1-user-list", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "pae-mastergo-page-alias-"));
  const directory = path.join(root, "07-mastergo");
  await mkdir(directory);
  await writeFile(path.join(directory, "mastergo-write-result.json"), JSON.stringify({
    schemaVersion: "0.4", status: "PENDING_VERIFICATION", verificationRequired: true,
    pages: [{ screenId: "P1-user-list", screenName: "用户列表", status: "PENDING_VERIFICATION" }],
  }));
  const output = await verifyMasterGoCanvas(root, "P1 画布核验通过", () => new Date("2026-08-10T02:00:00.000Z"), "P1");
  assert.equal(output.status, "PASS");
  const result = JSON.parse(await readFile(output.resultPath, "utf8"));
  assert.equal(result.pages[0].screenId, "P1-user-list");
  assert.equal(result.pages[0].status, "VERIFIED");
});
