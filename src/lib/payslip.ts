/**
 * Monthly commission payslip PDF.
 *
 * Styled to match the affiliate statement exports: dark header band, meta
 * block, then autoTable sections for earnings / deductions and a totals row.
 */
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { fmtMoney } from "@/lib/format";
import { methodFeePct } from "@/lib/commission";
import type { CompanySettings } from "@/lib/settings";

/** One deposit line on a retention payslip — never carries client identity. */
export type PayslipRevenueTxn = {
  /** ISO date (YYYY-MM-DD). */
  date: string;
  /** This agent's split-adjusted share of the deposit. */
  amount: number;
  commissionPct: number;
  /** amount × commission % (before the deposit-method fee). */
  commissionEarned: number;
  /** Portion of the commission removed by the deposit-method fee. */
  feeDeducted: number;
  netCommission: number;
};

/** One withdrawal line on a retention payslip — never carries client identity. */
export type PayslipWithdrawalTxn = {
  date: string;
  amount: number;
  penaltyPct: number;
  penalty: number;
};

export type PayslipTransactions = {
  revenue: PayslipRevenueTxn[];
  withdrawals: PayslipWithdrawalTxn[];
  totals: {
    deposits: number;
    commissionEarned: number;
    feeDeducted: number;
    netCommission: number;
    withdrawals: number;
    penalty: number;
  };
};

export type PayslipInput = {
  companyName: string;
  logoDataUrl?: string | null;
  employeeName: string;
  teamLabel: string;
  role?: string | null;
  /** "YYYY-MM" */
  month: string;
  baseSalary: number;
  workingDays: number;
  absentDays: number;
  perDayRate: number;
  absenceDeduction: number;
  ftdCount: number;
  ftdRate: number;
  ftdCommission: number;
  revenueBase: number;
  commissionPct: number;
  revenueCommission: number;
  /** Team R only — 0 for everyone else. */
  stdCount: number;
  stdRate: number;
  stdBonus: number;
  withdrawalPenalty: number;
  /** Team R only — renders the detailed transaction layout when present. */
  transactions?: PayslipTransactions;
};

export type PayslipTotals = {
  grossCommission: number;
  totalDeductions: number;
  netPayable: number;
  /** Salary after attendance deductions. Never reduced by commission. */
  netSalary: number;
  /** Commission after withdrawal penalties; negative means a deficit. */
  netCommission: number;
  /** Negative amount carried to next month when penalties exceed commission. */
  commissionDeficit: number;
};

export function payslipTotals(p: PayslipInput): PayslipTotals {
  const grossCommission = (p.ftdCommission || 0) + (p.revenueCommission || 0) + (p.stdBonus || 0);
  const totalDeductions = (p.absenceDeduction || 0) + (p.withdrawalPenalty || 0);
  const netSalary = Math.max(0, (p.baseSalary || 0) - (p.absenceDeduction || 0));
  const netCommission = grossCommission - (p.withdrawalPenalty || 0);
  return {
    grossCommission,
    totalDeductions,
    netSalary,
    netCommission,
    // A commission deficit is carried forward — it never eats into the salary.
    commissionDeficit: Math.min(0, netCommission),
    netPayable: netSalary + Math.max(0, netCommission),
  };
}

type RevenueSource = {
  date: string;
  amount: number | string;
  method?: string | null;
  employee_id?: string | null;
  employee_id_2?: string | null;
  split_pct?: number | string | null;
};

type WithdrawalSource = {
  date: string;
  amount: number | string;
  employee_penalty?: number | string | null;
};

/**
 * Builds the privacy-safe transaction detail for a retention payslip: every
 * deposit and withdrawal reduced to date + amounts, split-adjusted for this
 * agent. No client name, id or payment-method name is ever carried over.
 */
