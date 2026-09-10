// Единая проверка премиума — изоморфная (без серверных импортов),
// чтобы новый код (админка) не плодил инлайн-копии выражения.
// Существующие 6 мест в api/* пока оставлены как есть — вне скоупа.

export function isPremiumUser(u: { plan: string; planExpiry: Date | string | null }): boolean {
  return u.plan === "premium" && (!u.planExpiry || new Date(u.planExpiry) > new Date());
}
