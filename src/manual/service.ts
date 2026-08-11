import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import type { PrototypeDsl, RequirementContext } from "../domain/types.js";
import { generateManuals, renderOperationManual, renderProductManual } from "./generator.js";
import type { ManualConsistencyReport, ManualGenerationState, ManualImpactReport, ManualTraceabilityMatrix, OperationManual, ProductManual } from "./types.js";
import { renderManualConsistencyReport, validateManualConsistency } from "./validator.js";

const readJson = async <T>(file: string): Promise<T> => JSON.parse(await readFile(file, "utf8")) as T;
const fingerprint = (value: unknown): string => createHash("sha256").update(JSON.stringify(value) ?? "undefined").digest("hex");

function sourceFingerprints(prototype: PrototypeDsl, prd: string, requirement?: RequirementContext): Record<string, string> {
  return Object.fromEntries([
    ["requirement", fingerprint(requirement)],
    ["prd", fingerprint(prd)],
    ...prototype.pages.map((page) => [`page:${page.id}`, fingerprint(page)] as const),
    ...prototype.rules.map((rule) => [`rule:${rule.id}`, fingerprint(rule)] as const),
    ...prototype.transitions.map((item) => [`transition:${item.sourcePageId}:${item.triggerId}:${item.targetPageId}`, fingerprint(item)] as const),
  ]);
}

async function writeGenerated(root: string, generated: ReturnType<typeof generateManuals>, state: ManualGenerationState): Promise<{ productManualPath: string; operationManualPath: string; traceabilityPath: string }> {
  const productDirectory = path.join(root, "10-product-manual");
  const operationDirectory = path.join(root, "11-operation-manual");
  const deliveryDirectory = path.join(root, "12-delivery");
  await Promise.all([mkdir(productDirectory, { recursive: true }), mkdir(operationDirectory, { recursive: true }), mkdir(deliveryDirectory, { recursive: true })]);
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
    writeFile(path.join(deliveryDirectory, "manual-generation-state.json"), `${JSON.stringify(state, null, 2)}\n`, "utf8"),
  ]);
  return { productManualPath, operationManualPath, traceabilityPath };
}

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
  return writeGenerated(root, generated, { schemaVersion: "0.8", requirementId: requirement?.requirementId, revision: requirement?.revision, sourceFingerprints: sourceFingerprints(prototype, prd, requirement) });
}

export async function updateManualDelivery(requirementDirectory: string): Promise<{ report: ManualImpactReport; reportPath: string }> {
  const root = path.resolve(requirementDirectory);
  const [prototype, prd, previousState, previousProduct, previousOperation] = await Promise.all([
    readJson<PrototypeDsl>(path.join(root, "06-prototype", "prototype.json")),
    readFile(path.join(root, "09-prd.md"), "utf8"),
    readJson<ManualGenerationState>(path.join(root, "12-delivery", "manual-generation-state.json")),
    readJson<ProductManual>(path.join(root, "10-product-manual", "product-manual.json")),
    readJson<OperationManual>(path.join(root, "11-operation-manual", "operation-manual.json")),
  ]);
  let requirement: RequirementContext | undefined;
  try { requirement = await readJson<RequirementContext>(path.join(root, "requirement.json")); } catch {}
  const generated = generateManuals(prototype, prd, requirement);
  const preservedManualNotes: string[] = [];
  const moduleNotes = new Map(previousProduct.modules.filter((item) => item.manualNotes).map((item) => [item.id, item.manualNotes!]));
  for (const item of generated.productManual.modules) if (moduleNotes.has(item.id)) { item.manualNotes = moduleNotes.get(item.id); preservedManualNotes.push(item.id); }
  const ruleNotes = new Map(previousProduct.rules.filter((item) => item.manualNotes).map((item) => [item.id, item.manualNotes!]));
  for (const item of generated.productManual.rules) if (ruleNotes.has(item.id)) { item.manualNotes = ruleNotes.get(item.id); preservedManualNotes.push(`rule:${item.id}`); }
  const operationNotes = new Map(previousOperation.roleGuides.flatMap((guide) => guide.operations).filter((item) => item.manualNotes).map((item) => [item.id, item.manualNotes!]));
  for (const item of generated.operationManual.roleGuides.flatMap((guide) => guide.operations)) if (operationNotes.has(item.id)) { item.manualNotes = operationNotes.get(item.id); preservedManualNotes.push(item.id); }
  const current = sourceFingerprints(prototype, prd, requirement);
  const previousKeys = new Set(Object.keys(previousState.sourceFingerprints));
  const currentKeys = new Set(Object.keys(current));
  const added = [...currentKeys].filter((key) => !previousKeys.has(key)).sort();
  const removed = [...previousKeys].filter((key) => !currentKeys.has(key)).sort();
  const modified = [...currentKeys].filter((key) => previousKeys.has(key) && previousState.sourceFingerprints[key] !== current[key]).sort();
  const report: ManualImpactReport = { schemaVersion: "0.8", requirementId: requirement?.requirementId, previousRevision: previousState.revision, currentRevision: requirement?.revision, changed: added.length + removed.length + modified.length > 0, impact: { added, modified, removed }, preservedManualNotes: [...new Set(preservedManualNotes)].sort() };
  await writeGenerated(root, generated, { schemaVersion: "0.8", requirementId: requirement?.requirementId, revision: requirement?.revision, sourceFingerprints: current });
  const reportPath = path.join(root, "12-delivery", "manual-impact-report.json");
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  return { report, reportPath };
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
