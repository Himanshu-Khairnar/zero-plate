"use client"

import { useState } from "react"
import { ChevronDown } from "lucide-react"

export type OutletOption = {
  id: string
  name: string
}

export function OutletSelector({ outlets }: { outlets: OutletOption[] }) {
  const [selected, setSelected] = useState(outlets[0]?.id ?? "")

  if (outlets.length === 0) {
    return (
      <span className="text-sm text-muted-foreground">No outlets yet</span>
    )
  }

  return (
    <div className="relative inline-flex items-center">
      <select
        value={selected}
        onChange={(event) => setSelected(event.target.value)}
        aria-label="Select outlet"
        className="h-9 appearance-none rounded-lg border border-input bg-background pr-9 pl-3 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        {outlets.map((outlet) => (
          <option key={outlet.id} value={outlet.id}>
            {outlet.name}
          </option>
        ))}
      </select>
      <ChevronDown
        className="pointer-events-none absolute right-3 size-4 text-muted-foreground"
        aria-hidden="true"
      />
    </div>
  )
}
