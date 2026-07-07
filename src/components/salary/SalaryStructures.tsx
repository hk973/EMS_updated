"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  Box,
  Typography,
  Button,
  TextField,
  Table,
  TableBody,
  TableCell,
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
  Divider,
  Alert,
  Tabs,
  Tab,
  Checkbox,
  FormControlLabel,
  Autocomplete,
} from "@mui/material";
import {
  Edit,
  Search,
  Upload,
  Download,
  Calculate,
  FileUpload,
} from "@mui/icons-material";
import {
  collection,
  getDocs,
  doc,
  updateDoc,
  query,
  where,
  getDoc,
  setDoc,
  deleteField,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Employee } from "@/types";
import { useAuth } from "@/contexts/AuthContext";
import * as XLSX from "xlsx";
import TemplateSalaryView from "@/components/salary/TemplateSalaryView";
import {
  salaryTemplateService,
  evaluateTemplateFormula,
} from "@/lib/salaryTemplateService";
import type {
  SalaryTemplate,
  TemplateSection,
  TemplateColumn,
} from "@/lib/salaryTemplateService";

interface SalaryCalculationData {
  // Employee Information
  esicNo: string;
  uan: string;

  // Basic Components
  basic: number;
  da: number;

  // Working Days
  totalDays: number | undefined;
  paidDays: number | undefined;

  // Overtime
  singleOTHours: number;
  doubleOTHours: number;

  // Manual Adjustments
  difference: number;
  advance: number;

  // Skill-based salary
  isSkillBased: boolean;
  skillCategory: string;
  skillAmount: number;

  // Custom components
  customAllowances: { label: string; amount: number }[];
  customBonuses: { label: string; amount: number }[];
  customDeductions: { label: string; amount: number }[];

  // Configurable percentages
  hraPercentage: number;
  esicEmployeePercentage: number;
  esicEmployerPercentage: number;
  pfEmployeePercentage: number;
  pfEmployerPercentage: number;
  mlwfEmployerAmount: number;
}

interface SkillCategory {
  id: string;
  name: string;
  amount: number;
  description?: string;
}

interface ManagerOption {
  id: string;
  name: string;
  salaryTemplateId?: string;
}

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

function TabPanel(props: TabPanelProps) {
  const { children, value, index, ...other } = props;
  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`salary-tabpanel-${index}`}
      aria-labelledby={`salary-tab-${index}`}
      {...other}
    >
      {value === index && <Box sx={{ px: 2, pb: 1 }}>{children}</Box>}
    </div>
  );
}

