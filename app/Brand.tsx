import Link from "next/link";
import { site } from "@/site.config";

// 品牌标志：有 logo 就显示图标 + 品牌名，没有就只有品牌名
export function Logo({ size = 32 }: { size?: number }) {
  if (!site.logo?.svg) return null;
  return <img src={site.logo.svg} alt="" width={size} height={size} className="shrink-0" />;
}

export default function Brand({ href = "/", size = 32, className = "" }: { href?: string; size?: number; className?: string }) {
  return (
    <Link href={href} className={`flex items-center gap-2 font-bold tracking-tight ${className}`}>
      <Logo size={size} />
      <span>{site.brand}</span>
    </Link>
  );
}
