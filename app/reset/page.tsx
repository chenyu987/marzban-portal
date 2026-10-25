import Link from "next/link";
import { db, nowSec } from "@/lib/env";
import { hashResetToken } from "@/lib/reset";
import { BRAND } from "@/lib/clients";
import ResetForm from "./ResetForm";

export const dynamic = "force-dynamic";

// 打开重置链接：先看链接还能不能用，能用才显示设置新密码的表单
export default async function ResetPage({ searchParams }: { searchParams: Promise<{ token?: string | string[] }> }) {
  const { token } = await searchParams;
  const valid =
    typeof token === "string" &&
    !!(await db()
      .prepare("SELECT 1 FROM password_resets WHERE token_hash = ? AND used_at IS NULL AND expires_at > ?")
      .bind(await hashResetToken(token), nowSec())
      .first());

  if (valid) return <ResetForm token={token as string} />;
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="card w-full max-w-sm bg-base-100 shadow-md">
        <div className="card-body gap-4">
          <h1 className="text-2xl font-bold">{BRAND}</h1>
          <p>这个链接已经失效了（用过了或者过期了）。</p>
          <Link href="/forgot" className="btn btn-primary">
            重新申请
          </Link>
        </div>
      </div>
    </main>
  );
}
