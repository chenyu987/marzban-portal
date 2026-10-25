import Link from "next/link";
import { adminLogout } from "./actions";

export default function AdminHeader({ email }: { email: string }) {
  return (
    <header className="navbar gap-1 px-0">
      <Link href="/admin" className="mr-2 text-xl font-bold">
        管理后台
      </Link>
      <div className="flex flex-1 gap-1">
        <Link href="/admin" className="btn btn-ghost btn-sm">
          订单
        </Link>
        <Link href="/admin/customers" className="btn btn-ghost btn-sm">
          客人
        </Link>
      </div>
      <span className="mr-2 hidden text-sm text-base-content/60 sm:inline">{email}</span>
      <form action={adminLogout}>
        <button className="btn btn-ghost btn-sm">退出</button>
      </form>
    </header>
  );
}
