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
// Supports: arithmetic, if(cond, then, else), nested ifs, string comparisons

function splitArgs(s: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let cur = "";
  for (const ch of s) {
    if (ch === "(") depth++;
    else if (ch === ")") depth--;
    else if (ch === "," && depth === 0) {
      parts.push(cur.trim());
      cur = "";
      continue;
    }
    cur += ch;
  }
  if (cur.trim()) parts.push(cur.trim());
  return parts;
}

export function evaluateTemplateFormula(
  expr: string,
  ctx: Record<string, unknown>
): number | string {
  if (!expr.trim()) return 0;
  try {
    const transformed = expr.replace(/\bif\s*\(/gi, "__if__(").replace(
      /__if__\(([^)]+)\)/g,
      (_, inner) => {
        const parts = splitArgs(inner);
        if (parts.length !== 3) return "0";
        return `((${parts[0]}) ? (${parts[1]}) : (${parts[2]}))`;
      }
    );
    const keys = Object.keys(ctx);

    // First pass: use original values (strings stay strings for if() comparisons)
    const valsOriginal = keys.map((k) => ctx[k]);
    // eslint-disable-next-line no-new-func
    const fn = new Function(...keys, `"use strict"; return (${transformed});`);
    const result = fn(...valsOriginal);

    if (result === null || result === undefined) return 0;
    if (typeof result === "string") return result;
    if (typeof result === "number" && isFinite(result)) {
      return Math.round(result * 100) / 100;
    }

    // Result is NaN or Infinity — likely caused by a string variable used in arithmetic
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
    const result2 = fn(...valsNumeric);
    if (result2 === null || result2 === undefined) return 0;
    if (typeof result2 === "number") return isFinite(result2) ? Math.round(result2 * 100) / 100 : 0;
    return result2;
  } catch {
    return 0;
  }
}
