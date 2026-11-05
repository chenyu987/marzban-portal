import Link from "next/link";
import { cookies } from "next/headers";
import { adminPrefs, requireAdmin } from "@/lib/admin";
import { db, nowSec } from "@/lib/env";
import { formatDate, formatExpire } from "@/lib/format";
import { describeDevice, logActionLabels } from "@/lib/admin-account";
import { PAGE_SIZES, sortLabels } from "@/lib/admin-users";
import { getT } from "@/lib/lang";
import LangSwitch from "../../LangSwitch";
import { THEME_COOKIE, parseTheme } from "@/lib/theme";
import AdminHeader from "../AdminHeader";
import ThemeSwitch from "../../ThemeSwitch";
import { AdminPasswordForm, LogoutSessionsButton, PrefsForm } from "./Forms";
import TzSwitch from "../../TzSwitch";
import { DEFAULT_TZ, TZ_AUTO, TZ_AUTO_COOKIE, TZ_COOKIE } from "@/lib/timezone";
import { getTz } from "@/lib/tz-server";

export const dynamic = "force-dynamic";

function Section({ title, desc, children, testid }: { title: string; desc?: string; children: React.ReactNode; testid?: string }) {
  return (
    <section className="card bg-base-100 shadow-sm" data-testid={testid}>
      <div className="card-body gap-3">
        <div>
          <h2 className="card-title text-base">{title}</h2>
          {desc && <p className="text-sm text-base-content/60">{desc}</p>}
        </div>
        {children}
      </div>
    </section>
  );
}

