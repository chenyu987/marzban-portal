import { requireCustomer } from "@/lib/session";
import { EmailForm, PasswordForm, PrefsForm, WechatForm } from "./AccountForms";
import CustomerNav from "../CustomerNav";

export const dynamic = "force-dynamic";

// 客人自己的账户：改微信号、登录邮箱、密码，到期提醒
export default async function AccountPage() {
  const customer = await requireCustomer();
  return (
    <div className="mx-auto max-w-2xl px-4 pb-16">
      <CustomerNav />

      <h1 className="mt-4 mb-6 text-2xl font-bold">账户</h1>

      <div className="flex flex-col gap-4">
        <Section title="微信号" desc="客服有事会加你这个微信，比如节点更新。">
          <WechatForm current={customer.wechat ?? ""} />
        </Section>
        <Section title="登录邮箱" desc={`现在是 ${customer.email}。改的时候要输一次密码。`}>
          <EmailForm />
        </Section>
        <Section title="密码" desc="改完以后，别的设备上的登录会自动退出，这台不用重新登录。">
          <PasswordForm />
        </Section>
        <Section title="到期提醒">
          <PrefsForm notify={!!customer.notify_expiry} />
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
