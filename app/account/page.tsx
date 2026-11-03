import { requireCustomer } from "@/lib/session";
import { EmailForm, PasswordForm, PrefsForm, WechatForm } from "./AccountForms";
import CustomerNav from "../CustomerNav";
import LangSwitch from "../LangSwitch";
import { getT } from "@/lib/lang";

export const dynamic = "force-dynamic";

// 客人自己的账户：改微信号、登录邮箱、密码，到期提醒
export default async function AccountPage() {
  const customer = await requireCustomer();
  const { t } = await getT();
  return (
    <div className="mx-auto max-w-2xl px-4 pb-16">
      <CustomerNav />

      <h1 className="mt-4 mb-6 text-2xl font-bold">{t("账户", "Account")}</h1>

      <div className="flex flex-col gap-4">
        <Section title={t("微信号", "WeChat ID")} desc={t("客服有事会加你这个微信，比如节点更新。", "Support will add you on WeChat when needed, e.g. for server updates.")}>
          <WechatForm current={customer.wechat ?? ""} />
        </Section>
        <Section
          title={t("登录邮箱", "Login email")}
          desc={t(`现在是 ${customer.email}。改的时候要输一次密码。`, `Currently ${customer.email}. You'll need your password to change it.`)}
        >
          <EmailForm />
        </Section>
        <Section
          title={t("密码", "Password")}
          desc={t("改完以后，别的设备上的登录会自动退出，这台不用重新登录。", "After changing it, other devices are logged out; this one stays logged in.")}
        >
          <PasswordForm />
        </Section>
        <Section
          title={t("到期提醒", "Expiry reminders")}
          desc={t(
            "月付到期前 3 天和当天各发一封；季付、半年、一年到期前 7 天、3 天和当天各发一封；免费体验到期前 1 天和当天各发一封。",
            "Monthly plans: 3 days before and on the day. Quarterly, 6-month and yearly plans: 7 days, 3 days before and on the day. Free trials: 1 day before and on the day.",
          )}
        >
          <PrefsForm notify={!!customer.notify_expiry} />
        </Section>
        <Section title={t("语言", "Language")} desc={t("网站和提醒邮件用的语言。", "Used for the website and reminder emails.")}>
          <div data-testid="account-lang">
            <LangSwitch size="sm" />
          </div>
        </Section>
        <p className="text-sm text-base-content/50">
          {t(
            "要注销账号请联系客服：账号连着余额和订阅，注销前客服会和你确认怎么处理。",
            "To delete your account, contact support. Your account holds your balance and subscriptions, so we'll confirm how to handle them first.",
          )}
        </p>
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
