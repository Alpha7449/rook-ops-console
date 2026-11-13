"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useConsole } from "./ConsoleProvider";

/** The Rook mark (circuit + rook piece) from the brand kit. */
export function RookLogo({ size = 26 }: { size?: number }) {
  return (
    <svg viewBox="142 463 320 320" style={{ width: size, height: size }} aria-hidden>
      <g fill="none" stroke="#91c0f6" strokeWidth={7} strokeLinecap="round">
        <path d="M363,598.427l63.5,0c4.389,0 8,-3.611 8,-8l0,-13.5" />
        <path d="M363,625.927l68,0" />
        <path d="M363,653.927l62.5,0c4.389,0 8,3.611 8,8l0,13" />
      </g>
      <path
        fill="none"
        stroke="#5892d4"
        strokeWidth={10}
        d="M413.81,707.157c-27.26,37.52 -70.929,59.77 -117.306,59.77c-79.545,0 -145,-65.455 -145,-145c0,-79.545 65.455,-145 145,-145c47.267,0 91.665,23.112 118.776,61.83"
      />
      <g fill="#fff">
        <path d="M244,540.427l14,0l0,20.5l29,0l0,-20.5l19,0l0,20.5l30,0l0,-20.5l13,0l0,31l-8.9,8.5l-87.2,0l-8.9,-8.5l0,-31Z" />
        <path d="M253.5,589.427l0,7.5l5.5,6.5l0.3,4.5l0,12l-4,40l-1.1,8l-1.7,8l-1.7,6l-1.9,5.5l95.2,0l-1.9,-5.5l-1.7,-6l-1.7,-8l-1.1,-8l-4,-40l0.3,-16.5l5.5,-6.5l0,-7.5l-86,0Z" />
        <path d="M244,693.427l105.5,0l9,10l0,15l-124,0l0,-15l9.5,-10Z" />
        <path d="M235.5,724.427l122,0l11,29.1l-9.3,4.7l-9.7,3.9l-10,3l-10.3,2.1l-10.4,1.1l-10.5,0.2l-10.4,-0.8l-10.3,-1.7l-10.1,-2.7l-9.8,-3.6l-9.5,-4.5l7.8,-30.8Z" />
      </g>
    </svg>
  );
}

const TOOLS = [
  { label: "n8n", href: "http://127.0.0.1:5678" },
  { label: "Odysseus", href: "http://127.0.0.1:7000" },
];

export default function Sidebar() {
  const pathname = usePathname();
  const { snap, openQueue, connected } = useConsole();
  const pending = snap?.approvals.length ?? 0;

  const nav = (href: string, label: string) => (
    <Link key={href} href={href} className={`rk-nav-item ${pathname === href ? "active" : ""}`}>
      <span>{label}</span>
    </Link>
  );

  return (
    <aside className="rk-side">
      <div className="rk-side-brand">
        <RookLogo />
        Rook Ops
      </div>
      <nav>
        {nav("/", "AI Workflows")}
        <button type="button" className="rk-nav-item" onClick={openQueue}>
          <span>Review queue</span>
          {pending > 0 && (
            <span className="rk-chip warn" style={{ fontSize: 11.5 }}>
              {pending}
            </span>
          )}
        </button>
        {nav("/history", "Run history")}
        <div className="rk-nav-head">Admin</div>
        {nav("/audit", "Audit log")}
        <div className="rk-nav-head">Open tools</div>
        {snap?.demo ? (
          <div className="rk-nav-item" style={{ cursor: "default", opacity: 0.55 }}>
            <span>n8n · Odysseus</span>
          </div>
        ) : (
          TOOLS.map((t) => (
            <a key={t.label} className="rk-nav-item" href={t.href} target="_blank" rel="noreferrer">
              <span>{t.label}</span>
              <span style={{ fontSize: 11, color: "#64707d" }}>↗</span>
            </a>
          ))
        )}
      </nav>
      <div className="rk-side-foot">
        {snap?.demo ? (
          <span className="rk-chip soft">demo mode — fixture data</span>
        ) : (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: "50%",
                  background: connected ? "#7fd49c" : "#e6c479",
                  display: "inline-block",
                }}
              />
              <span suppressHydrationWarning>
                {connected ? `live · ${typeof window !== "undefined" ? window.location.host : ""}` : "reconnecting…"}
              </span>
            </div>
            <div style={{ marginTop: 4, color: "#64707d" }}>local control plane — loopback only</div>
          </>
        )}
      </div>
    </aside>
  );
}
