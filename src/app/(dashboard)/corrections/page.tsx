"use client";

import { useEffect, useState } from "react";

export default function CorrectionsPage() {
  const [activeTab, setActiveTab] = useState<"exceptions" | "corrections">("exceptions");
  const [exceptions, setExceptions] = useState<any[]>([]);
  const [correctionsList, setCorrectionsList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Submit Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState("");
  const [correctionType, setCorrectionType] = useState("manual_check_in");
  const [correctedTimestamp, setCorrectedTimestamp] = useState("");
  const [reason, setReason] = useState("");
  const [submitError, setSubmitError] = useState("");
  const [actionMessage, setActionMessage] = useState("");

  const fetchData = async () => {
    setLoading(true);
    try {
      if (activeTab === "exceptions") {
        const res = await fetch("/api/v1/attendance/exceptions");
        const json = await res.json();
        if (json.success) setExceptions(json.data);
      } else {
        const res = await fetch("/api/v1/corrections");
        const json = await res.json();
        if (json.success) setCorrectionsList(json.data);
      }
    } catch (err) {
      console.error("Failed to load page data", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [activeTab]);

  const handleSubmitCorrection = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError("");

    if (!reason.trim()) {
      setSubmitError("Mandatory reason capture required for attendance correction (FR-024).");
      return;
    }

    try {
      const res = await fetch("/api/v1/corrections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employeeId: selectedEmployeeId,
          correctionType,
          correctedTimestamp,
          reason,
        }),
      });

      const json = await res.json();
      if (!json.success) {
        setSubmitError(json.error?.message || "Failed to submit correction request.");
        return;
      }

      setIsModalOpen(false);
      setSelectedEmployeeId("");
      setReason("");
      setActionMessage("Correction request submitted successfully.");
      fetchData();
    } catch (err: any) {
      setSubmitError(err.message || "Failed to submit correction request.");
    }
  };

  const handleApprove = async (correctionId: string) => {
    setActionMessage("");
    try {
      const res = await fetch(`/api/v1/corrections/${correctionId}/approve`, { method: "POST" });
      const json = await res.json();
      if (!json.success) {
        alert(json.error?.message || "Failed to approve correction.");
        return;
      }
      setActionMessage("Correction approved & atomic ledger/payroll recalculation committed.");
      fetchData();
    } catch (err: any) {
      alert("Error approving correction: " + err.message);
    }
  };

  const handleReject = async (correctionId: string) => {
    setActionMessage("");
    try {
      const res = await fetch(`/api/v1/corrections/${correctionId}/reject`, { method: "POST" });
      const json = await res.json();
      if (!json.success) {
        alert(json.error?.message || "Failed to reject correction.");
        return;
      }
      setActionMessage("Correction request rejected.");
      fetchData();
    } catch (err: any) {
      alert("Error rejecting correction: " + err.message);
    }
  };

  return (
    <div style={{ padding: "24px", maxWidth: "1200px", margin: "0 auto", fontFamily: "sans-serif" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px" }}>
        <div>
          <h1 style={{ margin: 0, fontSize: "24px", fontWeight: "bold" }}>Exceptions & Attendance Corrections</h1>
          <p style={{ margin: "4px 0 0", color: "#666" }}>Audit, exception resolution queue, and authorized override workflow</p>
        </div>
        <button
          onClick={() => setIsModalOpen(true)}
          style={{
            padding: "10px 20px",
            backgroundColor: "#2563eb",
            color: "#fff",
            border: "none",
            borderRadius: "6px",
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          + Request Attendance Correction
        </button>
      </div>

      {actionMessage && (
        <div style={{ padding: "12px 16px", backgroundColor: "#f0fdf4", color: "#166534", borderRadius: "6px", marginBottom: "16px", border: "1px solid #bbf7d0" }}>
          {actionMessage}
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: "flex", gap: "8px", borderBottom: "1px solid #e2e8f0", marginBottom: "24px" }}>
        <button
          onClick={() => setActiveTab("exceptions")}
          style={{
            padding: "10px 16px",
            border: "none",
            borderBottom: activeTab === "exceptions" ? "2px solid #2563eb" : "none",
            color: activeTab === "exceptions" ? "#2563eb" : "#64748b",
            fontWeight: activeTab === "exceptions" ? 600 : 400,
            background: "none",
            cursor: "pointer",
          }}
        >
          Attendance Exceptions Queue
        </button>
        <button
          onClick={() => setActiveTab("corrections")}
          style={{
            padding: "10px 16px",
            border: "none",
            borderBottom: activeTab === "corrections" ? "2px solid #2563eb" : "none",
            color: activeTab === "corrections" ? "#2563eb" : "#64748b",
            fontWeight: activeTab === "corrections" ? 600 : 400,
            background: "none",
            cursor: "pointer",
          }}
        >
          Correction Requests Log
        </button>
      </div>

      {/* Tab 1: Exceptions Queue */}
      {activeTab === "exceptions" && (
        <div style={{ backgroundColor: "#fff", borderRadius: "8px", border: "1px solid #e2e8f0", overflow: "hidden" }}>
          {loading ? (
            <div style={{ padding: "32px", textAlign: "center", color: "#666" }}>Scanning exception queue...</div>
          ) : exceptions.length === 0 ? (
            <div style={{ padding: "32px", textAlign: "center", color: "#666" }}>No active attendance exceptions flagged for today.</div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: "14px" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid #e2e8f0", color: "#64748b", fontSize: "12px", backgroundColor: "#f8fafc" }}>
                  <th style={{ padding: "12px 20px" }}>EMPLOYEE</th>
                  <th style={{ padding: "12px 20px" }}>DEPARTMENT</th>
                  <th style={{ padding: "12px 20px" }}>EXCEPTION TYPE</th>
                  <th style={{ padding: "12px 20px" }}>DETAILS</th>
                  <th style={{ padding: "12px 20px" }}>ACTION</th>
                </tr>
              </thead>
              <tbody>
                {exceptions.map((ex: any, idx: number) => (
                  <tr key={idx} style={{ borderBottom: "1px solid #f1f5f9" }}>
                    <td style={{ padding: "12px 20px", fontWeight: 500 }}>
                      {ex.employeeName} ({ex.employeeCode})
                    </td>
                    <td style={{ padding: "12px 20px", color: "#64748b" }}>{ex.department}</td>
                    <td style={{ padding: "12px 20px" }}>
                      <span
                        style={{
                          padding: "4px 8px",
                          borderRadius: "4px",
                          fontSize: "12px",
                          fontWeight: 600,
                          backgroundColor: "#fef2f2",
                          color: "#991b1b",
                        }}
                      >
                        {ex.exceptionType.toUpperCase().replace(/_/g, " ")}
                      </span>
                    </td>
                    <td style={{ padding: "12px 20px", color: "#64748b" }}>
                      {ex.checkInTimestamp ? `Checked in at ${new Date(ex.checkInTimestamp).toLocaleTimeString()}` : "No check-in recorded"}
                    </td>
                    <td style={{ padding: "12px 20px" }}>
                      <button
                        onClick={() => {
                          setSelectedEmployeeId(ex.employeeId);
                          setIsModalOpen(true);
                        }}
                        style={{
                          padding: "6px 12px",
                          backgroundColor: "#f1f5f9",
                          border: "1px solid #cbd5e1",
                          borderRadius: "4px",
                          fontSize: "12px",
                          cursor: "pointer",
                        }}
                      >
                        Resolve Exception
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Tab 2: Corrections Requests Log */}
      {activeTab === "corrections" && (
        <div style={{ backgroundColor: "#fff", borderRadius: "8px", border: "1px solid #e2e8f0", overflow: "hidden" }}>
          {loading ? (
            <div style={{ padding: "32px", textAlign: "center", color: "#666" }}>Loading correction requests...</div>
          ) : correctionsList.length === 0 ? (
            <div style={{ padding: "32px", textAlign: "center", color: "#666" }}>No correction requests submitted yet.</div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: "14px" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid #e2e8f0", color: "#64748b", fontSize: "12px", backgroundColor: "#f8fafc" }}>
                  <th style={{ padding: "12px 20px" }}>EMPLOYEE</th>
                  <th style={{ padding: "12px 20px" }}>TYPE</th>
                  <th style={{ padding: "12px 20px" }}>CORRECTED TIME</th>
                  <th style={{ padding: "12px 20px" }}>REASON (FR-024)</th>
                  <th style={{ padding: "12px 20px" }}>STATUS</th>
                  <th style={{ padding: "12px 20px" }}>ACTIONS</th>
                </tr>
              </thead>
              <tbody>
                {correctionsList.map((item: any) => (
                  <tr key={item.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                    <td style={{ padding: "12px 20px", fontWeight: 500 }}>
                      {item.employeeName} ({item.employeeCode})
                    </td>
                    <td style={{ padding: "12px 20px", color: "#475569" }}>
                      {item.correctionType.replace(/_/g, " ")}
                    </td>
                    <td style={{ padding: "12px 20px", color: "#475569" }}>
                      {new Date(item.correctedTimestamp).toLocaleString()}
                    </td>
                    <td style={{ padding: "12px 20px", color: "#64748b", maxWidth: "250px" }}>
                      {item.reason}
                    </td>
                    <td style={{ padding: "12px 20px" }}>
                      <span
                        style={{
                          padding: "4px 8px",
                          borderRadius: "4px",
                          fontSize: "12px",
                          fontWeight: 600,
                          backgroundColor:
                            item.status === "approved"
                              ? "#dcfce7"
                              : item.status === "rejected"
                              ? "#fee2e2"
                              : "#fef3c7",
                          color:
                            item.status === "approved"
                              ? "#15803d"
                              : item.status === "rejected"
                              ? "#b91c1c"
                              : "#b45309",
                        }}
                      >
                        {item.status.toUpperCase()}
                      </span>
                    </td>
                    <td style={{ padding: "12px 20px" }}>
                      {item.status === "pending" && (
                        <div style={{ display: "flex", gap: "8px" }}>
                          <button
                            onClick={() => handleApprove(item.id)}
                            style={{
                              padding: "4px 10px",
                              backgroundColor: "#16a34a",
                              color: "#fff",
                              border: "none",
                              borderRadius: "4px",
                              fontSize: "12px",
                              cursor: "pointer",
                            }}
                          >
                            Approve
                          </button>
                          <button
                            onClick={() => handleReject(item.id)}
                            style={{
                              padding: "4px 10px",
                              backgroundColor: "#dc2626",
                              color: "#fff",
                              border: "none",
                              borderRadius: "4px",
                              fontSize: "12px",
                              cursor: "pointer",
                            }}
                          >
                            Reject
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Submission Modal */}
      {isModalOpen && (
        <div style={{ position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ backgroundColor: "#fff", padding: "24px", borderRadius: "8px", width: "450px", maxWidth: "90%" }}>
            <h2 style={{ marginTop: 0, fontSize: "18px" }}>Submit Attendance Correction Request</h2>

            {submitError && (
              <div style={{ padding: "10px", backgroundColor: "#fef2f2", color: "#991b1b", borderRadius: "4px", marginBottom: "12px", fontSize: "13px" }}>
                {submitError}
              </div>
            )}

            <form onSubmit={handleSubmitCorrection}>
              <div style={{ marginBottom: "12px" }}>
                <label style={{ display: "block", fontSize: "13px", fontWeight: 600, marginBottom: "4px" }}>
                  Employee ID
                </label>
                <input
                  type="text"
                  required
                  placeholder="UUID or Employee ID"
                  value={selectedEmployeeId}
                  onChange={(e) => setSelectedEmployeeId(e.target.value)}
                  style={{ width: "100%", padding: "8px", borderRadius: "4px", border: "1px solid #cbd5e1" }}
                />
              </div>

              <div style={{ marginBottom: "12px" }}>
                <label style={{ display: "block", fontSize: "13px", fontWeight: 600, marginBottom: "4px" }}>
                  Correction Type
                </label>
                <select
                  value={correctionType}
                  onChange={(e) => setCorrectionType(e.target.value)}
                  style={{ width: "100%", padding: "8px", borderRadius: "4px", border: "1px solid #cbd5e1" }}
                >
                  <option value="manual_check_in">Manual Check-In</option>
                  <option value="manual_check_out">Manual Check-Out</option>
                  <option value="time_adjustment">Time Adjustment</option>
                  <option value="deletion">Deletion / Void Event</option>
                </select>
              </div>

              <div style={{ marginBottom: "12px" }}>
                <label style={{ display: "block", fontSize: "13px", fontWeight: 600, marginBottom: "4px" }}>
                  Corrected Timestamp
                </label>
                <input
                  type="datetime-local"
                  required
                  value={correctedTimestamp}
                  onChange={(e) => setCorrectedTimestamp(e.target.value)}
                  style={{ width: "100%", padding: "8px", borderRadius: "4px", border: "1px solid #cbd5e1" }}
                />
              </div>

              <div style={{ marginBottom: "16px" }}>
                <label style={{ display: "block", fontSize: "13px", fontWeight: 600, marginBottom: "4px" }}>
                  Mandatory Reason Capture (FR-024)
                </label>
                <textarea
                  required
                  rows={3}
                  placeholder="State the explicit administrative reason for this correction..."
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  style={{ width: "100%", padding: "8px", borderRadius: "4px", border: "1px solid #cbd5e1" }}
                />
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px" }}>
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  style={{ padding: "8px 16px", backgroundColor: "#f1f5f9", border: "none", borderRadius: "4px", cursor: "pointer" }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  style={{ padding: "8px 16px", backgroundColor: "#2563eb", color: "#fff", border: "none", borderRadius: "4px", cursor: "pointer", fontWeight: 600 }}
                >
                  Submit Correction
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