export function buildRetentionTransactions(opts: {
  employeeId: string;
  revenue: RevenueSource[];
  withdrawals: WithdrawalSource[];
  /** Tiered commission rate applied to this month's revenue. */
  commissionPct: number;
  settings?: CompanySettings;
  /** Fallback when a withdrawal has no stored penalty. */
  defaultPenaltyPct?: number;
}): PayslipTransactions {
  const { employeeId, commissionPct, settings } = opts;
  const rate = (Number(commissionPct) || 0) / 100;

  const revenue: PayslipRevenueTxn[] = [];
  for (const r of opts.revenue ?? []) {
    const pct = Number(r.split_pct ?? 100);
    const full = Number(r.amount) || 0;
    const share =
      r.employee_id === employeeId
        ? full * (pct / 100)
        : r.employee_id_2 === employeeId
          ? full * ((100 - pct) / 100)
          : 0;
    if (!share) continue;
    const feeShare = share * (methodFeePct(r.method, settings) / 100);
    const commissionEarned = share * rate;
    const feeDeducted = feeShare * rate;
    revenue.push({
      date: String(r.date),
      amount: share,
      commissionPct: Number(commissionPct) || 0,
      commissionEarned,
      feeDeducted,
      netCommission: commissionEarned - feeDeducted,
    });
  }
  revenue.sort((a, b) => a.date.localeCompare(b.date));

  const withdrawals: PayslipWithdrawalTxn[] = (opts.withdrawals ?? [])
    .map((w) => {
      const amount = Number(w.amount) || 0;
      const stored = Number(w.employee_penalty ?? 0);
      const penalty = stored || amount * ((opts.defaultPenaltyPct ?? 10) / 100);
      return {
        date: String(w.date),
        amount,
        penaltyPct: amount > 0 ? (penalty / amount) * 100 : 0,
        penalty,
      };
    })
    .sort((a, b) => a.date.localeCompare(b.date));

  const sum = <T,>(rows: T[], f: (r: T) => number) => rows.reduce((s, r) => s + f(r), 0);
  return {
    revenue,
    withdrawals,
    totals: {
      deposits: sum(revenue, (r) => r.amount),
      commissionEarned: sum(revenue, (r) => r.commissionEarned),
      feeDeducted: sum(revenue, (r) => r.feeDeducted),
      netCommission: sum(revenue, (r) => r.netCommission),
      withdrawals: sum(withdrawals, (w) => w.amount),
      penalty: sum(withdrawals, (w) => w.penalty),
    },
  };
}

