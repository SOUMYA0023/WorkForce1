"use client";

import { useEffect, useState } from "react";

export default function MonitoringPage() {
  const [stats, setStats] = useState<any>(null);
  const [feed, setFeed] = useState<any[]>([]);
  const [autoPoll, setAutoPoll] = useState(true);
  const [loading, setLoading] = useState(true);

  const fetchMonitoringData = async () => {
    try {
      const res = await fetch("/api/v1/attendance/monitoring");
      const json = await res.json();
      if (json.success) {
        setStats(json.data.stats);
        setFeed(json.data.feed);
      }
    } catch (err) {
      console.error("Failed to fetch monitoring feed", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMonitoringData();
    if (!autoPoll) return;

    const interval = setInterval(() => {
      fetchMonitoringData();
    }, 5000); // 5-second polling interval per ADR §10

    return () => clearInterval(interval);
  }, [autoPoll]);

  return (
    <div style={{ padding: "24px", maxWidth: "1200px", margin: "0 auto", fontFamily: "sans-serif" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px" }}>
        <div>
          <h1 style={{ margin: 0, fontSize: "24px", fontWeight: "bold" }}>Live Gate Monitoring Dashboard</h1>
          <p style={{ margin: "4px 0 0", color: "#666" }}>Real-time gate activity feed & plant headcount status</p>
        </div>
        <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
          <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "14px", cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={autoPoll}
              onChange={(e) => setAutoPoll(e.target.checked)}
            />
            Live Polling (5s)
          </label>
          <button
            onClick={fetchMonitoringData}
            style={{
              padding: "8px 16px",
              backgroundColor: "#2563eb",
              color: "#fff",
              border: "none",
              borderRadius: "6px",
              cursor: "pointer",
              fontWeight: 500,
            }}
          >
            Refresh Feed
          </button>
        </div>
      </div>

      {/* Stats Overview Grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "16px", marginBottom: "32px" }}>
        <div style={{ padding: "20px", backgroundColor: "#f8fafc", borderRadius: "8px", border: "1px solid #e2e8f0" }}>
          <div style={{ color: "#64748b", fontSize: "13px", fontWeight: 600 }}>ACTIVE HEADCOUNT</div>
          <div style={{ fontSize: "28px", fontWeight: "bold", marginTop: "8px", color: "#0f172a" }}>
            {stats ? stats.totalActiveHeadcount : "-"}
          </div>
        </div>

        <div style={{ padding: "20px", backgroundColor: "#f0fdf4", borderRadius: "8px", border: "1px solid #bbf7d0" }}>
          <div style={{ color: "#166534", fontSize: "13px", fontWeight: 600 }}>CHECKED IN</div>
          <div style={{ fontSize: "28px", fontWeight: "bold", marginTop: "8px", color: "#15803d" }}>
            {stats ? stats.checkedInCount : "-"}
          </div>
        </div>

        <div style={{ padding: "20px", backgroundColor: "#eff6ff", borderRadius: "8px", border: "1px solid #bfdbfe" }}>
          <div style={{ color: "#1e40af", fontSize: "13px", fontWeight: 600 }}>CHECKED OUT</div>
          <div style={{ fontSize: "28px", fontWeight: "bold", marginTop: "8px", color: "#1d4ed8" }}>
            {stats ? stats.checkedOutCount : "-"}
          </div>
        </div>

        <div style={{ padding: "20px", backgroundColor: "#fff7ed", borderRadius: "8px", border: "1px solid #fed7aa" }}>
          <div style={{ color: "#9a3412", fontSize: "13px", fontWeight: 600 }}>MISSING CHECK-OUT</div>
          <div style={{ fontSize: "28px", fontWeight: "bold", marginTop: "8px", color: "#c2410c" }}>
            {stats ? stats.missingCheckOutCount : "-"}
          </div>
        </div>

        <div style={{ padding: "20px", backgroundColor: "#faf5ff", borderRadius: "8px", border: "1px solid #e9d5ff" }}>
          <div style={{ color: "#6b21a8", fontSize: "13px", fontWeight: 600 }}>PENDING CORRECTIONS</div>
          <div style={{ fontSize: "28px", fontWeight: "bold", marginTop: "8px", color: "#7e22ce" }}>
            {stats ? stats.pendingCorrectionsCount : "-"}
          </div>
        </div>
      </div>

      {/* Live Activity Feed Table */}
      <div style={{ backgroundColor: "#fff", borderRadius: "8px", border: "1px solid #e2e8f0", overflow: "hidden" }}>
        <div style={{ padding: "16px 20px", borderBottom: "1px solid #e2e8f0", backgroundColor: "#f8fafc" }}>
          <h2 style={{ margin: 0, fontSize: "16px", fontWeight: "bold" }}>Gate Scan Activity Feed</h2>
        </div>

        {loading ? (
          <div style={{ padding: "32px", textAlign: "center", color: "#666" }}>Loading live gate feed...</div>
        ) : feed.length === 0 ? (
          <div style={{ padding: "32px", textAlign: "center", color: "#666" }}>No recent gate scans recorded today.</div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: "14px" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid #e2e8f0", color: "#64748b", fontSize: "12px" }}>
                <th style={{ padding: "12px 20px" }}>TIME</th>
                <th style={{ padding: "12px 20px" }}>EMPLOYEE</th>
                <th style={{ padding: "12px 20px" }}>DEPARTMENT</th>
                <th style={{ padding: "12px 20px" }}>EVENT TYPE</th>
                <th style={{ padding: "12px 20px" }}>SHIFT</th>
                <th style={{ padding: "12px 20px" }}>OPERATOR</th>
              </tr>
            </thead>
            <tbody>
              {feed.map((item) => (
                <tr key={item.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                  <td style={{ padding: "12px 20px", color: "#475569" }}>
                    {new Date(item.eventTimestamp).toLocaleTimeString()}
                  </td>
                  <td style={{ padding: "12px 20px", fontWeight: 500 }}>
                    {item.firstName} {item.lastName} ({item.employeeCode})
                  </td>
                  <td style={{ padding: "12px 20px", color: "#64748b" }}>{item.department}</td>
                  <td style={{ padding: "12px 20px" }}>
                    <span
                      style={{
                        padding: "4px 8px",
                        borderRadius: "4px",
                        fontSize: "12px",
                        fontWeight: 600,
                        backgroundColor: item.eventType === "check_in" ? "#dcfce7" : "#dbeafe",
                        color: item.eventType === "check_in" ? "#15803d" : "#1d4ed8",
                      }}
                    >
                      {item.eventType.toUpperCase().replace("_", " ")}
                    </span>
                  </td>
                  <td style={{ padding: "12px 20px", color: "#64748b" }}>{item.shiftName || "Standard Shift"}</td>
                  <td style={{ padding: "12px 20px", color: "#64748b" }}>{item.validatorName || "Gate Operator"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
