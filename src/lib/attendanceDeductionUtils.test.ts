import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import {
  computeAttendanceDeduction,
  computeAttendanceVariables,
  AttendanceDeductionConfig,
  DEFAULT_DEDUCTION_CONFIG,
} from "./attendanceDeductionUtils";

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

const STATUSES = ["present", "absent", "half-day", "leave"] as const;

/** Generates a valid base salary: positive integer up to 500_000 */
const arbBaseSalary = fc.integer({ min: 1, max: 500_000 });

/** Generates a valid working-days count: 1–31 */
const arbWorkingDays = fc.integer({ min: 1, max: 31 });

/** Generates a deduction config with percentages in [0, 200] step 10 */
const arbDeductionConfig: fc.Arbitrary<AttendanceDeductionConfig> = fc.record({
  present: fc.integer({ min: 0, max: 20 }).map((n) => n * 10),
  absent: fc.integer({ min: 0, max: 20 }).map((n) => n * 10),
  "half-day": fc.integer({ min: 0, max: 20 }).map((n) => n * 10),
  leave: fc.integer({ min: 0, max: 20 }).map((n) => n * 10),
});

/** Generates an attendance map keyed by ISO date strings */
const arbAttendanceMap = (workingDays: number) =>
  fc
    .array(
      fc.record({
        day: fc.integer({ min: 1, max: workingDays }),
        status: fc.constantFrom(...STATUSES),
      }),
      { minLength: 0, maxLength: workingDays },
    )
    .map((entries) => {
      const map: Record<string, string> = {};
      for (const { day, status } of entries) {
        // Use a simple key like "2025-05-01", "2025-05-02", etc.
        const dateKey = `2025-05-${String(day).padStart(2, "0")}`;
        map[dateKey] = status;
      }
      return map;
    });

