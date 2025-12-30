import os from "os";

function getServerIp() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name] || []) {
      if (iface.family === "IPv4" && !iface.internal) {
        return iface.address;
      }
    }
  }
  return "Unknown";
}

export default async function Home() {
  const ip = getServerIp();
  const port = process.env.PORT || 3000;

  return (
    <main style={styles.page}>
      <div style={styles.banner}>
        <span style={styles.bannerText}>WeWeDrop Backend Dashboard</span>
      </div>
      <div style={styles.card}>
        <h1 style={styles.title}>🚀 WeWeDrop Backend</h1>
        <p style={styles.subtitle}>
          Backend service is running successfully
        </p>

        <div style={styles.section}>
          <span style={styles.label}>Database Status</span>
          <a href="/api/db-status" style={styles.link}>
            Check MongoDB Connection →
          </a>
        </div>

        <div style={styles.divider} />

        <div style={styles.section}>
          <span style={styles.label}>Server IP Address</span>
          <div style={styles.ipBox}>{ip}</div>
        </div>

        <div style={styles.section}>
          <span style={styles.label}>API Port</span>
          <div style={styles.ipBox}>{port}</div>
        </div>

        <footer style={styles.footer}>
          © {new Date().getFullYear()} WeWeDrop • Backend Dashboard
        </footer>
      </div>
    </main>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: "100vh",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "flex-start",
    background: "linear-gradient(135deg, #0f2027, #203a43, #2c5364)",
    padding: "20px",
    position: "relative",
  },
  banner: {
    position: "fixed",
    top: 0,
    left: 0,
    width: "100vw",
    height: "60px",
    background: "#2563eb",
    color: "#fff",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 100,
    boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
  },
  bannerText: {
    fontSize: "22px",
    fontWeight: 600,
    letterSpacing: "0.04em",
  },
  card: {
    width: "100%",
    maxWidth: "520px",
    background: "rgba(255,255,255,0.95)",
    borderRadius: "16px",
    padding: "32px",
    boxShadow: "0 20px 40px rgba(0,0,0,0.25)",
    textAlign: "center",
    marginTop: "80px",
  },
  title: {
    fontSize: "28px",
    fontWeight: 700,
    marginBottom: "8px",
    color: "#0f172a",
  },
  subtitle: {
    fontSize: "14px",
    color: "#475569",
    marginBottom: "28px",
  },
  section: {
    marginBottom: "20px",
  },
  label: {
    display: "block",
    fontSize: "13px",
    fontWeight: 600,
    color: "#64748b",
    marginBottom: "8px",
    textTransform: "uppercase",
    letterSpacing: "0.04em",
  },
  link: {
    display: "inline-block",
    padding: "10px 16px",
    borderRadius: "8px",
    backgroundColor: "#2563eb",
    color: "#fff",
    textDecoration: "none",
    fontWeight: 500,
  },
  ipBox: {
    padding: "12px",
    borderRadius: "8px",
    background: "#f1f5f9",
    fontFamily: "monospace",
    fontSize: "15px",
    color: "#0f172a",
    userSelect: "all",
  },
  divider: {
    height: "1px",
    background: "#e2e8f0",
    margin: "24px 0",
  },
  footer: {
    marginTop: "24px",
    fontSize: "12px",
    color: "#94a3b8",
  },
};
