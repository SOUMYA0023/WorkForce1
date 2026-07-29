"use client";

import { useState, useCallback } from "react";

/**
 * Reports & Export Dashboard (Phase 5 — RR-001 to RR-010, FR-040 to FR-043)
 *
 * Unified reporting hub with:
 * - Report type selector (all 10 reports)
 * - Date range, department, shift filters (FR-040)
 * - Multi-format export: JSON view, CSV download, XLSX download (FR-041, FR-042)
 * - Paginated results table
 */

const REPORT_TYPES = [
  { id: "daily-attendance", label: "RR-001 Daily Attendance", icon: "📋" },
  { id: "shift-wise", label: "RR-002 Shift-Wise", icon: "🔄" },
  { id: "department-wise", label: "RR-003 Department-Wise", icon: "🏢" },
  { id: "employee-monthly", label: "RR-004 Employee Monthly", icon: "👤" },
  { id: "overtime", label: "RR-005 Overtime", icon: "⏰" },
  { id: "late-arrival", label: "RR-006 Late Arrivals", icon: "🕐" },
  { id: "early-exit", label: "RR-007 Early Exits", icon: "🚪" },
  { id: "payroll-export", label: "RR-008 Payroll Export", icon: "💰" },
  { id: "attendance-exception", label: "RR-009 Exceptions", icon: "⚠️" },
  { id: "audit-log", label: "RR-010 Audit Log", icon: "🔒" },
];

const AUDIT_CATEGORIES = [
  "AUTH",
  "EMPLOYEE",
  "SHIFT",
  "PAYROLL",
  "ATTENDANCE",
  "CORRECTION",
  "CONFIG",
  "SYSTEM",
  "EXPORT",
  "SECURITY",
];

interface ReportMeta {
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
}

