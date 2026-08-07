import { describe, it, expect } from 'vitest';
import {
  isEmployeeActiveOn,
  getEmployeeMonthActivity,
  parseStatusEffectiveDate,
} from './employeeStatus';

describe('parseStatusEffectiveDate', () => {
  it('parses ISO date strings without timezone shift', () => {
    const d = parseStatusEffectiveDate('2025-06-15');
    expect(d).not.toBeNull();
    expect(d!.getFullYear()).toBe(2025);
    expect(d!.getMonth()).toBe(5);
    expect(d!.getDate()).toBe(15);
  });

  it('returns null for empty values', () => {
    expect(parseStatusEffectiveDate('')).toBeNull();
    expect(parseStatusEffectiveDate(null)).toBeNull();
    expect(parseStatusEffectiveDate(undefined)).toBeNull();
  });
});

describe('isEmployeeActiveOn', () => {
  it('treats missing status as active', () => {
    expect(isEmployeeActiveOn({}, new Date(2025, 5, 10))).toBe(true);
  });

  it('inactive from effective date onward', () => {
    const emp = { status: 'inactive', statusEffectiveDate: '2025-06-15' };
    expect(isEmployeeActiveOn(emp, new Date(2025, 5, 14))).toBe(true);
    expect(isEmployeeActiveOn(emp, new Date(2025, 5, 15))).toBe(false);
    expect(isEmployeeActiveOn(emp, new Date(2025, 5, 20))).toBe(false);
  });

  it('active from effective date onward', () => {
    const emp = { status: 'active', statusEffectiveDate: '2025-06-15' };
    expect(isEmployeeActiveOn(emp, new Date(2025, 5, 14))).toBe(false);
    expect(isEmployeeActiveOn(emp, new Date(2025, 5, 15))).toBe(true);
  });

  it('inactive with no effective date is inactive everywhere', () => {
    const emp = { status: 'inactive' };
    expect(isEmployeeActiveOn(emp, new Date(2025, 0, 1))).toBe(false);
  });
});

describe('getEmployeeMonthActivity', () => {
  it('fully active for a normal employee', () => {
    const r = getEmployeeMonthActivity({}, 2025, 6);
    expect(r.includeInMonth).toBe(true);
    expect(r.fullyActive).toBe(true);
    expect(r.activeDays).toBe(30);
  });

  it('excludes an employee inactive for the whole month', () => {
    const emp = { status: 'inactive', statusEffectiveDate: '2025-05-01' };
    const r = getEmployeeMonthActivity(emp, 2025, 6);
    expect(r.includeInMonth).toBe(false);
    expect(r.fullyInactive).toBe(true);
    expect(r.activeDays).toBe(0);
  });

  it('marks partial month going inactive', () => {
    const emp = { status: 'inactive', statusEffectiveDate: '2025-06-15' };
    const r = getEmployeeMonthActivity(emp, 2025, 6);
    expect(r.includeInMonth).toBe(true);
    expect(r.fullyActive).toBe(false);
    expect(r.fullyInactive).toBe(false);
    expect(r.activeDays).toBe(14); // days 1..14 active
    expect(r.inactiveFrom?.getDate()).toBe(15);
    expect(r.label).toContain('Inactive from');
  });

  it('marks partial month going active', () => {
    const emp = { status: 'active', statusEffectiveDate: '2025-06-10' };
    const r = getEmployeeMonthActivity(emp, 2025, 6);
    expect(r.includeInMonth).toBe(true);
    expect(r.activeDays).toBe(21); // days 10..30 active
    expect(r.activeFrom?.getDate()).toBe(10);
    expect(r.label).toContain('Active from');
  });

  it('future inactivation keeps full active month', () => {
    const emp = { status: 'inactive', statusEffectiveDate: '2025-08-01' };
    const r = getEmployeeMonthActivity(emp, 2025, 6);
    expect(r.fullyActive).toBe(true);
    expect(r.includeInMonth).toBe(true);
  });
});
