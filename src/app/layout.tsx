import type { Metadata } from "next";
import "./globals.css";
import { ConsoleProvider } from "@/components/ConsoleProvider";
import Sidebar from "@/components/Sidebar";
import { Drawers } from "@/components/Drawers";

export const metadata: Metadata = {
  title: "Rook Ops",
  description: "Local-first control plane for a home AI stack — workflows, approvals, run history, one-click launchers.",
};

const themeInit = `
try {
  var t = localStorage.getItem("rk-theme");
  if (t === "dark" || (!t && window.matchMedia("(prefers-color-scheme: dark)").matches)) {
    document.documentElement.setAttribute("data-rk-theme", "dark");
  }
} catch (e) {}
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInit }} />
      </head>
      <body>
        <ConsoleProvider>
          <div className="rk-frame">
            <Sidebar />
            <main className="rk-main">{children}</main>
          </div>
          <Drawers />
        </ConsoleProvider>
      </body>
    </html>
  );
}
