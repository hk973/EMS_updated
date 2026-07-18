"use client";

/**
 * SlipTemplateCanvas
 *
 * Drag-and-drop canvas designer for salary slip templates.
 * - Left panel: element palette (Text, Variable, Line, Rect, Logo, Stamp, Signature, Table)
 * - Centre: A4 canvas where elements are placed and dragged with mouse
 * - Right panel: properties panel for the selected element
 *
 * Global templates: Logo/Stamp/Signature elements show a placeholder;
 *   at print time the employee's manager's assets are injected automatically.
 * Manager templates: assets are previewed from the manager doc.
 */

import React, {
  useState,
  useRef,
  useCallback,
  useEffect,
  useMemo,
  useContext,
  createContext,
} from "react";
import {
  Box,
  Typography,
  Button,
  IconButton,
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Tooltip,
  Divider,
  Chip,
  Paper,
  CircularProgress,
  Switch,
  FormControlLabel,
  Slider,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
} from "@mui/material";
import {
  Save,
  Delete,
  ContentCopy,
  ZoomIn,
  ZoomOut,
  FitScreen,
  TextFields,
  DataObject,
  HorizontalRule,
  RectangleOutlined,
  Image as ImageIcon,
  Brush,
  Draw,
  TableChart,
  ArrowUpward,
  ArrowDownward,
  KeyboardArrowUp,
  KeyboardArrowDown,
} from "@mui/icons-material";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import {
  SlipTemplate,
  SlipElement,
  TextElement,
  VariableElement,
  LineElement,
  RectElement,
  LogoElement,
  StampElement,
  SignatureElement,
  TableElement,
  TableCell,
  DEFAULT_CANVAS_WIDTH,
  DEFAULT_CANVAS_HEIGHT,
} from "@/lib/slipTemplateService";
import {
  buildSlipVariableGroups,
  getVariableLabel,
} from "@/lib/slipVariables";
import type { SlipVariableGroup } from "@/lib/slipVariables";
import { salaryTemplateService } from "@/lib/salaryTemplateService";
import type { SalaryTemplate } from "@/lib/salaryTemplateService";

// ─── Variable groups context ──────────────────────────────────────────────────
// The slip variable list is generated dynamically from the company's salary
// structure template(s). We expose it through a context so the nested editor
// components (CellEditor, PropertiesPanel) can read it without prop-drilling.
const VariableGroupsContext = createContext<SlipVariableGroup[]>([]);

// ─── Types ────────────────────────────────────────────────────────────────────

interface ManagerInfo {
  id: string;
  name: string;
}

interface Props {
  template: SlipTemplate;
  managers: ManagerInfo[];
  onSave: (tmpl: SlipTemplate) => Promise<void>;
  onBack: () => void;
}

// Drag state
interface DragState {
  elementId: string;
  startMouseX: number;
  startMouseY: number;
  startElemX: number;
  startElemY: number;
}

// Resize state
interface ResizeState {
  elementId: string;
  handle: "se" | "e" | "s";
  startMouseX: number;
  startMouseY: number;
  startW: number;
  startH: number;
}

// ─── ID generator ─────────────────────────────────────────────────────────────