// 管理员「我的账户」：外观、改密码、登录中的设备、后台偏好、我最近的操作。只看、只改自己
export default async function AdminAccountPage() {
  const admin = await requireAdmin();
  const { t, lang } = await getT();
  const now = nowSec();
  const [me, { results: sessions }, { results: logs }, prefs] = await Promise.all([
    db().prepare("SELECT created_at, last_login_at FROM admins WHERE id = ?").bind(admin.id).first<{ created_at: number; last_login_at: number | null }>(),
    db()
      .prepare("SELECT id, created_at, last_seen_at, user_agent, ip FROM admin_sessions WHERE admin_id = ? AND expires_at > ? ORDER BY COALESCE(last_seen_at, created_at) DESC")
      .bind(admin.id, now)
      .all<{ id: string; created_at: number; last_seen_at: number | null; user_agent: string | null; ip: string | null }>(),
    db()
      .prepare("SELECT id, action, target, detail, created_at FROM admin_logs WHERE admin_id = ? ORDER BY id DESC LIMIT 20")
      .bind(admin.id)
      .all<{ id: number; action: string; target: string | null; detail: string | null; created_at: number }>(),
    adminPrefs(admin.id),
  ]);
  const jar = await cookies();
  const theme = parseTheme(jar.get(THEME_COOKIE)?.value);
  const tzChosen = decodeURIComponent(jar.get(TZ_COOKIE)?.value ?? TZ_AUTO);
  const tzDevice = decodeURIComponent(jar.get(TZ_AUTO_COOKIE)?.value ?? DEFAULT_TZ);
  const tz = await getTz();
  const others = sessions.filter((s) => s.id !== admin.sid).length;

  return (
    // 外框和别的后台页一样宽（顶栏不挤），内容收窄到 3xl
    <div className="mx-auto max-w-5xl px-4 pb-16">
      <AdminHeader email={admin.email} />
      <div className="mx-auto max-w-3xl">
      <h1 className="mt-4 mb-4 text-2xl font-bold">{t("我的账户", "My account")}</h1>
      {/* 顶上一张名片：头像字母、邮箱、身份；下面两格写账号哪天建的、这次什么时候登录的 */}
      <section className="card mb-4 bg-base-100 shadow-sm" data-testid="admin-profile">
        <div className="card-body gap-4 sm:flex-row sm:items-center">
          <div className="flex min-w-0 flex-1 items-center gap-4">
            <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xl font-bold text-primary" aria-hidden>
              {admin.email.slice(0, 1).toUpperCase()}
            </span>
            <div className="min-w-0">
              <div className="truncate text-lg font-semibold">{admin.email}</div>
              <span className="badge badge-soft badge-primary badge-sm mt-1">{t("管理员", "Admin")}</span>
            </div>
          </div>
          <dl className="grid grid-cols-2 gap-x-8 gap-y-1 text-sm sm:text-right">
            <dt className="text-xs text-base-content/50">{t("账号创建", "Created")}</dt>
            <dt className="text-xs text-base-content/50">{t("这次登录", "This login")}</dt>
            <dd className="tabular-nums">{me ? formatDate(me.created_at, lang, tz) : "-"}</dd>
            <dd className="tabular-nums">{me?.last_login_at ? formatExpire(me.last_login_at, lang, tz) : "-"}</dd>
          </dl>
        </div>
      </section>

      <div className="flex flex-col gap-4">
        <Section
          title={t("语言", "Language")}
          desc={t("后台页面用中文还是英文，只对这台设备生效。操作日志里存下的说明照原样显示。", "Admin pages in Chinese or English, on this device only. Details already saved in the activity log stay as written.")}
          testid="admin-lang"
        >
          <LangSwitch size="sm" />
        </Section>

        <Section title={t("外观", "Appearance")} desc={t("只对这台设备上的后台生效，客人那边不受影响。", "Applies to the admin on this device only; customers aren't affected.")}>
          <div data-testid="admin-theme">
            <ThemeSwitch current={theme} />
          </div>
        </Section>

        <Section
          title={t("时区", "Time zone")}
          desc={t(
            "后台页面上的时间（下单、到期、日志）按哪个时区显示，只对这台设备生效。填到期时间的输入框和「本月」统计照旧按北京时间。",
            "Time zone for times shown in the admin (orders, expiry, logs), on this device only. Expiry inputs and “this month” stats still use Beijing time.",
          )}
          testid="admin-tz"
        >
          <TzSwitch chosen={tzChosen} device={tzDevice} />
        </Section>

        <Section
          title={t("后台偏好", "Admin preferences")}
          desc={t("订阅列表打开时默认怎么显示。网址里带了条件的话，以网址为准。", "Defaults for the subscription list. Conditions in the URL take priority.")}
          testid="admin-prefs"
        >
          <PrefsForm pageSize={prefs.pageSize} sort={prefs.sort} time={prefs.time} pageSizes={PAGE_SIZES} sorts={sortLabels(lang)} />
        </Section>

        <Section
          title={t("登录中的设备", "Signed-in devices")}
          desc={t("后台登录 12 小时后自动失效。看到不认识的设备，退出它并改密码。", "Admin sessions expire after 12 hours. If you see a device you don't recognise, log it out and change your password.")}
          testid="admin-sessions"
        >
          <ul className="divide-y divide-base-300">
            {sessions.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                <div>
                  <div className="font-medium">
                    {describeDevice(s.user_agent, lang)}
                    {s.id === admin.sid && <span className="badge badge-soft badge-success badge-sm ml-2">{t("这台设备", "This device")}</span>}
                  </div>
                  <div className="text-xs text-base-content/60">
                    {t("登录于", "Signed in")} {formatExpire(s.created_at, lang, tz)} · {t("最后活动", "last active")} {formatExpire(s.last_seen_at ?? s.created_at, lang, tz)}
                    {s.ip && <> · IP {s.ip}</>}
                  </div>
                </div>
                {s.id !== admin.sid && <LogoutSessionsButton sid={s.id} label={t("退出", "Log out")} />}
              </li>
            ))}
          </ul>
          <LogoutSessionsButton label={others ? t(`退出其他 ${others} 台设备`, `Log out ${others} other device(s)`) : t("没有别的设备登录着", "No other devices signed in")} disabled={!others} />
        </Section>

        <Section title={t("改密码", "Change password")}>
          <AdminPasswordForm />
        </Section>

        <Section title={t("我最近的操作", "My recent activity")} desc={t("只列最近 20 条。", "Last 20 entries only.")} testid="admin-my-logs">
          {logs.length === 0 ? (
            <p className="text-sm text-base-content/60">{t("还没有操作记录。", "No activity yet.")}</p>
          ) : (
            <ul className="divide-y divide-base-300 text-sm">
              {logs.map((l) => (
                <li key={l.id} className="flex flex-wrap gap-x-3 py-1.5">
                  <span className="w-36 shrink-0 text-base-content/60">{formatExpire(l.created_at, lang, tz)}</span>
                  <span className="font-medium">{logActionLabels(lang)[l.action] ?? l.action}</span>
                  {l.target && <span>{l.target}</span>}
                  {l.detail && <span className="text-base-content/60">{l.detail}</span>}
                </li>
              ))}
            </ul>
          )}
          <Link href={`/admin/logs?admin=${encodeURIComponent(admin.email)}`} className="link link-primary text-sm">
            {t("看我的全部操作", "See all my activity")}
          </Link>
        </Section>
      </div>
      </div>
    </div>
  );
}
