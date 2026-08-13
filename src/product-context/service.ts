import { createHash } from "node:crypto";
import type { RequirementInput } from "../domain/types.js";
import { loadProductBaseline } from "../product-baseline/service.js";
import type { ProductBaseline, ProductBaselineSource } from "../product-baseline/types.js";
import { PRODUCT_CONTEXT_SCHEMA_VERSION, type ProductContextReference, type ProductContextSelection } from "./types.js";

function terms(value: string): Set<string> {
  const normalized = value.toLowerCase();
  const result = new Set(normalized.match(/[a-z0-9][a-z0-9_-]+|[\p{Script=Han}]{2,}/gu) ?? []);
  for (const chunk of normalized.match(/[\p{Script=Han}]{2,}/gu) ?? []) {
    for (let size = 2; size <= Math.min(4, chunk.length); size++) {
      for (let index = 0; index <= chunk.length - size; index++) result.add(chunk.slice(index, index + size));
    }
  }
  return result;
}

function relevance(queryTerms: Set<string>, ...values: string[]): number {
  const candidate = terms(values.join(" "));
  let score = 0;
  for (const term of candidate) if (queryTerms.has(term)) score += term.length >= 4 ? 2 : 1;
  return score;
}

function reference(kind: ProductContextReference["kind"], id: string, name: string, source: ProductBaselineSource, score: number, parentId?: string): ProductContextReference {
  return { kind, id, name, parentId, score, source };
}

export function selectProductContext(baseline: ProductBaseline, input: RequirementInput): ProductContextSelection {
  const queryTerms = terms(`${input.title}\n${input.content}`);
  const selected: ProductContextReference[] = [];
  let candidateCount = 0;

  for (const page of baseline.pages) {
    const pageScore = relevance(queryTerms, page.id, page.name, page.route);
    candidateCount++;
    if (pageScore >= 2) selected.push(reference("page", page.id, page.name, page.source, pageScore));
    for (const field of page.fields) {
      candidateCount++;
      const score = relevance(queryTerms, field.id, field.name, page.name);
      if (score >= 2) selected.push(reference("field", field.id, field.name, field.source, score, page.id));
    }
    for (const action of page.actions) {
      candidateCount++;
      const score = relevance(queryTerms, action.id, action.name, page.name);
      if (score >= 2) selected.push(reference("action", action.id, action.name, action.source, score, page.id));
    }
  }
  for (const module of baseline.modules) {
    candidateCount++;
    const score = relevance(queryTerms, module.id, module.name);
    if (score >= 2 || selected.some((item) => item.parentId === module.entryPageId || item.id === module.entryPageId)) {
      selected.push(reference("module", module.id, module.name, module.source, Math.max(1, score)));
    }
  }
  for (const rule of baseline.rules) {
    candidateCount++;
    const score = relevance(queryTerms, rule.id, rule.description);
    if (score >= 2 || rule.appliesTo.some((id) => selected.some((item) => item.id === id || item.parentId === id))) {
      selected.push(reference("rule", rule.id, rule.description, rule.source, Math.max(1, score)));
    }
  }

  selected.sort((left, right) => right.score - left.score || left.kind.localeCompare(right.kind) || left.id.localeCompare(right.id));
  return {
    schemaVersion: PRODUCT_CONTEXT_SCHEMA_VERSION,
    baseline: {
      projectId: baseline.project.id,
      productVersion: baseline.product.version,
      sequence: baseline.baseline.sequence,
      hash: baseline.baseline.hash,
    },
    query: { fingerprint: createHash("sha256").update(input.content).digest("hex") },
    selected,
    omittedCount: candidateCount - selected.length,
  };
}

export async function loadRelevantProductContext(projectDirectory: string, input: RequirementInput): Promise<ProductContextSelection | undefined> {
  const baseline = await loadProductBaseline(projectDirectory);
  return baseline ? selectProductContext(baseline, input) : undefined;
}
