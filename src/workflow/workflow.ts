import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { STAGE_IDS, type StageExecutor, type StageId, type WorkflowContext } from "../domain/types.js";

const OUTPUT_FILES: Record<StageId, string> = {
  "requirement-analysis": "01-requirement-analysis.md",
  "product-outline": "02-product-outline.md",
  "product-architecture": "03-product-architecture.md",
  "core-flow": "04-core-flow.md",
  "page-structure": "05-page-structure.md",
  prototype: "06-prototype.json",
  prd: "07-prd.md",
  review: "08-review.md",
};

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

    const stages: Array<{ id: StageId; status: "completed"; file: string; warnings: string[] }> = [];
    for (const stage of STAGE_IDS) {
      const result = await this.executor.execute(stage, context);
      context.artifacts[stage] = result.artifact as never;
      const file = OUTPUT_FILES[stage];
      const body = typeof result.artifact === "string"
        ? result.artifact
        : `${JSON.stringify(result.artifact, null, 2)}\n`;
      await writeFile(path.join(outputDirectory, file), body, "utf8");
      stages.push({ id: stage, status: "completed", file, warnings: result.warnings });
    }

    await writeFile(path.join(outputDirectory, "manifest.json"), `${JSON.stringify({
      engine: "pd-ai-engine",
      version: "0.1.0",
      runId: context.runId,
      startedAt: context.startedAt,
      input: { sourcePath: input.sourcePath, title: input.title },
      stages,
    }, null, 2)}\n`, "utf8");

    return context;
  }
}
