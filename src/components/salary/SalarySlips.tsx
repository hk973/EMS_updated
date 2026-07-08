"use client";

import React, { useState, useEffect, useMemo } from "react";
import {
  Box,
  Typography,
  Button,
  TextField,
  Table,
  TableBody,
  TableCell as MuiTableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  IconButton,
  TablePagination,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  CircularProgress,
  Tooltip,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Alert,
  Chip,
  Card,
  CardContent,
  Grid,
} from "@mui/material";
import {
  Download,
  Search,
  PictureAsPdf,
  Email,
  Visibility,
  Refresh,
  GetApp,
} from "@mui/icons-material";
import {
  collection,
  getDocs,
  query,
  where,
  orderBy,
  addDoc,
  doc,
  getDoc,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Employee, Payroll, SalarySlip } from "@/types";
import { useAuth } from "@/contexts/AuthContext";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { salaryTemplateService, evaluateTemplateFormula } from "@/lib/salaryTemplateService";
import type { SalaryTemplate } from "@/lib/salaryTemplateService";
import { slipTemplateService } from "@/lib/slipTemplateService";
import type { SlipTemplate, SlipElement, TextElement, VariableElement, LineElement, RectElement, LogoElement, StampElement, SignatureElement, TableElement, TableCell } from "@/lib/slipTemplateService";
import { ALL_SLIP_VARIABLES } from "@/lib/slipVariables";
import {
  computeAttendanceDeduction,
  AttendanceDeductionConfig,
  DEFAULT_DEDUCTION_CONFIG,
  AttendanceDeductionResult,
  AttendanceVariables,
  fetchAttendanceVariables,
  buildAttendanceContext,
  buildAttendanceRows,
} from "@/lib/attendanceDeductionUtils";

const months = [
  { value: 1, label: "January" },
  { value: 2, label: "February" },
  { value: 3, label: "March" },
  { value: 4, label: "April" },
  { value: 5, label: "May" },
  { value: 6, label: "June" },
  { value: 7, label: "July" },
  { value: 8, label: "August" },
  { value: 9, label: "September" },
  { value: 10, label: "October" },
  { value: 11, label: "November" },
  { value: 12, label: "December" },
];

const currentYear = new Date().getFullYear();
const years = Array.from({ length: 5 }, (_, i) => currentYear - i);

type PayslipModel = {
  companyName: string;
  companyAddress: string;
  period: string;
  paidMode: string;
  logoUrl: string;
  stampUrl: string;
  signUrl: string;
  details: string[][];
  attendance: string[][];
  earnings: string[][];
  deductions: string[][];
  netSalary: string;
};

type StoredSlipRow = {
  cells: string[];
};

type PreviewData = {
  employee: Employee;
  payroll: Payroll;
  slip?: SalarySlip;
};