export function monthLabel(month: string) {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, (m || 1) - 1, 1)).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** Fetches a logo and converts it to a data URL jsPDF can embed. Never throws. */
export async function loadLogoDataUrl(url?: string | null): Promise<string | null> {
  if (!url) return null;
  try {
    const res = await fetch(url, { mode: "cors" });
    if (!res.ok) return null;
    const blob = await res.blob();
    if (!/^image\/(png|jpe?g)$/.test(blob.type)) return null;
    return await new Promise<string>((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(String(fr.result));
      fr.onerror = reject;
      fr.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

/** DD/MM/YYYY from an ISO date, without timezone drift. */
function fmtDay(iso: string) {
  const [y, m, d] = String(iso).slice(0, 10).split("-");
  return d && m && y ? `${d}/${m}/${y}` : String(iso);
}

/** Dark header band with logo, company name and period. */
function drawHeader(doc: jsPDF, p: PayslipInput) {
  const W = doc.internal.pageSize.getWidth();
  doc.setFillColor(24, 24, 32);
  doc.rect(0, 0, W, 30, "F");
  if (p.logoDataUrl) {
    try {
      doc.addImage(p.logoDataUrl, "PNG", 14, 7, 16, 16);
    } catch {
      /* ignore unsupported image */
    }
  }
  const textX = p.logoDataUrl ? 34 : 14;
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(15);
  doc.text(p.companyName || "Company", textX, 15);
  doc.setFontSize(10);
  doc.setTextColor(190, 190, 200);
  doc.text("Commission payslip", textX, 22);
  doc.setFontSize(11);
  doc.setTextColor(255, 255, 255);
  doc.text(monthLabel(p.month), W - 14, 18, { align: "right" });
  doc.setTextColor(30, 30, 30);
}

/** "Page X of Y", generation date and confidentiality notice on every page. */
function drawFooters(doc: jsPDF, p: PayslipInput) {
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const total = doc.getNumberOfPages();
  for (let i = 1; i <= total; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(140);
    doc.text(`Confidential — for ${p.employeeName} only`, 14, H - 10);
    doc.text(p.companyName || "Company", W / 2, H - 10, { align: "center" });
    doc.text(`Page ${i} of ${total} · Generated ${new Date().toLocaleDateString()}`, W - 14, H - 10, {
      align: "right",
    });
  }
}

export function buildPayslipDoc(p: PayslipInput): jsPDF {
  // Retention agents get the full transaction breakdown.
  if (p.transactions) return buildRetentionPayslipDoc(p);

  const t = payslipTotals(p);
  const doc = new jsPDF();
  const W = doc.internal.pageSize.getWidth();

  drawHeader(doc, p);

  // Employee meta
  autoTable(doc, {
    startY: 38,
    theme: "plain",
    styles: { fontSize: 9, cellPadding: 1.5 },
    body: [
      ["Employee", p.employeeName],
      ["Team", p.teamLabel],
      ["Role", p.role || "-"],
      ["Period", monthLabel(p.month)],
      ["Generated", new Date().toLocaleString()],
    ],
    columnStyles: { 0: { textColor: [120, 120, 130], cellWidth: 34 }, 1: { fontStyle: "bold" } },
  });

  const earnings: string[][] = [["Base salary", "", fmtMoney(p.baseSalary)]];
  if (p.ftdCount || p.ftdCommission) {
    earnings.push(["FTD commission", `${p.ftdCount} × ${fmtMoney(p.ftdRate)}`, fmtMoney(p.ftdCommission)]);
  }
  if (p.revenueBase || p.revenueCommission) {
    earnings.push([
      "Revenue commission",
      `${fmtMoney(p.revenueBase)} × ${p.commissionPct}%`,
      fmtMoney(p.revenueCommission),
    ]);
  }
  if (p.stdCount || p.stdBonus) {
    earnings.push(["STD bonus", `${p.stdCount} × ${fmtMoney(p.stdRate)}`, fmtMoney(p.stdBonus)]);
  }

  autoTable(doc, {
    startY: (doc as any).lastAutoTable.finalY + 8,
    head: [["Earnings", "Basis", "Amount"]],
    body: earnings,
    headStyles: { fillColor: [40, 40, 50] },
    styles: { fontSize: 9 },
    columnStyles: { 2: { halign: "right" } },
  });

  const deductions: string[][] = [
    [
      "Attendance deduction",
      `${p.absentDays} absent of ${p.workingDays} working days × ${fmtMoney(p.perDayRate)}`,
      `-${fmtMoney(p.absenceDeduction)}`,
    ],
  ];
  if (p.withdrawalPenalty) {
    deductions.push(["Withdrawal penalties", "", `-${fmtMoney(p.withdrawalPenalty)}`]);
  }

  autoTable(doc, {
    startY: (doc as any).lastAutoTable.finalY + 6,
    head: [["Deductions", "Basis", "Amount"]],
    body: deductions,
    headStyles: { fillColor: [90, 40, 45] },
    styles: { fontSize: 9 },
    columnStyles: { 2: { halign: "right" } },
  });

  // Managers have no commission at all — their payslip stays salary-only.
  const summary: string[][] = [];
  if (t.grossCommission) summary.push(["Total gross commission", fmtMoney(t.grossCommission)]);
  summary.push(["Total deductions", `-${fmtMoney(t.totalDeductions)}`]);
  summary.push(["Net payable", fmtMoney(t.netPayable)]);
  const netRowIndex = summary.length - 1;

  autoTable(doc, {
    startY: (doc as any).lastAutoTable.finalY + 6,
    theme: "grid",
    body: summary,
    styles: { fontSize: 10 },
    columnStyles: { 0: { cellWidth: 120 }, 1: { halign: "right", fontStyle: "bold" } },
    didParseCell: (data) => {
      if (data.row.index === netRowIndex) {
        data.cell.styles.fillColor = [24, 24, 32];
        data.cell.styles.textColor = [255, 255, 255];
        data.cell.styles.fontStyle = "bold";
        data.cell.styles.fontSize = 11;
      }
    },
  });

  doc.setFontSize(8);
  doc.setTextColor(140);
  doc.text(
    "Net payable = salary after attendance deductions + commission after penalties.",
    14,
    doc.internal.pageSize.getHeight() - 18,
  );
  drawFooters(doc, p);
  return doc;
}

/**
 * Team R payslip: page 1 is the summary and total payment, later pages list
 * every deposit and withdrawal so the agent can verify each number. No client
 * identity or payment-method name ever appears.
 */
function buildRetentionPayslipDoc(p: PayslipInput): jsPDF {
  const tx = p.transactions!;
  const t = payslipTotals(p);
  const doc = new jsPDF();
  const brand: [number, number, number] = [24, 24, 32];

  drawHeader(doc, p);

  autoTable(doc, {
    startY: 38,
    theme: "plain",
    styles: { fontSize: 9, cellPadding: 1.5 },
    body: [
      ["Employee", p.employeeName],
      ["Team", p.teamLabel],
      ["Role", p.role || "-"],
      ["Period", monthLabel(p.month)],
      ["Generated", new Date().toLocaleString()],
    ],
    columnStyles: { 0: { textColor: [120, 120, 130], cellWidth: 34 }, 1: { fontStyle: "bold" } },
  });

  // ---- Section 2: summary and total payment (shown first) ----
  const money = (n: number) => (n < 0 ? `-${fmtMoney(Math.abs(n))}` : fmtMoney(n));
  const rows: { label: string; value: string; kind?: "spacer" | "sub" | "total" }[] = [
    { label: "Base salary", value: fmtMoney(p.baseSalary) },
    {
      label: `Attendance deductions (${p.absentDays} of ${p.workingDays} days × ${fmtMoney(p.perDayRate)})`,
      value: money(-p.absenceDeduction),
    },
    { label: "Net salary", value: fmtMoney(t.netSalary), kind: "sub" },
    { label: "", value: "", kind: "spacer" },
    { label: "Revenue commission", value: fmtMoney(tx.totals.commissionEarned) },
    { label: "Method fee deductions", value: money(-tx.totals.feeDeducted) },
    { label: "Withdrawal penalties", value: money(-p.withdrawalPenalty) },
    { label: `STD bonus (${p.stdCount} × ${fmtMoney(p.stdRate)})`, value: fmtMoney(p.stdBonus) },
    { label: "Net commission", value: money(t.netCommission), kind: "sub" },
    { label: "", value: "", kind: "spacer" },
    { label: "TOTAL PAYMENT", value: fmtMoney(t.netPayable), kind: "total" },
  ];

  autoTable(doc, {
    startY: (doc as any).lastAutoTable.finalY + 8,
    theme: "grid",
    head: [["Item", "Amount"]],
    body: rows.map((r) => [r.label, r.value]),
    headStyles: { fillColor: [40, 40, 50] },
    styles: { fontSize: 10, cellPadding: 2.5 },
    columnStyles: { 0: { cellWidth: 120 }, 1: { halign: "right", fontStyle: "bold" } },
    didParseCell: (data) => {
      if (data.section !== "body") return;
      const r = rows[data.row.index];
      if (!r) return;
      if (r.kind === "spacer") {
        data.cell.styles.minCellHeight = 3;
        data.cell.styles.fillColor = [255, 255, 255];
      }
      if (r.kind === "sub") data.cell.styles.fontStyle = "bold";
      if (r.kind === "sub" && r.label === "Net commission" && t.netCommission < 0) {
        data.cell.styles.textColor = [190, 40, 40];
      }
      if (r.kind === "total") {
        data.cell.styles.fillColor = brand;
        data.cell.styles.textColor = [255, 255, 255];
        data.cell.styles.fontStyle = "bold";
        data.cell.styles.fontSize = 13;
        data.cell.styles.cellPadding = 4;
      }
    },
  });

  let y = (doc as any).lastAutoTable.finalY + 6;
  doc.setFontSize(8);
  doc.setTextColor(120);
  doc.text(
    `Based on ${tx.revenue.length} deposits and ${tx.withdrawals.length} withdrawals.`,
    14,
    y,
  );
  y += 5;
  if (t.commissionDeficit < 0) {
    doc.setTextColor(190, 40, 40);
    doc.text(
      `Commission deficit of ${fmtMoney(Math.abs(t.commissionDeficit))} carried to next month — salary is not reduced.`,
      14,
      y,
    );
  }

  // ---- Section 1: transaction detail ----
  doc.addPage();
  doc.setTextColor(30, 30, 30);
  doc.setFontSize(12);
  doc.text("Revenue transactions", 14, 20);

  autoTable(doc, {
    startY: 25,
    head: [["Date", "Amount", "Comm. %", "Commission", "Fee deducted", "Net commission"]],
    body: tx.revenue.map((r) => [
      fmtDay(r.date),
      fmtMoney(r.amount),
      `${r.commissionPct.toFixed(1)}%`,
      fmtMoney(r.commissionEarned),
      r.feeDeducted ? `-${fmtMoney(r.feeDeducted)}` : "—",
      fmtMoney(r.netCommission),
    ]),
    foot: [[
      `Subtotal (${tx.revenue.length})`,
      fmtMoney(tx.totals.deposits),
      "",
      fmtMoney(tx.totals.commissionEarned),
      tx.totals.feeDeducted ? `-${fmtMoney(tx.totals.feeDeducted)}` : "—",
      fmtMoney(tx.totals.netCommission),
    ]],
    headStyles: { fillColor: [40, 40, 50] },
    footStyles: { fillColor: [235, 235, 240], textColor: [30, 30, 30], fontStyle: "bold" },
    didParseCell: (data) => {
      if (data.section === "foot" && data.column.index > 0) data.cell.styles.halign = "right";
    },
    alternateRowStyles: { fillColor: [246, 246, 250] },
    styles: { fontSize: 9 },
    columnStyles: { 1: { halign: "right" }, 2: { halign: "right" }, 3: { halign: "right" }, 4: { halign: "right" }, 5: { halign: "right" } },
  });

  // Keep the withdrawals heading with its table instead of stranding it at a page end.
  y = (doc as any).lastAutoTable.finalY + 12;
  const needed = 20 + Math.min(tx.withdrawals.length + 1, 8) * 8;
  if (y + needed > doc.internal.pageSize.getHeight() - 25) {
    doc.addPage();
    y = 20;
  }
  doc.setFontSize(12);
  doc.setTextColor(30, 30, 30);
  doc.text("Withdrawals", 14, y);

  autoTable(doc, {
    startY: y + 5,
    head: [["Date", "Withdrawal", "Penalty %", "Penalty deducted"]],
    body: tx.withdrawals.length
      ? tx.withdrawals.map((w) => [
          fmtDay(w.date),
          fmtMoney(w.amount),
          `${w.penaltyPct.toFixed(1)}%`,
          w.penalty ? `-${fmtMoney(w.penalty)}` : "—",
        ])
      : [["—", "—", "—", "—"]],
    foot: [[
      `Subtotal (${tx.withdrawals.length})`,
      fmtMoney(tx.totals.withdrawals),
      "",
      tx.totals.penalty ? `-${fmtMoney(tx.totals.penalty)}` : "—",
    ]],
    headStyles: { fillColor: [90, 40, 45] },
    footStyles: { fillColor: [235, 235, 240], textColor: [30, 30, 30], fontStyle: "bold" },
    didParseCell: (data) => {
      if (data.section === "foot" && data.column.index > 0) data.cell.styles.halign = "right";
    },
    alternateRowStyles: { fillColor: [250, 246, 246] },
    styles: { fontSize: 9 },
    columnStyles: { 1: { halign: "right" }, 2: { halign: "right" }, 3: { halign: "right" } },
  });

  doc.setFontSize(8);
  doc.setTextColor(140);
  doc.text(
    "Amounts shown are this agent's split-adjusted share of each deposit.",
    14,
    (doc as any).lastAutoTable.finalY + 8,
  );

  drawFooters(doc, p);
  return doc;
}

export function payslipFilename(p: PayslipInput) {
  const safe = p.employeeName.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
  return `payslip-${safe}-${p.month}.pdf`;
}

export function downloadPayslip(p: PayslipInput) {
  buildPayslipDoc(p).save(payslipFilename(p));
}

export function payslipBlob(p: PayslipInput): Blob {
  return buildPayslipDoc(p).output("blob");
}
