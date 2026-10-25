import Link from "next/link";
import { adminLogout } from "./actions";

export default function AdminHeader({ email }: { email: string }) {
  return (
    <header className="navbar px-0">
      <Link href="/admin" className="flex-1 text-xl font-bold">
        管理后台
      </Link>
      <span className="mr-2 hidden text-sm text-base-content/60 sm:inline">{email}</span>
      <form action={adminLogout}>
        <button className="btn btn-ghost btn-sm">退出</button>
      </form>
    </header>
  );
}
