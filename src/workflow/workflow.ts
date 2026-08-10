import { randomUUID } from "node:crypto";
import { mkdir, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { STAGE_IDS, type KnowledgeMode, type MasterGoData, type MasterGoResult, type PrototypeDsl, type RequirementContext, type StageExecutor, type StageId, type StageResult, type WorkflowContext } from "../domain/types.js";
import { readEngineVersion } from "../version.js";
import { KnowledgeLoader } from "../knowledge/loader.js";
import { KnowledgeSelector } from "../knowledge/selector.js";
import { KnowledgeComplianceValidator } from "../knowledge/compliance-validator.js";
import {
  buildMasterGoData,
  buildPrototypeManifest,
  renderInteractivePrototypeHtml,
  renderPreviewSvg,
} from "../prototype/bundle.js";
import { buildRequirementPlanningArtifacts } from "../planning/requirement-page-plan.js";
import { renderPagePlanValidationReport, validateRequirementPagePlan } from "../planning/page-plan-validator.js";

const OUTPUT_FILES: Record<StageId, string> = {
  "requirement-analysis": "01-requirement-analysis.md",
  "product-outline": "02-product-outline.md",
  "product-architecture": "03-product-architecture.md",
  "core-flow": "04-core-flow.md",
  "page-structure": "05-page-structure.md",
  prototype: "06-prototype",
  mastergo: "07-mastergo",
  "prototype-confirmation": "08-prototype-confirmation.json",
  prd: "09-prd.md",
  review: "10-review.md",
};

const MANAGED_OUTPUT_PATHS = [
  "01-requirement-analysis.md",
  "02-product-outline.md",
  "03-product-architecture.md",
  "04-core-flow.md",
  "05-page-structure.md",
  "05-page-plan",
  "06-prototype",
  "06-prototype.json",
  "07-mastergo",
  "08-prototype-confirmation.json",
  "09-prd.md",
  "10-review.md",
  "99-debug",
  "manifest.json",
] as const;

async function collectDebugArtifacts(outputDirectory: string): Promise<string[]> {
  const debugDirectory = path.join(outputDirectory, "99-debug");
  try {
    const entries = await readdir(debugDirectory);
    return entries
      .filter((entry) => entry.endsWith(".json"))
      .sort()
      .map((entry) => `99-debug/${entry}`);
  } catch {
    return [];
  }
}

export class ProductDesignWorkflow {
  constructor(
    private readonly executor: StageExecutor,
    private readonly knowledgeLoader = new KnowledgeLoader(),
    private readonly knowledgeSelector = new KnowledgeSelector(),
    private readonly complianceValidator = new KnowledgeComplianceValidator(),
  ) {}

  async run(input: WorkflowContext["input"], outputDirectory: string, requirement?: RequirementContext, options: { knowledgeMode?: KnowledgeMode } = {}): Promise<WorkflowContext> {
    this.validateInput(input);
    
    const context: WorkflowContext = {
      runId: randomUUID(),
      startedAt: new Date().toISOString(),
      input,
      artifacts: {},
      requirement,
      stageResults: [],
      outputDirectory,
    };
    const knowledgeCatalog = await this.knowledgeLoader.load();
    const knowledgeMode = options.knowledgeMode ?? "auto";
    context.knowledge = {
      catalog: knowledgeCatalog,
      selection: knowledgeMode === "off" ? {
        catalogVersion: knowledgeCatalog.version,
        selectedKnowledge: [],
      } : this.knowledgeSelector.select(knowledgeCatalog, {
        text: input.content,
        metadata: requirement ? {
          projectName: requirement.projectName,
          requirementName: requirement.requirementName,
        } : undefined,
      }),
    };

    await mkdir(outputDirectory, { recursive: true });
    await Promise.all(MANAGED_OUTPUT_PATHS.map((target) =>
      rm(path.join(outputDirectory, target), { recursive: true, force: true })
    ));

    const stages: Array<{
      id: StageId;
      status: "completed" | "failed" | "skipped";
      file?: string;
      warnings?: string[];
      error?: string;
      generation?: StageResult["generationMetadata"];
    }> = [];
    let hasFailed = false;

    for (const stage of STAGE_IDS) {
      if (hasFailed) {
        stages.push({ id: stage, status: "skipped" });
        context.stageResults!.push({ id: stage, status: "skipped" });
        continue;
      }

      let result;
      try {
        result = await this.executor.execute(stage, context);
        if (stage === "prototype") {
          const compliance = this.complianceValidator.validatePrototype(
            result.artifact as PrototypeDsl,
            context.knowledge!.catalog,
            context.knowledge!.selection,
          );
          context.knowledgeCompliance = compliance;
          if (!compliance.valid) {
            const debugDirectory = path.join(outputDirectory, "99-debug");
            await mkdir(debugDirectory, { recursive: true });
            await Promise.all([
              writeFile(
                path.join(debugDirectory, "prototype-rejected.json"),
                `${JSON.stringify(result.artifact, null, 2)}\n`,
                "utf8",
              ),
              writeFile(
                path.join(debugDirectory, "prototype-compliance.json"),
                `${JSON.stringify(compliance, null, 2)}\n`,
                "utf8",
              ),
            ]);
            throw new Error(this.complianceValidator.formatErrors(compliance));
          }
        }
        if (stage === "review" && context.knowledgeCompliance && typeof result.artifact === "string"
          && !result.artifact.includes("## 知识合规矩阵")) {
          result.artifact = `${result.artifact.trim()}\n\n## 知识合规矩阵\n\n${this.complianceValidator.formatMatrix(context.knowledgeCompliance)}\n`;
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        stages.push({ id: stage, status: "failed", error: errorMessage });
        context.stageResults!.push({ id: stage, status: "failed", error: errorMessage });
        hasFailed = true;
        continue;
      }

      context.artifacts[stage] = result.artifact as never;
      const file = OUTPUT_FILES[stage];

      try {
        if (stage === "prototype") {
          const bundleDirectory = path.join(outputDirectory, file);
          const previewDirectory = path.join(bundleDirectory, "preview");
          const prototype = result.artifact as PrototypeDsl;

          const prototypeManifest = buildPrototypeManifest(prototype);
          const masterGoData = buildMasterGoData(prototype);
          const planning = buildRequirementPlanningArtifacts(prototype, requirement);
          const planningValidation = validateRequirementPagePlan(planning.pagePlan, planning.interactionMap, prototype.navigation);
          const pagePlanDirectory = path.join(outputDirectory, "05-page-plan");

          await Promise.all([
            mkdir(previewDirectory, { recursive: true }),
            mkdir(pagePlanDirectory, { recursive: true }),
          ]);
          await Promise.all([
            writeFile(path.join(pagePlanDirectory, "page-plan.json"), `${JSON.stringify(planning.pagePlan, null, 2)}\n`, "utf8"),
            writeFile(path.join(pagePlanDirectory, "design-context.json"), `${JSON.stringify(planning.designContext, null, 2)}\n`, "utf8"),
            writeFile(path.join(pagePlanDirectory, "interaction-map.json"), `${JSON.stringify(planning.interactionMap, null, 2)}\n`, "utf8"),
            writeFile(path.join(pagePlanDirectory, "validation-report.json"), `${JSON.stringify(planningValidation, null, 2)}\n`, "utf8"),
            writeFile(path.join(pagePlanDirectory, "validation-report.md"), renderPagePlanValidationReport(planningValidation), "utf8"),
          ]);
          await writeFile(path.join(bundleDirectory, "prototype.json"), `${JSON.stringify(prototype, null, 2)}\n`, "utf8");
          await writeFile(
            path.join(bundleDirectory, "prototype-manifest.json"),
            `${JSON.stringify(prototypeManifest, null, 2)}\n`,
            "utf8",
          );
          await writeFile(path.join(bundleDirectory, "mastergo-data.json"), `${JSON.stringify(masterGoData, null, 2)}\n`, "utf8");
          await writeFile(path.join(bundleDirectory, "prototype.html"), renderInteractivePrototypeHtml(prototype, prototypeManifest), "utf8");

          for (const page of prototype.pages) {
            await writeFile(path.join(previewDirectory, `${page.id}.svg`), renderPreviewSvg(page, prototype.product.name), "utf8");
          }

          stages.push({
            id: stage,
            status: "completed",
            file: file,
            warnings: result.warnings,
            generation: result.generationMetadata,
          });
          context.stageResults!.push({ id: stage, status: "completed", file, warnings: result.warnings });
          continue;
        }

        if (stage === "mastergo") {
          const mastergoDirectory = path.join(outputDirectory, file);
          const mastergoArtifact = result.artifact as { data: MasterGoData; result?: MasterGoResult };

          await mkdir(mastergoDirectory, { recursive: true });
          await writeFile(path.join(mastergoDirectory, "mastergo-data.json"), `${JSON.stringify(mastergoArtifact.data, null, 2)}\n`, "utf8");
          if (mastergoArtifact.result) {
            await writeFile(path.join(mastergoDirectory, "mastergo-result.json"), `${JSON.stringify(mastergoArtifact.result, null, 2)}\n`, "utf8");
          }

          stages.push({
            id: stage,
            status: "completed",
            file: file,
            warnings: result.warnings,
            generation: result.generationMetadata,
          });
          context.stageResults!.push({ id: stage, status: "completed", file, warnings: result.warnings });
          continue;
        }

        const body = typeof result.artifact === "string"
          ? result.artifact
          : `${JSON.stringify(result.artifact, null, 2)}\n`;
        await writeFile(path.join(outputDirectory, file), body, "utf8");
        stages.push({
          id: stage,
          status: "completed",
          file,
          warnings: result.warnings,
          generation: result.generationMetadata,
        });
        context.stageResults!.push({ id: stage, status: "completed", file, warnings: result.warnings });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        stages.push({ id: stage, status: "failed", file, error: errorMessage });
        context.stageResults!.push({ id: stage, status: "failed", file, error: errorMessage });
        hasFailed = true;
      }
    }

    const manifestContent = JSON.stringify({
      engine: "pd-ai-engine",
      version: await readEngineVersion(),
      runId: context.runId,
      startedAt: context.startedAt,
      finishedAt: new Date().toISOString(),
      status: hasFailed ? "failed" : "completed",
      input: { sourcePath: input.sourcePath, title: input.title },
      requirement,
      knowledge: {
        mode: knowledgeMode,
        knowledgeCatalogVersion: context.knowledge.selection.catalogVersion,
        selectedKnowledge: context.knowledge.selection.selectedKnowledge,
        compliance: context.knowledgeCompliance,
      },
      stages: stages.map((stage) => {
        if (stage.status === "skipped") {
          return { id: stage.id, status: "skipped" };
        }
        if (stage.status === "failed") {
          return { id: stage.id, status: "failed", error: stage.error };
        }
        if (stage.id === "prototype") {
          return {
            ...stage,
            type: "directory",
            files: [
              "06-prototype/prototype.json",
              "06-prototype/prototype.html",
              "06-prototype/prototype-manifest.json",
              "06-prototype/mastergo-data.json",
              "06-prototype/preview/",
              "05-page-plan/page-plan.json",
              "05-page-plan/design-context.json",
              "05-page-plan/interaction-map.json",
              "05-page-plan/validation-report.json",
              "05-page-plan/validation-report.md",
            ],
          };
        }
        if (stage.id === "mastergo") {
          return {
            ...stage,
            type: "directory",
            files: [
              "07-mastergo/mastergo-data.json",
              "07-mastergo/mastergo-result.json",
            ],
          };
        }
        return {
          ...stage,
          type: "file",
        };
      }),
      debugArtifacts: await collectDebugArtifacts(outputDirectory),
    }, null, 2);

    await writeFile(path.join(outputDirectory, "manifest.json"), `${manifestContent}\n`, "utf8");

    if (hasFailed) {
      throw new Error("工作流执行失败，部分阶段未能完成");
    }

    return context;
  }

  private validateInput(input: WorkflowContext["input"]): void {
    const trimmed = input.content.trim();
    if (!trimmed) {
      throw new Error(`需求文件内容无效：${path.basename(input.sourcePath)}\n请至少提供非空的一级标题和需求正文。`);
    }

    const heading = input.content.match(/^#\s+(.+)$/m)?.[1]?.trim();
    if (!heading) {
      throw new Error(`需求文件缺少有效标题：${path.basename(input.sourcePath)}\n请提供以 "# " 开头的一级标题。`);
    }

    const body = input.content.replace(/^#\s+.+$/m, "").trim();
    if (!body) {
      throw new Error(`需求文件缺少正文内容：${path.basename(input.sourcePath)}\n请在标题下方提供需求正文。`);
    }
  }
}
