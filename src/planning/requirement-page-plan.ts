import type {
  PrototypeDsl,
  RequirementContext,
  RequirementDesignContext,
  RequirementInteractionMap,
  RequirementPagePlan,
} from "../domain/types.js";
import { buildPrototypeTransitions } from "../prototype/bundle.js";

const PAGE_FRAME = { width: 1440, height: 1024 } as const;

function pageRoles(prototype: PrototypeDsl, pageId: string): string[] {
  return [...new Set(prototype.navigation
    .filter((item) => item.pageId === pageId)
    .flatMap((item) => item.roles ?? []))];
}

export function buildRequirementPlanningArtifacts(
  prototype: PrototypeDsl,
  requirement?: RequirementContext,
): {
  pagePlan: RequirementPagePlan;
  designContext: RequirementDesignContext;
  interactionMap: RequirementInteractionMap;
} {
  const interactions = prototype.transitions.length > 0
    ? prototype.transitions
    : buildPrototypeTransitions(prototype);

  return {
    pagePlan: {
      schemaVersion: "0.7",
      requirementId: requirement?.requirementId,
      pages: prototype.pages.map((page) => {
        const incoming = interactions.filter((item) => item.targetPageId === page.id);
        const outgoing = interactions.filter((item) => item.sourcePageId === page.id);
        return {
          id: page.id,
          name: page.name,
          type: page.pattern,
          objective: `支持${page.name}相关业务操作`,
          route: page.route,
          upstreamPageIds: [...new Set(incoming.map((item) => item.sourcePageId))],
          downstreamPageIds: [...new Set(outgoing.map((item) => item.targetPageId))],
          triggerActions: outgoing.map((item) => item.triggerLabel),
          roles: pageRoles(prototype, page.id),
          status: "GENERATED",
        };
      }),
    },
    designContext: {
      schemaVersion: "0.7",
      frame: { ...PAGE_FRAME, layout: "horizontal", gap: 120 },
      tokens: prototype.designTokens,
      conventions: {
        pageHeader: true,
        formLabelWidth: 120,
        primaryActionLimit: 1,
        destructiveActionRequiresConfirmation: true,
      },
    },
    interactionMap: {
      schemaVersion: "0.7",
      interactions,
    },
  };
}
