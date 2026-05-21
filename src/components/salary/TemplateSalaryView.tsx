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
  FormControl,
  Select,
  MenuItem,
  InputLabel,
} from "@mui/material";
import { Edit } from "@mui/icons-material";
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
  page: number;
  rowsPerPage: number;
  onPageChange: (p: number) => void;
  onRowsPerPageChange: (r: number) => void;
  onEditEmployee: (emp: Employee) => void;
}

// ─── Formula evaluator ────────────────────────────────────────────────────────

function buildEmployeeCtx(emp: Employee): Record<string, unknown> {
  const s = emp.salary ?? {};
  return {
    // fixed info
    name: emp.fullName ?? "",
    employee_id: emp.employeeId ?? "",
    esic_no: emp.esicNo ?? "",
    uan: emp.uan ?? "",
    basic: Number(s.basic ?? (s as any).base ?? 0),
    da: Number(s.da ?? 0),
    total_days: Number(s.totalDays ?? 30),
    paid_days: Number(s.paidDays ?? 30),
    // earnings
    hra: Number(s.hra ?? 0),
    gross_rate_pm: Number(s.grossRatePM ?? 0),
    gross_earning: Number(s.totalGrossEarning ?? 0),
    ot_rate: Number(s.otRatePerHour ?? 0),
    single_ot_hours: Number(s.singleOTHours ?? 0),
    double_ot_hours: Number(s.doubleOTHours ?? 0),
    ot_amount: Number(s.otAmount ?? 0),
    difference: Number(s.difference ?? 0),
    total_gross: Number(s.totalGrossEarning ?? 0),
    // deductions
    professional_tax: Number(s.professionalTax ?? 0),
    esic_employee: Number(s.esicEmployee ?? 0),
    pf_base: Number(s.pfBase ?? 0),
    pf_employee: Number(s.pfEmployee ?? 0),
    advance: Number(s.advance ?? 0),
    total_deduction: Number(s.totalDeduction ?? 0),
    net_salary: Number(s.netSalary ?? 0),
    // employer
    esic_employer: Number(s.esicEmployer ?? 0),
    pf_employer: Number(s.pfEmployer ?? 0),
    mlwf_employer: Number(s.mlwfEmployer ?? 0),
    ctc_per_month: Number(s.ctcPerMonth ?? 0),
    // employee type (custom field)
    employee_type: (emp as any).employeeType ?? (emp as any).employee_type ?? "",
    // spread any extra salary keys
    ...(emp as any).salaryOverrides,
  };
}

function evalCol(col: TemplateColumn, ctx: Record<string, unknown>): string {
  // Fixed info columns — read directly from ctx
  const directKeys = [
    "name", "employee_id", "esic_no", "uan", "basic", "da",
    "total_days", "paid_days",
  ];
  if (directKeys.includes(col.key)) {
    const v = ctx[col.key];
    if (v === null || v === undefined || v === "") return "-";
    if (typeof v === "number") return v === 0 ? "0" : formatNum(v);
    return String(v);
  }

  if (col.formula?.expression) {
    const result = evaluateTemplateFormula(col.formula.expression, ctx);
    if (result === 0 || result === "0") return "₹0";
    if (typeof result === "number") return `₹${formatNum(result)}`;
    if (result === null || result === undefined || result === "") return "-";
    return String(result);
  }

  // No formula — read the pre-populated stored value from ctx
  const v = ctx[col.key];
  if (v === null || v === undefined || v === "" || v === "-") return "-";
  if (typeof v === "number") return v === 0 ? "₹0" : `₹${formatNum(v)}`;
  return String(v);
}

function formatNum(n: number): string {
  return Math.round(n).toLocaleString("en-IN");
}

// ─── Build union sections for "All Managers" view ────────────────────────────

