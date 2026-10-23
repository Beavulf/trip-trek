import { GroupScreen } from "@/components/split/group-screen";

export default async function SplitGroupPage({ params }: { params: Promise<{ groupId: string }> }) {
  const { groupId } = await params;
  return <GroupScreen groupId={groupId} />;
}
