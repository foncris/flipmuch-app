import "./globals.css";
import Nav from "@/components/Nav";
import Link from "next/link";

export const metadata = {
  title: "GoingFlip — Fix & Flip Deal Analyzer",
  description: "Underwrite a fix-and-flip deal in minutes: comps, fees, financing, and a clear go/no-go verdict.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body style={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}>
        <Nav />
        <div style={{ flex: 1 }}>
          {children}
        </div>
        <footer style={{
          borderTop: "1px solid var(--line, #e5e7eb)",
          padding: "24px 28px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 12,
          fontSize: 13,
          color: "var(--muted, #6b7280)",
          background: "#fff",
        }}>
          <span>© {new Date().getFullYear()} GoingFlip. All rights reserved.</span>
          <nav style={{ display: "flex", gap: 20 }}>
            <Link href="/terms" style={{ color: "var(--muted, #6b7280)", textDecoration: "none" }}>Terms of Service</Link>
            <Link href="/privacy" style={{ color: "var(--muted, #6b7280)", textDecoration: "none" }}>Privacy Policy</Link>
            <a href="mailto:support@goingflip.com" style={{ color: "var(--muted, #6b7280)", textDecoration: "none" }}>Support</a>
          </nav>
        </footer>
      </body>
    </html>
  );
}
