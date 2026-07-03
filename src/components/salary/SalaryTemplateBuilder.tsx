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
} from "@mui/icons-material";
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import {
  salaryTemplateService,
  SalaryTemplate,
  TemplateSection,
  TemplateColumn,
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
  allKeys: string[];
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
  paid_leave_days: 0, unmarked_days: 2, total_days: 30,
};

export const ATTENDANCE_VARIABLES: { key: string; label: string }[] = [
  { key: "present_days",    label: "Present Days" },
  { key: "absent_days",     label: "Absent Days" },
  { key: "half_days",       label: "Half Days" },
  { key: "leave_days",      label: "Leave Days" },
  { key: "paid_leave_days", label: "Paid Leave Days" },
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
 *  - Removes leading = from formula
 */
function convertExcelFormula(raw: string): { result: string; warnings: string[]; cellRefs: string[] } {
  const warnings: string[] = [];
  let s = raw.trim();

  // Strip leading = (Excel formula bar prefix)
  if (s.startsWith("=")) s = s.slice(1).trim();

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

  // Detect Excel cell refs like A1, B12, AA3
  const cellRefMatches = s.match(/\b[A-Z]{1,3}\d+\b/g);
  const cellRefs = cellRefMatches ? [...new Set(cellRefMatches)] : [];

  // Excel functions we don't handle — warn
  const unknownFns = s.match(/\b([A-Z][A-Z0-9_]+)\s*\(/g);
  if (unknownFns) {
    const names = unknownFns.map((f) => f.replace(/\s*\($/, ""));
    warnings.push(`Unsupported Excel functions: ${names.join(", ")} — convert manually`);
  }

  return { result: s.trim(), warnings, cellRefs };
}

/** Apply cell ref → variable name mappings to a converted formula string */
function applyCellMappings(formula: string, mappings: Record<string, string>): string {
  let result = formula;
  // Sort longest refs first to avoid partial replacement (e.g. AA1 before A1)
  const sorted = Object.keys(mappings).sort((a, b) => b.length - a.length);
  for (const ref of sorted) {
    const varName = mappings[ref]?.trim();
    if (!varName) continue;
    // Replace whole-word occurrences only
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

function FormulaDialog({ open, column, allKeys, onSave, onClose }: FormulaDialogProps) {
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
  const [convertResult, setConvertResult] = useState<{ result: string; warnings: string[] } | null>(null);
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
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle sx={{ color: "#2196f3", pb: 0 }}>
        Set Formula — <span style={{ color: "#fff" }}>{column.label}</span>
      </DialogTitle>

      <DialogContent>
        {/* Mode toggle */}
        <Box sx={{ display: "flex", alignItems: "center", gap: 2, mt: 1, mb: 2 }}>
          <ToggleButtonGroup
            value={mode}
            exclusive
            onChange={(_, v) => v && setMode(v)}
            size="small"
          >
            <ToggleButton value="simple">Simple Formula</ToggleButton>
            <ToggleButton value="conditional">Conditional (if/else)</ToggleButton>
          </ToggleButtonGroup>
          <Typography variant="caption" color="text.secondary">
            Preview (sample data):&nbsp;
            <span style={{ color: preview === "error" ? "#f44336" : "#4caf50", fontFamily: "monospace", fontWeight: 700 }}>
              {preview}
            </span>
          </Typography>
        </Box>

        {/* Available variable chips */}
        <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 0.5 }}>
          <Typography variant="caption" color="text.secondary">
            Click a key to insert at cursor:
          </Typography>
          {mode === "conditional" && focusedCondField && (
            <Typography variant="caption" sx={{ color: "#4caf50", fontFamily: "monospace" }}>
              → inserting into <strong>{focusedCondField.field}</strong>
            </Typography>
          )}
          {mode === "conditional" && !focusedCondField && (
            <Typography variant="caption" sx={{ color: "#888" }}>
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
              sx={{ fontFamily: "monospace", cursor: "pointer", fontSize: 11 }}
            />
          ))}
        </Box>

        {/* Attendance variable chips */}
        <Box sx={{ mb: 2 }}>
          <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 0.5 }}>
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
                  backgroundColor: "rgba(33,150,243,0.12)",
                  borderColor: "#2196f3",
                  color: "#90caf9",
                  border: "1px solid",
                }}
              />
            ))}
          </Box>
        </Box>

        {/* ── Conditional builder ── */}
        {mode === "conditional" && (
          <Box sx={{ mb: 2 }}>
            <Typography variant="body2" sx={{ mb: 1, color: "#aaa" }}>
              Conditions are evaluated top-to-bottom. First match wins.
            </Typography>

            {conditions.map((row, idx) => (
              <Paper
                key={row.id}
                sx={{ p: 1.5, mb: 1.5, backgroundColor: "#1e1e1e", border: "1px solid #3a3a3a" }}
              >
                <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1 }}>
                  <Typography variant="caption" sx={{ color: "#888", minWidth: 60 }}>
                    {idx === 0 ? "IF" : "ELSE IF"}
                  </Typography>
                  {/* Left operand */}
                  <TextField
                    size="small"
                    label="Variable"
                    value={row.left}
                    onChange={(e) => updateCondition(row.id, { left: e.target.value })}
                    sx={{ width: 140, "& input": { fontFamily: "monospace", fontSize: 12 } }}
                    placeholder="e.g. basic"
                    {...condFieldProps(row.id, "left")}
                  />
                  {/* Operator */}
                  <FormControl size="small" sx={{ minWidth: 180 }}>
                    <InputLabel>Condition</InputLabel>
                    <Select
                      value={row.op}
                      label="Condition"
                      onChange={(e) => updateCondition(row.id, { op: e.target.value as Operator })}
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
                    sx={{ width: 150, "& input": { fontFamily: "monospace", fontSize: 12 } }}
                    placeholder={row.op === "==str" ? "e.g. labor" : "e.g. 10000"}
                    {...condFieldProps(row.id, "right")}
                  />
                  <IconButton size="small" onClick={() => removeCondition(row.id)} sx={{ color: "#f44336", ml: "auto" }}>
                    <Delete fontSize="small" />
                  </IconButton>
                </Box>

                <Box sx={{ display: "flex", gap: 1, pl: 8 }}>
                  <TextField
                    size="small"
                    label="Then (result if true)"
                    value={row.thenExpr}
                    onChange={(e) => updateCondition(row.id, { thenExpr: e.target.value })}
                    sx={{ flex: 1, "& input": { fontFamily: "monospace", fontSize: 12 } }}
                    placeholder="e.g. basic * 0.05"
                    {...condFieldProps(row.id, "thenExpr")}
                  />
                  {idx === conditions.length - 1 && (
                    <TextField
                      size="small"
                      label="Else (default result)"
                      value={row.elseExpr}
                      onChange={(e) => updateCondition(row.id, { elseExpr: e.target.value })}
                      sx={{ flex: 1, "& input": { fontFamily: "monospace", fontSize: 12 } }}
                      placeholder="e.g. 0"
                      {...condFieldProps(row.id, "elseExpr")}
                    />
                  )}
                </Box>
              </Paper>
            ))}

            <Button size="small" startIcon={<AddCircleOutline />} onClick={addCondition} sx={{ color: "#4caf50" }}>
              Add another condition
            </Button>
          </Box>
        )}

        <Divider sx={{ my: 2, borderColor: "#333" }} />

        {/* Excel formula converter */}
        <Accordion sx={{ mb: 2, backgroundColor: "#1a1a1a", border: "1px solid #2196f3" }}>
          <AccordionSummary expandIcon={<ExpandMore sx={{ color: "#90caf9" }} />}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              <Functions sx={{ color: "#2196f3", fontSize: 18 }} />
              <Typography variant="caption" sx={{ color: "#90caf9", fontWeight: 600 }}>
                Excel Formula Converter — paste Excel formula, get EMS formula
              </Typography>
            </Box>
          </AccordionSummary>
          <AccordionDetails>

            {/* ── Step 1: Paste input ── */}
            {converterStep === "input" && (
              <Box>
                <Typography variant="caption" sx={{ color: "#888", display: "block", mb: 1 }}>
                  Paste your Excel formula. Cell refs like A1, B2 will be detected and you can map them to variable names.
                </Typography>
                <TextField
                  label="Paste Excel Formula here"
                  value={excelInput}
                  onChange={(e) => { setExcelInput(e.target.value); setConvertResult(null); }}
                  fullWidth
                  multiline
                  rows={2}
                  sx={{ mb: 1, "& textarea": { fontFamily: "monospace", fontSize: 12 } }}
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
                    // Pre-fill mappings with empty strings for each detected ref
                    const initial: Record<string, string> = {};
                    res.cellRefs.forEach((ref) => { initial[ref] = ""; });
                    setCellMappings(initial);
                    // If cell refs found → go to mapping step; else go straight to done
                    setConverterStep(res.cellRefs.length > 0 ? "mapping" : "done");
                  }}
                  sx={{ backgroundColor: "#2196f3", "&:hover": { backgroundColor: "#1565c0" } }}
                >
                  Convert
                </Button>
              </Box>
            )}

            {/* ── Step 2: Map cell refs to variable names ── */}
            {converterStep === "mapping" && convertResult && (
              <Box>
                <Typography variant="body2" sx={{ color: "#fff", mb: 0.5, fontWeight: 600 }}>
                  Map cell references to variable names
                </Typography>
                <Typography variant="caption" sx={{ color: "#888", display: "block", mb: 2 }}>
                  Each cell reference found in your formula needs to be replaced with an EMS variable (e.g. <code style={{ color: "#4caf50" }}>basic</code>, <code style={{ color: "#4caf50" }}>da</code>, <code style={{ color: "#4caf50" }}>paid_days</code>). Leave blank to keep as-is.
                </Typography>

                {/* Show partially converted formula for reference */}
                <Paper sx={{ p: 1, mb: 2, backgroundColor: "#0d1117", border: "1px solid #333" }}>
                  <Typography variant="caption" sx={{ color: "#666", display: "block" }}>Converted so far (cell refs still need replacing):</Typography>
                  <Typography sx={{ fontFamily: "monospace", fontSize: 11, color: "#aaa", wordBreak: "break-all" }}>
                    {convertResult.result}
                  </Typography>
                </Paper>

                {Object.keys(cellMappings).map((ref) => (
                  <Box key={ref} sx={{ display: "flex", alignItems: "center", gap: 1.5, mb: 1.5 }}>
                    <Paper sx={{ px: 1.5, py: 0.75, backgroundColor: "#1e1e1e", border: "1px solid #555", borderRadius: 1, minWidth: 56, textAlign: "center" }}>
                      <Typography sx={{ fontFamily: "monospace", fontSize: 13, color: "#f59e0b", fontWeight: 700 }}>
                        {ref}
                      </Typography>
                    </Paper>
                    <Typography sx={{ color: "#666", fontSize: 18 }}>→</Typography>
                    <TextField
                      size="small"
                      label={`Replace ${ref} with`}
                      value={cellMappings[ref]}
                      onChange={(e) => setCellMappings((prev) => ({ ...prev, [ref]: e.target.value }))}
                      placeholder="e.g. basic"
                      sx={{ flex: 1, "& input": { fontFamily: "monospace", fontSize: 12 } }}
                      select={allKeys.length > 0}
                      SelectProps={allKeys.length > 0 ? { displayEmpty: true } : undefined}
                    >
                      {allKeys.length > 0 && [
                        <MenuItem key="" value=""><em style={{ color: "#666" }}>— type custom or pick —</em></MenuItem>,
                        ...[ ...new Set([...allKeys, "basic","da","hra","paid_days","total_days","gross_rate_pm",
                          "gross_earning","ot_amount","professional_tax","esic_employee","pf_base","pf_employee",
                          "advance","total_deduction","net_salary","esic_employer","pf_employer","mlwf_employer",
                          "ctc_per_month","total_gross","present_days","absent_days","half_days","leave_days",
                          "paid_leave_days","unmarked_days","employee_type"])
                        ].map((k) => (
                          <MenuItem key={k} value={k} sx={{ fontFamily: "monospace", fontSize: 12 }}>{k}</MenuItem>
                        )),
                      ]}
                    </TextField>
                  </Box>
                ))}

                {convertResult.warnings.filter(w => !w.startsWith("Cell ref")).length > 0 && (
                  <Alert severity="warning" sx={{ mb: 1, fontSize: 11 }}>
                    {convertResult.warnings.filter(w => !w.startsWith("Cell ref")).map((w, i) => <div key={i}>⚠ {w}</div>)}
                  </Alert>
                )}

                <Box sx={{ display: "flex", gap: 1, mt: 1 }}>
                  <Button size="small" onClick={() => setConverterStep("input")} sx={{ color: "#888" }}>
                    ← Back
                  </Button>
                  <Button
                    size="small"
                    variant="contained"
                    onClick={() => setConverterStep("done")}
                    sx={{ backgroundColor: "#4caf50", "&:hover": { backgroundColor: "#388e3c" } }}
                  >
                    Apply Mappings →
                  </Button>
                </Box>
              </Box>
            )}

            {/* ── Step 3: Final result ── */}
            {converterStep === "done" && convertResult && (() => {
              const finalFormula = applyCellMappings(convertResult.result, cellMappings);
              return (
                <Box>
                  <Typography variant="body2" sx={{ color: "#fff", mb: 1, fontWeight: 600 }}>
                    ✓ Converted formula ready
                  </Typography>
                  <Paper sx={{ p: 1.5, backgroundColor: "#0d1117", border: "1px solid #4caf50", borderRadius: 1, mb: 1.5 }}>
                    <Typography variant="caption" sx={{ color: "#888", display: "block", mb: 0.5 }}>Final formula:</Typography>
                    <Typography sx={{ fontFamily: "monospace", fontSize: 13, color: "#4caf50", wordBreak: "break-all" }}>
                      {finalFormula}
                    </Typography>
                  </Paper>
                  {convertResult.warnings.length > 0 && (
                    <Alert severity="warning" sx={{ mb: 1.5, fontSize: 11 }}>
                      {convertResult.warnings.map((w, i) => <div key={i}>⚠ {w}</div>)}
                    </Alert>
                  )}
                  <Box sx={{ display: "flex", gap: 1 }}>
                    <Button
                      size="small"
                      onClick={() => setConverterStep(convertResult.cellRefs.length > 0 ? "mapping" : "input")}
                      sx={{ color: "#888" }}
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
                        // Reset converter
                        setExcelInput("");
                        setConvertResult(null);
                        setCellMappings({});
                        setConverterStep("input");
                      }}
                      sx={{ backgroundColor: "#4caf50", "&:hover": { backgroundColor: "#388e3c" } }}
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
                      sx={{ borderColor: "#555", color: "#888" }}
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
          sx={{ mb: 2, "& textarea": { fontFamily: "monospace", fontSize: 13 } }}
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
        />

        {/* Quick reference */}
        <Accordion sx={{ mt: 2, backgroundColor: "#1a1a1a", border: "1px solid #333" }}>
          <AccordionSummary expandIcon={<ExpandMore sx={{ color: "#aaa" }} />}>
            <Typography variant="caption" sx={{ color: "#aaa" }}>Formula syntax reference</Typography>
          </AccordionSummary>
          <AccordionDetails>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell sx={{ color: "#888", fontSize: 11 }}>Example</TableCell>
                  <TableCell sx={{ color: "#888", fontSize: 11 }}>Meaning</TableCell>
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
                  <TableRow key={ex}>
                    <TableCell
                      sx={{ fontFamily: "monospace", fontSize: 11, color: "#4caf50", cursor: "pointer" }}
                      onClick={() => setExpr(ex as string)}
                    >
                      {ex}
                    </TableCell>
                    <TableCell sx={{ fontSize: 11, color: "#aaa" }}>{meaning}</TableCell>
                  </TableRow>
                ))}
                {/* Attendance deduction examples */}
                <TableRow>
                  <TableCell
                    colSpan={2}
                    sx={{ fontSize: 11, color: "#90caf9", fontWeight: 700, pt: 1.5, pb: 0.5, borderTop: "1px solid #333" }}
                  >
                    Attendance deduction examples
                  </TableCell>
                </TableRow>
                {[
                  ["absent_days * (basic / total_days)", "Deduct one day's pay per absent day"],
                  ["if(absent_days > 3, absent_days * (basic / total_days), 0)", "Deduct only when absent more than 3 days"],
                ].map(([ex, meaning]) => (
                  <TableRow key={ex}>
                    <TableCell
                      sx={{ fontFamily: "monospace", fontSize: 11, color: "#4caf50", cursor: "pointer" }}
                      onClick={() => setExpr(ex as string)}
                    >
                      {ex}
                    </TableCell>
                    <TableCell sx={{ fontSize: 11, color: "#aaa" }}>{meaning}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </AccordionDetails>
        </Accordion>
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          variant="contained"
          onClick={handleSave}
          startIcon={<Save />}
          sx={{ backgroundColor: "#4caf50", "&:hover": { backgroundColor: "#388e3c" } }}
        >
          Save Formula
        </Button>
      </DialogActions>
    </Dialog>
  );
}

// ─── Slip Config Dialog ───────────────────────────────────────────────────────

import { Switch, FormControlLabel as MuiFormControlLabel, RadioGroup, Radio } from "@mui/material";
import { Receipt } from "@mui/icons-material";
import type { ColumnSlipConfig } from "@/lib/salaryTemplateService";

interface SlipConfigDialogProps {
  open: boolean;
  column: TemplateColumn | null;
  onSave: (col: TemplateColumn) => void;
  onClose: () => void;
}

function SlipConfigDialog({ open, column, onSave, onClose }: SlipConfigDialogProps) {
  const defaultCfg: ColumnSlipConfig = {
    includeInSlip: false,
    slipSection: "none",
    slipLabel: "",
    isNetSalary: false,
  };
  const [cfg, setCfg] = useState<ColumnSlipConfig>(column?.slipConfig ?? defaultCfg);

  useEffect(() => {
    setCfg(column?.slipConfig ?? { ...defaultCfg, slipLabel: column?.label ?? "" });
  }, [column]);

  if (!column) return null;

  const handleSave = () => {
    onSave({ ...column, slipConfig: cfg });
    onClose();
  };

  const sectionIcon =
    cfg.slipSection === "earnings" ? "+" :
    cfg.slipSection === "deductions" ? "−" : "";

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ color: "#ff9800", pb: 0 }}>
        Salary Slip Config —{" "}
        <span style={{ color: "#fff" }}>{column.label}</span>
      </DialogTitle>
      <DialogContent>
        <Box sx={{ mt: 2, display: "flex", flexDirection: "column", gap: 2 }}>

          {/* Include toggle */}
          <MuiFormControlLabel
            control={
              <Switch
                checked={cfg.includeInSlip}
                onChange={(e) =>
                  setCfg((p) => ({
                    ...p,
                    includeInSlip: e.target.checked,
                    slipSection: e.target.checked
                      ? p.slipSection === "none" ? "earnings" : p.slipSection
                      : "none",
                    isNetSalary: e.target.checked ? false : p.isNetSalary,
                  }))
                }
                color="warning"
              />
            }
            label={<Typography sx={{ fontWeight: 600 }}>Include in Salary Slip</Typography>}
          />

          {cfg.includeInSlip && (
            <>
              {/* Section */}
              <Box>
                <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: "block" }}>
                  Section on slip:
                </Typography>
                <RadioGroup
                  row
                  value={cfg.slipSection}
                  onChange={(e) =>
                    setCfg((p) => ({
                      ...p,
                      slipSection: e.target.value as ColumnSlipConfig["slipSection"],
                    }))
                  }
                >
                  {[
                    { value: "earnings", label: "+ Earnings" },
                    { value: "deductions", label: "− Deductions" },
                    { value: "details", label: "Employee Details" },
                  ].map((opt) => (
                    <MuiFormControlLabel
                      key={opt.value}
                      value={opt.value}
                      control={<Radio size="small" />}
                      label={<Typography variant="body2">{opt.label}</Typography>}
                    />
                  ))}
                </RadioGroup>
              </Box>

              {/* Label override */}
              <TextField
                label="Display label on slip"
                value={cfg.slipLabel ?? ""}
                onChange={(e) => setCfg((p) => ({ ...p, slipLabel: e.target.value }))}
                fullWidth
                size="small"
                placeholder={`Default: "${column.label}"`}
                helperText="Leave blank to use the column label"
              />

              {/* Preview */}
              {cfg.slipSection !== "details" && (
                <Box sx={{ p: 1.5, backgroundColor: "#1a1a1a", border: "1px solid #333", borderRadius: 1, display: "flex", justifyContent: "space-between" }}>
                  <Typography variant="body2" sx={{ color: "#ccc" }}>
                    {cfg.slipLabel || column.label}
                  </Typography>
                  <Typography variant="body2" sx={{ fontFamily: "monospace", color: "#ccc" }}>
                    {sectionIcon}₹ (calculated)
                  </Typography>
                </Box>
              )}
            </>
          )}

          {/* Net salary toggle — only when NOT included in table */}
          {!cfg.includeInSlip && (
            <MuiFormControlLabel
              control={
                <Switch
                  checked={cfg.isNetSalary ?? false}
                  onChange={(e) => setCfg((p) => ({ ...p, isNetSalary: e.target.checked }))}
                  color="success"
                />
              }
              label={
                <Box>
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>This is the Net Salary column</Typography>
                  <Typography variant="caption" color="text.secondary">
                    Its value will be shown as Net Pay at the bottom of the slip.
                  </Typography>
                </Box>
              }
            />
          )}
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          variant="contained"
          onClick={handleSave}
          startIcon={<Receipt />}
          sx={{ backgroundColor: "#ff9800", "&:hover": { backgroundColor: "#f57c00" } }}
        >
          Save
        </Button>
      </DialogActions>
    </Dialog>
  );
}

