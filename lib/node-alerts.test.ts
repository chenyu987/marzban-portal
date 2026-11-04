import { describe, expect, it } from "vitest";
import { DOWN_GRACE, planNodeAlerts, type AlertRow } from "./node-alerts";

const node = (id: number, status: string, message: string | null = null) => ({ id, name: `节点${id}`, status, message });
const T = 1_800_000_000;

describe("节点掉线提醒", () => {
  it("刚掉线先记下，不发；连着掉满 5 分钟才发一封", () => {
    const first = planNodeAlerts([node(1, "error", "timeout")], [], T, null);
    expect(first.mails).toHaveLength(0);
    expect(first.upsert).toEqual([{ node_id: 1, name: "节点1", message: "timeout", down_since: T, alerted_at: null }]);
    const later = planNodeAlerts([node(1, "error", "timeout")], first.upsert, T + DOWN_GRACE, "https://admin.example.com");
    expect(later.mails).toHaveLength(1);
    expect(later.mails[0].subject).toBe("【掉线】节点1");
    expect(later.mails[0].text).toContain("timeout");
    expect(later.mails[0].text).toContain("https://admin.example.com/admin/nodes");
    // 发过了就不再发
    const again = planNodeAlerts([node(1, "error")], later.upsert, T + 3 * DOWN_GRACE, null);
    expect(again.mails).toHaveLength(0);
  });
  it("闪断：没发过掉线就恢复，不发信，记录删掉", () => {
    const prev: AlertRow[] = [{ node_id: 1, name: "节点1", message: null, down_since: T, alerted_at: null }];
    const p = planNodeAlerts([node(1, "connected")], prev, T + 60, null);
    expect(p.mails).toHaveLength(0);
    expect(p.remove).toEqual([1]);
  });
  it("发过掉线的恢复了：发「已恢复」", () => {
    const prev: AlertRow[] = [{ node_id: 1, name: "节点1", message: null, down_since: T, alerted_at: T + 300 }];
    const p = planNodeAlerts([node(1, "connected")], prev, T + 1800, null);
    expect(p.mails.map((m) => m.subject)).toEqual(["【已恢复】节点1"]);
    expect(p.mails[0].text).toContain("30 分钟");
  });
  it("停用的节点不算掉线；删掉的节点记录清掉", () => {
    const prev: AlertRow[] = [{ node_id: 2, name: "节点2", message: null, down_since: T, alerted_at: T }];
    const p = planNodeAlerts([node(1, "disabled")], prev, T + 600, null);
    expect(p.upsert).toHaveLength(0);
    expect(p.mails).toHaveLength(0);
    expect(p.remove).toEqual([2]);
  });
  it("面板连不上：只记面板，节点的记录不动", () => {
    const prev: AlertRow[] = [{ node_id: 1, name: "节点1", message: null, down_since: T, alerted_at: null }];
    const p = planNodeAlerts(null, prev, T, null);
    expect(p.upsert.map((r) => r.node_id)).toEqual([0]);
    expect(p.remove).toEqual([]);
    const later = planNodeAlerts(null, p.upsert, T + DOWN_GRACE, null);
    expect(later.mails[0].subject).toBe("【掉线】面板（Marzban）");
  });
});
