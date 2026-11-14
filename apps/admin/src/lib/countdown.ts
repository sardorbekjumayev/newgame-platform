"use client";

import { useEffect, useState } from "react";

/** Muddatgacha qolgan soniyalar (har soniyada yangilanadi). */
export function useSecondsLeft(iso: string) {
  const calc = () => Math.max(0, Math.round((new Date(iso).getTime() - Date.now()) / 1000));
  const [left, setLeft] = useState(calc);
  useEffect(() => {
    const id = setInterval(() => setLeft(Math.max(0, Math.round((new Date(iso).getTime() - Date.now()) / 1000))), 1000);
    return () => clearInterval(id);
  }, [iso]);
  return left;
}

export const mmss = (s: number) => ({ m: String(Math.floor(s / 60)), s: String(s % 60).padStart(2, "0") });
