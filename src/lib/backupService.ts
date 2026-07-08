// Service that powers the Firestore backup / "time machine" feature.
//
// Snapshots are stored as:
//   backups/{snapshotId}                       -> BackupSnapshotMeta
//   backups/{snapshotId}/collections/{name}    -> BackupCollectionPayload
//   backupHead/{companyId}                      -> BackupHead (current pointer)
//
// Everything is scoped to a single company (the admin's uid).

import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  setDoc,
  deleteDoc,
  writeBatch,
  Timestamp,
  orderBy,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import {
  BackupCollectionConfig,
  BackupCollectionPayload,
  BackupDocRecord,
  BackupHead,
  BackupScope,
  BackupSnapshotMeta,
  BackupType,
} from "@/types/backup";

/**
 * Collections captured by a snapshot. Collections that carry a `companyId`
 * field are filtered to the current company; a couple are keyed by document id
 * equal to the company id; the remaining reference/data collections in this
 * (effectively single-tenant) deployment are captured in full.
 *
 * Edit this list to add/remove collections from the backup.
 */
export const BACKUP_COLLECTIONS: BackupCollectionConfig[] = [
  { name: "employees", label: "Employees", scope: "companyId" },
  { name: "managers", label: "Managers", scope: "companyId" },
  { name: "payroll", label: "Payroll", scope: "companyId" },
  { name: "salaryTemplates", label: "Salary Templates", scope: "companyId" },
  { name: "slipTemplates", label: "Slip Templates", scope: "companyId" },
  { name: "companies", label: "Company Profile", scope: "docId" },
  { name: "salaryStructure", label: "Salary Structure", scope: "docId" },
  { name: "attendance", label: "Attendance", scope: "all" },
  { name: "leaveApplications", label: "Leave Applications", scope: "all" },
  { name: "leaveBalances", label: "Leave Balances", scope: "all" },
  { name: "leaveTypes", label: "Leave Types", scope: "all" },
  { name: "holidays", label: "Holidays", scope: "all" },
  { name: "customFields", label: "Custom Fields", scope: "all" },
];

const WRITE_BATCH_LIMIT = 400;

function newId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/** Read the documents that belong to a company for a given collection. */
async function readScopedDocs(
  config: BackupCollectionConfig,
  companyId: string,
): Promise<BackupDocRecord[]> {
  if (config.scope === "docId") {
    const snap = await getDoc(doc(db, config.name, companyId));
    if (!snap.exists()) return [];
    return [{ id: snap.id, data: snap.data() as Record<string, unknown> }];
  }

  if (config.scope === "companyId") {
    const snap = await getDocs(
      query(collection(db, config.name), where("companyId", "==", companyId)),
    );
    return snap.docs.map((d) => ({ id: d.id, data: d.data() }));
  }

  // scope === "all"
  const snap = await getDocs(collection(db, config.name));
  return snap.docs.map((d) => ({ id: d.id, data: d.data() }));
}

/** Read the ids currently present in a collection for a company. */
async function readScopedIds(
  config: BackupCollectionConfig,
  companyId: string,
): Promise<string[]> {
  const docs = await readScopedDocs(config, companyId);
  return docs.map((d) => d.id);
}

/** Create a snapshot capturing the current company data. */
export async function createSnapshot(
  companyId: string,
  opts: {
    label: string;
    type: BackupType;
    parentId: string | null;
    branch: string;
    description?: string;
    restoredFrom?: string | null;
  },
): Promise<BackupSnapshotMeta> {
  const snapshotId = newId("bk");
  const collectionCounts: Record<string, number> = {};
  let docCount = 0;

  // Read + persist each collection payload.
  for (const config of BACKUP_COLLECTIONS) {
    const docs = await readScopedDocs(config, companyId);
    collectionCounts[config.name] = docs.length;
    docCount += docs.length;

    const payload: BackupCollectionPayload = {
      collection: config.name,
      scope: config.scope,
      docs,
    };
    await setDoc(
      doc(db, "backups", snapshotId, "collections", config.name),
      payload,
    );
  }

  const createdAt = new Date();
  const meta: BackupSnapshotMeta = {
    id: snapshotId,
    companyId,
    label: opts.label,
    description: opts.description ?? "",
    type: opts.type,
    createdAt,
    parentId: opts.parentId,
    branch: opts.branch,
    restoredFrom: opts.restoredFrom ?? null,
    docCount,
    collectionCounts,
  };

  await setDoc(doc(db, "backups", snapshotId), {
    ...meta,
    createdAt: Timestamp.fromDate(createdAt),
  });

  return meta;
}

/** List all snapshots for a company, oldest first. */
export async function listSnapshots(
  companyId: string,
): Promise<BackupSnapshotMeta[]> {
  const snap = await getDocs(
    query(
      collection(db, "backups"),
      where("companyId", "==", companyId),
      orderBy("createdAt", "asc"),
    ),
  );
  return snap.docs.map((d) => {
    const data = d.data() as Record<string, unknown>;
    const createdAt = data.createdAt as Timestamp | undefined;
    return {
      id: d.id,
      companyId: String(data.companyId ?? ""),
      label: String(data.label ?? ""),
      description: (data.description as string) ?? "",
      type: (data.type as BackupType) ?? "manual",
      createdAt: createdAt ? createdAt.toDate() : new Date(0),
      parentId: (data.parentId as string | null) ?? null,
      branch: String(data.branch ?? "main"),
      restoredFrom: (data.restoredFrom as string | null) ?? null,
      docCount: Number(data.docCount ?? 0),
      collectionCounts:
        (data.collectionCounts as Record<string, number>) ?? {},
    } satisfies BackupSnapshotMeta;
  });
}

