"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg("");

    try {
      const res = await signIn("credentials", {
        email,
        password,
        redirect: false,
      });

      if (!res || res.error) {
        if (res?.error?.includes("ACCOUNT_LOCKED")) {
          setErrorMsg("Account locked due to 5 consecutive failed login attempts. Please try again in 15 minutes.");
        } else if (res?.error?.includes("EMPLOYEE_NOT_ACTIVE")) {
          setErrorMsg("Employee status is not active. Attendance and portal login prohibited.");
        } else if (res?.error?.includes("USER_INACTIVE")) {
          setErrorMsg("User account is inactive.");
        } else {
          setErrorMsg("Invalid email or password.");
        }
        setLoading(false);
        return;
      }

      // Success -> Redirect to dashboard
      router.push("/employees");
      router.refresh();
    } catch (err: any) {
      setErrorMsg("Network error. Please check your connection.");
      setLoading(false);
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <div style={styles.header}>
          <div style={styles.logoBadge}>W1</div>
          <h1 style={styles.title}>WorkForce One</h1>
          <p style={styles.subtitle}>Enterprise Workforce Attendance Management</p>
        </div>

        {errorMsg && (
          <div style={styles.errorAlert}>
            <strong>Authentication Alert:</strong> {errorMsg}
          </div>
        )}

        <form onSubmit={handleSubmit} style={styles.form}>
          <div style={styles.inputGroup}>
            <label style={styles.label}>Email Address</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="user@organization.com"
              style={styles.input}
            />
          </div>

          <div style={styles.inputGroup}>
            <label style={styles.label}>Password</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••••••"
              style={styles.input}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            style={{
              ...styles.button,
              opacity: loading ? 0.6 : 1,
            }}
          >
            {loading ? "Authenticating..." : "Sign In"}
          </button>
        </form>

        <div style={styles.footerNote}>
          Tamil Nadu Coke and Power Private Limited • Version 1.0
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "20px",
    backgroundColor: "#0f172a",
  },
  card: {
    width: "100%",
    maxWidth: "420px",
    backgroundColor: "#1e293b",
    borderRadius: "12px",
    border: "1px solid #334155",
    padding: "32px",
    boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.5)",
  },
  header: {
    textAlign: "center",
    marginBottom: "24px",
  },
  logoBadge: {
    width: "48px",
    height: "48px",
    borderRadius: "10px",
    backgroundColor: "#2563eb",
    color: "#ffffff",
    fontWeight: "bold",
    fontSize: "20px",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: "12px",
  },
  title: {
    margin: "0 0 4px 0",
    fontSize: "24px",
    fontWeight: 700,
    color: "#f8fafc",
  },
  subtitle: {
    margin: 0,
    fontSize: "13px",
    color: "#94a3b8",
  },
  errorAlert: {
    backgroundColor: "rgba(239, 68, 68, 0.15)",
    border: "1px solid #ef4444",
    color: "#fca5a5",
    borderRadius: "6px",
    padding: "12px",
    fontSize: "13px",
    marginBottom: "20px",
  },
  form: {
    display: "flex",
    flexDirection: "column",
    gap: "16px",
  },
  inputGroup: {
    display: "flex",
    flexDirection: "column",
    gap: "6px",
  },
  label: {
    fontSize: "13px",
    fontWeight: 500,
    color: "#cbd5e1",
  },
  input: {
    padding: "10px 14px",
    borderRadius: "6px",
    border: "1px solid #334155",
    backgroundColor: "#0f172a",
    color: "#f8fafc",
    fontSize: "14px",
    outline: "none",
  },
  button: {
    padding: "12px",
    borderRadius: "6px",
    border: "none",
    backgroundColor: "#2563eb",
    color: "#ffffff",
    fontWeight: 600,
    fontSize: "14px",
    cursor: "pointer",
    marginTop: "8px",
    transition: "background-color 0.2s",
  },
  footerNote: {
    textAlign: "center",
    marginTop: "24px",
    fontSize: "11px",
    color: "#64748b",
  },
};