export default function SalarySlips() {
  const { currentUser } = useAuth();
  const isEmployee = currentUser?.role === "employee";
  const isAdminOrManager =
    currentUser?.role === "admin" || currentUser?.role === "manager";
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [payrolls, setPayrolls] = useState<Payroll[]>([]);
  const [salarySlips, setSalarySlips] = useState<SalarySlip[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const [showPreviewDialog, setShowPreviewDialog] = useState(false);
  const [previewData, setPreviewData] = useState<PreviewData | null>(null);
  const [companiesById, setCompaniesById] = useState<
    Record<string, Record<string, unknown>>
  >({});
  const [selectedManager, setSelectedManager] = useState<string>("");
  const [managersById, setManagersById] = useState<
    Record<string, Record<string, unknown>>
  >({});
  const [searchTermGenerated, setSearchTermGenerated] = useState("");
  const [success, setSuccess] = useState("");
  const [error, setError] = useState("");
  const [imageCache, setImageCache] = useState<Record<string, string>>({});
  const [allTemplates, setAllTemplates] = useState<SalaryTemplate[]>([]);
  const [allSlipTemplates, setAllSlipTemplates] = useState<SlipTemplate[]>([]);
  // attendanceDeductionByEmployee[employeeId] = result from computeAttendanceDeduction
  const [attendanceDeductionByEmployee, setAttendanceDeductionByEmployee] = useState<
    Record<string, AttendanceDeductionResult>
  >({});
  // attendanceVarsByEmployee[employeeId] = live attendance variables for formula context
  const [attendanceVarsByEmployee, setAttendanceVarsByEmployee] = useState<
    Map<string, AttendanceVariables>
  >(new Map());

  const normalizeManagerIds = (
    value: unknown,
    singleValue?: unknown,
  ): string[] => {
    if (Array.isArray(value)) {
      return value.filter(
        (id): id is string => typeof id === "string" && !!id.trim(),
      );
    }
    if (typeof value === "string" && value.trim()) {
      return [value.trim()];
    }
    if (typeof singleValue === "string" && singleValue.trim()) {
      return [singleValue.trim()];
    }
    return [];
  };

  useEffect(() => {
    loadData();
    // Load templates for dynamic slip generation
    if (currentUser?.uid) {
      salaryTemplateService.getAll(currentUser.uid).then(setAllTemplates).catch(console.error);
      slipTemplateService.getAll(currentUser.uid).then(setAllSlipTemplates).catch(console.error);
    }
  }, [selectedMonth, selectedYear]);

  const toAmount = (value: unknown) => {
    const n = Number(value ?? 0);
    return Number.isFinite(n) ? n : 0;
  };

  const fmtAmount = (value: unknown) => toAmount(value).toFixed(2);

  const formatEmployeeDate = (value: unknown): string => {
    if (!value) return "-";

    // Excel serial number (e.g. 45678) — convert to JS date
    if (typeof value === "number") {
      // Excel epoch: Dec 30, 1899
      const excelEpoch = new Date(1899, 11, 30);
      const ms = excelEpoch.getTime() + value * 86400000;
      const d = new Date(ms);
      if (!Number.isNaN(d.getTime())) return d.toLocaleDateString();
      return String(value);
    }

    if (value instanceof Date) {
      return value.toLocaleDateString();
    }

    if (
      typeof value === "object" &&
      value !== null &&
      "seconds" in (value as Record<string, unknown>)
    ) {
      const seconds = Number((value as { seconds?: unknown }).seconds || 0);
      if (Number.isFinite(seconds) && seconds > 0) {
        return new Date(seconds * 1000).toLocaleDateString();
      }
    }

    if (
      typeof value === "object" &&
      value !== null &&
      typeof (value as { toDate?: unknown }).toDate === "function"
    ) {
      const dateValue = (value as { toDate: () => Date }).toDate();
      if (dateValue instanceof Date && !Number.isNaN(dateValue.getTime())) {
        return dateValue.toLocaleDateString();
      }
    }

    const str = String(value).trim();
    if (!str) return "-";

    const parsed = new Date(str);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toLocaleDateString();
    }

    return str;
  };

  const preloadImageToCache = async (url: string, cacheKey: string) => {
    if (!url) return "";

    const normalizedUrl = String(url).trim();
    if (!normalizedUrl) return "";

    if (normalizedUrl.startsWith("data:image/")) {
      return normalizedUrl;
    }

    if (imageCache[cacheKey]) {
      return imageCache[cacheKey];
    }

    try {
      // Use server-side proxy to avoid CORS issues with R2
      const proxyUrl = `/api/proxy-image?url=${encodeURIComponent(normalizedUrl)}`;
      const response = await fetch(proxyUrl);
      if (!response.ok) {
        throw new Error(`Proxy fetch failed with status ${response.status}`);
      }
      const { dataUrl } = await response.json() as { dataUrl: string };
      if (!dataUrl) throw new Error("No dataUrl in proxy response");
      setImageCache((prev) => ({ ...prev, [cacheKey]: dataUrl }));
      return dataUrl;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[ImageCache] Failed for ${cacheKey}: ${msg}`);
      setImageCache((prev) => ({ ...prev, [cacheKey]: "" }));
      return "";
    }
  };

  const clearImageCache = () => {
    console.log("Clearing image cache");
    setImageCache({});
  };

  const detectImageFormat = (dataUrl: string): string => {
    if (dataUrl.startsWith("data:image/png")) return "PNG";
    if (dataUrl.startsWith("data:image/jpeg")) return "JPEG";
    if (dataUrl.startsWith("data:image/jpg")) return "JPEG";
    if (dataUrl.startsWith("data:image/gif")) return "GIF";
    if (dataUrl.startsWith("data:image/webp")) return "WEBP";
    return "JPEG";
  };

  const calculateProfessionalTax = (totalGross: number): number => {
    if (totalGross < 7501) return 0;
    if (totalGross <= 10000) return 175;
    return 200;
  };

  const calculateESICEmployee = (
    totalGross: number,
    percentage: number = 0.75,
  ): number => Math.ceil(totalGross * (percentage / 100));

  const calculatePFBase = (
    basic: number,
    da: number,
    totalDays: number,
    paidDays: number,
  ): number => {
    if (totalDays <= 0) return Math.round(basic + da);
    return Math.round(((basic + da) / totalDays) * paidDays);
  };

  const calculatePFEmployee = (
    pfBase: number,
    percentage: number = 12,
  ): number => Math.round(pfBase * (percentage / 100));

  const calculateESICEmployer = (
    totalGross: number,
    percentage: number = 3.25,
  ): number => Math.round(totalGross * (percentage / 100));

  const calculatePFEmployer = (
    pfBase: number,
    percentage: number = 13,
  ): number => Math.round(pfBase * (percentage / 100));

  const calculateMLWFEmployer = (
    totalGross: number,
    mlwfAmount: number = 1,
  ): number => (totalGross > 0 ? mlwfAmount : 0);

  const getDeductionAmounts = (
    employee: Employee,
    payroll: Payroll,
  ): {
    professionalTax: number;
    esicEmployee: number;
    pfBase: number;
    pfEmployee: number;
    totalDeduction: number;
    netSalary: number;
    esicEmployer: number;
    pfEmployer: number;
    mlwfEmployer: number;
  } => {
    const salary = employee.salary || {};
    const totalGrossEarning = toAmount(
      (salary as Record<string, unknown>).totalGrossEarning ??
        payroll.grossSalary ??
        payroll.baseSalary +
          payroll.hra +
          payroll.ta +
          payroll.da +
          payroll.totalBonus,
    );

    const totalDays =
      toAmount((salary as Record<string, unknown>).totalDays) || 30;
    const paidDays =
      toAmount((salary as Record<string, unknown>).paidDays) || totalDays;

    const basic = toAmount(
      (salary as Record<string, unknown>).basic ?? payroll.baseSalary,
    );
    const da = toAmount((salary as Record<string, unknown>).da ?? payroll.da);

    const professionalTax =
      toAmount((salary as Record<string, unknown>).professionalTax) ||
      calculateProfessionalTax(totalGrossEarning);
    const esicEmployeePercentage =
      Number(
        (salary as Record<string, unknown>).esicEmployeePercentage ?? 0.75,
      ) || 0.75;
    const pfEmployeePercentage =
      Number((salary as Record<string, unknown>).pfEmployeePercentage ?? 12) ||
      12;
    const esicEmployerPercentage =
      Number(
        (salary as Record<string, unknown>).esicEmployerPercentage ?? 3.25,
      ) || 3.25;
    const pfEmployerPercentage =
      Number((salary as Record<string, unknown>).pfEmployerPercentage ?? 13) ||
      13;
    const mlwfEmployerAmount =
      Number((salary as Record<string, unknown>).mlwfEmployerAmount ?? 1) || 1;

    const pfBase =
      toAmount((salary as Record<string, unknown>).pfBase) ||
      calculatePFBase(basic, da, totalDays, paidDays);
    const esicEmployee =
      toAmount((salary as Record<string, unknown>).esicEmployee) ||
      calculateESICEmployee(totalGrossEarning, esicEmployeePercentage);
    const pfEmployee =
      toAmount((salary as Record<string, unknown>).pfEmployee) ||
      calculatePFEmployee(pfBase, pfEmployeePercentage);
    const esicEmployer =
      toAmount((salary as Record<string, unknown>).esicEmployer) ||
      calculateESICEmployer(totalGrossEarning, esicEmployerPercentage);
    const pfEmployer =
      toAmount((salary as Record<string, unknown>).pfEmployer) ||
      calculatePFEmployer(pfBase, pfEmployerPercentage);
    const mlwfEmployer =
      toAmount((salary as Record<string, unknown>).mlwfEmployer) ||
      calculateMLWFEmployer(totalGrossEarning, mlwfEmployerAmount);

    const advance = toAmount((salary as Record<string, unknown>).advance);
    const customDeductions = Array.isArray(
      (salary as Record<string, unknown>).customDeductions,
    )
      ? ((salary as Record<string, unknown>).customDeductions as Array<{
          amount?: unknown;
        }>)
      : [];
    const totalCustomDeductions = customDeductions.reduce(
      (sum, deduction) => sum + toAmount(deduction.amount),
      0,
    );

    const totalDeduction =
      toAmount((salary as Record<string, unknown>).totalDeduction) ||
      professionalTax +
        esicEmployee +
        pfEmployee +
        totalCustomDeductions +
        advance;
    const netSalary =
      toAmount((salary as Record<string, unknown>).netSalary) ||
      Math.max(totalGrossEarning - totalDeduction, 0);

    return {
      professionalTax,
      esicEmployee,
      pfBase,
      pfEmployee,
      totalDeduction,
      netSalary,
      esicEmployer,
      pfEmployer,
      mlwfEmployer,
    };
  };

  // ── Template-driven slip row builder ─────────────────────────────────────────

  const getTemplateForEmployee = (employee: Employee): SalaryTemplate | null => {
    const managerId =
      (Array.isArray(employee.assignedManagers)
        ? employee.assignedManagers[0]
        : employee.assignedManager) ?? "";
    const mgr = managersById[managerId] as Record<string, unknown> | undefined;
    const templateId = mgr?.salaryTemplateId as string | undefined;
    if (templateId) {
      const t = allTemplates.find((t) => t.id === templateId);
      if (t) return t;
    }
    return allTemplates.find((t) => t.managerId === null) ?? null;
  };

  const buildTemplateSlipRows = (
    employee: Employee,
    payroll: Payroll,
    tmpl: SalaryTemplate,
    attendanceDeduction: number = 0,
    baseAfterAttendance: number = 0,
    liveVars?: AttendanceVariables,
  ): { earnings: string[][]; deductions: string[][]; netSalary: string } => {
    const s = (employee.salary ?? {}) as Record<string, unknown>;

    // ── Seed ctx with ALL pre-calculated values from employee.salary ──────────
    // (section.type drives earnings/deductions — slipConfig is NOT used)
    // This ensures columns without formulas (e.g. professional_tax) still work

    // Attendance counts: use live vars when available (Req 2.1, 2.2, 2.3, 4.1),
    // otherwise fall back to snapshot values from payroll/salary objects.
    const liveAttendanceCtx = liveVars ? buildAttendanceContext(liveVars) : null;

    // Snapshot-derived fallback values (only used when liveVars is absent)
    const totalDaysVal = toAmount(s.totalDays) || toAmount((payroll as any).totalDays) || 30;
    const paidDaysVal = toAmount(s.paidDays) || toAmount((payroll as any).paidDays) || totalDaysVal;

    const ctx: Record<string, unknown> = {
      // identity
      name: employee.fullName ?? "",
      employee_id: employee.employeeId ?? "",
      designation: (employee as any).designation ?? "",
      department: (employee as any).department ?? "",
      father_name: (employee as any).fatherName ?? "",
      dob:            formatEmployeeDate((employee as any).dob),
      joining_date:   formatEmployeeDate((employee as any).joinDate),
      esic_no: employee.esicNo ?? "",
      uan: employee.uan ?? "",
      epf_no: (employee as any).epfNo ?? "",
      hq_location: (employee as any).hqLocation ?? "",
      bank_account: (employee as any).bankAccount ?? "",
      ifsc_code: (employee as any).ifscCode ?? "",
      employee_type: (employee as Record<string, unknown>).employeeType ?? "",
      // raw inputs
      basic: toAmount(s.basic ?? s.base ?? payroll.baseSalary),
      da: toAmount(s.da ?? payroll.da),
      // Attendance fields: live vars take priority; snapshot is the fallback (Req 2.1, 4.1)
      total_days:     liveAttendanceCtx ? liveAttendanceCtx.total_days     : totalDaysVal,
      paid_days:      liveAttendanceCtx ? liveAttendanceCtx.paid_days      : paidDaysVal,
      present_days:   liveAttendanceCtx ? liveAttendanceCtx.present_days   : (toAmount((payroll as any).presentDays)  || toAmount(s.presentDays)  || paidDaysVal),
      absent_days:    liveAttendanceCtx ? liveAttendanceCtx.absent_days    : (toAmount((payroll as any).absentDays)   || toAmount(s.absentDays)   || Math.max(0, totalDaysVal - paidDaysVal)),
      half_days:      liveAttendanceCtx ? liveAttendanceCtx.half_days      : (toAmount((payroll as any).halfDayDays)  || toAmount(s.halfDayDays)),
      half_day_days:  liveAttendanceCtx ? liveAttendanceCtx.half_day_days  : (toAmount((payroll as any).halfDayDays)  || toAmount(s.halfDayDays)),
      leave_days:     liveAttendanceCtx ? liveAttendanceCtx.leave_days     : (toAmount((payroll as any).leaveDays)    || toAmount(s.leaveDays)),
      paid_leave_days:liveAttendanceCtx ? liveAttendanceCtx.paid_leave_days: 0,
      unmarked_days:  liveAttendanceCtx ? liveAttendanceCtx.unmarked_days  : (toAmount((payroll as any).unmarkedDays) || toAmount(s.unmarkedDays)),
      single_ot_hours: toAmount(s.singleOTHours),
      double_ot_hours: toAmount(s.doubleOTHours),
      difference: toAmount(s.difference),
      advance: toAmount(s.advance),
      // pre-calculated earnings (from SalaryStructures engine)
      hra: toAmount(s.hra),
      gross_rate_pm: toAmount(s.grossRatePM),
      gross_earning: toAmount(s.totalGrossEarning),
      ot_rate: toAmount(s.otRatePerHour),
      ot_amount: toAmount(s.otAmount),
      total_gross: toAmount(s.totalGrossEarning),
      // attendance deduction context keys (Req 5.2, 5.3)
      attendance_deduction: attendanceDeduction,
      base_after_attendance: baseAfterAttendance > 0
        ? baseAfterAttendance
        : toAmount(s.basic ?? s.base ?? payroll.baseSalary),
      // pre-calculated deductions
      professional_tax: toAmount(s.professionalTax),
      esic_employee: toAmount(s.esicEmployee),
      pf_base: toAmount(s.pfBase),
      pf_employee: toAmount(s.pfEmployee),
      total_deduction: toAmount(s.totalDeduction),
      net_salary: toAmount(s.netSalary),
      // employer
      esic_employer: toAmount(s.esicEmployer),
      pf_employer: toAmount(s.pfEmployer),
      mlwf_employer: toAmount(s.mlwfEmployer),
      ctc_per_month: toAmount(s.ctcPerMonth),
    };

    // ── Re-evaluate template formulas on top (overrides pre-calc if formula exists) ──
    const sortedSections = [...tmpl.sections].sort((a, b) => a.order - b.order);
    for (const sec of sortedSections) {
      for (const col of sec.columns) {
        if (col.formula?.expression) {
          const result = evaluateTemplateFormula(col.formula.expression, ctx);
          if (typeof result === "number" && isFinite(result)) {
            ctx[col.key] = result;
          }
        }
        // For columns without formula, if ctx doesn't have the key yet, try salary object
        if (ctx[col.key] === undefined || ctx[col.key] === 0) {
          const fromSalary = s[col.key];
          if (fromSalary !== undefined) ctx[col.key] = toAmount(fromSalary);
        }
      }
    }

    const earnings: string[][] = [];
    const deductions: string[][] = [];

    // ── Route columns into earnings/deductions based on section.type ──────────
    // "earnings"              → all columns go to earnings table
    // "deductions"            → all columns go to deductions table
    // "employer_contributions"→ skip (not shown on employee-facing slip)
    // "custom"                → skip info/identity columns; include if section
    //                           label contains "earn" or "deduc" (graceful fallback)
    // slipConfig is intentionally ignored — section.type is the source of truth.
    for (const sec of sortedSections) {
      const secType = sec.type as string;
      if (secType === "employer_contributions") continue; // never on employee slip

      // Determine which bucket this section feeds
      let bucket: "earnings" | "deductions" | "skip" = "skip";
      if (secType === "earnings") {
        bucket = "earnings";
      } else if (secType === "deductions") {
        bucket = "deductions";
      } else {
        // custom section — infer from label as last resort
        const lbl = sec.label.toLowerCase();
        if (lbl.includes("earn") || lbl.includes("salary") || lbl.includes("gross") || lbl.includes("allowance")) {
          bucket = "earnings";
        } else if (lbl.includes("deduc") || lbl.includes("tax") || lbl.includes("pf") || lbl.includes("esic")) {
          bucket = "deductions";
        }
      }
      if (bucket === "skip") continue;

      for (const col of sec.columns) {
        // Skip pure identity/info columns that have no numeric meaning
        const infoKeys = new Set(["name", "employee_id", "esic_no", "uan", "epf_no", "father_name", "designation", "department", "dob", "joining_date", "hq_location", "bank_account", "ifsc_code", "employee_type"]);
        if (infoKeys.has(col.key)) continue;

        // Skip attendance count columns (they appear in the attendance table already)
        const attendanceKeys = new Set(["total_days", "paid_days", "present_days", "absent_days", "half_days", "leave_days", "paid_leave_days", "unmarked_days"]);
        if (attendanceKeys.has(col.key)) continue;

        const val = toAmount(ctx[col.key]);

        // Skip zero-value rows for non-formula columns to keep the slip clean
        // (formula columns at zero are kept — they may be intentional e.g. "no OT this month")
        if (val === 0 && !col.formula?.expression) continue;

        const label = col.slipConfig?.slipLabel || col.label;
        const formatted = fmtAmount(val);

        if (bucket === "earnings") {
          earnings.push([label, formatted, formatted]);
        } else {
          deductions.push([label, formatted]);
        }
      }
    }

    // ── Net salary: look for net_salary key in ctx first, then auto-compute ───
    let finalNet: number;
    const ctxNet = toAmount(ctx["net_salary"]);
    if (ctxNet > 0) {
      finalNet = ctxNet;
    } else {
      // Auto-sum: sum all earnings rows minus all deductions rows
      // The last row of each group is typically a subtotal; sum everything since
      // we already skipped employer contributions
      const sumE = earnings.reduce((sum, row) => sum + parseFloat(row[1] || "0"), 0);
      const sumD = deductions.reduce((sum, row) => sum + parseFloat(row[1] || "0"), 0);
      finalNet = Math.max(0, sumE - sumD);
    }

    return {
      earnings: earnings.map((r) => r.map(String)),
      deductions: deductions.map((r) => r.map(String)),
      netSalary: fmtAmount(finalNet),
    };
  };

  const getPayslipModel = (
    employee: Employee,
    payroll: Payroll,
    selectedManagerId?: string,
    attendanceDeductionResult?: AttendanceDeductionResult,
  ): PayslipModel => {
    const monthLabel =
      months.find((m) => m.value === payroll.month)?.label || "Month";
    const period = `${monthLabel.slice(0, 3).toUpperCase()}-${payroll.year}`;
    const salary = employee.salary || {};

    const basic = toAmount(
      (salary as Record<string, unknown>).basic ?? payroll.baseSalary,
    );
    const hra = toAmount(
      (salary as Record<string, unknown>).hra ?? payroll.hra,
    );
    const ta = toAmount((salary as Record<string, unknown>).ta ?? payroll.ta);
    const da = toAmount((salary as Record<string, unknown>).da ?? payroll.da);
    const totalBonus = toAmount(
      (salary as Record<string, unknown>).totalBonus ?? payroll.totalBonus,
    );
    const grossSalary = toAmount(
      (salary as Record<string, unknown>).grossRatePM ?? payroll.grossSalary,
    );

    const deductionAmounts = getDeductionAmounts(employee, payroll);

    // Attendance deduction — from saved period config (if available)
    const attendanceDeduction = attendanceDeductionResult?.totalDeductionAmount ?? 0;
    const baseAfterAttendance = attendanceDeductionResult?.baseSalaryAfterAttendance ?? basic;

    // Statutory deductions (use pre-calculated values from salary object)
    const epf = deductionAmounts.pfEmployee;
    const pt = deductionAmounts.professionalTax;
    const esic = deductionAmounts.esicEmployee;
    const tds = toAmount(
      (payroll as unknown as { taxAmount?: unknown }).taxAmount,
    );
    const advance = toAmount((salary as Record<string, unknown>).advance);
    const mlwf = deductionAmounts.mlwfEmployer;
    const totalDeduction = deductionAmounts.totalDeduction;
    const netSalary = deductionAmounts.netSalary;

    const totalDays =
      toAmount((salary as Record<string, unknown>).totalDays) || 30;
    const paidDays =
      toAmount((salary as Record<string, unknown>).paidDays) || totalDays;

    const companyId =
      employee.companyId || currentUser?.companyId || currentUser?.uid || "";
    const companyData = companyId ? companiesById[companyId] : undefined;
    const companyAddressObj =
      (companyData?.address as Record<string, unknown> | undefined) || {};
    const composedCompanyAddress = [
      String(companyAddressObj.buildingBlock || "").trim(),
      String(companyAddressObj.street || "").trim(),
      String(companyAddressObj.city || "").trim(),
      String(companyAddressObj.state || "").trim(),
      String(companyAddressObj.pinCode || "").trim(),
    ]
      .filter(Boolean)
      .join(", ");

    // Auto-resolve manager from employee's assignedManagers if no explicit selectedManagerId
    const resolvedManagerId =
      selectedManagerId ||
      normalizeManagerIds(
        employee.assignedManagers,
        (employee as unknown as { assignedManager?: unknown }).assignedManager,
      )[0] ||
      "";

    const managerData = resolvedManagerId
      ? managersById[resolvedManagerId]
      : undefined;

    // All branding fields are stored under manager.payslipBranding
    const payslipBranding =
      (managerData?.payslipBranding as Record<string, unknown> | undefined) || {};
    const managerAddress =
      (payslipBranding.address as Record<string, unknown> | undefined) || {};
    const composedManagerAddress = [
      String(managerAddress.buildingBlock || "").trim(),
      String(managerAddress.street || "").trim(),
      String(managerAddress.city || "").trim(),
      String(managerAddress.state || "").trim(),
      String(managerAddress.pinCode || "").trim(),
    ]
      .filter(Boolean)
      .join(", ");

    return {
      companyName: String(
        payslipBranding.companyName ||
          companyData?.companyName ||
          companyData?.name ||
          companyData?.adminName ||
          employee.companyName ||
          "COMPANY NAME",
      ),
      companyAddress: String(
        payslipBranding.companyAddress ||
          composedManagerAddress ||
          composedCompanyAddress ||
          "123 Business Street, City, State 12345",
      ),
      period,
      paidMode: "",
      logoUrl: String(payslipBranding.logoUrl || ""),
      stampUrl: String(payslipBranding.stampUrl || ""),
      signUrl: String(payslipBranding.signUrl || ""),
      details: [
        ["E Code", employee.employeeId || "-"],
        ["Name", employee.fullName || "-"],
        [
          "Father Name",
          String((employee as Record<string, unknown>).fatherName || "-"),
        ],
        [
          "Designation",
          String((employee as Record<string, unknown>).designation || "-"),
        ],
        [
          "Department",
          String((employee as Record<string, unknown>).department || "-"),
        ],
        [
          "D.O.J",
          formatEmployeeDate((employee as Record<string, unknown>).joinDate),
        ],
        [
          "D.O.B",
          formatEmployeeDate((employee as Record<string, unknown>).dob),
        ],
        ["EPF No.", String((employee as Record<string, unknown>).epfNo || "-")],
        ["UAN No.", String(employee.uan || "-")],
        ["ESIC", String(employee.esicNo || "-")],
        [
          "HQ Location",
          String((employee as Record<string, unknown>).hqLocation || "-"),
        ],
      ].map((row) => row.map((cell) => String(cell))),
      attendance: (() => {
        // Req 1.3, 3.1, 3.2, 3.3, 4.1, 4.2 — use live attendance vars if available
        const liveVars = attendanceVarsByEmployee.get(employee.id ?? "");
        if (liveVars) {
          return buildAttendanceRows(liveVars);
        }
        if (attendanceDeductionResult) {
          const s = attendanceDeductionResult.summary;
          const periodDays = attendanceDeductionResult.workingDaysInPeriod;
          return [
            ["Total Days", String(periodDays)],
            ["Present Days", String(s.present)],
            ["Absent Days", String(s.absent + s.unmarked)],
            ["Half Days", String(s["half-day"])],
            ["Leave Days", String(s.leave)],
          ];
        }
        // No attendance data — show dashes
        return [
          ["Total Days", "-"],
          ["Present Days", "-"],
          ["Absent Days", "-"],
          ["Half Days", "-"],
          ["Leave Days", "-"],
        ];
      })(),
      earnings: (() => {
        const tmpl = getTemplateForEmployee(employee);
        const liveVars = attendanceVarsByEmployee.get(employee.id ?? "");
        if (tmpl) {
          return buildTemplateSlipRows(employee, payroll, tmpl, attendanceDeduction, baseAfterAttendance, liveVars).earnings;
        }
        // Fallback: use live salary data from employee.salary
        const rows: string[][] = [
          ["BASIC SALARY", fmtAmount(basic), fmtAmount(basic)],
        ];
        if (hra > 0)        rows.push(["H.R.A",              fmtAmount(hra),        fmtAmount(hra)]);
        if (da > 0)         rows.push(["D.A.",               fmtAmount(da),         fmtAmount(da)]);
        if (ta > 0)         rows.push(["CONVEYANCE ALL.",    fmtAmount(ta),         fmtAmount(ta)]);
        if (totalBonus > 0) rows.push(["OTHER ALLOWANCES",  fmtAmount(totalBonus), fmtAmount(totalBonus)]);
        // Custom allowances from employee.salary
        const customAllowances = Array.isArray((salary as any).customAllowances)
          ? (salary as any).customAllowances as Array<{ label?: string; amount?: unknown }>
          : [];
        customAllowances.forEach((a) => {
          const amt = toAmount(a.amount);
          if (amt > 0) rows.push([a.label || "Allowance", fmtAmount(amt), fmtAmount(amt)]);
        });
        if (attendanceDeduction > 0) {
          rows.push(["ATTENDANCE DEDUCTION", `-${fmtAmount(attendanceDeduction)}`, `-${fmtAmount(attendanceDeduction)}`]);
        }
        rows.push(["TOTAL GROSS EARNING", fmtAmount(grossSalary), fmtAmount(grossSalary)]);
        return rows.map((row) => row.map(String));
      })(),
      deductions: (() => {
        const tmpl = getTemplateForEmployee(employee);
        const liveVars = attendanceVarsByEmployee.get(employee.id ?? "");
        if (tmpl) {
          return buildTemplateSlipRows(employee, payroll, tmpl, attendanceDeduction, baseAfterAttendance, liveVars).deductions;
        }
        // Fallback: use pre-calculated values from employee.salary
        const rows: string[][] = [];
        if (pt > 0)       rows.push(["PROF. TAX",  fmtAmount(pt)]);
        if (esic > 0)     rows.push(["ESIC",        fmtAmount(esic)]);
        if (epf > 0)      rows.push(["EPF / PF",    fmtAmount(epf)]);
        if (tds > 0)      rows.push(["TDS",          fmtAmount(tds)]);
        if (advance > 0)  rows.push(["ADVANCE",      fmtAmount(advance)]);
        if (mlwf > 0)     rows.push(["MLWF",         fmtAmount(mlwf)]);
        // Custom deductions from employee.salary
        const customDeductions = Array.isArray((salary as any).customDeductions)
          ? (salary as any).customDeductions as Array<{ label?: string; amount?: unknown }>
          : [];
        customDeductions.forEach((d) => {
          const amt = toAmount(d.amount);
          if (amt > 0) rows.push([d.label || "Deduction", fmtAmount(amt)]);
        });
        rows.push(["TOTAL DEDUCTION", fmtAmount(totalDeduction)]);
        return rows.map((row) => row.map(String));
      })(),
      netSalary: (() => {
        const tmpl = getTemplateForEmployee(employee);
        const liveVars = attendanceVarsByEmployee.get(employee.id ?? "");
        if (tmpl) return buildTemplateSlipRows(employee, payroll, tmpl, attendanceDeduction, baseAfterAttendance, liveVars).netSalary;
        return fmtAmount(netSalary);
      })(),
    };
  };

  const serializeRowsForFirestore = (rows: string[][]): StoredSlipRow[] =>
    rows.map((row) => ({
      cells: row.map((cell) => String(cell ?? "")),
    }));

  const normalizeRows = (value: unknown): string[][] => {
    if (!Array.isArray(value)) return [];
    return value
      .map((row) => {
        if (Array.isArray(row)) {
          return row.map((cell) => String(cell ?? ""));
        }

        if (
          row &&
          typeof row === "object" &&
          Array.isArray((row as { cells?: unknown }).cells)
        ) {
          return ((row as { cells: unknown[] }).cells || []).map((cell) =>
            String(cell ?? ""),
          );
        }

        return null;
      })
      .filter((row): row is string[] => Array.isArray(row));
  };

  const getStoredSlipModel = (slip: SalarySlip): PayslipModel | null => {
    const raw = (slip as unknown as { slipData?: unknown }).slipData;
    if (!raw || typeof raw !== "object") return null;
    const data = raw as Record<string, unknown>;

    return {
      companyName: String(data.companyName || "COMPANY NAME"),
      companyAddress: String(data.companyAddress || ""),
      period: String(data.period || `${slip.month}/${slip.year}`),
      paidMode: String(data.paidMode || ""),
      logoUrl: String(data.logoUrl || ""),
      stampUrl: String(data.stampUrl || ""),
      signUrl: String(data.signUrl || ""),
      details: normalizeRows(data.details),
      attendance: normalizeRows(data.attendance),
      earnings: normalizeRows(data.earnings),
      deductions: normalizeRows(data.deductions),
      netSalary: String(data.netSalary || "0.00"),
    };
  };

  const loadData = async () => {
    try {
      setLoading(true);

      // Load employees
      const employeesQuery =
        isEmployee && currentUser?.employeeId
          ? query(
              collection(db, "employees"),
              where("employeeId", "==", currentUser.employeeId),
            )
          : query(collection(db, "employees"), orderBy("fullName"));
      const employeesSnapshot = await getDocs(employeesQuery);
      const employeesData = employeesSnapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as Employee[];
      setEmployees(employeesData);

      // Fetch live attendance variables for each employee in parallel (Req 1.1, 1.2, 4.3)
      const daysInMonth = new Date(selectedYear, selectedMonth, 0).getDate();
      const attendanceVarsEntries = await Promise.all(
        employeesData.map(async (emp) => {
          const vars = await fetchAttendanceVariables(
            db,
            emp.id ?? "",
            selectedMonth,
            selectedYear,
            daysInMonth,
          );
          return [emp.id ?? "", vars] as const;
        }),
      );
      setAttendanceVarsByEmployee(new Map(attendanceVarsEntries));

      const uniqueCompanyIds = Array.from(
        new Set(
          employeesData
            .map((emp) => emp.companyId)
            .filter((id): id is string => !!id),
        ),
      );

      const companyMap: Record<string, Record<string, unknown>> = {};
      for (const companyId of uniqueCompanyIds) {
        const companySnapshot = await getDoc(doc(db, "companies", companyId));
        if (companySnapshot.exists()) {
          companyMap[companyId] = companySnapshot.data() as Record<
            string,
            unknown
          >;
        }
      }

      if (currentUser?.uid && !companyMap[currentUser.uid]) {
        const fallbackCompanySnapshot = await getDoc(
          doc(db, "companies", currentUser.uid),
        );
        if (fallbackCompanySnapshot.exists()) {
          companyMap[currentUser.uid] =
            fallbackCompanySnapshot.data() as Record<string, unknown>;
        }
      }

      setCompaniesById(companyMap);

      // Load managers
      const uniqueManagerIds = Array.from(
        new Set(
          employeesData.flatMap((emp) =>
            normalizeManagerIds(
              emp.assignedManagers,
              (emp as unknown as { assignedManager?: unknown }).assignedManager,
            ),
          ),
        ),
      );

      const managerMap: Record<string, Record<string, unknown>> = {};
      for (const managerId of uniqueManagerIds) {
        const managerSnapshot = await getDoc(doc(db, "managers", managerId));
        if (managerSnapshot.exists()) {
          managerMap[managerId] = managerSnapshot.data() as Record<
            string,
            unknown
          >;
        }
      }

      setManagersById(managerMap);

      // Debug: Log employees data
      console.log("=== EMPLOYEES DATA ===");
      console.log("Total employees:", employeesData.length);
      employeesData.forEach((emp) => {
        console.log(
          `Employee: ${emp.fullName}, ID: ${emp.id}, employeeId: ${emp.employeeId}`,
        );
      });

      // Load payrolls for selected month/year
      const payrollsQuery =
        isEmployee && currentUser?.employeeId
          ? query(
              collection(db, "payroll"),
              where("employeeId", "==", currentUser.employeeId),
              where("month", "==", selectedMonth),
              where("year", "==", selectedYear),
            )
          : query(
              collection(db, "payroll"),
              where("month", "==", selectedMonth),
              where("year", "==", selectedYear),
            );
      const payrollsSnapshot = await getDocs(payrollsQuery);
      const payrollsData = (
        payrollsSnapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })) as Payroll[]
      ).filter((payroll) => payroll.status === "paid"); // Only show slips once payroll is marked as paid
      // Sort by processedAt in JavaScript
      payrollsData.sort((a, b) => {
        const dateA =
          a.processedAt instanceof Date
            ? a.processedAt
            : (a.processedAt as any)?.toDate?.();
        const dateB =
          b.processedAt instanceof Date
            ? b.processedAt
            : (b.processedAt as any)?.toDate?.();
        return dateB - dateA; // Sort in descending order
      });
      setPayrolls(payrollsData);

      // Debug: Log payrolls data
      console.log("=== PAYROLLS DATA ===");
      console.log("Total payrolls:", payrollsData.length);
      payrollsData.forEach((payroll) => {
        console.log(
          `Payroll ID: ${payroll.id}, employeeId: ${payroll.employeeId}`,
        );
      });

      // Load existing salary slips
      const slipsQuery =
        isEmployee && currentUser?.employeeId
          ? query(
              collection(db, "salary_slips"),
              where("employeeId", "==", currentUser.employeeId),
              where("month", "==", selectedMonth),
              where("year", "==", selectedYear),
            )
          : query(
              collection(db, "salary_slips"),
              where("month", "==", selectedMonth),
              where("year", "==", selectedYear),
            );
      const slipsSnapshot = await getDocs(slipsQuery);
      const slipsData = slipsSnapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as SalarySlip[];
      // Sort by generatedAt in JavaScript
      slipsData.sort((a, b) => {
        const dateA =
          a.generatedAt instanceof Date
            ? a.generatedAt
            : (a.generatedAt as any)?.toDate?.();
        const dateB =
          b.generatedAt instanceof Date
            ? b.generatedAt
            : (b.generatedAt as any)?.toDate?.();
        return dateB - dateA; // Sort in descending order
      });
      setSalarySlips(slipsData);

      // Debug: Log salary slips data
      console.log("=== SALARY SLIPS DATA ===");
      console.log("Total slips:", slipsData.length);
      slipsData.forEach((slip) => {
        console.log(`Slip ID: ${slip.id}, employeeId: ${slip.employeeId}`);
        const foundEmployee = employeesData.find(
          (emp) => emp.employeeId === slip.employeeId,
        );
        console.log(
          `  -> Found employee: ${foundEmployee?.fullName || "NOT FOUND"}`,
        );
      });

      // Load attendance period configs for the selected month/year (Req 5.1–5.4)
      const companyId =
        currentUser?.companyId || currentUser?.uid || "";
      if (companyId) {
        const periodConfigQuery = query(
          collection(db, "attendancePeriodConfig"),
          where("companyId", "==", companyId),
          where("month", "==", selectedMonth),
          where("year", "==", selectedYear),
        );
        const periodConfigSnapshot = await getDocs(periodConfigQuery);

        if (!periodConfigSnapshot.empty) {
          // Use the most recently created config for this month/year
          const periodConfigDoc = periodConfigSnapshot.docs[0];
          const periodConfig = periodConfigDoc.data() as {
            deductionConfig: AttendanceDeductionConfig;
            startDate: unknown;
            endDate: unknown;
          };
          const deductionConfig: AttendanceDeductionConfig =
            periodConfig.deductionConfig ?? DEFAULT_DEDUCTION_CONFIG;

          // Determine working days from the period config dates
          const startTs = periodConfig.startDate as { toDate?: () => Date } | null;
          const endTs = periodConfig.endDate as { toDate?: () => Date } | null;
          const startDate = startTs?.toDate?.() ?? null;
          const endDate = endTs?.toDate?.() ?? null;
          const workingDays =
            startDate && endDate
              ? Math.round(
                  (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24),
                ) + 1
              : 30;

          // Fetch attendance docs for all employees for this month/year
          const attendanceQuery = query(
            collection(db, "attendance"),
            where("companyId", "==", companyId),
            where("month", "==", selectedMonth),
            where("year", "==", selectedYear),
          );
          const attendanceSnapshot = await getDocs(attendanceQuery);

          // Group attendance by employeeId
          const attendanceByEmp: Record<string, Record<string, string>> = {};
          for (const attDoc of attendanceSnapshot.docs) {
            const att = attDoc.data() as {
              employeeId?: string;
              date?: unknown;
              status?: string;
            };
            if (!att.employeeId || !att.status) continue;
            const dateVal = att.date as { toDate?: () => Date } | null;
            const dateObj = dateVal?.toDate?.() ?? null;
            if (!dateObj) continue;
            const dateKey = dateObj.toISOString().slice(0, 10);
            if (!attendanceByEmp[att.employeeId]) {
              attendanceByEmp[att.employeeId] = {};
            }
            attendanceByEmp[att.employeeId][dateKey] = att.status;
          }

          // Compute deduction result per employee
          const deductionMap: Record<string, AttendanceDeductionResult> = {};
          for (const emp of employeesData) {
            const empId = emp.id ?? "";  // attendance docs store employee.id (Firestore doc ID)
            if (!empId) continue;
            const salary = (emp.salary ?? {}) as Record<string, unknown>;
            const baseSalary = toAmount(
              salary.basic ?? salary.base ?? (emp as unknown as { baseSalary?: unknown }).baseSalary ?? 0,
            );
            const attendanceMap = attendanceByEmp[empId] ?? {};
            deductionMap[empId] = computeAttendanceDeduction(
              attendanceMap,
              baseSalary,
              workingDays,
              deductionConfig,
            );
          }
          setAttendanceDeductionByEmployee(deductionMap);
        } else {
          setAttendanceDeductionByEmployee({});
        }
      }
    } catch (error) {
      console.error("Error loading data:", error);
      setError("Failed to load data");
    } finally {
      setLoading(false);
    }
  };

  // ── Slip template (canvas) resolver ──────────────────────────────────────────
  // Picks the right SlipTemplate (from slipTemplates collection) for an employee:
  //   0. The snapshot captured on the payroll record when it was proceeded
  //      (keeps the original format even if the live template is later deleted)
  //   1. Manager-specific template if the employee's manager has one
  //   2. Global template (scope === "global")
  //   3. null → fall back to hardcoded layout
  const getSlipTemplateForEmployee = (
    employee: Employee,
    payroll?: Payroll,
  ): SlipTemplate | null => {
    // Prefer the template snapshot stored on the payroll record at proceed time.
    const snapshot = (payroll as any)?.slipTemplateSnapshot as
      | SlipTemplate
      | null
      | undefined;
    if (snapshot && Array.isArray(snapshot.elements)) {
      return snapshot;
    }

    const managerId =
      (Array.isArray(employee.assignedManagers)
        ? employee.assignedManagers[0]
        : (employee as any).assignedManager) ?? "";
    // Manager-specific first
    if (managerId) {
      const managerTmpl = allSlipTemplates.find(
        (t) => t.scope === "manager" && t.managerId === managerId
      );
      if (managerTmpl) return managerTmpl;
    }
    // Global fallback
    return allSlipTemplates.find((t) => t.scope === "global") ?? null;
  };

  // ── Variable context builder ──────────────────────────────────────────────────
  // Builds a flat key→value map of every variable the slip template can reference.
  const buildSlipVariableContext = (
    employee: Employee,
    payroll: Payroll,
    managerData: Record<string, unknown> | undefined,
    companyData: Record<string, unknown> | undefined,
  ): Record<string, string> => {
    const s = (employee.salary ?? {}) as Record<string, unknown>;
    const months_names = ["January","February","March","April","May","June","July","August","September","October","November","December"];
    const payPeriod = `${months_names[(payroll.month ?? 1) - 1]?.slice(0, 3).toUpperCase() ?? "?"}-${payroll.year}`;

    const liveVars = attendanceVarsByEmployee.get(employee.id ?? "");

    const fmt = (v: unknown) => {
      const n = toAmount(v);
      return n === 0 ? "0.00" : n.toFixed(2);
    };

    const payslipBranding = (managerData?.payslipBranding as Record<string, unknown> | undefined) ?? {};
    const companyAddressObj = (companyData?.address as Record<string, unknown> | undefined) ?? {};
    const companyAddr = [
      String(companyAddressObj.buildingBlock || ""),
      String(companyAddressObj.street || ""),
      String(companyAddressObj.city || ""),
      String(companyAddressObj.state || ""),
      String(companyAddressObj.pinCode || ""),
    ].filter(Boolean).join(", ");

    return {
      // Employee Info
      employee_name:  String(employee.fullName ?? "-"),
      employee_id:    String(employee.employeeId ?? "-"),
      designation:    String((employee as any).designation ?? "-"),
      department:     String((employee as any).department ?? "-"),
      father_name:    String((employee as any).fatherName ?? "-"),
      dob:            formatEmployeeDate((employee as any).dob),
      joining_date:   formatEmployeeDate((employee as any).joinDate),
      esic_no:        String(employee.esicNo ?? "-"),
      uan:            String(employee.uan ?? "-"),
      epf_no:         String((employee as any).epfNo ?? "-"),
      bank_account:   String((employee as any).bankAccount ?? "-"),
      ifsc_code:      String((employee as any).ifscCode ?? "-"),
      hq_location:    String((employee as any).hqLocation ?? "-"),
      // Pay Period
      pay_month:      String(months_names[(payroll.month ?? 1) - 1] ?? "-"),
      pay_year:       String(payroll.year ?? "-"),
      pay_period:     payPeriod,
      total_days:     String(liveVars ? liveVars.total_days : (toAmount(s.totalDays) || 30)),
      paid_days:      String(liveVars
        ? (liveVars.present_days + liveVars.half_days * 0.5 + liveVars.leave_days + liveVars.paid_leave_days)
        : (toAmount(s.paidDays) || 30)),
      present_days:   String(liveVars ? liveVars.present_days   : toAmount(s.presentDays)),
      absent_days:    String(liveVars ? liveVars.absent_days    : toAmount(s.absentDays)),
      half_days:      String(liveVars ? liveVars.half_days      : toAmount(s.halfDayDays)),
      leave_days:     String(liveVars ? liveVars.leave_days     : toAmount(s.leaveDays)),
      paid_leave_days:String(liveVars ? liveVars.paid_leave_days : "0"),
      unmarked_days:  String(liveVars ? liveVars.unmarked_days  : "0"),
      // Earnings
      basic:          fmt(s.basic ?? s.base ?? payroll.baseSalary),
      da:             fmt(s.da ?? payroll.da),
      hra:            fmt(s.hra ?? payroll.hra),
      gross_rate_pm:  fmt(s.grossRatePM ?? payroll.grossSalary),
      gross_earning:  fmt(s.totalGrossEarning ?? payroll.grossSalary),
      ot_rate:        fmt(s.otRatePerHour),
      single_ot_hours:String(toAmount(s.singleOTHours)),
      double_ot_hours:String(toAmount(s.doubleOTHours)),
      ot_amount:      fmt(s.otAmount),
      difference:     fmt(s.difference),
      total_gross:    fmt(s.totalGrossEarning ?? payroll.grossSalary),
      // Deductions
      professional_tax: fmt(s.professionalTax),
      esic_employee:    fmt(s.esicEmployee),
      pf_base:          fmt(s.pfBase),
      pf_employee:      fmt(s.pfEmployee),
      advance:          fmt(s.advance),
      mlwf_employer:    fmt(s.mlwfEmployer),
      total_deduction:  fmt(s.totalDeduction ?? payroll.totalDeduction),
      // Net
      net_salary:       fmt(s.netSalary ?? payroll.netSalary),
      // Employer
      esic_employer:    fmt(s.esicEmployer),
      pf_employer:      fmt(s.pfEmployer),
      ctc_per_month:    fmt(s.ctcPerMonth),
      // Company / Manager
      company_name:    String(
        payslipBranding.companyName || companyData?.companyName || companyData?.name || "COMPANY NAME"
      ),
      company_address: String(payslipBranding.companyAddress || companyAddr || "-"),
    };
  };

  // ── Canvas-template PDF renderer ──────────────────────────────────────────────
  // Renders a SlipTemplate (canvas-based) to a jsPDF document.
  // Canvas is 794×1123px (A4 @96dpi). jsPDF A4 = 210×297mm.
  // Scale factor: 210/794 ≈ 0.2644 for x, 297/1123 ≈ 0.2645 for y.
  const renderSlipTemplatePDF = async (
    slipTmpl: SlipTemplate,
    employee: Employee,
    payroll: Payroll,
    logoDataUrl: string,
    stampDataUrl: string,
    signDataUrl: string,
  ): Promise<jsPDF> => {
    const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const PW = pdf.internal.pageSize.getWidth();   // 210mm
    const PH = pdf.internal.pageSize.getHeight();  // 297mm
    const CW = slipTmpl.canvasWidth  || 794;
    const CH = slipTmpl.canvasHeight || 1123;
    const sx = PW / CW;  // x scale
    const sy = PH / CH;  // y scale

    // Resolve manager data for this employee
    const managerId =
      (Array.isArray(employee.assignedManagers)
        ? employee.assignedManagers[0]
        : (employee as any).assignedManager) ?? "";
    const managerData = managerId ? managersById[managerId] : undefined;
    const companyData = companiesById[employee.companyId ?? currentUser?.uid ?? ""];

    const varCtx = buildSlipVariableContext(employee, payroll, managerData, companyData);

    const resolveVar = (key: string): string => varCtx[key] ?? key;

    // Sort elements by zIndex so lower layers render first
    const sorted = [...slipTmpl.elements].sort((a, b) => a.zIndex - b.zIndex);

    for (const el of sorted) {
      const x = el.x * sx;
      const y = el.y * sy;
      const w = el.width  * sx;
      const h = el.height * sy;

      switch (el.type) {
        case "text": {
          const te = el as TextElement;
          const [r, g, b] = hexToRgb(te.color);
          pdf.setTextColor(r, g, b);
          pdf.setFontSize(te.fontSize * sx * 2.835); // px→pt
          pdf.setFont("helvetica", te.fontStyle === "italic"
            ? (te.fontWeight === "bold" ? "bolditalic" : "italic")
            : (te.fontWeight === "bold" ? "bold" : "normal"));
          const tx = te.textAlign === "center" ? x + w / 2
            : te.textAlign === "right" ? x + w : x;
          const align = te.textAlign === "center" ? "center"
            : te.textAlign === "right" ? "right" : "left";
          pdf.text(te.content, tx, y + h / 2 + (te.fontSize * sx * 2.835) / 4, { align });
          break;
        }
        case "variable": {
          const ve = el as VariableElement;
          const value = resolveVar(ve.variableKey);
          const [r, g, b] = hexToRgb(ve.color);
          pdf.setTextColor(r, g, b);
          pdf.setFontSize(ve.fontSize * sx * 2.835);
          pdf.setFont("helvetica", ve.fontStyle === "italic"
            ? (ve.fontWeight === "bold" ? "bolditalic" : "italic")
            : (ve.fontWeight === "bold" ? "bold" : "normal"));
          const tx = ve.textAlign === "center" ? x + w / 2
            : ve.textAlign === "right" ? x + w : x;
          const align = ve.textAlign === "center" ? "center"
            : ve.textAlign === "right" ? "right" : "left";
          pdf.text(value, tx, y + h / 2 + (ve.fontSize * sx * 2.835) / 4, { align });
          break;
        }
        case "line": {
          const le = el as LineElement;
          const [r, g, b] = hexToRgb(le.color);
          pdf.setDrawColor(r, g, b);
          pdf.setLineWidth(le.thickness * sx);
          if (le.orientation === "horizontal") {
            pdf.line(x, y + h / 2, x + w, y + h / 2);
          } else {
            pdf.line(x + w / 2, y, x + w / 2, y + h);
          }
          break;
        }
        case "rectangle": {
          const re = el as RectElement;
          const [br, bg, bb] = hexToRgb(re.borderColor);
          pdf.setDrawColor(br, bg, bb);
          pdf.setLineWidth(re.borderWidth * sx);
          if (re.fillColor && re.fillColor !== "transparent") {
            const [fr, fg, fb] = hexToRgb(re.fillColor);
            pdf.setFillColor(fr, fg, fb);
            pdf.rect(x, y, w, h, re.borderWidth > 0 ? "FD" : "F");
          } else if (re.borderWidth > 0) {
            pdf.rect(x, y, w, h, "S");
          }
          break;
        }
        case "logo": {
          const imgUrl = logoDataUrl;
          if (imgUrl) {
            try {
              pdf.addImage(imgUrl, detectImageFormat(imgUrl), x, y, w, h);
            } catch { /* skip if image fails */ }
          }
          break;
        }
        case "stamp": {
          const imgUrl = stampDataUrl;
          if (imgUrl) {
            try {
              pdf.addImage(imgUrl, detectImageFormat(imgUrl), x, y, w, h);
            } catch { /* skip */ }
          }
          break;
        }
        case "signature": {
          const imgUrl = signDataUrl;
          if (imgUrl) {
            try {
              pdf.addImage(imgUrl, detectImageFormat(imgUrl), x, y, w, h);
            } catch { /* skip */ }
          }
          break;
        }
        case "table": {
          const te = el as TableElement;

          // Resolve each cell to a display string
          const resolveCellValue = (cell: TableCell): string => {
            switch (cell.kind) {
              case "variable":  return resolveVar(cell.variableKey ?? "");
              case "text":      return cell.text ?? "";
              case "logo":      return "[Logo]";
              case "stamp":     return "[Stamp]";
              case "signature": return "[Signature]";
              default:          return "";
            }
          };

          const [hbr, hbg, hbb] = hexToRgb(te.headerBgColor ?? "#2196f3");
          const [htR, htG, htB] = hexToRgb(te.headerTextColor ?? "#ffffff");
          const [brR, brG, brB] = hexToRgb(te.borderColor ?? "#cccccc");

          // Build head and body from the cell grid
          const headRows: string[][] = [];
          const bodyRows: string[][] = [];
          te.rows.forEach((row, ri) => {
            const cells = row.map(resolveCellValue);
            if (te.hasHeaderRow && ri === 0) headRows.push(cells);
            else bodyRows.push(cells);
          });

          autoTable(pdf, {
            startY: y,
            head: headRows.length > 0 ? headRows : undefined,
            body: bodyRows.length > 0 ? bodyRows : [[""]],
            theme: "grid",
            margin: { left: x, right: PW - (x + w) },
            tableWidth: w,
            styles: {
              fontSize: (te.fontSize ?? 10) * sx * 2.835,
              cellPadding: 1.5,
              textColor: [31, 41, 55],
              lineColor: [brR, brG, brB],
              lineWidth: (te.borderWidth ?? 1) * sx,
            },
            headStyles: {
              fillColor: [hbr, hbg, hbb],
              textColor: [htR, htG, htB],
              fontStyle: "bold",
            },
            alternateRowStyles: te.alternateRowColor ? { fillColor: [245, 245, 245] } : {},
          });
          break;
        }
      }
    }

    return pdf;
  };

  // ── Hex colour helper ─────────────────────────────────────────────────────────
  const hexToRgb = (hex: string): [number, number, number] => {
    const clean = hex.replace("#", "");
    if (clean.length === 3) {
      return [
        parseInt(clean[0] + clean[0], 16),
        parseInt(clean[1] + clean[1], 16),
        parseInt(clean[2] + clean[2], 16),
      ];
    }
    return [
      parseInt(clean.slice(0, 2), 16) || 0,
      parseInt(clean.slice(2, 4), 16) || 0,
      parseInt(clean.slice(4, 6), 16) || 0,
    ];
  };

  const generateSalarySlipPDF = async (
    employee: Employee,
    payroll: Payroll,
    options?: {
      skipPersist?: boolean;
      presetSlip?: PayslipModel;
      fileNameOverride?: string;
    },
  ) => {
    try {
      setGeneratingPdf(true);
      setError("");

      console.log("=== GENERATING SALARY SLIP ===");
      console.log(
        "Employee:",
        employee.fullName,
        "ID:",
        employee.id,
        "employeeId:",
        employee.employeeId,
      );
      console.log("Payroll employeeId:", payroll.employeeId);
      console.log("Will save slip with employeeId:", payroll.employeeId);

      const slip =
        options?.presetSlip ||
        getPayslipModel(
          employee,
          payroll,
          selectedManager,
          attendanceDeductionByEmployee[employee.id ?? ""],
        );

      // Resolve the effective manager ID (selectedManager or auto from employee)
      const effectiveManagerId =
        selectedManager ||
        normalizeManagerIds(
          employee.assignedManagers,
          (employee as unknown as { assignedManager?: unknown }).assignedManager,
        )[0] ||
        "none";

      const logoCacheKey = `logo_${effectiveManagerId}`;
      const signCacheKey = `sign_${effectiveManagerId}`;
      const stampCacheKey = `stamp_${effectiveManagerId}`;

      const [logoImageDataUrl, signImageDataUrl, stampImageDataUrl] =
        await Promise.all([
          preloadImageToCache(String(slip.logoUrl || ""), logoCacheKey),
          preloadImageToCache(String(slip.signUrl || ""), signCacheKey),
          preloadImageToCache(String(slip.stampUrl || ""), stampCacheKey),
        ]);

      // ── Choose rendering path ─────────────────────────────────────────────────
      // If there is a canvas slip template, render from it.
      // Otherwise fall back to the hardcoded layout.
      const canvasSlipTmpl = getSlipTemplateForEmployee(employee, payroll);

      const fileName =
        options?.fileNameOverride ||
        `salary_slip_${employee.employeeId}_${payroll.month}_${payroll.year}.pdf`;

      let finalDoc: jsPDF;

      if (canvasSlipTmpl && canvasSlipTmpl.elements.length > 0) {
        // ── Canvas-template path ────────────────────────────────────────────────
        finalDoc = await renderSlipTemplatePDF(
          canvasSlipTmpl,
          employee,
          payroll,
          logoImageDataUrl,
          stampImageDataUrl,
          signImageDataUrl,
        );
      } else {
        // ── Hardcoded layout path (fallback) ────────────────────────────────────
        const doc = new jsPDF();
        const pageWidth = doc.internal.pageSize.width;
        const pageHeight = doc.internal.pageSize.height;

        doc.setDrawColor(31, 41, 55);
        doc.rect(8, 8, pageWidth - 16, pageHeight - 16);

        doc.setFontSize(9);
        doc.setTextColor(15, 118, 110);
        if (logoImageDataUrl) {
          try {
            const logoFormat = detectImageFormat(logoImageDataUrl);
            doc.addImage(logoImageDataUrl, logoFormat, 13, 13, 14, 14);
          } catch (err) {
            console.warn("[PDF] Failed to add logo image:", err);
            doc.text("TW", 20, 21.2, { align: "center" });
          }
        } else {
          doc.text("TW", 20, 21.2, { align: "center" });
        }

        doc.setTextColor(31, 41, 55);
        doc.setFontSize(14);
        doc.setFont("helvetica", "bold");
        doc.text(String(slip.companyName).toUpperCase(), pageWidth / 2, 18, { align: "center" });
        doc.setFont("helvetica", "normal");
        doc.setFontSize(9);
        doc.text(slip.companyAddress, pageWidth / 2, 23, { align: "center" });
        doc.setFont("helvetica", "bold");
        doc.text(`Pay Slip for the month of ${slip.period}`, pageWidth / 2, 28, { align: "center" });

        doc.line(8, 32, pageWidth - 8, 32);

        autoTable(doc, {
          startY: 34,
          head: [],
          body: slip.details,
          theme: "grid",
          margin: { left: 10, right: 102 },
          styles: { fontSize: 7.5, cellPadding: 1.8, textColor: [31, 41, 55] },
          columnStyles: {
            0: { fontStyle: "bold", fillColor: [248, 250, 252], cellWidth: 28 },
            1: { cellWidth: 64 },
          },
        });

        autoTable(doc, {
          startY: 34,
          head: [["Attendance", "Days"]],
          body: slip.attendance,
          theme: "grid",
          margin: { left: 108, right: 10 },
          styles: { fontSize: 7.5, cellPadding: 1.6, halign: "right", textColor: [31, 41, 55] },
          columnStyles: { 0: { halign: "left", cellWidth: 28 } },
          headStyles: { fillColor: [248, 250, 252], textColor: [31, 41, 55], fontStyle: "bold" },
        });

        autoTable(doc, {
          startY: 112,
          head: [["Description", "Amount"]],
          body: (() => {
            const rows: (string | { content: string; styles: Record<string, unknown> })[][] = [];
            slip.earnings.forEach((row, idx) => {
              const isTotal = idx === slip.earnings.length - 1;
              const label = row[0] || "";
              const amount = row[1] || "0.00";
              rows.push([
                { content: label, styles: { fontStyle: isTotal ? "bold" : "normal" } },
                { content: `+${amount}`, styles: { textColor: [31, 41, 55], fontStyle: isTotal ? "bold" : "normal", halign: "right" } },
              ]);
            });
            rows.push([
              { content: "", styles: { fillColor: [248, 250, 252] } },
              { content: "", styles: { fillColor: [248, 250, 252] } },
            ]);
            slip.deductions.forEach((row, idx) => {
              const isTotal = idx === slip.deductions.length - 1;
              const label = row[0] || "";
              const amount = row[1] || "0.00";
              rows.push([
                { content: label, styles: { fontStyle: isTotal ? "bold" : "normal" } },
                { content: `-${amount}`, styles: { textColor: [31, 41, 55], fontStyle: isTotal ? "bold" : "normal", halign: "right" } },
              ]);
            });
            rows.push([
              { content: "NET SALARY", styles: { fontStyle: "bold" } },
              { content: slip.netSalary, styles: { fontStyle: "bold", textColor: [31, 41, 55], halign: "right" } },
            ]);
            return rows;
          })(),
          theme: "grid",
          margin: { left: 10, right: 10 },
          styles: { fontSize: 8, cellPadding: 2, textColor: [31, 41, 55] },
          columnStyles: { 0: { halign: "left", cellWidth: 120 }, 1: { halign: "right" } },
          headStyles: { fillColor: [248, 250, 252], textColor: [31, 41, 55], fontStyle: "bold" },
        });

        const salaryTableEnd = (doc as any).lastAutoTable?.finalY ?? 188;
        doc.setFillColor(248, 250, 252);
        doc.rect(10, salaryTableEnd + 4, pageWidth - 20, 10, "FD");
        doc.setFontSize(10);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(31, 41, 55);
        doc.text("Net Pay", 13, salaryTableEnd + 10.5);
        doc.text(slip.netSalary, pageWidth - 13, salaryTableEnd + 10.5, { align: "right" });

        const signTableStart = salaryTableEnd + 18;
        const processedAtRaw = (payroll as any).processedAt;
        let processedDateStr = "-";
        if (processedAtRaw) {
          const d = processedAtRaw?.toDate ? processedAtRaw.toDate() : new Date(processedAtRaw);
          if (!isNaN(d.getTime())) {
            processedDateStr = d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
          }
        }
        doc.setFontSize(8);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(31, 41, 55);
        doc.text(`Processed Date: ${processedDateStr}`, 13, signTableStart - 4);

        autoTable(doc, {
          startY: signTableStart,
          head: [],
          body: [["Authorised Person Sign", "Company Stamp"]],
          theme: "grid",
          margin: { left: 10, right: 10 },
          styles: { fontSize: 8, minCellHeight: 22, valign: "bottom", halign: "center" },
        });

        const signTableEnd = (doc as any).lastAutoTable?.finalY ?? signTableStart + 24;
        const colMid1 = 10 + (pageWidth - 20) / 4;
        const colMid2 = 10 + (3 * (pageWidth - 20)) / 4;

        if (signImageDataUrl) {
          try {
            const signFormat = detectImageFormat(signImageDataUrl);
            doc.addImage(signImageDataUrl, signFormat, colMid1 - 15, signTableEnd - 18, 30, 10);
          } catch (err) {
            console.warn("[PDF] Failed to add sign image:", err);
          }
        }

        if (stampImageDataUrl) {
          try {
            const stampFormat = detectImageFormat(stampImageDataUrl);
            doc.addImage(stampImageDataUrl, stampFormat, colMid2 - 12, signTableEnd - 20, 24, 18);
          } catch (err) {
            console.warn("[PDF] Failed to add stamp image:", err);
          }
        }

        finalDoc = doc;
      }

      // Save the PDF
      finalDoc.save(fileName);

      if (!options?.skipPersist) {
        // Check if salary slip already exists for this employee, month, year
        const existingSlipsQuery = query(
          collection(db, "salary_slips"),
          where("employeeId", "==", payroll.employeeId),
          where("month", "==", payroll.month),
          where("year", "==", payroll.year),
        );
        const existingSlipsSnapshot = await getDocs(existingSlipsQuery);

        // Save full, employee-specific slip snapshot for deterministic re-downloads.
        if (existingSlipsSnapshot.empty) {
          await addDoc(collection(db, "salary_slips"), {
            employeeId: payroll.employeeId,
            payrollId: payroll.id,
            month: payroll.month,
            year: payroll.year,
            fileName,
            generatedAt: new Date(),
            generatedBy: currentUser?.uid || "",
            companyId:
              employee.companyId ||
              currentUser?.companyId ||
              currentUser?.uid ||
              "",
            employeeSnapshot: {
              employeeId: employee.employeeId,
              fullName: employee.fullName,
            },
            payrollSnapshot: {
              baseSalary: payroll.baseSalary,
              hra: payroll.hra,
              ta: payroll.ta,
              da: payroll.da,
              totalBonus: payroll.totalBonus,
              grossSalary: payroll.grossSalary,
              totalDeduction: payroll.totalDeduction,
              netSalary: payroll.netSalary,
              taxAmount: payroll.taxAmount,
              status: payroll.status,
            },
            branding: {
              selectedManagerId: selectedManager || "",
              logoUrl: slip.logoUrl,
              stampUrl: slip.stampUrl,
              signUrl: slip.signUrl,
            },
            slipData: {
              companyName: slip.companyName,
              companyAddress: slip.companyAddress,
              period: slip.period,
              paidMode: slip.paidMode,
              logoUrl: slip.logoUrl,
              stampUrl: slip.stampUrl,
              signUrl: slip.signUrl,
              details: serializeRowsForFirestore(slip.details),
              attendance: serializeRowsForFirestore(slip.attendance),
              earnings: serializeRowsForFirestore(slip.earnings),
              deductions: serializeRowsForFirestore(slip.deductions),
              netSalary: slip.netSalary,
            },
          });
          setSuccess(`Salary slip generated for ${employee.fullName}`);
        } else {
          setSuccess(`Salary slip already exists for ${employee.fullName}`);
        }
      }
      await loadData(); // Refresh the list
      clearImageCache();
    } catch (error) {
      console.error("Error generating PDF:", error);
      setError(
        error instanceof Error
          ? error.message
          : "Failed to generate salary slip",
      );
      clearImageCache();
    } finally {
      setGeneratingPdf(false);
    }
  };

  const generateBulkSalarySlips = async () => {
    try {
      setGeneratingPdf(true);
      setError("");
      setSuccess("");
      clearImageCache();

      const filteredPayrolls = payrolls.filter((payroll) => {
        const employee = employees.find(
          (emp) => emp.employeeId === payroll.employeeId,
        );
        return (
          !!selectedManager &&
          !!employee &&
          normalizeManagerIds(
            employee.assignedManagers,
            (employee as unknown as { assignedManager?: unknown })
              .assignedManager,
          ).includes(selectedManager)
        );
      });

      const availablePayrolls = filteredPayrolls.filter(
        (payroll) =>
          !salarySlips.some((slip) => slip.employeeId === payroll.employeeId),
      );

      if (availablePayrolls.length === 0) {
        setError("No new payroll records to generate slips for this manager");
        return;
      }

      for (const payroll of availablePayrolls) {
        const employee = employees.find(
          (emp) => emp.employeeId === payroll.employeeId,
        );
        if (employee) {
          await generateSalarySlipPDF(employee, payroll);
          // Small delay to prevent overwhelming the browser
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
      }

      setSuccess(`Generated ${availablePayrolls.length} salary slips`);
    } catch (error) {
      console.error("Error generating bulk salary slips:", error);
      setError("Failed to generate bulk salary slips");
    } finally {
      setGeneratingPdf(false);
    }
  };

  const previewSalarySlip = (
    employee: Employee,
    payroll: Payroll,
    slip?: SalarySlip,
  ) => {
    setPreviewData({ employee, payroll, slip });
    setShowPreviewDialog(true);
  };

  const filteredSlips = salarySlips.filter((slip) => {
    const employee = employees.find(
      (emp) => emp.employeeId === slip.employeeId,
    );

    const matchesManager = isEmployee
      ? true
      : !!selectedManager &&
        !!employee &&
        normalizeManagerIds(
          employee.assignedManagers,
          (employee as unknown as { assignedManager?: unknown })
            .assignedManager,
        ).includes(selectedManager);

    // Check search term for generated slips only
    const matchesSearch =
      !searchTermGenerated ||
      employee?.fullName
        ?.toLowerCase()
        .includes(searchTermGenerated.toLowerCase()) ||
      employee?.employeeId
        ?.toLowerCase()
        .includes(searchTermGenerated.toLowerCase());

    return matchesManager && matchesSearch;
  });

  const getEmployeeName = (employeeId: string) => {
    const employee = employees.find((emp) => emp.employeeId === employeeId);
    return employee?.fullName || "Unknown Employee";
  };

  const getEmployeeId = (employeeId: string) => {
    const employee = employees.find((emp) => emp.employeeId === employeeId);
    return employee?.employeeId || "Unknown ID";
  };

  const getPayrollData = (
    employeeId: string,
    payrollId?: string,
    month?: number,
    year?: number,
  ) => {
    return payrolls.find((p) => {
      if (payrollId && p.id === payrollId) {
        return true;
      }

      if (month !== undefined && year !== undefined) {
        return (
          p.employeeId === employeeId && p.month === month && p.year === year
        );
      }

      return p.employeeId === employeeId;
    });
  };

  const downloadGeneratedSlip = async (slip: SalarySlip) => {
    const employee = employees.find(
      (emp) => emp.employeeId === slip.employeeId,
    );
    const payroll = getPayrollData(
      slip.employeeId,
      slip.payrollId,
      slip.month,
      slip.year,
    );

    if (!employee || !payroll) {
      setError("Employee or payroll data not found for this generated slip.");
      return;
    }

    await generateSalarySlipPDF(employee, payroll, {
      skipPersist: true,
      fileNameOverride: (slip as unknown as { fileName?: string }).fileName,
    });
  };

  const getAllManagers = () => {
    const managersSet = new Set<string>();
    employees.forEach((emp) => {
      normalizeManagerIds(
        emp.assignedManagers,
        (emp as unknown as { assignedManager?: unknown }).assignedManager,
      ).forEach((managerId) => {
        managersSet.add(managerId);
      });
    });
    return Array.from(managersSet).sort();
  };

  const getManagerName = (managerId: string) => {
    const manager = managersById[managerId];
    return String(manager?.fullName || manager?.name || managerId) || managerId;
  };

  const allManagerIds = useMemo(() => getAllManagers(), [employees]);

  useEffect(() => {
    if (isEmployee) {
      return;
    }

    if (!allManagerIds.length) {
      if (selectedManager) {
        setSelectedManager("");
      }
      return;
    }

    if (!selectedManager || !allManagerIds.includes(selectedManager)) {
      setSelectedManager(allManagerIds[0]);
    }
  }, [selectedManager, allManagerIds, isEmployee]);

  if (loading) {
    return (
      <Box
        display="flex"
        justifyContent="center"
        alignItems="center"
        minHeight="400px"
      >
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3 }}>
      {/* Header */}
      <Box sx={{ mb: 3 }}>
        <Typography
          variant="h4"
          sx={{ color: "#2196f3", fontWeight: 600, mb: 1 }}
        >
          Salary Slips
        </Typography>
        <Typography variant="body1" color="text.secondary">
          {isEmployee
            ? "View and download your generated salary slips"
            : "Generate and manage salary slips for employees"}
        </Typography>
      </Box>

      {/* Alerts */}
      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError("")}>
          {error}
        </Alert>
      )}

      {success && (
        <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccess("")}>
          {success}
        </Alert>
      )}

      {/* Month/Year Selection and Stats */}
      <Card sx={{ mb: 3, backgroundColor: "#2d2d2d" }}>
        <CardContent>
          <Box sx={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 3 }}>
            <Box>
              <Box
                sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 2 }}
              >
                <FormControl fullWidth>
                  <InputLabel>Month</InputLabel>
                  <Select
                    value={selectedMonth}
                    label="Month"
                    onChange={(e) => setSelectedMonth(e.target.value as number)}
                  >
                    {months.map((month) => (
                      <MenuItem key={month.value} value={month.value}>
                        {month.label}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>

                <FormControl fullWidth>
                  <InputLabel>Year</InputLabel>
                  <Select
                    value={selectedYear}
                    label="Year"
                    onChange={(e) => setSelectedYear(e.target.value as number)}
                  >
                    {years.map((year) => (
                      <MenuItem key={year} value={year}>
                        {year}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Box>

              <Button
                variant="contained"
                startIcon={<Refresh />}
                onClick={loadData}
                sx={{
                  mt: 2,
                  backgroundColor: "#2196f3",
                  "&:hover": { backgroundColor: "#1976d2" },
                }}
              >
                Refresh
              </Button>
            </Box>

            <Box>
              <Box
                sx={{
                  display: "grid",
                  gridTemplateColumns: "repeat(4, 1fr)",
                  gap: 2,
                }}
              >
                <Box sx={{ textAlign: "center" }}>
                  <Typography variant="h6" sx={{ color: "#ffffff" }}>
                    {employees.length}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Total Employees
                  </Typography>
                </Box>
                <Box sx={{ textAlign: "center" }}>
                  <Typography variant="h6" sx={{ color: "#ffffff" }}>
                    {payrolls.length}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Payroll Records
                  </Typography>
                </Box>
                <Box sx={{ textAlign: "center" }}>
                  <Typography variant="h6" sx={{ color: "#ffffff" }}>
                    {salarySlips.length}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Generated Slips
                  </Typography>
                </Box>
                <Box sx={{ textAlign: "center" }}>
                  <Typography variant="h6" sx={{ color: "#ffffff" }}>
                    {payrolls.length - salarySlips.length}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Paid Slips
                  </Typography>
                </Box>
              </Box>
            </Box>
          </Box>
        </CardContent>
      </Card>

      {/* Filters and Bulk Actions */}
      {isAdminOrManager && (
        <Box
          sx={{
            mb: 3,
            display: "grid",
            gridTemplateColumns: "1fr 1fr 1fr",
            gap: 2,
            alignItems: "flex-end",
          }}
        >
          <FormControl fullWidth>
            <InputLabel>Filter by Manager</InputLabel>
            <Select
              value={selectedManager}
              label="Filter by Manager"
              onChange={(e) => setSelectedManager(e.target.value)}
              displayEmpty
            >
              {allManagerIds.map((managerId) => (
                <MenuItem key={managerId} value={managerId}>
                  {getManagerName(managerId)}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <TextField
            placeholder="Search Paid Slips"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            InputProps={{
              startAdornment: (
                <Search sx={{ mr: 1, color: "text.secondary" }} />
              ),
            }}
            sx={{
              "& .MuiOutlinedInput-root": {
                borderRadius: 2,
              },
            }}
          />
          <Button
            variant="contained"
            startIcon={<PictureAsPdf />}
            onClick={generateBulkSalarySlips}
            disabled={
              generatingPdf ||
              payrolls.length === salarySlips.length ||
              !selectedManager
            }
            sx={{
              backgroundColor: "#2196f3",
              "&:hover": { backgroundColor: "#1976d2" },
              height: "56px",
              borderRadius: "15px",
            }}
          >
            {generatingPdf ? (
              <CircularProgress size={20} />
            ) : (
              "GENERATE ALL SLIPS"
            )}
          </Button>
        </Box>
      )}

      {/* Paid Salary Slips Section */}
      {isAdminOrManager && payrolls.length > 0 && (
        <Card
          sx={{
            mb: 3,
            backgroundColor: "#2d2d2d",
            border: "1px solid #ff9800",
          }}
        >
          <CardContent>
            <Typography variant="h6" sx={{ color: "#ff9800", mb: 2 }}>
              Paid Salary Slips ({payrolls.length})
            </Typography>
            <Box sx={{ overflowX: "auto" }}>
              <TableContainer
                component={Paper}
                sx={{ backgroundColor: "#3d3d3d", border: "1px solid #333" }}
              >
                <Table size="small">
                  <TableHead>
                    <TableRow sx={{ backgroundColor: "#1e1e1e" }}>
                      <MuiTableCell
                        sx={{
                          fontWeight: 600,
                          color: "#ffffff",
                          borderBottom: "2px solid #333",
                        }}
                      >
                        Employee Name
                      </MuiTableCell>
                      <MuiTableCell
                        sx={{
                          fontWeight: 600,
                          color: "#ffffff",
                          borderBottom: "2px solid #333",
                        }}
                      >
                        Employee ID
                      </MuiTableCell>
                      <MuiTableCell
                        sx={{
                          fontWeight: 600,
                          color: "#ffffff",
                          borderBottom: "2px solid #333",
                        }}
                      >
                        Net Salary
                      </MuiTableCell>
                      <MuiTableCell
                        sx={{
                          fontWeight: 600,
                          color: "#ffffff",
                          borderBottom: "2px solid #333",
                        }}
                      >
                        Actions
                      </MuiTableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {payrolls
                      .filter((payroll) => {
                        const employee = employees.find(
                          (emp) => emp.employeeId === payroll.employeeId,
                        );
                        return (
                          !!selectedManager &&
                          !!employee &&
                          normalizeManagerIds(
                            employee.assignedManagers,
                            (
                              employee as unknown as {
                                assignedManager?: unknown;
                              }
                            ).assignedManager,
                          ).includes(selectedManager)
                        );
                      })
                      .map((payroll) => {
                        const employee = employees.find(
                          (emp) => emp.employeeId === payroll.employeeId,
                        );
                        return (
                          <TableRow
                            key={payroll.id}
                            sx={{ "&:hover": { backgroundColor: "#4d4d4d" } }}
                          >
                            <MuiTableCell
                              sx={{
                                borderBottom: "1px solid #333",
                                color: "#ffffff",
                              }}
                            >
                              {employee?.fullName || "Unknown"}
                            </MuiTableCell>
                            <MuiTableCell
                              sx={{
                                borderBottom: "1px solid #333",
                                color: "#ffffff",
                              }}
                            >
                              {employee?.employeeId || "Unknown"}
                            </MuiTableCell>
                            <MuiTableCell
                              sx={{
                                borderBottom: "1px solid #333",
                                color: "#ffffff",
                              }}
                            >
                              {(() => {
                                if (!employee) return `₹${payroll.netSalary?.toFixed(2) || "0.00"}`;
                                const tmpl = getTemplateForEmployee(employee);
                                const liveVars = attendanceVarsByEmployee.get(employee.id ?? "");
                                const deductionResult = attendanceDeductionByEmployee[employee.id ?? ""];
                                const attendanceDeduction = deductionResult?.totalDeductionAmount ?? 0;
                                const salary = (employee.salary ?? {}) as Record<string, unknown>;
                                const basic = toAmount(salary.basic ?? salary.base ?? payroll.baseSalary);
                                const baseAfterAttendance = deductionResult?.baseSalaryAfterAttendance ?? basic;
                                if (tmpl) {
                                  const rows = buildTemplateSlipRows(employee, payroll, tmpl, attendanceDeduction, baseAfterAttendance, liveVars);
                                  return `₹${rows.netSalary}`;
                                }
                                const { netSalary } = getDeductionAmounts(employee, payroll);
                                return `₹${netSalary.toFixed(2)}`;
                              })()}
                            </MuiTableCell>
                            <MuiTableCell
                              sx={{
                                borderBottom: "1px solid #333",
                                color: "#ffffff",
                              }}
                            >
                              <Box sx={{ display: "flex", gap: 1 }}>
                                <Tooltip title="Generate Slip">
                                  <IconButton
                                    size="small"
                                    sx={{ color: "#ff9800" }}
                                    onClick={() =>
                                      employee &&
                                      generateSalarySlipPDF(employee, payroll)
                                    }
                                    disabled={generatingPdf}
                                  >
                                    <PictureAsPdf />
                                  </IconButton>
                                </Tooltip>
                              </Box>
                            </MuiTableCell>
                          </TableRow>
                        );
                      })}
                  </TableBody>
                </Table>
              </TableContainer>
            </Box>
          </CardContent>
        </Card>
      )}

      {/* Generated Slips section — employees only (admins/managers use the Paid Salary Slips table above) */}
      {isEmployee && (
      <>
      {/* Search for Generated Slips */}
      <Box sx={{ mb: 2 }}>
        <TextField
          fullWidth
          placeholder="Search Generated Slips by Name or Employee ID"
          value={searchTermGenerated}
          onChange={(e) => setSearchTermGenerated(e.target.value)}
          InputProps={{
            startAdornment: <Search sx={{ mr: 1, color: "text.secondary" }} />,
          }}
          sx={{
            "& .MuiOutlinedInput-root": {
              borderRadius: 2,
            },
          }}
        />
      </Box>

      {/* Salary Slips Table */}
      <Box sx={{ overflowX: "auto", maxWidth: "100%" }}>
        <TableContainer
          component={Paper}
          sx={{ backgroundColor: "#2d2d2d", border: "1px solid #333" }}
        >
          <Table>
            <TableHead>
              <TableRow sx={{ backgroundColor: "#1e1e1e" }}>
                <MuiTableCell
                  sx={{
                    fontWeight: 600,
                    color: "#ffffff",
                    borderBottom: "2px solid #333",
                  }}
                >
                  Employee Name
                </MuiTableCell>
                <MuiTableCell
                  sx={{
                    fontWeight: 600,
                    color: "#ffffff",
                    borderBottom: "2px solid #333",
                  }}
                >
                  Employee ID
                </MuiTableCell>
                <MuiTableCell
                  sx={{
                    fontWeight: 600,
                    color: "#ffffff",
                    borderBottom: "2px solid #333",
                  }}
                >
                  Month/Year
                </MuiTableCell>
                <MuiTableCell
                  sx={{
                    fontWeight: 600,
                    color: "#ffffff",
                    borderBottom: "2px solid #333",
                  }}
                >
                  Net Salary
                </MuiTableCell>
                <MuiTableCell
                  sx={{
                    fontWeight: 600,
                    color: "#ffffff",
                    borderBottom: "2px solid #333",
                  }}
                >
                  Status
                </MuiTableCell>
                <MuiTableCell
                  sx={{
                    fontWeight: 600,
                    color: "#ffffff",
                    borderBottom: "2px solid #333",
                  }}
                >
                  Generated On
                </MuiTableCell>
                <MuiTableCell
                  sx={{
                    fontWeight: 600,
                    color: "#ffffff",
                    borderBottom: "2px solid #333",
                  }}
                >
                  Actions
                </MuiTableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filteredSlips
                .slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage)
                .map((slip) => {
                  const employee = employees.find(
                    (emp) => emp.employeeId === slip.employeeId,
                  );
                  const payroll = getPayrollData(
                    slip.employeeId,
                    slip.payrollId,
                    slip.month,
                    slip.year,
                  );

                  return (
                    <TableRow
                      key={slip.id}
                      sx={{ "&:hover": { backgroundColor: "#3d3d3d" } }}
                    >
                      <MuiTableCell
                        sx={{
                          borderBottom: "1px solid #333",
                          color: "#ffffff",
                        }}
                      >
                        {employee?.fullName || "Unknown"}
                      </MuiTableCell>
                      <MuiTableCell
                        sx={{
                          borderBottom: "1px solid #333",
                          color: "#ffffff",
                        }}
                      >
                        {employee?.employeeId || "Unknown"}
                      </MuiTableCell>
                      <MuiTableCell
                        sx={{
                          borderBottom: "1px solid #333",
                          color: "#ffffff",
                        }}
                      >
                        {months.find((m) => m.value === slip.month)?.label}{" "}
                        {slip.year}
                      </MuiTableCell>
                      <MuiTableCell
                        sx={{
                          borderBottom: "1px solid #333",
                          color: "#ffffff",
                        }}
                      >
                        ₹
                        {String(
                          (
                            slip as unknown as {
                              slipData?: { netSalary?: string };
                            }
                          ).slipData?.netSalary ||
                            payroll?.netSalary ||
                            "0.00",
                        )}
                      </MuiTableCell>
                      <MuiTableCell
                        sx={{
                          borderBottom: "1px solid #333",
                          color: "#ffffff",
                        }}
                      >
                        <Chip
                          label="Generated"
                          color="success"
                          size="small"
                          sx={{ backgroundColor: "#4caf50" }}
                        />
                      </MuiTableCell>
                      <MuiTableCell
                        sx={{
                          borderBottom: "1px solid #333",
                          color: "#ffffff",
                        }}
                      >
                        {slip.generatedAt instanceof Date
                          ? slip.generatedAt.toLocaleDateString()
                          : (slip.generatedAt as any)
                              ?.toDate?.()
                              ?.toLocaleDateString() || "Unknown"}
                      </MuiTableCell>
                      <MuiTableCell
                        sx={{
                          borderBottom: "1px solid #333",
                          color: "#ffffff",
                        }}
                      >
                        <Box sx={{ display: "flex", gap: 1 }}>
                          <Tooltip title="Download">
                            <IconButton
                              size="small"
                              sx={{ color: "#4caf50" }}
                              onClick={() => {
                                void downloadGeneratedSlip(slip);
                              }}
                            >
                              <Download />
                            </IconButton>
                          </Tooltip>
                        </Box>
                      </MuiTableCell>
                    </TableRow>
                  );
                })}
            </TableBody>
          </Table>
        </TableContainer>
      </Box>

      {/* Pagination */}
      <TablePagination
        component="div"
        count={filteredSlips.length}
        page={page}
        onPageChange={(event, newPage) => setPage(newPage)}
        rowsPerPage={rowsPerPage}
        onRowsPerPageChange={(event) => {
          setRowsPerPage(parseInt(event.target.value, 10));
          setPage(0);
        }}
        sx={{
          color: "#ffffff",
          "& .MuiTablePagination-selectIcon": {
            color: "#ffffff",
          },
        }}
      />
      </>
      )}

      {/* Preview Dialog */}
      <Dialog
        open={showPreviewDialog}
        onClose={() => setShowPreviewDialog(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>
          <Typography variant="h5" component="span" sx={{ color: "#ffffff" }}>
            Salary Slip Preview - {previewData?.employee?.fullName}
          </Typography>
        </DialogTitle>
        <DialogContent>
          {previewData && (() => {
            const canvasTmpl = getSlipTemplateForEmployee(previewData.employee, previewData.payroll);

            // ── Canvas-template preview ──────────────────────────────────────
            if (canvasTmpl && canvasTmpl.elements.length > 0) {
              const managerId =
                (Array.isArray(previewData.employee.assignedManagers)
                  ? previewData.employee.assignedManagers[0]
                  : (previewData.employee as any).assignedManager) ?? "";
              const managerData = managerId ? managersById[managerId] : undefined;
              const companyData = companiesById[previewData.employee.companyId ?? currentUser?.uid ?? ""];
              const varCtx = buildSlipVariableContext(previewData.employee, previewData.payroll, managerData, companyData);
              const branding = (managerData?.payslipBranding as Record<string, unknown> | undefined) ?? {};

              // A4 canvas at 794×1123px, displayed at 60% scale inside the dialog
              const SCALE = 0.6;
              const CW = canvasTmpl.canvasWidth || 794;
              const CH = canvasTmpl.canvasHeight || 1123;

              const sorted = [...canvasTmpl.elements].sort((a, b) => a.zIndex - b.zIndex);

              return (
                <Box sx={{ mt: 2, overflowX: "auto", display: "flex", justifyContent: "center" }}>
                  <Box sx={{
                    position: "relative",
                    width: CW,
                    height: CH,
                    backgroundColor: "#fff",
                    transform: `scale(${SCALE})`,
                    transformOrigin: "top center",
                    mb: `${CH * (SCALE - 1)}px`,
                    boxShadow: "0 4px 24px rgba(0,0,0,0.25)",
                    flexShrink: 0,
                  }}>
                    {sorted.map((el) => {
                      const base = {
                        position: "absolute" as const,
                        left: el.x, top: el.y,
                        width: el.width, height: el.height,
                        zIndex: el.zIndex,
                        overflow: "hidden",
                        boxSizing: "border-box" as const,
                      };

                      switch (el.type) {
                        case "text": {
                          const te = el as TextElement;
                          return (
                            <Box key={el.id} sx={{ ...base, display: "flex", alignItems: "center",
                              justifyContent: te.textAlign === "center" ? "center" : te.textAlign === "right" ? "flex-end" : "flex-start" }}>
                              <span style={{ fontSize: te.fontSize, fontWeight: te.fontWeight, fontStyle: te.fontStyle,
                                color: te.color, lineHeight: 1.3, whiteSpace: "pre-wrap" }}>{te.content}</span>
                            </Box>
                          );
                        }
                        case "variable": {
                          const ve = el as VariableElement;
                          const val = varCtx[ve.variableKey] ?? "";
                          return (
                            <Box key={el.id} sx={{ ...base, display: "flex", alignItems: "center",
                              justifyContent: ve.textAlign === "center" ? "center" : ve.textAlign === "right" ? "flex-end" : "flex-start",
                              borderBottom: "1px solid #ddd" }}>
                              <span style={{ fontSize: ve.fontSize, fontWeight: ve.fontWeight, fontStyle: ve.fontStyle,
                                color: ve.color, lineHeight: 1.3 }}>{val}</span>
                            </Box>
                          );
                        }
                        case "line": {
                          const le = el as LineElement;
                          return (
                            <Box key={el.id} sx={{ ...base, display: "flex", alignItems: "center", justifyContent: "center" }}>
                              {le.orientation === "horizontal"
                                ? <Box sx={{ width: "100%", height: le.thickness, backgroundColor: le.color }} />
                                : <Box sx={{ height: "100%", width: le.thickness, backgroundColor: le.color }} />}
                            </Box>
                          );
                        }
                        case "rectangle": {
                          const re = el as RectElement;
                          return (
                            <Box key={el.id} sx={{ ...base,
                              border: `${re.borderWidth}px solid ${re.borderColor}`,
                              borderRadius: re.borderRadius,
                              backgroundColor: re.fillColor === "transparent" ? "transparent" : re.fillColor,
                              opacity: re.opacity }} />
                          );
                        }
                        case "logo": {
                          const logoUrl = String(branding.logoUrl || "");
                          return (
                            <Box key={el.id} sx={{ ...base }}>
                              {logoUrl
                                ? <Box component="img" src={logoUrl} sx={{ width: "100%", height: "100%", objectFit: "contain" }} />
                                : <Box sx={{ ...base, left: 0, top: 0, backgroundColor: "#e3f2fd", display: "flex", alignItems: "center", justifyContent: "center", border: "1px dashed #2196f3", fontSize: 11, color: "#2196f3" }}>Logo</Box>}
                            </Box>
                          );
                        }
                        case "stamp": {
                          const stampUrl = String(branding.stampUrl || "");
                          return (
                            <Box key={el.id} sx={{ ...base }}>
                              {stampUrl
                                ? <Box component="img" src={stampUrl} sx={{ width: "100%", height: "100%", objectFit: "contain" }} />
                                : <Box sx={{ ...base, left: 0, top: 0, backgroundColor: "#fce4ec", display: "flex", alignItems: "center", justifyContent: "center", border: "1px dashed #e91e63", borderRadius: "50%", fontSize: 11, color: "#e91e63" }}>Stamp</Box>}
                            </Box>
                          );
                        }
                        case "signature": {
                          const signUrl = String(branding.signUrl || "");
                          return (
                            <Box key={el.id} sx={{ ...base }}>
                              {signUrl
                                ? <Box component="img" src={signUrl} sx={{ width: "100%", height: "100%", objectFit: "contain" }} />
                                : <Box sx={{ ...base, left: 0, top: 0, borderBottom: "2px solid #ff5722", backgroundColor: "#fff3e0", display: "flex", alignItems: "flex-end", justifyContent: "center", fontSize: 11, color: "#ff5722", pb: 0.5 }}>Signature</Box>}
                            </Box>
                          );
                        }
                        case "table": {
                          const te = el as TableElement;
                          const colW = el.width / te.cols;
                          return (
                            <Box key={el.id} sx={{ ...base, border: `${te.borderWidth}px solid ${te.borderColor}` }}>
                              {te.rows.map((row, ri) => {
                                const isHdr = te.hasHeaderRow && ri === 0;
                                const isAlt = te.alternateRowColor && !isHdr && ri % 2 === 0;
                                return (
                                  <Box key={ri} sx={{ display: "flex", height: te.rowHeight,
                                    backgroundColor: isHdr ? te.headerBgColor : isAlt ? "rgba(0,0,0,0.04)" : "transparent" }}>
                                    {row.map((cell, ci) => {
                                      const cellVal =
                                        cell.kind === "variable" ? (varCtx[cell.variableKey ?? ""] ?? "") :
                                        cell.kind === "text" ? (cell.text ?? "") :
                                        cell.kind === "logo" ? "[Logo]" :
                                        cell.kind === "stamp" ? "[Stamp]" :
                                        cell.kind === "signature" ? "[Signature]" : "";
                                      return (
                                        <Box key={ci} sx={{
                                          width: colW * (cell.colSpan ?? 1), height: "100%",
                                          borderRight: ci < row.length - 1 ? `${te.borderWidth}px solid ${te.borderColor}` : "none",
                                          borderBottom: ri < te.rows.length - 1 ? `${te.borderWidth}px solid ${te.borderColor}` : "none",
                                          display: "flex", alignItems: "center",
                                          justifyContent: cell.textAlign === "center" ? "center" : cell.textAlign === "right" ? "flex-end" : "flex-start",
                                          px: 0.75, overflow: "hidden", boxSizing: "border-box",
                                        }}>
                                          <span style={{ fontSize: te.fontSize, fontWeight: cell.fontWeight ?? (isHdr ? "bold" : "normal"),
                                            fontStyle: cell.fontStyle ?? "normal",
                                            color: cell.color ?? (isHdr ? te.headerTextColor : "#000"),
                                            lineHeight: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                            {cellVal}
                                          </span>
                                        </Box>
                                      );
                                    })}
                                  </Box>
                                );
                              })}
                            </Box>
                          );
                        }
                        default: return null;
                      }
                    })}
                  </Box>
                </Box>
              );
            }

            // ── Fallback: old hardcoded layout ───────────────────────────────
            const slip: PayslipModel = getPayslipModel(
              previewData.employee,
              previewData.payroll,
              selectedManager,
              attendanceDeductionByEmployee[previewData.employee.id ?? ""],
            );
            return (
              <Box sx={{ mt: 2, backgroundColor: "#f3f5f8", p: 2 }}>
                <Box sx={{ maxWidth: 980, mx: "auto", bgcolor: "#fff", border: "2px solid #1f2937", boxShadow: "0 12px 30px rgba(0,0,0,0.12)" }}>
                  {/* Header */}
                  <Box sx={{ textAlign: "center", px: 2, py: 1.5, borderBottom: "2px solid #1f2937", position: "relative" }}>
                    {slip.logoUrl && <Box component="img" src={slip.logoUrl} sx={{ position: "absolute", left: 16, top: 12, width: 52, height: 52, objectFit: "cover" }} />}
                    <Typography sx={{ fontSize: "1.2rem", textTransform: "uppercase", fontWeight: 700 }}>{slip.companyName}</Typography>
                    <Typography sx={{ color: "#6b7280", fontSize: "0.9rem" }}>{slip.companyAddress}</Typography>
                    <Typography sx={{ color: "#374151", fontWeight: 700, mt: 0.5, fontSize: "0.9rem" }}>Pay Slip for the month of {slip.period}</Typography>
                  </Box>
                  {/* Details + Attendance */}
                  <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1.2fr 1fr" }, borderBottom: "1px solid #1f2937" }}>
                    <Table size="small" sx={{ "& td": { border: "1px solid #d5d9df", p: "6px 8px", fontSize: "0.84rem" } }}>
                      <TableBody>
                        {slip.details.map(([label, value]) => (
                          <TableRow key={String(label)}>
                            <MuiTableCell sx={{ width: "34%", bgcolor: "#fcfcfd", fontWeight: 600 }}>{label}</MuiTableCell>
                            <MuiTableCell>{value}</MuiTableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                    <Table size="small" sx={{ "& th, & td": { border: "1px solid #d5d9df", p: "6px 8px", fontSize: "0.84rem" }, "& th": { bgcolor: "#f8fafc", fontWeight: 700 } }}>
                      <TableHead><TableRow><MuiTableCell>Attendance</MuiTableCell><MuiTableCell>Days</MuiTableCell></TableRow></TableHead>
                      <TableBody>{slip.attendance.map((row, i) => <TableRow key={i}>{row.map((c, j) => <MuiTableCell key={j}>{c}</MuiTableCell>)}</TableRow>)}</TableBody>
                    </Table>
                  </Box>
                  {/* Earnings/Deductions */}
                  <Box sx={{ borderBottom: "1px solid #1f2937" }}>
                    <Table size="small" sx={{ "& th, & td": { border: "1px solid #d5d9df", p: "6px 10px", fontSize: "0.84rem" }, "& th": { bgcolor: "#f8fafc", fontWeight: 700 } }}>
                      <TableHead><TableRow><MuiTableCell sx={{ width: "75%" }}>Description</MuiTableCell><MuiTableCell sx={{ textAlign: "right" }}>Amount</MuiTableCell></TableRow></TableHead>
                      <TableBody>
                        {slip.earnings.map((row, i) => <TableRow key={`e${i}`}><MuiTableCell sx={{ fontWeight: i === slip.earnings.length - 1 ? 700 : 400 }}>{row[0]}</MuiTableCell><MuiTableCell sx={{ textAlign: "right", fontFamily: "monospace" }}>+{row[1]}</MuiTableCell></TableRow>)}
                        <TableRow><MuiTableCell colSpan={2} sx={{ p: "2px 0", bgcolor: "#f8fafc", border: "none" }} /></TableRow>
                        {slip.deductions.map((row, i) => <TableRow key={`d${i}`}><MuiTableCell sx={{ fontWeight: i === slip.deductions.length - 1 ? 700 : 400 }}>{row[0]}</MuiTableCell><MuiTableCell sx={{ textAlign: "right", fontFamily: "monospace" }}>-{row[1]}</MuiTableCell></TableRow>)}
                        <TableRow sx={{ bgcolor: "#f8fafc" }}><MuiTableCell sx={{ fontWeight: 800 }}>NET SALARY</MuiTableCell><MuiTableCell sx={{ textAlign: "right", fontWeight: 800, fontFamily: "monospace" }}>{slip.netSalary}</MuiTableCell></TableRow>
                      </TableBody>
                    </Table>
                  </Box>
                  {/* Net Pay bar */}
                  <Box sx={{ display: "flex", justifyContent: "space-between", px: 2, py: 1, bgcolor: "#f8fafc", borderBottom: "1px solid #1f2937" }}>
                    <Typography sx={{ fontWeight: 800 }}>Net Pay</Typography>
                    <Typography sx={{ fontWeight: 800, fontFamily: "monospace" }}>{slip.netSalary}</Typography>
                  </Box>
                  {/* Signature row */}
                  <Table size="small" sx={{ "& td": { border: "1px solid #d5d9df", p: "24px 12px 12px", textAlign: "center", verticalAlign: "bottom", fontWeight: 600 } }}>
                    <TableBody>
                      <TableRow>
                        <MuiTableCell>Employee&apos;s Sign</MuiTableCell>
                        <MuiTableCell>Checked By</MuiTableCell>
                        <MuiTableCell>
                          {slip.stampUrl && <Box component="img" src={slip.stampUrl} sx={{ width: 60, height: 60, objectFit: "contain", display: "block", mx: "auto" }} />}
                          {slip.signUrl && <Box component="img" src={slip.signUrl} sx={{ width: 90, height: 30, objectFit: "cover", display: "block", mx: "auto" }} />}
                          {!slip.stampUrl && !slip.signUrl && "Company Stamp and Sign"}
                        </MuiTableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                  <Typography sx={{ textAlign: "center", p: "10px 12px 16px", fontSize: "0.8rem", color: "#6b7280", fontStyle: "italic" }}>
                    This is a computer generated document. No signature required.
                  </Typography>
                </Box>
              </Box>
            );
          })()}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowPreviewDialog(false)}>Close</Button>
          <Button
            onClick={() => {
              if (previewData) {
                const payroll =
                  previewData.payroll ||
                  (previewData.slip
                    ? getPayrollData(
                        previewData.slip.employeeId,
                        previewData.slip.payrollId,
                        previewData.slip.month,
                        previewData.slip.year,
                      )
                    : undefined);

                if (!payroll) {
                  setError("Payroll data not found for this salary slip.");
                  return;
                }

                generateSalarySlipPDF(previewData.employee, payroll);
                setShowPreviewDialog(false);
              }
            }}
            variant="contained"
            startIcon={<Download />}
            sx={{
              backgroundColor: "#2196f3",
              "&:hover": { backgroundColor: "#1976d2" },
            }}
          >
            Download PDF
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
