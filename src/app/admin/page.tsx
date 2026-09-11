"use client";

import { useAuth } from "@/hooks/use-auth";
import { useAdminStats } from "@/hooks/use-admin-stats";
import { Loader2 } from "lucide-react";
import { OverviewTab } from "@/components/admin/OverviewTab";

export default function AdminOverviewPage() {
  const { data: session, status } = useAuth();
  const isAdmin = session?.user?.isAdmin === true;
  const { data: stats, isLoading } = useAdminStats(status === "authenticated" && isAdmin);

  if (isLoading || !stats) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return <OverviewTab stats={stats} />;
}
