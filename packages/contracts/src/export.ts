export const EXPORT_LIMITS = { maxRows: 10_000, batchSize: 1_000 } as const;

export interface ExportTooLargeDetails {
  total: number;
  maxRows: number;
}
