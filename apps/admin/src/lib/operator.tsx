"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import type { OperatorDashboard } from "@/lib/types";
import { useApi } from "@/lib/use-api";

type Ctx = { data: OperatorDashboard | null; error: string | null; reload: () => void; setData: (d: OperatorDashboard) => void };
const OperatorContext = createContext<Ctx | null>(null);

/** Operator paneli uchun umumiy ma'lumot (klub, menejerlar, so'rovlar) — 5 soniyada yangilanadi (kod tez ko'rinishi uchun). */
export function OperatorProvider({ children }: { children: React.ReactNode }) {
  const [tick, setTick] = useState(0);
  const d = useApi<OperatorDashboard>(`/operator/dashboard?t=${tick}`);
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 5000);
    return () => clearInterval(id);
  }, []);
  const reload = useCallback(() => setTick((n) => n + 1), []);
  return <OperatorContext.Provider value={{ data: d.data, error: d.error, reload, setData: d.setData }}>{children}</OperatorContext.Provider>;
}

export function useOperator() {
  const ctx = useContext(OperatorContext);
  if (!ctx) throw new Error("useOperator must be used inside OperatorProvider");
  return ctx;
}
