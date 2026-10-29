"use client";

/**
 * TemplateSalaryView
 *
 * Renders the salary calculation table driven by a SalaryTemplate.
 * - Tabs = template sections
 * - Columns = template columns (with formula evaluation)
 * - "All Managers" → union of all sections across all assigned templates; missing = "-"
 * - Per-manager → that manager's assigned template (or global fallback)
 */

import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  Box,
  Tabs,
  Tab,
  Paper,
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
  TableContainer,
  TablePagination,
  Typography,
  CircularProgress,
  Chip,
  Tooltip,
  IconButton,
  Button,
} from "@mui/material";
import { Edit, Download, TableChart } from "@mui/icons-material";
import * as XLSX from "xlsx";
import {
  collection,
  getDocs,
  query,
  where,
  doc,
  getDoc,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import {
  SalaryTemplate,
  TemplateSection,
  TemplateColumn,
  salaryTemplateService,
  evaluateTemplateFormula,
  stripRemovedFixedColumns,
} from "@/lib/salaryTemplateService";
import { Employee } from "@/types";
import {
  fetchAttendanceVariables,
  AttendanceVariables,
} from "@/lib/attendanceDeductionUtils";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ManagerInfo {
  id: string;
  name: string;
  salaryTemplateId?: string;
}

interface Props {
  employees: Employee[];
  managers: ManagerInfo[];
  selectedManagerId: string;
  selectedMonth: number;
  selectedYear: number;
  page: number;
  rowsPerPage: number;
  onPageChange: (p: number) => void;
  onRowsPerPageChange: (r: number) => void;
  onEditEmployee: (emp: Employee) => void;
  refreshKey?: number;
}

// ─── Formula evaluator ────────────────────────────────────────────────────────

export function buildEmployeeCtx(emp: Employee, monthlyKey: string): Record<string, unknown> {
  // Use the selected month's data; fall back to empty (all zeros) if not yet set.
  const byMonth = (emp as any).salaryByMonth as Record<string, any> | undefined;
  const s: Record<string, any> = byMonth?.[monthlyKey] ?? {};

  // Spread ALL monthly salary keys first so any custom column values are available
  const allSalaryKeys: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(s)) {
    if (v !== null && v !== undefined && v !== "-") {
      const n = Number(v);
      allSalaryKeys[k] = Number.isFinite(n) ? n : v;
    } else {
      allSalaryKeys[k] = 0;
    }
  }

  const basic = Number(s.basic ?? (s as any).base ?? (emp as any).salary?.basic ?? (emp as any).salary?.base ?? 0);
  const da = Number(s.da ?? (emp as any).salary?.da ?? 0);
  const totalDays = Number(s.totalDays ?? (s as any).total_days ?? 30);
  const paidDays = Number(s.paidDays ?? (s as any).paid_days ?? totalDays);
  const ctcPerMonth = Number(s.ctcPerMonth ?? s.ctc_per_month ?? s.ctc ?? (emp as any).salary?.ctcPerMonth ?? 0);

  return {
    // Spread all salary keys first (catches custom template columns like conv_allowance)
    ...allSalaryKeys,
    // fixed info
    name: emp.fullName ?? "",
    employee_id: emp.employeeId ?? "",
    designation: (emp as any).designation ?? "",
    department: (emp as any).department ?? "",
    father_name: (emp as any).fatherName ?? "",
    dob: formatDate((emp as any).dob),
    joining_date: formatDate((emp as any).joinDate),
    esic_no: emp.esicNo ?? "",
    uan: emp.uan ?? "",
    epf_no: (emp as any).epfNo ?? "",
    hq_location: (emp as any).hqLocation ?? "",
    bank_account: (emp as any).bankAccount ?? "",
    ifsc_code: (emp as any).ifscCode ?? "",
    basic,
    da,
    total_days: totalDays,
    paid_days: paidDays,
    // earnings
    hra: Number(s.hra ?? 0),
    gross_rate_pm: Number(s.grossRatePM ?? s.gross_rate_pm ?? 0),
    rate_gross_pm: Number(s.grossRatePM ?? s.rate_gross_pm ?? 0), // alias — some templates use this key
    gross_earning: Number(s.totalGrossEarning ?? s.gross_earning ?? 0),
    ot_rate: Number(s.otRatePerHour ?? s.ot_rate ?? 0),
    single_ot_hours: Number(s.singleOTHours ?? s.single_ot_hours ?? 0),
    double_ot_hours: Number(s.doubleOTHours ?? s.double_ot_hours ?? 0),
    ot_amount: Number(s.otAmount ?? s.ot_amount ?? 0),
    difference: Number(s.difference ?? 0),
    total_gross: Number(s.totalGrossEarning ?? s.total_gross ?? 0),
    // deductions
    professional_tax: Number(s.professionalTax ?? s.professional_tax ?? 0),
    esic_employee: Number(s.esicEmployee ?? s.esic_employee ?? 0),
    pf_base: Number(s.pfBase ?? s.pf_base ?? 0),
    pf_employee: Number(s.pfEmployee ?? s.pf_employee ?? 0),
    advance: Number(s.advance ?? 0),
    total_deduction: Number(s.totalDeduction ?? s.total_deduction ?? 0),
    net_salary: Number(s.netSalary ?? s.net_salary ?? 0),
    // employer
    esic_employer: Number(s.esicEmployer ?? s.esic_employer ?? 0),
    pf_employer: Number(s.pfEmployer ?? s.pf_employer ?? 0),
    mlwf_employer: Number(s.mlwfEmployer ?? s.mlwf_employer ?? 0),
    ctc_per_month: ctcPerMonth,
    ctc: ctcPerMonth,
    ctc_pm: ctcPerMonth,
    // employee type (custom field)
    employee_type: (emp as any).employeeType ?? (emp as any).employee_type ?? "",
    // spread any extra salary keys (sanitize: treat "-"/null/undefined as 0)
    ...Object.fromEntries(
      Object.entries((emp as any).salaryOverrides ?? {}).map(([k, v]) => {
        const n = Number(v);
        return [k, (v === "-" || v === null || v === undefined || !Number.isFinite(n)) ? 0 : n];
      })
    ),
  };
}

