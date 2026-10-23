import { QuickAdd } from "@/components/split/quick-add";

// Быстрая трата: адрес стабильный (его кладут на экран «Домой» / в ярлык приложения) и не редиректит —
// на iPhone «На экран Домой» сохраняет ТЕКУЩИЙ адрес, а редирект привязал бы иконку к одной группе.
export default function SplitAddPage() {
  return <QuickAdd />;
}
