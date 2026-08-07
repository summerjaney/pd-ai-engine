import { access, cp, mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type { RequirementContext, RequirementInput } from "../domain/types.js";

export interface RequirementOutputOptions extends Omit<RequirementContext, "revision"> {
  outputRoot: string;
  revision?: number;
}

function safeSegment(value: string, field: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error(`${field} 不能为空或仅包含空白字符。`);
  }

  // 拒绝编码后的路径穿越尝试（如 %2e%2e%2f）
  const decoded = decodeURIComponent(trimmed);

  // 拒绝包含路径分隔符的输入
  if (decoded.includes("/") || decoded.includes("\\")) {
    throw new Error(`${field} 不能包含路径分隔符（/ 或 \\）。`);
  }

  // 拒绝路径穿越模式
  if (decoded.includes("..") || decoded === ".") {
    throw new Error(`${field} 不能包含路径穿越序列（. 或 ..）。`);
  }

  // 拒绝绝对路径指示符
  if (decoded.startsWith("~") || decoded.startsWith("$")) {
    throw new Error(`${field} 不能以特殊字符开头（~ 或 $）。`);
  }

  const normalized = decoded.replace(/\s+/g, "-");

  if (!/^[A-Za-z0-9._-]+$/.test(normalized)) {
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

  // 去除尾部空行，避免 push 时在表格分隔符和数据行之间产生多余空行
  const lines = content.split("\n");
  // 移除所有尾部空字符串（来自文件末尾的换行符）
  while (lines.length > 0 && lines[lines.length - 1] === "") {
    lines.pop();
  }

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
  const requirementsDir = path.join(projectDirectory, "requirements");
  const expectedRequirementDirName = `${requirementId}-${requirementName}`;

  // 扫描已有需求目录，按 requirementId 识别同一需求（PAE-030-013）
  // 规则：requirementId 是稳定唯一标识，requirementName 变化时重命名目录而非创建新目录
  let existingRequirementDirName: string | null = null;
  try {
    const entries = await readdir(requirementsDir);
    for (const entry of entries) {
      if (entry.startsWith(`${requirementId}-`)) {
        existingRequirementDirName = entry;
        break;
      }
    }
  } catch {
    // requirements 目录不存在，首次创建
  }

  let requirementDirectory: string;
  if (existingRequirementDirName && existingRequirementDirName !== expectedRequirementDirName) {
    // requirementName 发生变化，安全重命名目录，保持需求身份稳定
    const oldPath = path.join(requirementsDir, existingRequirementDirName);
    requirementDirectory = path.join(requirementsDir, expectedRequirementDirName);
    await rename(oldPath, requirementDirectory);
  } else if (existingRequirementDirName) {
    requirementDirectory = path.join(requirementsDir, existingRequirementDirName);
  } else {
    requirementDirectory = path.join(requirementsDir, expectedRequirementDirName);
  }

  // 读取现有需求配置，确定 revision
  let existingRevision = 0;
  try {
    const existing = JSON.parse(await readFile(path.join(requirementDirectory, "requirement.json"), "utf8")) as { revision?: number };
    existingRevision = typeof existing.revision === "number" && Number.isInteger(existing.revision) && existing.revision >= 1
      ? existing.revision
      : 0;
  } catch {
    // 首次创建，existingRevision 保持为 0
  }

  // 计算最终 revision：
  // 1. 首次生成默认 revision = 1
  // 2. 用户传入 revision 时，不得小于现有 revision（防止版本倒退）
  // 3. 未传入且需求已存在时，自动递增
  let revision: number;
  if (options.revision !== undefined) {
    if (!Number.isInteger(options.revision) || options.revision < 1) {
      throw new Error("revision 必须是大于等于 1 的整数。");
    }
    if (existingRevision > 0 && options.revision <= existingRevision) {
      throw new Error(`revision 必须大于当前版本 (${existingRevision})。`);
    }
    revision = options.revision;
  } else {
    revision = existingRevision > 0 ? existingRevision + 1 : 1;
  }

  const context: RequirementContext = {
    projectId,
    projectName: options.projectName,
    productVersion: options.productVersion,
    requirementId,
    requirementName,
    revision,
  };

  // 重跑前保存上一 revision 的完整设计包，避免成果物和知识追踪被覆盖。
  if (existingRevision > 0) {
    const archiveDirectory = path.join(requirementDirectory, "revisions", `revision-${existingRevision}`);
    await mkdir(archiveDirectory, { recursive: true });
    const entries = await readdir(requirementDirectory);
    await Promise.all(entries
      .filter((entry) => entry !== "revisions")
      .map((entry) => cp(path.join(requirementDirectory, entry), path.join(archiveDirectory, entry), {
        recursive: true,
        force: false,
        errorOnExist: true,
      })));
  }

  await mkdir(productDirectory, { recursive: true });
  await mkdir(requirementDirectory, { recursive: true });

  // 写入或更新 project.json（PAE-030-013 规则 8）
  // projectId 相同但 projectName 变化时：不创建第二个项目，保持目录稳定，更新展示名称
  const projectJsonPath = path.join(projectDirectory, "project.json");
  let projectCreatedAt = new Date().toISOString();
  try {
    const existingProject = JSON.parse(await readFile(projectJsonPath, "utf8")) as { createdAt?: string };
    if (typeof existingProject.createdAt === "string") {
      projectCreatedAt = existingProject.createdAt;
    }
  } catch {
    // 首次创建
  }
  await writeFile(projectJsonPath, `${JSON.stringify({
    schemaVersion: "0.3",
    projectId,
    projectName: options.projectName,
    productVersion: options.productVersion,
    createdAt: projectCreatedAt,
  }, null, 2)}\n`, "utf8");

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
