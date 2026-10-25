import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

import type { Outlet } from "@/api/types";
import { getItem, KEYS, setItem } from "@/lib/storage";

type OutletContextValue = {
  outlets: Outlet[];
  outlet: Outlet;
  outletId: string;
  setOutletId: (id: string) => void;
};

const OutletContext = createContext<OutletContextValue | null>(null);

/** Holds the selected outlet; every outlet-scoped request reads `outletId` from here. */
export function OutletProvider({ outlets, children }: { outlets: Outlet[]; children: ReactNode }) {
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    getItem(KEYS.outlet).then((id) => {
      if (id) setSelected(id);
    });
  }, []);

  const setOutletId = useCallback((id: string) => {
    setSelected(id);
    void setItem(KEYS.outlet, id);
  }, []);

  const outlet = outlets.find((o) => o.id === selected) ?? outlets[0];

  const value = useMemo(
    () => (outlet ? { outlets, outlet, outletId: outlet.id, setOutletId } : null),
    [outlets, outlet, setOutletId],
  );

  if (!value) return null; // guarded by the tabs layout (no-outlet state)
  return <OutletContext.Provider value={value}>{children}</OutletContext.Provider>;
}

export function useOutlet() {
  const ctx = useContext(OutletContext);
  if (!ctx) throw new Error("useOutlet must be used inside OutletProvider");
  return ctx;
}
