import "./globals.css";
import Nav from "@/components/Nav";

export const metadata = {
  title: "flipmuch — Fix & Flip Deal Analyzer",
  description: "Underwrite a fix-and-flip deal in minutes: comps, fees, financing, and a clear go/no-go verdict.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <Nav />
        {children}
      </body>
    </html>
  );
}
