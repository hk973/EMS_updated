/**
 * Attendance Deduction Utilities
 *
 * Computes how attendance records over a date range affect base salary.
 * deductionConfig maps each status to a % of daily salary to deduct.
 *   0%   = no deduction
 *   100% = full day deducted
 *   200% = double deduction
 */
import type { Firestore } from "firebase/firestore";

export interface AttendanceDeductionConfig {
  present: number;
  absent: number;
  "half-day": number;
  leave: number;
  "paid-leave": number;
  "working-holiday": number;
}

export const DEFAULT_DEDUCTION_CONFIG: AttendanceDeductionConfig = {
  present: 0,
  absent: 100,
  "half-day": 50,
  leave: 0,
  "paid-leave": 0,
  "working-holiday": 0,
};

export interface AttendanceSummary {
  present: number;
  absent: number;
  "half-day": number;
  leave: number;
  "paid-leave": number;
  "working-holiday": number;
  unmarked: number;
  totalDays: number;
}

export interface AttendanceDeductionResult {
  baseSalary: number;
  dailyRate: number;
  totalDeductionAmount: number;
  baseSalaryAfterAttendance: number;
  summary: AttendanceSummary;
  deductionConfig: AttendanceDeductionConfig;
  workingDaysInPeriod: number;
}

/**
 * Given a map of { date -> status } for one employee, compute the deduction.
 * baseSalary is the monthly base (basic + da or gross, caller decides).
 * workingDaysInPeriod is the number of calendar/working days in the selected range.
 */
export function computeAttendanceDeduction(
  attendanceByDate: Record<string, string>, // { "2025-05-22": "absent", ... }
  baseSalary: number,
  workingDaysInPeriod: number,
  config: AttendanceDeductionConfig = DEFAULT_DEDUCTION_CONFIG,
): AttendanceDeductionResult {
  const summary: AttendanceSummary = {
    present: 0,
    absent: 0,
    "half-day": 0,
    leave: 0,
    "paid-leave": 0,
    "working-holiday": 0,
    unmarked: 0,
    totalDays: workingDaysInPeriod,
  };

  const dailyRate = workingDaysInPeriod > 0 ? baseSalary / workingDaysInPeriod : 0;

  let totalDeductionAmount = 0;

  for (const status of Object.values(attendanceByDate)) {
    const s = status as keyof AttendanceSummary;
    if (s in summary && s !== "unmarked" && s !== "totalDays") {
      summary[s as "present" | "absent" | "half-day" | "leave"]++;
    }
    const pct = config[status as keyof AttendanceDeductionConfig] ?? 0;
    totalDeductionAmount += dailyRate * (pct / 100);
  }

  // Days with no record count as unmarked (no deduction by default)
  const markedDays = Object.keys(attendanceByDate).length;
  summary.unmarked = Math.max(0, workingDaysInPeriod - markedDays);

  const baseSalaryAfterAttendance = Math.max(0, baseSalary - totalDeductionAmount);

  return {
    baseSalary,
    dailyRate,
    totalDeductionAmount,
    baseSalaryAfterAttendance,
    summary,
    deductionConfig: config,
    workingDaysInPeriod,
  };
}

// ─── Attendance Variables (new — for salary template formula context) ────────

export interface AttendanceVariables {
  present_days: number;
  absent_days: number;
  half_days: number;
  leave_days: number;
  paid_leave_days: number;
  working_holiday_days: number;
  unmarked_days: number;
  total_days: number;
}

/**
 * Given a flat array of attendance status strings for one employee and the
 * total calendar days in the period, compute the 7 attendance variables.
 *
 * total_days    = the totalDays parameter (calendar days in the pay period)
 * unmarked_days = Math.max(0, totalDays - (present + absent + half + leave + paid_leave))
 */
export function computeAttendanceVariables(
  statuses: string[],
  totalDays: number,
): AttendanceVariables {
  let present_days = 0;
  let absent_days = 0;
  let half_days = 0;
  let leave_days = 0;
  let paid_leave_days = 0;
  let working_holiday_days = 0;

  for (const s of statuses) {
    if (s === "present") present_days++;
    else if (s === "absent") absent_days++;
    else if (s === "half-day") half_days++;
    else if (s === "leave") leave_days++;
    else if (s === "paid-leave") paid_leave_days++;
    else if (s === "working-holiday") working_holiday_days++;
  }

  const marked = present_days + absent_days + half_days + leave_days + paid_leave_days + working_holiday_days;
  const unmarked_days = Math.max(0, totalDays - marked);

  // Unmarked days are treated as absent (no record = absent)
  const effective_absent_days = absent_days + unmarked_days;

  return { present_days, absent_days: effective_absent_days, half_days, leave_days, paid_leave_days, working_holiday_days, unmarked_days, total_days: totalDays };
}

/**
 * Serializes an AttendanceVariables object into a human-readable string.
 * Format: "present_days=N absent_days=N half_days=N leave_days=N paid_leave_days=N unmarked_days=N total_days=N"
 *
 * Used for debugging and property-based testing round-trips.
 */
