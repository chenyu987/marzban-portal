import { requireCustomer } from "@/lib/session";
import { EmailForm, PasswordForm, PrefsForm, WechatForm } from "./AccountForms";
import CustomerNav from "../CustomerNav";
import LangSwitch from "../LangSwitch";
import ThemeSwitch from "../ThemeSwitch";
import { cookies } from "next/headers";
import { THEME_COOKIE, parseTheme } from "@/lib/theme";
import { getT } from "@/lib/lang";
import TzSwitch from "../TzSwitch";
import { DEFAULT_TZ, TZ_AUTO, TZ_AUTO_COOKIE, TZ_COOKIE } from "@/lib/timezone";

export const dynamic = "force-dynamic";

// 客人自己的账户：改微信号、登录邮箱、密码，到期提醒，深浅色，语言
export default async function AccountPage() {
  const customer = await requireCustomer();
  const { t } = await getT();
  const jar = await cookies();
  const theme = parseTheme(jar.get(THEME_COOKIE)?.value);
  const tzChosen = jar.get(TZ_COOKIE)?.value ?? TZ_AUTO;
  const tzDevice = jar.get(TZ_AUTO_COOKIE)?.value ?? DEFAULT_TZ;
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
            "月付到期前 2 天和当天各发一封；季付、半年、一年到期前 7 天、2 天和当天各发一封。",
            "Monthly plans: 2 days before and on the day. Quarterly, 6-month and yearly plans: 7 days, 2 days before and on the day.",
          )}
        >
          <PrefsForm notify={!!customer.notify_expiry} />
        </Section>
        <Section title={t("外观", "Appearance")} desc={t("跟随系统时，手机或电脑是深色模式就用深色。", "System follows your device's dark mode setting.")}>
          <div data-testid="account-theme">
            <ThemeSwitch current={theme} />
          </div>
        </Section>
        <Section title={t("时区", "Time zone")} desc={t("到期时间、下单时间这些按哪个时区显示。只对这台设备生效。", "Which time zone to show expiry and order times in. Applies to this device only.")}>
          <TzSwitch chosen={decodeURIComponent(tzChosen)} device={decodeURIComponent(tzDevice)} />
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
