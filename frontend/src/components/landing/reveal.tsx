"use client"

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react"
import { cn } from "cn"

/** Fades its children up once they scroll into view (see .lp-reveal). */
export function Reveal({
  children,
  index = 0,
  className,
  as: Tag = "div",
}: {
  children: ReactNode
  index?: number
  className?: string
  as?: "div" | "section" | "li"
}) {
  const ref = useRef<HTMLElement>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true)
          io.disconnect()
        }
      },
      { rootMargin: "0px 0px -80px 0px" },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])

  return (
    <Tag
      ref={ref as never}
      data-visible={visible}
      className={cn("lp-reveal", className)}
      style={{ "--i": index } as CSSProperties}
    >
      {children}
    </Tag>
  )
}