export default function SalaryStructures({ refreshKey }: { refreshKey?: number }) {
  // Resolve the month/year that exports should be scoped to. This follows the
  // attendance period selected in the toolbar (falling back to the current
  // calendar month only when no period is available/selected).
  const getExportPeriodLabel = () => {
    const month = new Date(selectedYear, selectedMonth - 1, 1)
      .toLocaleString("default", { month: "long" })
      .toUpperCase();
    return { month, year: selectedYear };
  };

  // Helper to get formatted filename (without extension)
  const getExportFilename = () => {
    const { month, year } = getExportPeriodLabel();
    return `${month}-${year}_WAGES_UPDATE`;
  };

  // Helper to get ESIC export filename
  const getESICExportFilename = () => {
    const { month, year } = getExportPeriodLabel();
    return `${month}-${year}_ESIC_MC`; // MC = Monthly Contribution
  };

  // Helper to get ESIC export data in the format similar to esi MC_Template.xls
  const getESICExportData = () => {
    return filteredEmployees.map((emp, index) => {
      const salary = getEmployeeSalaryWithCustomParams(emp);
      return {
        "SR. NO.": index + 1,
        "IP NUMBER": emp.esicNo || "-",
        "IP NAME": emp.fullName || "-",
        "DAYS WORKED": salary.paidDays || 0,
        "WAGES PAID": salary.totalGrossEarning || 0,
        "REASON FOR ZERO WORKING DAYS": "",
        "EMPLOYEE CONTRIBUTION": salary.esicEmployee || 0,
        "EMPLOYER CONTRIBUTION": salary.esicEmployer || 0,
        "TOTAL CONTRIBUTION":
          (salary.esicEmployee || 0) + (salary.esicEmployer || 0),
        UAN: emp.uan || "-",
      };
    });
  };

  // Export ESIC to XLSX
  const handleExportESICXLSX = () => {
    const data = getESICExportData();
    if (!data || data.length === 0) {
      setAlert({ type: "error", message: "No data to export" });
      return;
    }
    const ws = XLSX.utils.json_to_sheet(data);
    // Set column widths for ESIC format
    ws["!cols"] = [
      { wch: 8 }, // SR. NO.
      { wch: 15 }, // IP NUMBER
      { wch: 25 }, // IP NAME
      { wch: 12 }, // DAYS WORKED
      { wch: 15 }, // WAGES PAID
      { wch: 25 }, // REASON FOR ZERO WORKING DAYS
      { wch: 18 }, // EMPLOYEE CONTRIBUTION
      { wch: 18 }, // EMPLOYER CONTRIBUTION
      { wch: 18 }, // TOTAL CONTRIBUTION
      { wch: 15 }, // UAN
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "ESIC");
    const filename = `${getESICExportFilename()}.xlsx`;
    XLSX.writeFile(wb, filename);
    setAlert({
      type: "success",
      message: `ESIC XLSX file downloaded: ${filename}`,
    });
  };

  // Export ESIC to CSV
  const handleExportESICCSV = () => {
    const data = getESICExportData();
    if (!data || data.length === 0) {
      setAlert({ type: "error", message: "No data to export" });
      return;
    }
    const ws = XLSX.utils.json_to_sheet(data);
    const csv = XLSX.utils.sheet_to_csv(ws);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${getESICExportFilename()}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
    setAlert({
      type: "success",
      message: `ESIC CSV file downloaded: ${getESICExportFilename()}.csv`,
    });
  };

  // Helper to get UAN ECR filename
  const getUANECRExportFilename = () => {
    const { month, year } = getExportPeriodLabel();
    return `${month}-${year}_UAN_ECR`;
  };

  // Helper to get UAN ECR export data
  const getUANECRExportData = () => {
    return filteredEmployees.map((emp) => {
      const salary = getEmployeeSalaryWithCustomParams(emp);
      const uan = emp.uan || "";
      const name = emp.fullName || "";
      const grossWages = Math.round(salary.totalGrossEarning || 0);
      const epfWages = Math.round(salary.pfBase || 0);
      const epsWages = Math.round(salary.pfBase || 0); // Same as EPF wages
      const edliWages = Math.round(salary.pfBase || 0); // Same as EPF wages
      const epfContributionEmployee = Math.round(salary.pfEmployee || 0);
      const epsContribution = Math.round((salary.pfBase || 0) * 0.0833); // 8.33%
      const epfContributionEmployer = Math.round((salary.pfBase || 0) * 0.0367); // 3.67%
      const ncpDays = 0; // Non-contributing period days
      const refundOfAdvances = 0;

      return {
        UAN: uan,
        "Member Name": name,
        "Gross Wages": grossWages,
        "EPF Wages": epfWages,
        "EPS Wages": epsWages,
        "EDLI Wages": edliWages,
        "EPF Contribution (Employee)": epfContributionEmployee,
        "EPS Contribution": epsContribution,
        "EPF Contribution (Employer)": epfContributionEmployer,
        "NCP Days": ncpDays,
        "Refund of Advances": refundOfAdvances,
      };
    });
  };

  // Export UAN ECR to XLSX
  const handleExportUANECRXLSX = () => {
    const data = getUANECRExportData();
    if (!data || data.length === 0) {
      setAlert({
        type: "error",
        message: "No employee data available to export",
      });
      return;
    }
    const ws = XLSX.utils.json_to_sheet(data);
    ws["!cols"] = [
      { wch: 15 }, // UAN
      { wch: 30 }, // Member Name
      { wch: 12 }, // Gross Wages
      { wch: 12 }, // EPF Wages
      { wch: 12 }, // EPS Wages
      { wch: 12 }, // EDLI Wages
      { wch: 20 }, // EPF Contribution (Employee)
      { wch: 18 }, // EPS Contribution
      { wch: 20 }, // EPF Contribution (Employer)
      { wch: 10 }, // NCP Days
      { wch: 18 }, // Refund of Advances
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "UAN ECR");
    const filename = `${getUANECRExportFilename()}.xlsx`;
    XLSX.writeFile(wb, filename);
    setAlert({
      type: "success",
      message: `UAN ECR XLSX file downloaded: ${filename}`,
    });
  };

  // Export UAN ECR to CSV
  const handleExportUANECRCSV = () => {
    const data = getUANECRExportData();
    if (!data || data.length === 0) {
      setAlert({
        type: "error",
        message: "No employee data available to export",
      });
      return;
    }
    const ws = XLSX.utils.json_to_sheet(data);
    const csv = XLSX.utils.sheet_to_csv(ws);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${getUANECRExportFilename()}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
    setAlert({
      type: "success",
      message: `UAN ECR CSV file downloaded: ${getUANECRExportFilename()}.csv`,
    });
  };

  // Export UAN ECR to TXT (EPFO format with #~# separator)
  const handleExportUANECRTXT = () => {
    const data = filteredEmployees.map((emp) => {
      const salary = getEmployeeSalaryWithCustomParams(emp);
      const uan = emp.uan || "";
      const name = emp.fullName || "";
      const grossWages = Math.round(salary.totalGrossEarning || 0);
      const epfWages = Math.round(salary.pfBase || 0);
      const epsWages = Math.round(salary.pfBase || 0);
      const edliWages = Math.round(salary.pfBase || 0);
      const epfContributionEmployee = Math.round(salary.pfEmployee || 0);
      const epsContribution = Math.round((salary.pfBase || 0) * 0.0833);
      const epfContributionEmployer = Math.round((salary.pfBase || 0) * 0.0367);
      const ncpDays = 0;
      const refundOfAdvances = 0;

      return `${uan}#~#${name}#~#${grossWages}#~#${epfWages}#~#${epsWages}#~#${edliWages}#~#${epfContributionEmployee}#~#${epsContribution}#~#${epfContributionEmployer}#~#${ncpDays}#~#${refundOfAdvances}`;
    });

    if (!data || data.length === 0) {
      setAlert({
        type: "error",
        message: "No employee data available to export",
      });
      return;
    }

    const txtContent = data.join("\n");
    const blob = new Blob([txtContent], { type: "text/plain;charset=utf-8;" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${getUANECRExportFilename()}.txt`;
    a.click();
    window.URL.revokeObjectURL(url);
    setAlert({
      type: "success",
      message: `UAN ECR TXT file downloaded: ${getUANECRExportFilename()}.txt`,
    });
  };

  // Helper to get export data in the format similar to the sample Excel
  // ── Template-driven export helpers ──────────────────────────────────────────

  /** Get the template for a given manager (manager-specific first, then global) */
  const getTemplateForManagerId = (
    managerId: string,
  ): SalaryTemplate | null => {
    const mgr = managers.find((m) => m.id === managerId);
    // 1. Manager doc has an explicit salaryTemplateId (assigned via "Assign Template" dialog)
    if (mgr?.salaryTemplateId) {
      const t = allTemplates.find((t) => t.id === mgr.salaryTemplateId);
      if (t) return t;
    }
    // 2. Template was assigned via the template editor's "Assign to Manager" dropdown
    const byManagerId = allTemplates.find((t) => t.managerId === managerId);
    if (byManagerId) return byManagerId;
    // 3. Fall back to global template
    return allTemplates.find((t) => t.managerId === null) ?? null;
  };

  /** Build union of all sections across all templates (for "All Managers" export) */
  const getUnionSections = (): TemplateSection[] => {
    const map = new Map<string, TemplateSection>();
    for (const tmpl of allTemplates) {
      for (const sec of tmpl.sections) {
        const key = sec.label.toLowerCase().trim();
        if (!map.has(key)) {
          map.set(key, { ...sec, columns: [...sec.columns] });
        } else {
          const existing = map.get(key)!;
          for (const col of sec.columns) {
            if (!existing.columns.find((c) => c.key === col.key)) {
              existing.columns.push(col);
            }
          }
        }
      }
    }
    return Array.from(map.values()).sort((a, b) => a.order - b.order);
  };

  // Key used to store/look up the per-month salary data (e.g. "2025-7").
  const getMonthlyKey = () => `${selectedYear}-${selectedMonth}`;

  // The salary record for the currently selected month/year. Each month keeps
  // its own data under employee.salaryByMonth, so downloading/uploading a month
  // only touches that month. When a month has no saved data yet this is empty,
  // so the export produces a blank fill-in template for that month.
  const getMonthlySalary = (emp: Employee): Record<string, unknown> => {
    const byMonth = (emp as unknown as {
      salaryByMonth?: Record<string, Record<string, unknown>>;
    }).salaryByMonth;
    return byMonth?.[getMonthlyKey()] ?? {};
  };

  /** Evaluate all columns for an employee using their assigned template */
  const buildEmployeeExportRow = (
    emp: Employee,
    sections: TemplateSection[],
  ): Record<string, string | number> => {
    const managerId =
      (Array.isArray(emp.assignedManagers)
        ? emp.assignedManagers[0]
        : emp.assignedManager) ?? "";
    const tmpl = getTemplateForManagerId(managerId);

    // Build context progressively — sourced from the SELECTED month's data.
    const s = getMonthlySalary(emp);
    const totalDaysVal = Number((s as any).totalDays ?? 30);
    const paidDaysVal = Number((s as any).paidDays ?? totalDaysVal);
    const presentDays = Number((s as any).presentDays ?? paidDaysVal);
    const absentDays = Number(
      (s as any).absentDays ?? Math.max(0, totalDaysVal - paidDaysVal),
    );
    const ctx: Record<string, unknown> = {
      name: emp.fullName ?? "",
      employee_id: emp.employeeId ?? "",
      esic_no: emp.esicNo ?? "",
      uan: emp.uan ?? "",
      basic: Number((s as any).basic ?? (s as any).base ?? 0),
      da: Number((s as any).da ?? 0),
      total_days: totalDaysVal,
      paid_days: paidDaysVal,
      present_days: presentDays,
      absent_days: absentDays,
      half_days: Number((s as any).halfDayDays ?? 0),
      half_day_days: Number((s as any).halfDayDays ?? 0), // legacy alias
      leave_days: Number((s as any).leaveDays ?? 0),
      unmarked_days: Number((s as any).unmarkedDays ?? 0),
      hra: Number((s as any).hra ?? 0),
      gross_rate_pm: Number((s as any).grossRatePM ?? 0),
      rate_gross_pm: Number((s as any).grossRatePM ?? 0), // alias — some templates use this key
      gross_earning: Number((s as any).totalGrossEarning ?? 0),
      ot_rate: Number((s as any).otRatePerHour ?? 0),
      single_ot_hours: Number((s as any).singleOTHours ?? 0),
      double_ot_hours: Number((s as any).doubleOTHours ?? 0),
      ot_amount: Number((s as any).otAmount ?? 0),
      difference: Number((s as any).difference ?? 0),
      total_gross: Number((s as any).totalGrossEarning ?? 0),
      professional_tax: Number((s as any).professionalTax ?? 0),
      esic_employee: Number((s as any).esicEmployee ?? 0),
      pf_base: Number((s as any).pfBase ?? 0),
      pf_employee: Number((s as any).pfEmployee ?? 0),
      advance: Number((s as any).advance ?? 0),
      total_deduction: Number((s as any).totalDeduction ?? 0),
      net_salary: Number((s as any).netSalary ?? 0),
      esic_employer: Number((s as any).esicEmployer ?? 0),
      pf_employer: Number((s as any).pfEmployer ?? 0),
      mlwf_employer: Number((s as any).mlwfEmployer ?? 0),
      ctc_per_month: Number((s as any).ctcPerMonth ?? 0),
      employee_type: (emp as any).employeeType ?? "",
    };

    const row: Record<string, string | number> = {};

    // Evaluate all sections/columns in order, building ctx as we go
    // Sort columns within each section by order so formula dependencies resolve correctly
    const evalSections = tmpl
      ? [...tmpl.sections]
          .sort((a, b) => a.order - b.order)
          .map((sec) => ({ ...sec, columns: [...sec.columns].sort((a, b) => a.order - b.order) }))
      : sections.map((sec) => ({ ...sec, columns: [...sec.columns].sort((a, b) => a.order - b.order) }));

    for (const sec of evalSections) {
      for (const col of sec.columns) {
        let val: string | number = "-";
        const directKeys = [
          "name",
          "employee_id",
          "esic_no",
          "uan",
          "basic",
          "da",
          "total_days",
          "paid_days",
        ];
        if (directKeys.includes(col.key)) {
          const textKeys = ["name", "employee_id", "esic_no", "uan"];
          if (textKeys.includes(col.key)) {
            val = (ctx[col.key] as string | number) ?? "";
          } else {
            // Numeric direct fields (basic/da/total_days/paid_days): show a
            // blank cell when this month has no saved data instead of a
            // misleading 0, so the download is a clean fill-in template.
            const rawDirect: Record<string, unknown> = {
              basic: (s as any).basic ?? (s as any).base,
              da: (s as any).da,
              total_days: (s as any).totalDays,
              paid_days: (s as any).paidDays ?? (s as any).totalDays,
            };
            val = isBlankCell(rawDirect[col.key])
              ? ""
              : (ctx[col.key] as number);
          }
        } else if (col.formula?.expression) {
          // Still evaluate so later formulas depending on this column resolve,
          // but in the fill-and-upload export we mark auto-calculated columns
          // with the text "auto calculated" instead of the computed number.
          const result = evaluateTemplateFormula(col.formula.expression, ctx);
          if (typeof result === "number") ctx[col.key] = result;
          val = "auto calculated";
        } else {
          const storedValue =
            (s as Record<string, unknown>)[col.key] ??
            (emp as any).salaryOverrides?.[col.key];
          if (!isBlankCell(storedValue) && storedValue !== "-") {
            val = storedValue as string | number;
          } else {
            val = ""; // empty string so Excel shows blank, not "-"
          }
        }
        // Only include columns that exist in the union sections (for "all managers" view)
        const inUnion = sections.some((s) =>
          s.columns.some((c) => c.key === col.key),
        );
        if (inUnion || tmpl) {
          row[col.label] = val;
        }
      }
    }

    // Fill "-" for any union columns not in this employee's template
    for (const sec of sections) {
      for (const col of sec.columns) {
        if (!(col.label in row)) row[col.label] = "-";
      }
    }

    return row;
  };

  const getExportData = () => {
    const sections = getActiveExportSections();

    if (sections.length === 0) {
      // Fallback to old format if no templates
      return filteredEmployees.map((emp, index) => {
        const salary = getEmployeeSalaryWithCustomParams(emp);
        return {
          "SR. NO.": index + 1,
          "EMPLOYEE ID": emp.employeeId || "-",
          NAME: emp.fullName || "-",
          BASIC: salary.basic || "-",
          "D.A.": salary.da || "-",
          HRA: salary.hra || "-",
          "NET SALARY": salary.netSalary || "-",
          "CTC PER MONTH": salary.ctcPerMonth || "-",
        };
      });
    }

    return filteredEmployees.map((emp, index) => ({
      "SR. NO.": index + 1,
      ...buildEmployeeExportRow(emp, sections),
    }));
  };

  // Export to XLSX
  const handleExportXLSX = () => {
    const data = getExportData().map((row) => {
      const sanitized: Record<string, string | number> = {};
      Object.entries(row).forEach(([key, value]) => {
        sanitized[key] =
          String(value) === "-" ? "" : (value as string | number);
      });
      return sanitized;
    });
    if (!data || data.length === 0) {
      setAlert({ type: "error", message: "No data to export" });
      return;
    }
    const ws = XLSX.utils.json_to_sheet(data);
    const colCount = Object.keys(data[0] || {}).length;
    ws["!cols"] = Array(colCount).fill({ wch: 16 });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Wages");
    const filename = `${getExportFilename()}.xlsx`;
    XLSX.writeFile(wb, filename);
    setAlert({ type: "success", message: `XLSX downloaded: ${filename}` });
  };

  // Export to CSV
  const handleExportCSV = () => {
    const data = getExportData().map((row) => {
      const sanitized: Record<string, string | number> = {};
      Object.entries(row).forEach(([key, value]) => {
        // Leave cells with no data blank (per the fill-and-upload template).
        sanitized[key] =
          String(value) === "-" ? "" : (value as string | number);
      });
      return sanitized;
    });
    if (!data || data.length === 0) {
      setAlert({ type: "error", message: "No data to export" });
      return;
    }
    const ws = XLSX.utils.json_to_sheet(data);
    const csv = XLSX.utils.sheet_to_csv(ws);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${getExportFilename()}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
    setAlert({
      type: "success",
      message: `CSV downloaded: ${getExportFilename()}.csv`,
    });
  };

  // Download sample file — columns match the active template
  const downloadSampleFile = () => {
    const sections =
      selectedManagerId === "all"
        ? getUnionSections()
        : (() => {
            const tmpl = getTemplateForManagerId(selectedManagerId);
            return tmpl
              ? [...tmpl.sections].sort((a, b) => a.order - b.order)
              : getUnionSections();
          })();

    // Build one sample row with all column labels
    const sampleRow: Record<string, string | number> = {};
    for (const sec of sections) {
      for (const col of sec.columns) {
        const directKeys = [
          "name",
          "employee_id",
          "esic_no",
          "uan",
          "basic",
          "da",
          "total_days",
          "paid_days",
        ];
        if (directKeys.includes(col.key)) {
          const defaults: Record<string, string | number> = {
            name: "John Doe",
            employee_id: "EMP001",
            esic_no: "1234567890",
            uan: "123456789012",
            basic: 15000,
            da: 775,
            total_days: 30,
            paid_days: 30,
          };
          sampleRow[col.label] = defaults[col.key] ?? "";
        } else {
          sampleRow[col.label] = col.formula ? "(auto-calculated)" : 0;
        }
      }
    }

    const worksheet = XLSX.utils.json_to_sheet([sampleRow]);
    const colCount = Object.keys(sampleRow).length;
    worksheet["!cols"] = Array(colCount).fill({ wch: 18 });
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Sample");
    XLSX.writeFile(workbook, "salary_template_sample.xlsx");
    setAlert({ type: "success", message: "Sample file downloaded" });
  };
  const { currentUser } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [managers, setManagers] = useState<ManagerOption[]>([]);
  const [loading, setLoading] = useState(true);
  // Active templates for export (all templates for the company)
  const [allTemplates, setAllTemplates] = useState<
    import("@/lib/salaryTemplateService").SalaryTemplate[]
  >([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedManagerId, setSelectedManagerId] = useState("all");
  // Attendance period that scopes the export, chosen via separate Month and
  // Year selectors (month-and-year format).
  const [selectedMonth, setSelectedMonth] = useState<number>(
    new Date().getMonth() + 1,
  );
  const [selectedYear, setSelectedYear] = useState<number>(
    new Date().getFullYear(),
  );
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [tabValue, setTabValue] = useState(0);

  // Dialog states
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showCalculationDialog, setShowCalculationDialog] = useState(false);
  const [showConfigDialog, setShowConfigDialog] = useState(false);
  const [showBulkEditDialog, setShowBulkEditDialog] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);

  // Custom template column values for the edit dialog (key → number)
  // These are no-formula columns from the employee's assigned template (e.g. conv_allowance, washing_allowance)
  const [templateColumnValues, setTemplateColumnValues] = useState<Record<string, number>>({});

  // Form data
  const [editData, setEditData] = useState<SalaryCalculationData>({
    esicNo: "",
    uan: "",
    basic: 0,
    da: 0,
    totalDays: 30,
    paidDays: 30,
    singleOTHours: 0,
    doubleOTHours: 0,
    difference: 0,
    advance: 0,
    isSkillBased: false,
    skillCategory: "",
    skillAmount: 0,
    customAllowances: [],
    customBonuses: [],
    customDeductions: [],
    hraPercentage: 5,
    esicEmployeePercentage: 0.75,
    esicEmployerPercentage: 3.25,
    pfEmployeePercentage: 12,
    pfEmployerPercentage: 13,
    mlwfEmployerAmount: 1,
  });

  // Bulk edit data
  const [bulkEditData, setBulkEditData] = useState<SalaryCalculationData>({
    esicNo: "",
    uan: "",
    basic: 0,
    da: 0,
    totalDays: undefined,
    paidDays: undefined,
    singleOTHours: 0,
    doubleOTHours: 0,
    difference: 0,
    advance: 0,
    isSkillBased: false,
    skillCategory: "",
    skillAmount: 0,
    customAllowances: [],
    customBonuses: [],
    customDeductions: [],
    hraPercentage: 5,
    esicEmployeePercentage: 0.75,
    esicEmployerPercentage: 3.25,
    pfEmployeePercentage: 12,
    pfEmployerPercentage: 13,
    mlwfEmployerAmount: 1,
  });

  // Skill categories
  const [skillCategories, setSkillCategories] = useState<SkillCategory[]>([]);

  // Custom calculation parameters
  const [customParameters, setCustomParameters] = useState<
    {
      id: string;
      name: string;
      type: "addition" | "deduction";
      calculationType: "percentage" | "fixed";
      appliesTo: "gross" | "basic" | "net" | "ctc";
      formula: string;
      description?: string;
    }[]
  >([]);

  // Ensure current tab value stays valid when the number of tabs changes
  useEffect(() => {
    const tabCount = 5 + (customParameters.length > 0 ? 1 : 0);
    if (tabValue >= tabCount) {
      setTabValue(Math.max(0, tabCount - 1));
    }
  }, [customParameters.length]);

  // Per-section custom columns (render-only; default value '-')
  const [customColumns, setCustomColumns] = useState<
    {
      id: string;
      name: string;
      section: "info" | "earnings" | "deductions" | "ctc" | "custom";
    }[]
  >([]);

  // Delete-column dialog state
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleteSection, setDeleteSection] = useState<
    "info" | "earnings" | "deductions" | "ctc" | "custom" | null
  >(null);
  const [columnToDeleteId, setColumnToDeleteId] = useState<string>("");

  // Loading states
  const [editLoading, setEditLoading] = useState(false);
  const [uploadLoading, setUploadLoading] = useState(false);
  const [configLoading, setConfigLoading] = useState(false);
  const [alert, setAlert] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  // Enable/disable advanced calculation features
  const [enableAdvancedCalculations, setEnableAdvancedCalculations] =
    useState<boolean>(true);
  const [showDisableConfirm, setShowDisableConfirm] = useState(false);
  const [backupAdvanced, setBackupAdvanced] = useState<null | {
    skillCategories: any[];
    customParameters: any[];
    customColumns: any[];
  }>(null);

  // Formula calculator (config dialog) state
  const [formulaTargetId, setFormulaTargetId] = useState<string>("");
  const [formulaExpression, setFormulaExpression] = useState<string>("");
  const [formulaApplying, setFormulaApplying] = useState<boolean>(false);
  const [formulaSuggestionsOpen, setFormulaSuggestionsOpen] =
    useState<boolean>(false);
  const [formulaDrafts, setFormulaDrafts] = useState<
    {
      id: string;
      name: string;
      targetId: string;
      expression: string;
      createdAt: number;
    }[]
  >([]);
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] =
    useState<number>(-1);

  // Build a registry of all available columns across tabs
  const normalizeColumnKey = (name: string) =>
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "");

  const builtInColumns: {
    id: string;
    name: string;
    section: "info" | "earnings" | "deductions" | "ctc" | "custom";
    key: string;
  }[] = [
    // Info & Basic
    { id: "name", name: "Name", section: "info", key: "name" },
    {
      id: "employee_id",
      name: "Employee ID",
      section: "info",
      key: "employee_id",
    },
    { id: "esic_no", name: "ESIC No", section: "info", key: "esic_no" },
    { id: "uan", name: "UAN", section: "info", key: "uan" },
    { id: "basic", name: "Basic Salary", section: "info", key: "basic" },
    { id: "da", name: "D.A.", section: "info", key: "da" },
    {
      id: "total_paid_days",
      name: "Paid Days",
      section: "info",
      key: "paid_days",
    },
    // Earnings & Overtime
    { id: "hra", name: "HRA", section: "earnings", key: "hra" },
    {
      id: "gross_rate_pm",
      name: "Gross Rate PM",
      section: "earnings",
      key: "gross_rate_pm",
    },
    {
      id: "gross_earning",
      name: "Gross Earning",
      section: "earnings",
      key: "gross_earning",
    },
    {
      id: "ot_rate",
      name: "OT Rate/Hour",
      section: "earnings",
      key: "ot_rate",
    },
    {
      id: "ot_hours_s",
      name: "Single OT Hours",
      section: "earnings",
      key: "single_ot_hours",
    },
    {
      id: "ot_hours_d",
      name: "Double OT Hours",
      section: "earnings",
      key: "double_ot_hours",
    },
    {
      id: "ot_amount",
      name: "OT Amount",
      section: "earnings",
      key: "ot_amount",
    },
    {
      id: "total_gross",
      name: "Total Gross",
      section: "earnings",
      key: "total_gross",
    },
    // Deductions & Net
    {
      id: "professional_tax",
      name: "Prof. Tax",
      section: "deductions",
      key: "professional_tax",
    },
    {
      id: "esic_employee",
      name: "ESIC (0.75%)",
      section: "deductions",
      key: "esic_employee",
    },
    { id: "pf_base", name: "PF Base", section: "deductions", key: "pf_base" },
    {
      id: "pf_employee",
      name: "PF (12%)",
      section: "deductions",
      key: "pf_employee",
    },
    {
      id: "total_deduction",
      name: "Total Deduction",
      section: "deductions",
      key: "total_deduction",
    },
    {
      id: "net_salary",
      name: "Net Salary",
      section: "deductions",
      key: "net_salary",
    },
    // CTC
    {
      id: "esic_employer",
      name: "Employer ESIC (3.25%)",
      section: "ctc",
      key: "esic_employer",
    },
    {
      id: "pf_employer",
      name: "Employer PF (13%)",
      section: "ctc",
      key: "pf_employer",
    },
    { id: "mlwf_employer", name: "MLWF", section: "ctc", key: "mlwf_employer" },
    {
      id: "ctc_per_month",
      name: "CTC Per Month",
      section: "ctc",
      key: "ctc_per_month",
    },
  ];

  const allColumns = () => {
    const customs = customColumns.map((c) => ({
      id: `custom_${c.id}`,
      name: c.name,
      section: c.section,
      key: normalizeColumnKey(c.name),
    }));
    return [...builtInColumns, ...customs];
  };

  // Token helpers used by autocomplete
  const getLastToken = (s: string) => {
    const m = s.match(/([a-zA-Z_][a-zA-Z0-9_]*)$/);
    return m ? m[1] : "";
  };
  const replaceLastToken = (s: string, replacement: string) => {
    const token = getLastToken(s);
    if (!token) return s + replacement;
    return s.replace(/([a-zA-Z_][a-zA-Z0-9_]*)$/, replacement);
  };

  const filteredSuggestions = (() => {
    const token = getLastToken(formulaExpression).toLowerCase();
    if (!token) return [];
    return allColumns()
      .map((c) => normalizeColumnKey(c.name))
      .filter((option) => option.toLowerCase().includes(token));
  })();

  const getEmployeeBasicSalary = (employee: Employee): number => {
    const basicValue = employee.salary?.basic ?? employee.salary?.base ?? 0;
    const parsedBasic = Number(basicValue);
    return Number.isFinite(parsedBasic) ? parsedBasic : 0;
  };

  const buildEmployeeContext = (employee: Employee) => {
    const s = getEmployeeSalaryWithCustomParams(employee);
    const base = employee.salary || {};
    const totalDaysVal = Number((base as any).totalDays || 30);
    const paidDaysVal = Number((base as any).paidDays || totalDaysVal);
    const presentDays = Number((base as any).presentDays ?? paidDaysVal);
    const absentDays = Number(
      (base as any).absentDays ?? Math.max(0, totalDaysVal - paidDaysVal),
    );
    const halfDayDays = Number((base as any).halfDayDays || 0);
    const leaveDays = Number((base as any).leaveDays || 0);
    const unmarkedDays = Number((base as any).unmarkedDays || 0);

    const ctx: Record<string, any> = {
      // info
      name: employee.fullName,
      employee_id: employee.employeeId,
      esic_no: employee.esicNo || null,
      uan: employee.uan || null,
      basic: getEmployeeBasicSalary(employee),
      da: Number((base as any).da || 0),
      total_days: totalDaysVal,
      paid_days: paidDaysVal,
      present_days: presentDays,
      absent_days: absentDays,
      half_days: halfDayDays,
      half_day_days: halfDayDays, // legacy alias
      leave_days: leaveDays,
      unmarked_days: unmarkedDays,
      // earnings
      hra: Number(s.hra || 0),
      gross_rate_pm: Number(s.grossRatePM || 0),
      gross_earning: Number(s.totalGrossEarning || 0),
      ot_rate: Number(s.otRatePerHour || 0),
      single_ot_hours: Number((base as any).singleOTHours || 0),
      double_ot_hours: Number((base as any).doubleOTHours || 0),
      ot_amount: Number(s.otAmount || 0),
      total_gross: Number(s.totalGrossEarning || 0),
      // deductions
      professional_tax: Number(s.professionalTax || 0),
      esic_employee: Number(s.esicEmployee || 0),
      pf_base: Number(s.pfBase || 0),
      pf_employee: Number(s.pfEmployee || 0),
      total_deduction: Number(s.totalDeduction || 0),
      net_salary: Number(s.netSalary || 0),
      // ctc
      esic_employer: Number(s.esicEmployer || 0),
      pf_employer: Number(s.pfEmployer || 0),
      mlwf_employer: Number(s.mlwfEmployer || 0),
      ctc_per_month: Number(s.ctcPerMonth || 0),
    };
    // custom columns stored under salary with normalized keys (if present)
    // Treat missing/empty values as 0 so formulas referencing them still compute correctly
    customColumns.forEach((c) => {
      const key = normalizeColumnKey(c.name);
      const value = (employee as any).salary?.[key];
      ctx[key] = typeof value === "number" ? value : 0;
    });
    // merge overrides if present (take precedence when not '-')
    const overrides = (employee as any).salaryOverrides || {};
    Object.keys(overrides).forEach((k) => {
      const v = overrides[k];
      if (
        v !== "-" &&
        v !== undefined &&
        v !== null &&
        Number.isFinite(Number(v))
      ) {
        ctx[k] = Number(v);
      }
    });
    return ctx;
  };

  const evaluateFormula = (expr: string, context: Record<string, any>) => {
    // Replace variables with values; unknowns and empty/null values become 0
    const replaced = expr.replace(/([a-zA-Z_][a-zA-Z0-9_]*)/g, (m) => {
      const key = m.toLowerCase();
      if (Object.prototype.hasOwnProperty.call(context, key)) {
        const v = context[key];
        // Treat null, undefined, "-", NaN, or non-numeric as 0
        if (v === null || v === undefined || v === "-" || (typeof v !== "number" && typeof v !== "string")) return "0";
        const n = Number(v);
        return Number.isFinite(n) ? String(n) : "0";
      }
      return "0";
    });
    if (!/^[0-9+\-*/(). ]+$/.test(replaced)) return { ok: false, value: "-" };
    try {
      // eslint-disable-next-line no-eval
      const val = eval(replaced);
      return {
        ok: true,
        value: typeof val === "number" && Number.isFinite(val) ? val : "-",
      };
    } catch {
      return { ok: false, value: "-" };
    }
  };

  // Render value helper for custom columns in tables
  const getCustomColumnValue = (employee: Employee, name: string) => {
    const key = normalizeColumnKey(name);
    const v = (employee as any).salary?.[key];
    if (v === "-" || v === undefined || v === null) return "-";
    if (typeof v === "number") return formatCurrency(v);
    return String(v);
  };

  const applyFormulaToEmployees = async () => {
    if (
      !formulaTargetId ||
      !formulaExpression ||
      employees.length === 0 ||
      !currentUser?.uid
    )
      return;
    setFormulaApplying(true);
    try {
      const target = allColumns().find((c) => c.id === formulaTargetId);
      if (!target) return;
      const targetKey = normalizeColumnKey(target.name);

      const ops: Promise<any>[] = [];
      for (const emp of employees) {
        const ctx = buildEmployeeContext(emp);
        const result = evaluateFormula(formulaExpression, ctx);
        const updatePayload: any = { updatedAt: new Date() };
        if (formulaTargetId.startsWith("custom_")) {
          updatePayload[`salary.${targetKey}`] =
            result.value === "-" ? "-" : Number(result.value);
        } else {
          updatePayload[`salaryOverrides.${target.key}`] =
            result.value === "-" ? "-" : Number(result.value);
        }
        ops.push(updateDoc(doc(db, "employees", emp.id), updatePayload));
      }
      await Promise.all(ops);

      // Auto-save as draft after successful application
      await autoSaveFormulaDraft();

      setAlert({ type: "success", message: "Formula applied and saved!" });
    } catch (e) {
      console.error("Error applying formula:", e);
      setAlert({
        type: "error",
        message:
          "Failed to apply formula. Please check expression and try again.",
      });
    } finally {
      setFormulaApplying(false);
      // reload employees to reflect any data changes
      loadEmployees();
    }
  };

  useEffect(() => {
    loadEmployees();
    loadManagers();
    loadSalaryStructureConfig();
    // Load all templates for export use
    if (currentUser?.uid) {
      salaryTemplateService
        .getAll(currentUser.uid)
        .then(setAllTemplates)
        .catch(console.error);
    }
  }, [currentUser]);

  useEffect(() => {
    setPage(0);
  }, [searchTerm, selectedManagerId]);

  // Reload managers (and templates) when parent signals a refresh (e.g. after template assignment)
  useEffect(() => {
    if (refreshKey === undefined || refreshKey === 0) return;
    loadManagers();
    if (currentUser?.uid) {
      salaryTemplateService
        .getAll(currentUser.uid)
        .then(setAllTemplates)
        .catch(console.error);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  // When the advanced calculations toggle changes, persist immediate effect:
  // - If disabled: remove advanced arrays from firebase (preserve formulaDrafts)
  // - If enabled: restore defaults (re-create default config) and reload
  useEffect(() => {
    const applyToggle = async () => {
      if (!currentUser?.uid) return;
      const companyId = currentUser.uid;
      try {
        setConfigLoading(true);
        if (!enableAdvancedCalculations) {
          // Overwrite the salaryStructure doc so only formulaDrafts and customColumns remain (everything else removed)
          await setDoc(doc(db, "salaryStructure", companyId), { merge: false });
          // Reload config to reflect the minimal state locally
          await loadSalaryStructureConfig();
          setAlert({
            type: "success",
            message:
              "Advanced calculation features disabled. Only Column Formula Calculator drafts and Custom Columns retained.",
          });
        } else {
          // When enabling, try to restore backupAdvanced if present; otherwise recreate defaults
          const configDoc = await getDoc(doc(db, "salaryStructure", companyId));
          if (configDoc.exists()) {
            const data = configDoc.data();
            if (data.backupAdvanced) {
              // restore advanced fields from backup
              await setDoc(
                doc(db, "salaryStructure", companyId),
                {
                  skillCategories: data.backupAdvanced.skillCategories || [],
                  customParameters: data.backupAdvanced.customParameters || [],
                  customColumns: data.backupAdvanced.customColumns || [],
                  formulaDrafts: data.formulaDrafts || [],
                  enableAdvancedCalculations: true,
                  updatedAt: new Date(),
                },
                { merge: true },
              );
              // remove backupAdvanced field
              await updateDoc(doc(db, "salaryStructure", companyId), {
                backupAdvanced: deleteField(),
              });
              await loadSalaryStructureConfig();
              setAlert({
                type: "success",
                message:
                  "Advanced calculation features enabled. Backup restored.",
              });
            } else {
              // no backup found - recreate defaults
              await createDefaultSalaryStructure(companyId);
              await loadSalaryStructureConfig();
              setAlert({
                type: "success",
                message:
                  "Advanced calculation features enabled. Defaults restored.",
              });
            }
          } else {
            await createDefaultSalaryStructure(companyId);
            await loadSalaryStructureConfig();
            setAlert({
              type: "success",
              message:
                "Advanced calculation features enabled. Defaults restored.",
            });
          }
        }
      } catch (e) {
        console.error("Error toggling advanced calculations:", e);
        setAlert({
          type: "error",
          message: "Failed to update advanced calculation setting.",
        });
      } finally {
        setConfigLoading(false);
      }
    };

    // run the side effect only when toggle changes after initial load
    applyToggle();
  }, [enableAdvancedCalculations]);

  // Load salary structure configuration from Firebase
  const loadSalaryStructureConfig = async () => {
    if (!currentUser?.uid) return;

    try {
      setConfigLoading(true);
      const companyId = currentUser.uid; // Admin's UID is the company ID
      const configDoc = await getDoc(doc(db, "salaryStructure", companyId));

      if (configDoc.exists()) {
        const config = configDoc.data();

        // Load the configuration into state
        setEditData((prev) => ({
          ...prev,
          hraPercentage: config.hraPercentage || 5,
          esicEmployeePercentage: config.esicEmployeePercentage || 0.75,
          esicEmployerPercentage: config.esicEmployerPercentage || 3.25,
          pfEmployeePercentage: config.pfEmployeePercentage || 12,
          pfEmployerPercentage: config.pfEmployerPercentage || 13,
          mlwfEmployerAmount: config.mlwfEmployerAmount ?? 1,
        }));

        setSkillCategories(config.skillCategories || []);
        setCustomParameters(config.customParameters || []);
        setCustomColumns(config.customColumns || []);
        setFormulaDrafts(config.formulaDrafts || []);
        console.log(
          "Loaded custom columns from Firebase:",
          config.customColumns,
        );
        // enableAdvancedCalculations flag controls availability of advanced features
        setEnableAdvancedCalculations(
          config.enableAdvancedCalculations !== false,
        );
      } else {
        // Create default configuration if it doesn't exist
        await createDefaultSalaryStructure(companyId);
      }
    } catch (error) {
      console.error("Error loading salary structure config:", error);
      setAlert({
        type: "error",
        message: "Failed to load salary configuration",
      });
    } finally {
      setConfigLoading(false);
    }
  };

  // Create default salary structure configuration
  const createDefaultSalaryStructure = async (companyId: string) => {
    // First check if document already exists
    const existingDoc = await getDoc(doc(db, "salaryStructure", companyId));

    const defaultConfig = {
      companyId,
      hraPercentage: 5,
      esicEmployeePercentage: 0.75,
      esicEmployerPercentage: 3.25,
      pfEmployeePercentage: 12,
      pfEmployerPercentage: 13,
      mlwfEmployerAmount: 1,
      workingHoursPerDay: 8,
      standardWorkingDays: 30,
      professionalTaxSlabs: [
        { minSalary: 0, maxSalary: 7500, taxAmount: 0 },
        { minSalary: 7501, maxSalary: 10000, taxAmount: 175 },
        { minSalary: 10001, maxSalary: 999999, taxAmount: 200 },
      ],
      overtimeRules: {
        singleOTMultiplier: 1,
        doubleOTMultiplier: 2,
        holidayOTMultiplier: 2.5,
      },
      skillCategories: [],
      customParameters: [],
      customColumns: existingDoc.exists()
        ? existingDoc.data().customColumns || []
        : [],
      formulaDrafts: existingDoc.exists()
        ? existingDoc.data().formulaDrafts || []
        : [],
      enableAdvancedCalculations: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    try {
      // Use merge to preserve any existing customColumns and formulaDrafts
      await setDoc(doc(db, "salaryStructure", companyId), defaultConfig, {
        merge: true,
      });
      console.log("Default salary structure created for company:", companyId);
    } catch (error) {
      console.error("Error creating default salary structure:", error);
    }
  };

  // Save salary structure configuration to Firebase
  const saveSalaryStructureConfig = async () => {
    if (!currentUser?.uid) return;

    try {
      setConfigLoading(true);
      const companyId = currentUser.uid;

      if (!enableAdvancedCalculations) {
        // When disabled, persist only formulaDrafts, customColumns and the flag (overwrite)
        const minimalConfig = {
          companyId,
          formulaDrafts: formulaDrafts,
          customColumns: customColumns,
          enableAdvancedCalculations: false,
          updatedAt: new Date(),
        };
        await setDoc(doc(db, "salaryStructure", companyId), minimalConfig, {
          merge: false,
        });
      } else {
        const configData = {
          companyId,
          hraPercentage: editData.hraPercentage,
          esicEmployeePercentage: editData.esicEmployeePercentage,
          esicEmployerPercentage: editData.esicEmployerPercentage,
          pfEmployeePercentage: editData.pfEmployeePercentage,
          pfEmployerPercentage: editData.pfEmployerPercentage,
          mlwfEmployerAmount: editData.mlwfEmployerAmount,
          workingHoursPerDay: 8, // This could be made configurable
          standardWorkingDays: 30, // This could be made configurable
          professionalTaxSlabs: [
            { minSalary: 0, maxSalary: 7500, taxAmount: 0 },
            { minSalary: 7501, maxSalary: 10000, taxAmount: 175 },
            { minSalary: 10001, maxSalary: 999999, taxAmount: 200 },
          ],
          overtimeRules: {
            singleOTMultiplier: 1,
            doubleOTMultiplier: 2,
            holidayOTMultiplier: 2.5,
          },
          skillCategories: skillCategories,
          customParameters: customParameters,
          customColumns: customColumns,
          formulaDrafts: formulaDrafts,
          enableAdvancedCalculations: true,
          updatedAt: new Date(),
        };

        await setDoc(doc(db, "salaryStructure", companyId), configData, {
          merge: true,
        });
      }

      setAlert({
        type: "success",
        message: `Configuration saved successfully! Updated ${customParameters.length} custom parameters and ${skillCategories.length} skill categories.`,
      });

      return true;
    } catch (error) {
      console.error("Error saving salary structure config:", error);
      setAlert({
        type: "error",
        message: "Failed to save configuration. Please try again.",
      });
      return false;
    } finally {
      setConfigLoading(false);
    }
  };

  const loadEmployees = async () => {
    if (!currentUser?.uid) return;

    try {
      setLoading(true);
      const employeesQuery = query(
        collection(db, "employees"),
        where("companyId", "==", currentUser.uid),
      );
      const querySnapshot = await getDocs(employeesQuery);
      const employeesData: Employee[] = [];
      querySnapshot.forEach((doc) => {
        employeesData.push({ id: doc.id, ...doc.data() } as Employee);
      });
      setEmployees(employeesData);
    } catch (error) {
      console.error("Error loading employees:", error);
      setAlert({ type: "error", message: "Failed to load employees" });
    } finally {
      setLoading(false);
    }
  };

  const loadManagers = async () => {
    if (!currentUser?.uid) return;

    try {
      const managersQuery = query(
        collection(db, "managers"),
        where("companyId", "==", currentUser.uid),
      );
      const querySnapshot = await getDocs(managersQuery);
      const managerOptions: ManagerOption[] = [];

      querySnapshot.forEach((managerDoc) => {
        const data = managerDoc.data();
        managerOptions.push({
          id: managerDoc.id,
          name: data.fullName || data.name || data.email || "Unknown Manager",
          salaryTemplateId: data.salaryTemplateId || undefined,
        });
      });

      setManagers(managerOptions);
    } catch (error) {
      console.error("Error loading managers:", error);
    }
  };

  // Salary calculation functions
  const calculateHRA = (
    basic: number,
    da: number,
    hraPercentage: number = 5,
  ): number => {
    return Math.round((basic + da) * (hraPercentage / 100));
  };

  const calculateGrossRate = (
    basic: number,
    da: number,
    hra: number,
  ): number => {
    return basic + da + hra;
  };

  const calculateGrossEarning = (
    grossRate: number,
    totalDays: number,
    paidDays: number,
  ): number => {
    return Math.round((grossRate / totalDays) * paidDays);
  };

  const calculateOTRate = (grossEarning: number, paidDays: number): number => {
    return grossEarning / paidDays / 8;
  };

  const calculateOTAmount = (
    otRate: number,
    singleOTHours: number,
    doubleOTHours: number,
  ): number => {
    return Math.round(singleOTHours * otRate + doubleOTHours * otRate * 2);
  };

  const calculateProfessionalTax = (totalGross: number): number => {
    if (totalGross < 7501) return 0;
    if (totalGross <= 10000) return 175;
    return 200;
  };

  const calculateESICEmployee = (
    totalGross: number,
    percentage: number = 0.75,
  ): number => {
    return Math.ceil(totalGross * (percentage / 100));
  };

  const calculatePFBase = (
    basic: number,
    da: number,
    totalDays: number,
    paidDays: number,
  ): number => {
    return Math.round(((basic + da) / totalDays) * paidDays);
  };

  const calculatePFEmployee = (
    pfBase: number,
    percentage: number = 12,
  ): number => {
    return Math.round(pfBase * (percentage / 100));
  };

  const calculateESICEmployer = (
    totalGross: number,
    percentage: number = 3.25,
  ): number => {
    return Math.round(totalGross * (percentage / 100));
  };

  const calculatePFEmployer = (
    pfBase: number,
    percentage: number = 13,
  ): number => {
    return Math.round(pfBase * (percentage / 100));
  };

  const calculateMLWFEmployer = (
    totalGross: number,
    mlwfAmount: number = 1,
  ): number => {
    // MLWF (Maharashtra Labour Welfare Fund) - configurable amount per employee per month
    // This can vary by state and company policy
    return totalGross > 0 ? mlwfAmount : 0; // Configured amount if employee has salary, ₹0 otherwise
  };

  // Get current salary structure configuration
  const getCurrentSalaryConfig = () => {
    return {
      hraPercentage: editData.hraPercentage,
      esicEmployeePercentage: editData.esicEmployeePercentage,
      esicEmployerPercentage: editData.esicEmployerPercentage,
      pfEmployeePercentage: editData.pfEmployeePercentage,
      pfEmployerPercentage: editData.pfEmployerPercentage,
      customParameters: customParameters,
      skillCategories: skillCategories,
      customColumns: customColumns,
      formulaDrafts: formulaDrafts,
    };
  };

  // Add a custom column to a section
  const handleAddSectionColumn = async (
    section: "info" | "earnings" | "deductions" | "ctc" | "custom",
  ) => {
    const name = window.prompt("Enter column name");
    if (!name) return;

    const newColumn = {
      id: Date.now().toString(),
      name: name.trim(),
      section,
    } as const;

    const updated = [...customColumns, newColumn];
    setCustomColumns(updated);

    try {
      if (!currentUser?.uid) return;
      console.log("Saving custom columns to Firebase:", updated);
      await setDoc(
        doc(db, "salaryStructure", currentUser.uid),
        { customColumns: updated, updatedAt: new Date() },
        { merge: true },
      );
      setAlert({
        type: "success",
        message: `Column "${newColumn.name}" added to ${section} section`,
      });
      console.log("Custom column saved successfully");
      // Reload config from Firestore to ensure UI matches persisted state
      await loadSalaryStructureConfig();
    } catch (e) {
      console.error("Failed to add column:", e);
      setAlert({
        type: "error",
        message: "Failed to add column. Please try again.",
      });
    }
  };

  // Opens the delete dialog for a given section
  const handleDeleteSectionColumn = (
    section: "info" | "earnings" | "deductions" | "ctc" | "custom",
  ) => {
    setDeleteSection(section);
    setColumnToDeleteId("");
    setShowDeleteDialog(true);
  };

  // Confirm and perform deletion using selected column id
  const confirmDeleteSectionColumn = async () => {
    if (!deleteSection) return;
    const columnToDelete = customColumns.find(
      (col) => col.id === columnToDeleteId && col.section === deleteSection,
    );
    if (!columnToDelete) {
      window.alert("Please select a valid column to delete");
      return;
    }

    const updated = customColumns.filter((col) => col.id !== columnToDelete.id);
    setCustomColumns(updated);
    setShowDeleteDialog(false);

    try {
      if (!currentUser?.uid) return;
      console.log("Deleting custom column, remaining columns:", updated);
      await setDoc(
        doc(db, "salaryStructure", currentUser.uid),
        { customColumns: updated, updatedAt: new Date() },
        { merge: true },
      );
      setAlert({
        type: "success",
        message: `Column "${columnToDelete.name}" deleted from ${deleteSection} section`,
      });
      console.log("Custom column deleted successfully");
      // Reload config from Firestore to ensure UI matches persisted state
      await loadSalaryStructureConfig();
    } catch (e) {
      console.error("Failed to delete column:", e);
      setAlert({
        type: "error",
        message: "Failed to delete column. Please try again.",
      });
    }
  };

  // Calculate salary with current custom parameters for display
  const getEmployeeSalaryWithCustomParams = (employee: Employee) => {
    const salaryData: SalaryCalculationData = {
      esicNo: employee.esicNo || "",
      uan: employee.uan || "",
      basic: getEmployeeBasicSalary(employee),
      da: employee.salary?.da || 0,
      totalDays: employee.salary?.totalDays || 30,
      paidDays: employee.salary?.paidDays || 30,
      singleOTHours: employee.salary?.singleOTHours || 0,
      doubleOTHours: employee.salary?.doubleOTHours || 0,
      difference: employee.salary?.difference || 0,
      advance: employee.salary?.advance || 0,
      isSkillBased: employee.salary?.isSkillBased || false,
      skillCategory: employee.salary?.skillCategory || "",
      skillAmount: employee.salary?.skillAmount || 0,
      customAllowances: employee.salary?.customAllowances || [],
      customBonuses: employee.salary?.customBonuses || [],
      customDeductions: employee.salary?.customDeductions || [],
      hraPercentage: editData.hraPercentage,
      esicEmployeePercentage: editData.esicEmployeePercentage,
      esicEmployerPercentage: editData.esicEmployerPercentage,
      pfEmployeePercentage: editData.pfEmployeePercentage,
      pfEmployerPercentage: editData.pfEmployerPercentage,
      mlwfEmployerAmount: editData.mlwfEmployerAmount,
    };

    return calculateFullSalary(salaryData);
  };

  const calculateFullSalary = (data: SalaryCalculationData) => {
    // Apply skill-based amount if enabled
    let adjustedBasic = data.basic;
    let adjustedDa = data.da;

    if (data.isSkillBased && data.skillAmount > 0) {
      // Replace the basic salary with the skill-based amount
      adjustedBasic = data.skillAmount;
      // Keep DA as is or you can adjust it proportionally if needed
    }

    const hra = calculateHRA(adjustedBasic, adjustedDa, data.hraPercentage);

    // Calculate custom allowances total
    const totalCustomAllowances = data.customAllowances.reduce(
      (sum, allowance) => sum + allowance.amount,
      0,
    );

    // Calculate custom bonuses total
    const totalCustomBonuses = data.customBonuses.reduce(
      (sum, bonus) => sum + bonus.amount,
      0,
    );

    // Use default values if totalDays or paidDays are undefined
    const totalDays = data.totalDays ?? 30;
    const paidDays = data.paidDays ?? 30;

    // Calculate custom parameters with proper context
    const calculateCustomParameterValue = (param: any) => {
      try {
        // Create a safe evaluation context with available variables
        // Note: For basic-level calculations, we use original values
        // For other levels, we may need to calculate intermediate values
        const baseGrossRate = calculateGrossRate(
          adjustedBasic,
          adjustedDa,
          hra,
        );

        const context = {
          basic: adjustedBasic,
          da: adjustedDa,
          hra: hra,
          grossRate: baseGrossRate,
          totalDays: totalDays,
          paidDays: paidDays,
        };

        // Simple formula evaluation (in production, use a proper formula parser)
        let formula = param.formula || "0";

        // Replace variables in formula
        Object.entries(context).forEach(([key, value]) => {
          const regex = new RegExp(`\\b${key}\\b`, "g");
          formula = formula.replace(regex, value.toString());
        });

        // Basic math evaluation (be careful with eval in production!)
        try {
          // Only allow basic math operations for security
          if (/^[0-9+\-*/.() ]+$/.test(formula)) {
            return eval(formula) || 0;
          } else {
            // If formula contains variables or complex expressions, return 0 for now
            return 0;
          }
        } catch {
          return 0;
        }
      } catch {
        return 0;
      }
    };

    // Separate custom parameters by where they apply
    let basicCustomAdditions = 0;
    let basicCustomDeductions = 0;
    let grossCustomAdditions = 0;
    let grossCustomDeductions = 0;
    let netCustomAdditions = 0;
    let netCustomDeductions = 0;
    let ctcCustomAdditions = 0;
    let ctcCustomDeductions = 0;

    customParameters.forEach((param) => {
      const value = calculateCustomParameterValue(param);

      if (param.appliesTo === "basic") {
        if (param.type === "addition") {
          basicCustomAdditions += value;
        } else {
          basicCustomDeductions += value;
        }
      } else if (param.appliesTo === "gross") {
        if (param.type === "addition") {
          grossCustomAdditions += value;
        } else {
          grossCustomDeductions += value;
        }
      } else if (param.appliesTo === "net") {
        if (param.type === "addition") {
          netCustomAdditions += value;
        } else {
          netCustomDeductions += value;
        }
      } else if (param.appliesTo === "ctc") {
        if (param.type === "addition") {
          ctcCustomAdditions += value;
        } else {
          ctcCustomDeductions += value;
        }
      }
    });

    // Apply basic-level custom parameters
    const adjustedBasicWithCustom =
      adjustedBasic + basicCustomAdditions - basicCustomDeductions;
    const adjustedDaWithCustom = adjustedDa; // DA typically not affected by custom parameters

    const grossRate =
      calculateGrossRate(adjustedBasicWithCustom, adjustedDaWithCustom, hra) +
      totalCustomAllowances +
      grossCustomAdditions -
      grossCustomDeductions;
    const grossEarning = calculateGrossEarning(grossRate, totalDays, paidDays);
    const otRate = calculateOTRate(grossEarning, paidDays);
    const otAmount = calculateOTAmount(
      otRate,
      data.singleOTHours,
      data.doubleOTHours,
    );
    const totalGrossEarning =
      grossEarning + otAmount + data.difference + totalCustomBonuses;

    const professionalTax = calculateProfessionalTax(totalGrossEarning);
    const esicEmployee = calculateESICEmployee(
      totalGrossEarning,
      data.esicEmployeePercentage,
    );
    const pfBase = calculatePFBase(
      adjustedBasicWithCustom,
      adjustedDaWithCustom,
      totalDays,
      paidDays,
    );
    const pfEmployee = calculatePFEmployee(pfBase, data.pfEmployeePercentage);

    // Calculate custom deductions total
    const totalCustomDeductions = data.customDeductions.reduce(
      (sum, deduction) => sum + deduction.amount,
      0,
    );

    const totalDeduction =
      professionalTax +
      esicEmployee +
      pfEmployee +
      totalCustomDeductions +
      data.advance;

    // Apply net-level custom parameters
    const netSalaryBeforeCustom = totalGrossEarning - totalDeduction;
    const netSalary =
      netSalaryBeforeCustom + netCustomAdditions - netCustomDeductions;

    const esicEmployer = calculateESICEmployer(
      totalGrossEarning,
      data.esicEmployerPercentage,
    );
    const pfEmployer = calculatePFEmployer(pfBase, data.pfEmployerPercentage);
    const mlwfEmployer = calculateMLWFEmployer(
      totalGrossEarning,
      data.mlwfEmployerAmount,
    );

    // Apply CTC-level custom parameters
    const ctcBeforeCustom =
      totalGrossEarning + esicEmployer + pfEmployer + mlwfEmployer;
    const ctcPerMonth =
      ctcBeforeCustom + ctcCustomAdditions - ctcCustomDeductions;

    return {
      basic: adjustedBasic,
      da: adjustedDa,
      hra,
      grossRatePM: grossRate,
      otRatePerHour: otRate,
      singleOTHours: data.singleOTHours,
      doubleOTHours: data.doubleOTHours,
      otAmount,
      difference: data.difference,
      advance: data.advance,
      totalGrossEarning,
      professionalTax,
      esicEmployee,
      pfBase,
      pfEmployee,
      totalDeduction,
      netSalary,
      esicEmployer,
      pfEmployer,
      mlwfEmployer,
      ctcPerMonth,
      totalDays: totalDays,
      paidDays: paidDays,
      isSkillBased: data.isSkillBased,
      skillCategory: data.skillCategory,
      skillAmount: data.skillAmount,
      customAllowances: data.customAllowances,
      customBonuses: data.customBonuses,
      customDeductions: data.customDeductions,
      basicCustomAdditions,
      basicCustomDeductions,
      grossCustomAdditions,
      grossCustomDeductions,
      netCustomAdditions,
      netCustomDeductions,
      ctcCustomAdditions,
      ctcCustomDeductions,
      hraPercentage: data.hraPercentage,
      esicEmployeePercentage: data.esicEmployeePercentage,
      esicEmployerPercentage: data.esicEmployerPercentage,
      pfEmployeePercentage: data.pfEmployeePercentage,
      pfEmployerPercentage: data.pfEmployerPercentage,
    };
  };

  const filteredEmployees = employees.filter((employee) => {
    const matchesSearch =
      employee.fullName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      employee.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      employee.employeeId?.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesManager =
      selectedManagerId === "all" ||
      (Array.isArray(employee.assignedManagers) &&
        employee.assignedManagers.includes(selectedManagerId));

    return matchesSearch && matchesManager;
  });

  const isBlankCell = (value: unknown) =>
    value === undefined ||
    value === null ||
    (typeof value === "string" && value.trim() === "");

  const getRowValue = (row: Record<string, any>, keys: string[]) => {
    for (const key of keys) {
      if (Object.prototype.hasOwnProperty.call(row, key)) {
        return row[key];
      }
    }
    return undefined;
  };

  const resolveStringValue = (
    rowValue: unknown,
    existingValue: unknown,
    defaultValue: string,
  ) => {
    if (!isBlankCell(rowValue)) return String(rowValue).trim();
    if (!isBlankCell(existingValue)) return String(existingValue).trim();
    return defaultValue;
  };

  const resolveNumberValue = (
    rowValue: unknown,
    existingValue: unknown,
    defaultValue: number,
  ) => {
    const source = !isBlankCell(rowValue)
      ? rowValue
      : !isBlankCell(existingValue)
        ? existingValue
        : defaultValue;
    const parsed = Number(source);
    return Number.isFinite(parsed) ? parsed : defaultValue;
  };

  const resolveBooleanValue = (
    rowValue: unknown,
    existingValue: unknown,
    defaultValue: boolean,
  ) => {
    if (!isBlankCell(rowValue)) {
      if (typeof rowValue === "boolean") return rowValue;
      const normalized = String(rowValue).trim().toLowerCase();
      return (
        normalized === "yes" || normalized === "true" || normalized === "1"
      );
    }
    if (!isBlankCell(existingValue)) return Boolean(existingValue);
    return defaultValue;
  };

  const normalizeUploadedCustomValue = (value: unknown) => {
    if (isBlankCell(value)) return undefined;
    if (typeof value === "number") return value;

    const text = String(value).trim();
    const numericValue = Number(text);
    if (
      text !== "" &&
      Number.isFinite(numericValue) &&
      String(numericValue) === text
    ) {
      return numericValue;
    }

    return text;
  };

  const getActiveExportSections = (): TemplateSection[] => {
    if (selectedManagerId === "all") {
      return getUnionSections();
    }

    const tmpl = getTemplateForManagerId(selectedManagerId);
    return tmpl
      ? [...tmpl.sections].sort((a, b) => a.order - b.order)
      : getUnionSections();
  };

  const getAutoCalculatedLabels = () => {
    // Only include columns that actually have a formula expression in the active template.
    // Do NOT use a hardcoded list — columns like "Prof. Tax" and "MLWF" may be no-formula
    // in some templates, and adding them here would incorrectly suppress upload warnings
    // for those columns (Requirement 4.1, 4.2).
    const labels = new Set<string>();

    for (const section of getActiveExportSections()) {
      for (const column of section.columns) {
        if (column.formula?.expression) {
          labels.add(column.label);
        }
      }
    }

    return labels;
  };

  // File upload handler
  const handleFileUpload = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      setUploadLoading(true);
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data);
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const jsonData = XLSX.utils.sheet_to_json(worksheet) as any[];
      const autoCalculatedLabels = getAutoCalculatedLabels();
      const warningFields = new Set<string>();
      const activeSections = getActiveExportSections();
      const directFieldKeys = new Set([
        "name",
        "employee_id",
        "esic_no",
        "uan",
        "basic",
        "da",
        "total_days",
        "paid_days",
      ]);

      const updates = jsonData.map(async (row) => {
        const employee = employees.find(
          (emp) =>
            emp.employeeId === row["Employee ID"] ||
            emp.fullName === row["Name"],
        );

        if (!employee) return null;

        // Merge against this month's existing data (not the global record), so
        // uploading a specific month only changes that month.
        const existingSalary = getMonthlySalary(employee) as Record<
          string,
          any
        >;
        const currentExportRow = buildEmployeeExportRow(
          employee,
          getActiveExportSections(),
        );

        // Parse custom allowances, bonuses, and deductions
        const parseCustomItems = (str: string) => {
          if (!str) return [];
          return str
            .split(",")
            .map((item) => {
              const [label, amount] = item.split(":");
              return {
                label: label?.trim() || "",
                amount: parseFloat(amount) || 0,
              };
            })
            .filter((item) => item.label && item.amount > 0);
        };

        for (const label of autoCalculatedLabels) {
          const incomingValue = row[label];
          if (isBlankCell(incomingValue)) continue;

          const currentValue = currentExportRow[label];
          const incomingText = String(incomingValue).trim();
          const currentText = isBlankCell(currentValue)
            ? ""
            : String(currentValue).trim();
          const numericIncoming = Number(incomingText);
          const numericCurrent = Number(currentText);
          const sameValue =
            Number.isFinite(numericIncoming) && Number.isFinite(numericCurrent)
              ? numericIncoming === numericCurrent
              : incomingText === currentText;

          if (!sameValue) {
            warningFields.add(label);
          }
        }

        const salaryData: SalaryCalculationData = {
          esicNo: resolveStringValue(row["ESIC No"], employee.esicNo, ""),
          uan: resolveStringValue(row["UAN"], employee.uan, ""),
          basic: resolveNumberValue(
            row["Basic Salary"],
            existingSalary.basic ?? existingSalary.base,
            0,
          ),
          da: resolveNumberValue(row["DA"], existingSalary.da, 0),
          totalDays: resolveNumberValue(
            row["Total Days"],
            existingSalary.totalDays,
            30,
          ),
          paidDays: resolveNumberValue(
            row["Paid Days"],
            existingSalary.paidDays ?? existingSalary.totalDays,
            30,
          ),
          singleOTHours: resolveNumberValue(
            row["Single OT Hours"],
            existingSalary.singleOTHours,
            0,
          ),
          doubleOTHours: resolveNumberValue(
            row["Double OT Hours"],
            existingSalary.doubleOTHours,
            0,
          ),
          difference: resolveNumberValue(
            row["Difference"],
            existingSalary.difference,
            0,
          ),
          advance: resolveNumberValue(
            row["Advance"],
            existingSalary.advance,
            0,
          ),
          isSkillBased: resolveBooleanValue(
            row["Skill Based"],
            existingSalary.isSkillBased,
            false,
          ),
          skillCategory: resolveStringValue(
            row["Skill Category"],
            existingSalary.skillCategory,
            "",
          ),
          skillAmount: resolveNumberValue(
            row["Skill Amount"],
            existingSalary.skillAmount,
            0,
          ),
          customAllowances: !isBlankCell(row["Custom Allowances"])
            ? parseCustomItems(String(row["Custom Allowances"]))
            : Array.isArray(existingSalary.customAllowances)
              ? existingSalary.customAllowances
              : [],
          customBonuses: !isBlankCell(row["Custom Bonuses"])
            ? parseCustomItems(String(row["Custom Bonuses"]))
            : Array.isArray(existingSalary.customBonuses)
              ? existingSalary.customBonuses
              : [],
          customDeductions: !isBlankCell(row["Custom Deductions"])
            ? parseCustomItems(String(row["Custom Deductions"]))
            : Array.isArray(existingSalary.customDeductions)
              ? existingSalary.customDeductions
              : [],
          hraPercentage: resolveNumberValue(
            row["HRA Percentage"],
            existingSalary.hraPercentage ?? editData.hraPercentage,
            editData.hraPercentage,
          ),
          esicEmployeePercentage: resolveNumberValue(
            row["ESIC Employee Percentage"],
            existingSalary.esicEmployeePercentage ??
              editData.esicEmployeePercentage,
            editData.esicEmployeePercentage,
          ),
          esicEmployerPercentage: resolveNumberValue(
            row["ESIC Employer Percentage"],
            existingSalary.esicEmployerPercentage ??
              editData.esicEmployerPercentage,
            editData.esicEmployerPercentage,
          ),
          pfEmployeePercentage: resolveNumberValue(
            row["PF Employee Percentage"],
            existingSalary.pfEmployeePercentage ??
              editData.pfEmployeePercentage,
            editData.pfEmployeePercentage,
          ),
          pfEmployerPercentage: resolveNumberValue(
            row["PF Employer Percentage"],
            existingSalary.pfEmployerPercentage ??
              editData.pfEmployerPercentage,
            editData.pfEmployerPercentage,
          ),
          mlwfEmployerAmount: resolveNumberValue(
            row["MLWF Employer Amount"],
            existingSalary.mlwfEmployerAmount ?? editData.mlwfEmployerAmount,
            editData.mlwfEmployerAmount,
          ),
        };

        const calculatedSalary = calculateFullSalary(salaryData);
        const mergedSalary: Record<string, any> = {
          ...calculatedSalary,
        };

        customColumns.forEach((column) => {
          const key = normalizeColumnKey(column.name);
          const rowValue = getRowValue(row, [column.name, key]);
          const existingValue = existingSalary[key];
          if (!isBlankCell(rowValue)) {
            mergedSalary[key] = normalizeUploadedCustomValue(rowValue);
          } else if (!isBlankCell(existingValue) && existingValue !== "-") {
            mergedSalary[key] = existingValue;
          }
          // If both blank, don't set the key — avoids writing "-" to Firebase
        });

        activeSections.forEach((section) => {
          section.columns.forEach((column) => {
            if (column.formula?.expression || directFieldKeys.has(column.key)) {
              return;
            }

            const rowValue = getRowValue(row, [column.label, column.key]);
            const existingValue = existingSalary[column.key];
            if (!isBlankCell(rowValue)) {
              mergedSalary[column.key] = normalizeUploadedCustomValue(rowValue);
            } else if (!isBlankCell(existingValue) && existingValue !== "-") {
              mergedSalary[column.key] = existingValue;
            }
            // If both blank, don't set the key — avoids writing "-" to Firebase
          });
        });

        return updateDoc(doc(db, "employees", employee.id), {
          esicNo: salaryData.esicNo,
          uan: salaryData.uan,
          // Save this upload against the selected month only, so each month
          // keeps its own salary data (download May → upload as July keeps a
          // separate July copy).
          [`salaryByMonth.${getMonthlyKey()}`]: mergedSalary,
          // Keep the global salary in sync for the rest of the app (payroll,
          // edit dialog, slips) which still read employee.salary.
          salary: mergedSalary,
          updatedAt: new Date(),
        });
      });

      await Promise.all(updates.filter(Boolean));
      if (warningFields.size > 0) {
        window.alert(
          `You are trying to update is auto-calculated from calculations, so data from following field are remain unchanged:\n${Array.from(warningFields).join(", ")}`,
        );
      }
      const { month: uploadMonthLabel, year: uploadYearLabel } =
        getExportPeriodLabel();
      setAlert({
        type: "success",
        message: `Salary data uploaded for ${uploadMonthLabel} ${uploadYearLabel}!`,
      });
      loadEmployees();
    } catch (error) {
      console.error("Error uploading file:", error);
      setAlert({ type: "error", message: "Failed to upload salary data" });
    } finally {
      setUploadLoading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  // Download sample file
  // downloadSampleFile is now defined above with the other export helpers

  // Edit individual employee
  const handleIndividualEdit = (employee: Employee) => {
    setEditingEmployee(employee);
    setEditData({
      esicNo: employee.esicNo || "",
      uan: employee.uan || "",
      basic: getEmployeeBasicSalary(employee),
      da: employee.salary?.da || 0,
      totalDays: employee.salary?.totalDays || 30,
      paidDays: employee.salary?.paidDays || 30,
      singleOTHours: employee.salary?.singleOTHours || 0,
      doubleOTHours: employee.salary?.doubleOTHours || 0,
      difference: employee.salary?.difference || 0,
      advance: employee.salary?.advance || 0,
      isSkillBased: employee.salary?.isSkillBased || false,
      skillCategory: employee.salary?.skillCategory || "",
      skillAmount: employee.salary?.skillAmount || 0,
      customAllowances: employee.salary?.customAllowances || [],
      customBonuses: employee.salary?.customBonuses || [],
      customDeductions: employee.salary?.customDeductions || [],
      hraPercentage: employee.salary?.hraPercentage || 5,
      esicEmployeePercentage: employee.salary?.esicEmployeePercentage || 0.75,
      esicEmployerPercentage: employee.salary?.esicEmployerPercentage || 3.25,
      pfEmployeePercentage: employee.salary?.pfEmployeePercentage || 12,
      pfEmployerPercentage: employee.salary?.pfEmployerPercentage || 13,
      mlwfEmployerAmount: employee.salary?.mlwfEmployerAmount ?? 1,
    });

    // Load custom template column values (no-formula columns from the assigned template)
    const managerId =
      (Array.isArray(employee.assignedManagers)
        ? employee.assignedManagers[0]
        : employee.assignedManager) ?? "";
    const tmpl = getTemplateForManagerId(managerId);
    const directKeys = new Set(["name", "employee_id", "esic_no", "uan", "basic", "da", "total_days", "paid_days"]);
    const colVals: Record<string, number> = {};
    if (tmpl) {
      for (const sec of tmpl.sections) {
        for (const col of sec.columns) {
          if (!col.formula?.expression && !directKeys.has(col.key) && !col.isFixed) {
            colVals[col.key] = Number((employee.salary as any)?.[col.key] ?? 0);
          }
        }
      }
    }
    setTemplateColumnValues(colVals);

    setShowEditDialog(true);
  };

  const handleSaveEdit = async () => {
    if (!editingEmployee) return;

    try {
      setEditLoading(true);
      const calculatedSalary = calculateFullSalary(editData);

      // Calculate tax based on total gross earning
      const totalGross = calculatedSalary.totalGrossEarning || 0;
      const taxRegime = "old"; // Default to old regime, can be made configurable
      const calculateTax = (grossSalary: number, taxRegime: "old" | "new") => {
        if (taxRegime === "new") {
          if (grossSalary <= 300000) return 0;
          if (grossSalary <= 600000) return (grossSalary - 300000) * 0.05;
          if (grossSalary <= 900000)
            return 15000 + (grossSalary - 600000) * 0.1;
          if (grossSalary <= 1200000)
            return 45000 + (grossSalary - 900000) * 0.15;
          if (grossSalary <= 1500000)
            return 90000 + (grossSalary - 1200000) * 0.2;
          return 150000 + (grossSalary - 1500000) * 0.3;
        } else {
          if (grossSalary <= 250000) return 0;
          if (grossSalary <= 500000) return (grossSalary - 250000) * 0.05;
          if (grossSalary <= 1000000)
            return 12500 + (grossSalary - 500000) * 0.2;
          return 112500 + (grossSalary - 1000000) * 0.3;
        }
      };
      const taxAmount = calculateTax(totalGross, taxRegime);

      await updateDoc(doc(db, "employees", editingEmployee.id), {
        esicNo: editData.esicNo,
        uan: editData.uan,
        salary: {
          ...calculatedSalary,
          // Persist custom template column values (e.g. conv_allowance, washing_allowance)
          ...templateColumnValues,
        },
        // Save pre-calculated values for easy access in payroll
        grossSalary: totalGross,
        taxAmount: taxAmount,
        netSalary: calculatedSalary.netSalary || 0,
        updatedAt: new Date(),
      });

      setEmployees((prev) =>
        prev.map((emp) =>
          emp.id === editingEmployee.id
            ? {
                ...emp,
                esicNo: editData.esicNo,
                uan: editData.uan,
                salary: {
                  ...calculatedSalary,
                  ...templateColumnValues,
                },
                grossSalary: totalGross,
                taxAmount: taxAmount,
                netSalary: calculatedSalary.netSalary || 0,
                updatedAt: new Date(),
              }
            : emp,
        ),
      );

      setShowEditDialog(false);
      setEditingEmployee(null);
      setAlert({
        type: "success",
        message: "Salary structure updated successfully!",
      });
    } catch (error) {
      console.error("Error updating salary:", error);
      setAlert({ type: "error", message: "Failed to update salary structure" });
    } finally {
      setEditLoading(false);
    }
  };

  const formatCurrency = (amount: number | undefined): string => {
    return amount ? amount.toLocaleString() : "0";
  };

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

  // Drafts: save/load/delete/apply
  const autoSaveFormulaDraft = async () => {
    if (!formulaTargetId || !formulaExpression || !currentUser?.uid) return;

    const targetColumn = allColumns().find(
      (c) => c.id === formulaTargetId || c.key === formulaTargetId,
    );
    const draftName = targetColumn ? targetColumn.name : formulaTargetId;

    // Check if a draft already exists for this target
    const existingDraftIndex = formulaDrafts.findIndex(
      (d) => d.targetId === formulaTargetId,
    );

    let updatedDrafts;
    if (existingDraftIndex >= 0) {
      // Update existing draft
      updatedDrafts = [...formulaDrafts];
      updatedDrafts[existingDraftIndex] = {
        ...updatedDrafts[existingDraftIndex],
        expression: formulaExpression,
        createdAt: Date.now(),
      };
    } else {
      // Create new draft
      const newDraft = {
        id: Date.now().toString(),
        name: draftName,
        targetId: formulaTargetId,
        expression: formulaExpression,
        createdAt: Date.now(),
      };
      updatedDrafts = [newDraft, ...formulaDrafts];
    }

    setFormulaDrafts(updatedDrafts);

    try {
      await setDoc(
        doc(db, "salaryStructure", currentUser.uid),
        { formulaDrafts: updatedDrafts, updatedAt: new Date() },
        { merge: true },
      );
    } catch (e) {
      console.error("Auto-save draft error:", e);
    }
  };

  const saveFormulaDraft = async () => {
    if (!currentUser?.uid || !formulaExpression || !formulaTargetId) return;
    const name = window.prompt("Draft name");
    if (!name) return;
    const draft = {
      id: Date.now().toString(),
      name: name.trim(),
      targetId: formulaTargetId,
      expression: formulaExpression,
      createdAt: Date.now(),
    };
    const updated = [draft, ...formulaDrafts];
    setFormulaDrafts(updated);
    await setDoc(
      doc(db, "salaryStructure", currentUser.uid),
      { formulaDrafts: updated, updatedAt: new Date() },
      { merge: true },
    );
    setAlert({ type: "success", message: "Draft saved" });
  };

  const loadFormulaDraft = (draftId: string) => {
    const d = formulaDrafts.find((x) => x.id === draftId);
    if (!d) return;
    setFormulaTargetId(d.targetId);
    setFormulaExpression(d.expression);
  };

  const deleteFormulaDraft = async (draftId: string) => {
    if (!currentUser?.uid) return;
    const updated = formulaDrafts.filter((x) => x.id !== draftId);
    setFormulaDrafts(updated);
    await setDoc(
      doc(db, "salaryStructure", currentUser.uid),
      { formulaDrafts: updated, updatedAt: new Date() },
      { merge: true },
    );
  };

  return (
    <Box sx={{ p: 3 }}>
      {/* Alert */}
      {alert && (
        <Alert
          severity={alert.type}
          onClose={() => setAlert(null)}
          sx={{ mb: 3 }}
        >
          {alert.message}
        </Alert>
      )}

      {/* Header */}
      <Box sx={{ mb: 3 }}>
        <Typography
          variant="h4"
          sx={{ color: "#2196f3", fontWeight: 600, mb: 1 }}
        >
          Salary Structures & Calculations
        </Typography>
        <Typography variant="body1" color="text.secondary">
          Comprehensive salary calculation system with automatic formula-based
          computations
        </Typography>
      </Box>

      {/* Action Buttons */}
      <Box
        sx={{
          mb: 3,
          display: "flex",
          gap: 2,
          alignItems: "center",
          flexWrap: "wrap",
        }}
      >
        <TextField
          placeholder="Search by Name, Email, or ID"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          InputProps={{
            startAdornment: <Search sx={{ mr: 1, color: "text.secondary" }} />,
          }}
          sx={{
            flex: 1,
            minWidth: 300,
            "& .MuiOutlinedInput-root": { borderRadius: 2 },
          }}
        />

        <FormControl sx={{ minWidth: 220 }}>
          <InputLabel id="manager-filter-label">Manager</InputLabel>
          <Select
            labelId="manager-filter-label"
            label="Manager"
            value={selectedManagerId}
            onChange={(e) => setSelectedManagerId(e.target.value)}
            sx={{ borderRadius: 2 }}
          >
            <MenuItem value="all">All Managers</MenuItem>
            {managers.map((manager) => (
              <MenuItem key={manager.id} value={manager.id}>
                {manager.name}
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        <FormControl sx={{ minWidth: 150 }}>
          <InputLabel id="attendance-period-month-label">Month</InputLabel>
          <Select
            labelId="attendance-period-month-label"
            label="Month"
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(Number(e.target.value))}
            sx={{ borderRadius: 2 }}
          >
            {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
              <MenuItem key={m} value={m}>
                {new Date(2000, m - 1, 1).toLocaleString("default", {
                  month: "long",
                })}
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        <FormControl sx={{ minWidth: 110 }}>
          <InputLabel id="attendance-period-year-label">Year</InputLabel>
          <Select
            labelId="attendance-period-year-label"
            label="Year"
            value={selectedYear}
            onChange={(e) => setSelectedYear(Number(e.target.value))}
            sx={{ borderRadius: 2 }}
          >
            {Array.from(
              { length: 6 },
              (_, i) => new Date().getFullYear() - 3 + i,
            ).map((y) => (
              <MenuItem key={y} value={y}>
                {y}
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileUpload}
          accept=".xlsx,.xls"
          style={{ display: "none" }}
        />

        <Button
          variant="outlined"
          startIcon={<Download />}
          onClick={downloadSampleFile}
          sx={{ borderRadius: 2 }}
        >
          Download Sample
        </Button>

        <Button
          variant="contained"
          startIcon={
            uploadLoading ? <CircularProgress size={20} /> : <Upload />
          }
          onClick={() => fileInputRef.current?.click()}
          disabled={uploadLoading}
          sx={{
            backgroundColor: "#4caf50",
            "&:hover": { backgroundColor: "#45a049" },
            borderRadius: 2,
          }}
        >
          Upload Excel
        </Button>

        <Button
          variant="contained"
          color="success"
          startIcon={<Download />}
          onClick={handleExportXLSX}
          sx={{ borderRadius: 2 }}
        >
          Download XLSX
        </Button>

        <Button
          variant="contained"
          color="info"
          startIcon={<Download />}
          onClick={handleExportCSV}
          sx={{ borderRadius: 2 }}
        >
          Download CSV
        </Button>
      </Box>

      {/* Salary Structures Table — Template View only */}
      <Paper sx={{ backgroundColor: "#2d2d2d", border: "1px solid #333" }}>
        <TemplateSalaryView
          employees={filteredEmployees}
          managers={managers}
          selectedManagerId={selectedManagerId}
          page={page}
          rowsPerPage={rowsPerPage}
          onPageChange={(p) => setPage(p)}
          onRowsPerPageChange={(r) => {
            setRowsPerPage(r);
            setPage(0);
          }}
          onEditEmployee={(emp) => handleIndividualEdit(emp)}
          refreshKey={refreshKey}
        />
      </Paper>
      {/* Edit Salary Structure Dialog */}
      <Dialog
        open={showEditDialog}
        onClose={() => setShowEditDialog(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>
          <Typography variant="h5" component="span">
            Edit Salary Structure - {editingEmployee?.fullName}
          </Typography>
        </DialogTitle>
        <DialogContent>
          <Box sx={{ mt: 2 }}>
            {/* Employee Information */}
            <Typography variant="h6" gutterBottom sx={{ mb: 2 }}>
              Employee Information
            </Typography>
            <Box sx={{ display: "flex", gap: 2, mb: 3, flexWrap: "wrap" }}>
              <Box sx={{ flex: 1, minWidth: 250 }}>
                <TextField
                  label="ESIC No"
                  value={editData.esicNo}
                  onChange={(e) =>
                    setEditData((prev) => ({ ...prev, esicNo: e.target.value }))
                  }
                  fullWidth
                />
              </Box>
              <Box sx={{ flex: 1, minWidth: 250 }}>
                <TextField
                  label="UAN"
                  value={editData.uan}
                  onChange={(e) =>
                    setEditData((prev) => ({ ...prev, uan: e.target.value }))
                  }
                  fullWidth
                />
              </Box>
            </Box>

            <Divider sx={{ my: 3 }} />

            {/* Basic Salary Components */}
            <Typography variant="h6" gutterBottom sx={{ mb: 2 }}>
              Basic Salary Components
            </Typography>
            <Box sx={{ display: "flex", gap: 2, mb: 3, flexWrap: "wrap" }}>
              <Box sx={{ flex: 1, minWidth: 250 }}>
                <TextField
                  label="Basic Salary"
                  type="number"
                  value={editData.basic}
                  onChange={(e) =>
                    setEditData((prev) => ({
                      ...prev,
                      basic: parseFloat(e.target.value) || 0,
                    }))
                  }
                  fullWidth
                />
              </Box>
              <Box sx={{ flex: 1, minWidth: 250 }}>
                <TextField
                  label="D.A. (Dearness Allowance)"
                  type="number"
                  value={editData.da}
                  onChange={(e) =>
                    setEditData((prev) => ({
                      ...prev,
                      da: parseFloat(e.target.value) || 0,
                    }))
                  }
                  fullWidth
                />
              </Box>
            </Box>

            {/* Template Columns — no-formula columns from the assigned template (e.g. conv_allowance, washing_allowance) */}
            {Object.keys(templateColumnValues).length > 0 && (
              <>
                <Divider sx={{ my: 3 }} />
                <Typography variant="h6" gutterBottom sx={{ mb: 2 }}>
                  Salary Components
                </Typography>
                <Box sx={{ display: "flex", gap: 2, mb: 3, flexWrap: "wrap" }}>
                  {Object.entries(templateColumnValues).map(([key, val]) => (
                    <Box key={key} sx={{ flex: 1, minWidth: 200 }}>
                      <TextField
                        label={key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
                        type="number"
                        value={val}
                        onChange={(e) =>
                          setTemplateColumnValues((prev) => ({
                            ...prev,
                            [key]: parseFloat(e.target.value) || 0,
                          }))
                        }
                        fullWidth
                        inputProps={{ min: 0 }}
                      />
                    </Box>
                  ))}
                </Box>
              </>
            )}

            <Divider sx={{ my: 3 }} />

            {/* Working Days */}
            <Typography variant="h6" gutterBottom sx={{ mb: 2 }}>
              Working Days
            </Typography>
            <Box sx={{ display: "flex", gap: 2, mb: 3, flexWrap: "wrap" }}>
              <Box sx={{ flex: 1, minWidth: 250 }}>
                <TextField
                  label="Total Days"
                  type="number"
                  value={editData.totalDays}
                  onChange={(e) =>
                    setEditData((prev) => ({
                      ...prev,
                      totalDays: parseFloat(e.target.value) || 30,
                    }))
                  }
                  fullWidth
                />
              </Box>
              <Box sx={{ flex: 1, minWidth: 250 }}>
                <TextField
                  label="Paid Days"
                  type="number"
                  value={editData.paidDays}
                  onChange={(e) =>
                    setEditData((prev) => ({
                      ...prev,
                      paidDays: parseFloat(e.target.value) || 30,
                    }))
                  }
                  fullWidth
                />
              </Box>
            </Box>

            <Divider sx={{ my: 3 }} />

            {/* Overtime */}
            <Typography variant="h6" gutterBottom sx={{ mb: 2 }}>
              Overtime Hours
            </Typography>
            <Box sx={{ display: "flex", gap: 2, mb: 3, flexWrap: "wrap" }}>
              <Box sx={{ flex: 1, minWidth: 200 }}>
                <TextField
                  label="Single OT Hours"
                  type="number"
                  value={editData.singleOTHours}
                  onChange={(e) =>
                    setEditData((prev) => ({
                      ...prev,
                      singleOTHours: parseFloat(e.target.value) || 0,
                    }))
                  }
                  fullWidth
                />
              </Box>
              <Box sx={{ flex: 1, minWidth: 200 }}>
                <TextField
                  label="Double OT Hours"
                  type="number"
                  value={editData.doubleOTHours}
                  onChange={(e) =>
                    setEditData((prev) => ({
                      ...prev,
                      doubleOTHours: parseFloat(e.target.value) || 0,
                    }))
                  }
                  fullWidth
                />
              </Box>
              <Box sx={{ flex: 1, minWidth: 200 }}>
                <TextField
                  label="Difference (Adjustment)"
                  type="number"
                  value={editData.difference}
                  onChange={(e) =>
                    setEditData((prev) => ({
                      ...prev,
                      difference: parseFloat(e.target.value) || 0,
                    }))
                  }
                  fullWidth
                />
              </Box>
              <Box sx={{ flex: 1, minWidth: 200 }}>
                <TextField
                  label="Advance"
                  type="number"
                  value={editData.advance}
                  onChange={(e) =>
                    setEditData((prev) => ({
                      ...prev,
                      advance: parseFloat(e.target.value) || 0,
                    }))
                  }
                  fullWidth
                  helperText="Amount to be deducted from salary"
                />
              </Box>
            </Box>

            <Divider sx={{ my: 3 }} />

            {/* Custom Allowances */}
            <Typography variant="h6" gutterBottom sx={{ mb: 2 }}>
              Custom Allowances
            </Typography>
            {editData.customAllowances.map((allowance, index) => (
              <Box
                key={index}
                sx={{ display: "flex", gap: 2, mb: 2, alignItems: "center" }}
              >
                <TextField
                  label="Allowance Name"
                  value={allowance.label}
                  onChange={(e) => {
                    const updated = [...editData.customAllowances];
                    updated[index].label = e.target.value;
                    setEditData((prev) => ({
                      ...prev,
                      customAllowances: updated,
                    }));
                  }}
                  sx={{ flex: 1 }}
                />
                <TextField
                  label="Amount (₹)"
                  type="number"
                  value={allowance.amount}
                  onChange={(e) => {
                    const updated = [...editData.customAllowances];
                    updated[index].amount = parseFloat(e.target.value) || 0;
                    setEditData((prev) => ({
                      ...prev,
                      customAllowances: updated,
                    }));
                  }}
                  sx={{ width: 150 }}
                  inputProps={{ min: 0 }}
                />
                <Button
                  variant="text"
                  color="error"
                  onClick={() => {
                    setEditData((prev) => ({
                      ...prev,
                      customAllowances: prev.customAllowances.filter(
                        (_, i) => i !== index,
                      ),
                    }));
                  }}
                  sx={{ minWidth: "auto" }}
                >
                  Remove
                </Button>
              </Box>
            ))}
            <Button
              variant="text"
              onClick={() => {
                setEditData((prev) => ({
                  ...prev,
                  customAllowances: [
                    ...prev.customAllowances,
                    { label: "", amount: 0 },
                  ],
                }));
              }}
              sx={{ color: "#2196f3", mb: 3 }}
            >
              Add Allowance
            </Button>

            <Divider sx={{ my: 3 }} />

            {/* Custom Bonuses */}
            <Typography variant="h6" gutterBottom sx={{ mb: 2 }}>
              Custom Bonuses
            </Typography>
            {editData.customBonuses.map((bonus, index) => (
              <Box
                key={index}
                sx={{ display: "flex", gap: 2, mb: 2, alignItems: "center" }}
              >
                <TextField
                  label="Bonus Name"
                  value={bonus.label}
                  onChange={(e) => {
                    const updated = [...editData.customBonuses];
                    updated[index].label = e.target.value;
                    setEditData((prev) => ({
                      ...prev,
                      customBonuses: updated,
                    }));
                  }}
                  sx={{ flex: 1 }}
                />
                <TextField
                  label="Amount (₹)"
                  type="number"
                  value={bonus.amount}
                  onChange={(e) => {
                    const updated = [...editData.customBonuses];
                    updated[index].amount = parseFloat(e.target.value) || 0;
                    setEditData((prev) => ({
                      ...prev,
                      customBonuses: updated,
                    }));
                  }}
                  sx={{ width: 150 }}
                  inputProps={{ min: 0 }}
                />
                <Button
                  variant="text"
                  color="error"
                  onClick={() => {
                    setEditData((prev) => ({
                      ...prev,
                      customBonuses: prev.customBonuses.filter(
                        (_, i) => i !== index,
                      ),
                    }));
                  }}
                  sx={{ minWidth: "auto" }}
                >
                  Remove
                </Button>
              </Box>
            ))}
            <Button
              variant="text"
              onClick={() => {
                setEditData((prev) => ({
                  ...prev,
                  customBonuses: [
                    ...prev.customBonuses,
                    { label: "", amount: 0 },
                  ],
                }));
              }}
              sx={{ color: "#2196f3", mb: 3 }}
            >
              Add Bonus
            </Button>

            <Divider sx={{ my: 3 }} />

            {/* Custom Deductions */}
            <Typography variant="h6" gutterBottom sx={{ mb: 2 }}>
              Custom Deductions
            </Typography>
            {editData.customDeductions.map((deduction, index) => (
              <Box
                key={index}
                sx={{ display: "flex", gap: 2, mb: 2, alignItems: "center" }}
              >
                <TextField
                  label="Deduction Name"
                  value={deduction.label}
                  onChange={(e) => {
                    const updated = [...editData.customDeductions];
                    updated[index].label = e.target.value;
                    setEditData((prev) => ({
                      ...prev,
                      customDeductions: updated,
                    }));
                  }}
                  sx={{ flex: 1 }}
                />
                <TextField
                  label="Amount (₹)"
                  type="number"
                  value={deduction.amount}
                  onChange={(e) => {
                    const updated = [...editData.customDeductions];
                    updated[index].amount = parseFloat(e.target.value) || 0;
                    setEditData((prev) => ({
                      ...prev,
                      customDeductions: updated,
                    }));
                  }}
                  sx={{ width: 150 }}
                  inputProps={{ min: 0 }}
                />
                <Button
                  variant="text"
                  color="error"
                  onClick={() => {
                    setEditData((prev) => ({
                      ...prev,
                      customDeductions: prev.customDeductions.filter(
                        (_, i) => i !== index,
                      ),
                    }));
                  }}
                  sx={{ minWidth: "auto" }}
                >
                  Remove
                </Button>
              </Box>
            ))}
            <Button
              variant="text"
              onClick={() => {
                setEditData((prev) => ({
                  ...prev,
                  customDeductions: [
                    ...prev.customDeductions,
                    { label: "", amount: 0 },
                  ],
                }));
              }}
              sx={{ color: "#2196f3", mb: 3 }}
            >
              Add Deduction
            </Button>

            <Divider sx={{ my: 3 }} />

            {/* Skill-Based Salary */}
            <Typography variant="h6" gutterBottom sx={{ mb: 2 }}>
              Skill-Based Salary
            </Typography>
            <Box sx={{ mb: 3 }}>
              <FormControlLabel
                control={
                  <Checkbox
                    checked={editData.isSkillBased}
                    onChange={(e) =>
                      setEditData((prev) => ({
                        ...prev,
                        isSkillBased: e.target.checked,
                      }))
                    }
                  />
                }
                label="Enable skill-based salary calculation"
              />

              {editData.isSkillBased && (
                <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap" }}>
                  <Box sx={{ flex: 1, minWidth: 200 }}>
                    <FormControl fullWidth>
                      <InputLabel>Skill Category</InputLabel>
                      <Select
                        value={editData.skillCategory}
                        onChange={(e) => {
                          const selectedSkill = skillCategories.find(
                            (skill) => skill.name === e.target.value,
                          );
                          setEditData((prev) => ({
                            ...prev,
                            skillCategory: e.target.value,
                            skillAmount: selectedSkill?.amount || 0,
                          }));
                        }}
                        label="Skill Category"
                      >
                        {skillCategories.map((skill) => (
                          <MenuItem key={skill.id} value={skill.name}>
                            {skill.name} ({skill.amount.toLocaleString()})
                          </MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                  </Box>
                  <Box sx={{ flex: 1, minWidth: 200 }}>
                    <TextField
                      label="Skill Amount (₹)"
                      type="number"
                      value={editData.skillAmount}
                      onChange={(e) =>
                        setEditData((prev) => ({
                          ...prev,
                          skillAmount: parseFloat(e.target.value) || 0,
                        }))
                      }
                      fullWidth
                      inputProps={{ min: 0 }}
                      helperText="This amount will replace the basic salary"
                    />
                  </Box>
                </Box>
              )}
            </Box>

            {/* Calculated Preview */}
            {editData.basic > 0 && (
              <>
                <Divider sx={{ my: 3 }} />
                <Typography variant="h6" gutterBottom sx={{ mb: 2 }}>
                  Calculated Values Preview
                </Typography>
                <Box sx={{ p: 2, backgroundColor: "#2d2d2d", borderRadius: 1 }}>
                  <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap" }}>
                    <Box sx={{ flex: 1, minWidth: 150 }}>
                      <Typography variant="body2" color="text.secondary">
                        HRA ({editData.hraPercentage}%)
                      </Typography>
                      <Typography variant="body1" fontWeight={600}>
                        {formatCurrency(
                          calculateHRA(
                            editData.basic,
                            editData.da,
                            editData.hraPercentage,
                          ),
                        )}
                      </Typography>
                    </Box>
                    <Box sx={{ flex: 1, minWidth: 150 }}>
                      <Typography variant="body2" color="text.secondary">
                        Gross Rate PM
                      </Typography>
                      <Typography variant="body1" fontWeight={600}>
                        {formatCurrency(
                          calculateGrossRate(
                            editData.basic,
                            editData.da,
                            calculateHRA(
                              editData.basic,
                              editData.da,
                              editData.hraPercentage,
                            ),
                          ),
                        )}
                      </Typography>
                    </Box>
                    <Box sx={{ flex: 1, minWidth: 150 }}>
                      <Typography variant="body2" color="text.secondary">
                        Net Salary
                      </Typography>
                      <Typography
                        variant="body1"
                        fontWeight={600}
                        color="success.main"
                      >
                        {formatCurrency(
                          calculateFullSalary(editData).netSalary,
                        )}
                      </Typography>
                    </Box>
                    <Box sx={{ flex: 1, minWidth: 150 }}>
                      <Typography variant="body2" color="text.secondary">
                        CTC Per Month
                      </Typography>
                      <Typography
                        variant="body1"
                        fontWeight={600}
                        color="warning.main"
                      >
                        {formatCurrency(
                          calculateFullSalary(editData).ctcPerMonth,
                        )}
                      </Typography>
                    </Box>
                  </Box>

                  {editData.isSkillBased && (
                    <Box
                      sx={{
                        mt: 2,
                        p: 2,
                        backgroundColor: "#e3f2fd",
                        borderRadius: 1,
                      }}
                    >
                      <Typography
                        variant="body2"
                        color="primary"
                        fontWeight={600}
                      >
                        Skill-based adjustment: {editData.skillCategory} (
                        {editData.skillAmount.toLocaleString()})
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        Basic salary replaced with skill amount:{" "}
                        {formatCurrency(editData.skillAmount)} | DA remains:{" "}
                        {formatCurrency(editData.da)}
                      </Typography>
                    </Box>
                  )}
                </Box>
              </>
            )}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowEditDialog(false)}>Cancel</Button>
          <Button
            onClick={handleSaveEdit}
            variant="contained"
            disabled={editLoading}
            sx={{
              backgroundColor: "#2196f3",
              "&:hover": { backgroundColor: "#1976d2" },
            }}
          >
            {editLoading ? <CircularProgress size={24} /> : "Save & Calculate"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Disable advanced features confirmation */}
      <Dialog
        open={showDisableConfirm}
        onClose={() => setShowDisableConfirm(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Disable Advanced Calculations?</DialogTitle>
        <DialogContent>
          <Typography sx={{ color: "#b0b0b0" }}>
            Disabling advanced calculation features will remove all custom
            parameters, skill categories and custom columns from the database.
            Only Column Formula Calculator drafts will remain. This action can
            be undone by re-enabling (defaults will be restored).
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowDisableConfirm(false)}>Cancel</Button>
          <Button
            color="error"
            onClick={async () => {
              // Persist backupAdvanced into Firestore and then perform the destructive overwrite
              if (!currentUser?.uid) return;
              try {
                setConfigLoading(true);
                const backup = {
                  skillCategories: skillCategories || [],
                  customParameters: customParameters || [],
                  customColumns: customColumns || [],
                  savedAt: new Date(),
                };
                // Write minimal doc but include backupAdvanced so it can be restored later
                await setDoc(
                  doc(db, "salaryStructure", currentUser.uid),
                  {
                    companyId: currentUser.uid,
                    formulaDrafts: formulaDrafts || [],
                    enableAdvancedCalculations: false,
                    backupAdvanced: backup,
                    createdAt: new Date(),
                    updatedAt: new Date(),
                  },
                  { merge: false },
                );

                // Update local state to reflect change
                setSkillCategories([]);
                setCustomParameters([]);
                setCustomColumns([]);
                setEnableAdvancedCalculations(false);
                setShowDisableConfirm(false);
                setAlert({
                  type: "success",
                  message:
                    "Advanced features disabled; only formula drafts retained (backup saved).",
                });
              } catch (e) {
                console.error("Failed to disable advanced features:", e);
                setAlert({
                  type: "error",
                  message: "Failed to disable advanced features.",
                });
              } finally {
                setConfigLoading(false);
              }
            }}
          >
            Confirm Disable
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete Column Dialog (dropdown) */}
      <Dialog
        open={showDeleteDialog}
        onClose={() => setShowDeleteDialog(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Delete Column</DialogTitle>
        <DialogContent>
          <Box sx={{ mt: 1, display: "flex", flexDirection: "column", gap: 2 }}>
            <InputLabel id="delete-column-select-label">
              Select Column to delete
            </InputLabel>
            <FormControl fullWidth>
              <Select
                labelId="delete-column-select-label"
                value={columnToDeleteId}
                displayEmpty
                onChange={(e) => setColumnToDeleteId(e.target.value as string)}
              >
                <MenuItem value="">-- Select --</MenuItem>
                {customColumns
                  .filter((c) => c.section === deleteSection)
                  .map((c) => (
                    <MenuItem key={c.id} value={c.id}>
                      {c.name}
                    </MenuItem>
                  ))}
              </Select>
            </FormControl>
            <Typography variant="body2" color="text.secondary">
              Warning: This will permanently remove the selected custom column
              from the salary structure.
            </Typography>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowDeleteDialog(false)}>Cancel</Button>
          <Button color="error" onClick={confirmDeleteSectionColumn}>
            Delete Column
          </Button>
        </DialogActions>
      </Dialog>

      {/* Calculation Guide Dialog */}
      <Dialog
        open={showCalculationDialog}
        onClose={() => setShowCalculationDialog(false)}
        maxWidth="lg"
        fullWidth
      >
        <DialogTitle>
          <Typography
            variant="h5"
            component="span"
            sx={{ color: "#2196f3", fontWeight: 600 }}
          >
            Salary Calculation Guide
          </Typography>
          <Typography variant="body2" sx={{ color: "#b0b0b0", mt: 1 }}>
            Understanding how your salary is calculated step by step
          </Typography>
        </DialogTitle>
        <DialogContent>
          <Box sx={{ mt: 2 }}>
            {/* Basic Components */}
            <Box
              sx={{
                mb: 4,
                p: 3,
                backgroundColor: "#2d2d2d",
                borderRadius: 2,
                border: "1px solid #444",
              }}
            >
              <Typography
                variant="h6"
                sx={{
                  color: "#2196f3",
                  mb: 2,
                  display: "flex",
                  alignItems: "center",
                }}
              >
                Basic Salary Components
              </Typography>
              <Box
                sx={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
                  gap: 2,
                }}
              >
                <Box
                  sx={{
                    p: 2,
                    backgroundColor: "#3d3d3d",
                    borderRadius: 1,
                    border: "1px solid #555",
                  }}
                >
                  <Typography
                    variant="subtitle1"
                    sx={{ fontWeight: 600, color: "#ffffff" }}
                  >
                    Basic Salary
                  </Typography>
                  <Typography variant="body2" sx={{ color: "#b0b0b0" }}>
                    Fixed amount set by company policy
                  </Typography>
                  <Typography
                    variant="caption"
                    sx={{ color: "#2196f3", fontFamily: "monospace" }}
                  >
                    Example: ₹15,225
                  </Typography>
                </Box>
                <Box
                  sx={{
                    p: 2,
                    backgroundColor: "#3d3d3d",
                    borderRadius: 1,
                    border: "1px solid #555",
                  }}
                >
                  <Typography
                    variant="subtitle1"
                    sx={{ fontWeight: 600, color: "#ffffff" }}
                  >
                    Dearness Allowance (DA)
                  </Typography>
                  <Typography variant="body2" sx={{ color: "#b0b0b0" }}>
                    Cost of living adjustment
                  </Typography>
                  <Typography
                    variant="caption"
                    sx={{ color: "#2196f3", fontFamily: "monospace" }}
                  >
                    Example: ₹775
                  </Typography>
                </Box>
                <Box
                  sx={{
                    p: 2,
                    backgroundColor: "#3d3d3d",
                    borderRadius: 1,
                    border: "1px solid #555",
                  }}
                >
                  <Typography
                    variant="subtitle1"
                    sx={{ fontWeight: 600, color: "#ffffff" }}
                  >
                    House Rent Allowance (HRA)
                  </Typography>
                  <Typography variant="body2" sx={{ color: "#b0b0b0" }}>
                    Calculated as percentage of Basic + DA
                  </Typography>
                  <Typography
                    variant="caption"
                    sx={{ color: "#2196f3", fontFamily: "monospace" }}
                  >
                    Formula: (Basic + DA) × 5%
                  </Typography>
                </Box>
              </Box>
            </Box>

            {/* Earnings Calculation */}
            <Box
              sx={{
                mb: 4,
                p: 3,
                backgroundColor: "#2d2d2d",
                borderRadius: 2,
                border: "1px solid #4caf50",
              }}
            >
              <Typography
                variant="h6"
                sx={{
                  color: "#4caf50",
                  mb: 2,
                  display: "flex",
                  alignItems: "center",
                }}
              >
                📈 Earnings Calculation
              </Typography>
              <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
                <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
                  <Typography
                    variant="body1"
                    sx={{ fontWeight: 600, minWidth: 200, color: "#ffffff" }}
                  >
                    Gross Rate (Monthly):
                  </Typography>
                  <Typography
                    variant="body1"
                    sx={{ fontFamily: "monospace", color: "#4caf50" }}
                  >
                    Basic + DA + HRA
                  </Typography>
                </Box>
                <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
                  <Typography
                    variant="body1"
                    sx={{ fontWeight: 600, minWidth: 200, color: "#ffffff" }}
                  >
                    Daily Rate:
                  </Typography>
                  <Typography
                    variant="body1"
                    sx={{ fontFamily: "monospace", color: "#4caf50" }}
                  >
                    Gross Rate ÷ Total Days
                  </Typography>
                </Box>
                <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
                  <Typography
                    variant="body1"
                    sx={{ fontWeight: 600, minWidth: 200, color: "#ffffff" }}
                  >
                    Gross Earning:
                  </Typography>
                  <Typography
                    variant="body1"
                    sx={{ fontFamily: "monospace", color: "#4caf50" }}
                  >
                    Daily Rate × Paid Days
                  </Typography>
                </Box>
                <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
                  <Typography
                    variant="body1"
                    sx={{ fontWeight: 600, minWidth: 200, color: "#ffffff" }}
                  >
                    Overtime Rate/Hour:
                  </Typography>
                  <Typography
                    variant="body1"
                    sx={{ fontFamily: "monospace", color: "#4caf50" }}
                  >
                    (Gross Earning ÷ Paid Days) ÷ 8 hours
                  </Typography>
                </Box>
              </Box>
            </Box>

            {/* Deductions */}
            <Box
              sx={{
                mb: 4,
                p: 3,
                backgroundColor: "#2d2d2d",
                borderRadius: 2,
                border: "1px solid #ff9800",
              }}
            >
              <Typography
                variant="h6"
                sx={{
                  color: "#ff9800",
                  mb: 2,
                  display: "flex",
                  alignItems: "center",
                }}
              >
                📉 Deductions
              </Typography>
              <Box
                sx={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))",
                  gap: 2,
                }}
              >
                <Box
                  sx={{
                    p: 2,
                    backgroundColor: "#3d3d3d",
                    borderRadius: 1,
                    border: "1px solid #555",
                  }}
                >
                  <Typography
                    variant="subtitle1"
                    sx={{ fontWeight: 600, color: "#ffffff" }}
                  >
                    Professional Tax
                  </Typography>
                  <Typography variant="body2" sx={{ color: "#b0b0b0", mb: 1 }}>
                    Based on salary slabs:
                  </Typography>
                  <Typography
                    variant="caption"
                    sx={{
                      display: "block",
                      fontFamily: "monospace",
                      color: "#ff9800",
                    }}
                  >
                    • Below ₹7,501: ₹0
                  </Typography>
                  <Typography
                    variant="caption"
                    sx={{
                      display: "block",
                      fontFamily: "monospace",
                      color: "#ff9800",
                    }}
                  >
                    • ₹7,501-₹10,000: ₹175
                  </Typography>
                  <Typography
                    variant="caption"
                    sx={{
                      display: "block",
                      fontFamily: "monospace",
                      color: "#ff9800",
                    }}
                  >
                    • Above ₹10,000: ₹200
                  </Typography>
                </Box>
                <Box
                  sx={{
                    p: 2,
                    backgroundColor: "#3d3d3d",
                    borderRadius: 1,
                    border: "1px solid #555",
                  }}
                >
                  <Typography
                    variant="subtitle1"
                    sx={{ fontWeight: 600, color: "#ffffff" }}
                  >
                    ESIC (Employee)
                  </Typography>
                  <Typography variant="body2" sx={{ color: "#b0b0b0" }}>
                    Employee State Insurance
                  </Typography>
                  <Typography
                    variant="caption"
                    sx={{ color: "#ff9800", fontFamily: "monospace" }}
                  >
                    Total Gross × 0.75%
                  </Typography>
                </Box>
                <Box
                  sx={{
                    p: 2,
                    backgroundColor: "#3d3d3d",
                    borderRadius: 1,
                    border: "1px solid #555",
                  }}
                >
                  <Typography
                    variant="subtitle1"
                    sx={{ fontWeight: 600, color: "#ffffff" }}
                  >
                    PF (Employee)
                  </Typography>
                  <Typography variant="body2" sx={{ color: "#b0b0b0" }}>
                    Provident Fund contribution
                  </Typography>
                  <Typography
                    variant="caption"
                    sx={{ color: "#ff9800", fontFamily: "monospace" }}
                  >
                    PF Base × 12%
                  </Typography>
                </Box>
              </Box>
            </Box>

            {/* Final Calculation */}
            <Box
              sx={{
                mb: 4,
                p: 3,
                backgroundColor: "#2d2d2d",
                borderRadius: 2,
                border: "1px solid #2196f3",
              }}
            >
              <Typography
                variant="h6"
                sx={{
                  color: "#2196f3",
                  mb: 2,
                  display: "flex",
                  alignItems: "center",
                }}
              >
                🎯 Final Calculation
              </Typography>
              <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
                <Box
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    gap: 2,
                    p: 2,
                    backgroundColor: "#3d3d3d",
                    borderRadius: 1,
                  }}
                >
                  <Typography
                    variant="h6"
                    sx={{ fontWeight: 600, minWidth: 200, color: "#4caf50" }}
                  >
                    Net Salary:
                  </Typography>
                  <Typography
                    variant="h6"
                    sx={{ fontFamily: "monospace", color: "#4caf50" }}
                  >
                    Total Gross - Total Deductions
                  </Typography>
                </Box>
                <Box
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    gap: 2,
                    p: 2,
                    backgroundColor: "#3d3d3d",
                    borderRadius: 1,
                  }}
                >
                  <Typography
                    variant="h6"
                    sx={{ fontWeight: 600, minWidth: 200, color: "#2196f3" }}
                  >
                    CTC (Monthly):
                  </Typography>
                  <Typography
                    variant="h6"
                    sx={{ fontFamily: "monospace", color: "#2196f3" }}
                  >
                    Total Gross + Employer Contributions
                  </Typography>
                </Box>
              </Box>
            </Box>

            {/* Custom Parameters */}
            {customParameters.length > 0 && (
              <Box
                sx={{
                  mb: 4,
                  p: 3,
                  backgroundColor: "#2d2d2d",
                  borderRadius: 2,
                  border: "1px solid #e91e63",
                }}
              >
                <Typography
                  variant="h6"
                  sx={{
                    color: "#e91e63",
                    mb: 2,
                    display: "flex",
                    alignItems: "center",
                  }}
                >
                  🧮 Custom Parameters
                </Typography>
                <Typography variant="body2" sx={{ color: "#b0b0b0", mb: 3 }}>
                  Additional custom calculations configured for your
                  organization
                </Typography>

                <Box
                  sx={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
                    gap: 2,
                  }}
                >
                  {customParameters.map((param) => (
                    <Box
                      key={param.id}
                      sx={{
                        p: 2,
                        backgroundColor: "#3d3d3d",
                        borderRadius: 1,
                        border: "1px solid #555",
                      }}
                    >
                      <Typography
                        variant="subtitle1"
                        sx={{ fontWeight: 600, color: "#ffffff", mb: 1 }}
                      >
                        {param.type === "addition" ? "➕" : "➖"} {param.name}
                      </Typography>
                      <Typography
                        variant="body2"
                        sx={{ color: "#b0b0b0", mb: 1 }}
                      >
                        Applied to:{" "}
                        {param.appliesTo === "basic"
                          ? "Basic Salary"
                          : param.appliesTo === "gross"
                            ? "Gross Salary"
                            : param.appliesTo === "net"
                              ? "Net Salary"
                              : "CTC"}
                      </Typography>
                      <Typography
                        variant="caption"
                        sx={{
                          color: "#e91e63",
                          fontFamily: "monospace",
                          display: "block",
                        }}
                      >
                        Formula: {param.formula || "Not configured"}
                      </Typography>
                      <Typography variant="caption" sx={{ color: "#ff9800" }}>
                        Type:{" "}
                        {param.calculationType === "percentage"
                          ? "Percentage"
                          : "Fixed Amount"}
                      </Typography>
                      {param.description && (
                        <Typography
                          variant="caption"
                          sx={{
                            color: "#b0b0b0",
                            display: "block",
                            mt: 1,
                            fontStyle: "italic",
                          }}
                        >
                          {param.description}
                        </Typography>
                      )}
                    </Box>
                  ))}
                </Box>
              </Box>
            )}

            {/* Employer Contributions */}
            <Box
              sx={{
                mb: 2,
                p: 3,
                backgroundColor: "#2d2d2d",
                borderRadius: 2,
                border: "1px solid #9c27b0",
              }}
            >
              <Typography
                variant="h6"
                sx={{
                  color: "#9c27b0",
                  mb: 2,
                  display: "flex",
                  alignItems: "center",
                }}
              >
                🏢 Employer Contributions (Not deducted from salary)
              </Typography>
              <Box
                sx={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
                  gap: 2,
                }}
              >
                <Box
                  sx={{
                    p: 2,
                    backgroundColor: "#3d3d3d",
                    borderRadius: 1,
                    border: "1px solid #555",
                  }}
                >
                  <Typography
                    variant="subtitle1"
                    sx={{ fontWeight: 600, color: "#ffffff" }}
                  >
                    Employer ESIC
                  </Typography>
                  <Typography
                    variant="caption"
                    sx={{ color: "#9c27b0", fontFamily: "monospace" }}
                  >
                    Total Gross × 3.25%
                  </Typography>
                </Box>
                <Box
                  sx={{
                    p: 2,
                    backgroundColor: "#3d3d3d",
                    borderRadius: 1,
                    border: "1px solid #555",
                  }}
                >
                  <Typography
                    variant="subtitle1"
                    sx={{ fontWeight: 600, color: "#ffffff" }}
                  >
                    Employer PF
                  </Typography>
                  <Typography
                    variant="caption"
                    sx={{ color: "#9c27b0", fontFamily: "monospace" }}
                  >
                    PF Base × 13%
                  </Typography>
                </Box>
                <Box
                  sx={{
                    p: 2,
                    backgroundColor: "#3d3d3d",
                    borderRadius: 1,
                    border: "1px solid #555",
                  }}
                >
                  <Typography
                    variant="subtitle1"
                    sx={{ fontWeight: 600, color: "#ffffff" }}
                  >
                    MLWF (Employer)
                  </Typography>
                  <Typography
                    variant="caption"
                    sx={{ color: "#9c27b0", fontFamily: "monospace" }}
                  >
                    Fixed Amount (₹{editData.mlwfEmployerAmount})
                  </Typography>
                </Box>
              </Box>
            </Box>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => setShowCalculationDialog(false)}
            variant="contained"
            sx={{ backgroundColor: "#2196f3" }}
          >
            Got it!
          </Button>
        </DialogActions>
      </Dialog>

      {/* Configuration Dialog */}
      <Dialog
        open={showConfigDialog}
        onClose={() => setShowConfigDialog(false)}
        maxWidth="lg"
        fullWidth
      >
        <DialogTitle>
          <Typography
            variant="h5"
            component="span"
            sx={{ color: "#2196f3", fontWeight: 600 }}
          >
            ⚙️ Salary Calculation Parameters
          </Typography>
          <Typography variant="body2" sx={{ color: "#b0b0b0", mt: 1 }}>
            Configure all calculation rules and percentages used in salary
            computation
          </Typography>
        </DialogTitle>
        <DialogContent>
          {configLoading && (
            <Box
              sx={{
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
                py: 3,
              }}
            >
              <CircularProgress sx={{ mr: 2 }} />
              <Typography sx={{ color: "#ffffff" }}>
                Loading configuration...
              </Typography>
            </Box>
          )}

          <Box sx={{ mt: 2, opacity: configLoading ? 0.5 : 1 }}>
            {/* Statutory Deduction Percentages */}
            <Box
              sx={{
                mb: 4,
                p: 3,
                backgroundColor: "#2d2d2d",
                borderRadius: 2,
                border: "1px solid #444",
              }}
            >
              <Typography
                variant="h6"
                sx={{
                  color: "#2196f3",
                  mb: 2,
                  display: "flex",
                  alignItems: "center",
                }}
              >
                🏛️ Government Statutory Rates
              </Typography>
              <Typography variant="body2" sx={{ color: "#b0b0b0", mb: 3 }}>
                These rates are set by government and may change based on policy
                updates
              </Typography>

              <Box
                sx={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))",
                  gap: 2,
                }}
              >
                <TextField
                  label="ESIC Employee Rate (%)"
                  type="number"
                  value={editData.esicEmployeePercentage}
                  onChange={(e) =>
                    setEditData((prev) => ({
                      ...prev,
                      esicEmployeePercentage:
                        parseFloat(e.target.value) || 0.75,
                    }))
                  }
                  fullWidth
                  inputProps={{ step: 0.01, min: 0, max: 10 }}
                  helperText="Current: 0.75% (Employee contribution)"
                  sx={{ "& .MuiInputBase-input": { color: "#ffffff" } }}
                />
                <TextField
                  label="ESIC Employer Rate (%)"
                  type="number"
                  value={editData.esicEmployerPercentage}
                  onChange={(e) =>
                    setEditData((prev) => ({
                      ...prev,
                      esicEmployerPercentage:
                        parseFloat(e.target.value) || 3.25,
                    }))
                  }
                  fullWidth
                  inputProps={{ step: 0.01, min: 0, max: 10 }}
                  helperText="Current: 3.25% (Employer contribution)"
                  sx={{ "& .MuiInputBase-input": { color: "#ffffff" } }}
                />
                <TextField
                  label="PF Employee Rate (%)"
                  type="number"
                  value={editData.pfEmployeePercentage}
                  onChange={(e) =>
                    setEditData((prev) => ({
                      ...prev,
                      pfEmployeePercentage: parseFloat(e.target.value) || 12,
                    }))
                  }
                  fullWidth
                  inputProps={{ step: 0.1, min: 0, max: 50 }}
                  helperText="Current: 12% (Employee PF contribution)"
                  sx={{ "& .MuiInputBase-input": { color: "#ffffff" } }}
                />
                <TextField
                  label="PF Employer Rate (%)"
                  type="number"
                  value={editData.pfEmployerPercentage}
                  onChange={(e) =>
                    setEditData((prev) => ({
                      ...prev,
                      pfEmployerPercentage: parseFloat(e.target.value) || 13,
                    }))
                  }
                  fullWidth
                  inputProps={{ step: 0.1, min: 0, max: 50 }}
                  helperText="Current: 13% (Employer PF contribution)"
                  sx={{ "& .MuiInputBase-input": { color: "#ffffff" } }}
                />
                <TextField
                  label="MLWF Employer Amount (₹)"
                  type="number"
                  value={editData.mlwfEmployerAmount}
                  onChange={(e) =>
                    setEditData((prev) => ({
                      ...prev,
                      mlwfEmployerAmount:
                        e.target.value === "" ? 0 : parseFloat(e.target.value),
                    }))
                  }
                  fullWidth
                  inputProps={{ step: 0.25, min: 0, max: 100 }}
                  helperText="Maharashtra Labour Welfare Fund per employee"
                  sx={{ "& .MuiInputBase-input": { color: "#ffffff" } }}
                />
              </Box>
            </Box>

            {/* Company Policy Rates */}
            <Box
              sx={{
                mb: 4,
                p: 3,
                backgroundColor: "#2d2d2d",
                borderRadius: 2,
                border: "1px solid #444",
              }}
            >
              <Typography
                variant="h6"
                sx={{
                  color: "#4caf50",
                  mb: 2,
                  display: "flex",
                  alignItems: "center",
                }}
              >
                🏢 Company Policy Rates
              </Typography>
              <Typography variant="body2" sx={{ color: "#b0b0b0", mb: 3 }}>
                These rates can be adjusted based on company policy and benefits
                structure
              </Typography>

              <Box
                sx={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))",
                  gap: 2,
                }}
              >
                <TextField
                  label="HRA Percentage (%)"
                  type="number"
                  value={editData.hraPercentage}
                  onChange={(e) =>
                    setEditData((prev) => ({
                      ...prev,
                      hraPercentage: parseFloat(e.target.value) || 5,
                    }))
                  }
                  fullWidth
                  inputProps={{ step: 0.1, min: 0, max: 50 }}
                  helperText="Percentage of (Basic + DA) for HRA"
                  sx={{ "& .MuiInputBase-input": { color: "#ffffff" } }}
                />
                <TextField
                  label="Working Hours Per Day"
                  type="number"
                  value={8}
                  onChange={() => {}} // This could be made configurable
                  fullWidth
                  inputProps={{ step: 0.5, min: 6, max: 12 }}
                  helperText="Used for overtime calculations"
                  sx={{ "& .MuiInputBase-input": { color: "#ffffff" } }}
                />
                <TextField
                  label="Standard Working Days"
                  type="number"
                  value={30}
                  onChange={() => {}} // This could be made configurable
                  fullWidth
                  inputProps={{ step: 1, min: 26, max: 31 }}
                  helperText="Default days per month"
                  sx={{ "& .MuiInputBase-input": { color: "#ffffff" } }}
                />
              </Box>
            </Box>

            {/* Professional Tax Slabs */}
            <Box
              sx={{
                mb: 4,
                p: 3,
                backgroundColor: "#2d2d2d",
                borderRadius: 2,
                border: "1px solid #444",
              }}
            >
              <Typography
                variant="h6"
                sx={{
                  color: "#ff9800",
                  mb: 2,
                  display: "flex",
                  alignItems: "center",
                }}
              >
                📊 Professional Tax Slabs
              </Typography>
              <Typography variant="body2" sx={{ color: "#b0b0b0", mb: 3 }}>
                Professional tax rates based on salary ranges (varies by state)
              </Typography>

              <Box
                sx={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
                  gap: 2,
                }}
              >
                <Box
                  sx={{
                    p: 2,
                    backgroundColor: "#3d3d3d",
                    borderRadius: 1,
                    border: "1px solid #555",
                  }}
                >
                  <Typography
                    variant="subtitle1"
                    sx={{ color: "#ffffff", mb: 1 }}
                  >
                    Slab 1: Below ₹7,501
                  </Typography>
                  <TextField
                    label="Tax Amount (₹)"
                    type="number"
                    defaultValue={0}
                    fullWidth
                    inputProps={{ min: 0 }}
                    sx={{ "& .MuiInputBase-input": { color: "#ffffff" } }}
                  />
                </Box>
                <Box
                  sx={{
                    p: 2,
                    backgroundColor: "#3d3d3d",
                    borderRadius: 1,
                    border: "1px solid #555",
                  }}
                >
                  <Typography
                    variant="subtitle1"
                    sx={{ color: "#ffffff", mb: 1 }}
                  >
                    Slab 2: ₹7,501 - ₹10,000
                  </Typography>
                  <TextField
                    label="Tax Amount (₹)"
                    type="number"
                    defaultValue={175}
                    fullWidth
                    inputProps={{ min: 0 }}
                    sx={{ "& .MuiInputBase-input": { color: "#ffffff" } }}
                  />
                </Box>
                <Box
                  sx={{
                    p: 2,
                    backgroundColor: "#3d3d3d",
                    borderRadius: 1,
                    border: "1px solid #555",
                  }}
                >
                  <Typography
                    variant="subtitle1"
                    sx={{ color: "#ffffff", mb: 1 }}
                  >
                    Slab 3: Above ₹10,000
                  </Typography>
                  <TextField
                    label="Tax Amount (₹)"
                    type="number"
                    defaultValue={200}
                    fullWidth
                    inputProps={{ min: 0 }}
                    sx={{ "& .MuiInputBase-input": { color: "#ffffff" } }}
                  />
                </Box>
              </Box>
            </Box>

            {/* Overtime Calculation Rules */}
            <Box
              sx={{
                mb: 4,
                p: 3,
                backgroundColor: "#2d2d2d",
                borderRadius: 2,
                border: "1px solid #444",
              }}
            >
              <Typography
                variant="h6"
                sx={{
                  color: "#9c27b0",
                  mb: 2,
                  display: "flex",
                  alignItems: "center",
                }}
              >
                ⏰ Overtime Calculation Rules
              </Typography>
              <Typography variant="body2" sx={{ color: "#b0b0b0", mb: 3 }}>
                Configure how overtime is calculated and compensated
              </Typography>

              <Box
                sx={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))",
                  gap: 2,
                }}
              >
                <TextField
                  label="Single OT Multiplier"
                  type="number"
                  defaultValue={1}
                  fullWidth
                  inputProps={{ step: 0.1, min: 1, max: 3 }}
                  helperText="Multiplier for single overtime hours"
                  sx={{ "& .MuiInputBase-input": { color: "#ffffff" } }}
                />
                <TextField
                  label="Double OT Multiplier"
                  type="number"
                  defaultValue={2}
                  fullWidth
                  inputProps={{ step: 0.1, min: 1.5, max: 4 }}
                  helperText="Multiplier for double overtime hours"
                  sx={{ "& .MuiInputBase-input": { color: "#ffffff" } }}
                />
                <TextField
                  label="Holiday OT Multiplier"
                  type="number"
                  defaultValue={2.5}
                  fullWidth
                  inputProps={{ step: 0.1, min: 2, max: 5 }}
                  helperText="Multiplier for holiday overtime"
                  sx={{ "& .MuiInputBase-input": { color: "#ffffff" } }}
                />
              </Box>
            </Box>

            {/* Skill Categories Management */}
            <Box
              sx={{
                mb: 4,
                p: 3,
                backgroundColor: "#2d2d2d",
                borderRadius: 2,
                border: "1px solid #444",
              }}
            >
              <Typography
                variant="h6"
                sx={{
                  color: "#2196f3",
                  mb: 2,
                  display: "flex",
                  alignItems: "center",
                }}
              >
                🎯 Skill Categories & Adjustments
              </Typography>
              <Typography variant="body2" sx={{ color: "#b0b0b0", mb: 3 }}>
                Define skill-based salary adjustments for different employee
                categories
              </Typography>

              {skillCategories.map((skill, index) => (
                <Box
                  key={skill.id}
                  sx={{ display: "flex", gap: 2, mb: 2, alignItems: "center" }}
                >
                  <TextField
                    label="Skill Category Name"
                    value={skill.name}
                    onChange={(e) => {
                      const updated = [...skillCategories];
                      updated[index].name = e.target.value;
                      setSkillCategories(updated);
                    }}
                    sx={{
                      flex: 1,
                      "& .MuiInputBase-input": { color: "#ffffff" },
                    }}
                  />
                  <TextField
                    label="Adjustment Amount (₹)"
                    type="number"
                    value={skill.amount}
                    onChange={(e) => {
                      const updated = [...skillCategories];
                      updated[index].amount = parseFloat(e.target.value) || 0;
                      setSkillCategories(updated);
                    }}
                    sx={{
                      width: 200,
                      "& .MuiInputBase-input": { color: "#ffffff" },
                    }}
                    inputProps={{ min: 0 }}
                  />
                  <TextField
                    label="Description"
                    value={skill.description || ""}
                    onChange={(e) => {
                      const updated = [...skillCategories];
                      updated[index].description = e.target.value;
                      setSkillCategories(updated);
                    }}
                    sx={{
                      flex: 1,
                      "& .MuiInputBase-input": { color: "#ffffff" },
                    }}
                    placeholder="Optional description"
                  />
                  <Button
                    variant="outlined"
                    color="error"
                    onClick={() => {
                      setSkillCategories((prev) =>
                        prev.filter((_, i) => i !== index),
                      );
                    }}
                    sx={{ minWidth: "auto" }}
                  >
                    Remove
                  </Button>
                </Box>
              ))}
              <Button
                variant="outlined"
                onClick={() => {
                  setSkillCategories((prev) => [
                    ...prev,
                    {
                      id: Date.now().toString(),
                      name: "New Skill Category",
                      amount: 0,
                      description: "",
                    },
                  ]);
                }}
                sx={{ color: "#2196f3", borderColor: "#2196f3", mt: 2 }}
              >
                + Add Skill Category
              </Button>
            </Box>

            {/* Configuration Notes */}
            <Box
              sx={{
                p: 3,
                backgroundColor: "#1a1a1a",
                borderRadius: 2,
                border: "1px solid #333",
              }}
            >
              <Typography variant="h6" sx={{ color: "#ffffff", mb: 2 }}>
                📝 Configuration Notes
              </Typography>
              <Typography variant="body2" sx={{ color: "#b0b0b0", mb: 1 }}>
                • Changes to statutory rates should be made only when government
                policies change
              </Typography>
              <Typography variant="body2" sx={{ color: "#b0b0b0", mb: 1 }}>
                • Professional tax rates vary by state - ensure compliance with
                local regulations
              </Typography>
              <Typography variant="body2" sx={{ color: "#b0b0b0", mb: 1 }}>
                • Company policy rates can be adjusted based on organizational
                benefits structure
              </Typography>
              <Typography variant="body2" sx={{ color: "#b0b0b0", mb: 1 }}>
                • Custom parameters will be applied to all employees
                automatically
              </Typography>
              <Typography variant="body2" sx={{ color: "#b0b0b0" }}>
                • All changes will apply to future salary calculations and can
                be applied retroactively if needed
              </Typography>
            </Box>

            {/* Formula-based Column Calculator */}
            <Box
              sx={{
                my: 4,
                p: 3,
                backgroundColor: "#2d2d2d",
                borderRadius: 2,
                border: "1px solid #4caf50",
              }}
            >
              <Typography
                variant="h6"
                sx={{
                  color: "#4caf50",
                  mb: 2,
                  display: "flex",
                  alignItems: "center",
                }}
              >
                Column Formula Calculator
              </Typography>
              <Typography variant="body2" sx={{ color: "#b0b0b0", mb: 2 }}>
                Select a target column and define a formula using other columns,
                like basic * da or gross_rate_pm * 0.1. Unknown or missing
                inputs produce '-' and are stored as '-' similar to
                spreadsheets.
              </Typography>

              <Box
                sx={{
                  display: "grid",
                  gridTemplateColumns: "1fr 2fr auto",
                  gap: 2,
                  alignItems: "center",
                }}
              >
                <FormControl fullWidth>
                  <InputLabel sx={{ color: "#b0b0b0" }}>
                    Target Column
                  </InputLabel>
                  <Select
                    value={formulaTargetId}
                    label="Target Column"
                    onChange={(e) => setFormulaTargetId(String(e.target.value))}
                    sx={{ "& .MuiSelect-select": { color: "#ffffff" } }}
                  >
                    <Divider />
                    <MenuItem disabled>Info & Basic</MenuItem>
                    {allColumns()
                      .filter((c) => c.section === "info")
                      .map((c) => (
                        <MenuItem key={c.id} value={c.id}>
                          {c.name}
                        </MenuItem>
                      ))}
                    <Divider />
                    <MenuItem disabled>Earnings & Overtime</MenuItem>
                    {allColumns()
                      .filter((c) => c.section === "earnings")
                      .map((c) => (
                        <MenuItem key={c.id} value={c.id}>
                          {c.name}
                        </MenuItem>
                      ))}
                    <Divider />
                    <MenuItem disabled>Deductions & Net</MenuItem>
                    {allColumns()
                      .filter((c) => c.section === "deductions")
                      .map((c) => (
                        <MenuItem key={c.id} value={c.id}>
                          {c.name}
                        </MenuItem>
                      ))}
                    <Divider />
                    <MenuItem disabled>Employer Contributions & CTC</MenuItem>
                    {allColumns()
                      .filter((c) => c.section === "ctc")
                      .map((c) => (
                        <MenuItem key={c.id} value={c.id}>
                          {c.name}
                        </MenuItem>
                      ))}
                    {customColumns.length > 0 && <Divider />}
                    {customColumns.length > 0 && (
                      <MenuItem disabled>Custom Columns</MenuItem>
                    )}
                    {customColumns.length > 0 &&
                      allColumns()
                        .filter((c) => c.section === "custom")
                        .map((c) => (
                          <MenuItem key={c.id} value={c.id}>
                            {c.name}
                          </MenuItem>
                        ))}
                  </Select>
                </FormControl>

                <Box sx={{ position: "relative" }}>
                  <TextField
                    fullWidth
                    label="Formula (use column keys, e.g., basic * da)"
                    placeholder="e.g., gross_rate_pm * 0.1"
                    value={formulaExpression}
                    onChange={(e) => {
                      const newValue = e.target.value;
                      setFormulaExpression(newValue);
                      if (getLastToken(newValue)) {
                        setFormulaSuggestionsOpen(true);
                      } else {
                        setFormulaSuggestionsOpen(false);
                      }
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "ArrowDown" && formulaSuggestionsOpen) {
                        e.preventDefault();
                        setSelectedSuggestionIndex((prev) =>
                          prev < filteredSuggestions.length - 1 ? prev + 1 : 0,
                        );
                      } else if (
                        e.key === "ArrowUp" &&
                        formulaSuggestionsOpen
                      ) {
                        e.preventDefault();
                        setSelectedSuggestionIndex((prev) =>
                          prev > 0 ? prev - 1 : filteredSuggestions.length - 1,
                        );
                      } else if (
                        e.key === "Enter" &&
                        formulaSuggestionsOpen &&
                        selectedSuggestionIndex >= 0
                      ) {
                        e.preventDefault();
                        const selectedOption =
                          filteredSuggestions[selectedSuggestionIndex];
                        const newExpression = replaceLastToken(
                          formulaExpression,
                          selectedOption,
                        );
                        setFormulaExpression(newExpression);
                        setFormulaSuggestionsOpen(false);
                        setSelectedSuggestionIndex(-1);
                      } else if (e.key === "Escape") {
                        setFormulaSuggestionsOpen(false);
                        setSelectedSuggestionIndex(-1);
                      }
                    }}
                    onBlur={() => {
                      // Delay closing to allow for clicks on suggestions
                      setTimeout(() => {
                        setFormulaSuggestionsOpen(false);
                        setSelectedSuggestionIndex(-1);
                      }, 200);
                    }}
                    sx={{
                      "& .MuiInputBase-input": {
                        color: "#ffffff",
                        fontFamily: "monospace",
                      },
                    }}
                  />
                  {formulaSuggestionsOpen && filteredSuggestions.length > 0 && (
                    <Paper
                      sx={{
                        position: "absolute",
                        top: "100%",
                        left: 0,
                        right: 0,
                        zIndex: 1000,
                        maxHeight: 200,
                        overflow: "auto",
                        border: "1px solid #555",
                        borderRadius: 1,
                        backgroundColor: "#2d2d2d",
                        mt: 0.5,
                      }}
                    >
                      {filteredSuggestions.map((option, index) => (
                        <Box
                          key={option}
                          onClick={() => {
                            const newExpression = replaceLastToken(
                              formulaExpression,
                              option,
                            );
                            setFormulaExpression(newExpression);
                            setFormulaSuggestionsOpen(false);
                            setSelectedSuggestionIndex(-1);
                          }}
                          onMouseEnter={() => setSelectedSuggestionIndex(index)}
                          sx={{
                            padding: "8px 16px",
                            cursor: "pointer",
                            backgroundColor:
                              index === selectedSuggestionIndex
                                ? "#555"
                                : "transparent",
                            "&:hover": {
                              backgroundColor: "#555",
                            },
                          }}
                        >
                          {option}
                        </Box>
                      ))}
                    </Paper>
                  )}
                </Box>

                <Button
                  variant="contained"
                  disabled={
                    !formulaTargetId || !formulaExpression || formulaApplying
                  }
                  onClick={applyFormulaToEmployees}
                >
                  {formulaApplying ? <CircularProgress size={22} /> : "Apply"}
                </Button>
              </Box>

              <Typography
                variant="caption"
                sx={{ color: "#b0b0b0", display: "block", mt: 1 }}
              >
                Tip: Column keys are suggested as you type. Available keys
                include:{" "}
                {allColumns()
                  .slice(0, 8)
                  .map((c) => normalizeColumnKey(c.name))
                  .join(", ")}
                {allColumns().length > 8 ? ", ..." : ""}
              </Typography>
            </Box>

            <Box sx={{ display: "flex", gap: 1, mt: 2 }}>
              <Button
                variant="outlined"
                onClick={saveFormulaDraft}
                disabled={!formulaTargetId || !formulaExpression}
              >
                Save as Draft
              </Button>
            </Box>

            {formulaDrafts.length > 0 && (
              <Box
                sx={{
                  mt: 2,
                  p: 2,
                  backgroundColor: "#1a1a1a",
                  borderRadius: 1,
                  border: "1px solid #333",
                }}
              >
                <Typography
                  variant="subtitle1"
                  sx={{ color: "#ffffff", mb: 1 }}
                >
                  Saved Drafts
                </Typography>
                {formulaDrafts.map((d) => {
                  const target = allColumns().find((c) => c.id === d.targetId);
                  return (
                    <Box
                      key={d.id}
                      sx={{
                        display: "grid",
                        gridTemplateColumns: "1fr 1fr auto auto",
                        gap: 1,
                        alignItems: "center",
                        py: 1,
                      }}
                    >
                      <Typography sx={{ color: "#ffffff" }}>
                        {d.name}
                      </Typography>
                      <Typography
                        sx={{ color: "#b0b0b0", fontFamily: "monospace" }}
                      >
                        {target?.name || "Unknown"} ← {d.expression}
                      </Typography>
                      <Button
                        size="small"
                        onClick={() => loadFormulaDraft(d.id)}
                      >
                        Load
                      </Button>
                      <Button
                        size="small"
                        color="error"
                        onClick={() => deleteFormulaDraft(d.id)}
                      >
                        Delete
                      </Button>
                    </Box>
                  );
                })}
              </Box>
            )}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => setShowConfigDialog(false)}
            sx={{ color: "#b0b0b0" }}
          >
            Cancel
          </Button>
          <Button
            onClick={async () => {
              const success = await saveSalaryStructureConfig();
              if (success) {
                setShowConfigDialog(false);
              }
            }}
            variant="contained"
            disabled={configLoading}
            sx={{
              backgroundColor: "#2196f3",
              "&:hover": { backgroundColor: "#1976d2" },
            }}
          >
            {configLoading ? (
              <CircularProgress size={20} sx={{ mr: 1 }} />
            ) : null}
            {configLoading ? "Saving..." : "Save Configuration"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Bulk Edit Dialog */}
      <Dialog
        open={showBulkEditDialog}
        onClose={() => setShowBulkEditDialog(false)}
        maxWidth="lg"
        fullWidth
      >
        <DialogTitle>
          <Typography variant="h5" component="span">
            Bulk Edit All Employees ({filteredEmployees.length} employees)
          </Typography>
        </DialogTitle>
        <DialogContent>
          <Alert severity="info" sx={{ mb: 3 }}>
            Changes will be applied to all {filteredEmployees.length} employees.
            Leave fields empty to keep existing values.
          </Alert>

          <Box sx={{ mt: 2 }}>
            {/* Basic Components */}
            <Typography variant="h6" gutterBottom sx={{ mb: 2 }}>
              Basic Salary Components (Optional)
            </Typography>
            <Box sx={{ display: "flex", gap: 2, mb: 3, flexWrap: "wrap" }}>
              <Box sx={{ flex: 1, minWidth: 200 }}>
                <TextField
                  label="Basic Salary"
                  type="number"
                  value={bulkEditData.basic || ""}
                  onChange={(e) =>
                    setBulkEditData((prev) => ({
                      ...prev,
                      basic: parseFloat(e.target.value) || 0,
                    }))
                  }
                  fullWidth
                  helperText="Leave empty to keep existing values"
                />
              </Box>
              <Box sx={{ flex: 1, minWidth: 200 }}>
                <TextField
                  label="D.A. (Dearness Allowance)"
                  type="number"
                  value={bulkEditData.da || ""}
                  onChange={(e) =>
                    setBulkEditData((prev) => ({
                      ...prev,
                      da: parseFloat(e.target.value) || 0,
                    }))
                  }
                  fullWidth
                  helperText="Leave empty to keep existing values"
                />
              </Box>
              <Box sx={{ flex: 1, minWidth: 200 }}>
                <TextField
                  label="Advance"
                  type="number"
                  value={bulkEditData.advance || ""}
                  onChange={(e) =>
                    setBulkEditData((prev) => ({
                      ...prev,
                      advance: parseFloat(e.target.value) || 0,
                    }))
                  }
                  fullWidth
                  helperText="Leave empty to keep existing values"
                />
              </Box>
            </Box>

            <Divider sx={{ my: 3 }} />

            {/* Working Days */}
            <Typography variant="h6" gutterBottom sx={{ mb: 2 }}>
              Working Days (Optional)
            </Typography>
            <Box sx={{ display: "flex", gap: 2, mb: 3, flexWrap: "wrap" }}>
              <Box sx={{ flex: 1, minWidth: 200 }}>
                <TextField
                  label="Total Days"
                  type="number"
                  value={bulkEditData.totalDays ?? ""}
                  onChange={(e) =>
                    setBulkEditData((prev) => ({
                      ...prev,
                      totalDays:
                        e.target.value === ""
                          ? undefined
                          : parseFloat(e.target.value),
                    }))
                  }
                  fullWidth
                  helperText="Leave empty to keep existing values"
                />
              </Box>
              <Box sx={{ flex: 1, minWidth: 200 }}>
                <TextField
                  label="Paid Days"
                  type="number"
                  value={bulkEditData.paidDays ?? ""}
                  onChange={(e) =>
                    setBulkEditData((prev) => ({
                      ...prev,
                      paidDays:
                        e.target.value === ""
                          ? undefined
                          : parseFloat(e.target.value),
                    }))
                  }
                  fullWidth
                  helperText="Leave empty to keep existing values"
                />
              </Box>
            </Box>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowBulkEditDialog(false)}>Cancel</Button>
          <Button
            onClick={async () => {
              try {
                setEditLoading(true);
                const updates = filteredEmployees.map(async (employee) => {
                  const currentSalary = employee.salary || {};
                  const updatedData = {
                    ...currentSalary,
                    ...(bulkEditData.basic > 0 && {
                      basic: bulkEditData.basic,
                    }),
                    ...(bulkEditData.da > 0 && { da: bulkEditData.da }),
                    ...(bulkEditData.advance >= 0 && {
                      advance: bulkEditData.advance,
                    }),
                    ...(bulkEditData.totalDays !== undefined && {
                      totalDays: bulkEditData.totalDays,
                    }),
                    ...(bulkEditData.paidDays !== undefined && {
                      paidDays: bulkEditData.paidDays,
                    }),
                    ...(bulkEditData.hraPercentage > 0 && {
                      hraPercentage: bulkEditData.hraPercentage,
                    }),
                  };

                  return updateDoc(doc(db, "employees", employee.id), {
                    salary: updatedData,
                    updatedAt: new Date(),
                  });
                });

                await Promise.all(updates);
                setShowBulkEditDialog(false);
                setBulkEditData({
                  esicNo: "",
                  uan: "",
                  basic: 0,
                  da: 0,
                  totalDays: undefined,
                  paidDays: undefined,
                  singleOTHours: 0,
                  doubleOTHours: 0,
                  difference: 0,
                  advance: 0,
                  isSkillBased: false,
                  skillCategory: "",
                  skillAmount: 0,
                  customAllowances: [],
                  customBonuses: [],
                  customDeductions: [],
                  hraPercentage: 5,
                  esicEmployeePercentage: 0.75,
                  esicEmployerPercentage: 3.25,
                  pfEmployeePercentage: 12,
                  pfEmployerPercentage: 13,
                  mlwfEmployerAmount: 1,
                });
                loadEmployees();
                setAlert({
                  type: "success",
                  message: `Successfully updated ${filteredEmployees.length} employees!`,
                });
              } catch (error) {
                console.error("Error bulk updating employees:", error);
                setAlert({
                  type: "error",
                  message: "Failed to update employees",
                });
              } finally {
                setEditLoading(false);
              }
            }}
            variant="contained"
            disabled={editLoading}
            sx={{
              backgroundColor: "#e91e63",
              "&:hover": { backgroundColor: "#c2185b" },
            }}
          >
            {editLoading ? (
              <CircularProgress size={24} />
            ) : (
              `Update ${filteredEmployees.length} Employees`
            )}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
