"use client";

import { useState, useEffect } from "react";
import QRCode from "qrcode";

export default function MyQrPage() {
  const [tokenType, setTokenType] = useState<"check_in" | "check_out">("check_in");
  const [qrDataUrl, setQrDataUrl] = useState<string>("");
  const [countdown, setCountdown] = useState<number>(15);
  const [loading, setLoading] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string>("");

  const fetchQrToken = async () => {
    setLoading(true);
    setErrorMsg("");
    try {
      const res = await fetch("/api/v1/attendance/qr", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tokenType }),
      });

      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.error?.message || "Failed to generate attendance QR code.");
        setLoading(false);
        return;
      }

      const rawToken = data.data.rawToken;
      const dataUrl = await QRCode.toDataURL(rawToken, {
        width: 320,
        margin: 2,
        color: {
          dark: "#0f172a",
          light: "#ffffff",
        },
      });

      setQrDataUrl(dataUrl);
      setCountdown(data.data.refreshIntervalSeconds || 15);
    } catch (err) {
      setErrorMsg("Network error generating QR code.");
    } finally {
      setLoading(false);
    }
  };

  // Fetch token on mount & mode change
  useEffect(() => {
    fetchQrToken();
  }, [tokenType]);

  // Countdown timer & auto-refresh
  useEffect(() => {
    if (loading || errorMsg) return;

    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          fetchQrToken();
          return 15;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [loading, errorMsg, tokenType]);

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <div style={styles.header}>
          <h1 style={styles.title}>My Attendance QR Code</h1>
          <p style={styles.subtitle}>
            Present this dynamic QR code at the gate scanner to mark attendance.
          </p>
        </div>

        {/* Action Toggle */}
        <div style={styles.toggleRow}>
          <button
            onClick={() => setTokenType("check_in")}
            style={{
              ...styles.toggleBtn,
              backgroundColor: tokenType === "check_in" ? "#10b981" : "#334155",
              color: tokenType === "check_in" ? "#ffffff" : "#cbd5e1",
            }}
          >
            Check-In Mode
          </button>
          <button
            onClick={() => setTokenType("check_out")}
            style={{
              ...styles.toggleBtn,
              backgroundColor: tokenType === "check_out" ? "#3b82f6" : "#334155",
              color: tokenType === "check_out" ? "#ffffff" : "#cbd5e1",
            }}
          >
            Check-Out Mode
          </button>
        </div>

        {errorMsg ? (
          <div style={styles.errorAlert}>
            <strong>Access Prohibited:</strong> {errorMsg}
          </div>
        ) : (
          <div style={styles.qrContainer}>
            {loading ? (
              <div style={styles.loadingBox}>Generating secure QR token...</div>
            ) : (
              <>
                <img src={qrDataUrl} alt="Attendance QR" style={styles.qrImg} />
                <div style={styles.countdownRow}>
                  <span>Auto-refreshing in: <strong>{countdown}s</strong></span>
                  <div style={styles.progressBarBg}>
                    <div
                      style={{
                        ...styles.progressBarFill,
                        width: `${(countdown / 15) * 100}%`,
                      }}
                    />
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        <div style={styles.securityNotice}>
          🔒 <strong>Anti-Fraud Security Active:</strong> Screenshots are single-use only and automatically expire in 30 seconds.
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
    maxWidth: "460px",
    backgroundColor: "#1e293b",
    borderRadius: "12px",
    border: "1px solid #334155",
    padding: "28px",
    textAlign: "center",
  },
  header: {
    marginBottom: "20px",
  },
  title: {
    margin: "0 0 6px 0",
    fontSize: "22px",
    color: "#f8fafc",
  },
  subtitle: {
    margin: 0,
    fontSize: "13px",
    color: "#94a3b8",
  },
  toggleRow: {
    display: "flex",
    gap: "10px",
    marginBottom: "20px",
  },
  toggleBtn: {
    flex: 1,
    padding: "10px",
    borderRadius: "6px",
    border: "none",
    fontWeight: 600,
    fontSize: "14px",
    cursor: "pointer",
  },
  qrContainer: {
    backgroundColor: "#ffffff",
    padding: "20px",
    borderRadius: "10px",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    marginBottom: "20px",
  },
  qrImg: {
    width: "260px",
    height: "260px",
  },
  loadingBox: {
    height: "260px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "#475569",
    fontWeight: 600,
  },
  countdownRow: {
    marginTop: "12px",
    width: "100%",
    fontSize: "13px",
    color: "#334155",
  },
  progressBarBg: {
    width: "100%",
    height: "6px",
    backgroundColor: "#e2e8f0",
    borderRadius: "3px",
    marginTop: "6px",
    overflow: "hidden",
  },
  progressBarFill: {
    height: "100%",
    backgroundColor: "#2563eb",
    transition: "width 1s linear",
  },
  errorAlert: {
    backgroundColor: "rgba(239, 68, 68, 0.15)",
    border: "1px solid #ef4444",
    color: "#fca5a5",
    borderRadius: "6px",
    padding: "16px",
    fontSize: "13px",
    marginBottom: "20px",
  },
  securityNotice: {
    fontSize: "12px",
    color: "#94a3b8",
    backgroundColor: "#0f172a",
    padding: "10px 14px",
    borderRadius: "6px",
    textAlign: "left",
  },
};
