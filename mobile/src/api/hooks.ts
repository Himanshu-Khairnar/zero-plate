import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useOutlet } from "@/context/outlet";
import { api } from "./client";
import type { KitchenLogBody, WasteBody } from "./types";

// Every outlet-scoped key starts with [name, outletId] so switching outlet refetches.

export function useDashboard() {
  const { outletId } = useOutlet();
  return useQuery({ queryKey: ["dashboard", outletId], queryFn: () => api.dashboard(outletId) });
}

export function useForecasts(days = 7) {
  const { outletId } = useOutlet();
  return useQuery({ queryKey: ["forecasts", outletId, days], queryFn: () => api.forecasts(outletId, days) });
}

/** Omit `date` for the server default (tomorrow). */
export function usePrepPlan(date?: string) {
  const { outletId } = useOutlet();
  return useQuery({ queryKey: ["prep-plan", outletId, date ?? "default"], queryFn: () => api.prepPlan(outletId, date) });
}

export function useApprovePrepPlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.approvePrepPlan(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["prep-plan"] });
      void qc.invalidateQueries({ queryKey: ["dashboard"] });
      void qc.invalidateQueries({ queryKey: ["kitchen"] });
    },
  });
}

/** Omit `date` for the server default (today, UTC). */
export function useKitchen(date?: string) {
  const { outletId } = useOutlet();
  return useQuery({ queryKey: ["kitchen", outletId, date ?? "default"], queryFn: () => api.kitchen(outletId, date) });
}

/** Saves several dish rows for one shift (sequentially), then refreshes once. */
export function useKitchenLog() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (rows: KitchenLogBody[]) => {
      for (const row of rows) await api.kitchenLog(row);
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ["kitchen"] });
      void qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}

export function useWaste(limit = 30) {
  const { outletId } = useOutlet();
  return useQuery({ queryKey: ["waste", outletId, limit], queryFn: () => api.waste(outletId, limit) });
}

export function useWasteOptions() {
  const { outletId } = useOutlet();
  return useQuery({
    queryKey: ["waste-options", outletId],
    queryFn: () => api.wasteOptions(outletId),
    staleTime: 5 * 60_000,
  });
}

export function useLogWaste() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: WasteBody) => api.logWaste(body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["waste"] });
      void qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}

export function useAlerts() {
  const { outletId } = useOutlet();
  return useQuery({ queryKey: ["alerts", outletId], queryFn: () => api.alerts(outletId) });
}

export function useMarkAlertRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.markAlertRead(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["alerts"] });
      void qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}

export function useDonations() {
  const { outletId } = useOutlet();
  return useQuery({ queryKey: ["donations", outletId], queryFn: () => api.donations(outletId) });
}

export function useAssistant() {
  const { outletId } = useOutlet();
  return useMutation({ mutationFn: (message: string) => api.assistant(outletId, message) });
}
