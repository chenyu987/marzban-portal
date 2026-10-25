import { requireAdmin } from "@/lib/admin";
import { db } from "@/lib/env";
import { formatExpire } from "@/lib/format";
import AdminHeader from "../AdminHeader";

export const dynamic = "force-dynamic";

// 操作日志：最近 200 条，能按管理员邮箱、操作类型筛
const ACTIONS: Record<string, string> = {
  login: "登录",
  "login.fail": "登录失败",
  logout: "退出",
  "order.confirm": "确认订单",
  "order.cancel": "取消订单",
  "balance.adjust": "加减余额",
  "password.reset_link": "生成重置链接",
  "subscription.bind": "绑定订阅",
  "codes.create": "生成兑换码",
  "code.void": "作废兑换码",
};

type Row = { id: number; admin_email: string; action: string; target: string | null; detail: string | null; ip: string | null; created_at: number };

export default async function LogsPage({ searchParams }: { searchParams: Promise<{ admin?: string; action?: string }> }) {
  const me = await requireAdmin();
  const sp = await searchParams;
  const admin = typeof sp.admin === "string" ? sp.admin.trim() : "";
  const action = typeof sp.action === "string" && sp.action in ACTIONS ? sp.action : "";
  const [{ results }, { results: admins }] = await Promise.all([
    db()
      .prepare(
        `SELECT id, admin_email, action, target, detail, ip, created_at FROM admin_logs
         WHERE (?1 = '' OR admin_email = ?1) AND (?2 = '' OR action = ?2)
         ORDER BY id DESC LIMIT 200`,
      )
      .bind(admin, action)
      .all<Row>(),
    db().prepare("SELECT DISTINCT admin_email FROM admin_logs ORDER BY admin_email").all<{ admin_email: string }>(),
  ]);

  return (
    <div className="mx-auto max-w-5xl px-4 pb-16">
      <AdminHeader email={me.email} />
      <h1 className="mt-4 mb-4 text-2xl font-bold">操作日志</h1>
      <form className="mb-4 flex flex-wrap gap-2">
        <select name="admin" defaultValue={admin} className="select select-sm">
          <option value="">所有人</option>
          {admins.map((a) => (
            <option key={a.admin_email} value={a.admin_email}>
              {a.admin_email}
            </option>
          ))}
        </select>
        <select name="action" defaultValue={action} className="select select-sm">
          <option value="">所有操作</option>
          {Object.entries(ACTIONS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <button className="btn btn-sm">筛选</button>
      </form>
      {results.length === 0 && <p className="text-sm text-base-content/60">没有记录。</p>}
      <div className="overflow-x-auto">
        <table className="table table-sm">
          <thead>
            <tr>
              <th>时间</th>
              <th>谁</th>
              <th>做了什么</th>
              <th>对谁</th>
              <th>说明</th>
              <th>IP</th>
            </tr>
          </thead>
          <tbody>
            {results.map((l) => (
              <tr key={l.id} className={l.action === "login.fail" ? "text-error" : ""}>
                <td className="whitespace-nowrap">{formatExpire(l.created_at)}</td>
                <td>{l.admin_email}</td>
                <td className="whitespace-nowrap">{ACTIONS[l.action] ?? l.action}</td>
                <td>{l.target ?? ""}</td>
                <td className="text-base-content/70">{l.detail ?? ""}</td>
                <td className="text-base-content/60">{l.ip ?? ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
