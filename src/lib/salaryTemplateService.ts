import {
  collection,
  doc,
  getDocs,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { AttendanceDeductionConfig } from "@/lib/attendanceDeductionUtils";
import { DEFAULT_DEDUCTION_CONFIG } from "@/lib/attendanceDeductionUtils";

// ─── Types ────────────────────────────────────────────────────────────────────

export type SectionType = "earnings" | "deductions" | "employer_contributions";

export interface ColumnFormula {
  /** e.g. "basic * 0.05" — uses column keys as variables */
  expression: string;
  /** human-readable description */
  description?: string;
}

/** Controls how this column appears on the salary slip PDF */
export interface ColumnSlipConfig {
  /** Whether this column should appear on the salary slip */
  includeInSlip: boolean;
  /** Which section of the slip it belongs to */
  slipSection: "earnings" | "deductions" | "details" | "none";
  /** Display label override on the slip (defaults to column label) */
  slipLabel?: string;
  /**
   * Mark this column as the NET SALARY value shown at the bottom of the slip.
   * Only one column should have this true. If none is marked, net = sum(earnings) - sum(deductions).
   */
  isNetSalary?: boolean;
  // Legacy — kept for backward compat but no longer shown in UI
  isSubtotal?: boolean;
  isEarningsTotal?: boolean;
  isDeductionsTotal?: boolean;
}

export interface TemplateColumn {
  id: string;
  label: string;
  key: string; // normalized snake_case key used in formula vars
  formula?: ColumnFormula;
  isFixed?: boolean; // fixed columns cannot be deleted
  order: number;
  /** Salary slip configuration — set when adding/editing a column */
  slipConfig?: ColumnSlipConfig;
}

export interface TemplateSection {
  id: string;
  label: string;
  type: SectionType | "custom";
  isFixed?: boolean; // fixed sections cannot be deleted
  columns: TemplateColumn[];
  order: number;
}

export interface SalaryTemplate {
  id: string;
  name: string;
  description?: string;
  companyId: string;
  /** null = global template (usable by all managers) */
  managerId: string | null;
  sections: TemplateSection[];
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
}

// ─── Fixed sections that always exist ────────────────────────────────────────

export const FIXED_SECTIONS: TemplateSection[] = [
  {
    id: "employee_info",
    label: "Employee Info & Basic",
    type: "custom",
    isFixed: true,
    order: 0,
    columns: [
      { id: "col_name", label: "Name", key: "name", isFixed: true, order: 0 },
      { id: "col_emp_id", label: "Employee ID", key: "employee_id", isFixed: true, order: 1 },
      { id: "col_esic", label: "ESIC No", key: "esic_no", isFixed: true, order: 2 },
      { id: "col_uan", label: "UAN", key: "uan", isFixed: true, order: 3 },
      { id: "col_basic", label: "Basic Salary", key: "basic", isFixed: true, order: 4 },
      { id: "col_da", label: "D.A.", key: "da", isFixed: true, order: 5 },
      { id: "col_paid_days", label: "Paid Days", key: "paid_days", isFixed: true, order: 6 },
    ],
  },
];

// ─── Service ──────────────────────────────────────────────────────────────────

export const salaryTemplateService = {
  /** Fetch all templates for a company (global + manager-specific) */
  async getAll(companyId: string): Promise<SalaryTemplate[]> {
    const q = query(
      collection(db, "salaryTemplates"),
      where("companyId", "==", companyId)
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() } as SalaryTemplate));
  },

  /** Fetch templates available for a specific manager (global + that manager's own) */
  async getForManager(companyId: string, managerId: string): Promise<SalaryTemplate[]> {
    const all = await this.getAll(companyId);
    return all.filter((t) => t.managerId === null || t.managerId === managerId);
  },

  /** Get a single template */
  async getById(templateId: string): Promise<SalaryTemplate | null> {
    const snap = await getDoc(doc(db, "salaryTemplates", templateId));
    if (!snap.exists()) return null;
    return { id: snap.id, ...snap.data() } as SalaryTemplate;
  },

  /** Create a new template */
  async create(
    companyId: string,
    createdBy: string,
    data: Omit<SalaryTemplate, "id" | "companyId" | "createdAt" | "updatedAt" | "createdBy">
  ): Promise<string> {
    const ref = doc(collection(db, "salaryTemplates"));
    await setDoc(ref, {
      ...data,
      companyId,
      createdBy,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    return ref.id;
  },

  /** Update an existing template */
  async update(templateId: string, data: Partial<Omit<SalaryTemplate, "id" | "companyId" | "createdAt" | "createdBy">>): Promise<void> {
    await updateDoc(doc(db, "salaryTemplates", templateId), {
      ...data,
      updatedAt: new Date(),
    });
  },

  /** Delete a template */
  async delete(templateId: string): Promise<void> {
    await deleteDoc(doc(db, "salaryTemplates", templateId));
  },

  /** Assign a template to a manager (stores templateId on manager doc) */
  async assignToManager(managerId: string, templateId: string | null): Promise<void> {
    await updateDoc(doc(db, "managers", managerId), {
      salaryTemplateId: templateId,
      updatedAt: new Date(),
    });
  },

  /** Get the template assigned to a manager */
  async getManagerTemplate(managerId: string, companyId: string): Promise<SalaryTemplate | null> {
    const managerSnap = await getDoc(doc(db, "managers", managerId));
    if (!managerSnap.exists()) return null;
    const templateId = managerSnap.data().salaryTemplateId;
    if (!templateId) return null;
    return this.getById(templateId);
  },

  /** Build a default template with standard sections */
  buildDefault(companyId: string, managerId: string | null, name: string, createdBy: string): Omit<SalaryTemplate, "id"> {
    return {
      name,
      description: "Default salary structure template",
      companyId,
      managerId,
      createdBy,
      createdAt: new Date(),
      updatedAt: new Date(),
      sections: [
        ...FIXED_SECTIONS,
        {
          id: "sec_earnings",
          label: "Earnings & Overtime",
          type: "earnings",
          isFixed: false,
          order: 1,
          columns: [
            { id: "col_hra", label: "HRA (5%)", key: "hra", formula: { expression: "(basic + da) * 0.05", description: "5% of Basic + DA" }, isFixed: false, order: 0, slipConfig: { includeInSlip: true, slipSection: "earnings", slipLabel: "H.R.A" } },
            { id: "col_gross_pm", label: "Gross Rate PM", key: "gross_rate_pm", formula: { expression: "basic + da + hra", description: "Basic + DA + HRA" }, isFixed: false, order: 1, slipConfig: { includeInSlip: false, slipSection: "none" } },
            { id: "col_gross_earning", label: "Gross Earning", key: "gross_earning", formula: { expression: "gross_rate_pm / total_days * paid_days", description: "Prorated gross" }, isFixed: false, order: 2, slipConfig: { includeInSlip: true, slipSection: "earnings", slipLabel: "Gross Earning", isSubtotal: false } },
            { id: "col_ot_rate", label: "OT Rate/Hour", key: "ot_rate", formula: { expression: "gross_earning / paid_days / 8", description: "Hourly OT rate" }, isFixed: false, order: 3, slipConfig: { includeInSlip: false, slipSection: "none" } },
            { id: "col_ot_amount", label: "OT Amount", key: "ot_amount", formula: { expression: "single_ot_hours * ot_rate + double_ot_hours * ot_rate * 2" }, isFixed: false, order: 4, slipConfig: { includeInSlip: true, slipSection: "earnings", slipLabel: "OT Amount" } },
            { id: "col_total_gross", label: "Total Gross", key: "total_gross", formula: { expression: "gross_earning + ot_amount + difference" }, isFixed: false, order: 5, slipConfig: { includeInSlip: true, slipSection: "earnings", slipLabel: "TOTAL GROSS EARNING", isSubtotal: true, isEarningsTotal: true } },
          ],
        },
        {
          id: "sec_deductions",
          label: "Deductions & Net Pay",
          type: "deductions",
          isFixed: false,
          order: 2,
          columns: [
            { id: "col_prof_tax", label: "Prof. Tax", key: "professional_tax", isFixed: false, order: 0, slipConfig: { includeInSlip: true, slipSection: "deductions", slipLabel: "PT" } },
            { id: "col_esic_emp", label: "ESIC (0.75%)", key: "esic_employee", formula: { expression: "total_gross * 0.0075" }, isFixed: false, order: 1, slipConfig: { includeInSlip: true, slipSection: "deductions", slipLabel: "ESIC" } },
            { id: "col_pf_base", label: "PF Base", key: "pf_base", formula: { expression: "(basic + da) / total_days * paid_days" }, isFixed: false, order: 2, slipConfig: { includeInSlip: false, slipSection: "none" } },
            { id: "col_pf_emp", label: "PF (12%)", key: "pf_employee", formula: { expression: "pf_base * 0.12" }, isFixed: false, order: 3, slipConfig: { includeInSlip: true, slipSection: "deductions", slipLabel: "EPF" } },
            { id: "col_total_ded", label: "Total Deduction", key: "total_deduction", formula: { expression: "professional_tax + esic_employee + pf_employee + advance" }, isFixed: false, order: 4, slipConfig: { includeInSlip: true, slipSection: "deductions", slipLabel: "Total", isSubtotal: true, isDeductionsTotal: true } },
            { id: "col_net", label: "Net Salary", key: "net_salary", formula: { expression: "total_gross - total_deduction" }, isFixed: false, order: 5, slipConfig: { includeInSlip: true, slipSection: "none", isNetSalary: true } },
          ],
        },
        {
          id: "sec_employer",
          label: "Employer Contributions & CTC",
          type: "employer_contributions",
          isFixed: false,
          order: 3,
          columns: [
            { id: "col_esic_er", label: "Employer ESIC (3.25%)", key: "esic_employer", formula: { expression: "total_gross * 0.0325" }, isFixed: false, order: 0, slipConfig: { includeInSlip: false, slipSection: "none" } },
            { id: "col_pf_er", label: "Employer PF (13%)", key: "pf_employer", formula: { expression: "pf_base * 0.13" }, isFixed: false, order: 1, slipConfig: { includeInSlip: false, slipSection: "none" } },
            { id: "col_mlwf", label: "MLWF", key: "mlwf_employer", isFixed: false, order: 2, slipConfig: { includeInSlip: true, slipSection: "deductions", slipLabel: "MLWF" } },
            { id: "col_ctc", label: "CTC Per Month", key: "ctc_per_month", formula: { expression: "total_gross + esic_employer + pf_employer + mlwf_employer" }, isFixed: false, order: 3, slipConfig: { includeInSlip: false, slipSection: "none" } },
          ],
        },
      ],
    };
  },
};

// ─── Formula evaluator (shared) ───────────────────────────────────────────────
// Supports: arithmetic, if(cond, then, else), nested ifs, multiple else-if,
//           string comparisons, and returns 0 when no condition matches and
//           no else branch is provided.

/**
 * Split top-level comma-separated args, respecting nested parens and strings.
 * e.g. "a > 0, if(b > 0, 1, 2), 3"  →  ["a > 0", "if(b > 0, 1, 2)", "3"]
 */
function splitArgs(s: string): string[] {
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
      inStr = true;
      strChar = ch;
      cur += ch;
    } else if (ch === "(") {
      depth++;
      cur += ch;
    } else if (ch === ")") {
      depth--;
      cur += ch;
    } else if (ch === "," && depth === 0) {
      parts.push(cur.trim());
      cur = "";
    } else {
      cur += ch;
    }
  }
  if (cur.trim()) parts.push(cur.trim());
  return parts;
}

