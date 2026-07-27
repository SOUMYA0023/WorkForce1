"use client";

import { useState, useEffect } from "react";

interface Employee {
  id: string;
  employeeCode: string;
  firstName: string;
  lastName: string;
  department: string;
  designation: string;
  email?: string | null;
  phoneNumber?: string | null;
  status: "active" | "inactive" | "suspended" | "terminated" | "on_leave";
  joinedAt: string;
}

interface Stats {
  totalEmployees: number;
  activeEmployees: number;
  inactiveEmployees: number;
  totalFailedImportRecords: number;
  recentImports: any[];
}

export default function EmployeesDashboardPage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [department, setDepartment] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  // Modals
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);

  // Single Employee Form State
  const [formData, setFormData] = useState({
    employeeCode: "",
    firstName: "",
    lastName: "",
    department: "",
    designation: "",
    email: "",
    phoneNumber: "",
    status: "active",
    joinedAt: new Date().toISOString().split("T")[0],
  });
  const [formError, setFormError] = useState("");
  const [formSubmitting, setFormSubmitting] = useState(false);

  // Bulk Import State
  const [importFile, setImportFile] = useState<File | null>(null);
  const [isDryRun, setIsDryRun] = useState(true);
  const [importing, setImporting] = useState(false);
  const [importReport, setImportReport] = useState<any | null>(null);

  const fetchStats = async () => {
    try {
      const res = await fetch("/api/v1/employees/stats");
      const data = await res.json();
      if (data.success) {
        setStats(data.data);
      }
    } catch (e) {
      console.error("Failed to load stats", e);
    }
  };

  const fetchEmployees = async () => {
    setLoading(true);
    try {
      const queryParams = new URLSearchParams({
        page: String(page),
        limit: "10",
        ...(search ? { search } : {}),
        ...(department ? { department } : {}),
        ...(status ? { status } : {}),
      });

      const res = await fetch(`/api/v1/employees?${queryParams.toString()}`);
      const data = await res.json();

      if (data.success) {
        setEmployees(data.data);
        setTotalPages(data.meta.totalPages || 1);
      }
    } catch (e) {
      console.error("Failed to fetch employees", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
  }, []);

  useEffect(() => {
    fetchEmployees();
  }, [page, search, department, status]);

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormSubmitting(true);
    setFormError("");

    try {
      const res = await fetch("/api/v1/employees", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      const data = await res.json();

      if (!res.ok) {
        setFormError(data.error?.message || "Failed to create employee.");
        setFormSubmitting(false);
        return;
      }

      // Success
      setShowCreateModal(false);
      setFormData({
        employeeCode: "",
        firstName: "",
        lastName: "",
        department: "",
        designation: "",
        email: "",
        phoneNumber: "",
        status: "active",
        joinedAt: new Date().toISOString().split("T")[0],
      });
      fetchEmployees();
      fetchStats();
    } catch (err) {
      setFormError("Network error while creating employee.");
    } finally {
      setFormSubmitting(false);
    }
  };

  const handleSoftDelete = async (id: string, code: string) => {
    if (!confirm(`Are you sure you want to soft-delete employee ${code}?`)) return;

    try {
      const res = await fetch(`/api/v1/employees/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (data.success) {
        fetchEmployees();
        fetchStats();
      } else {
        alert(data.error?.message || "Deletion failed.");
      }
    } catch (e) {
      alert("Error deleting employee.");
    }
  };

  const handleImportSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!importFile) return;

    setImporting(true);
    setImportReport(null);

    const data = new FormData();
    data.append("file", importFile);

    try {
      const res = await fetch(
        `/api/v1/employees/import?dryRun=${isDryRun ? "true" : "false"}`,
        {
          method: "POST",
          body: data,
        }
      );

      const result = await res.json();
      if (result.success) {
        setImportReport(result.data);
        if (!isDryRun) {
          fetchEmployees();
          fetchStats();
        }
      } else {
        alert(result.error?.message || "Import failed.");
      }
    } catch (err) {
      alert("Network error during bulk import.");
    } finally {
      setImporting(false);
    }
  };

  return (
    <div style={styles.pageContainer}>
      {/* Top Navbar */}
      <div style={styles.topNav}>
        <div>
          <h1 style={styles.brandTitle}>WorkForce One</h1>
          <span style={styles.brandSub}>Enterprise Employee Master Data</span>
        </div>
        <div style={styles.navActions}>
          <button
            onClick={() => setShowImportModal(true)}
            style={styles.secondaryBtn}
          >
            Bulk Import (CSV/XLSX)
          </button>
          <button
            onClick={() => setShowCreateModal(true)}
            style={styles.primaryBtn}
          >
            + Add Employee
          </button>
        </div>
      </div>

      {/* Metric Cards */}
      <div style={styles.metricsGrid}>
        <div style={styles.metricCard}>
          <span style={styles.metricLabel}>Total Employees</span>
          <span style={styles.metricValue}>
            {stats ? stats.totalEmployees : "-"}
          </span>
        </div>
        <div style={styles.metricCard}>
          <span style={styles.metricLabel}>Active Employees</span>
          <span style={{ ...styles.metricValue, color: "#10b981" }}>
            {stats ? stats.activeEmployees : "-"}
          </span>
        </div>
        <div style={styles.metricCard}>
          <span style={styles.metricLabel}>Inactive / Leave</span>
          <span style={{ ...styles.metricValue, color: "#f59e0b" }}>
            {stats ? stats.inactiveEmployees : "-"}
          </span>
        </div>
        <div style={styles.metricCard}>
          <span style={styles.metricLabel}>Failed Import Records</span>
          <span style={{ ...styles.metricValue, color: "#ef4444" }}>
            {stats ? stats.totalFailedImportRecords : "-"}
          </span>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div style={styles.filterBar}>
        <input
          type="text"
          placeholder="Search by Code, Name, Dept, Designation, Email, Phone..."
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          style={styles.searchInput}
        />

        <select
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
          style={styles.selectInput}
        >
          <option value="">All Lifecycle Statuses</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
          <option value="suspended">Suspended</option>
          <option value="terminated">Terminated</option>
          <option value="on_leave">On Leave</option>
        </select>
      </div>

      {/* Employees Table */}
      <div style={styles.tableCard}>
        {loading ? (
          <div style={styles.loadingContainer}>Loading employee records...</div>
        ) : employees.length === 0 ? (
          <div style={styles.emptyContainer}>No employee records found.</div>
        ) : (
          <table style={styles.table}>
            <thead>
              <tr style={styles.tableHeaderRow}>
                <th style={styles.th}>Code</th>
                <th style={styles.th}>Name</th>
                <th style={styles.th}>Department</th>
                <th style={styles.th}>Designation</th>
                <th style={styles.th}>Email / Phone</th>
                <th style={styles.th}>Status</th>
                <th style={styles.th}>Joined Date</th>
                <th style={styles.th}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {employees.map((emp) => (
                <tr key={emp.id} style={styles.tableRow}>
                  <td style={styles.tdCode}>{emp.employeeCode}</td>
                  <td style={styles.tdName}>
                    {emp.firstName} {emp.lastName}
                  </td>
                  <td style={styles.td}>{emp.department}</td>
                  <td style={styles.td}>{emp.designation}</td>
                  <td style={styles.tdSub}>
                    <div>{emp.email || "-"}</div>
                    <div style={{ fontSize: "11px", color: "#94a3b8" }}>
                      {emp.phoneNumber || ""}
                    </div>
                  </td>
                  <td style={styles.td}>
                    <StatusBadge status={emp.status} />
                  </td>
                  <td style={styles.td}>{emp.joinedAt}</td>
                  <td style={styles.td}>
                    <button
                      onClick={() => handleSoftDelete(emp.id, emp.employeeCode)}
                      style={styles.dangerLinkBtn}
                    >
                      Soft Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* Pagination */}
        <div style={styles.paginationRow}>
          <button
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            style={styles.paginationBtn}
          >
            Previous
          </button>
          <span style={styles.paginationText}>
            Page {page} of {totalPages}
          </span>
          <button
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
            style={styles.paginationBtn}
          >
            Next
          </button>
        </div>
      </div>

      {/* CREATE EMPLOYEE MODAL */}
      {showCreateModal && (
        <div style={styles.modalOverlay}>
          <div style={styles.modalContent}>
            <div style={styles.modalHeader}>
              <h3>Add New Employee</h3>
              <button
                onClick={() => setShowCreateModal(false)}
                style={styles.closeBtn}
              >
                ×
              </button>
            </div>

            {formError && <div style={styles.errorAlert}>{formError}</div>}

            <form onSubmit={handleCreateSubmit} style={styles.modalForm}>
              <div style={styles.formGrid}>
                <div>
                  <label style={styles.label}>Employee Code *</label>
                  <input
                    type="text"
                    required
                    placeholder="EMP000001"
                    value={formData.employeeCode}
                    onChange={(e) =>
                      setFormData({ ...formData, employeeCode: e.target.value })
                    }
                    style={styles.input}
                  />
                </div>
                <div>
                  <label style={styles.label}>Status *</label>
                  <select
                    value={formData.status}
                    onChange={(e) =>
                      setFormData({ ...formData, status: e.target.value as any })
                    }
                    style={styles.input}
                  >
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                    <option value="suspended">Suspended</option>
                    <option value="terminated">Terminated</option>
                    <option value="on_leave">On Leave</option>
                  </select>
                </div>
                <div>
                  <label style={styles.label}>First Name *</label>
                  <input
                    type="text"
                    required
                    value={formData.firstName}
                    onChange={(e) =>
                      setFormData({ ...formData, firstName: e.target.value })
                    }
                    style={styles.input}
                  />
                </div>
                <div>
                  <label style={styles.label}>Last Name *</label>
                  <input
                    type="text"
                    required
                    value={formData.lastName}
                    onChange={(e) =>
                      setFormData({ ...formData, lastName: e.target.value })
                    }
                    style={styles.input}
                  />
                </div>
                <div>
                  <label style={styles.label}>Department *</label>
                  <input
                    type="text"
                    required
                    placeholder="Operations"
                    value={formData.department}
                    onChange={(e) =>
                      setFormData({ ...formData, department: e.target.value })
                    }
                    style={styles.input}
                  />
                </div>
                <div>
                  <label style={styles.label}>Designation *</label>
                  <input
                    type="text"
                    required
                    placeholder="Plant Engineer"
                    value={formData.designation}
                    onChange={(e) =>
                      setFormData({ ...formData, designation: e.target.value })
                    }
                    style={styles.input}
                  />
                </div>
                <div>
                  <label style={styles.label}>Email</label>
                  <input
                    type="email"
                    placeholder="name@company.com"
                    value={formData.email}
                    onChange={(e) =>
                      setFormData({ ...formData, email: e.target.value })
                    }
                    style={styles.input}
                  />
                </div>
                <div>
                  <label style={styles.label}>Phone Number</label>
                  <input
                    type="text"
                    placeholder="+91-9876543210"
                    value={formData.phoneNumber}
                    onChange={(e) =>
                      setFormData({ ...formData, phoneNumber: e.target.value })
                    }
                    style={styles.input}
                  />
                </div>
                <div>
                  <label style={styles.label}>Joined Date *</label>
                  <input
                    type="date"
                    required
                    value={formData.joinedAt}
                    onChange={(e) =>
                      setFormData({ ...formData, joinedAt: e.target.value })
                    }
                    style={styles.input}
                  />
                </div>
              </div>

              <div style={styles.modalFooter}>
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  style={styles.secondaryBtn}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={formSubmitting}
                  style={styles.primaryBtn}
                >
                  {formSubmitting ? "Creating..." : "Save Employee"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* BULK IMPORT MODAL */}
      {showImportModal && (
        <div style={styles.modalOverlay}>
          <div style={{ ...styles.modalContent, maxWidth: "600px" }}>
            <div style={styles.modalHeader}>
              <h3>Bulk Import Employees (CSV / XLSX)</h3>
              <button
                onClick={() => {
                  setShowImportModal(false);
                  setImportReport(null);
                }}
                style={styles.closeBtn}
              >
                ×
              </button>
            </div>

            <div style={styles.templateDownloadRow}>
              <span>Download sample template:</span>
              <a
                href="/api/v1/employees/template?format=csv"
                download
                style={styles.templateLink}
              >
                CSV Template
              </a>
              <a
                href="/api/v1/employees/template?format=xlsx"
                download
                style={styles.templateLink}
              >
                XLSX Template
              </a>
            </div>

            <form onSubmit={handleImportSubmit} style={styles.modalForm}>
              <div style={styles.inputGroup}>
                <label style={styles.label}>Select File (.csv or .xlsx)</label>
                <input
                  type="file"
                  accept=".csv, .xlsx"
                  required
                  onChange={(e) => setImportFile(e.target.files?.[0] || null)}
                  style={styles.fileInput}
                />
              </div>

              <div style={styles.checkboxRow}>
                <input
                  type="checkbox"
                  id="dryRunToggle"
                  checked={isDryRun}
                  onChange={(e) => setIsDryRun(e.target.checked)}
                />
                <label htmlFor="dryRunToggle" style={styles.checkboxLabel}>
                  <strong>Validation Only ("Dry Run")</strong> — Verify file
                  formatting & errors without adding records to DB
                </label>
              </div>

              <button
                type="submit"
                disabled={importing || !importFile}
                style={styles.primaryBtn}
              >
                {importing
                  ? "Processing..."
                  : isDryRun
                  ? "Run Validation Check"
                  : "Commit Import to Database"}
              </button>
            </form>

            {/* Validation Report Display */}
            {importReport && (
              <div style={styles.reportCard}>
                <h4>
                  Import Report ({importReport.isDryRun ? "Dry Run" : "Committed"})
                </h4>
                <div style={styles.reportSummaryGrid}>
                  <div>Total: {importReport.totalRecords}</div>
                  <div style={{ color: "#10b981" }}>
                    Valid: {importReport.successfulRecords}
                  </div>
                  <div style={{ color: "#ef4444" }}>
                    Failed: {importReport.failedRecords}
                  </div>
                </div>

                {importReport.errors?.length > 0 && (
                  <div style={styles.errorListContainer}>
                    <h5 style={{ margin: "8px 0", color: "#fca5a5" }}>
                      Row Validation Errors ({importReport.errors.length}):
                    </h5>
                    <ul style={styles.errorUl}>
                      {importReport.errors.map((err: any, idx: number) => (
                        <li key={idx} style={styles.errorLi}>
                          Row {err.rowNumber}: [{err.employeeCode || "N/A"}]{" "}
                          <strong>{err.field}</strong> — {err.message}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, { bg: string; fg: string }> = {
    active: { bg: "rgba(16, 185, 129, 0.15)", fg: "#10b981" },
    inactive: { bg: "rgba(148, 163, 184, 0.15)", fg: "#94a3b8" },
    suspended: { bg: "rgba(245, 158, 11, 0.15)", fg: "#f59e0b" },
    terminated: { bg: "rgba(239, 68, 68, 0.15)", fg: "#ef4444" },
    on_leave: { bg: "rgba(59, 130, 246, 0.15)", fg: "#3b82f6" },
  };
  const style = colors[status] || colors.inactive;

  return (
    <span
      style={{
        padding: "4px 8px",
        borderRadius: "4px",
        fontSize: "12px",
        fontWeight: 600,
        backgroundColor: style.bg,
        color: style.fg,
        textTransform: "capitalize",
      }}
    >
      {status.replace("_", " ")}
    </span>
  );
}

const styles: Record<string, React.CSSProperties> = {
  pageContainer: {
    padding: "24px",
    maxWidth: "1400px",
    margin: "0 auto",
  },
  topNav: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "24px",
  },
  brandTitle: {
    margin: 0,
    fontSize: "26px",
    color: "#f8fafc",
  },
  brandSub: {
    fontSize: "13px",
    color: "#94a3b8",
  },
  navActions: {
    display: "flex",
    gap: "12px",
  },
  primaryBtn: {
    backgroundColor: "#2563eb",
    color: "#fff",
    border: "none",
    padding: "10px 16px",
    borderRadius: "6px",
    fontWeight: 600,
    cursor: "pointer",
  },
  secondaryBtn: {
    backgroundColor: "#334155",
    color: "#f8fafc",
    border: "1px solid #475569",
    padding: "10px 16px",
    borderRadius: "6px",
    fontWeight: 500,
    cursor: "pointer",
  },
  metricsGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: "16px",
    marginBottom: "24px",
  },
  metricCard: {
    backgroundColor: "#1e293b",
    border: "1px solid #334155",
    borderRadius: "8px",
    padding: "20px",
    display: "flex",
    flexDirection: "column",
  },
  metricLabel: {
    fontSize: "13px",
    color: "#94a3b8",
    marginBottom: "6px",
  },
  metricValue: {
    fontSize: "28px",
    fontWeight: 700,
    color: "#f8fafc",
  },
  filterBar: {
    display: "flex",
    gap: "12px",
    marginBottom: "20px",
  },
  searchInput: {
    flex: 1,
    padding: "10px 14px",
    borderRadius: "6px",
    border: "1px solid #334155",
    backgroundColor: "#1e293b",
    color: "#f8fafc",
    fontSize: "14px",
  },
  selectInput: {
    padding: "10px 14px",
    borderRadius: "6px",
    border: "1px solid #334155",
    backgroundColor: "#1e293b",
    color: "#f8fafc",
    fontSize: "14px",
  },
  tableCard: {
    backgroundColor: "#1e293b",
    border: "1px solid #334155",
    borderRadius: "8px",
    overflow: "hidden",
  },
  table: {
    width: "100%",
    borderCollapse: "collapse",
    textAlign: "left",
  },
  tableHeaderRow: {
    backgroundColor: "#0f172a",
    borderBottom: "1px solid #334155",
  },
  th: {
    padding: "12px 16px",
    fontSize: "13px",
    fontWeight: 600,
    color: "#cbd5e1",
  },
  tableRow: {
    borderBottom: "1px solid #334155",
  },
  tdCode: {
    padding: "12px 16px",
    fontSize: "13px",
    fontWeight: 700,
    color: "#3b82f6",
  },
  tdName: {
    padding: "12px 16px",
    fontSize: "14px",
    fontWeight: 600,
    color: "#f8fafc",
  },
  td: {
    padding: "12px 16px",
    fontSize: "13px",
    color: "#cbd5e1",
  },
  tdSub: {
    padding: "12px 16px",
    fontSize: "13px",
  },
  dangerLinkBtn: {
    background: "none",
    border: "none",
    color: "#ef4444",
    cursor: "pointer",
    fontSize: "12px",
    textDecoration: "underline",
  },
  paginationRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "12px 16px",
    backgroundColor: "#0f172a",
    borderTop: "1px solid #334155",
  },
  paginationBtn: {
    backgroundColor: "#334155",
    color: "#fff",
    border: "none",
    padding: "6px 12px",
    borderRadius: "4px",
    cursor: "pointer",
    fontSize: "13px",
  },
  paginationText: {
    fontSize: "13px",
    color: "#94a3b8",
  },
  modalOverlay: {
    position: "fixed",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.75)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 100,
    padding: "20px",
  },
  modalContent: {
    backgroundColor: "#1e293b",
    border: "1px solid #334155",
    borderRadius: "10px",
    padding: "24px",
    width: "100%",
    maxWidth: "540px",
    maxHeight: "90vh",
    overflowY: "auto",
  },
  modalHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "20px",
    borderBottom: "1px solid #334155",
    paddingBottom: "12px",
  },
  closeBtn: {
    background: "none",
    border: "none",
    color: "#94a3b8",
    fontSize: "24px",
    cursor: "pointer",
  },
  modalForm: {
    display: "flex",
    flexDirection: "column",
    gap: "16px",
  },
  formGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: "14px",
  },
  label: {
    fontSize: "12px",
    fontWeight: 600,
    color: "#94a3b8",
    marginBottom: "4px",
    display: "block",
  },
  input: {
    width: "100%",
    padding: "8px 12px",
    borderRadius: "6px",
    border: "1px solid #334155",
    backgroundColor: "#0f172a",
    color: "#f8fafc",
    fontSize: "13px",
  },
  fileInput: {
    padding: "8px",
    backgroundColor: "#0f172a",
    border: "1px solid #334155",
    borderRadius: "6px",
    color: "#f8fafc",
    width: "100%",
  },
  checkboxRow: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    backgroundColor: "#0f172a",
    padding: "12px",
    borderRadius: "6px",
    border: "1px solid #334155",
  },
  checkboxLabel: {
    fontSize: "13px",
    color: "#cbd5e1",
  },
  modalFooter: {
    display: "flex",
    justifyContent: "flex-end",
    gap: "10px",
    marginTop: "16px",
  },
  templateDownloadRow: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
    fontSize: "13px",
    color: "#94a3b8",
    marginBottom: "16px",
    backgroundColor: "#0f172a",
    padding: "10px 14px",
    borderRadius: "6px",
  },
  templateLink: {
    color: "#3b82f6",
    fontWeight: 600,
    textDecoration: "none",
  },
  reportCard: {
    marginTop: "20px",
    padding: "16px",
    backgroundColor: "#0f172a",
    borderRadius: "6px",
    border: "1px solid #334155",
  },
  reportSummaryGrid: {
    display: "flex",
    gap: "16px",
    fontWeight: 600,
    fontSize: "14px",
    marginTop: "8px",
  },
  errorListContainer: {
    marginTop: "12px",
    maxHeight: "150px",
    overflowY: "auto",
  },
  errorUl: {
    paddingLeft: "18px",
    margin: 0,
  },
  errorLi: {
    fontSize: "12px",
    color: "#fca5a5",
    marginBottom: "4px",
  },
  errorAlert: {
    backgroundColor: "rgba(239, 68, 68, 0.15)",
    color: "#fca5a5",
    padding: "10px",
    borderRadius: "6px",
    fontSize: "13px",
    marginBottom: "14px",
  },
  loadingContainer: {
    padding: "40px",
    textAlign: "center",
    color: "#94a3b8",
  },
  emptyContainer: {
    padding: "40px",
    textAlign: "center",
    color: "#94a3b8",
  },
};
