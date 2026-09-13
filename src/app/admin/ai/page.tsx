"use client";

import { Loader2 } from "lucide-react";
import { AiTab } from "@/components/admin/AiTab";

export default function AdminAiPage() {
  return (
    <>
      <AiTab fallback={<Loader2 className="size-8 animate-spin text-muted-foreground" />} />
    </>
  );
}
