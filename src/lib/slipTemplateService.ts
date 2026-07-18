import {
  collection,
  doc,
  getDocs,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
} from "firebase/firestore";
import { db } from "@/lib/firebase";

// ─── Element Types ────────────────────────────────────────────────────────────

export interface SlipElementBase {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  zIndex: number;
}

export interface TextElement extends SlipElementBase {
  type: "text";
  content: string;
  fontSize: number;
  fontWeight: "normal" | "bold";
  fontStyle: "normal" | "italic";
  color: string;
  textAlign: "left" | "center" | "right";
}

export interface VariableElement extends SlipElementBase {
  type: "variable";
  variableKey: string;
  fontSize: number;
  fontWeight: "normal" | "bold";
  fontStyle: "normal" | "italic";
  color: string;
  textAlign: "left" | "center" | "right";
}

export interface LineElement extends SlipElementBase {
  type: "line";
  orientation: "horizontal" | "vertical";
  thickness: number;
  color: string;
}

export interface RectElement extends SlipElementBase {
  type: "rectangle";
  borderColor: string;
  fillColor: string;
  borderRadius: number;
  opacity: number;
  borderWidth: number;
}

export interface LogoElement extends SlipElementBase {
  type: "logo";
}

export interface StampElement extends SlipElementBase {
  type: "stamp";
}

export interface SignatureElement extends SlipElementBase {
  type: "signature";
}

export interface TableCell {
  /** What this cell displays */
  kind: "variable" | "text" | "logo" | "stamp" | "signature" | "empty";
  /** For kind=variable: the variable key */
  variableKey?: string;
  /** For kind=text: static label */
  text?: string;
  /** How many columns this cell spans */
  colSpan?: number;
  fontWeight?: "normal" | "bold";
  fontStyle?: "normal" | "italic";
  textAlign?: "left" | "center" | "right";
  color?: string;
  /**
   * Per-cell border overrides (Excel-style). When omitted, the table's default
   * grid borders are drawn (right border except last column, bottom border
   * except last row). When present, exactly the enabled sides are drawn for
   * this cell, letting the user control individual walls (e.g. only a right
   * wall).
   */
  borders?: {
    top?: boolean;
    right?: boolean;
    bottom?: boolean;
    left?: boolean;
  };
}

export interface TableElement extends SlipElementBase {
  type: "table";
  /** Number of columns */
  cols: number;
  /** Rows: each row is an array of cells (length === cols) */
  rows: TableCell[][];
  /** First row is a styled header */
  hasHeaderRow: boolean;
  /** Alternating row background */
  alternateRowColor: boolean;
  /** Border color for all cell borders */
  borderColor: string;
  /** Border thickness */
  borderWidth: number;
  /** Header background color */
  headerBgColor: string;
  /** Header text color */
  headerTextColor: string;
  /** Row height in px (used as the uniform height when autoLayout is true) */
  rowHeight: number;
  /** Font size for body cells */
  fontSize: number;
  /**
   * Layout mode. When true (default when undefined), all columns share an equal
   * width (table width / cols) and every row uses `rowHeight`. When false, the
   * per-column `columnWidths` and per-row `rowHeights` are used so the user can
   * size each column/row manually instead of the automatic fit.
   */
  autoLayout?: boolean;
  /** Manual per-column widths in px (used when autoLayout === false) */
  columnWidths?: number[];
  /** Manual per-row heights in px (used when autoLayout === false) */
  rowHeights?: number[];
}

export type SlipElement =
  | TextElement
  | VariableElement
  | LineElement
  | RectElement
  | LogoElement
  | StampElement
  | SignatureElement
  | TableElement;

// ─── Table layout helpers ─────────────────────────────────────────────────────
// Shared by the designer canvas, the on-screen slip preview and the PDF export
// so column widths, row heights and per-cell borders are always computed the
// same way.

/** Effective width (px) of each column, honoring manual sizing when autoLayout is off. */
export function tableColumnWidths(te: TableElement): number[] {
  const auto = te.autoLayout !== false;
  const equal = te.width / Math.max(1, te.cols);
  return Array.from({ length: te.cols }, (_, i) =>
    auto ? equal : (te.columnWidths?.[i] ?? equal),
  );
}

/** Effective height (px) of a given row, honoring manual sizing when autoLayout is off. */
export function tableRowHeightAt(te: TableElement, ri: number): number {
  const auto = te.autoLayout !== false;
  return auto ? te.rowHeight : (te.rowHeights?.[ri] ?? te.rowHeight);
}

/**
 * Which of the 4 walls of a cell should be drawn. When the cell defines an
 * explicit `borders` override, exactly those sides are used; otherwise the
 * default grid (right except last column, bottom except last row) applies.
 */
export function tableCellSides(
  te: TableElement,
  cell: TableCell,
  ri: number,
  ci: number,
  rowLen: number,
): { top: boolean; right: boolean; bottom: boolean; left: boolean } {
  const b = cell.borders;
  if (b) {
    return { top: !!b.top, right: !!b.right, bottom: !!b.bottom, left: !!b.left };
  }
  return {
    top: false,
    right: ci < rowLen - 1,
    bottom: ri < te.rows.length - 1,
    left: false,
  };
}

// ─── Template ─────────────────────────────────────────────────────────────────

