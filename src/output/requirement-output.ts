import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { RequirementContext, RequirementInput } from "../domain/types.js";

export interface RequirementOutputOptions extends RequirementContext {
  outputRoot: string;
}

function safeSegment(value: string, field: string): string {
  const normalized = value.trim().replace(/\s+/g, "-");
  if (!normalized || !/^[A-Za-z0-9._-]+$/.test(normalized) || normalized === "." || normalized === "..") {
    throw new Error(`${field} 只能包含字母、数字、点、下划线和连字符。`);
  }
  return normalized;
}

async function writeIfMissing(filePath: string, content: string): Promise<void> {
  try {
    await access(filePath);
  } catch {
    await writeFile(filePath, content, "utf8");
  }
}

async function updateRequirementIndex(
  indexPath: string,
  requirement: {
    id: string;
    name: string;
    productVersion: string;
    status: string;
  },
): Promise<void> {
  let content: string;
  try {
    content = await readFile(indexPath, "utf8");
  } catch {
    content = `# 需求索引\n\n| 需求编号 | 需求名称 | 产品版本 | 状态 |\n|---|---|---|---|\n`;
  }

  const lines = content.split("\n");
  const existingIndex = lines.findIndex(line => line.startsWith(`| ${requirement.id} `));

  const newRow = `| ${requirement.id} | ${requirement.name} | ${requirement.productVersion} | ${requirement.status} |`;

  if (existingIndex >= 0) {
    lines[existingIndex] = newRow;
  } else {
    lines.push(newRow);
  }

  await writeFile(indexPath, lines.join("\n") + "\n", "utf8");
}

export async function prepareRequirementOutput(
  options: RequirementOutputOptions,
  input: RequirementInput,
): Promise<{ projectDirectory: string; requirementDirectory: string; context: RequirementContext }> {
  const projectId = safeSegment(options.projectId, "project-id");
  const requirementId = safeSegment(options.requirementId.toUpperCase(), "requirement-id");
  const requirementName = safeSegment(options.requirementName, "requirement-name");
  const projectDirectory = path.join(path.resolve(options.outputRoot), projectId);
  const productDirectory = path.join(projectDirectory, "product");
  const requirementDirectory = path.join(projectDirectory, "requirements", `${requirementId}-${requirementName}`);
  const context: RequirementContext = {
    projectId,
    projectName: options.projectName,
    productVersion: options.productVersion,
    requirementId,
    requirementName,
    revision: options.revision,
  };

  await mkdir(productDirectory, { recursive: true });
  await mkdir(requirementDirectory, { recursive: true });
  await writeIfMissing(path.join(projectDirectory, "project.json"), `${JSON.stringify({
    schemaVersion: "0.3",
    projectId,
    projectName: options.projectName,
    productVersion: options.productVersion,
    createdAt: new Date().toISOString(),
  }, null, 2)}\n`);
  await writeIfMissing(path.join(productDirectory, "product-overview.md"), `# ${options.projectName}\n\n> 项目级产品概览。需求评审通过后在此维护产品当前全貌。\n`);
  await writeIfMissing(path.join(productDirectory, "product-architecture.md"), `# 产品总体架构\n\n> 汇总已确认需求对产品架构产生的变更。\n`);
  await writeIfMissing(path.join(productDirectory, "product-roadmap.md"), `# 产品路线图\n\n> 维护产品版本与需求规划。\n`);
  await writeIfMissing(path.join(productDirectory, "requirement-index.md"), `# 需求索引\n\n| 需求编号 | 需求名称 | 产品版本 | 状态 |\n|---|---|---|---|\n`);

  let createdAt = new Date().toISOString();
  try {
    const existing = JSON.parse(await readFile(path.join(requirementDirectory, "requirement.json"), "utf8")) as { createdAt?: string };
    createdAt = existing.createdAt ?? createdAt;
  } catch {}
  await writeFile(path.join(requirementDirectory, "requirement.json"), `${JSON.stringify({
    schemaVersion: "0.3",
    ...context,
    sourcePath: input.sourcePath,
    title: input.title,
    createdAt,
    updatedAt: new Date().toISOString(),
  }, null, 2)}\n`, "utf8");
  await writeFile(path.join(requirementDirectory, "00-requirement-input.md"), input.content, "utf8");

  await updateRequirementIndex(path.join(productDirectory, "requirement-index.md"), {
    id: requirementId,
    name: requirementName,
    productVersion: options.productVersion,
    status: "created",
  });

  return { projectDirectory, requirementDirectory, context };
}