/**
 * Pure evaluation helper that sets up full context, attendance, and evaluates all
 * template formulas in strict dependency order. Guarantees CTC and all downstream
 * formulas resolve accurately without dropping to 0.
 */
export function evaluateAllTemplateColumns(
  emp: Employee,
  tmpl: SalaryTemplate,
  monthlyKey: string,
  attendanceVars?: AttendanceVariables,
): Record<string, unknown> {
  const ctx = buildEmployeeCtx(emp, monthlyKey);

  // If attendance variables provided, merge them in
  if (attendanceVars) {
    ctx.present_days = attendanceVars.present_days;
    ctx.absent_days = attendanceVars.absent_days;
    ctx.half_days = attendanceVars.half_days;
    ctx.half_day_days = attendanceVars.half_days;
    ctx.leave_days = attendanceVars.leave_days;
    ctx.paid_leave_days = attendanceVars.paid_leave_days;
    ctx.working_holiday_days = attendanceVars.working_holiday_days;
    ctx.unmarked_days = attendanceVars.unmarked_days;
    ctx.total_days = attendanceVars.total_days;
    ctx.paid_days =
      attendanceVars.present_days +
      attendanceVars.half_days * 0.5 +
      attendanceVars.leave_days +
      attendanceVars.paid_leave_days +
      attendanceVars.working_holiday_days;
  }

  const directKeys = [
    "name",
    "employee_id",
    "esic_no",
    "uan",
    "epf_no",
    "father_name",
    "designation",
    "department",
    "dob",
    "joining_date",
    "hq_location",
    "basic",
    "da",
    "total_days",
    "paid_days",
  ];

  const allSections = [...tmpl.sections]
    .sort((a, b) => a.order - b.order)
    .map((sec) => ({
      ...sec,
      columns: [...sec.columns].sort((a, b) => a.order - b.order),
    }));

  // 1. Pre-populate all non-formula column values from stored month data or defaults (0 instead of undefined)
  // Ensures any column referenced by a formula exists in context and never causes ReferenceError / 0
  for (const sec of allSections) {
    for (const c of sec.columns) {
      if (!c.formula?.expression && !directKeys.includes(c.key)) {
        const monthData =
          ((emp as any).salaryByMonth as Record<string, any> | undefined)?.[
            monthlyKey
          ] ?? {};
        const stored =
          monthData[c.key] ??
          (emp as any).salaryOverrides?.[c.key] ??
          (emp as any).salary?.[c.key];
        if (
          stored !== undefined &&
          stored !== null &&
          stored !== "" &&
          stored !== "-"
        ) {
          ctx[c.key] = typeof stored === "number" ? stored : (Number(stored) || stored);
        } else if (ctx[c.key] === undefined) {
          ctx[c.key] = 0;
        }
      }
    }
  }

  // 2. Evaluate all formula columns in section/column order
  for (const sec of allSections) {
    for (const c of sec.columns) {
      if (c.formula?.expression) {
        const val = evaluateTemplateFormula(c.formula.expression, ctx);
        ctx[c.key] = typeof val === "number" ? val : 0;
      }
    }
  }

  return ctx;
}

