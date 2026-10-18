"use client";

import { Area, Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatDate } from "@/lib/dates";

export type ChartPoint = {
  date: string;
  actual?: number | null;
  low?: number | null;
  likely?: number | null;
  high?: number | null;
};

export function ForecastChart({ data, dishName }: { data: ChartPoint[]; dishName: string }) {
  const rows = data.map((d) => ({
    ...d,
    band: d.low != null && d.high != null ? d.high - d.low : null,
    label: formatDate(d.date, { day: "numeric", month: "short" }),
  }));
  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={rows} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
          <XAxis dataKey="label" tick={{ fontSize: 11 }} interval="preserveStartEnd" minTickGap={24} />
          <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
          <Tooltip
            contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }}
            formatter={(value, name) => {
              if (name === "band") return [null, null];
              const label = name === "actual" ? "Sold" : name === "likely" ? "Likely" : name === "low" ? "Low" : String(name);
              return [typeof value === "number" ? Math.round(value) : value, label];
            }}
            labelFormatter={(_, payload) => {
              const d = payload?.[0]?.payload?.date as string | undefined;
              return d ? formatDate(d, { weekday: "long", day: "numeric", month: "long" }) : "";
            }}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} formatter={(v) => (v === "actual" ? `${dishName} sold` : v === "likely" ? "Forecast (likely)" : v === "band" ? "Range (low–high)" : v)} />
          <Bar dataKey="actual" fill="var(--chart-2)" radius={[3, 3, 0, 0]} maxBarSize={18} />
          <Area dataKey="low" stackId="range" stroke="none" fill="transparent" legendType="none" tooltipType="none" isAnimationActive={false} />
          <Area dataKey="band" stackId="range" stroke="none" fill="var(--primary)" fillOpacity={0.15} isAnimationActive={false} />
          <Line dataKey="likely" stroke="var(--primary)" strokeWidth={2} dot={{ r: 3 }} connectNulls={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
