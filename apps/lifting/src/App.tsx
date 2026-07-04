import { useEffect, useState } from "react";
import { PrideRibbon } from "@billynorris/ui";
import { api } from "./api";
import { useApi } from "./useApi";
import { Overview } from "./views/Overview";
import { Exercises } from "./views/Exercises";
import { Volume } from "./views/Volume";
import { Balance } from "./views/Balance";
import { History } from "./views/History";

const TABS = [
  { id: "overview", label: "Overview", render: () => <Overview /> },
  { id: "exercises", label: "Exercises", render: () => <Exercises /> },
  { id: "volume", label: "Volume", render: () => <Volume /> },
  { id: "balance", label: "Balance", render: () => <Balance /> },
  { id: "history", label: "History", render: () => <History /> },
] as const;

type TabId = (typeof TABS)[number]["id"];

function tabFromHash(): TabId {
  const id = location.hash.replace(/^#\/?/, "");
  return TABS.some((t) => t.id === id) ? (id as TabId) : "overview";
}

export function App() {
  const [tab, setTab] = useState<TabId>(tabFromHash);
  const { data: context } = useApi("context", api.context);

  useEffect(() => {
    const onHash = () => setTab(tabFromHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const select = (id: TabId) => {
    location.hash = `/${id}`;
    setTab(id);
  };

  const active = TABS.find((t) => t.id === tab) ?? TABS[0];

  return (
    <>
      <PrideRibbon />
      <div className="shell">
        <header className="topbar">
          <div className="brand">
            <span className="brand-mark">▲</span>
            <span>Lift Coach</span>
          </div>
          <nav className="nav">
            {TABS.map((t) => (
              <button
                key={t.id}
                className={`nav-item${t.id === tab ? " active" : ""}`}
                onClick={() => select(t.id)}
              >
                {t.label}
              </button>
            ))}
          </nav>
        </header>
        {context?.viewing && (
          <div className="coach-banner">
            Coach view — showing {context.subjectName}’s lifts (read-only)
          </div>
        )}
        <main>{active.render()}</main>
        <footer className="foot">Lift Coach · personal training analytics</footer>
      </div>
    </>
  );
}
