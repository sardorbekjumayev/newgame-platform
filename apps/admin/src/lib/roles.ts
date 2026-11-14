import type { Me } from "@ng/types";

/** Panel turi foydalanuvchi roliga qarab (bitta login, bitta ilova). */
export type PanelKind = "platform" | "operator" | "manager";

export const HOME: Record<PanelKind, string> = { platform: "/platform", operator: "/operator", manager: "/manager" };

export function panelOf(me: Me | null | undefined): PanelKind | null {
  const roles = new Set(me?.roles.map((r) => r.role) ?? []);
  if (roles.has("SUPER_ADMIN")) return "platform";
  if (roles.has("MANAGER")) return "manager";
  if (roles.has("OPERATOR")) return "operator";
  return null;
}

/** Yo'l qaysi panelga tegishli (boshqa rol ochsa — o'z bosh sahifasiga). */
export const panelOfPath = (path: string): PanelKind | null =>
  path.startsWith("/platform") ? "platform" : path.startsWith("/operator") ? "operator" : path.startsWith("/manager") ? "manager" : null;
