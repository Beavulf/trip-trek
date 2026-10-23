import { GroupScreen } from "@/components/split/group-screen";

export default async function SplitGroupPage({ params }: { params: Promise<{ groupId: string }> }) {
  const { groupId } = await params;
  // key: при смене группы (переключатель в форме траты) экран собирается заново — иначе в форме остался бы
  // плательщик/состав прежней группы
  return <GroupScreen key={groupId} groupId={groupId} />;
}
