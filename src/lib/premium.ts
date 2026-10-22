// Единая проверка премиума — изоморфная (без серверных импортов),
// чтобы новый код (админка) не плодил инлайн-копии выражения.
// Значок «Premium» в достижениях (api/user) считается по plan без срока —
// это достижение, а не доступ; доступ везде решает isPremiumUser.

export function isPremiumUser(u: { plan: string; planExpiry: Date | string | null }): boolean {
  return u.plan === "premium" && (!u.planExpiry || new Date(u.planExpiry) > new Date());
}
