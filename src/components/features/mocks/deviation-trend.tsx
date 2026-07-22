import type { MockExam } from "@/types/database";

/** 総合偏差値の推移(冠模試の大学別などで使用)。日付順の折れ線 */
export function DeviationTrend({ mocks }: { mocks: MockExam[] }) {
  const points = mocks
    .filter((m) => m.overall_deviation != null)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((m) => ({ date: m.date, value: m.overall_deviation as number }));

  if (points.length < 2) return null;

  const w = 300;
  const h = 90;
  const pad = 24;
  const values = points.map((p) => p.value);
  const min = Math.min(...values) - 2;
  const max = Math.max(...values) + 2;
  const range = max - min || 1;

  const coords = points.map((p, i) => {
    const x = pad + (i * (w - pad * 2)) / (points.length - 1);
    const y = pad + (h - pad * 2) * (1 - (p.value - min) / range);
    return { x, y, ...p };
  });
  const path = coords.map((c, i) => `${i === 0 ? "M" : "L"}${c.x},${c.y}`).join(" ");

  return (
    <div className="rounded-xl border bg-secondary/40 p-3">
      <p className="mb-1 text-xs font-bold text-muted-foreground">偏差値の推移</p>
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full" role="img" aria-label="偏差値推移">
        <path d={path} fill="none" stroke="var(--color-primary)" strokeWidth={2} />
        {coords.map((c, i) => (
          <g key={i}>
            <circle cx={c.x} cy={c.y} r={3} fill="var(--color-primary)" />
            <text x={c.x} y={c.y - 7} textAnchor="middle" className="fill-foreground text-[9px]">
              {c.value}
            </text>
            <text
              x={c.x}
              y={h - 6}
              textAnchor="middle"
              className="fill-muted-foreground text-[8px]"
            >
              {c.date.slice(5).replace("-", "/")}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}
