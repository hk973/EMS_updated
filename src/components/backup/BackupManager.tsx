"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Divider,
  Paper,
  Snackbar,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import {
  Backup as BackupIcon,
  Refresh,
  Restore,
  History,
  CallSplit,
  Save,
} from "@mui/icons-material";
import { useAuth } from "@/contexts/AuthContext";
import {
  BACKUP_COLLECTIONS,
  createManualBackup,
  getHead,
  listSnapshots,
  restoreSnapshot,
} from "@/lib/backupService";
import { BackupSnapshotMeta, BackupType } from "@/types/backup";

// ─── Tree layout ────────────────────────────────────────────────────────────

const ROW_HEIGHT = 96;
const COL_WIDTH = 150;
const NODE_RADIUS = 13;
const MARGIN_X = 40;
const MARGIN_Y = 40;

interface PositionedNode {
  node: BackupSnapshotMeta;
  x: number;
  y: number;
  row: number;
  col: number;
}

const TYPE_COLOR: Record<BackupType, string> = {
  manual: "#3b82f6",
  auto: "#f59e0b",
  revert: "#a855f7",
};

const TYPE_LABEL: Record<BackupType, string> = {
  manual: "Manual",
  auto: "Auto",
  revert: "Revert",
};

/**
 * Assign every snapshot a row (chronological order) and a column (per branch),
 * producing coordinates for a GitHub-style commit graph.
 */
