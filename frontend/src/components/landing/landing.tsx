import type { CSSProperties, ReactNode } from "react"
import Link from "next/link"
import {
  ArrowRight,
  Bot,
  ChartNoAxesCombined,
  ChefHat,
  ClipboardList,
  FlaskConical,
  HandHeart,
  Leaf,
  Recycle,
  Sparkles,
  TrendingDown,
  TrendingUp,
  type LucideIcon,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { cn } from "cn"
import { CountUp } from "./count-up"
import { SpotlightCard, Tilt } from "./interactive"
import { PrepDemo } from "./prep-demo"
import { Reveal } from "./reveal"

const order = (i: number) => ({ "--i": i }) as CSSProperties

// Last two weeks of Filter Coffee sales at the demo outlet, then the forecast.
const SOLD = [141, 73, 152, 133, 185, 166, 100, 70, 92, 122, 107, 153, 157, 122]
const FORECAST = [{ low: 86, likely: 100, high: 113 }, { low: 76, likely: 91, high: 107 }, { low: 103, likely: 119, high: 136 }]
const PEAK = 200

const STEPS = [
  { title: "Forecast", body: "Every night each dish gets a 7-day low / likely / high forecast from sales, weather and holidays." },
  { title: "Plan", body: "The forecast becomes a prep list in plates and ingredients. Managers adjust and approve." },
  { title: "Cook", body: "Kitchen staff cook from the approved list on a large-button tablet view." },
  { title: "Log", body: "Sold, leftover and wasted plates are logged per shift, then the day is locked." },
  { title: "Learn", body: "Each week the models retrain, compete on the last 4 weeks and the winner is promoted." },
]

const AUDIENCE = ["Independent restaurants", "Cafés", "Cloud kitchens", "College canteens", "Office cafeterias", "Hostel messes", "Food courts", "Catering kitchens"]

/* ---------- small visuals for the bento cards ---------- */

function Sparkline() {
  const pts = [62, 34, 70, 58, 86, 76, 44, 30, 40, 56, 48, 70, 72, 56]
  const step = 300 / (pts.length + 2)
  const y = (v: number) => 80 - v * 0.8
  const line = pts.map((v, i) => `${i ? "L" : "M"}${(i * step).toFixed(1)},${y(v).toFixed(1)}`).join(" ")
  const x0 = (pts.length - 1) * step
  const band = `M${x0},${y(56)} L${x0 + step},${y(58)} L${x0 + 2 * step},${y(68)} L${x0 + 2 * step},${y(44)} L${x0 + step},${y(36)} L${x0},${y(56)} Z`
  return (
    <svg viewBox="0 0 300 80" className="h-24 w-full overflow-visible" preserveAspectRatio="none" aria-hidden="true">
      <path d={band} className="lp-cell fill-primary/15" style={{ ...order(20), "--o": 1 } as CSSProperties} />
      <path d={line} className="lp-wipe fill-none stroke-primary" strokeWidth={2} vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" />
      <path
        d={`M${x0},${y(56)} L${x0 + step},${y(47)} L${x0 + 2 * step},${y(56)}`}
        className="lp-cell fill-none stroke-primary"
        style={{ ...order(30), "--o": 1 } as CSSProperties}
        strokeWidth={2}
        vectorEffect="non-scaling-stroke"
        strokeDasharray="4 4"
      />
    </svg>
  )
}

function Heatmap() {
  const days = ["M", "T", "W", "T", "F", "S", "S"]
  return (
    <div className="grid grid-cols-[auto_repeat(12,minmax(0,1fr))] gap-1" aria-hidden="true">
      {days.map((d, r) => (
        <div key={`row${r}`} className="contents">
          <span className="pr-1 text-[10px] leading-4 text-muted-foreground">{d}</span>
          {Array.from({ length: 12 }, (_, c) => {
            const v = Math.abs(Math.sin(r * 12.9898 + c * 78.233) * 43758.5453) % 1
            const weekend = r >= 5 ? 0.25 : 0
            return (
              <span
                key={c}
                className="lp-cell h-4 rounded-[2px] bg-primary"
                style={{ ...order(r * 12 + c), "--o": Math.min(1, 0.12 + v * 0.6 + weekend) } as CSSProperties}
              />
            )
          })}
        </div>
      ))}
    </div>
  )
}

function ChatBubble() {
  return (
    <div className="space-y-2 text-xs" aria-hidden="true">
      <div className="lp-cell ml-auto w-fit max-w-[85%] rounded-lg rounded-br-sm bg-primary px-3 py-2 text-primary-foreground" style={{ ...order(0), "--o": 1 } as CSSProperties}>
        Which dish did we waste most last month?
      </div>
      <div className="lp-cell w-fit max-w-[90%] rounded-lg rounded-bl-sm border bg-background px-3 py-2" style={{ ...order(25), "--o": 1 } as CSSProperties}>
        Dal Makhani — 64 plates, mostly overproduction on Sundays.
      </div>
    </div>
  )
}

type Feature = { icon: LucideIcon; title: string; body: string; span?: boolean; visual?: ReactNode }

const FEATURES: Feature[] = [
  { icon: TrendingUp, title: "Forecasts with a range", body: "Plates per dish per day with a 10th–90th percentile band and a plain-language reason behind each number.", span: true, visual: <Sparkline /> },
  { icon: ClipboardList, title: "Risk-aware prep lists", body: "Cheap sides lean high so you never run out; costly mains stay near likely. Every adjustment is logged." },
  { icon: ChefHat, title: "Kitchen mode", body: "Large buttons for prepared, sold and leftover counts per shift, built for busy hands on a tablet." },
  { icon: Recycle, title: "Waste heatmap", body: "Log waste by reason with photos, then see exactly which dishes are thrown away on which days.", span: true, visual: <Heatmap /> },
  { icon: FlaskConical, title: "What-if simulator", body: "Try rain, a heatwave, a holiday or a discount and compare plates, cost and expected waste side by side." },
  { icon: Bot, title: "AI assistant", body: "Questions in plain words, answered from your own outlet’s data.", visual: <ChatBubble /> },
  { icon: HandHeart, title: "Surplus donations", body: "Predicted leftovers go to nearby NGOs, with a meals-donated counter on the dashboard." },
]

export function Landing() {
  return (
    <div className="flex min-h-svh flex-col overflow-x-clip bg-background">
      <header className="sticky top-0 z-30 border-b bg-background/75 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Link href="/" className="lp-press group flex items-center gap-2 font-semibold">
            <span className="flex size-7 items-center justify-center rounded-md bg-primary text-primary-foreground transition-transform duration-300 ease-[var(--ease-out-strong)] group-hover:rotate-[-12deg]">
              <Leaf className="size-4" aria-hidden="true" />
            </span>
            Zero Plate
          </Link>
          <nav className="hidden items-center gap-6 text-sm text-muted-foreground md:flex">
            {[["#how", "How it works"], ["#demo", "Try it"], ["#features", "Features"]].map(([href, label]) => (
              <a key={href} href={href} className="group relative transition-colors hover:text-foreground">
                {label}
                <span className="absolute -bottom-1 left-0 h-px w-full origin-left scale-x-0 bg-primary transition-transform duration-200 ease-[var(--ease-out-strong)] group-hover:scale-x-100" />
              </a>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" className="lp-press" nativeButton={false} render={<Link href="/login" />}>
              Sign in
            </Button>
            <Button size="sm" className="lp-press lp-shine" nativeButton={false} render={<Link href="/register" />}>
              Get started
            </Button>
          </div>
        </div>
      </header>

      <main className="flex-1">
        {/* Hero */}
        <section className="relative">
          <div className="lp-dots pointer-events-none absolute inset-0" aria-hidden="true" />
          <div className="lp-glow pointer-events-none absolute -top-24 right-[-10%] size-[38rem] rounded-full" aria-hidden="true" />
          <div className="lp-glow pointer-events-none absolute top-40 -left-40 size-[26rem] rounded-full opacity-60" style={{ animationDelay: "-6s" }} aria-hidden="true" />

          <div className="relative mx-auto grid max-w-6xl items-center gap-14 px-4 pt-16 pb-24 sm:px-6 lg:grid-cols-[1.05fr_1fr] lg:pt-24">
            <div>
              <Badge variant="secondary" className="lp-rise gap-1.5 border border-primary/20 bg-background/70 backdrop-blur" style={order(0)}>
                <Sparkles className="size-3 text-primary" aria-hidden="true" />
                AI demand forecasting for kitchens
              </Badge>
              <h1 className="lp-rise mt-5 text-4xl font-semibold leading-[1.08] sm:text-5xl xl:text-[3.4rem]" style={order(1)}>
                Cook what sells.
                <br />
                <span className="lp-shimmer">Waste less.</span>
              </h1>
              <p className="lp-rise mt-6 max-w-xl text-base leading-relaxed text-muted-foreground" style={order(2)}>
                Zero Plate predicts how many plates of each dish you will sell over the next week and turns it into a
                prep list your kitchen can follow — so you stop guessing, stop running out, and stop throwing food away.
              </p>
              <div className="lp-rise mt-8 flex flex-wrap gap-3" style={order(3)}>
                <Button size="lg" className="lp-press lp-shine h-11 px-5 shadow-md" nativeButton={false} render={<Link href="/register" />}>
                  Get started
                  <ArrowRight className="lp-arrow" data-icon="inline-end" aria-hidden="true" />
                </Button>
                <Button size="lg" variant="outline" className="lp-press h-11 bg-background/70 px-5 backdrop-blur" nativeButton={false} render={<Link href="/login" />}>
                  Open the demo
                </Button>
              </div>
              <div className="lp-rise mt-8 flex items-center gap-3 text-xs text-muted-foreground" style={order(4)}>
                <span className="flex -space-x-2">
                  {["SG", "AC", "BB"].map((t) => (
                    <span key={t} className="flex size-7 items-center justify-center rounded-full border-2 border-background bg-secondary text-[10px] font-semibold text-primary">
                      {t}
                    </span>
                  ))}
                </span>
                Demo: Spice Garden Group, Mumbai · 2 outlets · 26 weeks of sales
              </div>
            </div>

            {/* Product glimpse */}
            <div className="lp-rise relative" style={order(2)}>
              <Tilt>
                <Card className="border-primary/20 bg-card/90 shadow-xl backdrop-blur">
                  <CardHeader>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <CardDescription>Andheri Central · Filter Coffee</CardDescription>
                        <CardTitle className="mt-1 text-2xl tabular-nums">119 plates</CardTitle>
                        <p className="mt-1 text-xs text-muted-foreground">forecast for Tuesday · range 103–136</p>
                      </div>
                      <Badge variant="outline" className="gap-1">
                        <ChartNoAxesCombined className="size-3" aria-hidden="true" /> LightGBM
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="pb-9">
                    <div className="flex h-40 items-end gap-1.5" role="img" aria-label="Bar chart of the last 14 days of sales followed by a 3-day forecast range">
                      {SOLD.map((v, i) => (
                        <div key={i} className="lp-bar flex-1 rounded-t-sm bg-gradient-to-t from-primary/80 to-primary/45" style={{ height: `${(v / PEAK) * 100}%`, ...order(i) }} />
                      ))}
                      {FORECAST.map((f, i) => (
                        <div key={`f${i}`} className="relative flex-1 self-stretch">
                          <div
                            className="lp-bar absolute inset-x-0 rounded-sm bg-primary/15"
                            style={{ bottom: `${(f.low / PEAK) * 100}%`, height: `${((f.high - f.low) / PEAK) * 100}%`, ...order(SOLD.length + i) }}
                          />
                          <div
                            className="lp-bar absolute inset-x-0 rounded-t-sm border border-dashed border-primary bg-background/60"
                            style={{ bottom: 0, height: `${(f.likely / PEAK) * 100}%`, ...order(SOLD.length + i) }}
                          />
                        </div>
                      ))}
                    </div>
                    <div className="mt-3 flex items-center justify-between text-[11px] text-muted-foreground">
                      <span>last 14 days sold</span>
                      <span>next 3 days · likely + range</span>
                    </div>
                    <div className="mt-4 rounded-md border bg-muted/40 px-3 py-2 text-xs leading-relaxed">
                      <span className="font-medium text-foreground">Why: </span>
                      higher than usual because it is a weekday after a holiday and it will be cooler than last week.
                    </div>
                  </CardContent>
                </Card>
              </Tilt>

              <div className="lp-rise absolute -bottom-6 left-6 hidden sm:block" style={order(6)}>
                <div className="lp-float rounded-lg border bg-card/95 px-3 py-2 shadow-lg backdrop-blur">
                  <div className="text-[11px] text-muted-foreground">Prep plan · approved</div>
                  <div className="text-sm font-semibold">713 plates · ₹23,710</div>
                </div>
              </div>
              <div className="lp-rise absolute -right-3 -bottom-6 hidden sm:block" style={order(7)}>
                <div className="lp-float-slow flex items-center gap-2 rounded-lg border bg-card/95 px-3 py-2 shadow-lg backdrop-blur">
                  <span className="flex size-6 items-center justify-center rounded-md bg-primary/10 text-primary">
                    <TrendingDown className="size-3.5" aria-hidden="true" />
                  </span>
                  <div>
                    <div className="text-[11px] text-muted-foreground">Waste this month</div>
                    <div className="text-sm font-semibold">5.0% of plates</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Numbers */}
        <section className="border-y bg-card/60">
          <div className="mx-auto grid max-w-6xl grid-cols-2 gap-y-8 px-4 py-10 sm:px-6 md:grid-cols-4 md:divide-x">
            {[
              { to: 22, suffix: "–26%", label: "lower forecast error than “same day last week”" },
              { to: 80, suffix: "%", label: "of actual sales land inside the predicted range" },
              { to: 7, suffix: " days", label: "of forecasts per dish, refreshed every night" },
              { to: 14, suffix: "", label: "modules, from menu costing to donations" },
            ].map((s, i) => (
              <Reveal key={s.label} index={i} className="px-2 md:px-6">
                <div className="text-3xl font-semibold text-primary">
                  <CountUp to={s.to} suffix={s.suffix} />
                </div>
                <p className="mt-1 max-w-[16rem] text-xs leading-relaxed text-muted-foreground">{s.label}</p>
              </Reveal>
            ))}
          </div>
        </section>

        {/* How it works */}
        <section id="how" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-24 sm:px-6">
          <Reveal className="max-w-2xl">
            <p className="text-xs font-medium uppercase tracking-widest text-primary">How it works</p>
            <h2 className="mt-2 text-3xl font-semibold sm:text-4xl">A daily loop that gets smarter</h2>
            <p className="mt-3 text-muted-foreground">Set up your menu once. After that, every day of logged sales makes the next forecast better.</p>
          </Reveal>
          <Reveal className="relative mt-12">
            <ol className="grid gap-6 md:grid-cols-5">
              {STEPS.map((s, i) => (
                <li key={s.title} className="group relative">
                  {i < STEPS.length - 1 && (
                    <span
                      className="lp-line absolute top-4 left-10 hidden h-px w-[calc(100%-1.5rem)] bg-primary/40 md:block"
                      style={{ transitionDelay: `${200 + i * 180}ms` }}
                      aria-hidden="true"
                    />
                  )}
                  <span className="relative z-10 flex size-8 items-center justify-center rounded-full border border-primary/30 bg-background text-sm font-semibold text-primary transition-colors duration-200 group-hover:bg-primary group-hover:text-primary-foreground">
                    {i + 1}
                  </span>
                  <h3 className="mt-4 font-semibold">{s.title}</h3>
                  <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{s.body}</p>
                </li>
              ))}
            </ol>
          </Reveal>
        </section>

        {/* Interactive demo */}
        <section id="demo" className="relative scroll-mt-20 border-y bg-muted/40">
          <div className="lp-dots pointer-events-none absolute inset-0 opacity-60" aria-hidden="true" />
          <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-4 py-24 sm:px-6 lg:grid-cols-2">
            <Reveal>
              <p className="text-xs font-medium uppercase tracking-widest text-primary">Try it</p>
              <h2 className="mt-2 text-3xl font-semibold sm:text-4xl">Not every dish deserves the same safety margin</h2>
              <p className="mt-3 leading-relaxed text-muted-foreground">
                Running out of a ₹30 side loses a sale for almost nothing. Over-cooking a ₹160 biryani throws money away.
                Zero Plate weighs each dish by its cost against the menu median and picks a number between the likely
                and high forecast.
              </p>
              <p className="mt-3 text-sm text-muted-foreground">This card runs the exact formula the prep planner uses — drag the slider.</p>
            </Reveal>
            <Reveal index={1}>
              <PrepDemo />
            </Reveal>
          </div>
        </section>

        {/* Features (bento) */}
        <section id="features" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-24 sm:px-6">
          <Reveal className="max-w-2xl">
            <p className="text-xs font-medium uppercase tracking-widest text-primary">Features</p>
            <h2 className="mt-2 text-3xl font-semibold sm:text-4xl">Everything between the forecast and the bin</h2>
          </Reveal>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f, i) => (
              <Reveal key={f.title} index={i % 3} className={cn(f.span && "lg:col-span-2")}>
                <SpotlightCard className="h-full rounded-xl">
                  <Card className="lp-card h-full">
                    <CardHeader>
                      <span className="lp-icon flex size-9 items-center justify-center rounded-md bg-primary/10 text-primary">
                        <f.icon className="size-5" aria-hidden="true" />
                      </span>
                      <CardTitle className="mt-3">{f.title}</CardTitle>
                      <CardDescription className="leading-relaxed">{f.body}</CardDescription>
                    </CardHeader>
                    {f.visual && <CardContent className="mt-auto">{f.visual}</CardContent>}
                  </Card>
                </SpotlightCard>
              </Reveal>
            ))}
          </div>
        </section>

        {/* Audience marquee */}
        <section className="border-y bg-card/60 py-6">
          <div className="mx-auto flex max-w-6xl items-center gap-6 px-4 sm:px-6">
            <span className="shrink-0 text-xs font-medium uppercase tracking-widest text-muted-foreground">Built for</span>
            <div className="lp-marquee overflow-hidden">
              <div className="lp-marquee-track flex w-max gap-3">
                {[...AUDIENCE, ...AUDIENCE].map((a, i) => (
                  <Badge key={i} variant="outline" className="bg-background px-3 py-1" aria-hidden={i >= AUDIENCE.length}>
                    {a}
                  </Badge>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="px-4 py-24 sm:px-6">
          <Reveal className="mx-auto max-w-6xl">
            <div className="relative overflow-hidden rounded-2xl bg-primary px-6 py-12 text-primary-foreground shadow-xl sm:px-12">
              <div className="lp-stripes pointer-events-none absolute inset-0" aria-hidden="true" />
              <div className="relative flex flex-col items-start justify-between gap-6 md:flex-row md:items-center">
                <div>
                  <h2 className="flex items-center gap-2 text-2xl font-semibold sm:text-3xl">
                    <HandHeart className="size-7" aria-hidden="true" /> Less waste, more meals donated
                  </h2>
                  <p className="mt-2 max-w-xl text-sm opacity-85">
                    Set up your outlet in minutes. Import past sales from a spreadsheet and get your first forecast the same day.
                  </p>
                </div>
                <Button size="lg" variant="secondary" className="lp-press lp-shine h-11 px-5 shadow-md" nativeButton={false} render={<Link href="/register" />}>
                  Create your restaurant
                  <ArrowRight className="lp-arrow" data-icon="inline-end" aria-hidden="true" />
                </Button>
              </div>
            </div>
          </Reveal>
        </section>
      </main>

      <footer className="border-t">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-2 px-4 py-6 text-xs text-muted-foreground sm:flex-row sm:px-6">
          <span className="flex items-center gap-1.5">
            <Leaf className="size-3.5 text-primary" aria-hidden="true" /> Zero Plate · AI demand forecasting to cut restaurant food waste
          </span>
        </div>
      </footer>
    </div>
  )
}