export interface SlipTemplate {
  id: string;
  name: string;
  companyId: string;
  scope: "global" | "manager";
  /** null for global templates */
  managerId: string | null;
  canvasWidth: number;
  canvasHeight: number;
  elements: SlipElement[];
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
}

// ─── Default canvas dimensions (A4 portrait @ 96 dpi) ────────────────────────
export const DEFAULT_CANVAS_WIDTH = 794;
export const DEFAULT_CANVAS_HEIGHT = 1123;

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Recursively remove `undefined` values from an object/array so Firestore
 * doesn't reject the write. Firestore throws
 * "Unsupported field value: undefined" for any nested `undefined`, which is a
 * common cause of "Failed to save template" — table cells and elements often
 * carry optional fields (variableKey, text, colSpan, fontStyle, …) left unset.
 */
export function stripUndefined<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((v) => stripUndefined(v)) as unknown as T;
  }
  if (value !== null && typeof value === "object" && !(value instanceof Date)) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (v === undefined) continue;
      out[k] = stripUndefined(v);
    }
    return out as T;
  }
  return value;
}

/**
 * Firestore does NOT support nested arrays (an array whose elements are also
 * arrays). A table element stores `rows: TableCell[][]` — an array of arrays —
 * which triggers "Nested arrays are not supported" on save. To work around
 * this, we wrap each row in an object (`{ cells: TableCell[] }`) before writing,
 * so the persisted shape is an array of maps (allowed) rather than an array of
 * arrays.
 */
export function serializeElements(elements: SlipElement[]): SlipElement[] {
  return elements.map((el) => {
    if (el.type === "table" && Array.isArray(el.rows)) {
      return {
        ...el,
        rows: el.rows.map((row) => ({
          cells: Array.isArray(row) ? row : Object.values(row ?? {}),
        })),
      } as unknown as SlipElement;
    }
    return el;
  });
}

/**
 * Inverse of {@link serializeElements}: unwrap `{ cells: [...] }` rows back into
 * `TableCell[][]` when reading a template from Firestore. Also tolerates legacy
 * documents where rows were stored directly as arrays or as objects.
 */
export function deserializeElements(elements: SlipElement[] | undefined): SlipElement[] {
  if (!Array.isArray(elements)) return [];
  return elements.map((el) => {
    if (el && el.type === "table" && Array.isArray(el.rows)) {
      return {
        ...el,
        rows: el.rows.map((row: unknown) => {
          if (Array.isArray(row)) return row;
          if (row && typeof row === "object" && "cells" in row) {
            const cells = (row as { cells: unknown }).cells;
            return Array.isArray(cells) ? cells : Object.values(cells ?? {});
          }
          return Object.values((row as object) ?? {});
        }),
      } as unknown as SlipElement;
    }
    return el;
  });
}

function deserializeTemplate(id: string, data: Record<string, unknown>): SlipTemplate {
  return {
    id,
    ...data,
    elements: deserializeElements(data.elements as SlipElement[] | undefined),
  } as SlipTemplate;
}

// ─── Service ──────────────────────────────────────────────────────────────────

export const slipTemplateService = {
  /** Fetch all slip templates for a company */
  async getAll(companyId: string): Promise<SlipTemplate[]> {
    const q = query(
      collection(db, "slipTemplates"),
      where("companyId", "==", companyId)
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => deserializeTemplate(d.id, d.data()));
  },

  /** Fetch a single template by ID */
  async getById(id: string): Promise<SlipTemplate | null> {
    const snap = await getDoc(doc(db, "slipTemplates", id));
    if (!snap.exists()) return null;
    return deserializeTemplate(snap.id, snap.data());
  },

  /** Get the manager-specific template for a given manager (or null if none) */
  async getForManager(
    companyId: string,
    managerId: string
  ): Promise<SlipTemplate | null> {
    const all = await this.getAll(companyId);
    return (
      all.find(
        (t) => t.scope === "manager" && t.managerId === managerId
      ) ?? null
    );
  },

  /** Get the global template (scope === "global") or null */
  async getGlobal(companyId: string): Promise<SlipTemplate | null> {
    const all = await this.getAll(companyId);
    return all.find((t) => t.scope === "global") ?? null;
  },

  /** Create a new slip template; returns the new doc ID */
  async create(
    companyId: string,
    createdBy: string,
    data: Omit<SlipTemplate, "id" | "companyId" | "createdAt" | "updatedAt" | "createdBy">
  ): Promise<string> {
    const ref = doc(collection(db, "slipTemplates"));
    await setDoc(ref, stripUndefined({
      ...data,
      elements: serializeElements(data.elements),
      companyId,
      createdBy,
      createdAt: new Date(),
      updatedAt: new Date(),
    }));
    return ref.id;
  },

  /** Update an existing slip template */
  async update(
    id: string,
    data: Partial<Omit<SlipTemplate, "id" | "companyId" | "createdAt" | "createdBy">>
  ): Promise<void> {
    await updateDoc(doc(db, "slipTemplates", id), stripUndefined({
      ...data,
      ...(data.elements ? { elements: serializeElements(data.elements) } : {}),
      updatedAt: new Date(),
    }));
  },

  /** Delete a slip template */
  async delete(id: string): Promise<void> {
    await deleteDoc(doc(db, "slipTemplates", id));
  },
};