export default function ReportsPage() {
  const [selectedReport, setSelectedReport] = useState("daily-attendance");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [department, setDepartment] = useState("");
  const [auditCategory, setAuditCategory] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize] = useState(50);
  const [data, setData] = useState<any[]>([]);
  const [meta, setMeta] = useState<ReportMeta | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const buildQueryString = useCallback(
    (format: string = "json", overridePage?: number) => {
      const params = new URLSearchParams();
      params.set("type", selectedReport);
      params.set("format", format);
      params.set("page", String(overridePage ?? page));
      params.set("pageSize", String(pageSize));
      if (dateFrom) params.set("dateFrom", dateFrom);
      if (dateTo) params.set("dateTo", dateTo);
      if (department) params.set("department", department);
      if (selectedReport === "audit-log" && auditCategory) {
        params.set("category", auditCategory);
      }
      return params.toString();
    },
    [selectedReport, dateFrom, dateTo, department, auditCategory, page, pageSize]
  );

  const fetchReport = useCallback(
    async (overridePage?: number) => {
      setLoading(true);
      setError("");
      try {
        const qs = buildQueryString("json", overridePage);
        const res = await fetch(`/api/v1/reports?${qs}`);
        const json = await res.json();
        if (!json.success) {
          setError(json.error?.message || "Failed to load report.");
          setData([]);
          setMeta(null);
        } else {
          setData(json.data || []);
          setMeta(json.meta || null);
        }
      } catch (e: any) {
        setError(e.message || "Network error.");
      } finally {
        setLoading(false);
      }
    },
    [buildQueryString]
  );

  const downloadFile = useCallback(
    async (format: "csv" | "xlsx") => {
      const qs = buildQueryString(format);
      const res = await fetch(`/api/v1/reports?${qs}`);
      if (!res.ok) {
        setError("Download failed.");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${selectedReport}_${new Date().toISOString().split("T")[0]}.${format}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    },
    [buildQueryString, selectedReport]
  );

  const handlePageChange = (newPage: number) => {
    setPage(newPage);
    fetchReport(newPage);
  };

  const columns = data.length > 0 ? Object.keys(data[0]) : [];

  return (
    <div style={{ padding: "2rem", maxWidth: "1400px", margin: "0 auto" }}>
      <h1 style={{ fontSize: "1.75rem", fontWeight: 700, marginBottom: "1.5rem" }}>
        📊 Enterprise Reports & Export
      </h1>

      {/* Report Type Selector */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
          gap: "0.75rem",
          marginBottom: "1.5rem",
        }}
      >
        {REPORT_TYPES.map((rt) => (
          <button
            key={rt.id}
            id={`report-btn-${rt.id}`}
            onClick={() => {
              setSelectedReport(rt.id);
              setData([]);
              setMeta(null);
              setPage(1);
            }}
            style={{
              padding: "0.75rem",
              border: selectedReport === rt.id ? "2px solid #3b82f6" : "1px solid #d1d5db",
              borderRadius: "8px",
              background: selectedReport === rt.id ? "#eff6ff" : "#fff",
              cursor: "pointer",
              fontSize: "0.85rem",
              fontWeight: selectedReport === rt.id ? 600 : 400,
              textAlign: "left",
            }}
          >
            <span style={{ marginRight: "0.5rem" }}>{rt.icon}</span>
            {rt.label}
          </button>
        ))}
      </div>

      {/* Filters */}
      <div
        style={{
          display: "flex",
          gap: "1rem",
          flexWrap: "wrap",
          marginBottom: "1rem",
          alignItems: "flex-end",
        }}
      >
        <div>
          <label style={{ display: "block", fontSize: "0.8rem", marginBottom: "0.25rem", color: "#6b7280" }}>
            Date From
          </label>
          <input
            id="filter-date-from"
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            style={{ padding: "0.5rem", border: "1px solid #d1d5db", borderRadius: "6px" }}
          />
        </div>
        <div>
          <label style={{ display: "block", fontSize: "0.8rem", marginBottom: "0.25rem", color: "#6b7280" }}>
            Date To
          </label>
          <input
            id="filter-date-to"
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            style={{ padding: "0.5rem", border: "1px solid #d1d5db", borderRadius: "6px" }}
          />
        </div>
        <div>
          <label style={{ display: "block", fontSize: "0.8rem", marginBottom: "0.25rem", color: "#6b7280" }}>
            Department
          </label>
          <input
            id="filter-department"
            type="text"
            placeholder="e.g. Production"
            value={department}
            onChange={(e) => setDepartment(e.target.value)}
            style={{ padding: "0.5rem", border: "1px solid #d1d5db", borderRadius: "6px", width: "150px" }}
          />
        </div>

        {selectedReport === "audit-log" && (
          <div>
            <label style={{ display: "block", fontSize: "0.8rem", marginBottom: "0.25rem", color: "#6b7280" }}>
              Audit Category
            </label>
            <select
              id="filter-audit-category"
              value={auditCategory}
              onChange={(e) => setAuditCategory(e.target.value)}
              style={{ padding: "0.5rem", border: "1px solid #d1d5db", borderRadius: "6px" }}
            >
              <option value="">All Categories</option>
              {AUDIT_CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>
        )}

        <button
          id="btn-run-report"
          onClick={() => {
            setPage(1);
            fetchReport(1);
          }}
          disabled={loading}
          style={{
            padding: "0.5rem 1.5rem",
            background: "#3b82f6",
            color: "#fff",
            border: "none",
            borderRadius: "6px",
            cursor: loading ? "not-allowed" : "pointer",
            fontWeight: 600,
          }}
        >
          {loading ? "Loading..." : "Run Report"}
        </button>

        <button
          id="btn-export-csv"
          onClick={() => downloadFile("csv")}
          style={{
            padding: "0.5rem 1rem",
            background: "#10b981",
            color: "#fff",
            border: "none",
            borderRadius: "6px",
            cursor: "pointer",
            fontWeight: 500,
          }}
        >
          ⬇ CSV
        </button>

        <button
          id="btn-export-xlsx"
          onClick={() => downloadFile("xlsx")}
          style={{
            padding: "0.5rem 1rem",
            background: "#8b5cf6",
            color: "#fff",
            border: "none",
            borderRadius: "6px",
            cursor: "pointer",
            fontWeight: 500,
          }}
        >
          ⬇ XLSX
        </button>
      </div>

      {/* Error */}
      {error && (
        <div
          style={{
            padding: "0.75rem 1rem",
            background: "#fef2f2",
            border: "1px solid #fecaca",
            borderRadius: "8px",
            color: "#dc2626",
            marginBottom: "1rem",
          }}
        >
          {error}
        </div>
      )}

      {/* Results Table */}
      {data.length > 0 && (
        <>
          <div
            style={{
              fontSize: "0.85rem",
              color: "#6b7280",
              marginBottom: "0.5rem",
            }}
          >
            Showing {data.length} of {meta?.totalCount || 0} records (Page{" "}
            {meta?.page || 1} of {meta?.totalPages || 1})
          </div>

          <div style={{ overflowX: "auto", borderRadius: "8px", border: "1px solid #e5e7eb" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
              <thead>
                <tr style={{ background: "#f9fafb" }}>
                  {columns.map((col) => (
                    <th
                      key={col}
                      style={{
                        padding: "0.6rem 0.8rem",
                        textAlign: "left",
                        borderBottom: "2px solid #e5e7eb",
                        fontWeight: 600,
                        whiteSpace: "nowrap",
                      }}
                    >
                      {col.replace(/([A-Z])/g, " $1").replace(/^./, (s) => s.toUpperCase())}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.map((row, i) => (
                  <tr key={i} style={{ borderBottom: "1px solid #f3f4f6" }}>
                    {columns.map((col) => (
                      <td
                        key={col}
                        style={{
                          padding: "0.5rem 0.8rem",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {typeof row[col] === "object" ? JSON.stringify(row[col]) : String(row[col] ?? "")}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {meta && meta.totalPages > 1 && (
            <div
              style={{
                display: "flex",
                justifyContent: "center",
                gap: "0.5rem",
                marginTop: "1rem",
              }}
            >
              <button
                id="btn-prev-page"
                disabled={page <= 1}
                onClick={() => handlePageChange(page - 1)}
                style={{
                  padding: "0.4rem 0.8rem",
                  border: "1px solid #d1d5db",
                  borderRadius: "6px",
                  cursor: page <= 1 ? "not-allowed" : "pointer",
                  background: page <= 1 ? "#f3f4f6" : "#fff",
                }}
              >
                ← Previous
              </button>
              <span style={{ padding: "0.4rem 0.8rem", fontWeight: 500 }}>
                Page {page} of {meta.totalPages}
              </span>
              <button
                id="btn-next-page"
                disabled={page >= meta.totalPages}
                onClick={() => handlePageChange(page + 1)}
                style={{
                  padding: "0.4rem 0.8rem",
                  border: "1px solid #d1d5db",
                  borderRadius: "6px",
                  cursor: page >= meta.totalPages ? "not-allowed" : "pointer",
                  background: page >= meta.totalPages ? "#f3f4f6" : "#fff",
                }}
              >
                Next →
              </button>
            </div>
          )}
        </>
      )}

      {/* Empty state */}
      {!loading && data.length === 0 && !error && (
        <div
          style={{
            textAlign: "center",
            padding: "3rem",
            color: "#9ca3af",
          }}
        >
          Select a report type and click &quot;Run Report&quot; to view data.
        </div>
      )}
    </div>
  );
}
