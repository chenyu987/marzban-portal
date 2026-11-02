import Link from "next/link";
import { Logo } from "./Brand";
import ContactSupport from "./ContactSupport";

// 打错网址、链接过期时看到的页面
export default function NotFound() {
  return (
    <main className="flex min-h-[70vh] flex-col items-center justify-center gap-4 px-4 text-center">
      <Logo size={56} />
      <p className="brand-gradient-text text-6xl font-extrabold">404</p>
      <h1 className="text-xl font-bold">这个页面不存在</h1>
      <p className="max-w-sm text-base-content/60">可能是网址打错了，或者链接已经过期。</p>
      <div className="flex gap-2">
        <Link href="/" className="btn btn-primary">
          回首页
        </Link>
        <Link href="/dashboard" className="btn">
          我的订阅
        </Link>
      </div>
      <ContactSupport className="mt-2 justify-center" />
    </main>
  );
}
