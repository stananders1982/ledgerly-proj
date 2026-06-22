export interface InsightInput {
  leads: { created_at: string; cost: number; status: string; source_id: string | null; employee_id: string | null }[];
  revenue: { date: string; amount: number; employee_id: string | null; lead_id: string | null }[];
  expenses: { date: string; amount: number; category_id: string | null }[];
  sourcesById: Map<string, string>;
  employeesById: Map<string, string>;
  categoriesById: Map<string, string>;
}

export type InsightSeverity = "positive" | "warning" | "neutral";
export interface Insight {
  id: string;
  title: string;
  detail: string;
  severity: InsightSeverity;
}

const last30 = (iso: string) =>
  Date.now() - new Date(iso).getTime() < 30 * 24 * 60 * 60 * 1000;
const last60to30 = (iso: string) => {
  const age = Date.now() - new Date(iso).getTime();
  return age >= 30 * 24 * 60 * 60 * 1000 && age < 60 * 24 * 60 * 60 * 1000;
};

export function generateInsights(input: InsightInput): Insight[] {
  const out: Insight[] = [];
  const { leads, revenue, expenses, sourcesById, employeesById, categoriesById } = input;

  // Top source by activated leads
  const sourceStats = new Map<string, { leads: number; activated: number; cost: number; revenue: number }>();
  leads.forEach((l) => {
    if (!l.source_id) return;
    const s = sourceStats.get(l.source_id) ?? { leads: 0, activated: 0, cost: 0, revenue: 0 };
    s.leads += 1;
    s.cost += Number(l.cost) || 0;
    if (l.status === "activated") s.activated += 1;
    sourceStats.set(l.source_id, s);
  });
  revenue.forEach((r) => {
    if (!r.lead_id) return;
    const lead = leads.find((l) => l.created_at && r.lead_id);
    if (lead?.source_id) {
      const s = sourceStats.get(lead.source_id);
      if (s) s.revenue += Number(r.amount) || 0;
    }
  });
  const topSource = [...sourceStats.entries()].sort((a, b) => b[1].activated - a[1].activated)[0];
  if (topSource) {
    out.push({
      id: "top-source",
      title: `Top source: ${sourcesById.get(topSource[0]) ?? "Unknown"}`,
      detail: `${topSource[1].activated} activated leads from ${topSource[1].leads} total — drive more spend here.`,
      severity: "positive",
    });
  }

  // Revenue growth (last 30 vs previous 30)
  const rev30 = revenue.filter((r) => last30(r.date)).reduce((s, r) => s + Number(r.amount), 0);
  const revPrev = revenue.filter((r) => last60to30(r.date)).reduce((s, r) => s + Number(r.amount), 0);
  if (revPrev > 0) {
    const change = ((rev30 - revPrev) / revPrev) * 100;
    out.push({
      id: "rev-growth",
      title: change >= 0 ? `Revenue up ${change.toFixed(1)}%` : `Revenue down ${Math.abs(change).toFixed(1)}%`,
      detail: `Last 30 days: $${rev30.toLocaleString()} vs previous 30 days: $${revPrev.toLocaleString()}.`,
      severity: change >= 0 ? "positive" : "warning",
    });
  }

  // Expense anomalies (any single expense >2x category avg)
  const catAvg = new Map<string, number[]>();
  expenses.forEach((e) => {
    if (!e.category_id) return;
    const arr = catAvg.get(e.category_id) ?? [];
    arr.push(Number(e.amount));
    catAvg.set(e.category_id, arr);
  });
  catAvg.forEach((arr, catId) => {
    if (arr.length < 3) return;
    const avg = arr.reduce((a, b) => a + b, 0) / arr.length;
    const max = Math.max(...arr);
    if (max > avg * 2.5) {
      out.push({
        id: `anom-${catId}`,
        title: `Spend anomaly: ${categoriesById.get(catId) ?? "category"}`,
        detail: `One expense of $${max.toLocaleString()} is more than 2.5× the average ($${avg.toFixed(0)}).`,
        severity: "warning",
      });
    }
  });

  // Top employee
  const empRev = new Map<string, number>();
  revenue.forEach((r) => {
    if (!r.employee_id) return;
    empRev.set(r.employee_id, (empRev.get(r.employee_id) ?? 0) + Number(r.amount));
  });
  const topEmp = [...empRev.entries()].sort((a, b) => b[1] - a[1])[0];
  if (topEmp) {
    out.push({
      id: "top-emp",
      title: `Top closer: ${employeesById.get(topEmp[0]) ?? "Unknown"}`,
      detail: `Generated $${topEmp[1].toLocaleString()} in revenue.`,
      severity: "positive",
    });
  }

  // Conversion rate trend
  const leads30 = leads.filter((l) => last30(l.created_at));
  const leadsPrev = leads.filter((l) => last60to30(l.created_at));
  const conv = (arr: typeof leads30) =>
    arr.length ? (arr.filter((l) => l.status === "activated").length / arr.length) * 100 : 0;
  const c30 = conv(leads30);
  const cPrev = conv(leadsPrev);
  if (leadsPrev.length >= 5 && leads30.length >= 5) {
    const diff = c30 - cPrev;
    if (Math.abs(diff) >= 5) {
      out.push({
        id: "conv-shift",
        title: diff > 0 ? `Conversion rising` : `Conversion falling`,
        detail: `Activation rate ${diff > 0 ? "up" : "down"} ${Math.abs(diff).toFixed(1)} pts (${cPrev.toFixed(1)}% → ${c30.toFixed(1)}%).`,
        severity: diff > 0 ? "positive" : "warning",
      });
    }
  }

  // CPL spike
  const cpl = (arr: typeof leads30) => {
    const cost = arr.reduce((s, l) => s + Number(l.cost), 0);
    return arr.length ? cost / arr.length : 0;
  };
  const cpl30 = cpl(leads30);
  const cplPrev = cpl(leadsPrev);
  if (cplPrev > 0 && cpl30 > cplPrev * 1.25) {
    out.push({
      id: "cpl-spike",
      title: `Cost per lead climbing`,
      detail: `CPL rose from $${cplPrev.toFixed(2)} to $${cpl30.toFixed(2)} (+${(((cpl30 - cplPrev) / cplPrev) * 100).toFixed(0)}%).`,
      severity: "warning",
    });
  }

  if (out.length === 0) {
    out.push({
      id: "no-data",
      title: "Not enough data yet",
      detail: "Add a few more leads, revenue entries, and expenses to unlock insights.",
      severity: "neutral",
    });
  }

  return out;
}
