"use client";

import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export type DriftPoint = { trainedAt: string; label: string; mae: number; mape: number; outlet: string };

const COLORS = ["var(--chart-1)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)", "var(--chart-2)"];

/** One line per outlet, MAPE over training runs (oldest to newest). */
export function DriftChart({ series, metric }: { series: Record<string, DriftPoint[]>; metric: "mape" | "mae" }) {
  const outlets = Object.keys(series);
  // Union of x values so lines align on a shared axis.
  const labels = [...new Set(outlets.flatMap((o) => series[o].map((p) => p.label)))].sort();
  const rows = labels.map((label) => {
    const row: Record<string, string | number | null> = { label };
    for (const o of outlets) {
      const p = series[o].find((x) => x.label === label);
      row[o] = p ? p[metric] : null;
    }
    return row;
  });
  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={rows} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
          <XAxis dataKey="label" tick={{ fontSize: 11 }} minTickGap={24} />
          <YAxis tick={{ fontSize: 11 }} unit={metric === "mape" ? "%" : ""} />
          <Tooltip contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          {outlets.map((o, i) => (
            <Line key={o} dataKey={o} stroke={COLORS[i % COLORS.length]} strokeWidth={2} dot={{ r: 3 }} connectNulls />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