// ─── Column row ───────────────────────────────────────────────────────────────

interface ColumnRowProps {
  column: TemplateColumn;
  availableKeys: string[]; // keys declared before this column
  onUpdate: (col: TemplateColumn) => void;
  onDelete: (id: string) => void;
}

function ColumnRow({ column, availableKeys, onUpdate, onDelete }: ColumnRowProps) {
  const [formulaOpen, setFormulaOpen] = useState(false);
  const [slipOpen, setSlipOpen] = useState(false);

  const slipCfg = column.slipConfig;
  const slipBadgeColor = slipCfg?.includeInSlip
    ? slipCfg.slipSection === "earnings" ? "#4caf50"
    : slipCfg.slipSection === "deductions" ? "#f44336"
    : "#2196f3"
    : "#555";

  return (
    <>
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 1,
          py: 0.75,
          px: 1,
          borderRadius: 1,
          "&:hover": { backgroundColor: "rgba(255,255,255,0.04)" },
        }}
      >
        <DragIndicator sx={{ color: "#555", fontSize: 18 }} />

        <TextField
          size="small"
          value={column.label}
          disabled={column.isFixed}
          onChange={(e) =>
            onUpdate({ ...column, label: e.target.value, key: normalize(e.target.value) })
          }
          sx={{ flex: 1, "& .MuiInputBase-input": { fontSize: 13 } }}
          placeholder="Column label"
        />

        <Typography
          variant="caption"
          sx={{ fontFamily: "monospace", color: "#888", minWidth: 100, fontSize: 11 }}
        >
          key: {column.key}
        </Typography>

        {column.formula ? (
          <Chip
            label={column.formula.expression.slice(0, 20) + (column.formula.expression.length > 20 ? "…" : "")}
            size="small"
            color="primary"
            variant="outlined"
            onClick={() => !column.isFixed && setFormulaOpen(true)}
            sx={{ fontFamily: "monospace", fontSize: 10, maxWidth: 140 }}
          />
        ) : (
          <Chip label="no formula" size="small" variant="outlined" sx={{ fontSize: 10, color: "#666" }} />
        )}

        {/* Slip config badge */}
        <Tooltip title={slipCfg?.includeInSlip ? `Slip: ${slipCfg.slipSection} — "${slipCfg.slipLabel || column.label}"` : "Not on slip"}>
          <Chip
            label={slipCfg?.includeInSlip ? `slip: ${slipCfg.slipSection}` : "no slip"}
            size="small"
            onClick={() => setSlipOpen(true)}
            sx={{
              fontSize: 10,
              cursor: "pointer",
              borderColor: slipBadgeColor,
              color: slipBadgeColor,
              border: "1px solid",
              backgroundColor: "transparent",
            }}
          />
        </Tooltip>

        <Tooltip title="Set formula">
          <span>
            <IconButton
              size="small"
              disabled={column.isFixed}
              onClick={() => setFormulaOpen(true)}
              sx={{ color: "#2196f3" }}
            >
              <Functions fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>

        <Tooltip title="Salary slip config">
          <IconButton size="small" onClick={() => setSlipOpen(true)} sx={{ color: "#ff9800" }}>
            <Receipt fontSize="small" />
          </IconButton>
        </Tooltip>

        {column.isFixed ? (
          <Tooltip title="Fixed column — cannot be deleted">
            <Lock sx={{ fontSize: 16, color: "#555" }} />
          </Tooltip>
        ) : (
          <Tooltip title="Delete column">
            <IconButton size="small" onClick={() => onDelete(column.id)} sx={{ color: "#f44336" }}>
              <Delete fontSize="small" />
            </IconButton>
          </Tooltip>
        )}
      </Box>

      <FormulaDialog
        open={formulaOpen}
        column={column}
        allKeys={availableKeys}
        onSave={(updated) => onUpdate(updated)}
        onClose={() => setFormulaOpen(false)}
      />

      <SlipConfigDialog
        open={slipOpen}
        column={column}
        onSave={(updated) => onUpdate(updated)}
        onClose={() => setSlipOpen(false)}
      />
    </>
  );
}

