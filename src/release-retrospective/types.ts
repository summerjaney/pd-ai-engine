export interface ActualMetricResult { id: string; value: string; source: string; observationWindow: string; }
export interface ReleaseRetrospectiveInput { results: ActualMetricResult[]; note?: string; }
export interface ReleaseRetrospective {
  schemaVersion: "1.9";
  productVersion: string;
  objectiveHash: string;
  recordedAt: string;
  recordedBy: "product-manager";
  results: Array<ActualMetricResult & { metricName: string; target: string; assessment: "met" | "not-met" | "needs-review"; suggestion: string }>;
  note?: string;
}
