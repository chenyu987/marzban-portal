"use client";

import Link from "next/link";
import { useSite } from "./SiteContext";

// 品牌标志：有 logo 就显示图标 + 品牌名，没有就只有品牌名
export function Logo({ size = 32 }: { size?: number }) {
  const { logoSvg } = useSite();
  if (!logoSvg) return null;
  return <img src={logoSvg} alt="" width={size} height={size} className="shrink-0" />;
}

export default function Brand({ href = "/", size = 32, className = "" }: { href?: string; size?: number; className?: string }) {
  const { brand } = useSite();
  return (
    <Link href={href} className={`flex items-center gap-2 font-bold tracking-tight ${className}`}>
      <Logo size={size} />
      <span>{brand}</span>
    </Link>
  );
}
