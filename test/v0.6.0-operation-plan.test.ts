import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import type { MasterGoData } from "../src/domain/types.js";
import { buildMasterGoOperationPlan } from "../src/prototype-execution/operation-plan.js";
import { preparePrototypePush } from "../src/prototype-execution/execution-service.js";

const data: MasterGoData = {
  schemaVersion: "0.2",
  product: { name: "用户管理", description: "管理用户" },
  tokens: { color: {}, spacing: {}, radius: {} },
  screens: [{
    id: "user-list",
    name: "用户列表",
    route: "/users",
    pattern: "list",
    frame: { width: 1440, height: 1024 },
    nodes: [{
      id: "user-list.action.create",
      name: "新增用户",
      type: "action",
      component: "primary-button",
      description: "新增用户操作",
    }],
    interactions: [],
  }],
};

test("TC-060-001: MasterGo 数据生成确定性操作计划", () => {
  const plan = buildMasterGoOperationPlan(data, "fixture.json", "2026-08-07T00:00:00.000Z");
  assert.deepEqual(plan.summary, { pages: 1, frames: 1, nodes: 1, totalOperations: 3 });
  assert.deepEqual(plan.operations.map((item) => item.type), ["create-page", "create-frame", "create-node"]);
  assert.equal(plan.operations[2].parentOperationId, "frame:user-list");
  assert.equal(plan.operations[2].sourceId, "user-list.action.create");
});

test("TC-060-001A: 页面内节点 ID 自动补全页面前缀以避免跨页面冲突", () => {
  const localIdData: MasterGoData = {
    ...data,
    screens: data.screens.map((screen) => ({
      ...screen,
      nodes: [{ ...screen.nodes[0], id: "create" }],
    })),
  };
  const plan = buildMasterGoOperationPlan(localIdData);
  assert.equal(plan.operations[2].id, "node:user-list.create");
  assert.equal(plan.operations[2].sourceId, "user-list.create");
});

test("TC-060-002: dry-run 输出操作计划和明确的未执行结果", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "pae-v060-"));
  const masterGoDirectory = path.join(root, "07-mastergo");
  await mkdir(masterGoDirectory, { recursive: true });
  await writeFile(path.join(masterGoDirectory, "mastergo-data.json"), JSON.stringify(data), "utf8");
  const times = [new Date("2026-08-07T00:00:00.000Z"), new Date("2026-08-07T00:00:01.000Z")];

  const output = await preparePrototypePush(root, { dryRun: true, now: () => times.shift()! });
  const result = JSON.parse(await readFile(output.resultPath, "utf8")) as { status: string; completedOperations: number };
  assert.equal(result.status, "DRY_RUN");
  assert.equal(result.completedOperations, 0);
  assert.match(await readFile(output.planPath, "utf8"), /create-node/);
});

test("TC-060-003: 缺少 MasterGo 数据时在写入前失败", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "pae-v060-missing-"));
  await assert.rejects(
    preparePrototypePush(root, { dryRun: true }),
    /无法读取 MasterGo 适配数据/,
  );
});
