import Link from "next/link";
import { redirect } from "next/navigation";
import { currentCustomer } from "@/lib/session";
import { formatMoney } from "@/lib/format";
import { describePlan } from "@/lib/plans";
import { site } from "@/site.config";
import Brand, { Logo } from "./Brand";
import PricingCards, { type PricingGroup } from "./PricingCards";

export const dynamic = "force-dynamic";

// 首页：卖点、套餐价格、几步用上、常见问题。内容都在 site.config.ts 的 landing 里。
// 没配 landing 或 landingPublic: false 时首页只有品牌名和登录、注册按钮，已经登录的直接去「我的订阅」。
// 带 ?ref=推荐码 来的，注册按钮把推荐码带过去；已经登录的，按钮换成「进入我的订阅」
export default async function Home({ searchParams }: { searchParams: Promise<{ ref?: string | string[] }> }) {
  const me = await currentCustomer();
  const { ref } = await searchParams;
  const register = typeof ref === "string" && ref ? `/register?ref=${encodeURIComponent(ref.slice(0, 32))}` : "/register";
  const L = site.landingPublic === false ? undefined : site.landing;
  if (!L) {
    if (me) redirect("/dashboard");
    return (
      <main className="flex min-h-[70vh] flex-col items-center justify-center px-4 text-center">
        <Logo size={72} />
        <h1 className="mt-5 text-3xl font-extrabold tracking-tight">{site.brand}</h1>
        <p className="mt-2 text-base-content/60">{site.description}</p>
        <div className="mt-8 flex gap-3">
          <Link href="/login" className="btn btn-primary">
            登录
          </Link>
          <Link href={register} className="btn">
            注册
          </Link>
        </div>
      </main>
    );
  }

  // 每个档位一张价格卡，上面切周期（默认季付）；说明取价目表上那行
  const money = (fen: number) => `${site.currency}${formatMoney(fen).replace(/\.00$/, "")}`;
  const names = [...new Set(site.plans.map((p) => p.group ?? p.name))];
  const groups: PricingGroup[] = names.map((g) => {
    const plans = site.plans.filter((p) => (p.group ?? p.name) === g);
    const month = plans.find((p) => p.days <= 31) ?? plans[0];
    const show = site.planGroups?.[g];
    return {
      name: g,
      desc: show?.lines?.at(-1) ?? describePlan(month),
      badge: show?.highlight === "hot" ? "最受欢迎" : show?.highlight === "top" ? "旗舰" : null,
      plans: plans.map((p) => {
        const months = Math.max(1, Math.round(p.days / 30));
        const label = p.name.replace(g, "").trim();
        const save = month.price * months - p.price;
        return {
          label,
          per: label.endsWith("付") ? `/${label.slice(0, -1)}` : "",
          price: money(p.price),
          perMonth: months > 1 ? money(Math.round(p.price / months)) : null,
          save: months > 1 && save > 0 ? money(save) : null,
        };
      }),
    };
  });
  const periods = groups[0]?.plans.map((p) => p.label) ?? [];
  const firstPlans = site.plans.filter((p) => (p.group ?? p.name) === names[0]);
  const defaultPeriod = Math.max(0, firstPlans.findIndex((p) => p.days >= 85 && p.days <= 95));

  const cta = me ? (
    <Link href="/dashboard" className="btn btn-primary btn-lg">
      进入我的订阅
    </Link>
  ) : (
    <>
      <Link href={register} className="btn btn-primary btn-lg">
        免费注册
      </Link>
      <Link href="/login" className="btn btn-ghost btn-lg">
        登录
      </Link>
    </>
  );

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 border-b border-base-300/60 bg-base-100/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-2 px-4 py-3">
          <Brand size={30} className="flex-1 text-lg" />
          <a href="#pricing" className="btn btn-ghost btn-sm hidden sm:inline-flex">
            套餐价格
          </a>
          <a href="#faq" className="btn btn-ghost btn-sm hidden sm:inline-flex">
            常见问题
          </a>
          {me ? (
            <Link href="/dashboard" className="btn btn-primary btn-sm">
              我的订阅
            </Link>
          ) : (
            <>
              <Link href="/login" className="btn btn-ghost btn-sm">
                登录
              </Link>
              <Link href={register} className="btn btn-primary btn-sm">
                注册
              </Link>
            </>
          )}
        </div>
      </header>

      {/* 首屏 */}
      <section className="relative overflow-hidden">
        <div className="brand-gradient absolute -top-40 left-1/2 h-96 w-[48rem] -translate-x-1/2 rounded-full opacity-20 blur-3xl" aria-hidden />
        <div className="relative mx-auto flex max-w-4xl flex-col items-center px-4 pt-16 pb-12 text-center sm:pt-24">
          <Logo size={72} />
          <h1 className="mt-6 text-4xl font-extrabold tracking-tight sm:text-6xl">
            <span className="brand-gradient-text">{L?.headline ?? site.brand}</span>
          </h1>
          <p className="mt-4 max-w-2xl text-lg text-base-content/70 sm:text-xl">{L?.sub ?? site.description}</p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">{cta}</div>
        </div>
      </section>

      {/* 卖点 */}
      {L?.highlights && (
        <section className="mx-auto max-w-6xl px-4 py-12">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {L.highlights.map((h) => (
              <div key={h.title} className="rounded-box border border-base-300/70 bg-base-100 p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
                <div className="text-3xl" aria-hidden>
                  {h.icon}
                </div>
                <h3 className="mt-3 text-lg font-bold">{h.title}</h3>
                <p className="mt-1 text-sm text-base-content/70">{h.desc}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 价格 */}
      <section id="pricing" className="scroll-mt-20 bg-base-200/60 py-16">
        <div className="mx-auto max-w-6xl px-4">
          <h2 className="text-center text-3xl font-bold">套餐价格</h2>
          <p className="mt-2 text-center text-base-content/60">买得越久越便宜，续费时天数接着往后加</p>
          <PricingCards groups={groups} periods={periods} defaultPeriod={defaultPeriod} href={me ? "/plans" : register} cta={me ? "去购买" : "注册后购买"} />
          {site.planNotes && (
            <div className="mt-6 space-y-1 text-center text-sm text-base-content/50">
              {site.planNotes.map((n) => (
                <p key={n}>{n}</p>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* 几步用上 */}
      {L?.steps && (
        <section className="mx-auto max-w-5xl px-4 py-16">
          <h2 className="text-center text-3xl font-bold">{L.steps.length} 步就能用上</h2>
          <ol className="mt-8 grid gap-4 sm:grid-cols-3">
            {L.steps.map((s, i) => (
              <li key={s.title} className="rounded-box bg-base-100 p-5 text-center shadow-sm">
                <div className="brand-gradient mx-auto flex h-10 w-10 items-center justify-center rounded-full text-lg font-bold text-white">{i + 1}</div>
                <h3 className="mt-3 font-bold">{s.title}</h3>
                <p className="mt-1 text-sm text-base-content/60">{s.desc}</p>
              </li>
            ))}
          </ol>
        </section>
      )}

      {/* 常见问题 */}
      {L?.faq && (
        <section id="faq" className="mx-auto max-w-3xl scroll-mt-20 px-4 pb-16">
          <h2 className="mb-6 text-center text-3xl font-bold">常见问题</h2>
          <div className="flex flex-col gap-2">
            {L.faq.map((f, i) => (
              <details key={f.q} className="collapse collapse-arrow rounded-box bg-base-100 shadow-sm" open={i === 0}>
                <summary className="collapse-title font-medium">{f.q}</summary>
                <div className="collapse-content text-sm text-base-content/70">{f.a}</div>
              </details>
            ))}
          </div>
        </section>
      )}

      {/* 收尾 */}
      <section className="mx-auto max-w-5xl px-4 pb-20">
        <div className="brand-gradient flex flex-col items-center gap-4 rounded-box px-6 py-12 text-center text-white shadow-lg">
          <h2 className="text-2xl font-bold sm:text-3xl">现在就开始</h2>
          <p className="text-white/85">{L?.steps ? L.steps.map((s) => s.title).join(" → ") : site.description}</p>
          <Link href={me ? "/dashboard" : register} className="btn btn-lg border-none bg-white text-primary hover:bg-white/90">
            {me ? "进入我的订阅" : "免费注册"}
          </Link>
        </div>
      </section>
    </div>
  );
}
