"use client";

import { Area, Bar, BarChart, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis, Cell } from "recharts";

import { formatDate } from "@/lib/dates";
import { inr } from "@/lib/format";
import type { AccuracyPoint, DayPoint, ReasonSlice } from "@/lib/analytics";

const tooltipStyle = { background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 };
const short = (d: string) => formatDate(d, { day: "numeric", month: "short" });

export function RevenueChart({ data }: { data: DayPoint[] }) {
  const rows = data.map((d) => ({ ...d, label: short(d.date) }));
  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={rows} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
          <XAxis dataKey="label" tick={{ fontSize: 11 }} minTickGap={24} />
          <YAxis yAxisId="rev" tick={{ fontSize: 11 }} tickFormatter={(v) => `₹${Math.round(Number(v) / 1000)}k`} />
          <YAxis yAxisId="plates" orientation="right" tick={{ fontSize: 11 }} />
          <Tooltip contentStyle={tooltipStyle} formatter={(v, name) => [name === "revenue" ? inr(Number(v)) : Math.round(Number(v)), name === "revenue" ? "Revenue" : "Plates"]} labelFormatter={(_, p) => (p?.[0]?.payload?.date ? formatDate(p[0].payload.date, { weekday: "long", day: "numeric", month: "long" }) : "")} />
          <Legend wrapperStyle={{ fontSize: 12 }} formatter={(v) => (v === "revenue" ? "Revenue" : "Plates sold")} />
          <Bar yAxisId="plates" dataKey="plates" fill="var(--chart-2)" radius={[3, 3, 0, 0]} maxBarSize={16} />
          <Line yAxisId="rev" dataKey="revenue" stroke="var(--chart-1)" strokeWidth={2} dot={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

export function WasteByReasonChart({ data }: { data: ReasonSlice[] }) {
  const labels: Record<string, string> = { overproduction: "Overproduction", spoilage: "Spoilage", plate_waste: "Plate waste", prep_loss: "Prep loss" };
  const rows = data.map((d) => ({ ...d, label: labels[d.reason] ?? d.reason }));
  const colors = ["var(--chart-4)", "var(--chart-2)", "var(--chart-3)", "var(--chart-5)"];
  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} layout="vertical" margin={{ top: 8, right: 16, left: 24, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
          <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v) => inr(Number(v))} />
          <YAxis type="category" dataKey="label" tick={{ fontSize: 11 }} width={100} />
          <Tooltip contentStyle={tooltipStyle} formatter={(v, name, item) => [name === "cost" ? `${inr(Number(v))} · ${Math.round(item.payload.plates)} plates` : v, "Cost"]} />
          <Bar dataKey="cost" radius={[0, 4, 4, 0]} maxBarSize={22}>
            {rows.map((_, i) => <Cell key={i} fill={colors[i % colors.length]} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function AccuracyChart({ data }: { data: AccuracyPoint[] }) {
  const rows = data.map((d) => ({ ...d, band: d.high - d.low, label: short(d.date) }));
  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={rows} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
          <XAxis dataKey="label" tick={{ fontSize: 11 }} minTickGap={24} />
          <YAxis tick={{ fontSize: 11 }} />
          <Tooltip contentStyle={tooltipStyle} formatter={(v, name) => (name === "band" || name === "low" ? [null, null] : [Math.round(Number(v)), name === "actual" ? "Sold" : "Forecast"])} labelFormatter={(_, p) => (p?.[0]?.payload?.date ? formatDate(p[0].payload.date, { weekday: "long", day: "numeric", month: "long" }) : "")} />
          <Legend wrapperStyle={{ fontSize: 12 }} formatter={(v) => (v === "actual" ? "Sold" : v === "likely" ? "Forecast (likely)" : v === "band" ? "Range" : v)} />
          <Area dataKey="low" stackId="r" stroke="none" fill="transparent" legendType="none" tooltipType="none" isAnimationActive={false} />
          <Area dataKey="band" stackId="r" stroke="none" fill="var(--primary)" fillOpacity={0.15} isAnimationActive={false} />
          <Line dataKey="likely" stroke="var(--primary)" strokeWidth={2} dot={false} />
          <Line dataKey="actual" stroke="var(--chart-4)" strokeWidth={2} dot={{ r: 2 }} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

export type MenuPoint = { name: string; group: string; popularity: number; margin: number; price: number };

const GROUP_COLOR: Record<string, string> = { star: "var(--chart-1)", plowhorse: "var(--chart-2)", puzzle: "var(--chart-3)", dog: "var(--chart-4)" };

export function MenuEngineeringChart({ data, medians }: { data: MenuPoint[]; medians: { popularity: number; margin: number } | null }) {
  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ScatterChart margin={{ top: 12, right: 16, left: -8, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
          <XAxis type="number" dataKey="popularity" name="Plates / day" tick={{ fontSize: 11 }} label={{ value: "plates per day", position: "insideBottom", offset: -4, fontSize: 11 }} />
          <YAxis type="number" dataKey="margin" name="Margin" tick={{ fontSize: 11 }} tickFormatter={(v) => `₹${v}`} />
          <ZAxis range={[60, 60]} />
          <Tooltip contentStyle={tooltipStyle} cursor={{ strokeDasharray: "3 3" }} formatter={(v, name) => [name === "Margin" ? inr(Number(v)) : Number(v).toFixed(1), name]} labelFormatter={() => ""} content={({ payload }) => {
            const p = payload?.[0]?.payload as MenuPoint | undefined;
            if (!p) return null;
            return <div style={tooltipStyle} className="p-2"><strong>{p.name}</strong><div className="capitalize">{p.group}</div><div>{p.popularity.toFixed(1)} plates/day · margin {inr(p.margin)}</div></div>;
          }} />
          {medians ? (
            <>
              <Scatter data={[{ popularity: medians.popularity, margin: medians.margin }]} fill="transparent" legendType="none" isAnimationActive={false} shape={() => <g />} />
            </>
          ) : null}
          <Scatter data={data} isAnimationActive={false}>
            {data.map((d, i) => <Cell key={i} fill={GROUP_COLOR[d.group] ?? "var(--muted-foreground)"} />)}
          </Scatter>
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  );
}