export function evalCol(
  col: TemplateColumn,
  ctx: Record<string, unknown>,
  rawNumeric: boolean = false,
): string | number {
  // Fixed info columns — read directly from ctx
  const directKeys = [
    "name",
    "employee_id",
    "esic_no",
    "uan",
    "epf_no",
    "father_name",
    "designation",
    "department",
    "dob",
    "joining_date",
    "hq_location",
    "basic",
    "da",
    "total_days",
    "paid_days",
  ];
  if (directKeys.includes(col.key)) {
    const v = ctx[col.key];
    if (v === null || v === undefined || v === "") return "-";
    if (typeof v === "number") {
      if (rawNumeric) return v;
      return v === 0 ? "0" : formatNum(v);
    }
    return String(v);
  }

  // Formula or stored column — read evaluated value from ctx
  let v = ctx[col.key];

  // If not yet present in ctx and column has a formula, evaluate it
  if (v === undefined && col.formula?.expression) {
    const result = evaluateTemplateFormula(col.formula.expression, ctx);
    v = typeof result === "number" ? result : 0;
  }

  if (v === null || v === undefined || v === "" || v === "-") return "-";
  if (typeof v === "number") {
    if (rawNumeric) return Math.round(v * 100) / 100;
    return v === 0 ? "0" : formatNum(v);
  }
  return String(v);
}

export function formatNum(n: number): string {
  return String(Math.round(n));
}

