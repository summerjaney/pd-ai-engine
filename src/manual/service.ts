import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { PrototypeDsl, RequirementContext } from "../domain/types.js";
import { generateManuals, renderOperationManual, renderProductManual } from "./generator.js";
import type { ManualConsistencyReport, ManualTraceabilityMatrix, OperationManual, ProductManual } from "./types.js";
import { renderManualConsistencyReport, validateManualConsistency } from "./validator.js";

const readJson = async <T>(file: string): Promise<T> => JSON.parse(await readFile(file, "utf8")) as T;

export async function generateManualDelivery(requirementDirectory: string): Promise<{
  productManualPath: string;
  operationManualPath: string;
  traceabilityPath: string;
}> {
  const root = path.resolve(requirementDirectory);
  const prototype = await readJson<PrototypeDsl>(path.join(root, "06-prototype", "prototype.json"));
  const prd = await readFile(path.join(root, "09-prd.md"), "utf8");
  let requirement: RequirementContext | undefined;
  try { requirement = await readJson<RequirementContext>(path.join(root, "requirement.json")); } catch {}
  const generated = generateManuals(prototype, prd, requirement);
  const productDirectory = path.join(root, "10-product-manual");
  const operationDirectory = path.join(root, "11-operation-manual");
  await Promise.all([mkdir(productDirectory, { recursive: true }), mkdir(operationDirectory, { recursive: true })]);
  const productManualPath = path.join(productDirectory, "product-manual.md");
  const operationManualPath = path.join(operationDirectory, "operation-manual.md");
  const traceabilityPath = path.join(productDirectory, "traceability-matrix.json");
  await Promise.all([
    writeFile(productManualPath, renderProductManual(generated.productManual), "utf8"),
    writeFile(path.join(productDirectory, "product-manual.json"), `${JSON.stringify(generated.productManual, null, 2)}\n`, "utf8"),
    writeFile(operationManualPath, renderOperationManual(generated.operationManual), "utf8"),
    writeFile(path.join(operationDirectory, "operation-manual.json"), `${JSON.stringify(generated.operationManual, null, 2)}\n`, "utf8"),
    writeFile(path.join(operationDirectory, "operation-paths.json"), `${JSON.stringify(generated.operationManual.roleGuides, null, 2)}\n`, "utf8"),
    writeFile(traceabilityPath, `${JSON.stringify(generated.traceability, null, 2)}\n`, "utf8"),
  ]);
  return { productManualPath, operationManualPath, traceabilityPath };
}

export async function runManualCheck(requirementDirectory: string): Promise<{
  report: ManualConsistencyReport;
  jsonPath: string;
  markdownPath: string;
}> {
  const root = path.resolve(requirementDirectory);
  const [prototype, productManual, operationManual, traceability] = await Promise.all([
    readJson<PrototypeDsl>(path.join(root, "06-prototype", "prototype.json")),
    readJson<ProductManual>(path.join(root, "10-product-manual", "product-manual.json")),
    readJson<OperationManual>(path.join(root, "11-operation-manual", "operation-manual.json")),
    readJson<ManualTraceabilityMatrix>(path.join(root, "10-product-manual", "traceability-matrix.json")),
  ]);
  const report = validateManualConsistency(prototype, productManual, operationManual, traceability);
  const directory = path.join(root, "12-delivery");
  const jsonPath = path.join(directory, "manual-consistency-report.json");
  const markdownPath = path.join(directory, "manual-consistency-report.md");
  await mkdir(directory, { recursive: true });
  await Promise.all([
    writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8"),
    writeFile(markdownPath, renderManualConsistencyReport(report), "utf8"),
  ]);
  return { report, jsonPath, markdownPath };
}
