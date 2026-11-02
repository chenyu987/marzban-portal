import { Fragment } from "react";
import Link from "next/link";
import { headers } from "next/headers";
import { BRAND, DOWNLOADS, detectPlatform, type Platform } from "@/lib/clients";
import { site } from "@/site.config";
import CopyRules from "./CopyRules";

// iPhone 用 Shadowrocket，Mac 用 Clash Verge，Windows 和安卓用 Hiddify。
// 不推荐 ClashX Meta 那种手动拖 yaml 文件的做法：那不是订阅，节点变了不会自动更新

function Steps({ children }: { children: React.ReactNode }) {
  return <ol className="list-decimal space-y-3 pl-5">{children}</ol>;
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

const MySubs = () => (
  <Link href="/dashboard" className="link link-primary">
    我的订阅
  </Link>
);

const TABS: { id: Platform; label: string; content: React.ReactNode }[] = [
  {
    id: "ios",
    label: "iPhone",
    content: (
      <>
        <h2 className="text-lg font-bold">Shadowrocket（小火箭）</h2>
        <Steps>
          <li>
            <b>安装</b>：Shadowrocket 在国区 App Store 搜不到，要用<b>美区 Apple ID</b> 登录 App Store
            再搜索安装，一次性付费约 $3。
          </li>
          <li>
            <b>导入订阅</b>，三种方法任选一种：
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>
                在这台 iPhone 上打开 <MySubs />，点「导入 Shadowrocket」。
              </li>
              <li>
                在另一台设备上打开 <MySubs />，点「显示二维码」，用 Shadowrocket 首页<b>左上角</b>的扫码按钮扫它。
                <Shot name="ios-scan" alt="Shadowrocket 首页左上角的扫码按钮" />
              </li>
              <li>
                手动添加：点首页右上角「+」→「类型」选 <b>Subscribe</b> →「URL」粘贴订阅链接 →「备注」填 {BRAND} →
                点右上角「完成」。
              </li>
            </ul>
          </li>
          <li>
            <b>连接</b>：打开首页顶部的开关。第一次会弹出「添加 VPN 配置」，点允许。
          </li>
          <li>
            <b>日常使用</b>：点「连通性测试」测延迟，选延迟小的节点。发现某些节点连不上，点订阅右边的刷新按钮更新订阅。
            <Shot name="ios-test" alt="连通性测试和刷新订阅按钮" narrow />
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
        <h2 className="text-lg font-bold">Clash Verge（Windows 也能用）</h2>
        <Steps>
          <li>
            <b>安装</b>：
            <Ext href={DOWNLOADS.clashVerge}>下载 Clash Verge</Ext>
            <div className="mt-1 text-sm text-base-content/70">
              M 系列芯片的 Mac 选文件名带 aarch64 的 dmg，Intel 芯片的选带 x64 的。
            </div>
          </li>
          <li>
            <b>导入订阅</b>：在本机打开 <MySubs /> 点「导入 Clash Verge」；或者打开 Clash Verge 左边的「订阅」，
            把订阅链接粘贴到顶部输入框，点「导入」。
            <Shot name="mac-import" alt="Clash Verge 订阅页" />
          </li>
          <li>
            <b>加分流规则</b>（推荐）：右键刚导入的订阅 → 选「扩展覆写配置」→ 把下面的规则粘贴进去并保存。作用是
            ChatGPT、Claude 和国外网站走代理，国内网站直连，国内网站不会因此变慢。
            <Shot name="mac-override-menu" alt="右键订阅选扩展覆写配置" />
            <Shot name="mac-override-edit" alt="粘贴规则" />
            <div className="mt-2">
              <CopyRules />
            </div>
            <div className="text-sm text-base-content/70">保存后到左边「规则」页看一眼，能看到这些规则就说明生效了。</div>
            <Shot name="mac-rules" alt="规则页里能看到这些规则" />
          </li>
          <li>
            <b>连接</b>：回到「首页」，选一个节点，打开「系统代理」。
            <Shot name="mac-connect" alt="首页选节点、打开系统代理" />
          </li>
          <li>
            <b>日常使用</b>：在首页点「延迟测试」找延迟最低的节点。发现节点连不上，到「订阅」页点刷新按钮更新订阅。
            <Shot name="mac-latency" alt="延迟测试按钮" />
            <Shot name="mac-refresh" alt="订阅的刷新按钮" />
          </li>
        </Steps>
      </>
    ),
  },
  {
    id: "windows",
    label: "Windows",
    content: (
      <>
        <h2 className="text-lg font-bold">Hiddify</h2>
        <Steps>
          <li>
            <b>安装</b>：
            <Ext href={DOWNLOADS.hiddifyWindows}>下载 Hiddify</Ext>
            <div className="mt-1 text-sm text-base-content/70">下载文件名带 Windows-Setup 的安装包。</div>
          </li>
          <li>
            <b>导入订阅</b>：在 <MySubs /> 点「复制订阅链接」，然后在 Hiddify 里点「剪贴板」。
            <Shot name="win-import" alt="Hiddify 从剪贴板添加" />
          </li>
          <li>
            <b>连接</b>：点中间的连接按钮。
            <Shot name="win-connect" alt="Hiddify 已连接" />
          </li>
          <li>
            <b>切换节点</b>：点右下角的箭头。
            <Shot name="win-switch" alt="Hiddify 节点列表" />
          </li>
          <li>
            <b>日常使用</b>：Hiddify 启动时会自动更新订阅并测速。发现节点连不上，点订阅左边的刷新按钮。
            <Shot name="win-refresh" alt="Hiddify 刷新订阅按钮" />
          </li>
        </Steps>
        <p className="mt-4 text-sm text-base-content/70">想用 Clash Verge 也可以，步骤和 Mac 一样。</p>
      </>
    ),
  },
  {
    id: "android",
    label: "安卓",
    content: (
      <>
        <h2 className="text-lg font-bold">Hiddify</h2>
        <Steps>
          <li>
            <b>安装</b>：打开发给你的安装包；或者
            <Ext href={DOWNLOADS.hiddify}>下载 Hiddify</Ext>
            <div className="mt-1 text-sm text-base-content/70">下载文件名带 Android 的 apk。</div>
          </li>
          <li>
            <b>导入订阅</b>，任选一种：
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>
                在这台手机上打开 <MySubs />，点「导入 Hiddify」。
              </li>
              <li>
                点 Hiddify 右上角的「+」→ 扫描二维码，扫 <MySubs /> 里的二维码。
              </li>
              <li>
                在 <MySubs /> 复制订阅链接，再点 Hiddify 右上角的「+」→ 剪贴板。
              </li>
            </ul>
            <Shot name="android-import" alt="Hiddify 扫描二维码和剪贴板" narrow />
          </li>
          <li>
            <b>连接</b>：点连接按钮。
            <Shot name="android-connect" alt="Hiddify 连接按钮" narrow />
          </li>
          <li>
            <b>日常使用</b>：Hiddify 会自动测速。发现节点连不上，点订阅左边的刷新按钮。
            <Shot name="android-refresh" alt="Hiddify 刷新订阅按钮" narrow />
          </li>
        </Steps>
      </>
    ),
  },
];

export default async function TutorialPage() {
  // 按访问设备默认打开对应的标签页，认不出来就打开 iPhone
  const current = detectPlatform((await headers()).get("user-agent") ?? "") ?? "ios";

  return (
    <div className="mx-auto max-w-2xl px-4 pb-16">
      <header className="navbar px-0">
        <div className="flex-1 text-xl font-bold">{BRAND}</div>
        <Link href="/dashboard" className="btn btn-ghost btn-sm">
          我的订阅
        </Link>
      </header>

      <h1 className="mt-4 mb-4 text-2xl font-bold">安装教程</h1>

      <div role="tablist" className="tabs tabs-box mb-4 bg-base-100">
        {TABS.map((t) => (
          <Fragment key={t.id}>
            <input
              type="radio"
              name="platform"
              role="tab"
              className="tab"
              aria-label={t.label}
              defaultChecked={t.id === current}
            />
            <div role="tabpanel" className="tab-content rounded-box bg-base-100 p-5">
              {t.content}
            </div>
          </Fragment>
        ))}
      </div>

      <div className="card bg-base-100 shadow-sm">
        <div className="card-body">
          <h2 className="card-title">注意</h2>
          <ul className="list-disc space-y-2 pl-5">
            <li>客户端默认会自动挑延迟最低的节点。想固定用某个地区，就手动选节点。</li>
            <li>我们会定期替换被墙的节点。节点连不上时，在客户端里刷新（更新）订阅就能拿到新节点。</li>
            <li>订阅链接等于密码，不要发给别人。泄露了就在「我的订阅」里重置。</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
