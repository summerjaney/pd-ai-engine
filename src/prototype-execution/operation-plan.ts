import type { MasterGoData } from "../domain/types.js";
import type { MasterGoOperation, MasterGoOperationPlan } from "./types.js";

export function buildMasterGoOperationPlan(
  data: MasterGoData,
  source = "07-mastergo/mastergo-data.json",
  generatedAt = new Date().toISOString(),
): MasterGoOperationPlan {
  const operations: MasterGoOperation[] = [];

  for (const screen of data.screens) {
    const pageOperationId = `page:${screen.id}`;
    const frameOperationId = `frame:${screen.id}`;
    operations.push({
      id: pageOperationId,
      type: "create-page",
      sourceId: screen.id,
      name: screen.name,
      payload: { route: screen.route, pattern: screen.pattern },
    });
    operations.push({
      id: frameOperationId,
      type: "create-frame",
      sourceId: `${screen.id}.frame`,
      parentOperationId: pageOperationId,
      name: screen.name,
      payload: { ...screen.frame },
    });

    for (const node of screen.nodes) {
      const sourceId = node.id.startsWith(`${screen.id}.`) ? node.id : `${screen.id}.${node.id}`;
      operations.push({
        id: `node:${sourceId}`,
        type: "create-node",
        sourceId,
        parentOperationId: frameOperationId,
        name: node.name,
        payload: {
          nodeType: node.type,
          component: node.component,
          description: node.description,
          required: node.required ?? false,
        },
      });
    }
  }

  const pages = operations.filter((operation) => operation.type === "create-page").length;
  const frames = operations.filter((operation) => operation.type === "create-frame").length;
  const nodes = operations.filter((operation) => operation.type === "create-node").length;
  return {
    schemaVersion: "0.1",
    generatedAt,
    source,
    summary: { pages, frames, nodes, totalOperations: operations.length },
    operations,
    warnings: [],
  };
}
