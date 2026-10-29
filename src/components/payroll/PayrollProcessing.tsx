/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import React, { useState, useEffect } from "react";
import { doc, FieldValue, getDoc } from "firebase/firestore";
import {
  Box,
  Paper,
  Typography,
  Button,
  Alert,
  CircularProgress,
  Grid,
  Card,
  CardContent,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
} from "@mui/material";
import { AttachMoney, Receipt, TrendingUp, Warning } from "@mui/icons-material";
import {
  collection,
  getDocs,
  addDoc,
  query,
  where,
  updateDoc,
  deleteDoc,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Employee, Payroll } from "@/types";
import { useAuth } from "@/contexts/AuthContext";
import { getEmployeeMonthActivity } from "@/lib/employeeStatus";
import { computeAttendanceVariables } from "@/lib/attendanceDeductionUtils";
import {
  slipTemplateService,
  serializeElements,
  stripUndefined,
} from "@/lib/slipTemplateService";
import type { SlipTemplate } from "@/lib/slipTemplateService";

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

export default function PayrollProcessing() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [managersById, setManagersById] = useState<
    Record<string, Record<string, unknown>>
  >({});
  const [selectedManager, setSelectedManager] = useState("");
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [reverting, setReverting] = useState(false);
  const [updatingStatusId, setUpdatingStatusId] = useState("");
  const [bulkUpdating, setBulkUpdating] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [existingPayroll, setExistingPayroll] = useState<Payroll[]>([]);
  const [slipTemplates, setSlipTemplates] = useState<SlipTemplate[]>([]);
  // live attendance statuses per employee.id for the selected month/year
  const [liveAttendanceByEmp, setLiveAttendanceByEmp] = useState<Record<string, string[]>>({});
  const { currentUser } = useAuth();

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

  // Salary structure config state
  const [salaryConfig, setSalaryConfig] = useState<any>(null);
  // Load salary structure config for current company
  useEffect(() => {
    const loadSalaryConfig = async () => {
      if (!currentUser) return;

      // Use uid for admin, companyId for manager/employee
      const companyId =
        currentUser.role === "admin" ? currentUser.uid : currentUser.companyId;
      if (!companyId) return;

      try {
        const configRef = doc(db, "salaryStructures", companyId);
        const snapshot = await getDoc(configRef);
        if (snapshot.exists()) {
          setSalaryConfig(snapshot.data());
        } else {
          // If config doesn't exist, use default values
          console.log("Salary config not found, using defaults");
          setSalaryConfig({
            hraPercentage: 5,
            esicEmployeePercentage: 0.75,
            esicEmployerPercentage: 3.25,
            pfEmployeePercentage: 12,
            pfEmployerPercentage: 13,
            mlwfEmployerAmount: 1,
            standardWorkingDays: 30,
          });
        }
      } catch (e) {
        console.error("Failed to load salary structure config", e);
        // Set default config on error
        setSalaryConfig({
          hraPercentage: 5,
          esicEmployeePercentage: 0.75,
          esicEmployerPercentage: 3.25,
          pfEmployeePercentage: 12,
          pfEmployerPercentage: 13,
          mlwfEmployerAmount: 1,
          standardWorkingDays: 30,
        });
      }
    };
    loadSalaryConfig();
  }, [currentUser]);

  useEffect(() => {
    fetchEmployees();
  }, []);

  // Load slip templates (canvas designs) for the current company. These drive
  // the downloaded slip format and are required (per manager) to proceed payroll.
  useEffect(() => {
    const loadSlipTemplates = async () => {
      if (!currentUser) return;
      const companyId =
        currentUser.role === "admin" ? currentUser.uid : currentUser.companyId;
      if (!companyId) return;
      try {
        const templates = await slipTemplateService.getAll(companyId);
        setSlipTemplates(templates);
      } catch (e) {
        console.error("Failed to load slip templates", e);
      }
    };
    void loadSlipTemplates();
  }, [currentUser]);

  useEffect(() => {
    if (employees.length > 0) {
      checkExistingPayroll();
    }
  }, [selectedMonth, selectedYear, employees]);

  useEffect(() => {
    const loadManagers = async () => {
      const uniqueManagerIds = Array.from(
        new Set(
          employees.flatMap((emp) =>
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

      // There is no "All Managers" option anymore, so default to the first
      // available manager whenever none is selected (or the selected one is gone).
      setSelectedManager((prev) =>
        prev && uniqueManagerIds.includes(prev)
          ? prev
          : uniqueManagerIds[0] ?? "",
      );
    };

    if (employees.length > 0) {
      void loadManagers();
    }
  }, [employees]);

  const fetchEmployees = async () => {
    try {
      setLoading(true);
      // Scope to the current company so orphaned/deleted-manager employees don't appear
      const companyId =
        currentUser?.role === "admin"
          ? currentUser?.uid
          : currentUser?.companyId || "";
      const employeesQuery = companyId
        ? query(
            collection(db, "employees"),
            where("companyId", "==", companyId),
          )
        : query(collection(db, "employees"));
      const snapshot = await getDocs(employeesQuery);
      const employeesData = snapshot.docs
        .map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }))
        .sort((a, b) =>
          ((a as Employee).fullName || "").localeCompare(
            (b as Employee).fullName || "",
          ),
        ) as Employee[];
      setEmployees(employeesData);
    } catch (err) {
      console.error("Error fetching employees:", err);
      setError("Failed to load employees");
    } finally {
      setLoading(false);
    }
  };

  const checkExistingPayroll = async () => {
    try {
      const payrollQuery = query(
        collection(db, "payroll"),
        where("month", "==", selectedMonth),
        where("year", "==", selectedYear),
      );
      const snapshot = await getDocs(payrollQuery);
      const payrollData = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as any[];
      setExistingPayroll(payrollData);

      // Fetch live attendance for the same period so the table shows real-time values
      const companyId =
        currentUser?.role === "admin"
          ? currentUser?.uid
          : currentUser?.companyId || "";
      if (companyId) {
        const attSnapshot = await getDocs(
          query(
            collection(db, "attendance"),
            where("companyId", "==", companyId),
            where("month", "==", selectedMonth),
            where("year", "==", selectedYear),
          ),
        );
        const byEmp: Record<string, string[]> = {};
        for (const attDoc of attSnapshot.docs) {
          const att = attDoc.data() as { employeeId?: string; status?: string };
          if (!att.employeeId || !att.status) continue;
          if (!byEmp[att.employeeId]) byEmp[att.employeeId] = [];
          byEmp[att.employeeId].push(att.status);
        }
        setLiveAttendanceByEmp(byEmp);
      }
    } catch (err) {
      console.error("Error checking existing payroll:", err);
    }
  };

  const calculateTax = (grossSalary: number, taxRegime: "old" | "new") => {
    // Simplified tax calculation - in real implementation, use proper tax slabs
    if (taxRegime === "new") {
      if (grossSalary <= 300000) return 0;
      if (grossSalary <= 600000) return (grossSalary - 300000) * 0.05;
      if (grossSalary <= 900000) return 15000 + (grossSalary - 600000) * 0.1;
      if (grossSalary <= 1200000) return 45000 + (grossSalary - 900000) * 0.15;
      if (grossSalary <= 1500000) return 90000 + (grossSalary - 1200000) * 0.2;
      return 150000 + (grossSalary - 1500000) * 0.3;
    } else {
      // Old tax regime calculation
      if (grossSalary <= 250000) return 0;
      if (grossSalary <= 500000) return (grossSalary - 250000) * 0.05;
      if (grossSalary <= 1000000) return 12500 + (grossSalary - 500000) * 0.2;
      return 112500 + (grossSalary - 1000000) * 0.3;
    }
  };

  // Salary calculation helpers (copied from SalaryStructures.tsx)
  const calculateHRA = (
    basic: number,
    da: number,
    hraPercentage: number = 5,
  ): number => {
    return Math.round((basic + da) * (hraPercentage / 100));
  };
  const calculateGrossRate = (basic: number, da: number, hra: number): number =>
    basic + da + hra;
  const calculateGrossEarning = (
    grossRate: number,
    totalDays: number,
    paidDays: number,
  ): number => Math.round((grossRate / totalDays) * paidDays);
  const calculateOTRate = (grossEarning: number, paidDays: number): number =>
    grossEarning / paidDays / 8;
  const calculateOTAmount = (
    otRate: number,
    singleOTHours: number,
    doubleOTHours: number,
  ): number => Math.round(singleOTHours * otRate + doubleOTHours * otRate * 2);
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
  ): number => Math.round(((basic + da) / totalDays) * paidDays);
  const calculatePFEmployee = (
    pfBase: number,
    percentage: number = 12,
  ): number => Math.round(pfBase * (percentage / 100));
  const calculateESICEmployer = (
    totalGross: number,
    percentage: number = 3.25,
  ): number => Math.ceil(totalGross * (percentage / 100));
  const calculatePFEmployer = (
    pfBase: number,
    percentage: number = 13,
  ): number => Math.round(pfBase * (percentage / 100));
  const calculateMLWFEmployer = (
    totalGross: number,
    mlwfAmount: number = 1,
  ): number => mlwfAmount;

  // Resolve the primary assigned manager id for an employee.
  const getManagerIdForEmployee = (employee: Employee): string => {
    const ids = normalizeManagerIds(
      employee.assignedManagers,
      (employee as unknown as { assignedManager?: unknown }).assignedManager,
    );
    return ids[0] ?? "";
  };

  // Human-readable manager name for error messages.
  const getManagerName = (managerId: string): string => {
    const mgr = managersById[managerId];
    const name =
      (mgr?.fullName as string) || (mgr?.name as string) || "";
    return name || managerId || "Unassigned";
  };

  // The manager-scoped slip template for a manager (per-manager templates only).
  const getSlipTemplateForManager = (
    managerId: string,
  ): SlipTemplate | null => {
    if (!managerId) return null;
    return (
      slipTemplates.find(
        (t) => t.scope === "manager" && t.managerId === managerId,
      ) ?? null
    );
  };

  const processPayroll = async () => {
    try {
      setProcessing(true);
      setError("");
      setSuccess("");

      // salaryConfig will now always have default values if not loaded from Firebase
      const config = salaryConfig || {
        hraPercentage: 5,
        esicEmployeePercentage: 0.75,
        esicEmployerPercentage: 3.25,
        pfEmployeePercentage: 12,
        pfEmployerPercentage: 13,
        mlwfEmployerAmount: 1,
        standardWorkingDays: 30,
      };

      // Only process employees who don't already have a payroll record this month
      const alreadyProcessedIds = new Set(
        existingPayroll.map((p) => p.employeeId)
      );
      const employeesToProcess = employees.filter((emp) => {
        if (
          alreadyProcessedIds.has(emp.employeeId) ||
          alreadyProcessedIds.has(emp.id)
        ) {
          return false;
        }

        // Only process employees who are active at some point during the selected month/year
        const activity = getEmployeeMonthActivity(emp, selectedYear, selectedMonth);
        if (!activity.includeInMonth) {
          return false;
        }

        // When a specific manager is selected, only process that manager's
        // employees so payroll can be proceeded manager-wise.
        if (selectedManager) {
          return normalizeManagerIds(
            emp.assignedManagers,
            (emp as unknown as { assignedManager?: unknown }).assignedManager,
          ).includes(selectedManager);
        }
        return true;
      });

      if (employeesToProcess.length === 0) {
        setError(
          selectedManager
            ? "All of this manager's employees already have payroll processed for this month."
            : "All employees already have payroll processed for this month.",
        );
        setProcessing(false);
        return;
      }

      // ── Require a per-manager slip template before proceeding ─────────────
      // Every employee being processed must have an assigned manager, and that
      // manager must have their own (manager-scoped) slip template. Otherwise the
      // downloaded slip would fall back to a generic layout, so we block here.
      const missingTemplateManagers = new Set<string>();
      const employeesWithoutManager: string[] = [];
      for (const employee of employeesToProcess) {
        const managerId = getManagerIdForEmployee(employee);
        if (!managerId) {
          employeesWithoutManager.push(
            employee.fullName || employee.employeeId || employee.id || "Unknown",
          );
          continue;
        }
        if (!getSlipTemplateForManager(managerId)) {
          missingTemplateManagers.add(getManagerName(managerId));
        }
      }

      if (missingTemplateManagers.size > 0 || employeesWithoutManager.length > 0) {
        const messages: string[] = [];
        if (missingTemplateManagers.size > 0) {
          messages.push(
            `No slip template for manager(s): ${Array.from(
              missingTemplateManagers,
            ).join(", ")}. Please create a slip template for them before proceeding.`,
          );
        }
        if (employeesWithoutManager.length > 0) {
          messages.push(
            `No manager assigned for: ${employeesWithoutManager.join(", ")}.`,
          );
        }
        setError(messages.join(" "));
        setProcessing(false);
        return;
      }

      // ── Fetch attendance for the selected month/year ──────────────────────
      // total_days = actual days in that calendar month
      const daysInMonth = new Date(selectedYear, selectedMonth, 0).getDate();

      const companyId =
        currentUser?.role === "admin"
          ? currentUser?.uid
          : currentUser?.companyId || "";

      const attendanceSnapshot = await getDocs(
        query(
          collection(db, "attendance"),
          where("companyId", "==", companyId),
          where("month", "==", selectedMonth),
          where("year", "==", selectedYear),
        ),
      );

      // Group attendance statuses by employeeId
      const attendanceStatusesByEmp: Record<string, string[]> = {};
      for (const attDoc of attendanceSnapshot.docs) {
        const att = attDoc.data() as { employeeId?: string; status?: string };
        if (!att.employeeId || !att.status) continue;
        if (!attendanceStatusesByEmp[att.employeeId]) {
          attendanceStatusesByEmp[att.employeeId] = [];
        }
        attendanceStatusesByEmp[att.employeeId].push(att.status);
      }

      // Key used to look up the per-month salary data (e.g. "2025-7").
      // SalaryStructures stores each month's uploaded data under
      // employee.salaryByMonth["<year>-<month>"] (month is 1-12), so payroll
      // should use the SELECTED month's values (basic, DA, OT hours, %, etc.)
      // rather than the single global salary record. Fall back to the global
      // salary when a month has no saved data yet.
      const monthlyKey = `${selectedYear}-${selectedMonth}`;

      const payrollRecords = employeesToProcess.map((employee) => {
        const activity = getEmployeeMonthActivity(
          employee,
          selectedYear,
          selectedMonth,
        );
        const byMonth = (
          employee as unknown as {
            salaryByMonth?: Record<string, Record<string, unknown>>;
          }
        ).salaryByMonth;
        const monthlySalary = byMonth?.[monthlyKey];
        const salary =
          monthlySalary && Object.keys(monthlySalary).length > 0
            ? (monthlySalary as typeof employee.salary)
            : employee.salary || {};
        // Snapshot the manager's slip template so the downloaded slip keeps this
        // exact format even if the template is edited/deleted later — until the
        // payroll is reverted (which removes the record and its snapshot).
        const managerId = getManagerIdForEmployee(employee);
        const rawSlipTemplate = getSlipTemplateForManager(managerId);
        // Firestore rejects nested arrays (table rows are TableCell[][]) and
        // undefined values, so serialize the embedded template snapshot the
        // same way the slipTemplates collection is stored. SalarySlips unwraps
        // it back via slipTemplateService.deserialize when reading.
        const slipTemplateSnapshot = rawSlipTemplate
          ? {
              ...rawSlipTemplate,
              elements: serializeElements(rawSlipTemplate.elements ?? []),
            }
          : null;
        const basic = Number(salary.basic ?? salary.base ?? 0);
        const da = Number(salary.da ?? 0);

        // ── Attendance variables ──────────────────────────────────────────────
        // attendance docs may store either the Firestore doc ID or the employeeId string — try both
        const statuses =
          attendanceStatusesByEmp[employee.id ?? ""] ??
          attendanceStatusesByEmp[employee.employeeId ?? ""] ??
          [];
        const attVars = computeAttendanceVariables(statuses, daysInMonth);

        // present_days counts present + half-day*0.5 + leave (paid)
        // absent_days = absent + unmarked (both treated as absent for salary)
        const effectiveAbsent = attVars.absent_days + attVars.unmarked_days;
        let paidDays =
          daysInMonth - effectiveAbsent - attVars.half_days * 0.5;

        // Cap paidDays by employee active days in the month (pro-rating for partial status)
        if (paidDays > activity.activeDays) {
          paidDays = activity.activeDays;
        }

        const totalDays = daysInMonth;

        // Calculate salary components
        const hraPercentage = Number(
          salary.hraPercentage ?? config.hraPercentage ?? 5,
        );
        const hra = calculateHRA(basic, da, hraPercentage);
        const grossRatePM = calculateGrossRate(basic, da, hra);
        const grossEarning = calculateGrossEarning(
          grossRatePM,
          totalDays,
          paidDays,
        );
        const otRate = paidDays > 0 ? calculateOTRate(grossEarning, paidDays) : 0;
        const singleOTHours = Number(salary.singleOTHours ?? 0);
        const doubleOTHours = Number(salary.doubleOTHours ?? 0);
        const otAmount = calculateOTAmount(
          otRate,
          singleOTHours,
          doubleOTHours,
        );
        const calculatedTotalGross = grossEarning + otAmount;
        const professionalTax = calculateProfessionalTax(calculatedTotalGross);
        const esicEmployeePercentage = Number(
          salary.esicEmployeePercentage ??
            config.esicEmployeePercentage ??
            0.75,
        );
        const esicEmployee = calculateESICEmployee(
          calculatedTotalGross,
          esicEmployeePercentage,
        );
        const pfBase = calculatePFBase(basic, da, totalDays, paidDays);
        const pfEmployeePercentage = Number(
          salary.pfEmployeePercentage ?? config.pfEmployeePercentage ?? 12,
        );
        const pfEmployee = calculatePFEmployee(pfBase, pfEmployeePercentage);
        const calculatedTotalDeduction =
          professionalTax + esicEmployee + pfEmployee;
        const calculatedNetSalary =
          calculatedTotalGross - calculatedTotalDeduction;
        const taxRegime = salary.taxRegime || "old";
        const calculatedTaxAmount = calculateTax(
          calculatedTotalGross,
          taxRegime,
        );

        // Use pre-calculated values from Salary Structure if available, otherwise use calculated values
        // Pre-calculated values are saved when salary is configured in Salary Structures tab
        const grossSalary =
          Number((employee as any).grossSalary) || calculatedTotalGross;
        const taxAmount =
          Number((employee as any).taxAmount) || calculatedTaxAmount;
        const netSalary =
          Number((employee as any).netSalary) || calculatedNetSalary;
        const totalDeduction = calculatedTotalDeduction;

        const esicEmployerPercentage = Number(
          salary.esicEmployerPercentage ??
            config.esicEmployerPercentage ??
            3.25,
        );
        const esicEmployer = calculateESICEmployer(
          grossSalary,
          esicEmployerPercentage,
        );
        const pfEmployerPercentage = Number(
          salary.pfEmployerPercentage ?? config.pfEmployerPercentage ?? 13,
        );
        const pfEmployer = calculatePFEmployer(pfBase, pfEmployerPercentage);
        const mlwfEmployerAmount = Number(
          salary.mlwfEmployerAmount ?? config.mlwfEmployerAmount ?? 1,
        );
        const mlwfEmployer = calculateMLWFEmployer(
          grossSalary,
          mlwfEmployerAmount,
        );
        const ctcPerMonth =
          grossSalary + esicEmployer + pfEmployer + mlwfEmployer;

        return {
          employeeId: employee.employeeId,
          month: selectedMonth,
          year: selectedYear,
          baseSalary: basic,
          hra,
          ta: 0,
          da,
          totalBonus: 0,
          totalDeduction,
          grossSalary,
          netSalary,
          taxAmount,
          status: "pending" as const,
          processedBy: currentUser?.uid || "",
          processedAt: new Date(),
          // Additional fields for reference
          grossRatePM,
          totalDays,
          paidDays,
          otRate,
          singleOTHours,
          doubleOTHours,
          otAmount,
          professionalTax,
          esicEmployee,
          pfBase,
          pfEmployee,
          esicEmployer,
          pfEmployer,
          mlwfEmployer,
          ctcPerMonth,
          // Attendance breakdown for formula context
          presentDays: attVars.present_days,
          absentDays: attVars.absent_days,
          halfDayDays: attVars.half_days,
          leaveDays: attVars.leave_days,
          paidLeaveDays: attVars.paid_leave_days,
          workingHolidayDays: attVars.working_holiday_days,
          unmarkedDays: attVars.unmarked_days,
          // Manager + slip-template snapshot (kept until the payroll is reverted)
          managerId,
          slipTemplateSnapshot: slipTemplateSnapshot ?? null,
          // Activity status label (e.g. "Inactive from 15/06/2025")
          activityLabel: activity.label ?? null,
        };
      });

      // Save payroll records (strip any nested undefined values Firestore rejects)
      for (const record of payrollRecords) {
        await addDoc(collection(db, "payroll"), stripUndefined(record));
      }

      setSuccess("Payroll processed successfully!");
      await checkExistingPayroll();
    } catch (err) {
      console.error("Error processing payroll:", err);
      const detail = err instanceof Error ? `: ${err.message}` : "";
      setError(`Failed to process payroll${detail}`);
    } finally {
      setProcessing(false);
    }
  };

  const revertPayroll = async () => {
    try {
      setReverting(true);
      setError("");
      setSuccess("");

      // Only revert records that belong to an employee of the current company
      // (existingPayroll is fetched by month/year only, so guard against other companies).
      const recordsToRevert = existingPayroll.filter((payroll) =>
        Boolean(getEmployeeForPayroll(payroll)),
      );

      if (recordsToRevert.length === 0) {
        setError("No processed payroll found to revert for this month.");
        setReverting(false);
        return;
      }

      for (const payroll of recordsToRevert) {
        await deleteDoc(doc(db, "payroll", payroll.id));
      }

      setSuccess(
        `Reverted payroll for ${months[selectedMonth - 1].label} ${selectedYear} (${recordsToRevert.length} record(s) removed).`,
      );
      await checkExistingPayroll();
    } catch (err) {
      console.error("Error reverting payroll:", err);
      setError("Failed to revert payroll");
    } finally {
      setReverting(false);
    }
  };

  const updatePayrollStatus = async (
    payrollDocId: string,
    nextStatus: Payroll["status"],
  ) => {
    try {
      setUpdatingStatusId(payrollDocId);
      setError("");
      setSuccess("");

      const updatePayload: Record<string, FieldValue | Partial<unknown> | undefined> = {
        status: nextStatus,
      };

      if (nextStatus === "paid") {
        updatePayload.paidAt = new Date();
      }

      await updateDoc(doc(db, "payroll", payrollDocId), updatePayload);
      setSuccess(`Payroll status updated to ${nextStatus}.`);
      await checkExistingPayroll();
    } catch (err) {
      console.error("Error updating payroll status:", err);
      setError("Failed to update payroll status");
    } finally {
      setUpdatingStatusId("");
    }
  };

  const getEmployeeForPayroll = (payroll: Payroll) =>
    employees.find(
      (emp) =>
        emp.id === payroll.employeeId || emp.employeeId === payroll.employeeId,
    );

  /** Compute live gross/net salary using current attendance data */
  const getLivePayrollAmounts = (employee: Employee) => {
    const activity = getEmployeeMonthActivity(
      employee,
      selectedYear,
      selectedMonth,
    );
    const config = salaryConfig || {
      hraPercentage: 5,
      esicEmployeePercentage: 0.75,
      pfEmployeePercentage: 12,
      standardWorkingDays: 30,
    };
    const salary = employee.salary || {};
    const basic = Number(salary.basic ?? (salary as any).base ?? 0);
    const da = Number(salary.da ?? 0);
    const daysInMonth = new Date(selectedYear, selectedMonth, 0).getDate();
    // attendance docs may store either the Firestore doc ID or the employeeId string — try both
    const statuses =
      liveAttendanceByEmp[employee.id ?? ""] ??
      liveAttendanceByEmp[employee.employeeId ?? ""] ??
      [];

    // Calculate paid days from attendance; if no attendance data assume full month
    let paidDays: number;
    if (statuses.length > 0) {
      const attVars = computeAttendanceVariables(statuses, daysInMonth);
      const effectiveAbsent = attVars.absent_days + attVars.unmarked_days;
      paidDays = daysInMonth - effectiveAbsent - attVars.half_days * 0.5;
    } else {
      paidDays = daysInMonth;
    }

    // Cap paidDays by employee active days in the month
    if (paidDays > activity.activeDays) {
      paidDays = activity.activeDays;
    }

    const totalDays = daysInMonth;

    const hraPercentage = Number(
      salary.hraPercentage ?? config.hraPercentage ?? 5,
    );
    const hra = calculateHRA(basic, da, hraPercentage);
    const grossRatePM = calculateGrossRate(basic, da, hra);
    const grossEarning = calculateGrossEarning(
      grossRatePM,
      totalDays,
      paidDays,
    );
    const singleOTHours = Number((salary as any).singleOTHours ?? 0);
    const doubleOTHours = Number((salary as any).doubleOTHours ?? 0);
    const otRate = paidDays > 0 ? calculateOTRate(grossEarning, paidDays) : 0;
    const otAmount = calculateOTAmount(otRate, singleOTHours, doubleOTHours);
    const totalGross = grossEarning + otAmount;

    const pt = calculateProfessionalTax(totalGross);
    const esicPct = Number(
      salary.esicEmployeePercentage ?? config.esicEmployeePercentage ?? 0.75,
    );
    const esic = calculateESICEmployee(totalGross, esicPct);
    const pfBase = calculatePFBase(basic, da, totalDays, paidDays);
    const pfPct = Number(
      salary.pfEmployeePercentage ?? config.pfEmployeePercentage ?? 12,
    );
    const pf = calculatePFEmployee(pfBase, pfPct);
    const totalDeduction = pt + esic + pf;
    const netSalary = Math.max(0, totalGross - totalDeduction);

    return { grossSalary: totalGross, netSalary, basic };
  };

  const filteredExistingPayroll = existingPayroll.filter((payroll) => {
    const employee = getEmployeeForPayroll(payroll);
    // Drop orphaned payroll records (employee was deleted or belongs to another company)
    if (!employee) return false;

    // Exclude employees who are not active at all during the selected month/year
    if (
      !getEmployeeMonthActivity(employee, selectedYear, selectedMonth)
        .includeInMonth
    ) {
      return false;
    }

    if (!selectedManager) return true;
    return normalizeManagerIds(
      employee.assignedManagers,
      (employee as unknown as { assignedManager?: unknown }).assignedManager,
    ).includes(selectedManager);
  });

  const bulkUpdatePayrollStatus = async (nextStatus: Payroll["status"]) => {
    const candidates = filteredExistingPayroll.filter((payroll) =>
      nextStatus === "approved"
        ? payroll.status === "pending"
        : payroll.status !== "paid",
    );

    if (candidates.length === 0) {
      setError(
        nextStatus === "approved"
          ? "No pending payroll records found for current filter."
          : "No unpaid payroll records found for current filter.",
      );
      return;
    }

    try {
      setBulkUpdating(true);
      setError("");
      setSuccess("");

      for (const payroll of candidates) {
        const payload: Record<string, FieldValue | Partial<unknown> | undefined> = { status: nextStatus };
        if (nextStatus === "paid") {
          payload.paidAt = new Date();
        }
        await updateDoc(doc(db, "payroll", payroll.id), payload);
      }

      setSuccess(
        `${candidates.length} payroll record(s) updated to ${nextStatus}.`,
      );
      await checkExistingPayroll();
    } catch (err) {
      console.error("Error in bulk payroll status update:", err);
      setError("Failed to bulk update payroll status");
    } finally {
      setBulkUpdating(false);
    }
  };

  const getPayrollStats = () => {
    // Only count employees who are active at some point during the selected month/year
    const activeEmployees = employees.filter((emp) =>
      getEmployeeMonthActivity(emp, selectedYear, selectedMonth).includeInMonth,
    );

    const alreadyProcessedIds = new Set(
      existingPayroll.map((p) => p.employeeId),
    );
    const unprocessedCount = activeEmployees.filter(
      (emp) =>
        !alreadyProcessedIds.has(emp.employeeId) &&
        !alreadyProcessedIds.has(emp.id),
    ).length;

    return {
      totalEmployees: activeEmployees.length,
      processedPayroll: filteredExistingPayroll.length,
      unprocessedCount,
      allProcessed: unprocessedCount === 0,
      totalGrossSalary: filteredExistingPayroll.reduce((sum, p) => {
        const emp = getEmployeeForPayroll(p);
        return sum + (emp ? getLivePayrollAmounts(emp).grossSalary : 0);
      }, 0),
      totalNetSalary: filteredExistingPayroll.reduce((sum, p) => {
        const emp = getEmployeeForPayroll(p);
        return sum + (emp ? getLivePayrollAmounts(emp).netSalary : 0);
      }, 0),
      totalTax: filteredExistingPayroll.reduce(
        (sum, p) => sum + ((p as any).taxAmount || 0),
        0,
      ),
    };
  };

  const stats = getPayrollStats();

  if (loading) {
    return (
      <Box
        display="flex"
        justifyContent="center"
        alignItems="center"
        minHeight="400px"
      >
        <CircularProgress sx={{ color: "#6366f1" }} />
      </Box>
    );
  }

  return (
    <Box>
      <Box sx={{ mb: 3.5 }}>
        <Typography
          variant="h4"
          sx={{
            fontWeight: 700,
            fontSize: { xs: "1.5rem", sm: "1.875rem" },
            letterSpacing: "-0.02em",
            background: "linear-gradient(135deg, #f1f5f9 0%, #cbd5e1 100%)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            mb: 0.5,
          }}
        >
          Payroll Processing
        </Typography>
        <Typography variant="body2" sx={{ color: "#94a3b8" }}>
          Calculate monthly wages, approve payroll, and manage employee disbursements
        </Typography>
      </Box>

      {error && (
        <Alert
          severity="error"
          sx={{
            mb: 3,
            borderRadius: "14px",
            background: "rgba(239, 68, 68, 0.1)",
            border: "1px solid rgba(239, 68, 68, 0.25)",
            color: "#fca5a5",
            backdropFilter: "blur(10px)",
            "& .MuiAlert-icon": { color: "#ef4444" },
          }}
        >
          {error}
        </Alert>
      )}

      {success && (
        <Alert
          severity="success"
          sx={{
            mb: 3,
            borderRadius: "14px",
            background: "rgba(16, 185, 129, 0.1)",
            border: "1px solid rgba(16, 185, 129, 0.25)",
            color: "#6ee7b7",
            backdropFilter: "blur(10px)",
            "& .MuiAlert-icon": { color: "#10b981" },
          }}
        >
          {success}
        </Alert>
      )}

      {/* Toolbar & Filters */}
      <Paper
        elevation={0}
        sx={{
          mb: 3,
          p: 2.5,
          background: "rgba(255, 255, 255, 0.03)",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
          border: "1px solid rgba(255, 255, 255, 0.08)",
          borderRadius: "16px",
          boxShadow: "0 8px 32px rgba(0, 0, 0, 0.25)",
          display: "flex",
          flexDirection: { xs: "column", lg: "row" },
          justifyContent: "space-between",
          alignItems: { xs: "stretch", lg: "center" },
          gap: 2.5,
        }}
      >
        {/* Left: Filters (Month, Year, Manager) */}
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: { xs: "1fr", sm: "repeat(3, minmax(140px, 1fr))" },
            gap: 2,
            flex: 1,
            maxWidth: { lg: "650px" },
          }}
        >
          <FormControl fullWidth size="small">
            <InputLabel
              id="payroll-month-label"
              sx={{
                color: "#94a3b8",
                "&.Mui-focused": { color: "#818cf8" },
              }}
            >
              Month
            </InputLabel>
            <Select
              labelId="payroll-month-label"
              value={selectedMonth}
              label="Month"
              onChange={(e) => setSelectedMonth(e.target.value as number)}
              sx={{
                backgroundColor: "rgba(255, 255, 255, 0.03)",
                backdropFilter: "blur(10px)",
                borderRadius: "12px",
                color: "#f1f5f9",
                "& fieldset": {
                  borderColor: "rgba(255, 255, 255, 0.1)",
                },
                "&:hover fieldset": {
                  borderColor: "rgba(99, 102, 241, 0.35)",
                },
                "&.Mui-focused fieldset": {
                  borderColor: "#6366f1",
                  boxShadow: "0 0 0 3px rgba(99, 102, 241, 0.15)",
                },
                "& .MuiSelect-icon": { color: "#94a3b8" },
              }}
              MenuProps={{
                PaperProps: {
                  sx: {
                    backgroundColor: "rgba(15, 23, 42, 0.95)",
                    backdropFilter: "blur(24px)",
                    WebkitBackdropFilter: "blur(24px)",
                    border: "1px solid rgba(255, 255, 255, 0.1)",
                    borderRadius: "12px",
                    boxShadow: "0 12px 36px rgba(0, 0, 0, 0.5)",
                    "& .MuiMenuItem-root": {
                      color: "#f1f5f9",
                      "&:hover": {
                        backgroundColor: "rgba(99, 102, 241, 0.12)",
                      },
                      "&.Mui-selected": {
                        backgroundColor: "rgba(99, 102, 241, 0.2)",
                        "&:hover": {
                          backgroundColor: "rgba(99, 102, 241, 0.28)",
                        },
                      },
                    },
                  },
                },
              }}
            >
              {months.map((month) => (
                <MenuItem key={month.value} value={month.value}>
                  {month.label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <FormControl fullWidth size="small">
            <InputLabel
              id="payroll-year-label"
              sx={{
                color: "#94a3b8",
                "&.Mui-focused": { color: "#818cf8" },
              }}
            >
              Year
            </InputLabel>
            <Select
              labelId="payroll-year-label"
              value={selectedYear}
              label="Year"
              onChange={(e) => setSelectedYear(e.target.value as number)}
              sx={{
                backgroundColor: "rgba(255, 255, 255, 0.03)",
                backdropFilter: "blur(10px)",
                borderRadius: "12px",
                color: "#f1f5f9",
                "& fieldset": {
                  borderColor: "rgba(255, 255, 255, 0.1)",
                },
                "&:hover fieldset": {
                  borderColor: "rgba(99, 102, 241, 0.35)",
                },
                "&.Mui-focused fieldset": {
                  borderColor: "#6366f1",
                  boxShadow: "0 0 0 3px rgba(99, 102, 241, 0.15)",
                },
                "& .MuiSelect-icon": { color: "#94a3b8" },
              }}
              MenuProps={{
                PaperProps: {
                  sx: {
                    backgroundColor: "rgba(15, 23, 42, 0.95)",
                    backdropFilter: "blur(24px)",
                    WebkitBackdropFilter: "blur(24px)",
                    border: "1px solid rgba(255, 255, 255, 0.1)",
                    borderRadius: "12px",
                    boxShadow: "0 12px 36px rgba(0, 0, 0, 0.5)",
                    "& .MuiMenuItem-root": {
                      color: "#f1f5f9",
                      "&:hover": {
                        backgroundColor: "rgba(99, 102, 241, 0.12)",
                      },
                      "&.Mui-selected": {
                        backgroundColor: "rgba(99, 102, 241, 0.2)",
                        "&:hover": {
                          backgroundColor: "rgba(99, 102, 241, 0.28)",
                        },
                      },
                    },
                  },
                },
              }}
            >
              {years.map((year) => (
                <MenuItem key={year} value={year}>
                  {year}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <FormControl fullWidth size="small">
            <InputLabel
              id="payroll-manager-label"
              sx={{
                color: "#94a3b8",
                "&.Mui-focused": { color: "#818cf8" },
              }}
            >
              Manager
            </InputLabel>
            <Select
              labelId="payroll-manager-label"
              value={selectedManager}
              label="Manager"
              onChange={(e) => setSelectedManager(e.target.value)}
              sx={{
                backgroundColor: "rgba(255, 255, 255, 0.03)",
                backdropFilter: "blur(10px)",
                borderRadius: "12px",
                color: "#f1f5f9",
                "& fieldset": {
                  borderColor: "rgba(255, 255, 255, 0.1)",
                },
                "&:hover fieldset": {
                  borderColor: "rgba(99, 102, 241, 0.35)",
                },
                "&.Mui-focused fieldset": {
                  borderColor: "#6366f1",
                  boxShadow: "0 0 0 3px rgba(99, 102, 241, 0.15)",
                },
                "& .MuiSelect-icon": { color: "#94a3b8" },
              }}
              MenuProps={{
                PaperProps: {
                  sx: {
                    backgroundColor: "rgba(15, 23, 42, 0.95)",
                    backdropFilter: "blur(24px)",
                    WebkitBackdropFilter: "blur(24px)",
                    border: "1px solid rgba(255, 255, 255, 0.1)",
                    borderRadius: "12px",
                    boxShadow: "0 12px 36px rgba(0, 0, 0, 0.5)",
                    "& .MuiMenuItem-root": {
                      color: "#f1f5f9",
                      "&:hover": {
                        backgroundColor: "rgba(99, 102, 241, 0.12)",
                      },
                      "&.Mui-selected": {
                        backgroundColor: "rgba(99, 102, 241, 0.2)",
                        "&:hover": {
                          backgroundColor: "rgba(99, 102, 241, 0.28)",
                        },
                      },
                    },
                  },
                },
              }}
            >
              {Array.from(
                new Set(
                  employees.flatMap((emp) =>
                    normalizeManagerIds(
                      emp.assignedManagers,
                      (emp as unknown as { assignedManager?: unknown })
                        .assignedManager,
                    ),
                  ),
                ),
              ).map((managerId) => (
                <MenuItem key={managerId} value={managerId}>
                  {String(
                    managersById[managerId]?.fullName ||
                      managersById[managerId]?.name ||
                      managerId,
                  )}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </Box>

        {/* Right: Actions */}
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: { xs: "stretch", sm: "flex-end" },
            flexWrap: "wrap",
            gap: 2,
          }}
        >
          {stats.unprocessedCount > 0 && (
            <Chip
              label={`${stats.unprocessedCount} un-processed`}
              size="small"
              sx={{
                backgroundColor: "rgba(245, 158, 11, 0.15)",
                color: "#fbbf24",
                border: "1px solid rgba(245, 158, 11, 0.3)",
                fontWeight: 600,
                fontSize: "0.8125rem",
                py: 0.5,
              }}
            />
          )}

          <Button
            variant="contained"
            onClick={processPayroll}
            disabled={processing || reverting || stats.allProcessed}
            size="medium"
            sx={{
              borderRadius: "12px",
              background: stats.allProcessed
                ? "rgba(255, 255, 255, 0.08)"
                : "linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)",
              color: stats.allProcessed ? "#94a3b8" : "#ffffff",
              fontWeight: 600,
              px: 2.75,
              py: 1,
              textTransform: "none",
              fontSize: "0.875rem",
              boxShadow: stats.allProcessed
                ? "none"
                : "6px 6px 14px rgba(0, 0, 0, 0.35), inset 2px 2px 4px rgba(255, 255, 255, 0.2)",
              "&:hover": {
                background: stats.allProcessed
                  ? "rgba(255, 255, 255, 0.08)"
                  : "linear-gradient(135deg, #4f46e5 0%, #4338ca 100%)",
                boxShadow: stats.allProcessed
                  ? "none"
                  : "4px 4px 10px rgba(0, 0, 0, 0.4), inset 2px 2px 4px rgba(255, 255, 255, 0.25)",
                transform: stats.allProcessed ? "none" : "translateY(-1px)",
              },
              "&:active": {
                boxShadow: "2px 2px 4px rgba(0, 0, 0, 0.3), inset 3px 3px 6px rgba(0, 0, 0, 0.2)",
                transform: "translateY(0)",
              },
              "&.Mui-disabled": {
                color: "#64748b",
                background: "rgba(255, 255, 255, 0.04)",
                boxShadow: "none",
              },
              transition: "all 0.2s ease",
            }}
          >
            {processing ? (
              <CircularProgress size={20} color="inherit" />
            ) : stats.allProcessed ? (
              "All Processed"
            ) : (
              `Process Payroll (${stats.unprocessedCount} remaining)`
            )}
          </Button>

          <Button
            variant="outlined"
            onClick={revertPayroll}
            disabled={reverting || processing || existingPayroll.length === 0}
            size="medium"
            sx={{
              borderRadius: "12px",
              borderColor: "rgba(239, 68, 68, 0.35)",
              backgroundColor: "rgba(239, 68, 68, 0.06)",
              color: "#f87171",
              fontWeight: 600,
              px: 2.25,
              py: 1,
              textTransform: "none",
              fontSize: "0.875rem",
              backdropFilter: "blur(10px)",
              "&:hover": {
                borderColor: "rgba(239, 68, 68, 0.6)",
                backgroundColor: "rgba(239, 68, 68, 0.12)",
                boxShadow: "0 4px 16px rgba(239, 68, 68, 0.2)",
                transform: "translateY(-1px)",
              },
              "&.Mui-disabled": {
                borderColor: "rgba(255, 255, 255, 0.06)",
                color: "#64748b",
                backgroundColor: "transparent",
              },
              transition: "all 0.2s ease",
            }}
          >
            {reverting ? <CircularProgress size={20} color="inherit" /> : "Revert Payroll"}
          </Button>
        </Box>
      </Paper>

      {/* Month Stats */}
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: {
            xs: "1fr",
            sm: "repeat(2, 1fr)",
            md: "repeat(4, 1fr)",
          },
          gap: 2.5,
          mb: 3,
        }}
      >
        {[
          {
            title: "Total Employees",
            value: stats.totalEmployees,
            icon: <AttachMoney sx={{ color: "#818cf8", fontSize: 26 }} />,
            color: "#818cf8",
            accent: "rgba(99, 102, 241, 0.15)",
            border: "rgba(99, 102, 241, 0.25)",
            glow: "rgba(99, 102, 241, 0.2)",
          },
          {
            title: "Processed",
            value: stats.processedPayroll,
            icon: <Receipt sx={{ color: "#34d399", fontSize: 26 }} />,
            color: "#34d399",
            accent: "rgba(16, 185, 129, 0.15)",
            border: "rgba(16, 185, 129, 0.25)",
            glow: "rgba(16, 185, 129, 0.2)",
          },
          {
            title: "Net Salary",
            value: `₹${stats.totalNetSalary.toLocaleString()}`,
            icon: <TrendingUp sx={{ color: "#38bdf8", fontSize: 26 }} />,
            color: "#38bdf8",
            accent: "rgba(56, 189, 248, 0.15)",
            border: "rgba(56, 189, 248, 0.25)",
            glow: "rgba(56, 189, 248, 0.2)",
          },
          {
            title: "Total Tax",
            value: `₹${stats.totalTax.toLocaleString()}`,
            icon: <Warning sx={{ color: "#fbbf24", fontSize: 26 }} />,
            color: "#fbbf24",
            accent: "rgba(245, 158, 11, 0.15)",
            border: "rgba(245, 158, 11, 0.25)",
            glow: "rgba(245, 158, 11, 0.2)",
          },
        ].map((card, idx) => (
          <Box key={idx}>
            <Card
              elevation={0}
              sx={{
                background: "rgba(255, 255, 255, 0.03)",
                backdropFilter: "blur(20px)",
                WebkitBackdropFilter: "blur(20px)",
                border: "1px solid rgba(255, 255, 255, 0.08)",
                borderRadius: "16px",
                boxShadow: "0 8px 32px rgba(0, 0, 0, 0.25)",
                transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
                position: "relative",
                overflow: "hidden",
                "&:hover": {
                  transform: "translateY(-3px)",
                  borderColor: card.border,
                  boxShadow: `0 14px 40px rgba(0, 0, 0, 0.35), 0 0 24px ${card.glow}`,
                },
                "&::before": {
                  content: '""',
                  position: "absolute",
                  top: 0,
                  left: 0,
                  right: 0,
                  height: "2px",
                  background: `linear-gradient(90deg, transparent, ${card.color}, transparent)`,
                  opacity: 0.8,
                },
              }}
            >
              <CardContent sx={{ p: 2.5, "&:last-child": { pb: 2.5 } }}>
                <Box display="flex" alignItems="center" justifyContent="space-between">
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography
                      sx={{
                        color: "#94a3b8",
                        fontWeight: 600,
                        fontSize: "0.75rem",
                        textTransform: "uppercase",
                        letterSpacing: "0.06em",
                        mb: 0.75,
                      }}
                    >
                      {card.title}
                    </Typography>
                    <Typography
                      variant="h5"
                      sx={{
                        color: "#f1f5f9",
                        fontWeight: 700,
                        fontSize: "1.45rem",
                        letterSpacing: "-0.02em",
                        lineHeight: 1.2,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {card.value}
                    </Typography>
                  </Box>
                  <Box
                    sx={{
                      width: 48,
                      height: 48,
                      borderRadius: "13px",
                      background: card.accent,
                      border: `1px solid ${card.border}`,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      boxShadow: `0 4px 14px ${card.glow}`,
                      flexShrink: 0,
                      ml: 1.5,
                    }}
                  >
                    {card.icon}
                  </Box>
                </Box>
              </CardContent>
            </Card>
          </Box>
        ))}
      </Box>

      {/* Existing Payroll Table */}
      {existingPayroll.length > 0 && (
        <Paper
          elevation={0}
          sx={{
            width: "100%",
            overflow: "hidden",
            backgroundColor: "rgba(255, 255, 255, 0.02)",
            backdropFilter: "blur(20px)",
            WebkitBackdropFilter: "blur(20px)",
            border: "1px solid rgba(255, 255, 255, 0.08)",
            borderRadius: "16px",
            boxShadow: "0 8px 32px rgba(0, 0, 0, 0.25)",
          }}
        >
          <Box
            sx={{
              p: 2.5,
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 2,
              flexWrap: "wrap",
              borderBottom: "1px solid rgba(255, 255, 255, 0.06)",
            }}
          >
            <Box>
              <Typography
                variant="h6"
                sx={{
                  fontWeight: 600,
                  fontSize: "1.05rem",
                  color: "#f1f5f9",
                }}
              >
                Processed Payroll for {months[selectedMonth - 1].label}{" "}
                {selectedYear}
                {selectedManager ? " (Filtered by manager)" : ""}
              </Typography>
              <Typography
                variant="body2"
                sx={{ color: "#94a3b8", fontSize: "0.8125rem", mt: 0.25 }}
              >
                {filteredExistingPayroll.length} record{filteredExistingPayroll.length !== 1 ? "s" : ""} found
              </Typography>
            </Box>
            <Box sx={{ display: "flex", gap: 1.5, flexWrap: "wrap" }}>
              <Button
                variant="outlined"
                disabled={bulkUpdating || updatingStatusId !== ""}
                onClick={() => void bulkUpdatePayrollStatus("approved")}
                sx={{
                  borderRadius: "10px",
                  borderColor: "rgba(99, 102, 241, 0.35)",
                  backgroundColor: "rgba(99, 102, 241, 0.06)",
                  color: "#a5b4fc",
                  fontWeight: 600,
                  textTransform: "none",
                  px: 2,
                  py: 0.75,
                  "&:hover": {
                    borderColor: "rgba(99, 102, 241, 0.6)",
                    backgroundColor: "rgba(99, 102, 241, 0.15)",
                  },
                }}
              >
                Approve Filtered
              </Button>
              <Button
                variant="contained"
                disabled={bulkUpdating || updatingStatusId !== ""}
                onClick={() => void bulkUpdatePayrollStatus("paid")}
                sx={{
                  borderRadius: "10px",
                  background: "linear-gradient(135deg, #10b981 0%, #059669 100%)",
                  color: "#ffffff",
                  fontWeight: 600,
                  textTransform: "none",
                  px: 2,
                  py: 0.75,
                  boxShadow: "0 4px 14px rgba(16, 185, 129, 0.3)",
                  "&:hover": {
                    background: "linear-gradient(135deg, #059669 0%, #047857 100%)",
                  },
                }}
              >
                Mark Filtered Paid
              </Button>
            </Box>
          </Box>
          <TableContainer>
            <Table>
              <TableHead
                sx={{
                  "& .MuiTableCell-root": {
                    backgroundColor: "rgba(255, 255, 255, 0.03)",
                    borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
                    color: "#94a3b8",
                    fontWeight: 600,
                    fontSize: "0.75rem",
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                    py: 1.75,
                  },
                }}
              >
                <TableRow>
                  <TableCell>Employee ID</TableCell>
                  <TableCell>Name</TableCell>
                  <TableCell align="right">Basic</TableCell>
                  <TableCell align="right">Net Salary</TableCell>
                  <TableCell align="center">Status</TableCell>
                  <TableCell align="center">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {filteredExistingPayroll.map((payroll) => {
                  const employee = getEmployeeForPayroll(payroll);
                  const liveAmounts = employee
                    ? getLivePayrollAmounts(employee)
                    : { grossSalary: 0, netSalary: Math.abs(payroll.netSalary), basic: payroll.baseSalary || 0 };
                  return (
                    <TableRow
                      key={payroll.id}
                      sx={{
                        "&:hover": {
                          backgroundColor: "rgba(255, 255, 255, 0.03)",
                        },
                        "& .MuiTableCell-root": {
                          borderBottom: "1px solid rgba(255, 255, 255, 0.04)",
                          color: "#f1f5f9",
                          py: 1.5,
                        },
                      }}
                    >
                      <TableCell sx={{ color: "#a5b4fc", fontWeight: 500 }}>
                        {employee?.employeeId}
                      </TableCell>
                      <TableCell>
                        <Box>
                          <Typography variant="body2" sx={{ fontWeight: 500, color: "#f1f5f9" }}>
                            {employee ? employee.fullName : "Unknown"}
                          </Typography>
                          {(payroll as any).activityLabel && (
                            <Typography
                              variant="caption"
                              sx={{ color: "#94a3b8", display: "block" }}
                            >
                              {(payroll as any).activityLabel}
                            </Typography>
                          )}
                        </Box>
                      </TableCell>
                      <TableCell align="right" sx={{ fontWeight: 500 }}>
                        ₹{liveAmounts.basic.toLocaleString()}
                      </TableCell>
                      <TableCell align="right" sx={{ fontWeight: 600, color: "#34d399" }}>
                        ₹{liveAmounts.netSalary.toLocaleString()}
                      </TableCell>
                      <TableCell align="center">
                        <Chip
                          label={payroll.status}
                          size="small"
                          sx={{
                            fontWeight: 600,
                            fontSize: "0.75rem",
                            textTransform: "capitalize",
                            backdropFilter: "blur(10px)",
                            ...(payroll.status === "paid"
                              ? {
                                  backgroundColor: "rgba(16, 185, 129, 0.15)",
                                  color: "#34d399",
                                  border: "1px solid rgba(16, 185, 129, 0.3)",
                                }
                              : payroll.status === "approved"
                                ? {
                                    backgroundColor: "rgba(59, 130, 246, 0.15)",
                                    color: "#60a5fa",
                                    border: "1px solid rgba(59, 130, 246, 0.3)",
                                  }
                                : {
                                    backgroundColor: "rgba(245, 158, 11, 0.15)",
                                    color: "#fbbf24",
                                    border: "1px solid rgba(245, 158, 11, 0.3)",
                                  }),
                          }}
                        />
                      </TableCell>
                      <TableCell align="center">
                        <Box
                          sx={{
                            display: "flex",
                            gap: 1,
                            justifyContent: "center",
                          }}
                        >
                          <Button
                            size="small"
                            variant="outlined"
                            disabled={
                              payroll.status !== "pending" ||
                              updatingStatusId === payroll.id
                            }
                            onClick={() =>
                              updatePayrollStatus(payroll.id, "approved")
                            }
                            sx={{
                              borderRadius: "8px",
                              borderColor: "rgba(99, 102, 241, 0.35)",
                              color: "#a5b4fc",
                              textTransform: "none",
                              fontWeight: 500,
                              fontSize: "0.8125rem",
                              px: 1.5,
                              py: 0.5,
                              "&:hover": {
                                borderColor: "rgba(99, 102, 241, 0.6)",
                                backgroundColor: "rgba(99, 102, 241, 0.1)",
                              },
                              "&.Mui-disabled": {
                                borderColor: "rgba(255, 255, 255, 0.05)",
                                color: "#64748b",
                              },
                            }}
                          >
                            Approve
                          </Button>
                          <Button
                            size="small"
                            variant="contained"
                            disabled={
                              payroll.status === "paid" ||
                              updatingStatusId === payroll.id
                            }
                            onClick={() =>
                              updatePayrollStatus(payroll.id, "paid")
                            }
                            sx={{
                              borderRadius: "8px",
                              background: "linear-gradient(135deg, #10b981 0%, #059669 100%)",
                              color: "#ffffff",
                              textTransform: "none",
                              fontWeight: 500,
                              fontSize: "0.8125rem",
                              px: 1.5,
                              py: 0.5,
                              boxShadow: "0 2px 8px rgba(16, 185, 129, 0.25)",
                              "&:hover": {
                                background: "linear-gradient(135deg, #059669 0%, #047857 100%)",
                              },
                              "&.Mui-disabled": {
                                background: "rgba(255, 255, 255, 0.05)",
                                color: "#64748b",
                                boxShadow: "none",
                              },
                            }}
                          >
                            Mark Paid
                          </Button>
                        </Box>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>
      )}
    </Box>
  );
}
