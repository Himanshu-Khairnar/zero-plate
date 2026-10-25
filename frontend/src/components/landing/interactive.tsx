"use client"

import { useEffect, useRef, type PointerEvent, type ReactNode } from "react"
import { cn } from "cn"

/** Tilts toward the cursor with a little momentum (decorative, fine pointers only). */
export function Tilt({ children, className, max = 6 }: { children: ReactNode; className?: string; max?: number }) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return

    let target = { x: 0, y: 0 }
    const current = { x: 0, y: 0 }
    let frame = 0

    const loop = () => {
      // Ease toward the target each frame so the card trails the cursor.
      current.x += (target.x - current.x) * 0.12
      current.y += (target.y - current.y) * 0.12
      el.style.transform = `perspective(900px) rotateX(${current.y.toFixed(2)}deg) rotateY(${current.x.toFixed(2)}deg)`
      if (Math.abs(target.x - current.x) > 0.01 || Math.abs(target.y - current.y) > 0.01) {
        frame = requestAnimationFrame(loop)
      } else {
        frame = 0
      }
    }
    const kick = () => {
      if (!frame) frame = requestAnimationFrame(loop)
    }
    const onMove = (e: globalThis.PointerEvent) => {
      const r = el.getBoundingClientRect()
      const px = (e.clientX - r.left) / r.width - 0.5
      const py = (e.clientY - r.top) / r.height - 0.5
      target = { x: px * max * 2, y: -py * max * 2 }
      kick()
    }
    const onLeave = () => {
      target = { x: 0, y: 0 }
      kick()
    }

    el.addEventListener("pointermove", onMove)
    el.addEventListener("pointerleave", onLeave)
    return () => {
      el.removeEventListener("pointermove", onMove)
      el.removeEventListener("pointerleave", onLeave)
      cancelAnimationFrame(frame)
    }
  }, [max])

  return (
    <div ref={ref} className={cn("lp-tilt", className)}>
      {children}
    </div>
  )
}

/** Card wrapper whose ::before glow follows the cursor (see .lp-spot). */
export function SpotlightCard({ children, className }: { children: ReactNode; className?: string }) {
  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    e.currentTarget.style.setProperty("--mx", `${e.clientX - r.left}px`)
    e.currentTarget.style.setProperty("--my", `${e.clientY - r.top}px`)
  }

  return (
    <div onPointerMove={onMove} className={cn("lp-spot", className)}>
      {children}
    </div>
  )
}
