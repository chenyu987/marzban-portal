import { Fragment } from "react";
import Link from "next/link";
import { headers } from "next/headers";
import { detectPlatform, type Platform } from "@/lib/clients";
import { site } from "@/site.config";

const DOWNLOADS = site.downloads;
import CopyRules from "./CopyRules";
import RulesToggle from "./RulesToggle";
import Brand from "../Brand";
import CustomerNav from "../CustomerNav";
import ContactSupport from "../ContactSupport";
import { requireCustomer } from "@/lib/session";
import { getT } from "@/lib/lang";
import { makeT, type Lang } from "@/lib/i18n";

// iPhone 用 Shadowrocket，Mac 和 Windows 用 Clash Verge，安卓用 Hiddify。
// 手动导入 yaml 文件（「我的订阅」里的「下载 Clash 配置文件」）只当备选：那不是订阅，节点变了不会自动更新

function Steps({ children }: { children: React.ReactNode }) {
  return <ol className="list-decimal space-y-3 pl-5">{children}</ol>;
}

// Mac 和 Windows 的 Clash Verge 步骤只差安装那一步。截图是在 Mac 上截的，Windows 界面一样，共用。
// 分流规则是可选的：Marzban 默认的 Clash 配置是全局模式，不加规则所有网站都走节点，照样能连。
// 两个标签页的锚点 id 带上系统名（mac-connect / windows-connect），不然跳转会跳到另一个标签页里
function ClashVergeSteps({ os, lang, MySubs }: { os: "mac" | "windows"; lang: Lang; MySubs: () => React.ReactNode }) {
  const zh = lang === "zh";
  const t = makeT(lang);
  const connectId = `${os}-connect`;
  return (
    <Steps>
      <li>
        <b>{t("安装", "Install")}</b>
        {t("：", ": ")}
        <Ext href={DOWNLOADS.clashVerge}>{t("下载 Clash Verge", "Download Clash Verge")}</Ext>
        <div className="mt-1 text-sm text-base-content/70">
          {os === "mac"
            ? t(
                "M 系列芯片的 Mac 选文件名带 aarch64 的 dmg，Intel 芯片的选带 x64 的。",
                "On Apple silicon (M-series) Macs, pick the dmg with aarch64 in its name; on Intel Macs, pick the one with x64.",
              )
            : t(
                "选文件名以 x64-setup.exe 结尾的安装包（绝大多数电脑都是这个），下载后双击安装。如果弹出「Windows 已保护你的电脑」，点「更多信息」→「仍要运行」。",
                "Pick the installer ending in x64-setup.exe (that's the right one for almost every PC) and double-click it. If you see \"Windows protected your PC\", click More info → Run anyway.",
              )}
        </div>
      </li>
      <li>
        {zh ? (
          <>
            <b>导入订阅</b>：在本机打开 <MySubs /> 点「导入 Clash Verge」；或者打开 Clash Verge 左边的「订阅」，
            把订阅链接粘贴到顶部输入框，点「导入」。
          </>
        ) : (
          <>
            <b>Import the subscription</b>: on this computer, open <MySubs /> and click &quot;Import to Clash Verge&quot;. Or open Profiles on
            the left of Clash Verge, paste the subscription link into the box at the top, and click Import.
          </>
        )}
        <Shot name="mac-import" alt={t("Clash Verge 订阅页", "Clash Verge Profiles page")} />
      </li>
      <li>
        <b>{t("加分流规则（可选但强烈推荐）", "Add routing rules (optional but strongly recommended)")}</b>
        {/* 外面只留一句话，详细说明和步骤都收在 RulesToggle 里，不想加的客人直接看下一步 */}
        <div className="mt-1 text-sm text-base-content/70">
          {t(
            "让 ChatGPT、Claude 固定走海外节点，降低 AI 账号被风控的风险；国内网站直接连，速度不受影响，也不占套餐流量。不加也能正常使用，可以直接看下一步。",
            "Keeps ChatGPT and Claude on overseas servers to lower the risk of AI account bans, and lets Chinese sites connect directly so they stay fast and don't use your data. Everything works without them, so you can go straight to the next step.",
          )}
        </div>
        <RulesToggle>
          <div className="mt-3 rounded-box bg-base-200 p-3 text-sm">
            {zh ? (
              <ul className="list-disc space-y-1 pl-5">
                <li>
                  <b>降低 AI 封号风险</b>：ChatGPT、Claude 对登录地区查得严，IP 一会儿在国内、一会儿在海外，容易触发验证甚至封号。加上规则后，它们固定走海外节点，访问来源更稳定。
                </li>
                <li>
                  <b>国内网站更流畅</b>：淘宝、B 站、微信、网银这些国内网站和 App 直接连，速度和不开 VPN 一样，不会绕到国外再回来，也不占套餐流量。
                </li>
                <li>
                  <b>Steam 下游戏不占流量</b>：Steam 下载游戏直接连，不绕节点，几十 G 的游戏也不占套餐流量；商店、好友照常走节点。
                </li>
                <li>
                  <b>不加会怎样</b>：所有网站都走节点，国外网站照样能上；只是国内网站会变慢、算进流量，个别国内 App 会把你当成海外用户。
                </li>
                <li>
                  <b>建议</b>：用 ChatGPT、Claude 的，玩 Steam 的，每天都开着 VPN 的，或者用普通版（每月有流量上限）的，花两分钟加上。
                </li>
              </ul>
            ) : (
              <ul className="list-disc space-y-1 pl-5">
                <li>
                  <b>Lower the risk of AI account bans</b>: ChatGPT and Claude watch where you connect from closely. Switching between Chinese and
                  overseas IPs can trigger verification or even a ban. These rules always send them through an overseas server, so your connection
                  looks consistent.
                </li>
                <li>
                  <b>Chinese sites stay fast</b>: Taobao, Bilibili, WeChat, online banking and other Chinese sites and apps connect directly, as fast
                  as with the VPN off, without a round trip abroad and without using your data.
                </li>
                <li>
                  <b>Steam downloads don't use your data</b>: Steam game downloads connect directly instead of going through the server, so even
                  huge games don't count against your data. The store and friends list still go through the server.
                </li>
                <li>
                  <b>Without them</b>: every site goes through the server, so overseas sites still work; Chinese sites are slower and count against
                  your data, and a few Chinese apps may treat you as an overseas user.
                </li>
                <li>
                  <b>Our advice</b>: if you use ChatGPT or Claude, play on Steam, keep the VPN on every day, or are on Standard (monthly data cap), take two
                  minutes to add them.
                </li>
              </ul>
            )}
            <a href={`#${connectId}`} className="btn btn-outline btn-sm mt-3">
              {t("不加了，跳到「连接」↓", "Skip, go to Connect ↓")}
            </a>
          </div>
          <div className="mt-3">
            {zh ? (
              <>
                <b>怎么加</b>：右键刚导入的订阅 → 选「扩展覆写配置」→ 把下面的规则粘贴进去并保存。
              </>
            ) : (
              <>
                <b>How</b>: right-click the subscription you just imported → choose the extended override config option → paste the rules below
                and save.
              </>
            )}
          </div>
          <Shot name="mac-override-menu" alt={t("右键订阅选扩展覆写配置", "Right-click the subscription to open the override config")} />
          <Shot name="mac-override-edit" alt={t("粘贴规则", "Paste the rules")} />
          <div className="mt-2">
            <CopyRules />
          </div>
          <div className="text-sm text-base-content/70">
            {t("保存后到左边「规则」页看一眼，能看到这些规则就说明生效了。", "After saving, check the Rules page on the left. If you see these rules, they're active.")}
          </div>
          <div className="mt-1 text-sm text-base-content/70">
            {zh ? (
              <>
                复制规则总出错、或者用的是只能导入文件的 Clash 客户端：在 <MySubs /> 点「下载 Clash 配置文件」，里面已经带好这些规则，
                直接导入就行。这个文件不会自动更新，节点有变化要重新下载。
              </>
            ) : (
              <>
                If pasting the rules keeps failing, or your Clash app only imports files: click &quot;Download Clash config&quot; in <MySubs />. The
                file already includes these rules. It won&apos;t update itself, so download it again when servers change.
              </>
            )}
          </div>
          <Shot name="mac-rules" alt={t("规则页里能看到这些规则", "The rules appear on the Rules page")} />
        </RulesToggle>
      </li>
      <li id={connectId} className="scroll-mt-24">
        {zh ? (
          <>
            <b>连接</b>：回到「首页」，选一个节点，打开「系统代理」。
          </>
        ) : (
          <>
            <b>Connect</b>: go back to Home, pick a server and turn on System Proxy.
          </>
        )}
        <Shot name="mac-connect" alt={t("首页选节点、打开系统代理", "Pick a server on Home and turn on System Proxy")} />
      </li>
      <li>
        {zh ? (
          <>
            <b>日常使用</b>：在首页点「延迟测试」找延迟最低的节点。发现节点连不上，到「订阅」页点刷新按钮更新订阅。
          </>
        ) : (
          <>
            <b>Everyday use</b>: run the latency test on Home to find the fastest server. If servers stop working, click the refresh button on
            the Profiles page to update the subscription.
          </>
        )}
        <Shot name="mac-latency" alt={t("延迟测试按钮", "Latency test button")} />
        <Shot name="mac-refresh" alt={t("订阅的刷新按钮", "Subscription refresh button")} />
      </li>
    </Steps>
  );
}

