import type { ReactNode } from "react";

interface InsightCardProps {
  title: string;
  subtitle?: string;
  /** Optional right-aligned controls, e.g. a view toggle. */
  actions?: ReactNode;
  className?: string;
  children: ReactNode;
}

/** The repeating card shell every insight renders inside. */
export function InsightCard({ title, subtitle, actions, className, children }: InsightCardProps) {
  return (
    <section className={`panel${className ? ` ${className}` : ""}`}>
      <header className="panel-head">
        <div>
          <h2 className="panel-title">{title}</h2>
          {subtitle && <p className="panel-sub">{subtitle}</p>}
        </div>
        {actions}
      </header>
      <div className="panel-body">{children}</div>
    </section>
  );
}

interface ToggleProps<T extends string> {
  value: T;
  options: ReadonlyArray<{ value: T; label: string }>;
  onChange: (value: T) => void;
}

/** Segmented control used for chart view toggles (Area/Bar, etc.). */
export function ViewToggle<T extends string>({ value, options, onChange }: ToggleProps<T>) {
  return (
    <div className="segmented">
      {options.map((opt) => (
        <button
          key={opt.value}
          className={`seg-btn${value === opt.value ? " active" : ""}`}
          onClick={() => onChange(opt.value)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
