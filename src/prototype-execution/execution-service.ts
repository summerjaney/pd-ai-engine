import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { MasterGoData } from "../domain/types.js";
import { buildMasterGoOperationPlan } from "./operation-plan.js";
import type { MasterGoExecutionResult } from "./types.js";

export interface PrototypePushOptions {
  dryRun: boolean;
  now?: () => Date;
}

export interface PrototypePushOutput {
  planPath: string;
  resultPath: string;
  result: MasterGoExecutionResult;
}

export async function preparePrototypePush(
  requirementDirectory: string,
  options: PrototypePushOptions,
): Promise<PrototypePushOutput> {
  const masterGoDirectory = path.join(requirementDirectory, "07-mastergo");
  const sourcePath = path.join(masterGoDirectory, "mastergo-data.json");
  let data: MasterGoData;
  try {
    data = JSON.parse(await readFile(sourcePath, "utf8")) as MasterGoData;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`无法读取 MasterGo 适配数据：${sourcePath}\n${reason}`);
  }
  if (data.schemaVersion !== "0.2" || !Array.isArray(data.screens) || data.screens.length === 0) {
    throw new Error("MasterGo 适配数据无效：schemaVersion 必须为 0.2，且 screens 不能为空。");
  }

  const now = options.now ?? (() => new Date());
  const startedAt = now().toISOString();
  const plan = buildMasterGoOperationPlan(data, "07-mastergo/mastergo-data.json", startedAt);
  await mkdir(masterGoDirectory, { recursive: true });
  const planPath = path.join(masterGoDirectory, "mastergo-operation-plan.json");
  await writeFile(planPath, `${JSON.stringify(plan, null, 2)}\n`, "utf8");

  if (!options.dryRun) {
    throw new Error("当前批次仅支持 --dry-run；真实 MasterGo MCP 执行器将在连接契约验证后启用。");
  }

  const completedAt = now().toISOString();
  const result: MasterGoExecutionResult = {
    schemaVersion: "0.1",
    status: "DRY_RUN",
    startedAt,
    completedAt,
    totalOperations: plan.summary.totalOperations,
    completedOperations: 0,
    mappings: [],
    warnings: ["dry-run 未调用 MasterGo MCP，也未修改画布。"],
    errors: [],
  };
  const resultPath = path.join(masterGoDirectory, "mastergo-result.json");
  await writeFile(resultPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  return { planPath, resultPath, result };
}