function Ext({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className="btn btn-outline btn-xs ml-1">
      {children}
    </a>
  );
}

// 步骤截图，在 public/site/tutorial/ 下，本站专属所以不同步到公开仓库；site.tutorialShots 关掉就不显示
function Shot({ name, alt, narrow }: { name: string; alt: string; narrow?: boolean }) {
  if (!site.tutorialShots) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`/site/tutorial/${name}.webp`}
      alt={alt}
      loading="lazy"
      className={`mt-2 rounded-box border border-base-300 ${narrow ? "max-w-48" : "w-full max-w-md"}`}
    />
  );
}

// 2026-11-07 起 Mac 和 Windows 主推 Clash Verge，Hiddify 收起来当备选，两边步骤一样只差安装包。
// 下载固定在 site.downloads.hiddifyWindows 那个版本（v4.1.1）：截图是这个版本截的，新版界面变了；这个版本也有 Mac 的 dmg。
// 截图是在 Windows 上截的，Mac 界面一样，共用
function HiddifyAlt({ os, lang, MySubs }: { os: "mac" | "windows"; lang: Lang; MySubs: () => React.ReactNode }) {
  const zh = lang === "zh";
  const t = makeT(lang);
  return (
    <details className="collapse-arrow collapse mt-6 bg-base-200/60">
      <summary className="collapse-title font-medium">
        {t("备选：用 Hiddify（Clash Verge 装不上或连不上时）", "Alternative: Hiddify (if Clash Verge won't install or connect)")}
      </summary>
      <div className="collapse-content">
        <Steps>
          <li>
            <b>{t("安装", "Install")}</b>
            {t("：", ": ")}
            <Ext href={DOWNLOADS.hiddifyWindows}>{t("下载 Hiddify", "Download Hiddify")}</Ext>
            <div className="mt-1 text-sm text-base-content/70">
              {os === "mac"
                ? t(
                    "下载 Hiddify-MacOS.dmg，打开后把 Hiddify 拖进「应用程序」。",
                    "Download Hiddify-MacOS.dmg, open it and drag Hiddify into Applications.",
                  )
                : t("下载文件名带 Windows-Setup 的安装包。", "Download the installer with Windows-Setup in its name.")}
            </div>
          </li>
          <li>
            {zh ? (
              <>
                <b>导入订阅</b>：在 <MySubs /> 点「复制订阅链接」，然后在 Hiddify 里点「剪贴板」。
              </>
            ) : (
              <>
                <b>Import the subscription</b>: in <MySubs />, click &quot;Copy subscription link&quot;, then click Clipboard in Hiddify.
              </>
            )}
            <Shot name="win-import" alt={t("Hiddify 从剪贴板添加", "Add from clipboard in Hiddify")} />
          </li>
          <li>
            <b>{t("连接", "Connect")}</b>
            {t("：点中间的连接按钮。", ": click the connect button in the middle.")}
            <Shot name="win-connect" alt={t("Hiddify 已连接", "Hiddify connected")} />
          </li>
          <li>
            <b>{t("切换节点", "Switch servers")}</b>
            {t("：点右下角的箭头。", ": click the arrow in the bottom-right.")}
            <Shot name="win-switch" alt={t("Hiddify 节点列表", "Hiddify server list")} />
          </li>
          <li>
            <b>{t("日常使用", "Everyday use")}</b>
            {t(
              "：Hiddify 启动时会自动更新订阅并测速。发现节点连不上，点订阅左边的刷新按钮。",
              ": Hiddify updates the subscription and tests speed when it starts. If servers stop working, click the refresh button to the left of the subscription.",
            )}
            <Shot name="win-refresh" alt={t("Hiddify 刷新订阅按钮", "Hiddify refresh button")} />
          </li>
        </Steps>
      </div>
    </details>
  );
}

