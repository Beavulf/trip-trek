import type { ReactNode } from "react";
import { AdminShell } from "@/components/admin/shell";

// Оболочка /admin/*: гейт по роли, сайдбар на ПК, шапка с чипами на мобиле
export default function AdminLayout({ children }: { children: ReactNode }) {
  return <AdminShell>{children}</AdminShell>;
}
