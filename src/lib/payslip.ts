/**
 * Monthly commission payslip PDF.
 *
 * Styled to match the affiliate statement exports: dark header band, meta
 * block, then autoTable sections for earnings / deductions and a totals row.
 */
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { fmtMoney } from "@/lib/format";

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
};

export type PayslipTotals = { grossCommission: number; totalDeductions: number; netPayable: number };

export function payslipTotals(p: PayslipInput): PayslipTotals {
  const grossCommission = (p.ftdCommission || 0) + (p.revenueCommission || 0) + (p.stdBonus || 0);
  const totalDeductions = (p.absenceDeduction || 0) + (p.withdrawalPenalty || 0);
  return {
    grossCommission,
    totalDeductions,
    netPayable: (p.baseSalary || 0) + grossCommission - totalDeductions,
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

export function buildPayslipDoc(p: PayslipInput): jsPDF {
  const t = payslipTotals(p);
  const doc = new jsPDF();
  const W = doc.internal.pageSize.getWidth();

  // Header band
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

  // Employee meta
  doc.setTextColor(30, 30, 30);
  autoTable(doc, {
    startY: 38,
    theme: "plain",
    styles: { fontSize: 9, cellPadding: 1.5 },
    body: [
      ["Employee", p.employeeName],
      ["Team", p.teamLabel],
      ["Role", p.role || "—"],
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

  autoTable(doc, {
    startY: (doc as any).lastAutoTable.finalY + 6,
    head: [["Deductions", "Basis", "Amount"]],
    body: [
      [
        "Attendance deduction",
        `${p.absentDays} absent of ${p.workingDays} working days × ${fmtMoney(p.perDayRate)}`,
        `−${fmtMoney(p.absenceDeduction)}`,
      ],
      ["Withdrawal penalties", "", `−${fmtMoney(p.withdrawalPenalty)}`],
    ],
    headStyles: { fillColor: [90, 40, 45] },
    styles: { fontSize: 9 },
    columnStyles: { 2: { halign: "right" } },
  });

  autoTable(doc, {
    startY: (doc as any).lastAutoTable.finalY + 6,
    theme: "grid",
    body: [
      ["Total gross commission", fmtMoney(t.grossCommission)],
      ["Total deductions", `−${fmtMoney(t.totalDeductions)}`],
      ["Net payable", fmtMoney(t.netPayable)],
    ],
    styles: { fontSize: 10 },
    columnStyles: { 0: { cellWidth: 120 }, 1: { halign: "right", fontStyle: "bold" } },
    didParseCell: (data) => {
      if (data.row.index === 2) {
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
    "Net payable = base salary + commission − attendance deductions − withdrawal penalties.",
    14,
    doc.internal.pageSize.getHeight() - 12,
  );
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