export function formatAttendanceVariables(vars: AttendanceVariables): string {
  return [
    `present_days=${vars.present_days}`,
    `absent_days=${vars.absent_days}`,
    `half_days=${vars.half_days}`,
    `leave_days=${vars.leave_days}`,
    `paid_leave_days=${vars.paid_leave_days}`,
    `working_holiday_days=${vars.working_holiday_days}`,
    `unmarked_days=${vars.unmarked_days}`,
    `total_days=${vars.total_days}`,
  ].join(" ");
}

/**
 * Queries Firestore for all attendance records for a given employee within
 * the specified month/year, then computes the 7 attendance variables.
 *
 * On any Firestore error, returns all-zero AttendanceVariables so that
 * formula evaluation can still proceed.
 *
 * @param db         - Firestore instance (injected to keep pure functions testable)
 * @param employeeId - Firestore employee document ID
 * @param month      - 1-based month (1 = January … 12 = December)
 * @param year       - Full year (e.g. 2026)
 * @param totalDays  - Total calendar days in the pay period (used for unmarked_days)
 */
export async function fetchAttendanceVariables(
  db: Firestore,
  employeeId: string,
  month: number,
  year: number,
  totalDays: number,
): Promise<AttendanceVariables> {
  try {
    const { collection, getDocs, query, where } = await import("firebase/firestore");

    // Query only by employeeId to avoid requiring a composite Firestore index.
    // Date filtering is done client-side (consistent with the rest of the app).
    const q = query(
      collection(db, "attendance"),
      where("employeeId", "==", employeeId),
    );

    const snapshot = await getDocs(q);

    // Filter to the target month/year on the client side
    const statuses: string[] = [];
    for (const d of snapshot.docs) {
      const data = d.data();
      // date field may be a Firestore Timestamp or a plain JS Date
      const dateVal: Date = data.date?.toDate ? data.date.toDate() : new Date(data.date);
      if (dateVal.getFullYear() === year && dateVal.getMonth() + 1 === month) {
        statuses.push(data.status as string);
      }
    }

    return computeAttendanceVariables(statuses, totalDays);
  } catch (err) {
    console.error("[fetchAttendanceVariables] Error fetching attendance:", err);
    // Return all-zero variables so formula evaluation is not blocked
    return {
      present_days: 0,
      absent_days: 0,
      half_days: 0,
      leave_days: 0,
      paid_leave_days: 0,
      working_holiday_days: 0,
      unmarked_days: 0,
      total_days: totalDays,
    };
  }
}

/**
 * Builds the formula context keys derived from live AttendanceVariables.
 * Returns the attendance-related keys to inject into the formula context,
 * including the derived paid_days value.
 *
 * Pure function — no React or Firestore dependency, fully testable.
 */
export function buildAttendanceContext(vars: AttendanceVariables): {
  present_days: number;
  absent_days: number;
  half_days: number;
  half_day_days: number;
  leave_days: number;
  paid_leave_days: number;
  working_holiday_days: number;
  unmarked_days: number;
  total_days: number;
  paid_days: number;
} {
  const paid_days =
    vars.present_days +
    vars.half_days * 0.5 +
    vars.leave_days +
    vars.paid_leave_days +
    vars.working_holiday_days;
  return {
    present_days: vars.present_days,
    absent_days: vars.absent_days,
    half_days: vars.half_days,
    half_day_days: vars.half_days, // legacy alias
    leave_days: vars.leave_days,
    paid_leave_days: vars.paid_leave_days,
    working_holiday_days: vars.working_holiday_days,
    unmarked_days: vars.unmarked_days,
    total_days: vars.total_days,
    paid_days,
  };
}

/**
 * Builds the attendance display rows for a salary slip from live AttendanceVariables.
 * Returns an array of [label, value] pairs.
 *
 * Pure function — no React or Firestore dependency, fully testable.
 */
export function buildAttendanceRows(
  vars: AttendanceVariables,
): string[][] {
  return [
    ["Total Days",    String(vars.total_days)],
    ["Present Days",  String(vars.present_days)],
    ["Absent Days",   String(vars.absent_days)],   // includes unmarked
    ["Half Days",     String(vars.half_days)],
    ["Leave Days",    String(vars.leave_days)],
    ["Working Holiday Days", String(vars.working_holiday_days)],
    ["Unmarked Days", String(vars.unmarked_days)],
  ];
}

/**
 * Configuration for an attendance period stored in Firestore.
 * Document ID: `{companyId}_{startDate}_{endDate}` (ISO dates).
 */
export interface AttendancePeriodConfig {
  companyId: string;
  startDate: string;   // ISO date string "YYYY-MM-DD"
  endDate: string;     // ISO date string "YYYY-MM-DD"
  month: number;       // 1-based month for quick salary-slip lookup
  year: number;
  deductionConfig: AttendanceDeductionConfig;
}