function layoutTree(snapshots: BackupSnapshotMeta[]): {
  nodes: PositionedNode[];
  width: number;
  height: number;
} {
  const ordered = [...snapshots].sort(
    (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
  );

  // Column per branch, in order of first appearance.
  const branchCol = new Map<string, number>();
  ordered.forEach((s) => {
    if (!branchCol.has(s.branch)) branchCol.set(s.branch, branchCol.size);
  });

  const nodes: PositionedNode[] = ordered.map((node, row) => {
    const col = branchCol.get(node.branch) ?? 0;
    return {
      node,
      row,
      col,
      x: MARGIN_X + col * COL_WIDTH,
      y: MARGIN_Y + row * ROW_HEIGHT,
    };
  });

  const width = MARGIN_X * 2 + Math.max(1, branchCol.size) * COL_WIDTH;
  const height = MARGIN_Y * 2 + Math.max(1, ordered.length) * ROW_HEIGHT;
  return { nodes, width, height };
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function BackupManager() {
  const { currentUser } = useAuth();
  const companyId = currentUser?.uid ?? "";

  const [snapshots, setSnapshots] = useState<BackupSnapshotMeta[]>([]);
  const [headId, setHeadId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [restoreTarget, setRestoreTarget] =
    useState<BackupSnapshotMeta | null>(null);

  const load = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    setError("");
    try {
      const [snaps, head] = await Promise.all([
        listSnapshots(companyId),
        getHead(companyId),
      ]);
      setSnapshots(snaps);
      setHeadId(head.headId);
    } catch (e) {
      console.error(e);
      setError(
        "Failed to load backups. Check your Firestore permissions and try again.",
      );
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    load();
  }, [load]);

  const { nodes, width, height } = useMemo(
    () => layoutTree(snapshots),
    [snapshots],
  );
  const nodeById = useMemo(() => {
    const m = new Map<string, PositionedNode>();
    nodes.forEach((n) => m.set(n.node.id, n));
    return m;
  }, [nodes]);

  const selected = selectedId
    ? snapshots.find((s) => s.id === selectedId) ?? null
    : null;

  const handleCreate = async () => {
    if (!companyId) return;
    setBusy(true);
    setError("");
    try {
      const snap = await createManualBackup(companyId, label.trim());
      setCreateOpen(false);
      setLabel("");
      setToast(`Backup "${snap.label}" created (${snap.docCount} documents).`);
      await load();
      setSelectedId(snap.id);
    } catch (e) {
      console.error(e);
      setError("Failed to create backup.");
    } finally {
      setBusy(false);
    }
  };

  const handleRestore = async () => {
    if (!companyId || !restoreTarget) return;
    setBusy(true);
    setError("");
    const target = restoreTarget;
    setRestoreTarget(null);
    try {
      await restoreSnapshot(companyId, target.id, { autoBackup: true });
      setToast(
        `Reverted to "${target.label}". Your previous state was auto-saved so you can return anytime.`,
      );
      await load();
    } catch (e) {
      console.error(e);
      setError("Failed to revert. No changes may have been applied.");
    } finally {
      setBusy(false);
    }
  };

  const latestSnapshot = snapshots.length
    ? snapshots[snapshots.length - 1]
    : null;

  return (
    <Box>
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 2,
          mb: 2,
        }}
      >
        <Typography variant="h4" sx={{ flexGrow: 1 }}>
          Backup &amp; Restore
        </Typography>
        <Button
          variant="outlined"
          startIcon={<Refresh />}
          onClick={load}
          disabled={busy || loading}
        >
          Refresh
        </Button>
        <Button
          variant="contained"
          startIcon={<BackupIcon />}
          onClick={() => setCreateOpen(true)}
          disabled={busy || loading}
        >
          Backup Now
        </Button>
      </Box>

      <Alert severity="info" sx={{ mb: 2 }}>
        Each backup captures a snapshot of your company&apos;s data (
        {BACKUP_COLLECTIONS.length} collections) with the date &amp; time. Revert
        to any point like a Git branch — reverting always auto-saves your current
        state first, so you can explore an older version and return to today
        whenever you want.
      </Alert>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {loading ? (
        <Box sx={{ display: "flex", justifyContent: "center", py: 8 }}>
          <CircularProgress />
        </Box>
      ) : snapshots.length === 0 ? (
        <Paper sx={{ p: 4, textAlign: "center" }}>
          <History sx={{ fontSize: 48, opacity: 0.4, mb: 1 }} />
          <Typography variant="h6" gutterBottom>
            No backups yet
          </Typography>
          <Typography color="text.secondary" sx={{ mb: 2 }}>
            Create your first snapshot to start tracking your data history.
          </Typography>
          <Button
            variant="contained"
            startIcon={<BackupIcon />}
            onClick={() => setCreateOpen(true)}
          >
            Create first backup
          </Button>
        </Paper>
      ) : (
        <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap" }}>
          {/* Tree graph */}
          <Paper
            sx={{
              flex: "1 1 520px",
              minWidth: 320,
              p: 1,
              overflow: "auto",
              maxHeight: "70vh",
            }}
          >
            <svg
              width={width}
              height={height}
              style={{ display: "block", minWidth: "100%" }}
            >
              {/* Edges */}
              {nodes.map(({ node, x, y }) => {
                if (!node.parentId) return null;
                const parent = nodeById.get(node.parentId);
                if (!parent) return null;
                const path = `M ${parent.x} ${parent.y} C ${parent.x} ${
                  (parent.y + y) / 2
                }, ${x} ${(parent.y + y) / 2}, ${x} ${y}`;
                return (
                  <path
                    key={`edge-${node.id}`}
                    d={path}
                    stroke="#6b7280"
                    strokeWidth={2}
                    fill="none"
                  />
                );
              })}
              {/* Nodes */}
              {nodes.map(({ node, x, y }) => {
                const isHead = node.id === headId;
                const isSelected = node.id === selectedId;
                return (
                  <g
                    key={node.id}
                    transform={`translate(${x}, ${y})`}
                    style={{ cursor: "pointer" }}
                    onClick={() => setSelectedId(node.id)}
                  >
                    {isHead && (
                      <circle
                        r={NODE_RADIUS + 6}
                        fill="none"
                        stroke="#22c55e"
                        strokeWidth={2}
                      />
                    )}
                    <circle
                      r={NODE_RADIUS}
                      fill={TYPE_COLOR[node.type]}
                      stroke={isSelected ? "#ffffff" : "#111827"}
                      strokeWidth={isSelected ? 3 : 1.5}
                    />
                    <text
                      x={NODE_RADIUS + 10}
                      y={-2}
                      fill="currentColor"
                      fontSize={13}
                      fontWeight={600}
                    >
                      {node.label.length > 22
                        ? node.label.slice(0, 22) + "…"
                        : node.label}
                    </text>
                    <text
                      x={NODE_RADIUS + 10}
                      y={15}
                      fill="#9ca3af"
                      fontSize={11}
                    >
                      {node.createdAt.toLocaleString()}
                    </text>
                  </g>
                );
              })}
            </svg>
          </Paper>

          {/* Details panel */}
          <Paper sx={{ flex: "1 1 300px", minWidth: 280, p: 2 }}>
            {selected ? (
              <Stack spacing={1.5}>
                <Box
                  sx={{ display: "flex", alignItems: "center", gap: 1 }}
                >
                  <Chip
                    size="small"
                    label={TYPE_LABEL[selected.type]}
                    sx={{
                      bgcolor: TYPE_COLOR[selected.type],
                      color: "#fff",
                    }}
                  />
                  {selected.id === headId && (
                    <Chip
                      size="small"
                      color="success"
                      label="Current (HEAD)"
                    />
                  )}
                </Box>
                <Typography variant="h6">{selected.label}</Typography>
                <Typography variant="body2" color="text.secondary">
                  {selected.createdAt.toLocaleString()}
                </Typography>
                {selected.description ? (
                  <Typography variant="body2">
                    {selected.description}
                  </Typography>
                ) : null}
                <Divider />
                <Typography variant="subtitle2">
                  {selected.docCount} documents
                </Typography>
                <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5 }}>
                  {Object.entries(selected.collectionCounts).map(
                    ([name, count]) => (
                      <Chip
                        key={name}
                        size="small"
                        variant="outlined"
                        label={`${name}: ${count}`}
                      />
                    ),
                  )}
                </Box>
                <Divider />
                <Tooltip title="Restore all data to this snapshot. Your current state is auto-saved first.">
                  <span>
                    <Button
                      fullWidth
                      variant="contained"
                      color="secondary"
                      startIcon={<Restore />}
                      disabled={busy || selected.id === headId}
                      onClick={() => setRestoreTarget(selected)}
                    >
                      {selected.id === headId
                        ? "This is the current state"
                        : "Revert to this snapshot"}
                    </Button>
                  </span>
                </Tooltip>
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ display: "flex", alignItems: "center", gap: 0.5 }}
                >
                  <CallSplit fontSize="inherit" /> Reverting starts a new branch
                  from this point.
                </Typography>
              </Stack>
            ) : (
              <Typography color="text.secondary">
                Select a node in the tree to see its details and revert options.
              </Typography>
            )}
          </Paper>
        </Box>
      )}

      {/* Quick "return to latest" helper */}
      {latestSnapshot && latestSnapshot.id !== headId && (
        <Box sx={{ mt: 2 }}>
          <Button
            variant="outlined"
            startIcon={<Save />}
            disabled={busy}
            onClick={() => setRestoreTarget(latestSnapshot)}
          >
            Return to latest state ({latestSnapshot.createdAt.toLocaleString()})
          </Button>
        </Box>
      )}

      {/* Create dialog */}
      <Dialog
        open={createOpen}
        onClose={() => !busy && setCreateOpen(false)}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>Create backup</DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ mb: 2 }}>
            A snapshot of your current company data will be saved with the
            current date &amp; time.
          </DialogContentText>
          <TextField
            autoFocus
            fullWidth
            label="Label (optional)"
            placeholder="e.g. Before June payroll run"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreateOpen(false)} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={handleCreate}
            disabled={busy}
            startIcon={busy ? <CircularProgress size={16} /> : <BackupIcon />}
          >
            Create backup
          </Button>
        </DialogActions>
      </Dialog>

      {/* Restore confirmation */}
      <Dialog
        open={Boolean(restoreTarget)}
        onClose={() => !busy && setRestoreTarget(null)}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>Revert to this snapshot?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            This will replace your current live data with the snapshot
            <strong> &quot;{restoreTarget?.label}&quot;</strong> from{" "}
            {restoreTarget?.createdAt.toLocaleString()}.
          </DialogContentText>
          <Alert severity="info" sx={{ mt: 2 }}>
            Your current state is automatically saved as a new backup first, so
            you can always return to it. A new branch is created from this point.
          </Alert>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRestoreTarget(null)} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant="contained"
            color="secondary"
            onClick={handleRestore}
            disabled={busy}
            startIcon={busy ? <CircularProgress size={16} /> : <Restore />}
          >
            Revert now
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={Boolean(toast)}
        autoHideDuration={6000}
        onClose={() => setToast("")}
        message={toast}
      />
    </Box>
  );
}
