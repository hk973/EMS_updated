// ─── Salary Slip Variable Registry ───────────────────────────────────────────
// Central list of all variables that can be placed on a salary slip template.
// Used by ElementPanel (variable picker) and PropertiesPanel (variableKey dropdown).

export interface SlipVariable {
  key: string;
  label: string;
}

export interface SlipVariableGroup {
  group: string;
  vars: SlipVariable[];
}

export const SLIP_VARIABLE_GROUPS: SlipVariableGroup[] = [
  {
    group: "Employee Info",
    vars: [
      { key: "employee_name",  label: "Employee Name" },
      { key: "employee_id",    label: "Employee ID" },
      { key: "designation",    label: "Designation" },
      { key: "department",     label: "Department" },
      { key: "father_name",    label: "Father's Name" },
      { key: "dob",            label: "Date of Birth" },
      { key: "joining_date",   label: "Date of Joining" },
      { key: "esic_no",        label: "ESIC No." },
      { key: "uan",            label: "UAN No." },
      { key: "epf_no",         label: "EPF No." },
      { key: "bank_account",   label: "Bank Account" },
      { key: "ifsc_code",      label: "IFSC Code" },
      { key: "hq_location",    label: "HQ Location" },
    ],
  },
  {
    group: "Pay Period",
    vars: [
      { key: "pay_month",       label: "Pay Month" },
      { key: "pay_year",        label: "Pay Year" },
      { key: "pay_period",      label: "Pay Period (e.g. JUN-2025)" },
      { key: "total_days",      label: "Total Days" },
      { key: "paid_days",       label: "Paid Days" },
      { key: "present_days",    label: "Present Days" },
      { key: "absent_days",     label: "Absent Days" },
      { key: "half_days",       label: "Half Days" },
      { key: "leave_days",      label: "Leave Days" },
      { key: "paid_leave_days", label: "Paid Leave Days" },
      { key: "unmarked_days",   label: "Unmarked Days" },
    ],
  },
  {
    group: "Earnings",
    vars: [
      { key: "basic",           label: "Basic Salary" },
      { key: "da",              label: "Dearness Allowance (DA)" },
      { key: "hra",             label: "HRA" },
      { key: "gross_rate_pm",   label: "Gross Rate PM" },
      { key: "gross_earning",   label: "Gross Earning" },
      { key: "ot_rate",         label: "OT Rate / Hour" },
      { key: "single_ot_hours", label: "Single OT Hours" },
      { key: "double_ot_hours", label: "Double OT Hours" },
      { key: "ot_amount",       label: "OT Amount" },
      { key: "difference",      label: "Difference / Adjustment" },
      { key: "total_gross",     label: "Total Gross Earning" },
    ],
  },
  {
    group: "Deductions",
    vars: [
      { key: "professional_tax", label: "Professional Tax (PT)" },
      { key: "esic_employee",    label: "ESIC (Employee)" },
      { key: "pf_base",          label: "PF Base" },
      { key: "pf_employee",      label: "PF / EPF (Employee 12%)" },
      { key: "advance",          label: "Advance Deduction" },
      { key: "mlwf_employer",    label: "MLWF" },
      { key: "total_deduction",  label: "Total Deduction" },
    ],
  },
  {
    group: "Employer Contributions",
    vars: [
      { key: "esic_employer",  label: "ESIC (Employer 3.25%)" },
      { key: "pf_employer",    label: "PF (Employer 13%)" },
      { key: "ctc_per_month",  label: "CTC Per Month" },
    ],
  },
  {
    group: "Company / Manager",
    vars: [
      { key: "company_name",    label: "Company Name" },
      { key: "company_address", label: "Company Address" },
    ],
  },
];

/** Flat list of all variables — for quick lookup */
export const ALL_SLIP_VARIABLES: SlipVariable[] = SLIP_VARIABLE_GROUPS.flatMap(
  (g) => g.vars
);

/** Resolve a variable key to its display label */
export function getVariableLabel(key: string): string {
  return ALL_SLIP_VARIABLES.find((v) => v.key === key)?.label ?? key;
}
