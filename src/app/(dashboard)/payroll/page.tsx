"use client";

import { useState, useEffect } from "react";

interface PayrollRecord {
  id: string;
  employeeCode: string;
  firstName: string;
  lastName: string;
  department: string;
  periodDate: string;
  scheduledSeconds: number;
  actualWorkedSeconds: number;
  overtimeSeconds: number;
  undertimeSeconds: number;
  lateArrivalSeconds: number;
  earlyExitSeconds: number;
  isFinalized: boolean;
}

interface CalculationTrace {
  payrollRecordId: string;
  employeeId: string;
  periodDate: string;
  plantTimezone: string;
  policySnapshot: { baseUnit: string; overtimeThresholdSeconds: number };
  sourceEventIds: string[];
  checkInTimestamp: string | null;
  checkOutTimestamp: string | null;
  scheduledSeconds: number;
  actualWorkedSeconds: number;
  breakSeconds: number;
  netWorkedSeconds: number;
  overtimeSeconds: number;
  undertimeSeconds: number;
  lateArrivalSeconds: number;
  earlyExitSeconds: number;
  status: string;
}

export default function PayrollPage() {
  const [records, setRecords] = useState<PayrollRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTrace, setActiveTrace] = useState<CalculationTrace | null>(null);
  const [traceLoading, setTraceLoading] = useState(false);

  const fetchPayroll = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/v1/payroll");
      const data = await res.json();
      if (res.ok) {
        setRecords(data.data || []);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPayroll();
  }, []);

  const handleExplainTrace = async (id: string) => {
    setTraceLoading(true);
    try {
      const res = await fetch(`/api/v1/payroll/explain/${id}`);
      const data = await res.json();
      if (res.ok) {
        setActiveTrace(data.data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setTraceLoading(false);
    }
  };

  // Metrics summary
  const totalWorkedHrs = (records.reduce((acc, r) => acc + (r.actualWorkedSeconds || 0), 0) / 3600).toFixed(1);
  const totalOtHrs = (records.reduce((acc, r) => acc + (r.overtimeSeconds || 0), 0) / 3600).toFixed(1);
  const totalLateMins = Math.floor(records.reduce((acc, r) => acc + (r.lateArrivalSeconds || 0), 0) / 60);

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>Payroll & Attendance Intelligence</h1>
          <p style={styles.subtitle}>
            Time-Based Industrial Payroll Records & Deterministic Explainable Calculation Traces
          </p>
        </div>
        <div style={styles.exportRow}>
          <a
            href="/api/v1/export/payroll?format=csv"
            download
            style={styles.exportBtnCsv}
          >
            📥 Export CSV
          </a>
          <a
            href="/api/v1/export/payroll?format=xlsx"
            download
            style={styles.exportBtnXlsx}
          >
            📊 Export XLSX
          </a>
        </div>
      </div>

      {/* Metric Cards */}
      <div style={styles.cardsRow}>
        <div style={styles.card}>
          <div style={styles.cardVal}>{totalWorkedHrs} hrs</div>
          <div style={styles.cardLbl}>Total Worked Duration</div>
        </div>
        <div style={styles.card}>
          <div style={{ ...styles.cardVal, color: "#10b981" }}>{totalOtHrs} hrs</div>
          <div style={styles.cardLbl}>Total Overtime Duration</div>
        </div>
        <div style={styles.card}>
          <div style={{ ...styles.cardVal, color: "#f59e0b" }}>{totalLateMins} mins</div>
          <div style={styles.cardLbl}>Total Late Deductions</div>
        </div>
      </div>

      {loading ? (
        <div style={styles.loadingBox}>Loading payroll records...</div>
      ) : records.length === 0 ? (
        <div style={styles.emptyCard}>
          No payroll records generated yet. Scanned check-in/outs will auto-generate daily records.
        </div>
      ) : (
        <div style={styles.tableCard}>
          <table style={styles.table}>
            <thead>
              <tr style={styles.thRow}>
                <th style={styles.th}>Employee</th>
                <th style={styles.th}>Department</th>
                <th style={styles.th}>Date</th>
                <th style={styles.th}>Scheduled</th>
                <th style={styles.th}>Actual Worked</th>
                <th style={styles.th}>Overtime</th>
                <th style={styles.th}>Late Arrival</th>
                <th style={styles.th}>Explain</th>
              </tr>
            </thead>
            <tbody>
              {records.map((r) => (
                <tr key={r.id} style={styles.tr}>
                  <td style={styles.tdEmp}>
                    <div>{r.firstName} {r.lastName}</div>
                    <div style={styles.subCode}>{r.employeeCode}</div>
                  </td>
                  <td style={styles.td}>{r.department}</td>
                  <td style={styles.tdDate}>{r.periodDate}</td>
                  <td style={styles.td}>{(r.scheduledSeconds / 3600).toFixed(1)} hrs</td>
                  <td style={styles.td}>{(r.actualWorkedSeconds / 3600).toFixed(1)} hrs</td>
                  <td style={styles.td}>
                    {r.overtimeSeconds > 0 ? (
                      <span style={styles.otTag}>+{(r.overtimeSeconds / 3600).toFixed(1)} hrs</span>
                    ) : (
                      "0 hrs"
                    )}
                  </td>
                  <td style={styles.td}>
                    {r.lateArrivalSeconds > 0 ? (
                      <span style={styles.lateTag}>{Math.floor(r.lateArrivalSeconds / 60)} mins</span>
                    ) : (
                      "On Time"
                    )}
                  </td>
                  <td style={styles.td}>
                    <button
                      onClick={() => handleExplainTrace(r.id)}
                      style={styles.explainBtn}
                    >
                      🔍 Explain Trace
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Explainable Calculation Trace Drawer / Modal */}
      {activeTrace && (
        <div style={styles.modalOverlay}>
          <div style={styles.traceContent}>
            <div style={styles.modalHeader}>
              <h2 style={styles.modalTitle}>Explainable Calculation Trace</h2>
              <button onClick={() => setActiveTrace(null)} style={styles.closeBtn}>✕</button>
            </div>

            <div style={styles.traceBox}>
              <div style={styles.traceGrid}>
                <div><strong>Record ID:</strong> {activeTrace.payrollRecordId}</div>
                <div><strong>Period Date:</strong> {activeTrace.periodDate}</div>
                <div><strong>Plant Timezone:</strong> {activeTrace.plantTimezone}</div>
                <div><strong>Base Calculation Unit:</strong> {activeTrace.policySnapshot.baseUnit}</div>
                <div><strong>Classification Status:</strong> <span style={styles.statusBadge}>{activeTrace.status.toUpperCase()}</span></div>
              </div>

              <hr style={styles.hr} />

              <h4 style={styles.sectionTitle}>Timestamp & Calculation Breakdown</h4>
              <div style={styles.traceMathList}>
                <div>• <strong>Check-In Timestamp:</strong> {activeTrace.checkInTimestamp || "N/A"}</div>
                <div>• <strong>Check-Out Timestamp:</strong> {activeTrace.checkOutTimestamp || "N/A"}</div>
                <div>• <strong>Gross Scheduled Seconds:</strong> {activeTrace.scheduledSeconds}s ({(activeTrace.scheduledSeconds / 3600).toFixed(2)} hrs)</div>
                <div>• <strong>Break Duration Deducted:</strong> {activeTrace.breakSeconds}s ({Math.floor(activeTrace.breakSeconds / 60)} mins)</div>
                <div>• <strong>Actual Worked Seconds:</strong> {activeTrace.actualWorkedSeconds}s ({(activeTrace.actualWorkedSeconds / 3600).toFixed(2)} hrs)</div>
                <div>• <strong>Net Worked Seconds:</strong> {activeTrace.netWorkedSeconds}s ({(activeTrace.netWorkedSeconds / 3600).toFixed(2)} hrs)</div>
                <div>• <strong>Overtime Seconds Computed:</strong> {activeTrace.overtimeSeconds}s ({(activeTrace.overtimeSeconds / 3600).toFixed(2)} hrs)</div>
                <div>• <strong>Late Arrival Seconds:</strong> {activeTrace.lateArrivalSeconds}s ({Math.floor(activeTrace.lateArrivalSeconds / 60)} mins)</div>
              </div>

              <hr style={styles.hr} />

              <h4 style={styles.sectionTitle}>Source Event Trace</h4>
              <div style={styles.sourceList}>
                {activeTrace.sourceEventIds.map((id) => (
                  <div key={id} style={styles.sourceTag}>Event UUID: {id}</div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
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
  exportRow: {
    display: "flex",
    gap: "10px",
  },
  exportBtnCsv: {
    backgroundColor: "#334155",
    color: "#ffffff",
    padding: "8px 14px",
    borderRadius: "6px",
    textDecoration: "none",
    fontWeight: 600,
    fontSize: "13px",
  },
  exportBtnXlsx: {
    backgroundColor: "#10b981",
    color: "#ffffff",
    padding: "8px 14px",
    borderRadius: "6px",
    textDecoration: "none",
    fontWeight: 600,
    fontSize: "13px",
  },
  cardsRow: {
    display: "flex",
    gap: "16px",
    marginBottom: "24px",
  },
  card: {
    flex: 1,
    backgroundColor: "#1e293b",
    border: "1px solid #334155",
    borderRadius: "10px",
    padding: "20px",
  },
  cardVal: {
    fontSize: "24px",
    fontWeight: 800,
    color: "#3b82f6",
    marginBottom: "4px",
  },
  cardLbl: {
    fontSize: "12px",
    color: "#94a3b8",
  },
  loadingBox: {
    padding: "40px",
    textAlign: "center",
    color: "#94a3b8",
  },
  emptyCard: {
    backgroundColor: "#1e293b",
    border: "1px solid #334155",
    borderRadius: "10px",
    padding: "40px",
    textAlign: "center",
    color: "#94a3b8",
  },
  tableCard: {
    backgroundColor: "#1e293b",
    border: "1px solid #334155",
    borderRadius: "10px",
    overflow: "hidden",
  },
  table: {
    width: "100%",
    borderCollapse: "collapse",
    textAlign: "left",
  },
  thRow: {
    borderBottom: "1px solid #334155",
    backgroundColor: "#0f172a",
  },
  th: {
    padding: "12px 16px",
    fontSize: "12px",
    color: "#94a3b8",
  },
  tr: {
    borderBottom: "1px solid #334155",
  },
  tdEmp: {
    padding: "12px 16px",
    fontSize: "14px",
    fontWeight: 700,
    color: "#f8fafc",
  },
  subCode: {
    fontSize: "11px",
    color: "#94a3b8",
    fontWeight: 400,
  },
  td: {
    padding: "12px 16px",
    fontSize: "13px",
    color: "#cbd5e1",
  },
  tdDate: {
    padding: "12px 16px",
    fontSize: "13px",
    fontWeight: 700,
    color: "#3b82f6",
  },
  otTag: {
    color: "#10b981",
    fontWeight: 700,
  },
  lateTag: {
    color: "#f59e0b",
    fontWeight: 700,
  },
  explainBtn: {
    backgroundColor: "#3b82f6",
    color: "#ffffff",
    border: "none",
    padding: "6px 12px",
    borderRadius: "4px",
    fontSize: "12px",
    fontWeight: 600,
    cursor: "pointer",
  },
  modalOverlay: {
    position: "fixed",
    inset: 0,
    backgroundColor: "rgba(0, 0, 0, 0.75)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 100,
  },
  traceContent: {
    backgroundColor: "#1e293b",
    border: "1px solid #334155",
    borderRadius: "12px",
    padding: "24px",
    width: "100%",
    maxWidth: "680px",
  },
  modalHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "16px",
  },
  modalTitle: {
    margin: 0,
    fontSize: "18px",
    color: "#f8fafc",
  },
  closeBtn: {
    background: "none",
    border: "none",
    color: "#94a3b8",
    fontSize: "18px",
    cursor: "pointer",
  },
  traceBox: {
    backgroundColor: "#0f172a",
    borderRadius: "8px",
    padding: "16px",
    fontSize: "13px",
    color: "#cbd5e1",
  },
  traceGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: "10px",
  },
  statusBadge: {
    backgroundColor: "#2563eb",
    color: "#ffffff",
    padding: "2px 8px",
    borderRadius: "4px",
    fontWeight: 700,
    fontSize: "11px",
  },
  hr: {
    borderColor: "#334155",
    margin: "16px 0",
  },
  sectionTitle: {
    margin: "0 0 10px 0",
    color: "#f8fafc",
    fontSize: "14px",
  },
  traceMathList: {
    display: "flex",
    flexDirection: "column",
    gap: "6px",
  },
  sourceList: {
    display: "flex",
    flexWrap: "wrap",
    gap: "8px",
  },
  sourceTag: {
    backgroundColor: "#1e293b",
    border: "1px solid #334155",
    padding: "4px 8px",
    borderRadius: "4px",
    fontSize: "11px",
    color: "#94a3b8",
  },
};
