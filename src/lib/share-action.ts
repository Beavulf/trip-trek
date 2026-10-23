// Web Share API есть не везде (Firefox на ПК — нет, на телефонах — почти везде):
// по наличию navigator.share решаем, открывать системное меню или сразу копировать.
export type ShareAction = "native" | "clipboard";

export function resolveShareAction(
  nav?: { share?: (data?: ShareData) => Promise<void> } | null
): ShareAction {
  return typeof nav?.share === "function" ? "native" : "clipboard";
}