// ─── Grid helpers (pure, no React dependency) ────────────────────────────────

/** Grid type: grid[employeeId][dateKey] = status */
export type AttendanceGrid = Record<string, Record<string, string>>;

/** Apply a status to every employee for a given day key */
export function bulkFillColumn(
  grid: AttendanceGrid,
  employeeIds: string[],
  dateKey: string,
  status: string,
): AttendanceGrid {
  const next = { ...grid };
  for (const empId of employeeIds) {
    next[empId] = { ...(next[empId] ?? {}), [dateKey]: status };
  }
  return next;
}

/** Apply a status to every day for a given employee */
export function bulkFillRow(
  grid: AttendanceGrid,
  employeeId: string,
  dateKeys: string[],
  status: string,
): AttendanceGrid {
  const next = { ...grid };
  const empRow = { ...(next[employeeId] ?? {}) };
  for (const dk of dateKeys) {
    empRow[dk] = status;
  }
  next[employeeId] = empRow;
  return next;
}

/**
 * Builds the list of attendance document entries for a batch write.
 * Returns one entry per (employeeId, dateKey) combination.
 * This is a pure function so it can be unit/property tested without Firestore.
 */
export interface AttendanceBatchEntry {
  employeeId: string;
  dateKey: string;   // "YYYY-MM-DD"
  status: string;
}

export function buildAttendanceBatchEntries(
  grid: AttendanceGrid,
  employeeIds: string[],
  dateKeys: string[],
): AttendanceBatchEntry[] {
  const entries: AttendanceBatchEntry[] = [];
  for (const empId of employeeIds) {
    for (const dk of dateKeys) {
      const status = grid[empId]?.[dk] ?? "";
      // Skip blank/empty cells — no record means unmarked (treated as absent)
      if (!status) continue;
      entries.push({ employeeId: empId, dateKey: dk, status });
    }
  }
  return entries;
}

/** Format a deduction config percentage into a human-readable label */
export function deductionPctLabel(pct: number): string {
  if (pct === 0) return "No deduction";
  if (pct === 100) return "Full day deducted";
  if (pct === 200) return "Double deduction";
  return `${pct}% of daily salary`;
}

// ─── Slip line item builder (pure, no React dependency) ──────────────────────

export interface SlipLineItem {
  label: string;
  amount: number;
}

export interface FallbackSlipModel {
  earnings: SlipLineItem[];
  deductions: SlipLineItem[];
  netSalary: number;
}

/**
 * Builds the fallback (non-template) salary slip line items given base salary
 * components and an attendance deduction result.
 *
 * Line item order (Req 5.5):
 *   BASE SALARY → ATTENDANCE DEDUCTION (if > 0) → BASE AFTER ATTENDANCE (if > 0)
 *   → other earnings → TOTAL GROSS EARNING
 *
 * Statutory deductions (PF, ESIC, PT) are computed on baseAfterAttendance (Req 5.3).
 */
export function buildFallbackSlipModel(params: {
  basic: number;
  hra: number;
  ta: number;
  da: number;
  totalBonus: number;
  grossSalary: number;
  attendanceDeductionResult: AttendanceDeductionResult | null;
  pfEmployee: number;
  professionalTax: number;
  esicEmployee: number;
  tds: number;
  advance: number;
  mlwfEmployer: number;
  totalDeduction: number;
  netSalary: number;
}): FallbackSlipModel {
  const {
    basic,
    hra,
    ta,
    da,
    totalBonus,
    grossSalary,
    attendanceDeductionResult,
    pfEmployee,
    professionalTax,
    esicEmployee,
    tds,
    advance,
    mlwfEmployer,
    totalDeduction,
    netSalary,
  } = params;

  const attendanceDeduction = attendanceDeductionResult?.totalDeductionAmount ?? 0;
  const baseAfterAttendance = attendanceDeductionResult?.baseSalaryAfterAttendance ?? basic;

  const earnings: SlipLineItem[] = [
    { label: "BASE SALARY", amount: basic },
    { label: "H.R.A", amount: hra },
    { label: "CONVEYANCE ALL.", amount: ta },
    { label: "D.A.", amount: da },
    { label: "OTHER ALL.", amount: totalBonus },
  ];

  if (attendanceDeduction > 0) {
    earnings.push({ label: "ATTENDANCE DEDUCTION", amount: -attendanceDeduction });
    earnings.push({ label: "BASE AFTER ATTENDANCE", amount: baseAfterAttendance });
  }

  earnings.push({ label: "TOTAL GROSS EARNING", amount: grossSalary });

  const deductions: SlipLineItem[] = [
    { label: "EPF", amount: pfEmployee },
    { label: "PT", amount: professionalTax },
    { label: "ESIC", amount: esicEmployee },
    { label: "TDS", amount: tds },
    { label: "ADVANCE", amount: advance },
    { label: "MLWF", amount: mlwfEmployer },
    { label: "Total", amount: totalDeduction },
  ];

  return { earnings, deductions, netSalary };
}
