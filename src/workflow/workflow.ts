import { randomUUID } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { STAGE_IDS, type StageExecutor, type StageId, type WorkflowContext } from "../domain/types.js";
import {
  buildMasterGoData,
  buildPrototypeManifest,
  renderInteractivePrototypeHtml,
  renderPreviewSvg,
} from "../prototype/bundle.js";

const OUTPUT_FILES: Record<StageId, string> = {
  "requirement-analysis": "01-requirement-analysis.md",
  "product-outline": "02-product-outline.md",
  "product-architecture": "03-product-architecture.md",
  "core-flow": "04-core-flow.md",
  "page-structure": "05-page-structure.md",
  prototype: "06-prototype",
  prd: "07-prd.md",
  review: "08-review.md",
};

const MANAGED_OUTPUT_PATHS = [
  "01-requirement-analysis.md",
  "02-product-outline.md",
  "03-product-architecture.md",
  "04-core-flow.md",
  "05-page-structure.md",
  "06-prototype",
  "06-prototype.json",
  "07-prd.md",
  "08-review.md",
  "manifest.json",
] as const;

export class ProductDesignWorkflow {
  constructor(private readonly executor: StageExecutor) {}

  async run(input: WorkflowContext["input"], outputDirectory: string): Promise<WorkflowContext> {
    const context: WorkflowContext = {
      runId: randomUUID(),
      startedAt: new Date().toISOString(),
      input,
      artifacts: {},
    };

    await mkdir(outputDirectory, { recursive: true });
    // Clear previously generated artifacts so reruns keep the output directory self-consistent.
    await Promise.all(MANAGED_OUTPUT_PATHS.map((target) =>
      rm(path.join(outputDirectory, target), { recursive: true, force: true })
    ));

    const stages: Array<{ id: StageId; status: "completed"; file: string; warnings: string[] }> = [];
    for (const stage of STAGE_IDS) {
      const result = await this.executor.execute(stage, context);
      context.artifacts[stage] = result.artifact as never;
      const file = OUTPUT_FILES[stage];

      if (stage === "prototype") {
        const bundleDirectory = path.join(outputDirectory, file);
        const previewDirectory = path.join(bundleDirectory, "preview");
        const prototype = result.artifact;
        if (typeof prototype === "string") throw new Error("Prototype 阶段必须产出 Prototype DSL");

        const prototypeManifest = buildPrototypeManifest(prototype);
        const masterGoData = buildMasterGoData(prototype);

        await mkdir(previewDirectory, { recursive: true });
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
        });
        continue;
      }

      const body = typeof result.artifact === "string"
        ? result.artifact
        : `${JSON.stringify(result.artifact, null, 2)}\n`;
      await writeFile(path.join(outputDirectory, file), body, "utf8");
      stages.push({ id: stage, status: "completed", file, warnings: result.warnings });
    }

    await writeFile(path.join(outputDirectory, "manifest.json"), `${JSON.stringify({
      engine: "pd-ai-engine",
      version: "0.2.0",
      runId: context.runId,
      startedAt: context.startedAt,
      input: { sourcePath: input.sourcePath, title: input.title },
      stages: stages.map((stage) => stage.id === "prototype"
        ? {
            ...stage,
            type: "directory",
            files: [
              "06-prototype/prototype.json",
              "06-prototype/prototype.html",
              "06-prototype/prototype-manifest.json",
              "06-prototype/mastergo-data.json",
              "06-prototype/preview/",
            ],
          }
        : {
            ...stage,
            type: "file",
          }),
    }, null, 2)}\n`, "utf8");

    return context;
  }
}
