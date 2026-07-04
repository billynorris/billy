import type { TooltipProps } from "recharts";

/** Shared dark tooltip used across all charts. */
export function ChartTooltip({
  active,
  payload,
  label,
  formatter,
}: TooltipProps<number, string> & {
  formatter?: (value: number, name: string) => string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div
      style={{
        background: "var(--surface-2)",
        border: "1px solid var(--border)",
        borderRadius: 10,
        padding: "8px 12px",
        fontSize: 12,
        boxShadow: "0 8px 24px rgba(0,0,0,0.35)",
      }}
    >
      {label != null && <div style={{ marginBottom: 4, fontWeight: 600 }}>{String(label)}</div>}
      <div style={{ display: "grid", gap: 2 }}>
        {payload.map((entry) => (
          <div key={entry.name} style={{ display: "flex", gap: 8, fontVariantNumeric: "tabular-nums" }}>
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: 999,
                background: entry.color as string,
                alignSelf: "center",
              }}
            />
            <span className="muted">{entry.name}</span>
            <span style={{ marginLeft: "auto", fontWeight: 600 }}>
              {formatter ? formatter(entry.value as number, entry.name as string) : entry.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