// 教程按客人选的语言整段换：中文和英文各写一份，图里的客户端按钮名英文版用客户端英文界面的叫法
function tabs(lang: Lang): { id: Platform; label: string; content: React.ReactNode }[] {
  const zh = lang === "zh";
  const t = makeT(lang);
  const MySubs = () => (
    <Link href="/dashboard" className="link link-primary">
      {t("我的订阅", "My subscription")}
    </Link>
  );
  return [
    {
      id: "ios",
      label: "iPhone",
      content: (
        <>
          <h2 className="text-lg font-bold">{t("Shadowrocket（小火箭）", "Shadowrocket")}</h2>
          <Steps>
            <li>
              {zh ? (
                <>
                  <b>安装</b>：Shadowrocket 在国区 App Store 搜不到，要用<b>美区 Apple ID</b> 登录 App Store
                  再搜索安装，一次性付费约 $3。如果没有美区 Apple ID，请联系客服。
                </>
              ) : (
                <>
                  <b>Install</b>: Shadowrocket isn&apos;t in the China App Store. Sign in to the App Store with a <b>US Apple ID</b>, then
                  search and install it (a one-time purchase of about $3). If you don&apos;t have a US Apple ID, contact support.
                </>
              )}
              <ContactSupport className="mt-2" />
            </li>
            <li>
              {zh ? (
                <>
                  <b>导入订阅</b>，三种方法任选一种：
                </>
              ) : (
                <>
                  <b>Import the subscription</b> in any of these three ways:
                </>
              )}
              <ul className="mt-2 list-disc space-y-1 pl-5">
                <li>
                  {zh ? (
                    <>
                      在这台 iPhone 上打开 <MySubs />，点「导入 Shadowrocket」。
                    </>
                  ) : (
                    <>
                      On this iPhone, open <MySubs /> and tap &quot;Import to Shadowrocket&quot;.
                    </>
                  )}
                </li>
                <li>
                  {zh ? (
                    <>
                      在另一台设备上打开 <MySubs />，点「显示二维码」，用 Shadowrocket 首页<b>左上角</b>的扫码按钮扫它。
                    </>
                  ) : (
                    <>
                      Open <MySubs /> on another device, tap &quot;Show QR code&quot;, and scan it with the scan button in the <b>top-left</b> of
                      Shadowrocket&apos;s home screen.
                    </>
                  )}
                  <Shot name="ios-scan" alt={t("Shadowrocket 首页左上角的扫码按钮", "Scan button in the top-left of Shadowrocket's home screen")} />
                </li>
                <li>
                  {zh ? (
                    <>
                      手动添加：点首页右上角「+」→「类型」选 <b>Subscribe</b> →「URL」粘贴订阅链接 →
                      点右上角「完成」。
                    </>
                  ) : (
                    <>
                      Add it manually: tap &quot;+&quot; in the top-right → set Type to <b>Subscribe</b> → paste the subscription link into URL →
                      tap &quot;Done&quot;.
                    </>
                  )}
                </li>
              </ul>
            </li>
            <li>
              {zh ? (
                <>
                  <b>连接</b>：打开首页顶部的开关。第一次会弹出「添加 VPN 配置」，点允许。
                </>
              ) : (
                <>
                  <b>Connect</b>: turn on the switch at the top of the home screen. The first time, iOS asks to add a VPN configuration; tap
                  Allow.
                </>
              )}
            </li>
            <li>
              {zh ? (
                <>
                  <b>日常使用</b>：点「连通性测试」测延迟，选延迟小的节点。发现某些节点连不上，点订阅右边的刷新按钮更新订阅。
                </>
              ) : (
                <>
                  <b>Everyday use</b>: tap &quot;Connectivity Test&quot; to check latency and pick a fast server. If some servers stop working, tap
                  the refresh button next to the subscription to update it.
                </>
              )}
              <Shot name="ios-test" alt={t("连通性测试和刷新订阅按钮", "Connectivity test and refresh buttons")} narrow />
            </li>
          </Steps>
        </>
      ),
    },
    {
      id: "mac",
      label: "Mac",
      content: (
        <>
          <h2 className="text-lg font-bold">Clash Verge</h2>
          <ClashVergeSteps os="mac" lang={lang} MySubs={MySubs} />
          <HiddifyAlt os="mac" lang={lang} MySubs={MySubs} />
        </>
      ),
    },
    {
      id: "windows",
      label: "Windows",
      content: (
        <>
          <h2 className="text-lg font-bold">Clash Verge</h2>
          <ClashVergeSteps os="windows" lang={lang} MySubs={MySubs} />
          <HiddifyAlt os="windows" lang={lang} MySubs={MySubs} />
        </>
      ),
    },
    {
      id: "android",
      label: t("安卓", "Android"),
      content: (
        <>
          <h2 className="text-lg font-bold">Hiddify</h2>
          <Steps>
            <li>
              <b>{t("安装", "Install")}</b>
              {t("：打开发给你的安装包；或者", ": open the installer we sent you, or")}
              <Ext href={DOWNLOADS.hiddify}>{t("下载 Hiddify", "Download Hiddify")}</Ext>
              <div className="mt-1 text-sm text-base-content/70">{t("下载文件名带 Android 的 apk。", "Download the apk with Android in its name.")}</div>
            </li>
            <li>
              {zh ? (
                <>
                  <b>导入订阅</b>，任选一种：
                </>
              ) : (
                <>
                  <b>Import the subscription</b> in any of these ways:
                </>
              )}
              <ul className="mt-2 list-disc space-y-1 pl-5">
                <li>
                  {zh ? (
                    <>
                      在这台手机上打开 <MySubs />，点「导入 Hiddify」。
                    </>
                  ) : (
                    <>
                      On this phone, open <MySubs /> and tap &quot;Import to Hiddify&quot;.
                    </>
                  )}
                </li>
                <li>
                  {zh ? (
                    <>
                      点 Hiddify 右上角的「+」→ 扫描二维码，扫 <MySubs /> 里的二维码（二维码上方先切到「Hiddify」）。
                    </>
                  ) : (
                    <>
                      Tap &quot;+&quot; in the top-right of Hiddify → Scan QR code, and scan the QR code in <MySubs /> (switch to &quot;Hiddify&quot; above
                      the QR code first).
                    </>
                  )}
                </li>
                <li>
                  {zh ? (
                    <>
                      在 <MySubs /> 复制订阅链接，再点 Hiddify 右上角的「+」→ 剪贴板。
                    </>
                  ) : (
                    <>
                      Copy the subscription link in <MySubs />, then tap &quot;+&quot; in the top-right of Hiddify → Clipboard.
                    </>
                  )}
                </li>
              </ul>
              <Shot name="android-import" alt={t("Hiddify 扫描二维码和剪贴板", "Hiddify scan QR code and clipboard")} narrow />
            </li>
            <li>
              <b>{t("连接", "Connect")}</b>
              {t("：点连接按钮。", ": tap the connect button.")}
              <Shot name="android-connect" alt={t("Hiddify 连接按钮", "Hiddify connect button")} narrow />
            </li>
            <li>
              <b>{t("日常使用", "Everyday use")}</b>
              {t("：Hiddify 会自动测速。发现节点连不上，点订阅左边的刷新按钮。", ": Hiddify tests speed automatically. If servers stop working, tap the refresh button to the left of the subscription.")}
              <Shot name="android-refresh" alt={t("Hiddify 刷新订阅按钮", "Hiddify refresh button")} narrow />
            </li>
          </Steps>
        </>
      ),
    },
  ];
}

