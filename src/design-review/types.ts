export const DESIGN_REVIEW_SCHEMA_VERSION = "1.3" as const;

export type DesignReviewLevel = "BLOCKER" | "IMPORTANT" | "NORMAL" | "SUGGESTION";

export interface DesignReviewIssue {
  code: string;
  level: DesignReviewLevel;
  source: string;
  message: string;
  artifact?: string;
}

export interface DesignReviewReport {
  schemaVersion: typeof DESIGN_REVIEW_SCHEMA_VERSION;
  generatedAt: string;
  status: "PASS" | "FAIL" | "PENDING";
  summary: Record<DesignReviewLevel, number> & { total: number };
  checks: Array<{ id: string; status: "PASS" | "FAIL" | "PENDING" | "NOT_AVAILABLE"; issueCount: number }>;
  issues: DesignReviewIssue[];
}
