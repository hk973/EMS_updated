// Types for the Firestore backup / snapshot ("time machine") feature.
//
// A snapshot captures the company-scoped data of selected Firestore
// collections at a point in time. Snapshots form a tree (GitHub-like) where
// each node points to its parent, allowing branching: you can revert to an
// older snapshot and later return to a newer one without losing anything.

export type BackupType = "manual" | "auto" | "revert";

/** How a collection is scoped to a single company. */
export type BackupScope = "companyId" | "docId" | "all";

export interface BackupCollectionConfig {
  /** Firestore collection name. */
  name: string;
  /** Human friendly label shown in the UI. */
  label: string;
  /** Strategy used to select the documents belonging to a company. */
  scope: BackupScope;
}

export interface BackupDocRecord {
  id: string;
  data: Record<string, unknown>;
}

/** Payload document stored under `backups/{id}/collections/{name}`. */
export interface BackupCollectionPayload {
  collection: string;
  scope: BackupScope;
  docs: BackupDocRecord[];
}

/** Metadata document stored at `backups/{id}`. */
export interface BackupSnapshotMeta {
  id: string;
  companyId: string;
  label: string;
  description?: string;
  type: BackupType;
  createdAt: Date;
  /** Parent snapshot id in the tree (null for the very first snapshot). */
  parentId: string | null;
  /** Branch identifier this snapshot belongs to. */
  branch: string;
  /** When this node was produced by a revert, the snapshot it was restored from. */
  restoredFrom?: string | null;
  docCount: number;
  collectionCounts: Record<string, number>;
}

/** Pointer document stored at `backupHead/{companyId}`. */
export interface BackupHead {
  headId: string | null;
  branch: string;
  updatedAt: Date;
}
