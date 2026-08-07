// Utilities for computing an employee's active/inactive status.
//
// Model (single current status + single effective date):
//   employee.status: 'active' | 'inactive'  (defaults to 'active' when missing)
//   employee.statusEffectiveDate: ISO date string 'YYYY-MM-DD' marking the day
//     from which the current status applies.
//
// Interpretation:
//   - status === 'inactive' with effective date D  -> the employee is ACTIVE
//     before D and INACTIVE on/after D (i.e. inactive from D onward).
//   - status === 'active' with effective date D     -> the employee is INACTIVE
//     before D and ACTIVE on/after D (i.e. active from D onward).
//   - no effective date -> the status applies to the whole timeline.

export type EmployeeStatusValue = 'active' | 'inactive';

export interface EmployeeStatusFields {
  status?: string | null;
  statusEffectiveDate?: unknown;
  // Allow arbitrary employee shapes.
  [key: string]: unknown;
}

// Parse a stored effective date into a local Date at midnight, or null.
export const parseStatusEffectiveDate = (value: unknown): Date | null => {
  if (value === null || value === undefined || value === '') return null;

  // Firestore Timestamp-like object.
  if (typeof value === 'object' && value !== null && 'seconds' in (value as any)) {
    const seconds = (value as any).seconds;
    if (typeof seconds === 'number') {
      const d = new Date(seconds * 1000);
      return new Date(d.getFullYear(), d.getMonth(), d.getDate());
    }
  }

  if (value instanceof Date) {
    return new Date(value.getFullYear(), value.getMonth(), value.getDate());
  }

  if (typeof value === 'number') {
    const d = new Date(value > 1e12 ? value : value * 1000);
    if (!Number.isNaN(d.getTime())) {
      return new Date(d.getFullYear(), d.getMonth(), d.getDate());
    }
    return null;
  }

  if (typeof value === 'string') {
    // Prefer strict YYYY-MM-DD parsing to avoid timezone shifts.
    const m = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) {
      return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    }
    const d = new Date(value);
    if (!Number.isNaN(d.getTime())) {
      return new Date(d.getFullYear(), d.getMonth(), d.getDate());
    }
  }

  return null;
};

const normalizeStatus = (status: unknown): EmployeeStatusValue =>
  String(status ?? 'active').toLowerCase() === 'inactive' ? 'inactive' : 'active';

const atMidnight = (date: Date): Date =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate());

/**
 * Returns true if the employee is active on the given calendar day.
 */
export const isEmployeeActiveOn = (
  employee: EmployeeStatusFields,
  date: Date,
): boolean => {
  const status = normalizeStatus(employee?.status);
  const eff = parseStatusEffectiveDate(employee?.statusEffectiveDate);
  const day = atMidnight(date);

  if (!eff) {
    return status !== 'inactive';
  }

  if (status === 'inactive') {
    // Inactive from the effective date onward.
    return day.getTime() < eff.getTime();
  }
  // Active from the effective date onward.
  return day.getTime() >= eff.getTime();
};

export interface EmployeeMonthActivity {
  // True if the employee is active on at least one day of the month and should
  // therefore appear in exports/reports for that month.
  includeInMonth: boolean;
  // Active on every day of the month.
  fullyActive: boolean;
  // Inactive on every day of the month.
  fullyInactive: boolean;
  activeDays: number;
  totalDays: number;
  // The day within the month from which the employee becomes inactive
  // (present only for a partial month that transitions active -> inactive).
  inactiveFrom?: Date;
  // The day within the month from which the employee becomes active
  // (present only for a partial month that transitions inactive -> active).
  activeFrom?: Date;
  // Human readable label describing a partial transition (empty when full).
  label?: string;
}

const formatDMY = (d: Date): string =>
  `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;

/**
 * Computes how an employee's status affects a whole calendar month.
 * @param year full year e.g. 2025
 * @param month 1-based month (1 = January ... 12 = December)
 */
export const getEmployeeMonthActivity = (
  employee: EmployeeStatusFields,
  year: number,
  month: number,
): EmployeeMonthActivity => {
  const totalDays = new Date(year, month, 0).getDate();
  const monthStart = new Date(year, month - 1, 1);
  const monthEnd = new Date(year, month - 1, totalDays);

  const status = normalizeStatus(employee?.status);
  const eff = parseStatusEffectiveDate(employee?.statusEffectiveDate);

  let activeDays = 0;
  let firstActive: Date | undefined;
  let firstInactive: Date | undefined;
  for (let d = 1; d <= totalDays; d++) {
    const day = new Date(year, month - 1, d);
    if (isEmployeeActiveOn(employee, day)) {
      activeDays++;
      if (!firstActive) firstActive = day;
    } else if (!firstInactive) {
      firstInactive = day;
    }
  }

  const fullyActive = activeDays === totalDays;
  const fullyInactive = activeDays === 0;
  const includeInMonth = activeDays > 0;

  const result: EmployeeMonthActivity = {
    includeInMonth,
    fullyActive,
    fullyInactive,
    activeDays,
    totalDays,
  };

  if (!fullyActive && !fullyInactive && eff) {
    // Partial month transition happens on the effective date.
    if (status === 'inactive') {
      result.inactiveFrom = eff;
      result.label = `Inactive from ${formatDMY(eff)}`;
    } else {
      result.activeFrom = eff;
      result.label = `Active from ${formatDMY(eff)}`;
    }
  } else if (fullyInactive) {
    result.label = 'Inactive';
  }

  // Keep unused vars referenced for clarity/lint.
  void monthStart;
  void monthEnd;

  return result;
};
