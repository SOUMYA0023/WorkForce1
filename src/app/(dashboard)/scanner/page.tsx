"use client";

import { useState, useRef } from "react";

interface ScanLogEntry {
  time: string;
  code?: string;
  name?: string;
  type?: string;
  status: "SUCCESS" | "REJECTED";
  message: string;
}

export default function ScannerPage() {
  const [tokenInput, setTokenInput] = useState("");
  const [processing, setProcessing] = useState(false);
  const [lastScanResult, setLastScanResult] = useState<{
    success: boolean;
    message: string;
    code?: string;
    details?: any;
  } | null>(null);
  const [sessionLogs, setSessionLogs] = useState<ScanLogEntry[]>([]);

  const inputRef = useRef<HTMLInputElement>(null);

  const handleScanSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tokenInput.trim() || processing) return;

    setProcessing(true);
    setLastScanResult(null);

    const tokenToSubmit = tokenInput.trim();
    setTokenInput("");

    try {
      const res = await fetch("/api/v1/attendance/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: tokenToSubmit }),
      });

      const data = await res.json();
      const nowTime = new Date().toLocaleTimeString();

      if (data.success) {
        const event = data.data.event;
        const successMsg = `Valid ${event.eventType.toUpperCase()} recorded for employee.`;
        setLastScanResult({
          success: true,
          message: successMsg,
          details: data.data,
        });

        setSessionLogs((prev) => [
          {
            time: nowTime,
            type: event.eventType,
            status: "SUCCESS",
            message: successMsg,
          },
          ...prev,
        ]);
      } else {
        const errorMsg = `[${data.error?.code || "ATT_006"}] ${data.error?.message || "Scan Rejected"}`;
        setLastScanResult({
          success: false,
          code: data.error?.code,
          message: errorMsg,
        });

        setSessionLogs((prev) => [
          {
            time: nowTime,
            status: "REJECTED",
            message: errorMsg,
          },
          ...prev,
        ]);
      }
    } catch (err) {
      setLastScanResult({
        success: false,
        message: "Network error submitting scan.",
      });
    } finally {
      setProcessing(false);
      inputRef.current?.focus();
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>Gate Attendance Scanner Point</h1>
          <p style={styles.subtitle}>
            Tamil Nadu Coke and Power — Live Gate Operations Point
          </p>
        </div>
        <div style={styles.badge}>Live Operations</div>
      </div>

      {/* Input Scanner Form */}
      <div style={styles.scanCard}>
        <form onSubmit={handleScanSubmit} style={styles.form}>
          <label style={styles.label}>
            Scan QR Code or Input Payload (Hardware Barcode Reader Active)
          </label>
          <div style={styles.inputRow}>
            <input
              ref={inputRef}
              type="text"
              autoFocus
              value={tokenInput}
              onChange={(e) => setTokenInput(e.target.value)}
              placeholder="Scan QR token here..."
              style={styles.input}
            />
            <button
              type="submit"
              disabled={processing}
              style={styles.scanBtn}
            >
              {processing ? "Validating..." : "Submit Scan"}
            </button>
          </div>
        </form>
      </div>

      {/* High Visibility Feedback Alert Banner */}
      {lastScanResult && (
        <div
          style={{
            ...styles.resultBanner,
            backgroundColor: lastScanResult.success
              ? "rgba(16, 185, 129, 0.2)"
              : "rgba(239, 68, 68, 0.2)",
            borderColor: lastScanResult.success ? "#10b981" : "#ef4444",
            color: lastScanResult.success ? "#6ee7b7" : "#fca5a5",
          }}
        >
          <div style={styles.resultTitle}>
            {lastScanResult.success ? "✓ SCAN VALIDATED" : "✕ SCAN REJECTED"}
          </div>
          <div>{lastScanResult.message}</div>
          {lastScanResult.details?.isLate && (
            <div style={styles.warningTag}>⚠️ LATE ARRIVAL FLAGGED</div>
          )}
          {lastScanResult.details?.isEarlyExit && (
            <div style={styles.warningTag}>⚠️ EARLY EXIT FLAGGED</div>
          )}
        </div>
      )}

      {/* Session Scan Activity Feed */}
      <div style={styles.historyCard}>
        <h3 style={styles.historyTitle}>Live Session Scan History</h3>
        {sessionLogs.length === 0 ? (
          <div style={styles.emptyState}>No scans performed in this session.</div>
        ) : (
          <table style={styles.table}>
            <thead>
              <tr style={styles.thRow}>
                <th style={styles.th}>Time</th>
                <th style={styles.th}>Event Type</th>
                <th style={styles.th}>Status</th>
                <th style={styles.th}>Result Details</th>
              </tr>
            </thead>
            <tbody>
              {sessionLogs.map((log, idx) => (
                <tr key={idx} style={styles.tr}>
                  <td style={styles.tdTime}>{log.time}</td>
                  <td style={styles.td}>{(log.type || "N/A").toUpperCase()}</td>
                  <td style={styles.td}>
                    <span
                      style={{
                        padding: "3px 8px",
                        borderRadius: "4px",
                        fontSize: "11px",
                        fontWeight: 700,
                        backgroundColor:
                          log.status === "SUCCESS"
                            ? "rgba(16, 185, 129, 0.2)"
                            : "rgba(239, 68, 68, 0.2)",
                        color: log.status === "SUCCESS" ? "#10b981" : "#ef4444",
                      }}
                    >
                      {log.status}
                    </span>
                  </td>
                  <td style={styles.td}>{log.message}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    padding: "24px",
    maxWidth: "1200px",
    margin: "0 auto",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "24px",
  },
  title: {
    margin: 0,
    fontSize: "24px",
    color: "#f8fafc",
  },
  subtitle: {
    margin: 0,
    fontSize: "13px",
    color: "#94a3b8",
  },
  badge: {
    backgroundColor: "#10b981",
    color: "#ffffff",
    fontWeight: 700,
    fontSize: "12px",
    padding: "6px 12px",
    borderRadius: "20px",
  },
  scanCard: {
    backgroundColor: "#1e293b",
    border: "1px solid #334155",
    borderRadius: "10px",
    padding: "24px",
    marginBottom: "24px",
  },
  form: {
    display: "flex",
    flexDirection: "column",
    gap: "10px",
  },
  label: {
    fontSize: "14px",
    fontWeight: 600,
    color: "#cbd5e1",
  },
  inputRow: {
    display: "flex",
    gap: "12px",
  },
  input: {
    flex: 1,
    padding: "14px",
    borderRadius: "8px",
    border: "2px solid #3b82f6",
    backgroundColor: "#0f172a",
    color: "#ffffff",
    fontSize: "16px",
    fontWeight: 600,
    outline: "none",
  },
  scanBtn: {
    backgroundColor: "#2563eb",
    color: "#ffffff",
    padding: "0 24px",
    borderRadius: "8px",
    border: "none",
    fontWeight: 700,
    fontSize: "15px",
    cursor: "pointer",
  },
  resultBanner: {
    border: "2px solid",
    borderRadius: "10px",
    padding: "20px",
    marginBottom: "24px",
    fontSize: "15px",
  },
  resultTitle: {
    fontSize: "18px",
    fontWeight: 800,
    marginBottom: "6px",
  },
  warningTag: {
    marginTop: "8px",
    fontSize: "13px",
    fontWeight: 700,
    color: "#f59e0b",
  },
  historyCard: {
    backgroundColor: "#1e293b",
    border: "1px solid #334155",
    borderRadius: "10px",
    padding: "20px",
  },
  historyTitle: {
    margin: "0 0 16px 0",
    fontSize: "16px",
    color: "#f8fafc",
  },
  emptyState: {
    color: "#94a3b8",
    fontSize: "13px",
    textAlign: "center",
    padding: "20px",
  },
  table: {
    width: "100%",
    borderCollapse: "collapse",
    textAlign: "left",
  },
  thRow: {
    borderBottom: "1px solid #334155",
  },
  th: {
    padding: "10px 12px",
    fontSize: "12px",
    color: "#94a3b8",
  },
  tr: {
    borderBottom: "1px solid #334155",
  },
  tdTime: {
    padding: "12px",
    fontSize: "13px",
    fontWeight: 700,
    color: "#3b82f6",
  },
  td: {
    padding: "12px",
    fontSize: "13px",
    color: "#cbd5e1",
  },
};
