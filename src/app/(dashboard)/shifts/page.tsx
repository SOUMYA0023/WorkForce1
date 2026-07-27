"use client";

import { useState, useEffect } from "react";

interface Shift {
  id: string;
  name: string;
  startTime: string;
  endTime: string;
  breakDurationSeconds: number;
  lateGraceSeconds: number;
  earlyExitGraceSeconds: number;
  overtimeThresholdSeconds: number;
  isActive: boolean;
}

export default function ShiftsPage() {
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);

  // Form states
  const [name, setName] = useState("");
  const [startTime, setStartTime] = useState("09:00:00");
  const [endTime, setEndTime] = useState("18:00:00");
  const [breakMins, setBreakMins] = useState("60");
  const [lateGraceMins, setLateGraceMins] = useState("10");
  const [earlyGraceMins, setEarlyGraceMins] = useState("10");
  const [otThresholdMins, setOtThresholdMins] = useState("30");
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const fetchShifts = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/v1/shifts");
      const data = await res.json();
      if (res.ok) {
        setShifts(data.data || []);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchShifts();
  }, []);

  const handleCreateShift = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setErrorMsg("");

    try {
      const res = await fetch("/api/v1/shifts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          startTime,
          endTime,
          breakDurationSeconds: (parseInt(breakMins, 10) || 0) * 60,
          lateGraceSeconds: (parseInt(lateGraceMins, 10) || 0) * 60,
          earlyExitGraceSeconds: (parseInt(earlyGraceMins, 10) || 0) * 60,
          overtimeThresholdSeconds: (parseInt(otThresholdMins, 10) || 0) * 60,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.error?.message || "Failed to create shift template.");
        return;
      }

      setShowCreateModal(false);
      setName("");
      fetchShifts();
    } catch (err) {
      setErrorMsg("Network error creating shift template.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>Shift Management Engine</h1>
          <p style={styles.subtitle}>
            Configure policy-driven industrial shifts, grace thresholds, and overtime eligibility windows.
          </p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          style={styles.createBtn}
        >
          + Create Shift Template
        </button>
      </div>

      {loading ? (
        <div style={styles.loadingBox}>Loading shift templates...</div>
      ) : (
        <div style={styles.tableCard}>
          <table style={styles.table}>
            <thead>
              <tr style={styles.thRow}>
                <th style={styles.th}>Shift Name</th>
                <th style={styles.th}>Start Time</th>
                <th style={styles.th}>End Time</th>
                <th style={styles.th}>Break Duration</th>
                <th style={styles.th}>Late Grace</th>
                <th style={styles.th}>Early Exit Grace</th>
                <th style={styles.th}>OT Threshold</th>
                <th style={styles.th}>Status</th>
              </tr>
            </thead>
            <tbody>
              {shifts.map((s) => (
                <tr key={s.id} style={styles.tr}>
                  <td style={styles.tdName}>{s.name}</td>
                  <td style={styles.td}>{s.startTime}</td>
                  <td style={styles.td}>{s.endTime}</td>
                  <td style={styles.td}>{Math.floor(s.breakDurationSeconds / 60)} mins</td>
                  <td style={styles.td}>{Math.floor(s.lateGraceSeconds / 60)} mins</td>
                  <td style={styles.td}>{Math.floor(s.earlyExitGraceSeconds / 60)} mins</td>
                  <td style={styles.td}>{Math.floor(s.overtimeThresholdSeconds / 60)} mins</td>
                  <td style={styles.td}>
                    <span style={styles.activeTag}>ACTIVE</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create Modal */}
      {showCreateModal && (
        <div style={styles.modalOverlay}>
          <div style={styles.modalContent}>
            <div style={styles.modalHeader}>
              <h2 style={styles.modalTitle}>Create Industrial Shift Template</h2>
              <button onClick={() => setShowCreateModal(false)} style={styles.closeBtn}>✕</button>
            </div>

            {errorMsg && <div style={styles.errorAlert}>{errorMsg}</div>}

            <form onSubmit={handleCreateShift} style={styles.form}>
              <div>
                <label style={styles.label}>Shift Template Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Morning General Shift"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  style={styles.input}
                />
              </div>

              <div style={styles.row}>
                <div style={{ flex: 1 }}>
                  <label style={styles.label}>Start Time (HH:mm:ss)</label>
                  <input
                    type="text"
                    required
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    style={styles.input}
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={styles.label}>End Time (HH:mm:ss)</label>
                  <input
                    type="text"
                    required
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                    style={styles.input}
                  />
                </div>
              </div>

              <div style={styles.row}>
                <div style={{ flex: 1 }}>
                  <label style={styles.label}>Break (Mins)</label>
                  <input
                    type="number"
                    value={breakMins}
                    onChange={(e) => setBreakMins(e.target.value)}
                    style={styles.input}
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={styles.label}>Late Grace (Mins)</label>
                  <input
                    type="number"
                    value={lateGraceMins}
                    onChange={(e) => setLateGraceMins(e.target.value)}
                    style={styles.input}
                  />
                </div>
              </div>

              <div style={styles.row}>
                <div style={{ flex: 1 }}>
                  <label style={styles.label}>Early Exit Grace (Mins)</label>
                  <input
                    type="number"
                    value={earlyGraceMins}
                    onChange={(e) => setEarlyGraceMins(e.target.value)}
                    style={styles.input}
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={styles.label}>OT Threshold (Mins)</label>
                  <input
                    type="number"
                    value={otThresholdMins}
                    onChange={(e) => setOtThresholdMins(e.target.value)}
                    style={styles.input}
                  />
                </div>
              </div>

              <div style={styles.modalFooter}>
                <button type="button" onClick={() => setShowCreateModal(false)} style={styles.cancelBtn}>
                  Cancel
                </button>
                <button type="submit" disabled={submitting} style={styles.submitBtn}>
                  {submitting ? "Saving..." : "Save Shift Template"}
                </button>
              </div>
            </form>
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
  createBtn: {
    backgroundColor: "#2563eb",
    color: "#ffffff",
    padding: "10px 18px",
    borderRadius: "8px",
    border: "none",
    fontWeight: 700,
    fontSize: "14px",
    cursor: "pointer",
  },
  loadingBox: {
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
  tdName: {
    padding: "14px 16px",
    fontSize: "14px",
    fontWeight: 700,
    color: "#f8fafc",
  },
  td: {
    padding: "14px 16px",
    fontSize: "13px",
    color: "#cbd5e1",
  },
  activeTag: {
    backgroundColor: "rgba(16, 185, 129, 0.2)",
    color: "#10b981",
    fontWeight: 700,
    fontSize: "11px",
    padding: "3px 8px",
    borderRadius: "4px",
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
  modalContent: {
    backgroundColor: "#1e293b",
    border: "1px solid #334155",
    borderRadius: "12px",
    padding: "24px",
    width: "100%",
    maxWidth: "540px",
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
  errorAlert: {
    backgroundColor: "rgba(239, 68, 68, 0.15)",
    border: "1px solid #ef4444",
    color: "#fca5a5",
    padding: "10px 14px",
    borderRadius: "6px",
    fontSize: "13px",
    marginBottom: "16px",
  },
  form: {
    display: "flex",
    flexDirection: "column",
    gap: "14px",
  },
  row: {
    display: "flex",
    gap: "12px",
  },
  label: {
    display: "block",
    fontSize: "12px",
    color: "#cbd5e1",
    marginBottom: "4px",
    fontWeight: 600,
  },
  input: {
    width: "100%",
    padding: "10px 12px",
    borderRadius: "6px",
    border: "1px solid #475569",
    backgroundColor: "#0f172a",
    color: "#ffffff",
    fontSize: "14px",
  },
  modalFooter: {
    display: "flex",
    justifyContent: "flex-end",
    gap: "10px",
    marginTop: "10px",
  },
  cancelBtn: {
    padding: "8px 16px",
    borderRadius: "6px",
    border: "1px solid #475569",
    backgroundColor: "transparent",
    color: "#cbd5e1",
    cursor: "pointer",
  },
  submitBtn: {
    padding: "8px 18px",
    borderRadius: "6px",
    border: "none",
    backgroundColor: "#2563eb",
    color: "#ffffff",
    fontWeight: 700,
    cursor: "pointer",
  },
};