/**
 * Find the matching closing parenthesis position starting just after the
 * opening '(' at `openPos` in the string `s`.
 * Returns the index of the ')' that closes it, or -1 if not found.
 */
function findClosingParen(s: string, openPos: number): number {
  let depth = 1;
  let inStr = false;
  let strChar = "";
  for (let i = openPos + 1; i < s.length; i++) {
    const ch = s[i];
    if (inStr) {
      if (ch === strChar && s[i - 1] !== "\\") inStr = false;
    } else if (ch === '"' || ch === "'") {
      inStr = true;
      strChar = ch;
    } else if (ch === "(") {
      depth++;
    } else if (ch === ")") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/**
 * Transform all if(...) calls in `expr` into JS ternaries, handling:
 *  - 3-arg form:  if(cond, thenVal, elseVal)  → ((cond) ? (thenVal) : (elseVal))
 *  - 2-arg form:  if(cond, thenVal)            → ((cond) ? (thenVal) : 0)
 *  - Recursion:   nested if() inside any arg works correctly
 *
 * Walks from innermost to outermost so nesting is always resolved before
 * the outer call is processed.
 */
function transformIf(expr: string): string {
  // Keep transforming until no more if( calls remain
  let result = expr;
  let safety = 0;
  while (/\bif\s*\(/i.test(result) && safety++ < 200) {
    // Find the LAST (innermost) occurrence of `if(` — this guarantees we
    // always process the deepest nested call first
    const ifMatch = [...result.matchAll(/\bif\s*\(/gi)].pop();
    if (!ifMatch || ifMatch.index === undefined) break;

    const openIdx = ifMatch.index + ifMatch[0].length - 1; // position of '('
    const closeIdx = findClosingParen(result, openIdx);
    if (closeIdx === -1) break; // unbalanced parens — give up

    const inner = result.slice(openIdx + 1, closeIdx);
    const args = splitArgs(inner);

    let ternary: string;
    if (args.length >= 3) {
      // if(cond, thenVal, elseVal)
      ternary = `((${args[0]}) ? (${args[1]}) : (${args[2]}))`;
    } else if (args.length === 2) {
      // if(cond, thenVal)  — no else → default 0
      ternary = `((${args[0]}) ? (${args[1]}) : 0)`;
    } else {
      // malformed — replace with 0
      ternary = "0";
    }

    result =
      result.slice(0, ifMatch.index) +
      ternary +
      result.slice(closeIdx + 1);
  }
  return result;
}

export function evaluateTemplateFormula(
  expr: string,
  ctx: Record<string, unknown>
): number | string {
  if (!expr.trim()) return 0;
  try {
    // Pre-process: convert Excel/common math functions to JS equivalents
    // ROUND(x, n) → Math.round(x * 10^n) / 10^n  — handled inline via __ROUND__
    // We inject Math helpers directly into the function scope instead
    const transformed = transformIf(expr.trim())
      // Excel-style math functions → JS Math equivalents (case-insensitive)
      .replace(/\bROUND\s*\(/gi, "Math.round(")
      .replace(/\bROUNDUP\s*\(/gi, "Math.ceil(")
      .replace(/\bROUNDDOWN\s*\(/gi, "Math.floor(")
      .replace(/\bCEIL\s*\(/gi, "Math.ceil(")
      .replace(/\bFLOOR\s*\(/gi, "Math.floor(")
      .replace(/\bABS\s*\(/gi, "Math.abs(")
      .replace(/\bMIN\s*\(/gi, "Math.min(")
      .replace(/\bMAX\s*\(/gi, "Math.max(")
      .replace(/\bSQRT\s*\(/gi, "Math.sqrt(")
      .replace(/\bPOW\s*\(/gi, "Math.pow(")
      .replace(/\bINT\s*\(/gi, "Math.trunc(")
      .replace(/\bTRUNC\s*\(/gi, "Math.trunc(");

    // ROUND(x, n) in Excel takes 2 args: value and decimal places.
    // Math.round only takes 1. We need to keep ROUND(x, n) working.
    // Replace Math.round(x, n) → our __round__(x, n) helper
    const finalExpr = transformed.replace(/Math\.round\s*\(/g, "__round__(");

    const keys = Object.keys(ctx);

    // First pass: use original values (strings stay strings for comparisons like
    // employee_type == "labor")
    const valsOriginal = keys.map((k) => ctx[k]);

    // __round__(value, decimals) helper — matches Excel ROUND behaviour
    const __round__ = (v: unknown, dec: unknown) => {
      const n = Number(v);
      const d = Number(dec ?? 0);
      if (!isFinite(n)) return 0;
      const factor = Math.pow(10, d);
      return Math.round(n * factor) / factor;
    };

    // eslint-disable-next-line no-new-func
    const fn = new Function("__round__", ...keys, `"use strict"; return (${finalExpr});`);
    const result = fn(__round__, ...valsOriginal);

    if (result === null || result === undefined) return 0;
    if (typeof result === "string") return result;
    if (typeof result === "number" && isFinite(result)) {
      return Math.round(result * 100) / 100;
    }

    // Result is NaN or Infinity — likely a string variable used in arithmetic
    // (e.g. employee_type="labor" in "basic + hra + employee_type").
    // Retry with non-numeric strings coerced to 0.
    const valsNumeric = keys.map((k) => {
      const v = ctx[k];
      if (typeof v === "string") {
        const n = Number(v);
        return Number.isFinite(n) ? n : 0;
      }
      return v;
    });
    const result2 = fn(__round__, ...valsNumeric);
    if (result2 === null || result2 === undefined) return 0;
    if (typeof result2 === "string") return result2;
    if (typeof result2 === "number") return isFinite(result2) ? Math.round(result2 * 100) / 100 : 0;
    return result2;
  } catch {
    return 0;
  }
}
