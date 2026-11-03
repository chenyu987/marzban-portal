import Link from "next/link";
import { adminLogout } from "./actions";
import AdminNav from "./AdminNav";
import { Logo } from "../Brand";

export default function AdminHeader({ email }: { email: string }) {
  return (
    <header className="sticky top-0 z-10 -mx-4 mb-2 flex items-center gap-2 border-b border-base-300 bg-base-200/90 px-4 py-2 backdrop-blur">
      <Link href="/admin" className="mr-1 flex shrink-0 items-center gap-2 text-lg font-bold">
        <Logo size={26} />
        管理后台
      </Link>
      <AdminNav />
      {/* 点邮箱进「我的账户」；窄屏不放邮箱，写「账户」 */}
      <Link href="/admin/account" className="btn btn-ghost btn-sm shrink-0 font-normal text-base-content/70" aria-label="我的账户">
        <span className="hidden lg:inline">{email}</span>
        <span className="lg:hidden">账户</span>
      </Link>
      <form action={adminLogout} className="shrink-0">
        <button className="btn btn-ghost btn-sm">退出</button>
      </form>
    </header>
  );
}
