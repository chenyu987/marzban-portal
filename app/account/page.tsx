import Link from "next/link";
import { requireCustomer, countSessions } from "@/lib/session";
import { BRAND } from "@/lib/clients";
import { CLIENTS } from "@/lib/account";
import { logout } from "../actions";
import { EmailForm, LogoutOthers, PasswordForm, PrefsForm, WechatForm } from "./AccountForms";

export const dynamic = "force-dynamic";

// 客人自己的账户：改微信号、登录邮箱、密码，常用客户端和到期提醒，退出其他设备
export default async function AccountPage() {
  const customer = await requireCustomer();
  const sessions = await countSessions(customer.id);
  return (
    <div className="mx-auto max-w-2xl px-4 pb-16">
      <header className="navbar px-0">
        <Link href="/dashboard" className="flex-1 text-xl font-bold">
          {BRAND}
        </Link>
        <Link href="/dashboard" className="btn btn-ghost btn-sm">
          我的订阅
        </Link>
        <form action={logout}>
          <button className="btn btn-ghost btn-sm">退出</button>
        </form>
      </header>

      <h1 className="mt-4 mb-1 text-2xl font-bold">账户</h1>
      <p className="mb-6 text-sm text-base-content/60">改了马上生效。</p>

      <div className="flex flex-col gap-4">
        <Section title="微信号" desc="客服有事会加你这个微信，比如线路调整、续费提醒。">
          <WechatForm current={customer.wechat ?? ""} />
        </Section>
        <Section title="登录邮箱" desc={`现在是 ${customer.email}。改的时候要输一次密码，防止别人趁你登录着把账号改走。`}>
          <EmailForm />
        </Section>
        <Section title="密码" desc="改完以后，别的设备上的登录会自动退出，这台不用重新登录。">
          <PasswordForm />
        </Section>
        <Section title="偏好">
          <PrefsForm client={customer.pref_client ?? ""} notify={!!customer.notify_expiry} clients={CLIENTS} />
        </Section>
        <Section title="登录的设备" desc={`现在有 ${sessions} 台设备登录着这个账号。手机丢了、在别人电脑上登过，可以把其他设备都退出。`}>
          <LogoutOthers />
        </Section>
        <p className="text-sm text-base-content/50">要注销账号请联系客服：账号连着余额和订阅，注销前客服会和你确认怎么处理。</p>
      </div>
    </div>
  );
}

function Section({ title, desc, children }: { title: string; desc?: string; children: React.ReactNode }) {
  return (
    <section className="card bg-base-100 shadow-sm">
      <div className="card-body gap-3">
        <h2 className="card-title text-base">{title}</h2>
        {desc && <p className="-mt-1 text-sm text-base-content/60">{desc}</p>}
        {children}
      </div>
    </section>
  );
}