// 要登录才能看：教程里有客户端名字，不给外人看
export default async function TutorialPage() {
  await requireCustomer();
  // 按访问设备默认打开对应的标签页，认不出来就打开 iPhone
  const current = detectPlatform((await headers()).get("user-agent") ?? "") ?? "ios";
  const { t, p, lang } = await getT();

  return (
    <div className="mx-auto max-w-2xl px-4 pb-16">
      <CustomerNav />

      <h1 className="mt-4 mb-4 text-2xl font-bold">{t("安装教程", "Setup guide")}</h1>

      <div role="tablist" className="tabs tabs-box mb-4 bg-base-100">
        {tabs(lang).map((tab) => (
          <Fragment key={tab.id}>
            <input
              type="radio"
              name="platform"
              role="tab"
              className="tab"
              aria-label={tab.label}
              defaultChecked={tab.id === current}
            />
            <div role="tabpanel" className="tab-content rounded-box bg-base-100 p-5">
              {tab.content}
            </div>
          </Fragment>
        ))}
      </div>

      <div className="card bg-base-100 shadow-sm">
        <div className="card-body">
          <h2 className="card-title">{t("注意", "Good to know")}</h2>
          <ul className="list-disc space-y-2 pl-5">
            <li>{t("客户端默认会自动挑延迟最低的节点。想固定用某个地区，就手动选节点。", "Apps pick the lowest-latency server by default. To stick to a region, choose a server manually.")}</li>
            <li>
              {t(
                "我们会定期替换被墙的节点。节点连不上时，在客户端里刷新（更新）订阅就能拿到新节点。",
                "We regularly replace blocked servers. If a server stops working, refresh (update) the subscription in your app to get the new ones.",
              )}
            </li>
            <li>
              {t(
                "订阅链接等于密码，不要发给别人。泄露了就在「我的订阅」里重置。",
                "Your subscription link works like a password; don't share it. If it leaks, reset it in My subscription.",
              )}
            </li>
          </ul>
        </div>
      </div>

      {/* 常见问题：首页不公开后放到这里（内容在 site.config.ts 的 landing.faq） */}
      {site.landing?.faq && (
        <div className="card mt-4 bg-base-100 shadow-sm" data-testid="tutorial-faq">
          <div className="card-body">
            <h2 className="card-title">{t("常见问题", "FAQ")}</h2>
            <div className="flex flex-col gap-2">
              {site.landing.faq.map((f) => (
                <details key={p(f.q)} className="collapse-arrow collapse bg-base-200/60">
                  <summary className="collapse-title font-medium">{p(f.q)}</summary>
                  <div className="collapse-content text-sm text-base-content/70">{p(f.a)}</div>
                </details>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
