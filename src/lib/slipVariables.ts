// ─── Salary Slip Variable Registry (DYNAMIC) ─────────────────────────────────
// The list of variables that can be placed on a salary slip template is NOT
// hardcoded anymore. Instead it is generated at runtime from the company's
// salary structure template(s) (see salaryTemplateService.ts), so the slip
// designer always stays in sync with the structure builder.
//
// On top of the structure-derived variables we append a small, fixed set of
// EXTRAS that only make sense on a slip and are not part of the salary
// structure: pay month/year (Pay Period) and company name/address
// (Company / Manager). Logo, stamp and signature remain separate slip
// ELEMENTS (not variables) and are resolved per-manager at print time.

import type { SalaryTemplate, TemplateSection } from "@/lib/salaryTemplateService";
import { FIXED_SECTIONS, stripRemovedFixedColumns } from "@/lib/salaryTemplateService";

export interface SlipVariable {
  key: string;
  label: string;
}

export interface SlipVariableGroup {
  group: string;
  vars: SlipVariable[];
}

// ─── Key aliases ──────────────────────────────────────────────────────────────
// A few structure column keys differ from the keys used by the slip value
// resolver (buildSlipVariableContext in SalarySlips.tsx). Map them here so the
// variables produced from the structure resolve to real values on the slip.
const KEY_ALIASES: Record<string, string> = {
  // Structure "name" → slip "employee_name"
  name: "employee_name",
};

function aliasKey(key: string): string {
  return KEY_ALIASES[key] ?? key;
}

// ─── Fixed extras (appended after structure-derived variables) ────────────────

const PAY_PERIOD_GROUP: SlipVariableGroup = {
  group: "Pay Period",
  vars: [
    { key: "pay_month",  label: "Pay Month" },
    { key: "pay_year",   label: "Pay Year" },
    { key: "pay_period", label: "Pay Period (e.g. JUN-2025)" },
  ],
};

const COMPANY_GROUP: SlipVariableGroup = {
  group: "Company / Manager",
  vars: [
    { key: "company_name",    label: "Company Name" },
    { key: "company_address", label: "Company Address" },
  ],
};

// ─── Builder ──────────────────────────────────────────────────────────────────

/**
 * Merge sections coming from one or more salary templates into a single ordered
 * list, grouping by section label and de-duplicating columns by key.
 */
function mergeSections(templates: SalaryTemplate[]): TemplateSection[] {
  const byLabel = new Map<string, TemplateSection>();

  for (const tmpl of templates) {
    const sections = stripRemovedFixedColumns(tmpl.sections ?? []);
    for (const sec of [...sections].sort((a, b) => a.order - b.order)) {
      const existing = byLabel.get(sec.label);
      if (!existing) {
        byLabel.set(sec.label, { ...sec, columns: [...sec.columns] });
        continue;
      }
      // Merge columns, skipping keys we've already seen in this group
      const seen = new Set(existing.columns.map((c) => c.key));
      for (const col of sec.columns) {
        if (!seen.has(col.key)) {
          existing.columns.push(col);
          seen.add(col.key);
        }
      }
    }
  }

  return [...byLabel.values()];
}

/**
 * Build the full list of slip variable groups from the given salary template(s),
 * followed by the fixed Pay Period and Company / Manager extras.
 *
 * When no template is available we still expose the fixed employee-info fields
 * (from FIXED_SECTIONS) plus the extras, so the designer is never empty.
 */
export function buildSlipVariableGroups(
  templates: SalaryTemplate | SalaryTemplate[] | null | undefined,
): SlipVariableGroup[] {
  const list = Array.isArray(templates)
    ? templates
    : templates
    ? [templates]
    : [];

  const sections =
    list.length > 0
      ? mergeSections(list)
      : stripRemovedFixedColumns(FIXED_SECTIONS);

  const groups: SlipVariableGroup[] = [];
  for (const sec of sections) {
    const vars: SlipVariable[] = [];
    const seen = new Set<string>();
    for (const col of [...sec.columns].sort((a, b) => a.order - b.order)) {
      const key = aliasKey(col.key);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      vars.push({ key, label: col.label });
    }
    if (vars.length > 0) groups.push({ group: sec.label, vars });
  }

  return [...groups, PAY_PERIOD_GROUP, COMPANY_GROUP];
}

/** Flat list of all variables for the given template(s). */
export function buildSlipVariables(
  templates: SalaryTemplate | SalaryTemplate[] | null | undefined,
): SlipVariable[] {
  return buildSlipVariableGroups(templates).flatMap((g) => g.vars);
}

/**
 * Resolve a variable key to its display label using the supplied groups.
 * Falls back to the raw key when the variable is unknown.
 */
export function getVariableLabel(
  key: string,
  groups: SlipVariableGroup[],
): string {
  for (const g of groups) {
    const found = g.vars.find((v) => v.key === key);
    if (found) return found.label;
  }
  return key;
}