// ─── Section card ─────────────────────────────────────────────────────────────

interface SectionCardProps {
  section: TemplateSection;
  getAvailableKeys: (sectionId: string, colId: string) => string[];
  onUpdate: (sec: TemplateSection) => void;
  onDelete: (id: string) => void;
}

function SectionCard({ section, getAvailableKeys, onUpdate, onDelete }: SectionCardProps) {
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
        backgroundColor: "#2a2a2a",
        border: "1px solid #3a3a3a",
        mb: 1,
        "&:before": { display: "none" },
      }}
    >
      <AccordionSummary expandIcon={<ExpandMore sx={{ color: "#fff" }} />}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1, flex: 1 }}>
          {section.isFixed ? (
            <Lock sx={{ fontSize: 16, color: "#888" }} />
          ) : (
            <DragIndicator sx={{ fontSize: 16, color: "#888" }} />
          )}
          {section.isFixed ? (
            <Typography sx={{ color: "#fff", fontWeight: 600 }}>{section.label}</Typography>
          ) : (
            <TextField
              size="small"
              value={section.label}
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => onUpdate({ ...section, label: e.target.value })}
              sx={{ "& .MuiInputBase-input": { fontSize: 14, fontWeight: 600, color: "#fff" } }}
            />
          )}
          <Chip
            label={`${section.columns.length} columns`}
            size="small"
            sx={{ ml: 1, fontSize: 10 }}
          />
          {section.isFixed && (
            <Chip label="fixed" size="small" color="default" sx={{ fontSize: 10 }} />
          )}
        </Box>
        {!section.isFixed && (
          <Tooltip title="Delete section">
            <IconButton
              component="span"
              size="small"
              onClick={(e) => { e.stopPropagation(); onDelete(section.id); }}
              sx={{ color: "#f44336", mr: 1 }}
            >
              <Delete fontSize="small" />
            </IconButton>
          </Tooltip>
        )}
      </AccordionSummary>

      <AccordionDetails sx={{ pt: 0 }}>
        <Divider sx={{ mb: 1, borderColor: "#3a3a3a" }} />
        {section.columns.map((col) => (
          <ColumnRow
            key={col.id}
            column={col}
            availableKeys={getAvailableKeys(section.id, col.id)}
            onUpdate={updateColumn}
            onDelete={deleteColumn}
          />
        ))}
        <Button
          size="small"
          startIcon={<Add />}
          onClick={addColumn}
          sx={{ mt: 1, color: "#4caf50" }}
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
      setTemplates(tmpl);
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
  // Returns keys from all sections before sectionId, plus columns before colId in same section
  const getAvailableKeys = useCallback(
    (sectionId: string, colId: string): string[] => {
      if (!editing) return [];
      const sorted = [...editing.sections].sort((a, b) => a.order - b.order);
      const keys: string[] = [];
      for (const sec of sorted) {
        if (sec.id === sectionId) {
          // same section: only columns before this one
          for (const col of sec.columns) {
            if (col.id === colId) break;
            keys.push(col.key);
          }
          break;
        }
        // previous sections: all columns
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
        // stay in edit mode with the real id
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
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3 }}>
      {alert && (
        <Alert severity={alert.type} onClose={() => setAlert(null)} sx={{ mb: 2 }}>
          {alert.message}
        </Alert>
      )}

      {/* ── Editor view ── */}
      {editing ? (
        <Box>
          {/* Editor header */}
          <Box sx={{ display: "flex", alignItems: "center", gap: 2, mb: 3, flexWrap: "wrap" }}>
            <Button variant="outlined" size="small" onClick={() => setEditing(null)}>
              ← Back
            </Button>
            <Typography variant="h5" sx={{ color: "#2196f3", fontWeight: 600, flex: 1 }}>
              {isNew ? "New Template" : "Edit Template"}
            </Typography>
            <Button
              variant="contained"
              startIcon={saving ? <CircularProgress size={16} /> : <Save />}
              onClick={handleSave}
              disabled={saving}
              sx={{ backgroundColor: "#4caf50", "&:hover": { backgroundColor: "#388e3c" } }}
            >
              Save Template
            </Button>
          </Box>

          {/* Template meta */}
          <Paper sx={{ p: 2, mb: 3, backgroundColor: "#2a2a2a", border: "1px solid #3a3a3a" }}>
            <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap" }}>
              <TextField
                label="Template Name"
                value={editing.name}
                onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                sx={{ flex: 1, minWidth: 220 }}
                required
              />
              <TextField
                label="Description"
                value={editing.description ?? ""}
                onChange={(e) => setEditing({ ...editing, description: e.target.value })}
                sx={{ flex: 2, minWidth: 280 }}
              />
              <FormControl sx={{ minWidth: 220 }}>
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
          <Typography variant="subtitle1" sx={{ color: "#aaa", mb: 1 }}>
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
                onUpdate={updateSection}
                onDelete={deleteSection}
              />
            ))}

          <Button
            variant="outlined"
            startIcon={<Add />}
            onClick={addSection}
            sx={{ mt: 2, borderColor: "#2196f3", color: "#2196f3" }}
          >
            Add Section
          </Button>
        </Box>
      ) : (
        /* ── List view ── */
        <Box>
          <Box sx={{ display: "flex", alignItems: "center", gap: 2, mb: 3, flexWrap: "wrap" }}>
            <Typography variant="h5" sx={{ color: "#2196f3", fontWeight: 600, flex: 1 }}>
              Salary Templates
            </Typography>
            <Button
              variant="outlined"
              startIcon={<Assignment />}
              onClick={() => setAssignOpen(true)}
              sx={{ borderColor: "#ff9800", color: "#ff9800" }}
            >
              Assign Template
            </Button>
            <Button
              variant="contained"
              startIcon={<Add />}
              onClick={() => handleNew(null)}
              sx={{ backgroundColor: "#2196f3" }}
            >
              New Global Template
            </Button>
            <Button
              variant="contained"
              startIcon={<Add />}
              onClick={() => {
                // pick manager first via assign dialog repurposed
                setAssignOpen(true);
              }}
              sx={{ backgroundColor: "#9c27b0" }}
            >
              New Manager Template
            </Button>
          </Box>

          {templates.length === 0 ? (
            <Paper sx={{ p: 4, textAlign: "center", backgroundColor: "#2a2a2a", border: "1px solid #3a3a3a" }}>
              <Typography color="text.secondary" sx={{ mb: 2 }}>
                No templates yet. Create a global template or one per manager.
              </Typography>
              <Button variant="contained" startIcon={<Add />} onClick={() => handleNew(null)}>
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
                      p: 2,
                      backgroundColor: "#2a2a2a",
                      border: "1px solid #3a3a3a",
                      display: "flex",
                      alignItems: "center",
                      gap: 2,
                      flexWrap: "wrap",
                    }}
                  >
                    <Box sx={{ flex: 1 }}>
                      <Typography variant="subtitle1" sx={{ color: "#fff", fontWeight: 600 }}>
                        {tmpl.name}
                      </Typography>
                      {tmpl.description && (
                        <Typography variant="body2" color="text.secondary">
                          {tmpl.description}
                        </Typography>
                      )}
                      <Box sx={{ display: "flex", gap: 1, mt: 0.5, flexWrap: "wrap" }}>
                        <Chip
                          label={managerName ? `Manager: ${managerName}` : "Global"}
                          size="small"
                          color={managerName ? "secondary" : "primary"}
                        />
                        <Chip
                          label={`${tmpl.sections.length} sections`}
                          size="small"
                          variant="outlined"
                        />
                        <Chip
                          label={`${tmpl.sections.reduce((a, s) => a + s.columns.length, 0)} columns`}
                          size="small"
                          variant="outlined"
                        />
                      </Box>
                    </Box>

                    <Box sx={{ display: "flex", gap: 1 }}>
                      <Tooltip title="Edit template">
                        <IconButton
                          onClick={() => { setEditing(tmpl); setIsNew(false); }}
                          sx={{ color: "#2196f3" }}
                        >
                          <Edit />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Duplicate">
                        <IconButton onClick={() => handleDuplicate(tmpl)} sx={{ color: "#ff9800" }}>
                          <ContentCopy />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Delete">
                        <IconButton onClick={() => setDeleteId(tmpl.id)} sx={{ color: "#f44336" }}>
                          <Delete />
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
      <Dialog open={assignOpen} onClose={() => setAssignOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Assign Template to Manager</DialogTitle>
        <DialogContent>
          <Box sx={{ display: "flex", flexDirection: "column", gap: 2, mt: 1 }}>
            <FormControl fullWidth>
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
            <FormControl fullWidth>
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
            <Typography variant="body2" color="text.secondary">
              Assigning a template will use its section/column structure when generating salary slips for employees under this manager.
            </Typography>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAssignOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            onClick={handleAssign}
            disabled={assigning || !assignManagerId}
            startIcon={assigning ? <CircularProgress size={16} /> : <Assignment />}
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
              sx={{ ml: 1 }}
            >
              Create New for This Manager
            </Button>
          )}
        </DialogActions>
      </Dialog>

      {/* ── Delete confirm ── */}
      <Dialog open={!!deleteId} onClose={() => setDeleteId(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Delete Template?</DialogTitle>
        <DialogContent>
          <Typography>
            This will permanently delete the template. Managers assigned to it will lose their template assignment.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteId(null)}>Cancel</Button>
          <Button color="error" variant="contained" onClick={handleDelete}>
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