const genId = () => `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

// ─── Default element factories ────────────────────────────────────────────────

function defaultText(x: number, y: number): TextElement {
  return {
    id: genId(), type: "text",
    x, y, width: 200, height: 28, zIndex: 1,
    content: "Text",
    fontSize: 14, fontWeight: "normal", fontStyle: "normal",
    color: "#000000", textAlign: "left",
  };
}

function defaultVariable(x: number, y: number): VariableElement {
  return {
    id: genId(), type: "variable",
    x, y, width: 200, height: 28, zIndex: 1,
    variableKey: "employee_name",
    fontSize: 14, fontWeight: "normal", fontStyle: "normal",
    color: "#000000", textAlign: "left",
  };
}

function defaultLine(x: number, y: number): LineElement {
  return {
    id: genId(), type: "line",
    x, y, width: 300, height: 2, zIndex: 1,
    orientation: "horizontal", thickness: 1, color: "#000000",
  };
}

function defaultRect(x: number, y: number): RectElement {
  return {
    id: genId(), type: "rectangle",
    x, y, width: 200, height: 60, zIndex: 1,
    borderColor: "#000000", fillColor: "transparent",
    borderRadius: 0, opacity: 1, borderWidth: 1,
  };
}

function defaultLogo(x: number, y: number): LogoElement {
  return { id: genId(), type: "logo", x, y, width: 100, height: 60, zIndex: 1 };
}

function defaultStamp(x: number, y: number): StampElement {
  return { id: genId(), type: "stamp", x, y, width: 80, height: 80, zIndex: 1 };
}

function defaultSignature(x: number, y: number): SignatureElement {
  return { id: genId(), type: "signature", x, y, width: 140, height: 50, zIndex: 1 };
}

function defaultTable(x: number, y: number): TableElement {
  // Default: 3-column, 3-row table (header + 2 data rows)
  const cols = 3;
  const headerRow: TableCell[] = [
    { kind: "text", text: "Employee", fontWeight: "bold", textAlign: "center", color: "#ffffff" },
    { kind: "text", text: "Basic",    fontWeight: "bold", textAlign: "center", color: "#ffffff" },
    { kind: "text", text: "Net Pay",  fontWeight: "bold", textAlign: "center", color: "#ffffff" },
  ];
  const dataRow: TableCell[] = [
    { kind: "variable", variableKey: "employee_name", textAlign: "left",  color: "#000000" },
    { kind: "variable", variableKey: "basic",          textAlign: "right", color: "#000000" },
    { kind: "variable", variableKey: "net_salary",     textAlign: "right", color: "#000000" },
  ];
  return {
    id: genId(), type: "table",
    x, y, width: 420, height: 100, zIndex: 1,
    cols,
    rows: [headerRow, [...dataRow], [...dataRow]],
    hasHeaderRow: true,
    alternateRowColor: true,
    borderColor: "#cccccc",
    borderWidth: 1,
    headerBgColor: "#2196f3",
    headerTextColor: "#ffffff",
    rowHeight: 24,
    fontSize: 11,
  };
}

// ─── Element Palette ──────────────────────────────────────────────────────────

const PALETTE_ITEMS = [
  { type: "text",      label: "Text",      icon: <TextFields fontSize="small" />,       color: "#2196f3" },
  { type: "variable",  label: "Variable",  icon: <DataObject fontSize="small" />,        color: "#4caf50" },
  { type: "line",      label: "Line",      icon: <HorizontalRule fontSize="small" />,    color: "#ff9800" },
  { type: "rectangle", label: "Rectangle", icon: <RectangleOutlined fontSize="small" />, color: "#9c27b0" },
  { type: "logo",      label: "Logo",      icon: <ImageIcon fontSize="small" />,         color: "#00bcd4" },
  { type: "stamp",     label: "Stamp",     icon: <Brush fontSize="small" />,             color: "#e91e63" },
  { type: "signature", label: "Signature", icon: <Draw fontSize="small" />,              color: "#ff5722" },
  { type: "table",     label: "Table",     icon: <TableChart fontSize="small" />,        color: "#607d8b" },
] as const;

interface PaletteProps {
  scope: "global" | "manager";
  onAdd: (type: SlipElement["type"]) => void;
}

function ElementPalette({ scope, onAdd }: PaletteProps) {
  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}>
      <Typography variant="caption" sx={{ color: "#888", mb: 0.5, fontWeight: 600, textTransform: "uppercase", letterSpacing: 1 }}>
        Elements
      </Typography>
      {PALETTE_ITEMS.map((item) => (
        <Button
          key={item.type}
          variant="outlined"
          size="small"
          startIcon={item.icon}
          onClick={() => onAdd(item.type as SlipElement["type"])}
          sx={{
            justifyContent: "flex-start",
            borderColor: "#444",
            color: item.color,
            fontSize: 12,
            py: 0.5,
            "&:hover": { borderColor: item.color, backgroundColor: `${item.color}18` },
          }}
        >
          {item.label}
        </Button>
      ))}
      <Divider sx={{ borderColor: "#333", my: 1 }} />
      <Typography variant="caption" sx={{ color: "#666", fontSize: 10, lineHeight: 1.4 }}>
        {scope === "global"
          ? "Logo/Stamp/Signature: at print time, the employee's manager assets are used automatically."
          : "Logo/Stamp/Signature: embedded from this manager's profile."}
      </Typography>
    </Box>
  );
}

// ─── Cell Editor (used inside PropertiesPanel for table cells) ───────────────

interface CellEditorProps {
  cell: TableCell;
  isHeader: boolean;
  headerBg: string;
  onChange: (patch: Partial<TableCell>) => void;
}

function CellEditor({ cell, isHeader, headerBg, onChange }: CellEditorProps) {
  const [open, setOpen] = useState(false);
  const variableGroups = useContext(VariableGroupsContext);
  const CELL_KINDS: { value: TableCell["kind"]; label: string }[] = [
    { value: "empty",     label: "Empty" },
    { value: "text",      label: "Text" },
    { value: "variable",  label: "Variable" },
    { value: "logo",      label: "Logo" },
    { value: "stamp",     label: "Stamp" },
    { value: "signature", label: "Signature" },
  ];
  const label =
    cell.kind === "variable" ? getVariableLabel(cell.variableKey ?? "", variableGroups) :
    cell.kind === "text"     ? (cell.text || "(empty)") :
    cell.kind === "empty"    ? "—" :
    cell.kind;

  return (
    <>
      <Box
        onClick={() => setOpen(true)}
        sx={{
          minWidth: 68, maxWidth: 90, height: 24, px: 0.5,
          backgroundColor: isHeader ? headerBg : "#2a2a2a",
          border: "1px solid #555",
          display: "flex", alignItems: "center", justifyContent: "center",
          cursor: "pointer", overflow: "hidden",
          "&:hover": { border: "1px solid #90caf9" },
        }}
      >
        <Typography noWrap sx={{ fontSize: 9, color: isHeader ? "#fff" : "#ccc", userSelect: "none" }}>
          {label}
        </Typography>
      </Box>

      {/* Cell edit popover */}
      <Dialog open={open} onClose={() => setOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ pb: 0, fontSize: 14 }}>Edit Cell</DialogTitle>
        <DialogContent>
          <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5, mt: 1 }}>
            {/* Kind */}
            <FormControl size="small" fullWidth>
              <InputLabel>Type</InputLabel>
              <Select value={cell.kind} label="Type"
                onChange={(e) => onChange({ kind: e.target.value as TableCell["kind"] })}>
                {CELL_KINDS.map((k) => (
                  <MenuItem key={k.value} value={k.value}>{k.label}</MenuItem>
                ))}
              </Select>
            </FormControl>

            {/* Text content */}
            {cell.kind === "text" && (
              <TextField size="small" label="Text" fullWidth value={cell.text ?? ""}
                onChange={(e) => onChange({ text: e.target.value })} />
            )}

            {/* Variable picker */}
            {cell.kind === "variable" && (
              <FormControl size="small" fullWidth>
                <InputLabel>Variable</InputLabel>
                <Select value={cell.variableKey ?? ""} label="Variable"
                  onChange={(e) => onChange({ variableKey: e.target.value })}>
                  {variableGroups.map((g) => [
                    <MenuItem key={g.group} disabled sx={{ fontSize: 11, color: "#888", py: 0.25 }}>{g.group}</MenuItem>,
                    ...g.vars.map((v) => (
                      <MenuItem key={v.key} value={v.key} sx={{ fontSize: 12, pl: 3 }}>{v.label}</MenuItem>
                    )),
                  ])}
                </Select>
              </FormControl>
            )}

            {(cell.kind === "text" || cell.kind === "variable") && (
              <>
                <Box sx={{ display: "flex", gap: 1 }}>
                  <FormControl size="small" sx={{ flex: 1 }}>
                    <InputLabel>Align</InputLabel>
                    <Select value={cell.textAlign ?? "left"} label="Align"
                      onChange={(e) => onChange({ textAlign: e.target.value as TableCell["textAlign"] })}>
                      <MenuItem value="left">Left</MenuItem>
                      <MenuItem value="center">Center</MenuItem>
                      <MenuItem value="right">Right</MenuItem>
                    </Select>
                  </FormControl>
                  <FormControl size="small" sx={{ flex: 1 }}>
                    <InputLabel>Weight</InputLabel>
                    <Select value={cell.fontWeight ?? "normal"} label="Weight"
                      onChange={(e) => onChange({ fontWeight: e.target.value as TableCell["fontWeight"] })}>
                      <MenuItem value="normal">Normal</MenuItem>
                      <MenuItem value="bold">Bold</MenuItem>
                    </Select>
                  </FormControl>
                </Box>
                <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                  <Typography variant="caption" sx={{ color: "#888", whiteSpace: "nowrap" }}>Text color</Typography>
                  <input type="color" value={cell.color ?? "#000000"}
                    onChange={(e) => onChange({ color: e.target.value })}
                    style={{ flex: 1, height: 28, border: "1px solid #444", borderRadius: 4, cursor: "pointer" }} />
                </Box>
              </>
            )}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)} variant="contained" size="small">Done</Button>
        </DialogActions>
      </Dialog>
    </>
  );
}

// ─── Properties Panel ─────────────────────────────────────────────────────────

interface PropsPanel {
  element: SlipElement;
  onChange: (updated: SlipElement) => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onBringForward: () => void;
  onSendBackward: () => void;
  onBringFront: () => void;
  onSendBack: () => void;
}

function PropertiesPanel({
  element, onChange, onDelete, onDuplicate,
  onBringForward, onSendBackward, onBringFront, onSendBack,
}: PropsPanel) {
  const variableGroups = useContext(VariableGroupsContext);
  const upd = (patch: Partial<SlipElement>) => onChange({ ...element, ...patch } as SlipElement);

  const field = (label: string, node: React.ReactNode) => (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5, mb: 1.5 }}>
      <Typography variant="caption" sx={{ color: "#888", fontSize: 10 }}>{label}</Typography>
      {node}
    </Box>
  );

  const numField = (label: string, key: keyof SlipElement, min = 0, max = 2000) => field(label,
    <TextField
      size="small" type="number"
      value={(element as any)[key] ?? 0}
      onChange={(e) => upd({ [key]: Number(e.target.value) } as any)}
      inputProps={{ min, max, step: 1 }}
      sx={{ "& input": { fontSize: 12 } }}
    />
  );

  return (
    <Box sx={{ display: "flex", flexDirection: "column", overflowY: "auto", flex: 1, pr: 0.5 }}>
      <Typography variant="caption" sx={{ color: "#888", mb: 1, fontWeight: 600, textTransform: "uppercase", letterSpacing: 1 }}>
        Properties
      </Typography>

      {/* Position & size */}
      <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1, mb: 1.5 }}>
        {(["x","y","width","height"] as const).map((k) => (
          <Box key={k}>
            <Typography variant="caption" sx={{ color: "#888", fontSize: 10 }}>{k.toUpperCase()}</Typography>
            <TextField
              size="small" type="number"
              value={(element as any)[k] ?? 0}
              onChange={(e) => upd({ [k]: Number(e.target.value) } as any)}
              inputProps={{ min: 0, step: 1 }}
              sx={{ "& input": { fontSize: 12 }, width: "100%" }}
            />
          </Box>
        ))}
      </Box>

      <Divider sx={{ borderColor: "#333", mb: 1.5 }} />

      {/* Type-specific props */}
      {(element.type === "text") && (
        <>
          {field("Content",
            <TextField size="small" multiline rows={2} value={element.content}
              onChange={(e) => upd({ content: e.target.value } as any)}
              sx={{ "& textarea": { fontSize: 12 } }} />
          )}
          {field("Font Size",
            <TextField size="small" type="number" value={element.fontSize}
              onChange={(e) => upd({ fontSize: Number(e.target.value) } as any)}
              inputProps={{ min: 6, max: 72 }} sx={{ "& input": { fontSize: 12 } }} />
          )}
          {field("Font Weight",
            <Select size="small" value={element.fontWeight} onChange={(e) => upd({ fontWeight: e.target.value as any })}>
              <MenuItem value="normal">Normal</MenuItem>
              <MenuItem value="bold">Bold</MenuItem>
            </Select>
          )}
          {field("Font Style",
            <Select size="small" value={element.fontStyle} onChange={(e) => upd({ fontStyle: e.target.value as any })}>
              <MenuItem value="normal">Normal</MenuItem>
              <MenuItem value="italic">Italic</MenuItem>
            </Select>
          )}
          {field("Text Align",
            <Select size="small" value={element.textAlign} onChange={(e) => upd({ textAlign: e.target.value as any })}>
              <MenuItem value="left">Left</MenuItem>
              <MenuItem value="center">Center</MenuItem>
              <MenuItem value="right">Right</MenuItem>
            </Select>
          )}
          {field("Color",
            <input type="color" value={element.color}
              onChange={(e) => upd({ color: e.target.value } as any)}
              style={{ width: "100%", height: 32, border: "1px solid #444", borderRadius: 4, background: "none", cursor: "pointer" }} />
          )}
        </>
      )}

      {(element.type === "variable") && (
        <>
          {field("Variable",
            <Select size="small" value={element.variableKey}
              onChange={(e) => upd({ variableKey: e.target.value } as any)}>
              {variableGroups.map((g) => [
                <MenuItem key={g.group} disabled sx={{ fontSize: 11, color: "#888", py: 0.25 }}>{g.group}</MenuItem>,
                ...g.vars.map((v) => (
                  <MenuItem key={v.key} value={v.key} sx={{ fontSize: 12, pl: 3 }}>{v.label}</MenuItem>
                )),
              ])}
            </Select>
          )}
          {field("Font Size",
            <TextField size="small" type="number" value={element.fontSize}
              onChange={(e) => upd({ fontSize: Number(e.target.value) } as any)}
              inputProps={{ min: 6, max: 72 }} sx={{ "& input": { fontSize: 12 } }} />
          )}
          {field("Font Weight",
            <Select size="small" value={element.fontWeight} onChange={(e) => upd({ fontWeight: e.target.value as any })}>
              <MenuItem value="normal">Normal</MenuItem>
              <MenuItem value="bold">Bold</MenuItem>
            </Select>
          )}
          {field("Font Style",
            <Select size="small" value={element.fontStyle} onChange={(e) => upd({ fontStyle: e.target.value as any })}>
              <MenuItem value="normal">Normal</MenuItem>
              <MenuItem value="italic">Italic</MenuItem>
            </Select>
          )}
          {field("Text Align",
            <Select size="small" value={element.textAlign} onChange={(e) => upd({ textAlign: e.target.value as any })}>
              <MenuItem value="left">Left</MenuItem>
              <MenuItem value="center">Center</MenuItem>
              <MenuItem value="right">Right</MenuItem>
            </Select>
          )}
          {field("Color",
            <input type="color" value={element.color}
              onChange={(e) => upd({ color: e.target.value } as any)}
              style={{ width: "100%", height: 32, border: "1px solid #444", borderRadius: 4, background: "none", cursor: "pointer" }} />
          )}
        </>
      )}

      {(element.type === "line") && (
        <>
          {field("Orientation",
            <Select size="small" value={element.orientation} onChange={(e) => upd({ orientation: e.target.value as any })}>
              <MenuItem value="horizontal">Horizontal</MenuItem>
              <MenuItem value="vertical">Vertical</MenuItem>
            </Select>
          )}
          {field("Thickness (px)",
            <TextField size="small" type="number" value={element.thickness}
              onChange={(e) => upd({ thickness: Number(e.target.value) } as any)}
              inputProps={{ min: 1, max: 20 }} sx={{ "& input": { fontSize: 12 } }} />
          )}
          {field("Color",
            <input type="color" value={element.color}
              onChange={(e) => upd({ color: e.target.value } as any)}
              style={{ width: "100%", height: 32, border: "1px solid #444", borderRadius: 4, background: "none", cursor: "pointer" }} />
          )}
        </>
      )}

      {(element.type === "rectangle") && (
        <>
          {field("Border Color",
            <input type="color" value={element.borderColor}
              onChange={(e) => upd({ borderColor: e.target.value } as any)}
              style={{ width: "100%", height: 32, border: "1px solid #444", borderRadius: 4, background: "none", cursor: "pointer" }} />
          )}
          {field("Fill Color",
            <Box sx={{ display: "flex", gap: 1, alignItems: "center" }}>
              <input type="color" value={element.fillColor === "transparent" ? "#ffffff" : element.fillColor}
                onChange={(e) => upd({ fillColor: e.target.value } as any)}
                style={{ flex: 1, height: 32, border: "1px solid #444", borderRadius: 4, background: "none", cursor: "pointer" }} />
              <Button size="small" onClick={() => upd({ fillColor: "transparent" } as any)}
                sx={{ fontSize: 10, minWidth: 0, px: 1 }}>None</Button>
            </Box>
          )}
          {field("Border Width",
            <TextField size="small" type="number" value={element.borderWidth}
              onChange={(e) => upd({ borderWidth: Number(e.target.value) } as any)}
              inputProps={{ min: 0, max: 20 }} sx={{ "& input": { fontSize: 12 } }} />
          )}
          {field("Border Radius",
            <TextField size="small" type="number" value={element.borderRadius}
              onChange={(e) => upd({ borderRadius: Number(e.target.value) } as any)}
              inputProps={{ min: 0, max: 100 }} sx={{ "& input": { fontSize: 12 } }} />
          )}
          {field("Opacity",
            <Slider value={element.opacity} min={0} max={1} step={0.05}
              onChange={(_, v) => upd({ opacity: v as number } as any)}
              valueLabelDisplay="auto" size="small" />
          )}
        </>
      )}

      {(element.type === "table") && (() => {
        const te = element as TableElement;

        const updTable = (patch: Partial<TableElement>) =>
          onChange({ ...te, ...patch } as SlipElement);

        const updateCell = (ri: number, ci: number, patch: Partial<TableCell>) => {
          const newRows = te.rows.map((row, r) =>
            r === ri ? row.map((cell, c) => c === ci ? { ...cell, ...patch } : cell) : row
          );
          updTable({ rows: newRows });
        };

        const addRow = () => {
          const newRow: TableCell[] = Array.from({ length: te.cols }, () => ({
            kind: "empty" as const, textAlign: "left" as const, color: "#000000",
          }));
          updTable({ rows: [...te.rows, newRow] });
        };

        const removeRow = (ri: number) => {
          if (te.rows.length <= 1) return;
          updTable({ rows: te.rows.filter((_, r) => r !== ri) });
        };

        const addCol = () => {
          const newRows = te.rows.map((row) => [
            ...row,
            { kind: "empty" as const, textAlign: "left" as const, color: "#000000" },
          ]);
          updTable({ cols: te.cols + 1, rows: newRows });
        };

        const removeCol = () => {
          if (te.cols <= 1) return;
          const newRows = te.rows.map((row) => row.slice(0, -1));
          updTable({ cols: te.cols - 1, rows: newRows });
        };

        const CELL_KINDS: TableCell["kind"][] = ["empty", "text", "variable", "logo", "stamp", "signature"];

        return (
          <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
            {/* Table styling */}
            <Typography variant="caption" sx={{ color: "#90caf9", fontWeight: 700, fontSize: 10, mt: 0.5 }}>Table Style</Typography>

            <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1 }}>
              {field("Border Color",
                <input type="color" value={te.borderColor}
                  onChange={(e) => updTable({ borderColor: e.target.value })}
                  style={{ width: "100%", height: 28, border: "1px solid #444", borderRadius: 4, cursor: "pointer" }} />
              )}
              {field("Border Width",
                <TextField size="small" type="number" value={te.borderWidth}
                  onChange={(e) => updTable({ borderWidth: Number(e.target.value) })}
                  inputProps={{ min: 0, max: 8 }} sx={{ "& input": { fontSize: 11 } }} />
              )}
              {field("Header BG",
                <input type="color" value={te.headerBgColor}
                  onChange={(e) => updTable({ headerBgColor: e.target.value })}
                  style={{ width: "100%", height: 28, border: "1px solid #444", borderRadius: 4, cursor: "pointer" }} />
              )}
              {field("Header Text",
                <input type="color" value={te.headerTextColor}
                  onChange={(e) => updTable({ headerTextColor: e.target.value })}
                  style={{ width: "100%", height: 28, border: "1px solid #444", borderRadius: 4, cursor: "pointer" }} />
              )}
              {field("Row Height",
                <TextField size="small" type="number" value={te.rowHeight}
                  onChange={(e) => updTable({ rowHeight: Number(e.target.value) })}
                  inputProps={{ min: 14, max: 80 }} sx={{ "& input": { fontSize: 11 } }} />
              )}
              {field("Font Size",
                <TextField size="small" type="number" value={te.fontSize}
                  onChange={(e) => updTable({ fontSize: Number(e.target.value) })}
                  inputProps={{ min: 6, max: 24 }} sx={{ "& input": { fontSize: 11 } }} />
              )}
            </Box>

            <FormControlLabel control={
              <Switch size="small" checked={te.hasHeaderRow}
                onChange={(e) => updTable({ hasHeaderRow: e.target.checked })} />
            } label={<Typography variant="caption">Header row</Typography>} />

            <FormControlLabel control={
              <Switch size="small" checked={te.alternateRowColor}
                onChange={(e) => updTable({ alternateRowColor: e.target.checked })} />
            } label={<Typography variant="caption">Alternating rows</Typography>} />

            <Divider sx={{ borderColor: "#333", my: 0.5 }} />

            {/* Row / col controls */}
            <Typography variant="caption" sx={{ color: "#90caf9", fontWeight: 700, fontSize: 10 }}>Grid ({te.cols} cols × {te.rows.length} rows)</Typography>
            <Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap" }}>
              <Button size="small" variant="outlined" onClick={addRow}
                sx={{ fontSize: 10, py: 0.25, borderColor: "#444", color: "#aaa" }}>+ Row</Button>
              <Button size="small" variant="outlined" onClick={() => removeRow(te.rows.length - 1)}
                disabled={te.rows.length <= 1}
                sx={{ fontSize: 10, py: 0.25, borderColor: "#444", color: "#f44336" }}>− Row</Button>
              <Button size="small" variant="outlined" onClick={addCol}
                sx={{ fontSize: 10, py: 0.25, borderColor: "#444", color: "#aaa" }}>+ Col</Button>
              <Button size="small" variant="outlined" onClick={removeCol}
                disabled={te.cols <= 1}
                sx={{ fontSize: 10, py: 0.25, borderColor: "#444", color: "#f44336" }}>− Col</Button>
            </Box>

            <Divider sx={{ borderColor: "#333", my: 0.5 }} />

            {/* Cell editor grid */}
            <Typography variant="caption" sx={{ color: "#90caf9", fontWeight: 700, fontSize: 10 }}>Cells — click to edit</Typography>
            <Box sx={{ overflowX: "auto" }}>
              <Box sx={{ display: "inline-flex", flexDirection: "column", gap: "1px", border: `1px solid ${te.borderColor}` }}>
                {te.rows.map((row, ri) => {
                  const isHeader = te.hasHeaderRow && ri === 0;
                  return (
                    <Box key={ri} sx={{ display: "flex", gap: "1px" }}>
                      {row.map((cell, ci) => (
                        <CellEditor
                          key={ci}
                          cell={cell}
                          isHeader={isHeader}
                          headerBg={te.headerBgColor}
                          onChange={(patch) => updateCell(ri, ci, patch)}
                        />
                      ))}
                      <IconButton size="small" onClick={() => removeRow(ri)}
                        sx={{ color: "#f44336", opacity: 0.5, "&:hover": { opacity: 1 }, p: 0.25 }}>
                        <Delete sx={{ fontSize: 12 }} />
                      </IconButton>
                    </Box>
                  );
                })}
              </Box>
            </Box>
          </Box>
        );
      })()}

      {(element.type === "logo" || element.type === "stamp" || element.type === "signature") && (
        <Box sx={{ p: 1.5, backgroundColor: "#1a2a3a", border: "1px solid #2196f3", borderRadius: 1, mb: 1 }}>
          <Typography variant="caption" sx={{ color: "#90caf9", fontSize: 11 }}>
            {element.type === "logo" && "Company logo — auto-resolved from manager profile at print time."}
            {element.type === "stamp" && "Manager stamp — auto-resolved from manager profile at print time."}
            {element.type === "signature" && "Manager signature — auto-resolved from manager profile at print time."}
          </Typography>
        </Box>
      )}

      <Divider sx={{ borderColor: "#333", my: 1 }} />

      {/* Z-order */}
      <Typography variant="caption" sx={{ color: "#888", mb: 0.5, fontSize: 10 }}>Layer Order</Typography>
      <Box sx={{ display: "flex", gap: 0.5, mb: 2, flexWrap: "wrap" }}>
        <Tooltip title="Bring to Front">
          <IconButton size="small" onClick={onBringFront} sx={{ color: "#aaa", border: "1px solid #444", borderRadius: 1 }}>
            <ArrowUpward fontSize="small" />
          </IconButton>
        </Tooltip>
        <Tooltip title="Bring Forward">
          <IconButton size="small" onClick={onBringForward} sx={{ color: "#aaa", border: "1px solid #444", borderRadius: 1 }}>
            <KeyboardArrowUp fontSize="small" />
          </IconButton>
        </Tooltip>
        <Tooltip title="Send Backward">
          <IconButton size="small" onClick={onSendBackward} sx={{ color: "#aaa", border: "1px solid #444", borderRadius: 1 }}>
            <KeyboardArrowDown fontSize="small" />
          </IconButton>
        </Tooltip>
        <Tooltip title="Send to Back">
          <IconButton size="small" onClick={onSendBack} sx={{ color: "#aaa", border: "1px solid #444", borderRadius: 1 }}>
            <ArrowDownward fontSize="small" />
          </IconButton>
        </Tooltip>
      </Box>

      {/* Actions */}
      <Box sx={{ display: "flex", gap: 1 }}>
        <Button size="small" startIcon={<ContentCopy sx={{ fontSize: 14 }} />} onClick={onDuplicate}
          sx={{ flex: 1, fontSize: 11, borderColor: "#555", color: "#aaa" }} variant="outlined">
          Duplicate
        </Button>
        <Button size="small" startIcon={<Delete sx={{ fontSize: 14 }} />} onClick={onDelete}
          sx={{ flex: 1, fontSize: 11 }} color="error" variant="outlined">
          Delete
        </Button>
      </Box>
    </Box>
  );
}

// ─── Canvas Element Renderer ──────────────────────────────────────────────────

function renderElementContent(el: SlipElement, variableGroups: SlipVariableGroup[]) {
  switch (el.type) {
    case "text":
      return (
        <Box sx={{
          width: "100%", height: "100%", overflow: "hidden",
          display: "flex", alignItems: "center",
          pointerEvents: "none",
          justifyContent: el.textAlign === "center" ? "center" : el.textAlign === "right" ? "flex-end" : "flex-start",
        }}>
          <Typography sx={{
            fontSize: el.fontSize, fontWeight: el.fontWeight, fontStyle: el.fontStyle,
            color: el.color, lineHeight: 1.3, userSelect: "none", whiteSpace: "pre-wrap",
            pointerEvents: "none",
          }}>
            {el.content}
          </Typography>
        </Box>
      );

    case "variable":
      return (
        <Box sx={{
          width: "100%", height: "100%", overflow: "hidden",
          display: "flex", alignItems: "center",
          pointerEvents: "none",
          justifyContent: el.textAlign === "center" ? "center" : el.textAlign === "right" ? "flex-end" : "flex-start",
          borderBottom: "1px dashed #aaa",
        }}>
          <Typography sx={{
            fontSize: el.fontSize, fontWeight: el.fontWeight, fontStyle: el.fontStyle,
            color: el.color, lineHeight: 1.3, userSelect: "none",
            pointerEvents: "none",
          }}>
            {`{{ ${getVariableLabel(el.variableKey, variableGroups)} }}`}
          </Typography>
        </Box>
      );

    case "line":
      return (
        <Box sx={{
          width: "100%", height: "100%",
          display: "flex", alignItems: "center", justifyContent: "center",
          pointerEvents: "none",
        }}>
          {el.orientation === "horizontal"
            ? <Box sx={{ width: "100%", height: el.thickness, backgroundColor: el.color, pointerEvents: "none" }} />
            : <Box sx={{ height: "100%", width: el.thickness, backgroundColor: el.color, pointerEvents: "none" }} />
          }
        </Box>
      );

    case "rectangle":
      return (
        <Box sx={{
          width: "100%", height: "100%",
          border: `${el.borderWidth}px solid ${el.borderColor}`,
          borderRadius: el.borderRadius,
          backgroundColor: el.fillColor === "transparent" ? "transparent" : el.fillColor,
          opacity: el.opacity,
          pointerEvents: "none",
        }} />
      );

    case "logo":
      return (
        <Box sx={{
          width: "100%", height: "100%",
          display: "flex", alignItems: "center", justifyContent: "center",
          backgroundColor: "#e3f2fd", border: "1px dashed #2196f3", borderRadius: 1,
          pointerEvents: "none",
        }}>
          <Box sx={{ textAlign: "center", pointerEvents: "none" }}>
            <ImageIcon sx={{ color: "#2196f3", fontSize: 24 }} />
            <Typography variant="caption" sx={{ display: "block", color: "#2196f3", fontSize: 10 }}>Logo</Typography>
          </Box>
        </Box>
      );

    case "stamp":
      return (
        <Box sx={{
          width: "100%", height: "100%",
          display: "flex", alignItems: "center", justifyContent: "center",
          backgroundColor: "#fce4ec", border: "1px dashed #e91e63", borderRadius: "50%",
          pointerEvents: "none",
        }}>
          <Box sx={{ textAlign: "center", pointerEvents: "none" }}>
            <Brush sx={{ color: "#e91e63", fontSize: 24 }} />
            <Typography variant="caption" sx={{ display: "block", color: "#e91e63", fontSize: 10 }}>Stamp</Typography>
          </Box>
        </Box>
      );

    case "signature":
      return (
        <Box sx={{
          width: "100%", height: "100%",
          display: "flex", alignItems: "flex-end", justifyContent: "center",
          borderBottom: "2px solid #ff5722", backgroundColor: "#fff3e0",
          pointerEvents: "none",
        }}>
          <Typography variant="caption" sx={{ color: "#ff5722", fontSize: 10, mb: 0.5, pointerEvents: "none" }}>Signature</Typography>
        </Box>
      );

    case "table": {
      const colW = el.width / el.cols;
      return (
        <Box sx={{ width: "100%", height: "100%", overflow: "hidden", pointerEvents: "none", border: `${el.borderWidth}px solid ${el.borderColor}`, boxSizing: "border-box" }}>
          {el.rows.map((rawRow, ri) => {
            // Guard against legacy/malformed rows that were persisted as objects
            // (e.g. `{ ...cells }`) instead of arrays — normalise to an array.
            const row: TableCell[] = Array.isArray(rawRow) ? rawRow : (Object.values(rawRow ?? {}) as TableCell[]);
            const isHeader = el.hasHeaderRow && ri === 0;
            const isAlt = el.alternateRowColor && !isHeader && ri % 2 === 0;
            return (
              <Box key={ri} sx={{ display: "flex", height: el.rowHeight, backgroundColor: isHeader ? el.headerBgColor : isAlt ? "rgba(0,0,0,0.04)" : "transparent" }}>
                {row.map((cell, ci) => (
                  <Box key={ci} sx={{
                    width: colW * (cell.colSpan ?? 1),
                    height: "100%",
                    borderRight: ci < row.length - 1 ? `${el.borderWidth}px solid ${el.borderColor}` : "none",
                    borderBottom: ri < el.rows.length - 1 ? `${el.borderWidth}px solid ${el.borderColor}` : "none",
                    display: "flex", alignItems: "center",
                    justifyContent: cell.textAlign === "center" ? "center" : cell.textAlign === "right" ? "flex-end" : "flex-start",
                    px: 0.75, overflow: "hidden", boxSizing: "border-box", pointerEvents: "none",
                  }}>
                    {cell.kind === "variable" && (
                      <Typography noWrap sx={{ fontSize: el.fontSize, fontWeight: cell.fontWeight ?? (isHeader ? "bold" : "normal"), fontStyle: cell.fontStyle ?? "normal", color: cell.color ?? (isHeader ? el.headerTextColor : "#000"), pointerEvents: "none", lineHeight: 1 }}>
                        {`{${getVariableLabel(cell.variableKey ?? "", variableGroups)}}`}
                      </Typography>
                    )}
                    {cell.kind === "text" && (
                      <Typography noWrap sx={{ fontSize: el.fontSize, fontWeight: cell.fontWeight ?? (isHeader ? "bold" : "normal"), fontStyle: cell.fontStyle ?? "normal", color: cell.color ?? (isHeader ? el.headerTextColor : "#000"), pointerEvents: "none", lineHeight: 1 }}>
                        {cell.text ?? ""}
                      </Typography>
                    )}
                    {cell.kind === "logo" && (
                      <Box sx={{ fontSize: 9, color: "#2196f3", fontStyle: "italic", pointerEvents: "none" }}>Logo</Box>
                    )}
                    {cell.kind === "stamp" && (
                      <Box sx={{ fontSize: 9, color: "#e91e63", fontStyle: "italic", pointerEvents: "none" }}>Stamp</Box>
                    )}
                    {cell.kind === "signature" && (
                      <Box sx={{ fontSize: 9, color: "#ff5722", fontStyle: "italic", pointerEvents: "none" }}>Signature</Box>
                    )}
                  </Box>
                ))}
              </Box>
            );
          })}
        </Box>
      );
    }

    default:
      return null;
  }
}

// ─── Main Canvas Component ────────────────────────────────────────────────────

export default function SlipTemplateCanvas({ template, managers, onSave, onBack }: Props) {
  const { currentUser } = useAuth();

  const [elements, setElements] = useState<SlipElement[]>(template.elements ?? []);
  const [templateName, setTemplateName] = useState(template.name);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [zoom, setZoom] = useState(0.75);
  const [saving, setSaving] = useState(false);

  // Width of the right-hand properties panel (px). User-resizable via the
  // draggable divider on its left edge — like the inspector panel in other
  // design software.
  const [panelWidth, setPanelWidth] = useState(240);
  const panelResizeRef = useRef<{ startX: number; startW: number } | null>(null);

  // Internal template id tracking for saves
  const [savedId, setSavedId] = useState(template.id);

  // Salary structure templates for this company — the slip variable list is
  // generated dynamically from them (instead of a hardcoded registry).
  const [salaryTemplates, setSalaryTemplates] = useState<SalaryTemplate[]>([]);

  useEffect(() => {
    const companyId = currentUser?.uid;
    if (!companyId) return;
    salaryTemplateService
      .getAll(companyId)
      .then(setSalaryTemplates)
      .catch(console.error);
  }, [currentUser?.uid]);

  // Dynamic variable groups = structure variables + fixed extras
  const variableGroups = useMemo(
    () => buildSlipVariableGroups(salaryTemplates),
    [salaryTemplates],
  );

  const canvasRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const resizeRef = useRef<ResizeState | null>(null);
  const isDraggingRef = useRef(false);
  const isResizingRef = useRef(false);

  const selectedElement = elements.find((e) => e.id === selectedId) ?? null;

  // ── Add element at canvas centre ───────────────────────────────────────────

  const addElement = useCallback((type: SlipElement["type"]) => {
    const cx = DEFAULT_CANVAS_WIDTH / 2 - 100;
    const cy = DEFAULT_CANVAS_HEIGHT / 2 - 30;
    let el: SlipElement;
    switch (type) {
      case "text":      el = defaultText(cx, cy);      break;
      case "variable":  el = defaultVariable(cx, cy);  break;
      case "line":      el = defaultLine(cx, cy);       break;
      case "rectangle": el = defaultRect(cx, cy);       break;
      case "logo":      el = defaultLogo(cx, cy);       break;
      case "stamp":     el = defaultStamp(cx, cy);      break;
      case "signature": el = defaultSignature(cx, cy);  break;
      case "table":     el = defaultTable(cx, cy);      break;
      default: return;
    }
    // Place on top of existing z-order
    el.zIndex = elements.length > 0 ? Math.max(...elements.map((e) => e.zIndex)) + 1 : 1;
    setElements((prev) => [...prev, el]);
    setSelectedId(el.id);
  }, [elements]);

  // ── Update element ─────────────────────────────────────────────────────────

  const updateElement = useCallback((updated: SlipElement) => {
    setElements((prev) => prev.map((e) => e.id === updated.id ? updated : e));
  }, []);

  // ── Delete element ─────────────────────────────────────────────────────────

  const deleteElement = useCallback((id: string) => {
    setElements((prev) => prev.filter((e) => e.id !== id));
    setSelectedId(null);
  }, []);

  // ── Duplicate element ──────────────────────────────────────────────────────

  const duplicateElement = useCallback((id: string) => {
    const el = elements.find((e) => e.id === id);
    if (!el) return;
    const copy = { ...el, id: genId(), x: el.x + 16, y: el.y + 16, zIndex: Math.max(...elements.map((e) => e.zIndex)) + 1 };
    setElements((prev) => [...prev, copy]);
    setSelectedId(copy.id);
  }, [elements]);

  // ── Z-order helpers ────────────────────────────────────────────────────────

  const bringForward = useCallback((id: string) => {
    setElements((prev) => {
      const sorted = [...prev].sort((a, b) => a.zIndex - b.zIndex);
      const idx = sorted.findIndex((e) => e.id === id);
      if (idx < sorted.length - 1) {
        const next = sorted[idx + 1];
        const cur = sorted[idx];
        const tmp = cur.zIndex;
        cur.zIndex = next.zIndex;
        next.zIndex = tmp;
      }
      return [...sorted];
    });
  }, []);

  const sendBackward = useCallback((id: string) => {
    setElements((prev) => {
      const sorted = [...prev].sort((a, b) => a.zIndex - b.zIndex);
      const idx = sorted.findIndex((e) => e.id === id);
      if (idx > 0) {
        const prev2 = sorted[idx - 1];
        const cur = sorted[idx];
        const tmp = cur.zIndex;
        cur.zIndex = prev2.zIndex;
        prev2.zIndex = tmp;
      }
      return [...sorted];
    });
  }, []);

  const bringFront = useCallback((id: string) => {
    const max = Math.max(...elements.map((e) => e.zIndex));
    setElements((prev) => prev.map((e) => e.id === id ? { ...e, zIndex: max + 1 } : e));
  }, [elements]);

  const sendBack = useCallback((id: string) => {
    const min = Math.min(...elements.map((e) => e.zIndex));
    setElements((prev) => prev.map((e) => e.id === id ? { ...e, zIndex: min - 1 } : e));
  }, [elements]);

  // ── Mouse drag handlers ────────────────────────────────────────────────────
  // Drag threshold: must move >4px before we commit to dragging.
  // This ensures a plain click always selects the element and shows the
  // properties panel without accidentally starting a drag.
  const DRAG_THRESHOLD = 4;

  const handleElementMouseDown = useCallback((e: React.MouseEvent, id: string) => {
    // Only respond to left button
    if (e.button !== 0) return;
    e.stopPropagation();
    // Select immediately on mousedown — properties panel appears right away
    setSelectedId(id);
    const el = elements.find((el2) => el2.id === id);
    if (!el) return;
    isDraggingRef.current = false;
    dragRef.current = {
      elementId: id,
      startMouseX: e.clientX,
      startMouseY: e.clientY,
      startElemX: el.x,
      startElemY: el.y,
    };
  }, [elements]);

  const handleResizeMouseDown = useCallback((e: React.MouseEvent, id: string, handle: "se" | "e" | "s") => {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    const el = elements.find((el2) => el2.id === id);
    if (!el) return;
    isResizingRef.current = false;
    resizeRef.current = {
      elementId: id,
      handle,
      startMouseX: e.clientX,
      startMouseY: e.clientY,
      startW: el.width,
      startH: el.height,
    };
  }, [elements]);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      // ── Drag ──────────────────────────────────────────────────────────────
      if (dragRef.current) {
        const { elementId, startMouseX, startMouseY, startElemX, startElemY } = dragRef.current;
        const rawDx = e.clientX - startMouseX;
        const rawDy = e.clientY - startMouseY;
        // Only start moving after threshold is crossed
        if (!isDraggingRef.current) {
          if (Math.abs(rawDx) < DRAG_THRESHOLD && Math.abs(rawDy) < DRAG_THRESHOLD) return;
          isDraggingRef.current = true;
        }
        const dx = rawDx / zoom;
        const dy = rawDy / zoom;
        setElements((prev) => prev.map((el) =>
          el.id === elementId
            ? { ...el, x: Math.round(startElemX + dx), y: Math.round(startElemY + dy) }
            : el
        ));
      }
      // ── Resize ────────────────────────────────────────────────────────────
      if (resizeRef.current) {
        const { elementId, handle, startMouseX, startMouseY, startW, startH } = resizeRef.current;
        const rawDx = e.clientX - startMouseX;
        const rawDy = e.clientY - startMouseY;
        if (!isResizingRef.current) {
          if (Math.abs(rawDx) < DRAG_THRESHOLD && Math.abs(rawDy) < DRAG_THRESHOLD) return;
          isResizingRef.current = true;
        }
        const dx = rawDx / zoom;
        const dy = rawDy / zoom;
        setElements((prev) => prev.map((el) => {
          if (el.id !== elementId) return el;
          let w = startW, h = startH;
          if (handle === "se" || handle === "e") w = Math.max(20, Math.round(startW + dx));
          if (handle === "se" || handle === "s") h = Math.max(10, Math.round(startH + dy));
          return { ...el, width: w, height: h };
        }));
      }
    };
    const onUp = () => {
      dragRef.current = null;
      resizeRef.current = null;
      isDraggingRef.current = false;
      isResizingRef.current = false;
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [zoom]);

  // ── Properties panel resize ─────────────────────────────────────────────────

  const handlePanelResizeMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    panelResizeRef.current = { startX: e.clientX, startW: panelWidth };
  }, [panelWidth]);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!panelResizeRef.current) return;
      const { startX, startW } = panelResizeRef.current;
      // Dragging left (negative dx) widens the panel, dragging right narrows it.
      const next = startW - (e.clientX - startX);
      setPanelWidth(Math.max(200, Math.min(640, next)));
    };
    const onUp = () => { panelResizeRef.current = null; };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, []);

  // ── Keyboard delete ────────────────────────────────────────────────────────

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.key === "Delete" || e.key === "Backspace") &&
          selectedId &&
          !(e.target instanceof HTMLInputElement) &&
          !(e.target instanceof HTMLTextAreaElement)) {
        deleteElement(selectedId);
      }
      if (e.key === "Escape") setSelectedId(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedId, deleteElement]);

  // ── Save ───────────────────────────────────────────────────────────────────

  const handleSave = async () => {
    setSaving(true);
    try {
      const toSave: SlipTemplate = {
        ...template,
        id: savedId,
        name: templateName,
        elements,
        canvasWidth: DEFAULT_CANVAS_WIDTH,
        canvasHeight: DEFAULT_CANVAS_HEIGHT,
      };
      await onSave(toSave);
    } finally {
      setSaving(false);
    }
  };

  // ── Sorted elements for rendering ──────────────────────────────────────────

  const sorted = useMemo(() => [...elements].sort((a, b) => a.zIndex - b.zIndex), [elements]);

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <VariableGroupsContext.Provider value={variableGroups}>
    <Box sx={{ display: "flex", flexDirection: "column", height: "calc(100vh - 130px)", minHeight: 600 }}>
      {/* Top toolbar */}
      <Paper sx={{ px: 2, py: 1, mb: 1, display: "flex", alignItems: "center", gap: 2, flexWrap: "wrap", backgroundColor: "#1e1e1e", border: "1px solid #333" }}>
        <TextField
          size="small" label="Template Name" value={templateName}
          onChange={(e) => setTemplateName(e.target.value)}
          sx={{ minWidth: 220, "& input": { fontSize: 13 } }}
        />
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, ml: "auto" }}>
          <Tooltip title="Zoom out"><IconButton size="small" onClick={() => setZoom((z) => Math.max(0.3, z - 0.1))}><ZoomOut /></IconButton></Tooltip>
          <Chip label={`${Math.round(zoom * 100)}%`} size="small" sx={{ minWidth: 52, fontSize: 12 }} />
          <Tooltip title="Zoom in"><IconButton size="small" onClick={() => setZoom((z) => Math.min(2, z + 0.1))}><ZoomIn /></IconButton></Tooltip>
          <Tooltip title="Fit"><IconButton size="small" onClick={() => setZoom(0.75)}><FitScreen /></IconButton></Tooltip>
        </Box>
        <Button
          variant="contained" startIcon={saving ? <CircularProgress size={16} color="inherit" /> : <Save />}
          onClick={handleSave} disabled={saving}
          sx={{ backgroundColor: "#4caf50", "&:hover": { backgroundColor: "#388e3c" } }}
        >
          Save
        </Button>
      </Paper>

      {/* Three-column layout */}
      <Box sx={{ display: "flex", flex: 1, gap: 0, overflow: "hidden", border: "1px solid #333", borderRadius: 1 }}>
        {/* Left: element palette */}
        <Box sx={{ width: 150, flexShrink: 0, p: 1.5, overflowY: "auto", borderRight: "1px solid #333", backgroundColor: "#1a1a1a" }}>
          <ElementPalette scope={template.scope} onAdd={addElement} />
        </Box>

        {/* Centre: canvas */}
        <Box
          sx={{ flex: 1, overflow: "auto", backgroundColor: "#2a2a2a", display: "flex", justifyContent: "center", alignItems: "flex-start", p: 3 }}
        >
          <Box
            ref={canvasRef}
            onMouseDown={(e) => {
              // Only deselect when clicking directly on the blank canvas, not on an element
              if (e.target === e.currentTarget) setSelectedId(null);
            }}
            sx={{
              position: "relative",
              width: DEFAULT_CANVAS_WIDTH,
              height: DEFAULT_CANVAS_HEIGHT,
              backgroundColor: "#ffffff",
              transform: `scale(${zoom})`,
              transformOrigin: "top center",
              flexShrink: 0,
              boxShadow: "0 4px 20px rgba(0,0,0,0.6)",
              mb: `${DEFAULT_CANVAS_HEIGHT * (zoom - 1)}px`,
            }}
          >
            {sorted.map((el) => {
              const isSelected = el.id === selectedId;
              return (
                <Box
                  key={el.id}
                  onMouseDown={(e) => handleElementMouseDown(e, el.id)}
                  sx={{
                    position: "absolute",
                    left: el.x, top: el.y,
                    width: el.width, height: el.height,
                    zIndex: el.zIndex,
                    cursor: "move",
                    outline: isSelected ? "2px solid #2196f3" : "1px dashed transparent",
                    outlineOffset: 1,
                    "&:hover": { outline: isSelected ? "2px solid #2196f3" : "1px dashed #90caf9" },
                    boxSizing: "border-box",
                  }}
                >
                  {renderElementContent(el, variableGroups)}

                  {/* Resize handles — only when selected */}
                  {isSelected && (
                    <>
                      {/* SE corner */}
                      <Box onMouseDown={(e) => handleResizeMouseDown(e, el.id, "se")}
                        sx={{ position: "absolute", right: -5, bottom: -5, width: 10, height: 10, backgroundColor: "#2196f3", cursor: "se-resize", zIndex: 100 }} />
                      {/* E edge */}
                      <Box onMouseDown={(e) => handleResizeMouseDown(e, el.id, "e")}
                        sx={{ position: "absolute", right: -4, top: "50%", width: 8, height: 8, backgroundColor: "#2196f3", cursor: "e-resize", transform: "translateY(-50%)", zIndex: 100 }} />
                      {/* S edge */}
                      <Box onMouseDown={(e) => handleResizeMouseDown(e, el.id, "s")}
                        sx={{ position: "absolute", bottom: -4, left: "50%", width: 8, height: 8, backgroundColor: "#2196f3", cursor: "s-resize", transform: "translateX(-50%)", zIndex: 100 }} />
                    </>
                  )}
                </Box>
              );
            })}

            {/* Empty canvas hint */}
            {elements.length === 0 && (
              <Box sx={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>
                <Typography sx={{ color: "#ccc", fontSize: 14 }}>Click an element in the left panel to add it</Typography>
              </Box>
            )}
          </Box>
        </Box>

        {/* Draggable divider to resize the properties panel */}
        <Box
          onMouseDown={handlePanelResizeMouseDown}
          sx={{
            width: 6,
            flexShrink: 0,
            cursor: "col-resize",
            backgroundColor: "#333",
            "&:hover": { backgroundColor: "#2196f3" },
            "&:active": { backgroundColor: "#2196f3" },
          }}
        />

        {/* Right: properties panel */}
        <Box sx={{ width: panelWidth, flexShrink: 0, p: 1.5, overflowY: "auto", borderLeft: "1px solid #333", backgroundColor: "#1a1a1a", display: "flex", flexDirection: "column" }}>
          {selectedElement ? (
            <PropertiesPanel
              element={selectedElement}
              onChange={updateElement}
              onDelete={() => deleteElement(selectedElement.id)}
              onDuplicate={() => duplicateElement(selectedElement.id)}
              onBringForward={() => bringForward(selectedElement.id)}
              onSendBackward={() => sendBackward(selectedElement.id)}
              onBringFront={() => bringFront(selectedElement.id)}
              onSendBack={() => sendBack(selectedElement.id)}
            />
          ) : (
            <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", flex: 1, color: "#555" }}>
              <Typography variant="caption" sx={{ textAlign: "center" }}>
                Select an element on the canvas to edit its properties
              </Typography>
            </Box>
          )}
        </Box>
      </Box>
    </Box>
    </VariableGroupsContext.Provider>
  );
}
