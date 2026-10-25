"use client"

import { useState } from "react"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Slider } from "@/components/ui/slider"
import { riskWeight, suggestedQty, type Range } from "@/lib/prep"

const RANGE: Range = { low: 41, likely: 54, high: 66 }
const MEDIAN_COST = 60
const SCALE_MIN = RANGE.low - 4
const SCALE_MAX = RANGE.high + 4

const pct = (n: number) => `${((n - SCALE_MIN) / (SCALE_MAX - SCALE_MIN)) * 100}%`

/** The real prep-plan formula from lib/prep, driven by a cost slider. */
export function PrepDemo() {
  const [cost, setCost] = useState(60)
  const weight = riskWeight(cost, MEDIAN_COST)
  const plates = suggestedQty(RANGE, weight)
  const label = weight >= 0.75 ? "lean high" : weight <= 0.35 ? "lean likely" : "balanced"

  return (
    <Card className="lp-card w-full">
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <CardTitle>Chicken Biryani · Sunday</CardTitle>
          <Badge variant="secondary">{label}</Badge>
        </div>
        <CardDescription>Drag the cost per plate. Cheap dishes lean towards the high forecast so you never run out; costly ones stay near likely.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="relative h-14" aria-hidden="true">
          <div className="absolute inset-x-0 top-6 h-2 rounded-full bg-muted" />
          <div
            className="absolute top-6 h-2 rounded-full bg-primary/25"
            style={{ left: pct(RANGE.low), width: `calc(${pct(RANGE.high)} - ${pct(RANGE.low)})` }}
          />
          {(["low", "likely", "high"] as const).map((k) => (
            <div key={k} className="absolute top-0 -translate-x-1/2 text-center text-[11px] text-muted-foreground" style={{ left: pct(RANGE[k]) }}>
              {k}
              <div className="mx-auto mt-1 h-4 w-px bg-border" />
              <div className="mt-2 tabular-nums">{RANGE[k]}</div>
            </div>
          ))}
          <div
            className="absolute top-[18px] size-4 -translate-x-1/2 rounded-full border-2 border-background bg-primary shadow-md transition-[left] duration-300 ease-[var(--ease-out-strong)]"
            style={{ left: pct(plates) }}
          />
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Cost per plate</span>
            <span className="tabular-nums font-medium">₹{cost}</span>
          </div>
          <Slider
            value={[cost]}
            min={25}
            max={180}
            step={5}
            onValueChange={(v) => setCost(Array.isArray(v) ? v[0] : v)}
            aria-label="Cost per plate"
          />
          <div className="flex justify-between text-[11px] text-muted-foreground">
            <span>cheap side</span>
            <span>menu median ₹{MEDIAN_COST}</span>
            <span>premium dish</span>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3 rounded-lg border bg-muted/40 p-3 text-center">
          <div>
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Risk weight</div>
            <div className="mt-1 text-lg font-semibold tabular-nums">{weight.toFixed(2)}</div>
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Prep</div>
            <div key={plates} className="lp-rise mt-1 text-lg font-semibold tabular-nums text-primary">{plates} plates</div>
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Ingredient cost</div>
            <div className="mt-1 text-lg font-semibold tabular-nums">₹{(plates * cost).toLocaleString("en-IN")}</div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
