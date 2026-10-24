"use client";

import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useAdminStats } from "@/hooks/use-admin-stats";
import { Loader2 } from "lucide-react";
import { FeedbackTab } from "@/components/admin/FeedbackTab";
import type { FeedbackStatus } from "@/components/admin/shared";

export default function AdminFeedbackPage() {
  const { data: session, status } = useAuth();
  const isAdmin = session?.user?.isAdmin === true;
  // «?open=<id>» из уведомления о новом обращении: открыть его, а не очередь «Новые»
  const [openId] = useState<string | null>(() =>
    typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("open")
  );
  const [statusFilter, setStatusFilter] = useState<FeedbackStatus | "all">(openId ? "all" : "new");
  const { data: stats } = useAdminStats(status === "authenticated" && isAdmin);

  return (
    <>
      {!stats && (
        <div className="flex justify-center py-6">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      )}
      <FeedbackTab
        statusFilter={statusFilter}
        onFilterChange={setStatusFilter}
        counts={stats?.feedback || { new: 0, inProgress: 0, resolved: 0 }}
        initialOpenId={openId}
      />
    </>
  );
}