/** Read the current HEAD pointer for a company. */
export async function getHead(companyId: string): Promise<BackupHead> {
  const snap = await getDoc(doc(db, "backupHead", companyId));
  if (!snap.exists()) {
    return { headId: null, branch: "main", updatedAt: new Date(0) };
  }
  const data = snap.data() as Record<string, unknown>;
  const updatedAt = data.updatedAt as Timestamp | undefined;
  return {
    headId: (data.headId as string | null) ?? null,
    branch: String(data.branch ?? "main"),
    updatedAt: updatedAt ? updatedAt.toDate() : new Date(0),
  };
}

async function setHead(
  companyId: string,
  headId: string,
  branch: string,
): Promise<void> {
  await setDoc(doc(db, "backupHead", companyId), {
    headId,
    branch,
    updatedAt: Timestamp.fromDate(new Date()),
  });
}

/** Load the captured documents of a snapshot, keyed by collection name. */
async function loadSnapshotPayloads(
  snapshotId: string,
): Promise<Map<string, BackupCollectionPayload>> {
  const snap = await getDocs(
    collection(db, "backups", snapshotId, "collections"),
  );
  const map = new Map<string, BackupCollectionPayload>();
  snap.docs.forEach((d) => {
    map.set(d.id, d.data() as BackupCollectionPayload);
  });
  return map;
}

function configFor(name: string): BackupCollectionConfig | undefined {
  return BACKUP_COLLECTIONS.find((c) => c.name === name);
}

/**
 * Apply a batch of write/delete operations, chunked to respect Firestore's
 * per-batch limit.
 */
type Op =
  | { kind: "set"; collection: string; id: string; data: Record<string, unknown> }
  | { kind: "delete"; collection: string; id: string };

async function runOps(ops: Op[]): Promise<void> {
  for (let i = 0; i < ops.length; i += WRITE_BATCH_LIMIT) {
    const chunk = ops.slice(i, i + WRITE_BATCH_LIMIT);
    const batch = writeBatch(db);
    for (const op of chunk) {
      const ref = doc(db, op.collection, op.id);
      if (op.kind === "set") {
        batch.set(ref, op.data);
      } else {
        batch.delete(ref);
      }
    }
    await batch.commit();
  }
}

export interface RestoreResult {
  autoBackup: BackupSnapshotMeta | null;
  newHead: BackupSnapshotMeta;
}

/**
 * Restore live data to the state captured by `targetId`.
 *
 * When `autoBackup` is true (default) the current live state is snapshotted
 * first (type "auto") so nothing is lost and you can always return. After the
 * data is applied, a new "revert" node is created on a fresh branch and becomes
 * HEAD — giving the GitHub-like branching behaviour.
 */
export async function restoreSnapshot(
  companyId: string,
  targetId: string,
  options: { autoBackup?: boolean } = {},
): Promise<RestoreResult> {
  const autoBackup = options.autoBackup ?? true;
  const head = await getHead(companyId);

  // 1. Preserve current state so the user can come back to it.
  let autoSnap: BackupSnapshotMeta | null = null;
  if (autoBackup) {
    autoSnap = await createSnapshot(companyId, {
      label: `Auto-backup before revert (${new Date().toLocaleString()})`,
      type: "auto",
      parentId: head.headId,
      branch: head.branch,
    });
  }

  // 2. Apply the target snapshot data onto the live collections.
  const payloads = await loadSnapshotPayloads(targetId);
  const ops: Op[] = [];

  for (const [name, payload] of payloads) {
    const config = configFor(name);
    if (!config) continue;

    const snapshotIds = new Set(payload.docs.map((d) => d.id));
    const currentIds = await readScopedIds(config, companyId);

    // Delete docs that exist now but were not present in the snapshot.
    for (const id of currentIds) {
      if (!snapshotIds.has(id)) {
        ops.push({ kind: "delete", collection: name, id });
      }
    }
    // (Re)write every snapshot doc.
    for (const record of payload.docs) {
      ops.push({
        kind: "set",
        collection: name,
        id: record.id,
        data: record.data,
      });
    }
  }

  await runOps(ops);

  // 3. Record the revert as a new node on a new branch and move HEAD there.
  const branch = newId("branch");
  const newHead = await createSnapshot(companyId, {
    label: `Reverted state`,
    type: "revert",
    parentId: targetId,
    branch,
    restoredFrom: targetId,
  });
  await setHead(companyId, newHead.id, branch);

  return { autoBackup: autoSnap, newHead };
}

/** Create a manual snapshot as a child of the current HEAD. */
export async function createManualBackup(
  companyId: string,
  label: string,
  description?: string,
): Promise<BackupSnapshotMeta> {
  const head = await getHead(companyId);
  const snapshots = await listSnapshots(companyId);

  // If HEAD already has children, start a new branch so history stays a tree.
  let branch = head.branch;
  if (head.headId) {
    const headHasChildren = snapshots.some((s) => s.parentId === head.headId);
    if (headHasChildren) branch = newId("branch");
  }

  const snap = await createSnapshot(companyId, {
    label: label || `Backup ${new Date().toLocaleString()}`,
    type: "manual",
    parentId: head.headId,
    branch,
    description,
  });
  await setHead(companyId, snap.id, branch);
  return snap;
}

/** Delete a snapshot and its payload documents. */
export async function deleteSnapshot(snapshotId: string): Promise<void> {
  const payloads = await getDocs(
    collection(db, "backups", snapshotId, "collections"),
  );
  const ops: Op[] = payloads.docs.map((d) => ({
    kind: "delete" as const,
    collection: `backups/${snapshotId}/collections`,
    id: d.id,
  }));
  await runOps(ops);
  await deleteDoc(doc(db, "backups", snapshotId));
}

export type { BackupScope };
