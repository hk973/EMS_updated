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
  /** Row height in px */
  rowHeight: number;
  /** Font size for body cells */
  fontSize: number;
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

// ─── Service ──────────────────────────────────────────────────────────────────

export const slipTemplateService = {
  /** Fetch all slip templates for a company */
  async getAll(companyId: string): Promise<SlipTemplate[]> {
    const q = query(
      collection(db, "slipTemplates"),
      where("companyId", "==", companyId)
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() } as SlipTemplate));
  },

  /** Fetch a single template by ID */
  async getById(id: string): Promise<SlipTemplate | null> {
    const snap = await getDoc(doc(db, "slipTemplates", id));
    if (!snap.exists()) return null;
    return { id: snap.id, ...snap.data() } as SlipTemplate;
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
    await setDoc(ref, {
      ...data,
      companyId,
      createdBy,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    return ref.id;
  },

  /** Update an existing slip template */
  async update(
    id: string,
    data: Partial<Omit<SlipTemplate, "id" | "companyId" | "createdAt" | "createdBy">>
  ): Promise<void> {
    await updateDoc(doc(db, "slipTemplates", id), {
      ...data,
      updatedAt: new Date(),
    });
  },

  /** Delete a slip template */
  async delete(id: string): Promise<void> {
    await deleteDoc(doc(db, "slipTemplates", id));
  },
};
