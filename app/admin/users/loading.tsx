// 订阅列表要去 Marzban 查，等的时候先放骨架
import { getT } from "@/lib/lang";

export default async function Loading() {
  const { t } = await getT();
  return (
    <div className="mx-auto max-w-6xl px-4 pt-20 pb-16" aria-busy="true" aria-label={t("加载中", "Loading")}>
      <div className="skeleton mb-4 h-8 w-32" />
      <div className="skeleton mb-4 h-20 w-full" />
      <div className="flex flex-col gap-2">
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="skeleton h-10 w-full" />
        ))}
      </div>
    </div>
  );
}