function buildUnionSections(templates: SalaryTemplate[]): TemplateSection[] {
  if (templates.length === 0) return [];

  // Collect all unique sections by label (case-insensitive)
  const sectionMap = new Map<string, TemplateSection>();

  for (const tmpl of templates) {
    for (const sec of tmpl.sections) {
      const key = sec.label.toLowerCase().trim();
      if (!sectionMap.has(key)) {
        sectionMap.set(key, { ...sec, columns: [...sec.columns] });
      } else {
        // Merge columns — add any column keys not already present
        const existing = sectionMap.get(key)!;
        for (const col of sec.columns) {
          if (!existing.columns.find((c) => c.key === col.key)) {
            existing.columns.push(col);
          }
        }
      }
    }
  }

  return Array.from(sectionMap.values()).sort((a, b) => a.order - b.order);
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function TemplateSalaryView({
  employees,
  managers,
  selectedManagerId,
  page,
  rowsPerPage,
  onPageChange,
  onRowsPerPageChange,
  onEditEmployee,
}: Props) {
  const { currentUser } = useAuth();
  const [templates, setTemplates] = useState<SalaryTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [tabIndex, setTabIndex] = useState(0);
  // attendance vars keyed by emp.id
  const [attendanceVars, setAttendanceVars] = useState<Map<string, AttendanceVariables>>(new Map());

  const companyId = currentUser?.uid ?? "";

  // Pay period — user-selectable month/year, defaults to current month
  const now = new Date();
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1); // 1-based
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());

  const payPeriod = useMemo(() => {
    const totalDays = new Date(selectedYear, selectedMonth, 0).getDate();
    return { month: selectedMonth, year: selectedYear, totalDays };
  }, [selectedMonth, selectedYear]);

  // Clear attendance cache when pay period changes so fresh data is fetched
  useEffect(() => {
    setAttendanceVars(new Map());
  }, [selectedMonth, selectedYear]);

  // Year options: 2 years back through next year
  const yearOptions = [now.getFullYear() - 2, now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1];
  const monthNames = [
    "January","February","March","April","May","June",
    "July","August","September","October","November","December",
  ];

  // ── Load all templates ────────────────────────────────────────────────────

  useEffect(() => {
    if (!companyId) return;
    setLoading(true);
    salaryTemplateService
      .getAll(companyId)
      .then(setTemplates)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [companyId]);

  // ── Load attendance variables for all visible employees ──────────────────

  const visibleEmployees = useMemo(() => {
    if (selectedManagerId === "all") return employees;
    return employees.filter((emp) => {
      if (Array.isArray(emp.assignedManagers))
        return emp.assignedManagers.includes(selectedManagerId);
      return emp.assignedManager === selectedManagerId;
    });
  }, [employees, selectedManagerId]);

  const paged = visibleEmployees.slice(
    page * rowsPerPage,
    page * rowsPerPage + rowsPerPage
  );

  useEffect(() => {
    if (paged.length === 0) return;

    console.log("[TemplateSalaryView] Fetching attendance for", paged.length, "employees, period:", payPeriod);

    Promise.all(
      paged.map((emp) =>
        fetchAttendanceVariables(db, emp.id, payPeriod.month, payPeriod.year, payPeriod.totalDays)
          .then((vars) => {
            console.log(`[Attendance] emp.id=${emp.id} emp.employeeId=${emp.employeeId}`, vars);
            return { id: emp.id, vars };
          })
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

  // ── Resolve which template applies per employee ───────────────────────────

  const getTemplateForManager = useCallback(
    (managerId: string): SalaryTemplate | null => {
      const mgr = managers.find((m) => m.id === managerId);
      if (!mgr) return null;
      if (mgr.salaryTemplateId) {
        const t = templates.find((t) => t.id === mgr.salaryTemplateId);
        if (t) return t;
      }
      return templates.find((t) => t.managerId === null) ?? null;
    },
    [managers, templates]
  );

  // ── Sections to display ───────────────────────────────────────────────────

  const displaySections = useMemo((): TemplateSection[] => {
    if (selectedManagerId === "all") return buildUnionSections(templates);
    const tmpl = getTemplateForManager(selectedManagerId);
    if (!tmpl) return [];
    return [...tmpl.sections].sort((a, b) => a.order - b.order);
  }, [selectedManagerId, templates, getTemplateForManager]);

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

  // ── Evaluate a column value for an employee ───────────────────────────────

  const getCellValue = useCallback(
    (emp: Employee, section: TemplateSection, col: TemplateColumn): string => {
      const tmpl = getTemplateForEmployee(emp);
      if (!tmpl) return "-";

      const empSection = tmpl.sections.find(
        (s) => s.label.toLowerCase().trim() === section.label.toLowerCase().trim()
      );
      if (!empSection) return "-";

      const empCol = empSection.columns.find((c) => c.key === col.key);
      if (!empCol) return "-";

      // Build context and merge real attendance variables from state
      const ctx = buildEmployeeCtx(emp);
      const vars = attendanceVars.get(emp.id);
      if (vars) {
        ctx.present_days = vars.present_days;
        ctx.absent_days = vars.absent_days;
        ctx.half_days = vars.half_days;
        ctx.half_day_days = vars.half_days; // legacy alias
        ctx.leave_days = vars.leave_days;
        ctx.paid_leave_days = vars.paid_leave_days;
        ctx.unmarked_days = vars.unmarked_days;
        ctx.total_days = vars.total_days;
        // paid_days = present + half*0.5 + leave (unmarked treated as absent)
        ctx.paid_days = vars.present_days + vars.half_days * 0.5 + vars.leave_days + vars.paid_leave_days;
        if (col.key === "base_after_attendance") {
          console.log(`[Formula] ${emp.fullName} | formula="${col.formula?.expression}" | basic=${ctx.basic} total_days=${ctx.total_days} present_days=${ctx.present_days} absent_days=${ctx.absent_days}`);
        }
      } else {
        if (col.key === "base_after_attendance") {
          console.warn(`[Formula] NO attendance vars for emp.id=${emp.id} (${emp.fullName}) — formula will use defaults`);
        }
      }

      // Pre-populate no-formula column values from stored salary data so:
      // 1. evalCol can read them from ctx, and
      // 2. formula columns that reference a no-formula column get the correct value
      const directKeys = ["name", "employee_id", "esic_no", "uan", "basic", "da", "total_days", "paid_days"];
      const allSections = [...tmpl.sections].sort((a, b) => a.order - b.order);
      for (const sec of allSections) {
        for (const c of sec.columns) {
          if (!c.formula?.expression && !directKeys.includes(c.key)) {
            const stored =
              (emp.salary as any)?.[c.key] ??
              (emp as any).salaryOverrides?.[c.key];
            if (stored !== undefined && stored !== null && stored !== "" && stored !== "-") {
              ctx[c.key] = stored;
            }
          }
        }
      }

      // Evaluate all columns in order so formulas can reference prior results
      for (const sec of allSections) {
        for (const c of sec.columns) {
          if (c.formula?.expression) {
            const val = evaluateTemplateFormula(c.formula.expression, ctx);
            ctx[c.key] = typeof val === "number" ? val : 0;
          }
          if (c.key === col.key && sec.id === empSection.id) {
            return evalCol(empCol, ctx);
          }
        }
      }

      return evalCol(empCol, ctx);
    },
    [getTemplateForEmployee, attendanceVars]
  );

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
          No template assigned to this manager. Assign one in the{" "}
          <strong>Salary Templates</strong> tab.
        </Typography>
      </Box>
    );
  }

  const currentSection = displaySections[tabIndex] ?? displaySections[0];

  return (
    <Paper sx={{ backgroundColor: "#2d2d2d", border: "1px solid #333" }}>
      {/* Month / Year selector */}
      <Box sx={{ display: "flex", alignItems: "center", gap: 2, px: 2, pt: 2, pb: 1 }}>
        <Typography variant="body2" sx={{ color: "#aaa", whiteSpace: "nowrap" }}>
          Attendance Period:
        </Typography>
        <FormControl size="small" sx={{ minWidth: 140 }}>
          <InputLabel sx={{ color: "#aaa" }}>Month</InputLabel>
          <Select
            label="Month"
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(Number(e.target.value))}
            sx={{ color: "#fff", "& .MuiOutlinedInput-notchedOutline": { borderColor: "#555" } }}
          >
            {monthNames.map((name, i) => (
              <MenuItem key={i + 1} value={i + 1}>{name}</MenuItem>
            ))}
          </Select>
        </FormControl>
        <FormControl size="small" sx={{ minWidth: 100 }}>
          <InputLabel sx={{ color: "#aaa" }}>Year</InputLabel>
          <Select
            label="Year"
            value={selectedYear}
            onChange={(e) => setSelectedYear(Number(e.target.value))}
            sx={{ color: "#fff", "& .MuiOutlinedInput-notchedOutline": { borderColor: "#555" } }}
          >
            {yearOptions.map((y) => (
              <MenuItem key={y} value={y}>{y}</MenuItem>
            ))}
          </Select>
        </FormControl>
        <Typography variant="caption" sx={{ color: "#666" }}>
          {payPeriod.totalDays} days
        </Typography>
      </Box>

      {/* Section tabs */}
      <Tabs
        value={Math.min(tabIndex, displaySections.length - 1)}
        onChange={(_, v) => setTabIndex(v)}
        variant="scrollable"
        scrollButtons="auto"
        sx={{
          borderBottom: "1px solid #333",
          "& .MuiTab-root": { color: "#aaa", fontSize: 13 },
          "& .Mui-selected": { color: "#2196f3" },
          "& .MuiTabs-indicator": { backgroundColor: "#2196f3" },
        }}
      >
        {displaySections.map((sec) => (
          <Tab key={sec.id} label={sec.label} />
        ))}
      </Tabs>

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
                      const val = getCellValue(emp, currentSection, col);
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