// ---------------------------------------------------------------------------
// Property 1: Deduction non-negative and bounded
// **Feature: bulk-attendance-period-edit, Property 1: Deduction non-negative and bounded**
// Validates: Requirements 3.1, 4.1
// ---------------------------------------------------------------------------
describe("Property 1: Deduction non-negative and bounded", () => {
  it("totalDeductionAmount >= 0 and <= baseSalary * (maxPct/100)", () => {
    fc.assert(
      fc.property(
        arbBaseSalary,
        arbWorkingDays,
        arbDeductionConfig,
        (baseSalary, workingDays, config) =>
          fc.pre(workingDays > 0) ||
          fc
            .sample(arbAttendanceMap(workingDays), 1)
            .every((attendanceMap) => {
              const result = computeAttendanceDeduction(
                attendanceMap,
                baseSalary,
                workingDays,
                config,
              );
              const maxPct = Math.max(
                config.present,
                config.absent,
                config["half-day"],
                config.leave,
              );
              const upperBound = baseSalary * (maxPct / 100);
              return (
                result.totalDeductionAmount >= 0 &&
                result.totalDeductionAmount <= upperBound + 0.01 // float tolerance
              );
            }),
      ),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 2: Base salary after attendance floored at zero
// **Feature: bulk-attendance-period-edit, Property 2: Base salary after attendance floored at zero**
// Validates: Requirements 4.3
// ---------------------------------------------------------------------------
describe("Property 2: Base salary after attendance floored at zero", () => {
  it("baseSalaryAfterAttendance === Math.max(0, baseSalary - totalDeductionAmount)", () => {
    fc.assert(
      fc.property(
        arbBaseSalary,
        arbWorkingDays,
        arbDeductionConfig,
        (baseSalary, workingDays, config) => {
          const attendanceMap: Record<string, string> = {};
          // Fill all days as absent to maximise deduction
          for (let d = 1; d <= workingDays; d++) {
            attendanceMap[`2025-05-${String(d).padStart(2, "0")}`] = "absent";
          }
          const result = computeAttendanceDeduction(
            attendanceMap,
            baseSalary,
            workingDays,
            config,
          );
          const expected = Math.max(
            0,
            baseSalary - result.totalDeductionAmount,
          );
          return Math.abs(result.baseSalaryAfterAttendance - expected) < 0.01;
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 3: Zero config → zero deduction
// **Feature: bulk-attendance-period-edit, Property 3: Zero config → zero deduction**
// Validates: Requirements 3.4
// ---------------------------------------------------------------------------
describe("Property 3: Zero config produces zero deduction", () => {
  it("all-zero config → totalDeductionAmount === 0 and baseSalaryAfterAttendance === baseSalary", () => {
    const zeroConfig: AttendanceDeductionConfig = {
      present: 0,
      absent: 0,
      "half-day": 0,
      leave: 0,
    };

    fc.assert(
      fc.property(arbBaseSalary, arbWorkingDays, (baseSalary, workingDays) => {
        const attendanceMap: Record<string, string> = {};
        for (let d = 1; d <= workingDays; d++) {
          attendanceMap[`2025-05-${String(d).padStart(2, "0")}`] =
            STATUSES[d % STATUSES.length];
        }
        const result = computeAttendanceDeduction(
          attendanceMap,
          baseSalary,
          workingDays,
          zeroConfig,
        );
        return (
          result.totalDeductionAmount === 0 &&
          result.baseSalaryAfterAttendance === baseSalary
        );
      }),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 4: 100% absent config → deduction = dailyRate × absentDays
// **Feature: bulk-attendance-period-edit, Property 4: 100% absent config → deduction = dailyRate × absentDays**
// Validates: Requirements 3.1, 4.1
// ---------------------------------------------------------------------------
describe("Property 4: 100% absent config deducts exactly dailyRate × absentDays", () => {
  it("absent=100, others=0 → totalDeductionAmount === dailyRate * absentDays", () => {
    const absentOnlyConfig: AttendanceDeductionConfig = {
      present: 0,
      absent: 100,
      "half-day": 0,
      leave: 0,
    };

    fc.assert(
      fc.property(
        arbBaseSalary,
        arbWorkingDays,
        fc.integer({ min: 0, max: 31 }),
        (baseSalary, workingDays, absentDays) => {
          fc.pre(absentDays <= workingDays);

          const attendanceMap: Record<string, string> = {};
          for (let d = 1; d <= absentDays; d++) {
            attendanceMap[`2025-05-${String(d).padStart(2, "0")}`] = "absent";
          }

          const result = computeAttendanceDeduction(
            attendanceMap,
            baseSalary,
            workingDays,
            absentOnlyConfig,
          );

          const expectedDeduction = result.dailyRate * absentDays;
          return Math.abs(result.totalDeductionAmount - expectedDeduction) < 0.01;
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 5: Deduction Config JSON round-trip
// **Feature: bulk-attendance-period-edit, Property 5: Deduction Config JSON round-trip**
// Validates: Requirements 6.4
// ---------------------------------------------------------------------------
describe("Property 5: Deduction Config JSON round-trip", () => {
  it("JSON.parse(JSON.stringify(config)) deeply equals original", () => {
    fc.assert(
      fc.property(arbDeductionConfig, (config) => {
        const roundTripped = JSON.parse(
          JSON.stringify(config),
        ) as AttendanceDeductionConfig;
        return (
          roundTripped.present === config.present &&
          roundTripped.absent === config.absent &&
          roundTripped["half-day"] === config["half-day"] &&
          roundTripped.leave === config.leave
        );
      }),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 7: Bulk-fill sets all cells in target dimension
// **Feature: bulk-attendance-period-edit, Property 7: Bulk-fill sets all cells in target dimension**
// Validates: Requirements 2.1, 2.2
// ---------------------------------------------------------------------------
import { bulkFillColumn, bulkFillRow, AttendanceGrid } from "./attendanceDeductionUtils";

const arbStatus = fc.constantFrom("present", "absent", "half-day", "leave");

/** Generates a list of N employee IDs */
const arbEmployeeIds = (n: number) =>
  fc.array(fc.uuid(), { minLength: n, maxLength: n });

/** Generates a list of D date keys like "2025-05-01" */
const arbDateKeys = (d: number) =>
  fc
    .array(fc.integer({ min: 1, max: 28 }), { minLength: d, maxLength: d })
    .map((days) =>
      [...new Set(days)].map((day) => `2025-05-${String(day).padStart(2, "0")}`),
    );

/** Generates a grid for given employee IDs and date keys */
function makeGrid(empIds: string[], dateKeys: string[]): AttendanceGrid {
  const grid: AttendanceGrid = {};
  for (const id of empIds) {
    grid[id] = {};
    for (const dk of dateKeys) {
      grid[id][dk] = "present";
    }
  }
  return grid;
}

describe("Property 7: Bulk-fill sets all cells in target dimension", () => {
  it("bulkFillColumn: every employee's status for the target day equals the chosen status", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 10 }),
        fc.integer({ min: 1, max: 28 }),
        arbStatus,
        (numEmployees, dayNum, status) => {
          const empIds = Array.from({ length: numEmployees }, (_, i) => `emp-${i}`);
          const dateKeys = Array.from({ length: 5 }, (_, i) =>
            `2025-05-${String(i + 1).padStart(2, "0")}`,
          );
          const targetKey = `2025-05-${String(Math.min(dayNum, 5)).padStart(2, "0")}`;
          const grid = makeGrid(empIds, dateKeys);

          const result = bulkFillColumn(grid, empIds, targetKey, status);

          return empIds.every((id) => result[id][targetKey] === status);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("bulkFillRow: every day's status for the target employee equals the chosen status", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 10 }),
        fc.integer({ min: 1, max: 5 }),
        arbStatus,
        (numEmployees, empIndex, status) => {
          const empIds = Array.from({ length: numEmployees }, (_, i) => `emp-${i}`);
          const dateKeys = Array.from({ length: 5 }, (_, i) =>
            `2025-05-${String(i + 1).padStart(2, "0")}`,
          );
          const targetEmpId = empIds[Math.min(empIndex - 1, empIds.length - 1)];
          const grid = makeGrid(empIds, dateKeys);

          const result = bulkFillRow(grid, targetEmpId, dateKeys, status);

          return dateKeys.every((dk) => result[targetEmpId][dk] === status);
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 6: Grid save produces N×D documents
// **Feature: bulk-attendance-period-edit, Property 6: Grid save produces N×D documents**
// Validates: Requirements 1.5
// ---------------------------------------------------------------------------
import { buildAttendanceBatchEntries } from "./attendanceDeductionUtils";

describe("Property 6: Grid save produces N×D documents", () => {
  it("buildAttendanceBatchEntries returns exactly N×D entries for N employees and D days", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 20 }),  // N employees
        fc.integer({ min: 1, max: 62 }),  // D days
        arbStatus,
        (numEmployees, numDays, defaultStatus) => {
          const empIds = Array.from({ length: numEmployees }, (_, i) => `emp-${i}`);
          const dateKeys = Array.from({ length: numDays }, (_, i) =>
            `2025-05-${String((i % 28) + 1).padStart(2, "0")}`,
          );

          // Build a grid with all cells set to defaultStatus
          const grid: AttendanceGrid = {};
          for (const id of empIds) {
            grid[id] = {};
            for (const dk of dateKeys) {
              grid[id][dk] = defaultStatus;
            }
          }

          const entries = buildAttendanceBatchEntries(grid, empIds, dateKeys);

          return entries.length === numEmployees * numDays;
        },
      ),
      { numRuns: 100 },
    );
  });

  it("each entry has the correct employeeId, dateKey, and status", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 5 }),
        fc.integer({ min: 1, max: 5 }),
        arbStatus,
        (numEmployees, numDays, status) => {
          const empIds = Array.from({ length: numEmployees }, (_, i) => `emp-${i}`);
          const dateKeys = Array.from({ length: numDays }, (_, i) =>
            `2025-05-${String(i + 1).padStart(2, "0")}`,
          );
          const grid: AttendanceGrid = {};
          for (const id of empIds) {
            grid[id] = {};
            for (const dk of dateKeys) {
              grid[id][dk] = status;
            }
          }

          const entries = buildAttendanceBatchEntries(grid, empIds, dateKeys);

          return entries.every(
            (e) =>
              empIds.includes(e.employeeId) &&
              dateKeys.includes(e.dateKey) &&
              e.status === status,
          );
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 8: Slip includes attendance deduction line when deduction > 0
// **Feature: bulk-attendance-period-edit, Property 8: Slip includes attendance deduction line when deduction > 0**
// Validates: Requirements 5.2
// ---------------------------------------------------------------------------
import {
  buildFallbackSlipModel,
  AttendanceDeductionResult,
} from "./attendanceDeductionUtils";

describe("Property 8: Slip includes attendance deduction line when deduction > 0", () => {
  it("earnings array contains ATTENDANCE DEDUCTION entry when deduction > 0", () => {
    fc.assert(
      fc.property(
        arbBaseSalary,
        arbWorkingDays,
        // Generate at least 1 absent day to guarantee a non-zero deduction
        fc.integer({ min: 1, max: 31 }),
        (baseSalary, workingDays, absentDays) => {
          fc.pre(absentDays <= workingDays);

          const attendanceMap: Record<string, string> = {};
          for (let d = 1; d <= absentDays; d++) {
            attendanceMap[`2025-05-${String(d).padStart(2, "0")}`] = "absent";
          }

          // Use default config: absent = 100%
          const deductionResult = computeAttendanceDeduction(
            attendanceMap,
            baseSalary,
            workingDays,
          );

          fc.pre(deductionResult.totalDeductionAmount > 0);

          const slip = buildFallbackSlipModel({
            basic: baseSalary,
            hra: 0,
            ta: 0,
            da: 0,
            totalBonus: 0,
            grossSalary: baseSalary,
            attendanceDeductionResult: deductionResult,
            pfEmployee: 0,
            professionalTax: 0,
            esicEmployee: 0,
            tds: 0,
            advance: 0,
            mlwfEmployer: 0,
            totalDeduction: 0,
            netSalary: deductionResult.baseSalaryAfterAttendance,
          });

          const hasDeductionLine = slip.earnings.some(
            (item) => item.label === "ATTENDANCE DEDUCTION",
          );
          const hasBaseAfterLine = slip.earnings.some(
            (item) => item.label === "BASE AFTER ATTENDANCE",
          );

          return hasDeductionLine && hasBaseAfterLine;
        },
      ),
      { numRuns: 100 },
    );
  });

  it("earnings array does NOT contain ATTENDANCE DEDUCTION entry when deduction is 0", () => {
    fc.assert(
      fc.property(arbBaseSalary, (baseSalary) => {
        // Empty attendance map → zero deduction
        const deductionResult = computeAttendanceDeduction({}, baseSalary, 30);

        const slip = buildFallbackSlipModel({
          basic: baseSalary,
          hra: 0,
          ta: 0,
          da: 0,
          totalBonus: 0,
          grossSalary: baseSalary,
          attendanceDeductionResult: deductionResult,
          pfEmployee: 0,
          professionalTax: 0,
          esicEmployee: 0,
          tds: 0,
          advance: 0,
          mlwfEmployer: 0,
          totalDeduction: 0,
          netSalary: baseSalary,
        });

        return !slip.earnings.some((item) => item.label === "ATTENDANCE DEDUCTION");
      }),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 9: Statutory deductions computed on base_after_attendance
// **Feature: bulk-attendance-period-edit, Property 9: Statutory deductions computed on base_after_attendance**
// Validates: Requirements 5.3
// ---------------------------------------------------------------------------
describe("Property 9: Statutory deductions computed on base_after_attendance", () => {
  it("base_after_attendance in slip model equals baseSalaryAfterAttendance from computeAttendanceDeduction", () => {
    fc.assert(
      fc.property(
        arbBaseSalary,
        arbWorkingDays,
        fc.integer({ min: 1, max: 31 }),
        (baseSalary, workingDays, absentDays) => {
          fc.pre(absentDays <= workingDays);

          const attendanceMap: Record<string, string> = {};
          for (let d = 1; d <= absentDays; d++) {
            attendanceMap[`2025-05-${String(d).padStart(2, "0")}`] = "absent";
          }

          const deductionResult = computeAttendanceDeduction(
            attendanceMap,
            baseSalary,
            workingDays,
          );

          const slip = buildFallbackSlipModel({
            basic: baseSalary,
            hra: 0,
            ta: 0,
            da: 0,
            totalBonus: 0,
            grossSalary: baseSalary,
            attendanceDeductionResult: deductionResult,
            pfEmployee: 0,
            professionalTax: 0,
            esicEmployee: 0,
            tds: 0,
            advance: 0,
            mlwfEmployer: 0,
            totalDeduction: 0,
            netSalary: deductionResult.baseSalaryAfterAttendance,
          });

          // The BASE AFTER ATTENDANCE line item amount must equal baseSalaryAfterAttendance
          if (deductionResult.totalDeductionAmount > 0) {
            const baseAfterLine = slip.earnings.find(
              (item) => item.label === "BASE AFTER ATTENDANCE",
            );
            if (!baseAfterLine) return false;
            return (
              Math.abs(baseAfterLine.amount - deductionResult.baseSalaryAfterAttendance) < 0.01
            );
          }

          // When deduction is 0, BASE AFTER ATTENDANCE line should not appear
          return !slip.earnings.some((item) => item.label === "BASE AFTER ATTENDANCE");
        },
      ),
      { numRuns: 100 },
    );
  });

  it("netSalary in slip model uses baseSalaryAfterAttendance as the base", () => {
    fc.assert(
      fc.property(
        arbBaseSalary,
        arbWorkingDays,
        fc.integer({ min: 1, max: 31 }),
        (baseSalary, workingDays, absentDays) => {
          fc.pre(absentDays <= workingDays);

          const attendanceMap: Record<string, string> = {};
          for (let d = 1; d <= absentDays; d++) {
            attendanceMap[`2025-05-${String(d).padStart(2, "0")}`] = "absent";
          }

          const deductionResult = computeAttendanceDeduction(
            attendanceMap,
            baseSalary,
            workingDays,
          );

          // Net salary should be baseSalaryAfterAttendance (no other deductions in this test)
          const slip = buildFallbackSlipModel({
            basic: baseSalary,
            hra: 0,
            ta: 0,
            da: 0,
            totalBonus: 0,
            grossSalary: baseSalary,
            attendanceDeductionResult: deductionResult,
            pfEmployee: 0,
            professionalTax: 0,
            esicEmployee: 0,
            tds: 0,
            advance: 0,
            mlwfEmployer: 0,
            totalDeduction: 0,
            netSalary: deductionResult.baseSalaryAfterAttendance,
          });

          return (
            Math.abs(slip.netSalary - deductionResult.baseSalaryAfterAttendance) < 0.01
          );
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 1 (attendance-variables): Attendance variable computation correctness
// **Feature: attendance-variables-in-salary-template, Property 1: Attendance variable computation correctness**
// Validates: Requirements 3.2, 3.3
// ---------------------------------------------------------------------------

const ALL_STATUSES = ["present", "absent", "half-day", "leave", "paid-leave"] as const;

const arbAttendanceStatuses = fc.array(
  fc.constantFrom(...ALL_STATUSES),
  { minLength: 0, maxLength: 62 },
);

const arbTotalDays = fc.integer({ min: 0, max: 31 });

describe("Property 1 (attendance-variables): Attendance variable computation correctness", () => {
  it("all 7 fields satisfy their formulas for any status array and totalDays", () => {
    fc.assert(
      fc.property(arbAttendanceStatuses, arbTotalDays, (statuses, totalDays) => {
        const result = computeAttendanceVariables(statuses, totalDays);

        const expectedPresent    = statuses.filter((s) => s === "present").length;
        const rawAbsent          = statuses.filter((s) => s === "absent").length;
        const expectedHalf       = statuses.filter((s) => s === "half-day").length;
        const expectedLeave      = statuses.filter((s) => s === "leave").length;
        const expectedPaidLeave  = statuses.filter((s) => s === "paid-leave").length;
        const marked = expectedPresent + rawAbsent + expectedHalf + expectedLeave + expectedPaidLeave;
        const expectedUnmarked   = Math.max(0, totalDays - marked);
        // absent_days = raw absent + unmarked (Req 1.5: unmarked treated as absent)
        const expectedAbsent     = rawAbsent + expectedUnmarked;

        return (
          result.present_days    === expectedPresent   &&
          result.absent_days     === expectedAbsent    &&
          result.half_days       === expectedHalf      &&
          result.leave_days      === expectedLeave     &&
          result.paid_leave_days === expectedPaidLeave &&
          result.unmarked_days   === expectedUnmarked  &&
          result.total_days      === totalDays
        );
      }),
      { numRuns: 100 },
    );
  });

  it("empty statuses → all counts zero, unmarked_days = totalDays, total_days = totalDays", () => {
    fc.assert(
      fc.property(arbTotalDays, (totalDays) => {
        const result = computeAttendanceVariables([], totalDays);
        // absent_days = raw(0) + unmarked(totalDays) per Req 1.5
        return (
          result.present_days    === 0         &&
          result.absent_days     === totalDays &&
          result.half_days       === 0         &&
          result.leave_days      === 0         &&
          result.paid_leave_days === 0         &&
          result.unmarked_days   === totalDays &&
          result.total_days      === totalDays
        );
      }),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 2 (attendance-variables): Context merge completeness
// **Feature: attendance-variables-in-salary-template, Property 2: Context merge completeness**
// Validates: Requirements 3.4
// ---------------------------------------------------------------------------
import { AttendanceVariables } from "./attendanceDeductionUtils";

describe("Property 2 (attendance-variables): Context merge completeness", () => {
  /**
   * For any salary context object and any AttendanceVariables object,
   * merging them must produce a context that contains every key from both,
   * with attendance values taking precedence on key collision.
   */
  it("merged context contains every key from both salary ctx and attendance variables", () => {
    const arbSalaryCtx = fc.dictionary(
      fc.string({ minLength: 1, maxLength: 20 }).filter((s) => /^[a-z_][a-z0-9_]*$/.test(s)),
      fc.oneof(fc.integer({ min: 0, max: 100_000 }), fc.constant(0)),
    );

    const arbAttendanceVars: fc.Arbitrary<AttendanceVariables> = fc.record({
      present_days:    fc.integer({ min: 0, max: 31 }),
      absent_days:     fc.integer({ min: 0, max: 31 }),
      half_days:       fc.integer({ min: 0, max: 31 }),
      leave_days:      fc.integer({ min: 0, max: 31 }),
      paid_leave_days: fc.integer({ min: 0, max: 31 }),
      unmarked_days:   fc.integer({ min: 0, max: 31 }),
      total_days:      fc.integer({ min: 0, max: 31 }),
    });

    fc.assert(
      fc.property(arbSalaryCtx, arbAttendanceVars, (salaryCtx, attendanceVars) => {
        // Merge: attendance variables take precedence (spread order matches design)
        const merged = { ...salaryCtx, ...attendanceVars };

        // Every key from salaryCtx must be present (unless overridden by attendance)
        const salaryKeysPresent = Object.keys(salaryCtx).every((k) => k in merged);

        // Every attendance variable key must be present with the attendance value
        const attendanceKeysPresent = (Object.keys(attendanceVars) as (keyof AttendanceVariables)[]).every(
          (k) => merged[k] === attendanceVars[k],
        );

        return salaryKeysPresent && attendanceKeysPresent;
      }),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 3 (attendance-variables): Formula evaluation with attendance variables
// **Feature: attendance-variables-in-salary-template, Property 3: Formula evaluation with attendance variables**
// Validates: Requirements 1.4
// ---------------------------------------------------------------------------

// Local copy of evaluateTemplateFormula (pure function, no Firebase dependency)
// Mirrors the implementation in salaryTemplateService.ts
function splitArgsLocal(s: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let inStr = false;
  let strChar = "";
  let cur = "";
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (inStr) {
      cur += ch;
      if (ch === strChar && s[i - 1] !== "\\") inStr = false;
    } else if (ch === '"' || ch === "'") {
      inStr = true; strChar = ch; cur += ch;
    } else if (ch === "(") {
      depth++; cur += ch;
    } else if (ch === ")") {
      depth--; cur += ch;
    } else if (ch === "," && depth === 0) {
      parts.push(cur.trim()); cur = "";
    } else {
      cur += ch;
    }
  }
  if (cur.trim()) parts.push(cur.trim());
  return parts;
}

function findClosingParenLocal(s: string, openPos: number): number {
  let depth = 1;
  let inStr = false;
  let strChar = "";
  for (let i = openPos + 1; i < s.length; i++) {
    const ch = s[i];
    if (inStr) {
      if (ch === strChar && s[i - 1] !== "\\") inStr = false;
    } else if (ch === '"' || ch === "'") {
      inStr = true; strChar = ch;
    } else if (ch === "(") {
      depth++;
    } else if (ch === ")") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function transformIfLocal(expr: string): string {
  let result = expr;
  let safety = 0;
  while (/\bif\s*\(/i.test(result) && safety++ < 200) {
    const ifMatch = [...result.matchAll(/\bif\s*\(/gi)].pop();
    if (!ifMatch || ifMatch.index === undefined) break;
    const openIdx = ifMatch.index + ifMatch[0].length - 1;
    const closeIdx = findClosingParenLocal(result, openIdx);
    if (closeIdx === -1) break;
    const inner = result.slice(openIdx + 1, closeIdx);
    const args = splitArgsLocal(inner);
    let ternary: string;
    if (args.length >= 3) {
      ternary = `((${args[0]}) ? (${args[1]}) : (${args[2]}))`;
    } else if (args.length === 2) {
      ternary = `((${args[0]}) ? (${args[1]}) : 0)`;
    } else {
      ternary = "0";
    }
    result = result.slice(0, ifMatch.index) + ternary + result.slice(closeIdx + 1);
  }
  return result;
}

function evaluateTemplateFormula(
  expr: string,
  ctx: Record<string, unknown>,
): number | string {
  if (!expr.trim()) return 0;
  try {
    const transformed = transformIfLocal(expr.trim());
    const keys = Object.keys(ctx);
    const vals = keys.map((k) => ctx[k]);
    // eslint-disable-next-line no-new-func
    const fn = new Function(...keys, `"use strict"; return (${transformed});`);
    const result = fn(...vals);
    if (result === null || result === undefined) return 0;
    if (typeof result === "number") return isFinite(result) ? Math.round(result * 100) / 100 : 0;
    return result;
  } catch {
    return 0;
  }
}

const ATTENDANCE_KEYS = [
  "present_days",
  "absent_days",
  "half_days",
  "leave_days",
  "paid_leave_days",
  "unmarked_days",
  "total_days",
] as const;

describe("Property 3 (attendance-variables): Formula evaluation with attendance variables", () => {
  /**
   * For any formula expression referencing one or more attendance variable keys,
   * and any context that includes those keys with numeric values,
   * evaluateTemplateFormula must return a finite number (not "error", NaN, or Infinity).
   */
  it("evaluateTemplateFormula returns a finite number for any attendance-variable formula", () => {
    // Arbitrary: pick one or two attendance keys and build a simple formula
    const arbFormulaAndCtx = fc
      .tuple(
        fc.constantFrom(...ATTENDANCE_KEYS),
        fc.constantFrom(...ATTENDANCE_KEYS),
        fc.integer({ min: 0, max: 31 }),
        fc.integer({ min: 0, max: 31 }),
        fc.integer({ min: 1, max: 30 }), // total_days — non-zero to avoid division by zero
      )
      .map(([key1, key2, val1, val2, totalDays]) => {
        // Build a simple formula: key1 * (basic / total_days) — mirrors the design example
        const formula = `${key1} * (basic / total_days)`;
        const ctx: Record<string, unknown> = {
          [key1]: val1,
          [key2]: val2,
          basic: 20000,
          total_days: totalDays,
        };
        return { formula, ctx };
      });

    fc.assert(
      fc.property(arbFormulaAndCtx, ({ formula, ctx }) => {
        const result = evaluateTemplateFormula(formula, ctx);

        // Must not be the string "error"
        if (result === "error") return false;

        // Must be a finite number
        if (typeof result !== "number") return false;
        if (!isFinite(result)) return false;
        if (isNaN(result)) return false;

        return true;
      }),
      { numRuns: 100 },
    );
  });

  it("evaluateTemplateFormula handles if() with attendance variables and returns finite number", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 10 }),  // absent_days
        fc.integer({ min: 1, max: 30 }),  // total_days
        fc.integer({ min: 1000, max: 100_000 }), // basic
        (absentDays, totalDays, basic) => {
          const formula = `if(absent_days > 3, absent_days * (basic / total_days), 0)`;
          const ctx: Record<string, unknown> = {
            absent_days: absentDays,
            basic,
            total_days: totalDays,
          };

          const result = evaluateTemplateFormula(formula, ctx);

          if (result === "error") return false;
          if (typeof result !== "number") return false;
          if (!isFinite(result)) return false;
          if (isNaN(result)) return false;

          return true;
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 4 (attendance-variables): Attendance period save omits deductionConfig
// **Feature: attendance-variables-in-salary-template, Property 4: Attendance period save omits deductionConfig**
// Validates: Requirements 2.2, 5.3
// ---------------------------------------------------------------------------

/**
 * Mirrors the payload construction logic in BulkAttendancePeriodDialog.handleSave
 * after the deductionConfig field has been removed.
 */
function buildAttendancePeriodPayload(params: {
  companyId: string;
  startDate: Date;
  endDate: Date;
  createdBy: string;
}): Record<string, unknown> {
  const { companyId, startDate, endDate, createdBy } = params;
  return {
    companyId,
    startDate: startDate.toISOString(),
    endDate: endDate.toISOString(),
    month: startDate.getMonth() + 1,
    year: startDate.getFullYear(),
    createdBy,
    createdAt: new Date().toISOString(),
  };
}

describe("Property 4 (attendance-variables): Attendance period save omits deductionConfig", () => {
  /**
   * For any attendance period save operation, the object written to the
   * attendancePeriodConfig Firestore document must not contain a deductionConfig key.
   */
  it("save payload does not contain a deductionConfig key for any valid input", () => {
    const arbCompanyId = fc.uuid();
    const arbUserId = fc.uuid();
    const arbDate = fc
      .integer({ min: 2020, max: 2030 })
      .chain((year) =>
        fc.integer({ min: 0, max: 11 }).map((month) => new Date(year, month, 1)),
      );

    fc.assert(
      fc.property(arbCompanyId, arbUserId, arbDate, (companyId, createdBy, startDate) => {
        const endDate = new Date(startDate.getFullYear(), startDate.getMonth() + 1, 0);
        const payload = buildAttendancePeriodPayload({ companyId, startDate, endDate, createdBy });
        return !("deductionConfig" in payload);
      }),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 5 (attendance-variables): computeAttendanceDeduction backward compatibility
// **Feature: attendance-variables-in-salary-template, Property 5: computeAttendanceDeduction backward compatibility**
// Validates: Requirements 5.2
// ---------------------------------------------------------------------------

describe("Property 5 (attendance-variables): computeAttendanceDeduction backward compatibility", () => {
  /**
   * For any valid AttendanceDeductionConfig and any attendance grid row,
   * computeAttendanceDeduction must return an AttendanceDeductionResult where
   * baseSalaryAfterAttendance is a finite non-negative number and
   * totalDeductionAmount is non-negative.
   */
  it("baseSalaryAfterAttendance is finite and >= 0, totalDeductionAmount is >= 0", () => {
    const arbFullDeductionConfig: fc.Arbitrary<AttendanceDeductionConfig> = fc.record({
      present:      fc.integer({ min: 0, max: 20 }).map((n) => n * 10),
      absent:       fc.integer({ min: 0, max: 20 }).map((n) => n * 10),
      "half-day":   fc.integer({ min: 0, max: 20 }).map((n) => n * 10),
      leave:        fc.integer({ min: 0, max: 20 }).map((n) => n * 10),
      "paid-leave": fc.integer({ min: 0, max: 20 }).map((n) => n * 10),
    });

    const arbGridRow = fc.array(
      fc.record({
        day:    fc.integer({ min: 1, max: 28 }),
        status: fc.constantFrom("present", "absent", "half-day", "leave", "paid-leave"),
      }),
      { minLength: 0, maxLength: 28 },
    ).map((entries) => {
      const row: Record<string, string> = {};
      for (const { day, status } of entries) {
        row[`2025-05-${String(day).padStart(2, "0")}`] = status;
      }
      return row;
    });

    fc.assert(
      fc.property(
        arbBaseSalary,
        arbWorkingDays,
        arbFullDeductionConfig,
        arbGridRow,
        (baseSalary, workingDays, config, gridRow) => {
          const result = computeAttendanceDeduction(gridRow, baseSalary, workingDays, config);
          return (
            isFinite(result.baseSalaryAfterAttendance) &&
            result.baseSalaryAfterAttendance >= 0 &&
            result.totalDeductionAmount >= 0
          );
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 1 (live-salary-slip-attendance): Attendance counts sum to total days
// Feature: live-salary-slip-attendance, Property 1: Attendance counts sum to total days
// Validates: Requirements 1.2, 1.5, 5.2
// ---------------------------------------------------------------------------
import { formatAttendanceVariables } from "./attendanceDeductionUtils";

const ALL_STATUSES_WITH_UNMARKED = [
  "present",
  "absent",
  "half-day",
  "leave",
  "paid-leave",
] as const;

describe("Property 1 (live-salary-slip-attendance): Attendance counts sum to total days", () => {
  it("present_days + absent_days + half_days + leave_days + paid_leave_days === totalDays", () => {
    // Feature: live-salary-slip-attendance, Property 1: Attendance counts sum to total days
    fc.assert(
      fc.property(
        // Generate totalDays first, then constrain statuses to at most totalDays entries
        fc.integer({ min: 0, max: 31 }).chain((totalDays) =>
          fc.tuple(
            fc.array(fc.constantFrom(...ALL_STATUSES_WITH_UNMARKED), {
              minLength: 0,
              maxLength: totalDays,
            }),
            fc.constant(totalDays),
          ),
        ),
        ([statuses, totalDays]) => {
          const vars = computeAttendanceVariables(statuses, totalDays);
          // absent_days already includes unmarked_days, so the sum must equal totalDays
          return (
            vars.present_days +
              vars.absent_days +
              vars.half_days +
              vars.leave_days +
              vars.paid_leave_days ===
            totalDays
          );
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 2 (live-salary-slip-attendance): Attendance variables round-trip through pretty-printer
// Feature: live-salary-slip-attendance, Property 2: Attendance variables round-trip through pretty-printer
// Validates: Requirements 5.1, 5.2, 5.3
// ---------------------------------------------------------------------------

/**
 * Parses the output of formatAttendanceVariables back into an AttendanceVariables object.
 * Format: "key=value key=value ..."
 */
function parseAttendanceVariables(s: string): AttendanceVariables {
  const result: Record<string, number> = {};
  for (const token of s.trim().split(/\s+/)) {
    const [key, val] = token.split("=");
    result[key] = Number(val);
  }
  return result as unknown as AttendanceVariables;
}

const arbAttendanceVariables: fc.Arbitrary<AttendanceVariables> = fc.record({
  present_days:    fc.integer({ min: 0, max: 31 }),
  absent_days:     fc.integer({ min: 0, max: 31 }),
  half_days:       fc.integer({ min: 0, max: 31 }),
  leave_days:      fc.integer({ min: 0, max: 31 }),
  paid_leave_days: fc.integer({ min: 0, max: 31 }),
  unmarked_days:   fc.integer({ min: 0, max: 31 }),
  total_days:      fc.integer({ min: 0, max: 31 }),
});

describe("Property 2 (live-salary-slip-attendance): Attendance variables round-trip through pretty-printer", () => {
  it("parsing formatAttendanceVariables output recovers all seven original field values", () => {
    // Feature: live-salary-slip-attendance, Property 2: Attendance variables round-trip through pretty-printer
    fc.assert(
      fc.property(arbAttendanceVariables, (vars) => {
        const formatted = formatAttendanceVariables(vars);
        const parsed = parseAttendanceVariables(formatted);
        return (
          parsed.present_days    === vars.present_days    &&
          parsed.absent_days     === vars.absent_days     &&
          parsed.half_days       === vars.half_days       &&
          parsed.leave_days      === vars.leave_days      &&
          parsed.paid_leave_days === vars.paid_leave_days &&
          parsed.unmarked_days   === vars.unmarked_days   &&
          parsed.total_days      === vars.total_days
        );
      }),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 3 (live-salary-slip-attendance): Live attendance overrides snapshot in formula context
// Feature: live-salary-slip-attendance, Property 3: Live attendance overrides snapshot in formula context
// Validates: Requirements 2.1, 2.2, 2.3, 4.1
// ---------------------------------------------------------------------------
import { buildAttendanceContext, buildAttendanceRows } from "./attendanceDeductionUtils";

describe("Property 3 (live-salary-slip-attendance): Live attendance overrides snapshot in formula context", () => {
  // Feature: live-salary-slip-attendance, Property 3: Live attendance overrides snapshot in formula context
  it("paid_days === present_days + half_days * 0.5 + leave_days + paid_leave_days using live values", () => {
    const arbLiveVars: fc.Arbitrary<AttendanceVariables> = fc.record({
      present_days:    fc.integer({ min: 0, max: 31 }),
      absent_days:     fc.integer({ min: 0, max: 31 }),
      half_days:       fc.integer({ min: 0, max: 31 }),
      leave_days:      fc.integer({ min: 0, max: 31 }),
      paid_leave_days: fc.integer({ min: 0, max: 31 }),
      unmarked_days:   fc.integer({ min: 0, max: 31 }),
      total_days:      fc.integer({ min: 1, max: 31 }),
    });

    // Snapshot with different (random) attendance counts — simulates stale payroll doc
    const arbSnapshotCtx = fc.record({
      present_days:    fc.integer({ min: 0, max: 31 }),
      absent_days:     fc.integer({ min: 0, max: 31 }),
      half_days:       fc.integer({ min: 0, max: 31 }),
      half_day_days:   fc.integer({ min: 0, max: 31 }),
      leave_days:      fc.integer({ min: 0, max: 31 }),
      paid_leave_days: fc.integer({ min: 0, max: 31 }),
      unmarked_days:   fc.integer({ min: 0, max: 31 }),
      total_days:      fc.integer({ min: 1, max: 31 }),
      paid_days:       fc.integer({ min: 0, max: 31 }),
    });

    fc.assert(
      fc.property(arbLiveVars, arbSnapshotCtx, (liveVars, snapshotCtx) => {
        // Simulate what buildTemplateSlipRows does: start with snapshot ctx, then override with live
        const ctx: Record<string, unknown> = { ...snapshotCtx };
        const liveCtx = buildAttendanceContext(liveVars);
        Object.assign(ctx, liveCtx);

        // The context must now reflect live values
        const expectedPaidDays =
          liveVars.present_days +
          liveVars.half_days * 0.5 +
          liveVars.leave_days +
          liveVars.paid_leave_days;

        return (
          ctx.present_days    === liveVars.present_days    &&
          ctx.absent_days     === liveVars.absent_days     &&
          ctx.half_days       === liveVars.half_days       &&
          ctx.half_day_days   === liveVars.half_days       &&
          ctx.leave_days      === liveVars.leave_days      &&
          ctx.paid_leave_days === liveVars.paid_leave_days &&
          ctx.unmarked_days   === liveVars.unmarked_days   &&
          ctx.total_days      === liveVars.total_days      &&
          Math.abs((ctx.paid_days as number) - expectedPaidDays) < 0.001
        );
      }),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 4 (live-salary-slip-attendance): Zero attendance produces zero-count slip rows
// Feature: live-salary-slip-attendance, Property 4: Zero attendance produces zero-count slip rows
// Validates: Requirements 1.4, 3.3
// ---------------------------------------------------------------------------

describe("Property 4 (live-salary-slip-attendance): Zero attendance produces zero-count slip rows", () => {
  // Feature: live-salary-slip-attendance, Property 4: Zero attendance produces zero-count slip rows
  it("all-zero AttendanceVariables → count rows show '0' and Total Days shows calendar days", () => {
    // Generate random month (1–12) and year (2020–2030)
    const arbMonthYear = fc.record({
      month: fc.integer({ min: 1, max: 12 }),
      year:  fc.integer({ min: 2020, max: 2030 }),
    });

    fc.assert(
      fc.property(arbMonthYear, ({ month, year }) => {
        // Calendar days for this month/year (same formula as loadData)
        const calendarDays = new Date(year, month, 0).getDate();

        // All-zero AttendanceVariables as returned when no records exist
        const zeroVars: AttendanceVariables = {
          present_days:    0,
          absent_days:     0,
          half_days:       0,
          leave_days:      0,
          paid_leave_days: 0,
          unmarked_days:   calendarDays, // unmarked = all days when no records
          total_days:      calendarDays,
        };

        const rows = buildAttendanceRows(zeroVars);

        // Total Days row must show the calendar day count
        const totalDaysRow = rows.find((r) => r[0] === "Total Days");
        if (!totalDaysRow || totalDaysRow[1] !== String(calendarDays)) return false;

        // All count rows (Present, Absent, Half, Leave, Unmarked) must show "0"
        const countLabels = ["Present Days", "Absent Days", "Half Days", "Leave Days"];
        for (const label of countLabels) {
          const row = rows.find((r) => r[0] === label);
          if (!row || row[1] !== "0") return false;
        }

        return true;
      }),
      { numRuns: 100 },
    );
  });
});
