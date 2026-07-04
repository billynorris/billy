import { appUrl, isPride, PrideRibbon } from "@billynorris/ui";

interface AppLink {
  name: string;
  title: string;
  blurb: string;
}

const APPS: AppLink[] = [
  {
    name: "lifting",
    title: "Lift Coach",
    blurb: "Strength, volume & muscle-balance analytics from your lifting log.",
  },
  {
    name: "classes",
    title: "Classes",
    blurb: "Auto-book gym classes the second the window opens.",
  },
];

export function App() {
  return (
    <>
      <PrideRibbon />
      <main className="wrap">
        <header className="hero">
          <h1>Billy Norris</h1>
          <p className="tagline">
            {isPride()
              ? "Same platform, full colour. 🏳️‍🌈"
              : "A small platform of personal apps."}
          </p>
        </header>

        <section className="grid">
          {APPS.map((app) => (
            <a key={app.name} className="card app-card" href={appUrl(app.name)}>
              <h2>{app.title}</h2>
              <p>{app.blurb}</p>
              <span className="go">Open →</span>
            </a>
          ))}
        </section>
      </main>
    </>
  );
}
