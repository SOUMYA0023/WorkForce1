/**
 * Attendance Operations Observability & Metrics Tracker (Refinement #11)
 *
 * Records operational counters and timing metrics for future dashboards:
 * - QR tokens generated
 * - Successful attendance scans
 * - Rejected scans (by error code)
 * - Replay attempts (ATT_005)
 * - Expired token attempts (ATT_004)
 * - Duplicate attendance attempts (ATT_001 / ATT_003)
 * - Average scan processing duration (ms)
 */

interface AttendanceMetrics {
  tokensGenerated: number;
  scansSucceeded: number;
  scansRejected: number;
  rejectionsByCode: Record<string, number>;
  totalScanDurationMs: number;
  scanCount: number;
}

const metrics: AttendanceMetrics = {
  tokensGenerated: 0,
  scansSucceeded: 0,
  scansRejected: 0,
  rejectionsByCode: {},
  totalScanDurationMs: 0,
  scanCount: 0,
};

export function recordTokenGenerated() {
  metrics.tokensGenerated++;
}

export function recordScanSuccess(durationMs: number) {
  metrics.scansSucceeded++;
  metrics.scanCount++;
  metrics.totalScanDurationMs += durationMs;
}

export function recordScanRejection(errorCode: string, durationMs: number) {
  metrics.scansRejected++;
  metrics.scanCount++;
  metrics.totalScanDurationMs += durationMs;
  metrics.rejectionsByCode[errorCode] = (metrics.rejectionsByCode[errorCode] || 0) + 1;
}

export function getAttendanceMetricsSnapshot() {
  return {
    ...metrics,
    avgScanDurationMs:
      metrics.scanCount > 0
        ? Math.round(metrics.totalScanDurationMs / metrics.scanCount)
        : 0,
  };
}