export function formatDate(value: unknown): string {
  if (!value) return "-";
  // Excel serial number
  if (typeof value === "number") {
    const d = new Date(new Date(1899, 11, 30).getTime() + value * 86400000);
    return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleDateString();
  }
  if (value instanceof Date) return value.toLocaleDateString();
  if (typeof value === "object" && value !== null) {
    if ("seconds" in (value as any)) return new Date((value as any).seconds * 1000).toLocaleDateString();
    if (typeof (value as any).toDate === "function") return (value as any).toDate().toLocaleDateString();
  }
  const str = String(value).trim();
  if (!str) return "-";
  const parsed = new Date(str);
  return Number.isNaN(parsed.getTime()) ? str : parsed.toLocaleDateString();
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function TemplateSalaryView({
  employees,
  managers,
  selectedManagerId,
  selectedMonth,
  selectedYear,
  page,
  rowsPerPage,
  onPageChange,
  onRowsPerPageChange,
  onEditEmployee,
  refreshKey,
}: Props) {
  const { currentUser } = useAuth();
  const [templates, setTemplates] = useState<SalaryTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [tabIndex, setTabIndex] = useState(0);
  const [exporting, setExporting] = useState(false);
  // attendance vars keyed by emp.id
  const [attendanceVars, setAttendanceVars] = useState<Map<string, AttendanceVariables>>(new Map());

  const companyId = currentUser?.uid ?? "";

  // Pay period derived from parent-controlled month/year
  const payPeriod = useMemo(() => {
    const totalDays = new Date(selectedYear, selectedMonth, 0).getDate();
    return { month: selectedMonth, year: selectedYear, totalDays };
  }, [selectedMonth, selectedYear]);

  // Clear attendance cache when pay period changes so fresh data is fetched
  useEffect(() => {
    setAttendanceVars(new Map());
  }, [selectedMonth, selectedYear]);

  // ── Load all templates ────────────────────────────────────────────────────

  useEffect(() => {
    if (!companyId) return;
    setLoading(true);
    salaryTemplateService
      .getAll(companyId)
      .then((tmpl) =>
        setTemplates(
          tmpl.map((t) => ({
            ...t,
            sections: stripRemovedFixedColumns(t.sections),
          })),
        ),
      )
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [companyId]);

  // Re-fetch templates when parent signals a refresh (e.g. after template save/assignment)
  useEffect(() => {
    if (!companyId || !refreshKey) return;
    salaryTemplateService
      .getAll(companyId)
      .then((tmpl) =>
        setTemplates(
          tmpl.map((t) => ({
            ...t,
            sections: stripRemovedFixedColumns(t.sections),
          })),
        ),
      )
      .catch(console.error);
  }, [refreshKey, companyId]);

  // ── Resolve which template applies per employee ───────────────────────────

  const getTemplateForManager = useCallback(
    (managerId: string): SalaryTemplate | null => {
      const mgr = managers.find((m) => m.id === managerId);
      // 1. Manager doc has an explicit salaryTemplateId assigned via "Assign Template" dialog
      if (mgr?.salaryTemplateId) {
        const t = templates.find((t) => t.id === mgr.salaryTemplateId);
        if (t) return t;
      }
      // 2. Template was assigned to this manager via the template editor's "Assign to Manager" dropdown
      const byManagerId = templates.find((t) => t.managerId === managerId);
      if (byManagerId) return byManagerId;
      // 3. Fall back to global template (managerId === null)
      return templates.find((t) => t.managerId === null) ?? null;
    },
    [managers, templates]
  );

  // ── Sections to display ───────────────────────────────────────────────────

  /** The single global template (managerId === null), if any */
  const globalTemplate = useMemo(
    () => templates.find((t) => t.managerId === null) ?? null,
    [templates]
  );

  // ── Get template for a specific employee (for formula eval) ──────────────

  const getTemplateForEmployee = useCallback(
    (emp: Employee): SalaryTemplate | null => {
      const managerId =
        (Array.isArray(emp.assignedManagers)
          ? emp.assignedManagers[0]
          : emp.assignedManager) ?? "";
      return getTemplateForManager(managerId);
    },
    [getTemplateForManager]
  );

  const visibleEmployees = useMemo(() => {
    if (selectedManagerId === "all") {
      // No global template → show nothing
      if (!globalTemplate) return [];
      // Only show employees whose resolved template IS the global template
      return employees.filter((emp) => {
        const tmpl = getTemplateForEmployee(emp);
        return tmpl?.id === globalTemplate.id;
      });
    }
    return employees.filter((emp) => {
      if (Array.isArray(emp.assignedManagers))
        return emp.assignedManagers.includes(selectedManagerId);
      return emp.assignedManager === selectedManagerId;
    });
  }, [employees, selectedManagerId, globalTemplate, getTemplateForEmployee]);

  const paged = visibleEmployees.slice(
    page * rowsPerPage,
    page * rowsPerPage + rowsPerPage
  );

  useEffect(() => {
    if (paged.length === 0) return;
    Promise.all(
      paged.map((emp) =>
        fetchAttendanceVariables(db, emp.id, payPeriod.month, payPeriod.year, payPeriod.totalDays)
          .then((vars) => ({ id: emp.id, vars }))
      )
    ).then((results) => {
      setAttendanceVars((prev) => {
        const next = new Map(prev);
        results.forEach(({ id, vars }) => next.set(id, vars));
        return next;
      });
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paged.map((e) => e.id).join(","), payPeriod]);

  const displaySections = useMemo((): TemplateSection[] => {
    if (selectedManagerId === "all") {
      if (!globalTemplate) return [];
      return [...globalTemplate.sections].sort((a, b) => a.order - b.order);
    }
    const tmpl = getTemplateForManager(selectedManagerId);
    if (!tmpl) return [];
    return [...tmpl.sections].sort((a, b) => a.order - b.order);
  }, [selectedManagerId, globalTemplate, getTemplateForManager]);

  const getCellValue = useCallback(
    (emp: Employee, section: TemplateSection, col: TemplateColumn, rawNumeric: boolean = false): string | number => {
      let tmpl: SalaryTemplate | null;
      if (selectedManagerId !== "all") {
        tmpl = getTemplateForManager(selectedManagerId);
      } else {
        tmpl = getTemplateForEmployee(emp);
      }
      if (!tmpl) return "-";

      const empSection = tmpl.sections.find(
        (s) => s.label.toLowerCase().trim() === section.label.toLowerCase().trim()
      );
      if (!empSection) return "-";

      const empCol = empSection.columns.find((c) => c.key === col.key);
      if (!empCol) return "-";

      const ctx = evaluateAllTemplateColumns(
        emp,
        tmpl,
        `${selectedYear}-${selectedMonth}`,
        attendanceVars.get(emp.id)
      );

      return evalCol(empCol, ctx, rawNumeric);
    },
    [getTemplateForEmployee, getTemplateForManager, selectedManagerId, attendanceVars, selectedYear, selectedMonth]
  );

  // Helper to ensure all visible employees have attendance variables cached before export
  const ensureAllAttendanceVars = async (empList: Employee[]): Promise<Map<string, AttendanceVariables>> => {
    const map = new Map(attendanceVars);
    const missing = empList.filter((e) => !map.has(e.id));
    if (missing.length > 0) {
      const results = await Promise.all(
        missing.map((e) =>
          fetchAttendanceVariables(db, e.id, payPeriod.month, payPeriod.year, payPeriod.totalDays)
            .then((vars) => ({ id: e.id, vars }))
            .catch(() => ({
              id: e.id,
              vars: {
                present_days: 0,
                absent_days: 0,
                half_days: 0,
                leave_days: 0,
                paid_leave_days: 0,
                working_holiday_days: 0,
                unmarked_days: 0,
                total_days: payPeriod.totalDays,
              },
            }))
        )
      );
      results.forEach(({ id, vars }) => map.set(id, vars));
      setAttendanceVars(map);
    }
    return map;
  };

  /** Export the current active table tab to Excel (Table to Excel) */
  const exportCurrentTableTab = async () => {
    if (!currentSection || visibleEmployees.length === 0) return;
    try {
      setExporting(true);
      const attMap = await ensureAllAttendanceVars(visibleEmployees);

      // Build rows for the current section only — exact same columns and data as the visible table
      const data = visibleEmployees.map((emp, index) => {
        let tmpl: SalaryTemplate | null;
        if (selectedManagerId !== "all") {
          tmpl = getTemplateForManager(selectedManagerId);
        } else {
          tmpl = getTemplateForEmployee(emp);
        }

        const ctx = tmpl
          ? evaluateAllTemplateColumns(emp, tmpl, `${selectedYear}-${selectedMonth}`, attMap.get(emp.id))
          : buildEmployeeCtx(emp, `${selectedYear}-${selectedMonth}`);

        const row: Record<string, string | number> = {
          "SR. NO.": index + 1,
          "Employee ID": emp.employeeId || "",
          "Name": emp.fullName || "",
        };

        for (const col of currentSection.columns) {
          if (col.key !== "name" && col.key !== "employee_id") {
            row[col.label] = evalCol(col, ctx, true);
          }
        }
        return row;
      });

      const ws = XLSX.utils.json_to_sheet(data);
      const colCount = Object.keys(data[0] || {}).length;
      ws["!cols"] = Array(colCount).fill({ wch: 18 });
      const wb = XLSX.utils.book_new();
      const sheetName = currentSection.label.slice(0, 31).replace(/[:\\/?*\[\]]/g, "_");
      XLSX.utils.book_append_sheet(wb, ws, sheetName);

      const monthName = new Date(selectedYear, selectedMonth - 1, 1).toLocaleString("default", { month: "short" }).toUpperCase();
      const filename = `${monthName}-${selectedYear}_${currentSection.label.replace(/[^a-zA-Z0-9]+/g, "_")}.xlsx`;
      XLSX.writeFile(wb, filename);
    } catch (err) {
      console.error("Export current table error:", err);
    } finally {
      setExporting(false);
    }
  };

  /** Export all sections combined into a single Excel sheet */
  const exportAllSections = async () => {
    if (displaySections.length === 0 || visibleEmployees.length === 0) return;
    try {
      setExporting(true);
      const attMap = await ensureAllAttendanceVars(visibleEmployees);

      const data = visibleEmployees.map((emp, index) => {
        let tmpl: SalaryTemplate | null;
        if (selectedManagerId !== "all") {
          tmpl = getTemplateForManager(selectedManagerId);
        } else {
          tmpl = getTemplateForEmployee(emp);
        }

        const ctx = tmpl
          ? evaluateAllTemplateColumns(emp, tmpl, `${selectedYear}-${selectedMonth}`, attMap.get(emp.id))
          : buildEmployeeCtx(emp, `${selectedYear}-${selectedMonth}`);

        const row: Record<string, string | number> = {
          "SR. NO.": index + 1,
        };

        // Add all columns across all sections
        for (const sec of displaySections) {
          for (const col of sec.columns) {
            const label = col.label in row ? `${col.label} (${sec.label})` : col.label;
            row[label] = evalCol(col, ctx, true);
          }
        }
        return row;
      });

      const ws = XLSX.utils.json_to_sheet(data);
      const colCount = Object.keys(data[0] || {}).length;
      ws["!cols"] = Array(colCount).fill({ wch: 18 });
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Salary Data");

      const monthName = new Date(selectedYear, selectedMonth - 1, 1).toLocaleString("default", { month: "long" }).toUpperCase();
      const filename = `${monthName}-${selectedYear}_WAGES_UPDATE.xlsx`;
      XLSX.writeFile(wb, filename);
    } catch (err) {
      console.error("Export all sections error:", err);
    } finally {
      setExporting(false);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" py={4}>
        <CircularProgress />
      </Box>
    );
  }

  if (templates.length === 0) {
    return (
      <Box sx={{ p: 3, textAlign: "center" }}>
        <Typography color="text.secondary">
          No salary templates found. Create one in the{" "}
          <strong>Salary Templates</strong> tab first.
        </Typography>
      </Box>
    );
  }

  if (displaySections.length === 0) {
    return (
      <Box sx={{ p: 3, textAlign: "center" }}>
        <Typography color="text.secondary">
          {selectedManagerId === "all"
            ? "No global template found. Create a global template (not assigned to any specific manager) in the Salary Templates tab to view all employees here."
            : "No template assigned to this manager. Assign one in the Salary Templates tab."}
        </Typography>
      </Box>
    );
  }

  const currentSection = displaySections[tabIndex] ?? displaySections[0];

  return (
    <Paper sx={{ backgroundColor: "#2d2d2d", border: "1px solid #333" }}>
      {/* Header bar: Section tabs on left, Table to Excel buttons on right */}
      <Box
        sx={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          borderBottom: "1px solid #333",
          flexWrap: "wrap",
          pr: 2,
        }}
      >
        <Tabs
          value={Math.min(tabIndex, displaySections.length - 1)}
          onChange={(_, v) => setTabIndex(v)}
          variant="scrollable"
          scrollButtons="auto"
          sx={{
            flex: 1,
            "& .MuiTab-root": { color: "#aaa", fontSize: 13 },
            "& .Mui-selected": { color: "#2196f3" },
            "& .MuiTabs-indicator": { backgroundColor: "#2196f3" },
          }}
        >
          {displaySections.map((sec) => (
            <Tab key={sec.id} label={sec.label} />
          ))}
        </Tabs>
        <Box sx={{ display: "flex", gap: 1, py: 0.5, flexWrap: "wrap" }}>
          <Button
            size="small"
            variant="outlined"
            startIcon={exporting ? <CircularProgress size={16} /> : <TableChart />}
            onClick={exportCurrentTableTab}
            disabled={exporting}
            sx={{
              color: "#2196f3",
              borderColor: "#2196f3",
              fontSize: 12,
              textTransform: "none",
              borderRadius: 1.5,
              "&:hover": { borderColor: "#64b5f6", backgroundColor: "rgba(33, 150, 243, 0.08)" },
            }}
          >
            {exporting ? "Exporting…" : `Export Table (${currentSection?.label || "Tab"})`}
          </Button>
          <Button
            size="small"
            variant="contained"
            color="success"
            startIcon={exporting ? <CircularProgress size={16} /> : <Download />}
            onClick={exportAllSections}
            disabled={exporting}
            sx={{ fontSize: 12, textTransform: "none", borderRadius: 1.5 }}
          >
            Export All to Excel
          </Button>
        </Box>
      </Box>

      {/* Table for current section */}
      {currentSection && (
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow sx={{ backgroundColor: "#1e1e1e" }}>
                {currentSection.columns.map((col) => (
                  <TableCell
                    key={col.id}
                    sx={{ fontWeight: 600, color: "#fff", whiteSpace: "nowrap" }}
                  >
                    <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                      {col.label}
                      {col.formula && (
                        <Tooltip title={`Formula: ${col.formula.expression}`}>
                          <Chip
                            label="ƒ"
                            size="small"
                            sx={{ fontSize: 9, height: 16, cursor: "help", ml: 0.5 }}
                          />
                        </Tooltip>
                      )}
                    </Box>
                  </TableCell>
                ))}
                <TableCell sx={{ fontWeight: 600, color: "#fff" }}>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {paged.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={currentSection.columns.length + 1}
                    sx={{ textAlign: "center", color: "#888", py: 4 }}
                  >
                    No employees found
                  </TableCell>
                </TableRow>
              ) : (
                paged.map((emp) => (
                  <TableRow
                    key={emp.id}
                    sx={{ "&:hover": { backgroundColor: "#3d3d3d" } }}
                  >
                    {currentSection.columns.map((col) => {
                      const val = getCellValue(emp, currentSection, col, false);
                      const isMissing = val === "-";
                      return (
                        <TableCell
                          key={col.id}
                          sx={{
                            color: isMissing ? "#555" : "#fff",
                            fontStyle: isMissing ? "italic" : "normal",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {val}
                        </TableCell>
                      );
                    })}
                    <TableCell>
                      <Tooltip title="Edit salary">
                        <IconButton
                          size="small"
                          sx={{ color: "#2196f3" }}
                          onClick={() => onEditEmployee(emp)}
                        >
                          <Edit fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      <TablePagination
        component="div"
        count={visibleEmployees.length}
        rowsPerPage={rowsPerPage}
        page={page}
        onPageChange={(_, p) => onPageChange(p)}
        onRowsPerPageChange={(e) => onRowsPerPageChange(parseInt(e.target.value, 10))}
        rowsPerPageOptions={[10, 25, 50]}
        sx={{ color: "#aaa", borderTop: "1px solid #333" }}
      />
    </Paper>
  );
}
