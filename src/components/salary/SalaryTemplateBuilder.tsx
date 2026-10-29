"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  Box,
  Typography,
  Button,
  TextField,
  Paper,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  CircularProgress,
  Alert,
  Tooltip,
  Chip,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Divider,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  ToggleButton,
  ToggleButtonGroup,
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
  TableContainer,
  Menu,
  ListItemIcon,
} from "@mui/material";
import {
  Add,
  Delete,
  Edit,
  Save,
  ExpandMore,
  ContentCopy,
  Assignment,
  Lock,
  DragIndicator,
  Functions,
  PlayArrow,
  AddCircleOutline,
  KeyboardArrowDown,
} from "@mui/icons-material";
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import {
  salaryTemplateService,
  SalaryTemplate,
  TemplateSection,
  TemplateColumn,
  stripRemovedFixedColumns,
  ensureFixedSections,
} from "@/lib/salaryTemplateService";

// ─── helpers ──────────────────────────────────────────────────────────────────

const uid = () => `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

const normalize = (s: string) =>
  s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

// ─── Formula evaluator (preview) ─────────────────────────────────────────────
// Supports: arithmetic, if(cond, then, else), nested ifs, multiple else-if,
//           string comparisons. No-else if() returns 0.

/** Split top-level comma-separated args, respecting nested parens and strings. */
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
      inStr = true; strChar = ch; cur += ch;
    } else if (ch === "(") {
      depth++; cur += ch;
    } else if (ch === ")") {
      depth--; cur += ch;
    } else if (ch === "," && depth === 0) {
      parts.push(cur.trim()); cur = "";
    } else {
      cur += ch;
    }
  }
  if (cur.trim()) parts.push(cur.trim());
  return parts;
}

/** Find matching closing ')' starting just after `openPos`. Returns index or -1. */
function findClosingParen(s: string, openPos: number): number {
  let depth = 1;
  let inStr = false;
  let strChar = "";
  for (let i = openPos + 1; i < s.length; i++) {
    const ch = s[i];
    if (inStr) {
      if (ch === strChar && s[i - 1] !== "\\") inStr = false;
    } else if (ch === '"' || ch === "'") {
      inStr = true; strChar = ch;
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
 * Transform all if(...) calls into JS ternaries, innermost-first.
 *  - 3-arg: if(cond, thenVal, elseVal) → ((cond) ? (thenVal) : (elseVal))
 *  - 2-arg: if(cond, thenVal)          → ((cond) ? (thenVal) : 0)
 */
function transformIf(expr: string): string {
  let result = expr;
  let safety = 0;
  while (/\bif\s*\(/i.test(result) && safety++ < 200) {
    const ifMatch = [...result.matchAll(/\bif\s*\(/gi)].pop();
    if (!ifMatch || ifMatch.index === undefined) break;
    const openIdx = ifMatch.index + ifMatch[0].length - 1;
    const closeIdx = findClosingParen(result, openIdx);
    if (closeIdx === -1) break;
    const inner = result.slice(openIdx + 1, closeIdx);
    const args = splitArgs(inner);
    let ternary: string;
    if (args.length >= 3) {
      ternary = `((${args[0]}) ? (${args[1]}) : (${args[2]}))`;
    } else if (args.length === 2) {
      ternary = `((${args[0]}) ? (${args[1]}) : 0)`;
    } else {
      ternary = "0";
    }
    result = result.slice(0, ifMatch.index) + ternary + result.slice(closeIdx + 1);
  }
  return result;
}

function evaluateFormula(expr: string, ctx: Record<string, unknown>): string {
  if (!expr.trim()) return "-";
  try {
    const keys = Object.keys(ctx);
    const vals = keys.map((k) => ctx[k]);

    const transformed = transformIf(expr.trim())
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

    const finalExpr = transformed.replace(/Math\.round\s*\(/g, "__round__(");

    const __round__ = (v: unknown, dec: unknown) => {
      const n = Number(v);
      const d = Number(dec ?? 0);
      if (!isFinite(n)) return 0;
      const factor = Math.pow(10, d);
      return Math.round(n * factor) / factor;
    };

    // eslint-disable-next-line no-new-func
    const fn = new Function("__round__", ...keys, `"use strict"; return (${finalExpr});`);
    const result = fn(__round__, ...vals);
    if (result === null || result === undefined) return "-";
    if (result === "") return '""';
    if (typeof result === "string") return result;
    if (typeof result === "number") return isFinite(result) ? String(Math.round(result * 100) / 100) : "-";
    return String(result);
  } catch {
    return "error";
  }
}

// ─── Condition builder types ──────────────────────────────────────────────────

type Operator = ">" | ">=" | "<" | "<=" | "==" | "!=" | "==str";
interface ConditionRow {
  id: string;
  left: string;       // variable key or literal
  op: Operator;
  right: string;      // value or variable key
  thenExpr: string;   // result if true
  elseExpr: string;   // result if false (can be another if(...) or 0)
}

const OP_LABELS: Record<Operator, string> = {
  ">": "> (greater than)",
  ">=": ">= (greater or equal)",
  "<": "< (less than)",
  "<=": "<= (less or equal)",
  "==": "== (equals number)",
  "!=": "!= (not equal)",
  "==str": '== (equals text, e.g. "labor")',
};

function conditionToExpr(row: ConditionRow): string {
  const right = row.op === "==str" ? `"${row.right}"` : row.right;
  const op = row.op === "==str" ? "==" : row.op;
  return `if(${row.left} ${op} ${right}, ${row.thenExpr || "0"}, ${row.elseExpr || "0"})`;
}

// ─── Formula Dialog ───────────────────────────────────────────────────────────

interface FormulaDialogProps {
  open: boolean;
  column: TemplateColumn | null;
  allKeys: string[];           // keys available for formula (before this column)
  allKeysForConverter: string[]; // ALL keys in template — for converter mapping dropdown
  onSave: (col: TemplateColumn) => void;
  onClose: () => void;
}

const SAMPLE_CTX: Record<string, unknown> = {
  name: "Hariom",
  basic: 15000, da: 775, hra: 788, paid_days: 26,
  gross_rate_pm: 16563, gross_earning: 14355, ot_rate: 69.01,
  single_ot_hours: 0, double_ot_hours: 0, ot_amount: 0, difference: 0,
  total_gross: 14355,
  professional_tax: 200, esic_employee: 108,
  pf_base: 13400, pf_employee: 1608, advance: 0, total_deduction: 1916,
  net_salary: 12439, esic_employer: 467, pf_employer: 1742,
  mlwf_employer: 1, ctc_per_month: 16565,
  employee_type: "labor",
  // Attendance variables
  present_days: 24, absent_days: 2, half_days: 1, leave_days: 1,
  paid_leave_days: 0, working_holiday_days: 0, unmarked_days: 2, total_days: 30,
};

export const ATTENDANCE_VARIABLES: { key: string; label: string }[] = [
  { key: "present_days",    label: "Present Days" },
  { key: "absent_days",     label: "Absent Days" },
  { key: "half_days",       label: "Half Days" },
  { key: "leave_days",      label: "Leave Days" },
  { key: "paid_leave_days", label: "Paid Leave Days" },
  { key: "working_holiday_days", label: "Working Holiday Days" },
  { key: "unmarked_days",   label: "Unmarked Days" },
  { key: "total_days",      label: "Total Days" },
];

// ─── Excel → EMS formula converter ───────────────────────────────────────────

/**
 * Converts an Excel-style formula to EMS template formula syntax.
 *
 * Handles:
 *  - IF(cond, then, else)        → if(cond, then, else)
 *  - AND(a, b, ...)              → (a && b && ...)
 *  - OR(a, b, ...)               → (a || b || ...)
 *  - NOT(a)                      → (!a)
 *  - =  (equality operator)      → ==   (only when standalone, not >= <=)
 *  - <> (not-equal)              → !=
 *  - TRUE / FALSE                → true / false
 *  - & (string concat)           → +
 *  - N%  (percent literal)       → (N/100)   e.g. 12% → (12/100)
 *  - Removes leading = from formula
 */
function convertExcelFormula(raw: string): { result: string; warnings: string[]; cellRefs: string[] } {
  const warnings: string[] = [];
  let s = raw.trim();

  // Strip leading = (Excel formula bar prefix)
  if (s.startsWith("=")) s = s.slice(1).trim();

  // ── Handle SUM(ref1:ref2) range syntax FIRST ──
  // e.g. SUM(M7:AA7) → __RANGE_SUM__(M7,AA7)
  // Captures both cell refs and replaces with a placeholder for mapping step
  s = s.replace(/\bSUM\s*\(\s*([A-Z]{1,3}\d+)\s*:\s*([A-Z]{1,3}\d+)\s*\)/gi, (_, r1, r2) => {
    return `__RANGE_SUM__(${r1.toUpperCase()},${r2.toUpperCase()})`;
  });

  // Recursively process function calls from innermost outward
  // We replace: IF(, AND(, OR(, NOT(  (case-insensitive)
  let safety = 0;
  while (/\b(IF|AND|OR|NOT)\s*\(/i.test(s) && safety++ < 300) {
    s = s.replace(/\b(IF|AND|OR|NOT)\s*\(/gi, (_, fn) => `__EX_${fn.toUpperCase()}__(`);

    // Process innermost __EX_XXX__(...) — no nested parens inside
    s = s.replace(/__EX_(IF|AND|OR|NOT)__\(([^()]*)\)/g, (_, fn: string, inner: string) => {
      const args = splitExcelArgs(inner);
      switch (fn) {
        case "IF": {
          if (args.length === 3) return `if(${args[0]}, ${args[1]}, ${args[2]})`;
          if (args.length === 2) return `if(${args[0]}, ${args[1]})`;
          warnings.push(`IF with ${args.length} args — check manually`);
          return `if(${args.join(", ")})`;
        }
        case "AND":
          return `(${args.join(" && ")})`;
        case "OR":
          return `(${args.join(" || ")})`;
        case "NOT":
          return `(!${args[0]})`;
        default:
          return inner;
      }
    });
  }

  // Clean up any leftover __EX_XXX__ markers (shouldn't happen but safety)
  s = s.replace(/__EX_(IF|AND|OR|NOT)__/g, (_, fn) => fn.toLowerCase());

  // <> → !=
  s = s.replace(/<>/g, "!=");

  // Standalone = → ==
  // Must not touch >= <= != ==
  s = s.replace(/([^!<>=])=([^=])/g, "$1==$2");
  // Edge case: = at start of token
  s = s.replace(/^=([^=])/g, "==$1");

  // TRUE / FALSE (whole word, case-insensitive) → JS booleans
  s = s.replace(/\bTRUE\b/gi, "true").replace(/\bFALSE\b/gi, "false");

  // Strip quotes from purely numeric string literals: "0" → 0, "175" → 175
  // These come from Excel formulas where users wrote IF(cond,"200",0) instead of IF(cond,200,0)
  // Match "123", "123.45", "-123" — but NOT strings like "labor" or "active"
  s = s.replace(/"(-?\d+(?:\.\d+)?)"/g, "$1");
  s = s.replace(/'(-?\d+(?:\.\d+)?)'/g, "$1");

  // String concat & → +  (but not && which we already placed)
  s = s.replace(/([^&])&([^&])/g, "$1+$2");
  s = s.replace(/^&/, "+").replace(/&$/, "+");

  // Excel percent literals: N% means N/100 (e.g. 12% → (12/100), 5.5% → (5.5/100)).
  // Without this, "%" is later interpreted as the JS modulo operator, breaking
  // formulas like ROUND(AP13*12%,0).
  s = s.replace(/(\d+(?:\.\d+)?)\s*%/g, "($1/100)");

  // Detect Excel cell refs like A1, B12, AA3 — including those inside __RANGE_SUM__
  const cellRefMatches = s.match(/\b[A-Z]{1,3}\d+\b/g);
  const cellRefs = cellRefMatches ? [...new Set(cellRefMatches)] : [];

  // Math functions the EMS evaluator supports natively (see evaluateTemplateFormula)
  // — these must NOT be reported as unsupported.
  const SUPPORTED_FNS = new Set([
    "ROUND", "ROUNDUP", "ROUNDDOWN", "CEIL", "FLOOR", "ABS",
    "MIN", "MAX", "SQRT", "POW", "INT", "TRUNC",
  ]);

  // Excel functions we don't handle — warn (exclude __RANGE_SUM__ which we do handle)
  const unknownFns = s.replace(/__RANGE_SUM__/g, "").match(/\b([A-Z][A-Z0-9_]+)\s*\(/g);
  if (unknownFns) {
    const names = [
      ...new Set(
        unknownFns
          .map((f) => f.replace(/\s*\($/, ""))
          .filter((name) => !SUPPORTED_FNS.has(name.toUpperCase())),
      ),
    ];
    if (names.length > 0) {
      warnings.push(`Unsupported Excel functions: ${names.join(", ")} — convert manually`);
    }
  }

  return { result: s.trim(), warnings, cellRefs };
}

/** Apply cell ref → variable name mappings to a converted formula string.
 *  allKeys: ordered list of all variable keys in the template — used to
 *  expand __RANGE_SUM__(ref1,ref2) into var1 + var2 + var3 + ... */
function applyCellMappings(formula: string, mappings: Record<string, string>, allKeys: string[] = []): string {
  let result = formula;
  // Sort longest refs first to avoid partial replacement (e.g. AA1 before A1)
  const sorted = Object.keys(mappings).sort((a, b) => b.length - a.length);

  // Expand __RANGE_SUM__(REF1,REF2) → mapped1 + mapped2 + ... (all keys between inclusive)
  result = result.replace(/__RANGE_SUM__\(([A-Z]{1,3}\d+),([A-Z]{1,3}\d+)\)/g, (_, r1, r2) => {
    const v1 = mappings[r1]?.trim() || r1;
    const v2 = mappings[r2]?.trim() || r2;

    if (allKeys.length > 0) {
      const i1 = allKeys.indexOf(v1);
      const i2 = allKeys.indexOf(v2);
      if (i1 !== -1 && i2 !== -1) {
        const from = Math.min(i1, i2);
        const to   = Math.max(i1, i2);
        const rangeKeys = allKeys.slice(from, to + 1);
        return rangeKeys.join(" + ");
      }
    }
    // Fallback: just the two endpoints if keys not found in template
    return `${v1} + ${v2}`;
  });

  // Then: replace remaining standalone cell refs
  for (const ref of sorted) {
    const varName = mappings[ref]?.trim();
    if (!varName) continue;
    result = result.replace(new RegExp(`\\b${ref}\\b`, "g"), varName);
  }
  return result;
}

/** Split comma-separated Excel args, respecting nested parens and strings */
function splitExcelArgs(s: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let inStr = false;
  let strChar = "";
  let cur = "";
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (inStr) {
      cur += ch;
      if (ch === strChar) inStr = false;
    } else if (ch === '"' || ch === "'") {
      inStr = true; strChar = ch; cur += ch;
    } else if (ch === "(") {
      depth++; cur += ch;
    } else if (ch === ")") {
      depth--; cur += ch;
    } else if (ch === "," && depth === 0) {
      parts.push(cur.trim()); cur = "";
    } else {
      cur += ch;
    }
  }
  if (cur.trim()) parts.push(cur.trim());
  return parts;
}

function FormulaDialog({ open, column, allKeys, allKeysForConverter, onSave, onClose }: FormulaDialogProps) {
  const [mode, setMode] = useState<"simple" | "conditional">("simple");
  const [expr, setExpr] = useState(column?.formula?.expression ?? "");
  const [desc, setDesc] = useState(column?.formula?.description ?? "");
  // Ref to the raw expression textarea
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);

  // Track which conditional field is focused: { rowId, field: 'left'|'right'|'thenExpr'|'elseExpr' }
  // or null = raw textarea is the target
  const [focusedCondField, setFocusedCondField] = useState<{
    rowId: string;
    field: "left" | "right" | "thenExpr" | "elseExpr";
  } | null>(null);
  // Refs for each conditional input: keyed by `${rowId}_${field}`
  const condInputRefs = React.useRef<Record<string, HTMLInputElement | null>>({});

  // Condition builder rows
  const [conditions, setConditions] = useState<ConditionRow[]>([
    { id: uid(), left: "basic", op: ">", right: "10000", thenExpr: "basic * 0.05", elseExpr: "0" },
  ]);

  // Excel converter state
  const [excelInput, setExcelInput] = useState("");
  const [convertResult, setConvertResult] = useState<{ result: string; warnings: string[]; cellRefs: string[] } | null>(null);
  // Cell ref → variable mapping: { A1: "basic", B1: "da", ... }
  const [cellMappings, setCellMappings] = useState<Record<string, string>>({});
  // Step: "input" | "mapping" | "done"
  const [converterStep, setConverterStep] = useState<"input" | "mapping" | "done">("input");

  useEffect(() => {
    const raw = column?.formula?.expression ?? "";
    setExpr(raw);
    setDesc(column?.formula?.description ?? "");
    setMode(raw.toLowerCase().includes("if(") ? "conditional" : "simple");
    setFocusedCondField(null);
    conditionsReady.current = false; // reset so sync doesn't fire on open
  }, [column]);

  // Sync condition builder → raw expr
  // conditionsReady guards against the initial render overwriting the loaded formula
  const conditionsReady = React.useRef(false);
  useEffect(() => {
    if (mode !== "conditional") { conditionsReady.current = false; return; }
    if (!conditionsReady.current) { conditionsReady.current = true; return; }
    if (conditions.length === 0) return;
    let built = conditions[conditions.length - 1].elseExpr || "0";
    for (let i = conditions.length - 1; i >= 0; i--) {
      const row = conditions[i];
      const right = row.op === "==str" ? `"${row.right}"` : row.right;
      const op = row.op === "==str" ? "==" : row.op;
      built = `if(${row.left} ${op} ${right}, ${row.thenExpr || "0"}, ${built})`;
    }
    setExpr(built);
  }, [conditions, mode]);

  const preview = useMemo(() => evaluateFormula(expr, SAMPLE_CTX), [expr]);

  if (!column) return null;

  // Generic insert-at-cursor for any HTMLInputElement or HTMLTextAreaElement
  const insertAtCursor = (
    el: HTMLInputElement | HTMLTextAreaElement,
    currentValue: string,
    key: string,
    onUpdate: (newVal: string, newPos: number) => void
  ) => {
    const start = el.selectionStart ?? currentValue.length;
    const end = el.selectionEnd ?? currentValue.length;
    const before = currentValue.slice(0, start);
    const after = currentValue.slice(end);
    const needSpaceBefore = before.length > 0 && !/[\s(,]$/.test(before);
    const needSpaceAfter = after.length > 0 && !/^[\s),+\-*/]/.test(after);
    const newVal =
      before +
      (needSpaceBefore ? " " : "") +
      key +
      (needSpaceAfter ? " " : "") +
      after;
    const newPos = start + (needSpaceBefore ? 1 : 0) + key.length + (needSpaceAfter ? 1 : 0);
    onUpdate(newVal, newPos);
    setTimeout(() => {
      el.focus();
      el.setSelectionRange(newPos, newPos);
    }, 0);
  };

  // Insert key into whichever field is currently focused
  const insertKey = (k: string) => {
    // Conditional mode: insert into the focused condition field
    if (mode === "conditional" && focusedCondField) {
      const { rowId, field } = focusedCondField;
      const refKey = `${rowId}_${field}`;
      const el = condInputRefs.current[refKey];
      const row = conditions.find((r) => r.id === rowId);
      if (el && row) {
        insertAtCursor(el, row[field], k, (newVal, newPos) => {
          updateCondition(rowId, { [field]: newVal } as Partial<ConditionRow>);
        });
        return;
      }
    }
    // Default: insert into raw textarea
    const ta = textareaRef.current;
    if (ta) {
      insertAtCursor(ta, expr, k, (newVal) => {
        setExpr(newVal);
        setMode("simple");
      });
    } else {
      setExpr((p) => p + (p && !p.endsWith(" ") ? " " : "") + k + " ");
    }
  };

  const updateCondition = (id: string, patch: Partial<ConditionRow>) =>
    setConditions((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  const addCondition = () =>
    setConditions((prev) => [
      ...prev,
      { id: uid(), left: "basic", op: ">", right: "0", thenExpr: "0", elseExpr: "0" },
    ]);

  const removeCondition = (id: string) =>
    setConditions((prev) => prev.filter((r) => r.id !== id));

  const handleSave = () => {
    onSave({
      ...column,
      formula: expr.trim()
        ? { expression: expr.trim(), description: desc.trim() }
        : undefined,
    });
    onClose();
  };

  // Helper: props to attach to each conditional TextField for focus tracking + ref
  const condFieldProps = (rowId: string, field: "left" | "right" | "thenExpr" | "elseExpr") => ({
    inputRef: (el: HTMLInputElement | null) => {
      condInputRefs.current[`${rowId}_${field}`] = el;
    },
    onFocus: () => setFocusedCondField({ rowId, field }),
  });

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="md"
      fullWidth
      PaperProps={{
        sx: {
          background: "rgba(15, 23, 42, 0.95)",
          backdropFilter: "blur(30px)",
          border: "1px solid rgba(255, 255, 255, 0.1)",
          borderRadius: "20px",
          boxShadow: "0 25px 60px rgba(0, 0, 0, 0.5)",
        },
      }}
    >
      <DialogTitle sx={{ color: "#6366f1", fontWeight: 600, borderBottom: "1px solid rgba(255, 255, 255, 0.08)", pb: 1.5 }}>
        Set Formula — <span style={{ color: "#f1f5f9" }}>{column.label}</span>
      </DialogTitle>

      <DialogContent sx={{ p: 3, pt: "20px !important" }}>
        {/* Mode toggle */}
        <Box sx={{ display: "flex", alignItems: "center", gap: 2, mt: 1, mb: 2 }}>
          <ToggleButtonGroup
            value={mode}
            exclusive
            onChange={(_, v) => v && setMode(v)}
            size="small"
            sx={{
              backgroundColor: "rgba(255, 255, 255, 0.03)",
              border: "1px solid rgba(255, 255, 255, 0.08)",
              borderRadius: "10px",
              "& .MuiToggleButton-root": {
                color: "#94a3b8",
                textTransform: "none",
                fontWeight: 500,
                px: 2,
                border: "none",
                "&.Mui-selected": {
                  backgroundColor: "rgba(99, 102, 241, 0.2)",
                  color: "#a5b4fc",
                },
                "&:hover": {
                  backgroundColor: "rgba(255, 255, 255, 0.05)",
                },
              },
            }}
          >
            <ToggleButton value="simple">Simple Formula</ToggleButton>
            <ToggleButton value="conditional">Conditional (if/else)</ToggleButton>
          </ToggleButtonGroup>
          <Typography variant="caption" sx={{ color: "#94a3b8" }}>
            Preview (sample data):&nbsp;
            <span style={{ color: preview === "error" ? "#ef4444" : "#10b981", fontFamily: "monospace", fontWeight: 700 }}>
              {preview}
            </span>
          </Typography>
        </Box>

        {/* Available variable chips */}
        <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 0.5 }}>
          <Typography variant="caption" sx={{ color: "#94a3b8" }}>
            Click a key to insert at cursor:
          </Typography>
          {mode === "conditional" && focusedCondField && (
            <Typography variant="caption" sx={{ color: "#10b981", fontFamily: "monospace" }}>
              → inserting into <strong>{focusedCondField.field}</strong>
            </Typography>
          )}
          {mode === "conditional" && !focusedCondField && (
            <Typography variant="caption" sx={{ color: "#94a3b8" }}>
              (click a field above first, or inserts into raw expression)
            </Typography>
          )}
        </Box>
        <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5, mb: 1 }}>
          {[...new Set([...allKeys, "employee_type"])].map((k) => (
            <Chip
              key={k}
              label={k}
              size="small"
              onClick={() => insertKey(k)}
              sx={{
                fontFamily: "monospace",
                cursor: "pointer",
                fontSize: 11,
                backgroundColor: "rgba(255, 255, 255, 0.04)",
                border: "1px solid rgba(255, 255, 255, 0.08)",
                color: "#f1f5f9",
                "&:hover": {
                  backgroundColor: "rgba(99, 102, 241, 0.15)",
                  borderColor: "rgba(99, 102, 241, 0.3)",
                  color: "#a5b4fc",
                },
              }}
            />
          ))}
        </Box>

        {/* Attendance variable chips */}
        <Box sx={{ mb: 2 }}>
          <Typography variant="caption" sx={{ color: "#94a3b8", display: "block", mb: 0.5 }}>
            Attendance variables:
          </Typography>
          <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5 }}>
            {ATTENDANCE_VARIABLES.map(({ key, label }) => (
              <Chip
                key={key}
                label={key}
                size="small"
                onClick={() => insertKey(key)}
                title={label}
                sx={{
                  fontFamily: "monospace",
                  cursor: "pointer",
                  fontSize: 11,
                  backgroundColor: "rgba(99, 102, 241, 0.1)",
                  borderColor: "rgba(99, 102, 241, 0.25)",
                  color: "#a5b4fc",
                  border: "1px solid",
                  "&:hover": {
                    backgroundColor: "rgba(99, 102, 241, 0.2)",
                    borderColor: "rgba(99, 102, 241, 0.4)",
                  },
                }}
              />
            ))}
          </Box>
        </Box>

        {/* ── Conditional builder ── */}
        {mode === "conditional" && (
          <Box sx={{ mb: 2 }}>
            <Typography variant="body2" sx={{ mb: 1, color: "#94a3b8" }}>
              Conditions are evaluated top-to-bottom. First match wins.
            </Typography>

            {conditions.map((row, idx) => (
              <Paper
                key={row.id}
                sx={{
                  p: 1.5,
                  mb: 1.5,
                  background: "rgba(255, 255, 255, 0.03)",
                  backdropFilter: "blur(10px)",
                  border: "1px solid rgba(255, 255, 255, 0.08)",
                  borderRadius: "12px",
                }}
              >
                <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1 }}>
                  <Typography variant="caption" sx={{ color: "#94a3b8", minWidth: 60, fontWeight: 600 }}>
                    {idx === 0 ? "IF" : "ELSE IF"}
                  </Typography>
                  {/* Left operand */}
                  <TextField
                    size="small"
                    label="Variable"
                    value={row.left}
                    onChange={(e) => updateCondition(row.id, { left: e.target.value })}
                    sx={{
                      width: 140,
                      "& input": { fontFamily: "monospace", fontSize: 12, color: "#f1f5f9" },
                      "& .MuiOutlinedInput-root": {
                        backgroundColor: "rgba(255, 255, 255, 0.03)",
                        borderRadius: "8px",
                        "& fieldset": { borderColor: "rgba(255, 255, 255, 0.1)" },
                        "&:hover fieldset": { borderColor: "rgba(99, 102, 241, 0.3)" },
                        "&.Mui-focused fieldset": { borderColor: "#6366f1" },
                      },
                    }}
                    placeholder="e.g. basic"
                    {...condFieldProps(row.id, "left")}
                  />
                  {/* Operator */}
                  <FormControl size="small" sx={{ minWidth: 180 }}>
                    <InputLabel sx={{ color: "#94a3b8" }}>Condition</InputLabel>
                    <Select
                      value={row.op}
                      label="Condition"
                      onChange={(e) => updateCondition(row.id, { op: e.target.value as Operator })}
                      sx={{
                        backgroundColor: "rgba(255, 255, 255, 0.03)",
                        borderRadius: "8px",
                        color: "#f1f5f9",
                        "& fieldset": { borderColor: "rgba(255, 255, 255, 0.1)" },
                        "&:hover fieldset": { borderColor: "rgba(99, 102, 241, 0.3)" },
                        "&.Mui-focused fieldset": { borderColor: "#6366f1" },
                        "& .MuiSelect-icon": { color: "#94a3b8" },
                      }}
                    >
                      {(Object.keys(OP_LABELS) as Operator[]).map((op) => (
                        <MenuItem key={op} value={op} sx={{ fontSize: 13 }}>
                          {OP_LABELS[op]}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                  {/* Right value */}
                  <TextField
                    size="small"
                    label={row.op === "==str" ? "Value (text)" : "Value / variable"}
                    value={row.right}
                    onChange={(e) => updateCondition(row.id, { right: e.target.value })}
                    sx={{
                      width: 150,
                      "& input": { fontFamily: "monospace", fontSize: 12, color: "#f1f5f9" },
                      "& .MuiOutlinedInput-root": {
                        backgroundColor: "rgba(255, 255, 255, 0.03)",
                        borderRadius: "8px",
                        "& fieldset": { borderColor: "rgba(255, 255, 255, 0.1)" },
                        "&:hover fieldset": { borderColor: "rgba(99, 102, 241, 0.3)" },
                        "&.Mui-focused fieldset": { borderColor: "#6366f1" },
                      },
                    }}
                    placeholder={row.op === "==str" ? "e.g. labor" : "e.g. 10000"}
                    {...condFieldProps(row.id, "right")}
                  />
                  <IconButton
                    size="small"
                    onClick={() => removeCondition(row.id)}
                    sx={{ color: "#ef4444", ml: "auto", "&:hover": { backgroundColor: "rgba(239, 68, 68, 0.1)" } }}
                  >
                    <Delete fontSize="small" />
                  </IconButton>
                </Box>

                <Box sx={{ display: "flex", gap: 1, pl: 8 }}>
                  <TextField
                    size="small"
                    label="Then (result if true)"
                    value={row.thenExpr}
                    onChange={(e) => updateCondition(row.id, { thenExpr: e.target.value })}
                    sx={{
                      flex: 1,
                      "& input": { fontFamily: "monospace", fontSize: 12, color: "#f1f5f9" },
                      "& .MuiOutlinedInput-root": {
                        backgroundColor: "rgba(255, 255, 255, 0.03)",
                        borderRadius: "8px",
                        "& fieldset": { borderColor: "rgba(255, 255, 255, 0.1)" },
                        "&:hover fieldset": { borderColor: "rgba(99, 102, 241, 0.3)" },
                        "&.Mui-focused fieldset": { borderColor: "#6366f1" },
                      },
                    }}
                    placeholder="e.g. basic * 0.05"
                    {...condFieldProps(row.id, "thenExpr")}
                  />
                  {idx === conditions.length - 1 && (
                    <TextField
                      size="small"
                      label="Else (default result)"
                      value={row.elseExpr}
                      onChange={(e) => updateCondition(row.id, { elseExpr: e.target.value })}
                      sx={{
                        flex: 1,
                        "& input": { fontFamily: "monospace", fontSize: 12, color: "#f1f5f9" },
                        "& .MuiOutlinedInput-root": {
                          backgroundColor: "rgba(255, 255, 255, 0.03)",
                          borderRadius: "8px",
                          "& fieldset": { borderColor: "rgba(255, 255, 255, 0.1)" },
                          "&:hover fieldset": { borderColor: "rgba(99, 102, 241, 0.3)" },
                          "&.Mui-focused fieldset": { borderColor: "#6366f1" },
                        },
                      }}
                      placeholder="e.g. 0"
                      {...condFieldProps(row.id, "elseExpr")}
                    />
                  )}
                </Box>
              </Paper>
            ))}

            <Button
              size="small"
              startIcon={<AddCircleOutline />}
              onClick={addCondition}
              sx={{
                color: "#10b981",
                textTransform: "none",
                fontWeight: 500,
                borderRadius: "8px",
                "&:hover": { backgroundColor: "rgba(16, 185, 129, 0.1)" },
              }}
            >
              Add another condition
            </Button>
          </Box>
        )}

        <Divider sx={{ my: 2, borderColor: "rgba(255, 255, 255, 0.06)" }} />

        {/* Excel formula converter */}
        <Accordion
          sx={{
            mb: 2,
            background: "rgba(255, 255, 255, 0.03)",
            backdropFilter: "blur(20px)",
            border: "1px solid rgba(99, 102, 241, 0.25)",
            borderRadius: "14px !important",
            overflow: "hidden",
            boxShadow: "0 8px 32px rgba(0, 0, 0, 0.2)",
            transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
            "&:before": { display: "none" },
            "&.Mui-expanded": {
              borderColor: "rgba(99, 102, 241, 0.4)",
              boxShadow: "0 12px 36px rgba(99, 102, 241, 0.15)",
            },
          }}
        >
          <AccordionSummary expandIcon={<ExpandMore sx={{ color: "#a5b4fc" }} />}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              <Functions sx={{ color: "#6366f1", fontSize: 18 }} />
              <Typography variant="caption" sx={{ color: "#a5b4fc", fontWeight: 600 }}>
                Excel Formula Converter — paste Excel formula, get EMS formula
              </Typography>
            </Box>
          </AccordionSummary>
          <AccordionDetails sx={{ pt: 1, px: 2, pb: 2 }}>

            {/* ── Step 1: Paste input ── */}
            {converterStep === "input" && (
              <Box>
                <Typography variant="caption" sx={{ color: "#94a3b8", display: "block", mb: 1 }}>
                  Paste your Excel formula. Cell refs like A1, B2 will be detected and you can map them to variable names.
                </Typography>
                <TextField
                  label="Paste Excel Formula here"
                  value={excelInput}
                  onChange={(e) => { setExcelInput(e.target.value); setConvertResult(null); }}
                  fullWidth
                  multiline
                  rows={2}
                  sx={{
                    mb: 1.5,
                    "& textarea": { fontFamily: "monospace", fontSize: 12, color: "#f1f5f9" },
                    "& .MuiOutlinedInput-root": {
                      backgroundColor: "rgba(255, 255, 255, 0.03)",
                      borderRadius: "12px",
                      "& fieldset": { borderColor: "rgba(255, 255, 255, 0.1)" },
                      "&:hover fieldset": { borderColor: "rgba(99, 102, 241, 0.3)" },
                      "&.Mui-focused fieldset": { borderColor: "#6366f1" },
                    },
                  }}
                  placeholder={"e.g.  =IF(AND(A1>=10000,A1<=20000),A1*0.05,0)"}
                />
                <Button
                  variant="contained"
                  size="small"
                  startIcon={<PlayArrow />}
                  onClick={() => {
                    if (!excelInput.trim()) return;
                    const res = convertExcelFormula(excelInput);
                    setConvertResult(res);
                    const initial: Record<string, string> = {};
                    res.cellRefs.forEach((ref) => { initial[ref] = ""; });
                    setCellMappings(initial);
                    setConverterStep(res.cellRefs.length > 0 ? "mapping" : "done");
                  }}
                  sx={{
                    backgroundColor: "#6366f1",
                    color: "#f1f5f9",
                    borderRadius: "10px",
                    fontWeight: 600,
                    textTransform: "none",
                    boxShadow: "6px 6px 12px rgba(0, 0, 0, 0.35), inset 2px 2px 4px rgba(255, 255, 255, 0.1)",
                    "&:hover": {
                      backgroundColor: "#4f46e5",
                      boxShadow: "4px 4px 8px rgba(0, 0, 0, 0.4), inset 2px 2px 4px rgba(255, 255, 255, 0.15)",
                      transform: "translateY(-1px)",
                    },
                    transition: "all 0.2s ease",
                  }}
                >
                  Convert
                </Button>
              </Box>
            )}

            {/* ── Step 2: Map cell refs to variable names ── */}
            {converterStep === "mapping" && convertResult && (
              <Box>
                <Typography variant="body2" sx={{ color: "#f1f5f9", mb: 0.5, fontWeight: 600 }}>
                  Map cell references to variable names
                </Typography>
                <Typography variant="caption" sx={{ color: "#94a3b8", display: "block", mb: 2 }}>
                  Each cell reference found in your formula needs to be replaced with an EMS variable (e.g. <code style={{ color: "#10b981" }}>basic</code>, <code style={{ color: "#10b981" }}>da</code>, <code style={{ color: "#10b981" }}>paid_days</code>). Leave blank to keep as-is.
                  {convertResult.result.includes("__RANGE_SUM__") && (
                    <span style={{ color: "#f59e0b", display: "block", marginTop: 4 }}>
                      ⚠ SUM range detected — map the start and end cell refs to variable names. All ctx variables between them (inclusive, by template order) will be summed.
                    </span>
                  )}
                </Typography>

                {/* Show partially converted formula for reference */}
                <Paper sx={{ p: 1.5, mb: 2, background: "rgba(255, 255, 255, 0.02)", border: "1px solid rgba(255, 255, 255, 0.08)", borderRadius: "10px" }}>
                  <Typography variant="caption" sx={{ color: "#94a3b8", display: "block", mb: 0.5 }}>Converted so far (cell refs still need replacing):</Typography>
                  <Typography sx={{ fontFamily: "monospace", fontSize: 11, color: "#cbd5e1", wordBreak: "break-all" }}>
                    {convertResult.result}
                  </Typography>
                </Paper>

                {Object.keys(cellMappings).map((ref) => (
                  <Box key={ref} sx={{ display: "flex", alignItems: "center", gap: 1.5, mb: 1.5 }}>
                    <Paper sx={{ px: 1.5, py: 0.75, backgroundColor: "rgba(245, 158, 11, 0.12)", border: "1px solid rgba(245, 158, 11, 0.25)", borderRadius: "8px", minWidth: 56, textAlign: "center" }}>
                      <Typography sx={{ fontFamily: "monospace", fontSize: 13, color: "#f59e0b", fontWeight: 700 }}>
                        {ref}
                      </Typography>
                    </Paper>
                    <Typography sx={{ color: "#94a3b8", fontSize: 18 }}>→</Typography>
                    <TextField
                      size="small"
                      label={`Replace ${ref} with`}
                      value={cellMappings[ref]}
                      onChange={(e) => setCellMappings((prev) => ({ ...prev, [ref]: e.target.value }))}
                      placeholder="e.g. basic"
                      sx={{
                        flex: 1,
                        "& input": { fontFamily: "monospace", fontSize: 12, color: "#f1f5f9" },
                        "& .MuiOutlinedInput-root": {
                          backgroundColor: "rgba(255, 255, 255, 0.03)",
                          borderRadius: "8px",
                          "& fieldset": { borderColor: "rgba(255, 255, 255, 0.1)" },
                          "&:hover fieldset": { borderColor: "rgba(99, 102, 241, 0.3)" },
                          "&.Mui-focused fieldset": { borderColor: "#6366f1" },
                        },
                      }}
                      select={allKeysForConverter.length > 0}
                      SelectProps={allKeysForConverter.length > 0 ? { displayEmpty: true } : undefined}
                    >
                      {allKeysForConverter.length > 0 && [
                        <MenuItem key="" value=""><em style={{ color: "#94a3b8" }}>— pick a variable —</em></MenuItem>,
                        ...[...new Set(allKeysForConverter)].map((k) => (
                          <MenuItem key={k} value={k} sx={{ fontFamily: "monospace", fontSize: 12 }}>{k}</MenuItem>
                        )),
                      ]}
                    </TextField>
                  </Box>
                ))}

                {convertResult.warnings.filter(w => !w.startsWith("Cell ref")).length > 0 && (
                  <Alert
                    severity="warning"
                    sx={{
                      mb: 1,
                      fontSize: 11,
                      borderRadius: "10px",
                      background: "rgba(245, 158, 11, 0.12)",
                      border: "1px solid rgba(245, 158, 11, 0.25)",
                      color: "#fde68a",
                    }}
                  >
                    {convertResult.warnings.filter(w => !w.startsWith("Cell ref")).map((w, i) => <div key={i}>⚠ {w}</div>)}
                  </Alert>
                )}

                <Box sx={{ display: "flex", gap: 1, mt: 1 }}>
                  <Button
                    size="small"
                    onClick={() => setConverterStep("input")}
                    sx={{ color: "#94a3b8", textTransform: "none" }}
                  >
                    ← Back
                  </Button>
                  <Button
                    size="small"
                    variant="contained"
                    onClick={() => setConverterStep("done")}
                    sx={{
                      backgroundColor: "#10b981",
                      color: "#f1f5f9",
                      borderRadius: "10px",
                      fontWeight: 600,
                      textTransform: "none",
                      boxShadow: "6px 6px 12px rgba(0, 0, 0, 0.35), inset 2px 2px 4px rgba(255, 255, 255, 0.1)",
                      "&:hover": {
                        backgroundColor: "#059669",
                        boxShadow: "4px 4px 8px rgba(0, 0, 0, 0.4), inset 2px 2px 4px rgba(255, 255, 255, 0.15)",
                        transform: "translateY(-1px)",
                      },
                      transition: "all 0.2s ease",
                    }}
                  >
                    Apply Mappings →
                  </Button>
                </Box>
              </Box>
            )}

            {/* ── Step 3: Final result ── */}
            {converterStep === "done" && convertResult && (() => {
              const finalFormula = applyCellMappings(convertResult.result, cellMappings, allKeysForConverter);
              return (
                <Box>
                  <Typography variant="body2" sx={{ color: "#f1f5f9", mb: 1, fontWeight: 600 }}>
                    ✓ Converted formula ready
                  </Typography>
                  <Paper sx={{ p: 1.5, background: "rgba(16, 185, 129, 0.08)", border: "1px solid rgba(16, 185, 129, 0.3)", borderRadius: "10px", mb: 1.5 }}>
                    <Typography variant="caption" sx={{ color: "#94a3b8", display: "block", mb: 0.5 }}>Final formula:</Typography>
                    <Typography sx={{ fontFamily: "monospace", fontSize: 13, color: "#34d399", wordBreak: "break-all" }}>
                      {finalFormula}
                    </Typography>
                  </Paper>
                  {convertResult.warnings.length > 0 && (
                    <Alert
                      severity="warning"
                      sx={{
                        mb: 1.5,
                        fontSize: 11,
                        borderRadius: "10px",
                        background: "rgba(245, 158, 11, 0.12)",
                        border: "1px solid rgba(245, 158, 11, 0.25)",
                        color: "#fde68a",
                      }}
                    >
                      {convertResult.warnings.map((w, i) => <div key={i}>⚠ {w}</div>)}
                    </Alert>
                  )}
                  <Box sx={{ display: "flex", gap: 1 }}>
                    <Button
                      size="small"
                      onClick={() => setConverterStep(convertResult.cellRefs.length > 0 ? "mapping" : "input")}
                      sx={{ color: "#94a3b8", textTransform: "none" }}
                    >
                      ← Back
                    </Button>
                    <Button
                      size="small"
                      variant="contained"
                      startIcon={<ContentCopy sx={{ fontSize: 14 }} />}
                      onClick={() => {
                        setExpr(finalFormula);
                        setMode("simple");
                        setExcelInput("");
                        setConvertResult(null);
                        setCellMappings({});
                        setConverterStep("input");
                      }}
                      sx={{
                        backgroundColor: "#10b981",
                        color: "#f1f5f9",
                        borderRadius: "10px",
                        fontWeight: 600,
                        textTransform: "none",
                        boxShadow: "6px 6px 12px rgba(0, 0, 0, 0.35), inset 2px 2px 4px rgba(255, 255, 255, 0.1)",
                        "&:hover": {
                          backgroundColor: "#059669",
                          boxShadow: "4px 4px 8px rgba(0, 0, 0, 0.4), inset 2px 2px 4px rgba(255, 255, 255, 0.15)",
                          transform: "translateY(-1px)",
                        },
                        transition: "all 0.2s ease",
                      }}
                    >
                      Use this formula
                    </Button>
                    <Button
                      size="small"
                      variant="outlined"
                      onClick={() => {
                        setExcelInput("");
                        setConvertResult(null);
                        setCellMappings({});
                        setConverterStep("input");
                      }}
                      sx={{
                        borderColor: "rgba(255, 255, 255, 0.15)",
                        color: "#94a3b8",
                        borderRadius: "10px",
                        textTransform: "none",
                        "&:hover": {
                          borderColor: "rgba(255, 255, 255, 0.3)",
                          backgroundColor: "rgba(255, 255, 255, 0.04)",
                        },
                      }}
                    >
                      Start over
                    </Button>
                  </Box>
                </Box>
              );
            })()}

          </AccordionDetails>
        </Accordion>

        {/* Raw expression (always visible, editable) */}
        <TextField
          label="Formula Expression (raw)"
          value={expr}
          onChange={(e) => { setExpr(e.target.value); setMode("simple"); }}
          fullWidth
          multiline
          rows={3}
          inputRef={textareaRef}
          sx={{
            mb: 2,
            "& textarea": { fontFamily: "monospace", fontSize: 13, color: "#f1f5f9" },
            "& .MuiInputLabel-root": { color: "#94a3b8", "&.Mui-focused": { color: "#6366f1" } },
            "& .MuiOutlinedInput-root": {
              backgroundColor: "rgba(255, 255, 255, 0.03)",
              backdropFilter: "blur(10px)",
              borderRadius: "12px",
              color: "#f1f5f9",
              "& fieldset": { borderColor: "rgba(255, 255, 255, 0.1)" },
              "&:hover fieldset": { borderColor: "rgba(99, 102, 241, 0.3)" },
              "&.Mui-focused fieldset": { borderColor: "#6366f1", boxShadow: "0 0 0 3px rgba(99, 102, 241, 0.15)" },
            },
            "& .MuiFormHelperText-root": { color: "#94a3b8" },
          }}
          placeholder={`e.g.  if(basic > 10000, basic * 0.05, 0)\n      name + " - " + basic\n      if(employee_type == "labor", basic * 0.1, basic * 0.05)`}
          helperText='Syntax: if(cond, true_val, false_val) — nestable. Use + for string concat: name + basic'
        />

        <TextField
          label="Description (optional)"
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
          fullWidth
          placeholder="e.g. 5% HRA only for employees with basic > 10,000"
          size="small"
          sx={{
            "& .MuiInputLabel-root": { color: "#94a3b8", "&.Mui-focused": { color: "#6366f1" } },
            "& .MuiOutlinedInput-root": {
              backgroundColor: "rgba(255, 255, 255, 0.03)",
              borderRadius: "12px",
              color: "#f1f5f9",
              "& fieldset": { borderColor: "rgba(255, 255, 255, 0.1)" },
              "&:hover fieldset": { borderColor: "rgba(99, 102, 241, 0.3)" },
              "&.Mui-focused fieldset": { borderColor: "#6366f1", boxShadow: "0 0 0 3px rgba(99, 102, 241, 0.15)" },
            },
          }}
        />

        {/* Quick reference */}
        <Accordion
          sx={{
            mt: 2,
            background: "rgba(255, 255, 255, 0.03)",
            backdropFilter: "blur(20px)",
            border: "1px solid rgba(255, 255, 255, 0.08)",
            borderRadius: "14px !important",
            overflow: "hidden",
            "&:before": { display: "none" },
            transition: "all 0.3s ease",
            "&.Mui-expanded": {
              borderColor: "rgba(255, 255, 255, 0.15)",
            },
          }}
        >
          <AccordionSummary expandIcon={<ExpandMore sx={{ color: "#94a3b8" }} />}>
            <Typography variant="caption" sx={{ color: "#94a3b8", fontWeight: 500 }}>Formula syntax reference</Typography>
          </AccordionSummary>
          <AccordionDetails sx={{ pt: 0, px: 2, pb: 2 }}>
            <TableContainer
              sx={{
                background: "rgba(255, 255, 255, 0.02)",
                border: "1px solid rgba(255, 255, 255, 0.06)",
                borderRadius: "10px",
                overflow: "hidden",
              }}
            >
              <Table size="small">
                <TableHead
                  sx={{
                    "& .MuiTableCell-root": {
                      backgroundColor: "rgba(255, 255, 255, 0.04)",
                      color: "#94a3b8",
                      fontWeight: 600,
                      fontSize: 11,
                      borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
                    },
                  }}
                >
                  <TableRow>
                    <TableCell>Example</TableCell>
                    <TableCell>Meaning</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {[
                    ["basic * 0.05", "5% of basic salary (number)"],
                    ["if(basic > 10000, basic * 0.05, 0)", "5% HRA only if basic > 10,000"],
                    ['if(employee_type == "labor", basic * 0.1, basic * 0.05)', "10% for labor, 5% for others"],
                    ["if(paid_days >= 26, 500, 0)", "Attendance bonus if paid days ≥ 26"],
                    ["if(basic > 15000, if(paid_days == 30, 1000, 500), 0)", "Nested: bonus only for high earners"],
                    ["(basic + da) / total_days * paid_days", "Prorated amount"],
                    ["name + basic", 'String concat → "Hariom15000"'],
                    ['name + " - " + basic', 'String concat with separator → "Hariom - 15000"'],
                    ['employee_id + " (" + name + ")"', 'e.g. "EMP001 (Hariom)"'],
                    ['if(basic > 10000, name + " eligible", name + " not eligible")', "Conditional string result"],
                  ].map(([ex, meaning]) => (
                    <TableRow
                      key={ex}
                      sx={{
                        "&:hover": { backgroundColor: "rgba(255, 255, 255, 0.03)" },
                        "& .MuiTableCell-root": { borderBottom: "1px solid rgba(255, 255, 255, 0.04)" },
                      }}
                    >
                      <TableCell
                        sx={{ fontFamily: "monospace", fontSize: 11, color: "#10b981", cursor: "pointer" }}
                        onClick={() => setExpr(ex as string)}
                      >
                        {ex}
                      </TableCell>
                      <TableCell sx={{ fontSize: 11, color: "#94a3b8" }}>{meaning}</TableCell>
                    </TableRow>
                  ))}
                  {/* Attendance deduction examples */}
                  <TableRow>
                    <TableCell
                      colSpan={2}
                      sx={{ fontSize: 11, color: "#a5b4fc", fontWeight: 700, pt: 1.5, pb: 0.5, borderTop: "1px solid rgba(255, 255, 255, 0.08)" }}
                    >
                      Attendance deduction examples
                    </TableCell>
                  </TableRow>
                  {[
                    ["absent_days * (basic / total_days)", "Deduct one day's pay per absent day"],
                    ["if(absent_days > 3, absent_days * (basic / total_days), 0)", "Deduct only when absent more than 3 days"],
                  ].map(([ex, meaning]) => (
                    <TableRow
                      key={ex}
                      sx={{
                        "&:hover": { backgroundColor: "rgba(255, 255, 255, 0.03)" },
                        "& .MuiTableCell-root": { borderBottom: "1px solid rgba(255, 255, 255, 0.04)" },
                      }}
                    >
                      <TableCell
                        sx={{ fontFamily: "monospace", fontSize: 11, color: "#10b981", cursor: "pointer" }}
                        onClick={() => setExpr(ex as string)}
                      >
                        {ex}
                      </TableCell>
                      <TableCell sx={{ fontSize: 11, color: "#94a3b8" }}>{meaning}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </AccordionDetails>
        </Accordion>
      </DialogContent>

      <DialogActions sx={{ borderTop: "1px solid rgba(255, 255, 255, 0.08)", px: 3, py: 2 }}>
        <Button onClick={onClose} sx={{ color: "#94a3b8", textTransform: "none", fontWeight: 500 }}>
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={handleSave}
          startIcon={<Save />}
          sx={{
            backgroundColor: "#10b981",
            color: "#f1f5f9",
            borderRadius: "12px",
            fontWeight: 600,
            textTransform: "none",
            boxShadow: "6px 6px 12px rgba(0, 0, 0, 0.35), inset 2px 2px 4px rgba(255, 255, 255, 0.1)",
            "&:hover": {
              backgroundColor: "#059669",
              boxShadow: "4px 4px 8px rgba(0, 0, 0, 0.4), inset 2px 2px 4px rgba(255, 255, 255, 0.15)",
              transform: "translateY(-1px)",
            },
            "&:active": {
              boxShadow: "2px 2px 4px rgba(0, 0, 0, 0.3), inset 3px 3px 6px rgba(0, 0, 0, 0.2)",
              transform: "translateY(0)",
            },
            transition: "all 0.2s ease",
          }}
        >
          Save Formula
        </Button>
      </DialogActions>
    </Dialog>
  );
}

// ─── Column row ───────────────────────────────────────────────────────────────

interface ColumnRowProps {
  column: TemplateColumn;
  availableKeys: string[]; // keys declared before this column
  allTemplateKeys: string[]; // ALL keys in template — for converter mapping dropdown
  onUpdate: (col: TemplateColumn) => void;
  onDelete: (id: string) => void;
}

function ColumnRow({ column, availableKeys, allTemplateKeys, onUpdate, onDelete }: ColumnRowProps) {
  const [formulaOpen, setFormulaOpen] = useState(false);

  return (
    <>
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 1,
          py: 0.75,
          px: 1,
          borderRadius: "10px",
          transition: "all 0.2s ease",
          "&:hover": { backgroundColor: "rgba(255, 255, 255, 0.04)" },
        }}
      >
        <DragIndicator sx={{ color: "#94a3b8", fontSize: 18 }} />

        <TextField
          size="small"
          value={column.label}
          disabled={column.isFixed}
          onChange={(e) =>
            onUpdate({ ...column, label: e.target.value, key: normalize(e.target.value) })
          }
          sx={{
            flex: 1,
            "& .MuiInputBase-input": { fontSize: 13, color: "#f1f5f9" },
            "& .MuiOutlinedInput-root": {
              backgroundColor: "rgba(255, 255, 255, 0.02)",
              borderRadius: "8px",
              "& fieldset": { borderColor: "rgba(255, 255, 255, 0.08)" },
              "&:hover fieldset": { borderColor: "rgba(99, 102, 241, 0.3)" },
              "&.Mui-focused fieldset": { borderColor: "#6366f1" },
            },
          }}
          placeholder="Column label"
        />

        <Typography
          variant="caption"
          sx={{ fontFamily: "monospace", color: "#94a3b8", minWidth: 100, fontSize: 11 }}
        >
          key: {column.key}
        </Typography>

        {column.formula ? (
          <Chip
            label={column.formula.expression.slice(0, 20) + (column.formula.expression.length > 20 ? "…" : "")}
            size="small"
            onClick={() => !column.isFixed && setFormulaOpen(true)}
            sx={{
              fontFamily: "monospace",
              fontSize: 10,
              maxWidth: 140,
              backgroundColor: "rgba(99, 102, 241, 0.15)",
              color: "#a5b4fc",
              border: "1px solid rgba(99, 102, 241, 0.25)",
              cursor: column.isFixed ? "default" : "pointer",
            }}
          />
        ) : (
          <Chip
            label="no formula"
            size="small"
            variant="outlined"
            sx={{ fontSize: 10, color: "#94a3b8", borderColor: "rgba(255, 255, 255, 0.1)" }}
          />
        )}

        {/* Set formula button */}
        <Tooltip title="Set formula">
          <span>
            <IconButton
              size="small"
              disabled={column.isFixed}
              onClick={() => setFormulaOpen(true)}
              sx={{
                color: "#6366f1",
                backgroundColor: "rgba(99, 102, 241, 0.1)",
                borderRadius: "8px",
                "&:hover": { backgroundColor: "rgba(99, 102, 241, 0.2)" },
                "&.Mui-disabled": { color: "rgba(255, 255, 255, 0.2)" },
              }}
            >
              <Functions fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>

        {column.isFixed ? (
          <Tooltip title="Fixed column — cannot be deleted">
            <Lock sx={{ fontSize: 16, color: "#94a3b8", mx: 0.5 }} />
          </Tooltip>
        ) : (
          <Tooltip title="Delete column">
            <IconButton
              size="small"
              onClick={() => onDelete(column.id)}
              sx={{
                color: "#ef4444",
                borderRadius: "8px",
                "&:hover": { backgroundColor: "rgba(239, 68, 68, 0.1)" },
              }}
            >
              <Delete fontSize="small" />
            </IconButton>
          </Tooltip>
        )}
      </Box>

      <FormulaDialog
        open={formulaOpen}
        column={column}
        allKeys={availableKeys}
        allKeysForConverter={allTemplateKeys}
        onSave={(updated) => onUpdate(updated)}
        onClose={() => setFormulaOpen(false)}
      />
    </>
  );
}

// ─── Section card ─────────────────────────────────────────────────────────────

interface SectionCardProps {
  section: TemplateSection;
  getAvailableKeys: (sectionId: string, colId: string) => string[];
  allTemplateKeys: string[];
  onUpdate: (sec: TemplateSection) => void;
  onDelete: (id: string) => void;
}

function SectionCard({ section, getAvailableKeys, allTemplateKeys, onUpdate, onDelete }: SectionCardProps) {
  const addColumn = () => {
    const label = `Column ${section.columns.length + 1}`;
    const newCol: TemplateColumn = {
      id: uid(),
      label,
      key: normalize(label),
      order: section.columns.length,
    };
    onUpdate({ ...section, columns: [...section.columns, newCol] });
  };

  const updateColumn = (col: TemplateColumn) => {
    onUpdate({
      ...section,
      columns: section.columns.map((c) => (c.id === col.id ? col : c)),
    });
  };

  const deleteColumn = (colId: string) => {
    onUpdate({ ...section, columns: section.columns.filter((c) => c.id !== colId) });
  };

  return (
    <Accordion
      defaultExpanded
      sx={{
        background: "rgba(255, 255, 255, 0.03)",
        backdropFilter: "blur(20px)",
        border: "1px solid rgba(255, 255, 255, 0.08)",
        borderRadius: "16px !important",
        mb: 2,
        overflow: "hidden",
        boxShadow: "0 8px 32px rgba(0, 0, 0, 0.2)",
        transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
        "&:before": { display: "none" },
        "&.Mui-expanded": {
          borderColor: "rgba(99, 102, 241, 0.3)",
          boxShadow: "0 12px 36px rgba(0, 0, 0, 0.3)",
        },
      }}
    >
      <AccordionSummary expandIcon={<ExpandMore sx={{ color: "#94a3b8" }} />}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1, flex: 1 }}>
          {section.isFixed ? (
            <Lock sx={{ fontSize: 16, color: "#94a3b8" }} />
          ) : (
            <DragIndicator sx={{ fontSize: 16, color: "#94a3b8" }} />
          )}
          {section.isFixed ? (
            <Typography sx={{ color: "#f1f5f9", fontWeight: 600 }}>{section.label}</Typography>
          ) : (
            <TextField
              size="small"
              value={section.label}
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => onUpdate({ ...section, label: e.target.value })}
              sx={{
                "& .MuiInputBase-input": { fontSize: 14, fontWeight: 600, color: "#f1f5f9" },
                "& .MuiOutlinedInput-root": {
                  backgroundColor: "rgba(255, 255, 255, 0.02)",
                  borderRadius: "8px",
                  "& fieldset": { borderColor: "rgba(255, 255, 255, 0.08)" },
                  "&:hover fieldset": { borderColor: "rgba(99, 102, 241, 0.3)" },
                  "&.Mui-focused fieldset": { borderColor: "#6366f1" },
                },
              }}
            />
          )}
          <Chip
            label={`${section.columns.length} columns`}
            size="small"
            sx={{
              ml: 1,
              fontSize: 10,
              backgroundColor: "rgba(255, 255, 255, 0.04)",
              color: "#94a3b8",
              border: "1px solid rgba(255, 255, 255, 0.08)",
            }}
          />
          {section.isFixed && (
            <Chip
              label="fixed"
              size="small"
              sx={{
                fontSize: 10,
                backgroundColor: "rgba(99, 102, 241, 0.12)",
                color: "#a5b4fc",
                border: "1px solid rgba(99, 102, 241, 0.2)",
              }}
            />
          )}
        </Box>
        {!section.isFixed && (
          <Tooltip title="Delete section">
            <IconButton
              component="span"
              size="small"
              onClick={(e) => { e.stopPropagation(); onDelete(section.id); }}
              sx={{ color: "#ef4444", mr: 1, "&:hover": { backgroundColor: "rgba(239, 68, 68, 0.1)" } }}
            >
              <Delete fontSize="small" />
            </IconButton>
          </Tooltip>
        )}
      </AccordionSummary>

      <AccordionDetails sx={{ pt: 0, px: 2, pb: 2 }}>
        <Divider sx={{ mb: 1.5, borderColor: "rgba(255, 255, 255, 0.06)" }} />
        {section.columns.map((col) => (
          <ColumnRow
            key={col.id}
            column={col}
            availableKeys={getAvailableKeys(section.id, col.id)}
            allTemplateKeys={allTemplateKeys}
            onUpdate={updateColumn}
            onDelete={deleteColumn}
          />
        ))}
        <Button
          size="small"
          startIcon={<Add />}
          onClick={addColumn}
          sx={{
            mt: 1.5,
            color: "#10b981",
            textTransform: "none",
            fontWeight: 600,
            borderRadius: "8px",
            "&:hover": { backgroundColor: "rgba(16, 185, 129, 0.1)" },
          }}
        >
          Add Column
        </Button>
      </AccordionDetails>
    </Accordion>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function SalaryTemplateBuilder() {
  const { currentUser } = useAuth();

  const [templates, setTemplates] = useState<SalaryTemplate[]>([]);
  const [managers, setManagers] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [alert, setAlert] = useState<{ type: "success" | "error"; message: string } | null>(null);

  // Currently editing template (null = list view)
  const [editing, setEditing] = useState<SalaryTemplate | null>(null);
  const [isNew, setIsNew] = useState(false);

  // Dropdown menu anchor for New Template
  const [newTemplateAnchor, setNewTemplateAnchor] = useState<null | HTMLElement>(null);

  // Assign dialog
  const [assignOpen, setAssignOpen] = useState(false);
  const [assignTemplateId, setAssignTemplateId] = useState("");
  const [assignManagerId, setAssignManagerId] = useState("");
  const [assigning, setAssigning] = useState(false);

  // Delete confirm
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const companyId = currentUser?.uid ?? "";

  // ── Load ──────────────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    try {
      const [tmpl, mgrs] = await Promise.all([
        salaryTemplateService.getAll(companyId),
        getDocs(query(collection(db, "managers"), where("companyId", "==", companyId))),
      ]);
      setTemplates(
        tmpl.map((t) => ({
          ...t,
          sections: ensureFixedSections(stripRemovedFixedColumns(t.sections)),
        })),
      );
      setManagers(
        mgrs.docs.map((d) => ({
          id: d.id,
          name: d.data().fullName || d.data().name || d.data().email || "Unknown",
        }))
      );
    } catch (e) {
      console.error(e);
      setAlert({ type: "error", message: "Failed to load templates" });
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => { load(); }, [load]);

  // ── Derived: keys available up to a given section/column position ─────────
  const getAvailableKeys = useCallback(
    (sectionId: string, colId: string): string[] => {
      if (!editing) return [];
      const sorted = [...editing.sections].sort((a, b) => a.order - b.order);
      const keys: string[] = [];
      for (const sec of sorted) {
        if (sec.id === sectionId) {
          for (const col of sec.columns) {
            if (col.id === colId) break;
            keys.push(col.key);
          }
          break;
        }
        sec.columns.forEach((c) => keys.push(c.key));
      }
      return [...new Set(keys)];
    },
    [editing]
  );

  // All keys across entire template (for display/reference) — deduplicated
  const allKeys = editing
    ? [...new Set(editing.sections.flatMap((s) => s.columns.map((c) => c.key)))]
    : [];

  // ── Create new template ───────────────────────────────────────────────────

  const handleNew = (managerId: string | null = null) => {
    const draft = salaryTemplateService.buildDefault(
      companyId,
      managerId,
      managerId
        ? `${managers.find((m) => m.id === managerId)?.name ?? "Manager"} Template`
        : "Global Template",
      currentUser?.uid ?? ""
    );
    setEditing({ id: "", ...draft });
    setIsNew(true);
  };

  // ── Duplicate template ────────────────────────────────────────────────────

  const handleDuplicate = (tmpl: SalaryTemplate) => {
    setEditing({
      ...tmpl,
      id: "",
      name: `${tmpl.name} (Copy)`,
      managerId: null,
    });
    setIsNew(true);
  };

  // ── Save template ─────────────────────────────────────────────────────────

  const handleSave = async () => {
    if (!editing || !companyId) return;
    if (!editing.name.trim()) {
      setAlert({ type: "error", message: "Template name is required" });
      return;
    }
    setSaving(true);
    try {
      if (isNew) {
        const id = await salaryTemplateService.create(companyId, currentUser?.uid ?? "", {
          name: editing.name,
          description: editing.description,
          managerId: editing.managerId,
          sections: editing.sections,
        });
        setAlert({ type: "success", message: "Template created successfully" });
        await load();
        setEditing((prev) => prev ? { ...prev, id } : null);
        setIsNew(false);
      } else {
        await salaryTemplateService.update(editing.id, {
          name: editing.name,
          description: editing.description,
          managerId: editing.managerId,
          sections: editing.sections,
        });
        setAlert({ type: "success", message: "Template saved" });
        await load();
      }
    } catch (e) {
      console.error(e);
      setAlert({ type: "error", message: "Failed to save template" });
    } finally {
      setSaving(false);
    }
  };

  // ── Delete template ───────────────────────────────────────────────────────

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      await salaryTemplateService.delete(deleteId);
      setAlert({ type: "success", message: "Template deleted" });
      setDeleteId(null);
      if (editing?.id === deleteId) setEditing(null);
      await load();
    } catch (e) {
      setAlert({ type: "error", message: "Failed to delete template" });
    }
  };

  // ── Assign template to manager ────────────────────────────────────────────

  const handleAssign = async () => {
    if (!assignManagerId || !assignTemplateId) return;
    setAssigning(true);
    try {
      await salaryTemplateService.assignToManager(assignManagerId, assignTemplateId || null);
      setAlert({ type: "success", message: "Template assigned to manager" });
      setAssignOpen(false);
      setAssignManagerId("");
      setAssignTemplateId("");
    } catch (e) {
      setAlert({ type: "error", message: "Failed to assign template" });
    } finally {
      setAssigning(false);
    }
  };

  // ── Section helpers ───────────────────────────────────────────────────────

  const addSection = () => {
    if (!editing) return;
    const newSec: TemplateSection = {
      id: uid(),
      label: `New Section ${editing.sections.length}`,
      type: "custom",
      isFixed: false,
      order: editing.sections.length,
      columns: [],
    };
    setEditing({ ...editing, sections: [...editing.sections, newSec] });
  };

  const updateSection = (sec: TemplateSection) => {
    if (!editing) return;
    setEditing({
      ...editing,
      sections: editing.sections.map((s) => (s.id === sec.id ? sec : s)),
    });
  };

  const deleteSection = (secId: string) => {
    if (!editing) return;
    setEditing({
      ...editing,
      sections: editing.sections.filter((s) => s.id !== secId),
    });
  };

  // ── Render ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight={300}>
        <CircularProgress sx={{ color: "#6366f1" }} />
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3 }}>
      {alert && (
        <Alert
          severity={alert.type}
          onClose={() => setAlert(null)}
          sx={{
            mb: 2,
            borderRadius: "14px",
            backdropFilter: "blur(20px)",
            background: alert.type === "error" ? "rgba(239, 68, 68, 0.12)" : "rgba(16, 185, 129, 0.12)",
            border: `1px solid ${alert.type === "error" ? "rgba(239, 68, 68, 0.25)" : "rgba(16, 185, 129, 0.25)"}`,
            color: alert.type === "error" ? "#fca5a5" : "#6ee7b7",
            "& .MuiAlert-icon": { color: alert.type === "error" ? "#ef4444" : "#10b981" },
          }}
        >
          {alert.message}
        </Alert>
      )}

      {/* ── Editor view ── */}
      {editing ? (
        <Box>
          {/* Editor header */}
          <Box sx={{ display: "flex", alignItems: "center", gap: 2, mb: 3, flexWrap: "wrap" }}>
            <Button
              variant="outlined"
              size="small"
              onClick={() => setEditing(null)}
              sx={{
                color: "#94a3b8",
                borderColor: "rgba(255, 255, 255, 0.15)",
                borderRadius: "10px",
                textTransform: "none",
                fontWeight: 500,
                "&:hover": {
                  borderColor: "#6366f1",
                  color: "#f1f5f9",
                  backgroundColor: "rgba(99, 102, 241, 0.08)",
                },
              }}
            >
              ← Back
            </Button>
            <Typography variant="h5" sx={{ color: "#6366f1", fontWeight: 700, flex: 1, letterSpacing: "-0.01em" }}>
              {isNew ? "New Template" : "Edit Template"}
            </Typography>
            <Button
              variant="contained"
              startIcon={saving ? <CircularProgress size={16} sx={{ color: "#f1f5f9" }} /> : <Save />}
              onClick={handleSave}
              disabled={saving}
              sx={{
                backgroundColor: "#10b981",
                color: "#f1f5f9",
                borderRadius: "12px",
                fontWeight: 600,
                textTransform: "none",
                boxShadow: "6px 6px 12px rgba(0, 0, 0, 0.35), inset 2px 2px 4px rgba(255, 255, 255, 0.1)",
                "&:hover": {
                  backgroundColor: "#059669",
                  boxShadow: "4px 4px 8px rgba(0, 0, 0, 0.4), inset 2px 2px 4px rgba(255, 255, 255, 0.15)",
                  transform: "translateY(-1px)",
                },
                "&:active": {
                  boxShadow: "2px 2px 4px rgba(0, 0, 0, 0.3), inset 3px 3px 6px rgba(0, 0, 0, 0.2)",
                  transform: "translateY(0)",
                },
                transition: "all 0.2s ease",
              }}
            >
              Save Template
            </Button>
          </Box>

          {/* Template meta */}
          <Paper
            sx={{
              p: 2.5,
              mb: 3,
              background: "rgba(255, 255, 255, 0.03)",
              backdropFilter: "blur(20px)",
              border: "1px solid rgba(255, 255, 255, 0.08)",
              borderRadius: "16px",
              boxShadow: "0 8px 32px rgba(0, 0, 0, 0.25)",
            }}
          >
            <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap" }}>
              <TextField
                label="Template Name"
                value={editing.name}
                onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                sx={{
                  flex: 1,
                  minWidth: 220,
                  "& .MuiInputLabel-root": { color: "#94a3b8", "&.Mui-focused": { color: "#6366f1" } },
                  "& .MuiOutlinedInput-root": {
                    backgroundColor: "rgba(255, 255, 255, 0.03)",
                    backdropFilter: "blur(10px)",
                    borderRadius: "12px",
                    color: "#f1f5f9",
                    "& fieldset": { borderColor: "rgba(255, 255, 255, 0.1)" },
                    "&:hover fieldset": { borderColor: "rgba(99, 102, 241, 0.3)" },
                    "&.Mui-focused fieldset": { borderColor: "#6366f1", boxShadow: "0 0 0 3px rgba(99, 102, 241, 0.15)" },
                  },
                }}
                required
              />
              <TextField
                label="Description"
                value={editing.description ?? ""}
                onChange={(e) => setEditing({ ...editing, description: e.target.value })}
                sx={{
                  flex: 2,
                  minWidth: 280,
                  "& .MuiInputLabel-root": { color: "#94a3b8", "&.Mui-focused": { color: "#6366f1" } },
                  "& .MuiOutlinedInput-root": {
                    backgroundColor: "rgba(255, 255, 255, 0.03)",
                    backdropFilter: "blur(10px)",
                    borderRadius: "12px",
                    color: "#f1f5f9",
                    "& fieldset": { borderColor: "rgba(255, 255, 255, 0.1)" },
                    "&:hover fieldset": { borderColor: "rgba(99, 102, 241, 0.3)" },
                    "&.Mui-focused fieldset": { borderColor: "#6366f1", boxShadow: "0 0 0 3px rgba(99, 102, 241, 0.15)" },
                  },
                }}
              />
              <FormControl
                sx={{
                  minWidth: 220,
                  "& .MuiInputLabel-root": { color: "#94a3b8", "&.Mui-focused": { color: "#6366f1" } },
                  "& .MuiOutlinedInput-root": {
                    backgroundColor: "rgba(255, 255, 255, 0.03)",
                    backdropFilter: "blur(10px)",
                    borderRadius: "12px",
                    color: "#f1f5f9",
                    "& fieldset": { borderColor: "rgba(255, 255, 255, 0.1)" },
                    "&:hover fieldset": { borderColor: "rgba(99, 102, 241, 0.3)" },
                    "&.Mui-focused fieldset": { borderColor: "#6366f1", boxShadow: "0 0 0 3px rgba(99, 102, 241, 0.15)" },
                    "& .MuiSelect-icon": { color: "#94a3b8" },
                  },
                }}
              >
                <InputLabel>Assign to Manager</InputLabel>
                <Select
                  value={editing.managerId ?? ""}
                  label="Assign to Manager"
                  onChange={(e) =>
                    setEditing({ ...editing, managerId: e.target.value || null })
                  }
                >
                  <MenuItem value="">
                    <em>Global (all managers)</em>
                  </MenuItem>
                  {managers.map((m) => (
                    <MenuItem key={m.id} value={m.id}>
                      {m.name}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Box>
          </Paper>

          {/* Sections */}
          <Typography variant="subtitle1" sx={{ color: "#94a3b8", mb: 1.5, fontWeight: 500 }}>
            Sections — drag to reorder (coming soon), click to expand
          </Typography>

          {editing.sections
            .slice()
            .sort((a, b) => a.order - b.order)
            .map((sec) => (
              <SectionCard
                key={sec.id}
                section={sec}
                getAvailableKeys={getAvailableKeys}
                allTemplateKeys={allKeys}
                onUpdate={updateSection}
                onDelete={deleteSection}
              />
            ))}

          <Button
            variant="outlined"
            startIcon={<Add />}
            onClick={addSection}
            sx={{
              mt: 2,
              borderColor: "rgba(99, 102, 241, 0.4)",
              color: "#a5b4fc",
              borderRadius: "12px",
              textTransform: "none",
              fontWeight: 600,
              "&:hover": {
                borderColor: "#6366f1",
                backgroundColor: "rgba(99, 102, 241, 0.08)",
              },
            }}
          >
            Add Section
          </Button>
        </Box>
      ) : (
        /* ── List view ── */
        <Box>
          <Box sx={{ display: "flex", alignItems: "center", gap: 2, mb: 3, flexWrap: "wrap" }}>
            <Typography variant="h4" sx={{ color: "#6366f1", fontWeight: 700, flex: 1, letterSpacing: "-0.02em" }}>
              Salary Templates
            </Typography>
            <Button
              variant="outlined"
              startIcon={<Assignment />}
              onClick={() => setAssignOpen(true)}
              sx={{
                borderColor: "rgba(245, 158, 11, 0.4)",
                color: "#f59e0b",
                borderRadius: "12px",
                textTransform: "none",
                fontWeight: 600,
                "&:hover": {
                  borderColor: "#f59e0b",
                  backgroundColor: "rgba(245, 158, 11, 0.08)",
                },
              }}
            >
              Assign Template
            </Button>
            <Button
              variant="contained"
              startIcon={<Add />}
              endIcon={<KeyboardArrowDown />}
              onClick={(e) => setNewTemplateAnchor(e.currentTarget)}
              sx={{
                backgroundColor: "#6366f1",
                color: "#f1f5f9",
                borderRadius: "12px",
                fontWeight: 600,
                textTransform: "none",
                boxShadow: "6px 6px 12px rgba(0, 0, 0, 0.35), inset 2px 2px 4px rgba(255, 255, 255, 0.1)",
                "&:hover": {
                  backgroundColor: "#4f46e5",
                  boxShadow: "4px 4px 8px rgba(0, 0, 0, 0.4), inset 2px 2px 4px rgba(255, 255, 255, 0.15)",
                  transform: "translateY(-1px)",
                },
                "&:active": {
                  boxShadow: "2px 2px 4px rgba(0, 0, 0, 0.3), inset 3px 3px 6px rgba(0, 0, 0, 0.2)",
                  transform: "translateY(0)",
                },
                transition: "all 0.2s ease",
              }}
            >
              New Template
            </Button>
            <Menu
              anchorEl={newTemplateAnchor}
              open={Boolean(newTemplateAnchor)}
              onClose={() => setNewTemplateAnchor(null)}
              PaperProps={{
                sx: {
                  background: "rgba(15, 23, 42, 0.95)",
                  backdropFilter: "blur(20px)",
                  border: "1px solid rgba(255, 255, 255, 0.1)",
                  borderRadius: "12px",
                  boxShadow: "0 8px 32px rgba(0, 0, 0, 0.4)",
                },
              }}
            >
              <MenuItem
                onClick={() => {
                  handleNew(null);
                  setNewTemplateAnchor(null);
                }}
                sx={{
                  color: "#f1f5f9",
                  "&:hover": { backgroundColor: "rgba(99, 102, 241, 0.15)" },
                }}
              >
                <ListItemIcon sx={{ color: "#6366f1" }}>
                  <Add fontSize="small" />
                </ListItemIcon>
                New Global Template
              </MenuItem>
              <MenuItem
                onClick={() => {
                  setAssignOpen(true);
                  setNewTemplateAnchor(null);
                }}
                sx={{
                  color: "#f1f5f9",
                  "&:hover": { backgroundColor: "rgba(139, 92, 246, 0.15)" },
                }}
              >
                <ListItemIcon sx={{ color: "#8b5cf6" }}>
                  <Assignment fontSize="small" />
                </ListItemIcon>
                New Manager Template
              </MenuItem>
            </Menu>
          </Box>

          {templates.length === 0 ? (
            <Paper
              sx={{
                p: 5,
                textAlign: "center",
                background: "rgba(255, 255, 255, 0.03)",
                backdropFilter: "blur(20px)",
                border: "1px solid rgba(255, 255, 255, 0.08)",
                borderRadius: "16px",
                boxShadow: "0 8px 32px rgba(0, 0, 0, 0.25)",
              }}
            >
              <Typography sx={{ color: "#94a3b8", mb: 2 }}>
                No templates yet. Create a global template or one per manager.
              </Typography>
              <Button
                variant="contained"
                startIcon={<Add />}
                onClick={() => handleNew(null)}
                sx={{
                  backgroundColor: "#6366f1",
                  color: "#f1f5f9",
                  borderRadius: "12px",
                  fontWeight: 600,
                  textTransform: "none",
                  boxShadow: "6px 6px 12px rgba(0, 0, 0, 0.35), inset 2px 2px 4px rgba(255, 255, 255, 0.1)",
                  "&:hover": {
                    backgroundColor: "#4f46e5",
                    boxShadow: "4px 4px 8px rgba(0, 0, 0, 0.4), inset 2px 2px 4px rgba(255, 255, 255, 0.15)",
                    transform: "translateY(-1px)",
                  },
                  transition: "all 0.2s ease",
                }}
              >
                Create Default Template
              </Button>
            </Paper>
          ) : (
            <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
              {templates.map((tmpl) => {
                const managerName = tmpl.managerId
                  ? managers.find((m) => m.id === tmpl.managerId)?.name ?? tmpl.managerId
                  : null;
                return (
                  <Paper
                    key={tmpl.id}
                    sx={{
                      p: 2.5,
                      background: "rgba(255, 255, 255, 0.03)",
                      backdropFilter: "blur(20px)",
                      border: "1px solid rgba(255, 255, 255, 0.08)",
                      borderRadius: "16px",
                      boxShadow: "0 8px 32px rgba(0, 0, 0, 0.25)",
                      display: "flex",
                      alignItems: "center",
                      gap: 2,
                      flexWrap: "wrap",
                      transition: "all 0.3s ease",
                      "&:hover": {
                        borderColor: "rgba(99, 102, 241, 0.3)",
                        boxShadow: "0 12px 40px rgba(0, 0, 0, 0.35)",
                        transform: "translateY(-2px)",
                      },
                    }}
                  >
                    <Box sx={{ flex: 1 }}>
                      <Typography variant="subtitle1" sx={{ color: "#f1f5f9", fontWeight: 600 }}>
                        {tmpl.name}
                      </Typography>
                      {tmpl.description && (
                        <Typography variant="body2" sx={{ color: "#94a3b8", mt: 0.5 }}>
                          {tmpl.description}
                        </Typography>
                      )}
                      <Box sx={{ display: "flex", gap: 1, mt: 1, flexWrap: "wrap" }}>
                        <Chip
                          label={managerName ? `Manager: ${managerName}` : "Global"}
                          size="small"
                          sx={{
                            backgroundColor: managerName
                              ? "rgba(139, 92, 246, 0.15)"
                              : "rgba(99, 102, 241, 0.15)",
                            color: managerName ? "#c4b5fd" : "#a5b4fc",
                            border: `1px solid ${
                              managerName
                                ? "rgba(139, 92, 246, 0.25)"
                                : "rgba(99, 102, 241, 0.25)"
                            }`,
                            fontWeight: 500,
                          }}
                        />
                        <Chip
                          label={`${tmpl.sections.length} sections`}
                          size="small"
                          variant="outlined"
                          sx={{
                            color: "#94a3b8",
                            borderColor: "rgba(255, 255, 255, 0.1)",
                          }}
                        />
                        <Chip
                          label={`${tmpl.sections.reduce((a, s) => a + s.columns.length, 0)} columns`}
                          size="small"
                          variant="outlined"
                          sx={{
                            color: "#94a3b8",
                            borderColor: "rgba(255, 255, 255, 0.1)",
                          }}
                        />
                      </Box>
                    </Box>

                    <Box sx={{ display: "flex", gap: 1 }}>
                      <Tooltip title="Edit template">
                        <IconButton
                          onClick={() => { setEditing(tmpl); setIsNew(false); }}
                          sx={{
                            color: "#6366f1",
                            backgroundColor: "rgba(99, 102, 241, 0.1)",
                            borderRadius: "8px",
                            "&:hover": {
                              backgroundColor: "rgba(99, 102, 241, 0.2)",
                              transform: "scale(1.05)",
                            },
                          }}
                        >
                          <Edit fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Duplicate">
                        <IconButton
                          onClick={() => handleDuplicate(tmpl)}
                          sx={{
                            color: "#f59e0b",
                            backgroundColor: "rgba(245, 158, 11, 0.1)",
                            borderRadius: "8px",
                            "&:hover": {
                              backgroundColor: "rgba(245, 158, 11, 0.2)",
                              transform: "scale(1.05)",
                            },
                          }}
                        >
                          <ContentCopy fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Delete">
                        <IconButton
                          onClick={() => setDeleteId(tmpl.id)}
                          sx={{
                            color: "#ef4444",
                            backgroundColor: "rgba(239, 68, 68, 0.1)",
                            borderRadius: "8px",
                            "&:hover": {
                              backgroundColor: "rgba(239, 68, 68, 0.2)",
                              transform: "scale(1.05)",
                            },
                          }}
                        >
                          <Delete fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </Box>
                  </Paper>
                );
              })}
            </Box>
          )}
        </Box>
      )}

      {/* ── Assign dialog ── */}
      <Dialog
        open={assignOpen}
        onClose={() => setAssignOpen(false)}
        maxWidth="sm"
        fullWidth
        PaperProps={{
          sx: {
            background: "rgba(15, 23, 42, 0.95)",
            backdropFilter: "blur(30px)",
            border: "1px solid rgba(255, 255, 255, 0.1)",
            borderRadius: "20px",
            boxShadow: "0 25px 60px rgba(0, 0, 0, 0.5)",
          },
        }}
      >
        <DialogTitle sx={{ color: "#f1f5f9", fontWeight: 600, borderBottom: "1px solid rgba(255, 255, 255, 0.08)", pb: 2 }}>
          Assign Template to Manager
        </DialogTitle>
        <DialogContent sx={{ p: 3, pt: "20px !important" }}>
          <Box sx={{ display: "flex", flexDirection: "column", gap: 2.5 }}>
            <FormControl
              fullWidth
              sx={{
                "& .MuiInputLabel-root": { color: "#94a3b8", "&.Mui-focused": { color: "#6366f1" } },
                "& .MuiOutlinedInput-root": {
                  backgroundColor: "rgba(255, 255, 255, 0.03)",
                  backdropFilter: "blur(10px)",
                  borderRadius: "12px",
                  color: "#f1f5f9",
                  "& fieldset": { borderColor: "rgba(255, 255, 255, 0.1)" },
                  "&:hover fieldset": { borderColor: "rgba(99, 102, 241, 0.3)" },
                  "&.Mui-focused fieldset": { borderColor: "#6366f1", boxShadow: "0 0 0 3px rgba(99, 102, 241, 0.15)" },
                  "& .MuiSelect-icon": { color: "#94a3b8" },
                },
              }}
            >
              <InputLabel>Manager</InputLabel>
              <Select
                value={assignManagerId}
                label="Manager"
                onChange={(e) => setAssignManagerId(e.target.value)}
              >
                {managers.map((m) => (
                  <MenuItem key={m.id} value={m.id}>
                    {m.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <FormControl
              fullWidth
              sx={{
                "& .MuiInputLabel-root": { color: "#94a3b8", "&.Mui-focused": { color: "#6366f1" } },
                "& .MuiOutlinedInput-root": {
                  backgroundColor: "rgba(255, 255, 255, 0.03)",
                  backdropFilter: "blur(10px)",
                  borderRadius: "12px",
                  color: "#f1f5f9",
                  "& fieldset": { borderColor: "rgba(255, 255, 255, 0.1)" },
                  "&:hover fieldset": { borderColor: "rgba(99, 102, 241, 0.3)" },
                  "&.Mui-focused fieldset": { borderColor: "#6366f1", boxShadow: "0 0 0 3px rgba(99, 102, 241, 0.15)" },
                  "& .MuiSelect-icon": { color: "#94a3b8" },
                },
              }}
            >
              <InputLabel>Template</InputLabel>
              <Select
                value={assignTemplateId}
                label="Template"
                onChange={(e) => setAssignTemplateId(e.target.value)}
              >
                <MenuItem value="">
                  <em>None (remove assignment)</em>
                </MenuItem>
                {templates.map((t) => (
                  <MenuItem key={t.id} value={t.id}>
                    {t.name} {t.managerId ? `(${managers.find((m) => m.id === t.managerId)?.name ?? "manager-specific"})` : "(global)"}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <Typography variant="body2" sx={{ color: "#94a3b8" }}>
              Assigning a template will use its section/column structure when generating salary slips for employees under this manager.
            </Typography>
          </Box>
        </DialogContent>
        <DialogActions sx={{ borderTop: "1px solid rgba(255, 255, 255, 0.08)", px: 3, py: 2 }}>
          <Button onClick={() => setAssignOpen(false)} sx={{ color: "#94a3b8", textTransform: "none", fontWeight: 500 }}>
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={handleAssign}
            disabled={assigning || !assignManagerId}
            startIcon={assigning ? <CircularProgress size={16} sx={{ color: "#f1f5f9" }} /> : <Assignment />}
            sx={{
              backgroundColor: "#6366f1",
              color: "#f1f5f9",
              borderRadius: "12px",
              fontWeight: 600,
              textTransform: "none",
              boxShadow: "6px 6px 12px rgba(0, 0, 0, 0.35), inset 2px 2px 4px rgba(255, 255, 255, 0.1)",
              "&:hover": {
                backgroundColor: "#4f46e5",
                boxShadow: "4px 4px 8px rgba(0, 0, 0, 0.4), inset 2px 2px 4px rgba(255, 255, 255, 0.15)",
                transform: "translateY(-1px)",
              },
              "&:active": {
                boxShadow: "2px 2px 4px rgba(0, 0, 0, 0.3), inset 3px 3px 6px rgba(0, 0, 0, 0.2)",
                transform: "translateY(0)",
              },
              transition: "all 0.2s ease",
            }}
          >
            Assign
          </Button>
          {assignManagerId && (
            <Button
              variant="outlined"
              onClick={() => {
                setAssignOpen(false);
                handleNew(assignManagerId);
              }}
              sx={{
                ml: 1,
                borderColor: "rgba(139, 92, 246, 0.4)",
                color: "#c4b5fd",
                borderRadius: "12px",
                textTransform: "none",
                fontWeight: 500,
                "&:hover": {
                  borderColor: "#8b5cf6",
                  backgroundColor: "rgba(139, 92, 246, 0.08)",
                },
              }}
            >
              Create New for This Manager
            </Button>
          )}
        </DialogActions>
      </Dialog>

      {/* ── Delete confirm ── */}
      <Dialog
        open={!!deleteId}
        onClose={() => setDeleteId(null)}
        maxWidth="xs"
        fullWidth
        PaperProps={{
          sx: {
            background: "rgba(15, 23, 42, 0.95)",
            backdropFilter: "blur(30px)",
            border: "1px solid rgba(255, 255, 255, 0.1)",
            borderRadius: "20px",
            boxShadow: "0 25px 60px rgba(0, 0, 0, 0.5)",
          },
        }}
      >
        <DialogTitle sx={{ color: "#f1f5f9", fontWeight: 600, borderBottom: "1px solid rgba(255, 255, 255, 0.08)", pb: 2 }}>
          Delete Template?
        </DialogTitle>
        <DialogContent sx={{ p: 3, pt: "20px !important" }}>
          <Typography sx={{ color: "#94a3b8" }}>
            This will permanently delete the template. Managers assigned to it will lose their template assignment.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ borderTop: "1px solid rgba(255, 255, 255, 0.08)", px: 3, py: 2 }}>
          <Button onClick={() => setDeleteId(null)} sx={{ color: "#94a3b8", textTransform: "none", fontWeight: 500 }}>
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={handleDelete}
            sx={{
              backgroundColor: "#ef4444",
              color: "#f1f5f9",
              borderRadius: "12px",
              fontWeight: 600,
              textTransform: "none",
              boxShadow: "6px 6px 12px rgba(0, 0, 0, 0.35), inset 2px 2px 4px rgba(255, 255, 255, 0.1)",
              "&:hover": {
                backgroundColor: "#dc2626",
                boxShadow: "4px 4px 8px rgba(0, 0, 0, 0.4), inset 2px 2px 4px rgba(255, 255, 255, 0.15)",
                transform: "translateY(-1px)",
              },
              "&:active": {
                boxShadow: "2px 2px 4px rgba(0, 0, 0, 0.3), inset 3px 3px 6px rgba(0, 0, 0, 0.2)",
                transform: "translateY(0)",
              },
              transition: "all 0.2s ease",
            }}
          >
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
