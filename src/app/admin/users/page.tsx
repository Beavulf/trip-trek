"use client";

import { useAuth } from "@/hooks/use-auth";
import { Loader2 } from "lucide-react";
import { UsersTab } from "@/components/admin/UsersTab";

export default function AdminUsersPage() {
  const { data: session } = useAuth();
  const userId = session?.user?.id;

  if (!userId) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return <UsersTab selfId={userId} />;
}
