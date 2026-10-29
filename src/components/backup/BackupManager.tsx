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
  manual: "#6366f1",
  auto: "#f59e0b",
  revert: "#8b5cf6",
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
    <Box sx={{ p: { xs: 2, sm: 3 } }}>
      {/* Header */}
      <Box sx={{ mb: 3 }}>
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: 2,
            mb: 1,
          }}
        >
          <Box>
            <Typography
              variant="h4"
              sx={{
                fontWeight: 700,
                fontSize: { xs: "1.5rem", sm: "1.875rem" },
                letterSpacing: "-0.02em",
                background: "linear-gradient(135deg, #f1f5f9 0%, #cbd5e1 100%)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                mb: 0.5,
              }}
            >
              Backup &amp; Restore
            </Typography>
            <Typography variant="body2" sx={{ color: "#94a3b8" }}>
              Snapshot and time-travel your company data with full version history and instant rollback
            </Typography>
          </Box>
          <Box sx={{ display: "flex", gap: 1.5, alignItems: "center", flexWrap: "wrap" }}>
            <Button
              variant="outlined"
              startIcon={<Refresh />}
              onClick={load}
              disabled={busy || loading}
              sx={{
                borderRadius: "12px",
                borderColor: "rgba(255, 255, 255, 0.15)",
                color: "#cbd5e1",
                backgroundColor: "rgba(255, 255, 255, 0.03)",
                backdropFilter: "blur(10px)",
                px: 2,
                py: 0.9,
                fontWeight: 500,
                textTransform: "none",
                "&:hover": {
                  borderColor: "rgba(99, 102, 241, 0.4)",
                  backgroundColor: "rgba(99, 102, 241, 0.08)",
                  transform: "translateY(-1px)",
                },
                transition: "all 0.2s ease",
              }}
            >
              Refresh
            </Button>
            <Button
              variant="contained"
              startIcon={<BackupIcon />}
              onClick={() => setCreateOpen(true)}
              disabled={busy || loading}
              sx={{
                borderRadius: "12px",
                px: 2.5,
                py: 0.9,
                fontWeight: 600,
                textTransform: "none",
                background: "linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)",
                color: "#ffffff",
                boxShadow:
                  "6px 6px 12px rgba(0, 0, 0, 0.35), inset 2px 2px 4px rgba(255, 255, 255, 0.15)",
                "&:hover": {
                  background: "linear-gradient(135deg, #4f46e5 0%, #4338ca 100%)",
                  boxShadow:
                    "4px 4px 8px rgba(0, 0, 0, 0.4), inset 2px 2px 4px rgba(255, 255, 255, 0.2)",
                  transform: "translateY(-1px)",
                },
                "&:active": {
                  boxShadow:
                    "2px 2px 4px rgba(0, 0, 0, 0.3), inset 3px 3px 6px rgba(0, 0, 0, 0.2)",
                  transform: "translateY(0)",
                },
                "&.Mui-disabled": {
                  background: "rgba(255, 255, 255, 0.05)",
                  color: "#64748b",
                  boxShadow: "none",
                },
                transition: "all 0.2s ease",
              }}
            >
              Backup Now
            </Button>
          </Box>
        </Box>
      </Box>

      <Alert
        severity="info"
        sx={{
          mb: 3,
          backgroundColor: "rgba(99, 102, 241, 0.1)",
          border: "1px solid rgba(99, 102, 241, 0.25)",
          color: "#c7d2fe",
          borderRadius: "14px",
          "& .MuiAlert-icon": {
            color: "#818cf8",
          },
        }}
      >
        Each backup captures a snapshot of your company&apos;s data (
        {BACKUP_COLLECTIONS.length} collections) with the date &amp; time. Revert
        to any point like a Git branch — reverting always auto-saves your current
        state first, so you can explore an older version and return to today
        whenever you want.
      </Alert>

      {error && (
        <Alert
          severity="error"
          sx={{
            mb: 3,
            backgroundColor: "rgba(239, 68, 68, 0.1)",
            border: "1px solid rgba(239, 68, 68, 0.25)",
            color: "#fca5a5",
            borderRadius: "14px",
          }}
        >
          {error}
        </Alert>
      )}

      {loading ? (
        <Box sx={{ display: "flex", justifyContent: "center", py: 8 }}>
          <CircularProgress sx={{ color: "#6366f1" }} />
        </Box>
      ) : snapshots.length === 0 ? (
        <Paper
          elevation={0}
          sx={{
            p: 5,
            textAlign: "center",
            background: "rgba(255, 255, 255, 0.03)",
            backdropFilter: "blur(20px)",
            WebkitBackdropFilter: "blur(20px)",
            border: "1px solid rgba(255, 255, 255, 0.08)",
            borderRadius: "16px",
            boxShadow: "0 8px 32px rgba(0, 0, 0, 0.25)",
          }}
        >
          <Box
            sx={{
              width: 64,
              height: 64,
              borderRadius: "20px",
              background: "rgba(99, 102, 241, 0.15)",
              border: "1px solid rgba(99, 102, 241, 0.25)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              mx: "auto",
              mb: 2,
            }}
          >
            <History sx={{ fontSize: 32, color: "#818cf8" }} />
          </Box>
          <Typography variant="h6" sx={{ color: "#f1f5f9", fontWeight: 600 }} gutterBottom>
            No backups yet
          </Typography>
          <Typography sx={{ color: "#94a3b8", mb: 3 }}>
            Create your first snapshot to start tracking your data history.
          </Typography>
          <Button
            variant="contained"
            startIcon={<BackupIcon />}
            onClick={() => setCreateOpen(true)}
            sx={{
              borderRadius: "12px",
              px: 3,
              py: 1,
              fontWeight: 600,
              textTransform: "none",
              background: "linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)",
              color: "#ffffff",
              boxShadow:
                "6px 6px 12px rgba(0, 0, 0, 0.35), inset 2px 2px 4px rgba(255, 255, 255, 0.15)",
              "&:hover": {
                background: "linear-gradient(135deg, #4f46e5 0%, #4338ca 100%)",
                boxShadow:
                  "4px 4px 8px rgba(0, 0, 0, 0.4), inset 2px 2px 4px rgba(255, 255, 255, 0.2)",
              },
            }}
          >
            Create first backup
          </Button>
        </Paper>
      ) : (
        <Box sx={{ display: "flex", gap: 2.5, flexWrap: "wrap" }}>
          {/* Tree graph */}
          <Paper
            elevation={0}
            sx={{
              flex: "1 1 520px",
              minWidth: 320,
              p: 2,
              overflow: "auto",
              maxHeight: "70vh",
              background: "rgba(255, 255, 255, 0.03)",
              backdropFilter: "blur(20px)",
              WebkitBackdropFilter: "blur(20px)",
              border: "1px solid rgba(255, 255, 255, 0.08)",
              borderRadius: "16px",
              boxShadow: "0 8px 32px rgba(0, 0, 0, 0.25)",
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
                    stroke="rgba(255, 255, 255, 0.2)"
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
                        stroke="#10b981"
                        strokeWidth={2.5}
                      />
                    )}
                    <circle
                      r={NODE_RADIUS}
                      fill={TYPE_COLOR[node.type]}
                      stroke={isSelected ? "#f1f5f9" : "rgba(15, 23, 42, 0.8)"}
                      strokeWidth={isSelected ? 3 : 1.5}
                    />
                    <text
                      x={NODE_RADIUS + 10}
                      y={-2}
                      fill="#f1f5f9"
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
                      fill="#94a3b8"
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
          <Paper
            elevation={0}
            sx={{
              flex: "1 1 300px",
              minWidth: 280,
              p: 3,
              background: "rgba(255, 255, 255, 0.03)",
              backdropFilter: "blur(20px)",
              WebkitBackdropFilter: "blur(20px)",
              border: "1px solid rgba(255, 255, 255, 0.08)",
              borderRadius: "16px",
              boxShadow: "0 8px 32px rgba(0, 0, 0, 0.25)",
            }}
          >
            {selected ? (
              <Stack spacing={2}>
                <Box
                  sx={{ display: "flex", alignItems: "center", gap: 1 }}
                >
                  <Chip
                    size="small"
                    label={TYPE_LABEL[selected.type]}
                    sx={{
                      bgcolor: `${TYPE_COLOR[selected.type]}25`,
                      color:
                        selected.type === "manual"
                          ? "#a5b4fc"
                          : selected.type === "revert"
                            ? "#c4b5fd"
                            : "#fcd34d",
                      border: `1px solid ${TYPE_COLOR[selected.type]}50`,
                      fontWeight: 600,
                    }}
                  />
                  {selected.id === headId && (
                    <Chip
                      size="small"
                      label="Current (HEAD)"
                      sx={{
                        bgcolor: "rgba(16, 185, 129, 0.15)",
                        color: "#34d399",
                        border: "1px solid rgba(16, 185, 129, 0.3)",
                        fontWeight: 600,
                      }}
                    />
                  )}
                </Box>
                <Typography variant="h6" sx={{ color: "#f1f5f9", fontWeight: 600 }}>
                  {selected.label}
                </Typography>
                <Typography variant="body2" sx={{ color: "#94a3b8" }}>
                  {selected.createdAt.toLocaleString()}
                </Typography>
                {selected.description ? (
                  <Typography variant="body2" sx={{ color: "#cbd5e1" }}>
                    {selected.description}
                  </Typography>
                ) : null}
                <Divider sx={{ borderColor: "rgba(255, 255, 255, 0.08)" }} />
                <Typography variant="subtitle2" sx={{ color: "#f1f5f9", fontWeight: 600 }}>
                  {selected.docCount} documents
                </Typography>
                <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.8 }}>
                  {Object.entries(selected.collectionCounts).map(
                    ([name, count]) => (
                      <Chip
                        key={name}
                        size="small"
                        variant="outlined"
                        label={`${name}: ${count}`}
                        sx={{
                          backgroundColor: "rgba(255, 255, 255, 0.03)",
                          borderColor: "rgba(255, 255, 255, 0.1)",
                          color: "#cbd5e1",
                          fontSize: "0.75rem",
                        }}
                      />
                    ),
                  )}
                </Box>
                <Divider sx={{ borderColor: "rgba(255, 255, 255, 0.08)" }} />
                <Tooltip title="Restore all data to this snapshot. Your current state is auto-saved first.">
                  <span>
                    <Button
                      fullWidth
                      variant="contained"
                      startIcon={<Restore />}
                      disabled={busy || selected.id === headId}
                      onClick={() => setRestoreTarget(selected)}
                      sx={{
                        borderRadius: "12px",
                        py: 1,
                        fontWeight: 600,
                        textTransform: "none",
                        background:
                          "linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)",
                        color: "#ffffff",
                        boxShadow:
                          "6px 6px 12px rgba(0, 0, 0, 0.35), inset 2px 2px 4px rgba(255, 255, 255, 0.15)",
                        "&:hover": {
                          background:
                            "linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%)",
                          boxShadow:
                            "4px 4px 8px rgba(0, 0, 0, 0.4), inset 2px 2px 4px rgba(255, 255, 255, 0.2)",
                          transform: "translateY(-1px)",
                        },
                        "&:active": {
                          boxShadow:
                            "2px 2px 4px rgba(0, 0, 0, 0.3), inset 3px 3px 6px rgba(0, 0, 0, 0.2)",
                          transform: "translateY(0)",
                        },
                        "&.Mui-disabled": {
                          background: "rgba(255, 255, 255, 0.05)",
                          color: "#64748b",
                          boxShadow: "none",
                        },
                        transition: "all 0.2s ease",
                      }}
                    >
                      {selected.id === headId
                        ? "This is the current state"
                        : "Revert to this snapshot"}
                    </Button>
                  </span>
                </Tooltip>
                <Typography
                  variant="caption"
                  sx={{ color: "#94a3b8", display: "flex", alignItems: "center", gap: 0.5 }}
                >
                  <CallSplit fontSize="inherit" /> Reverting starts a new branch
                  from this point.
                </Typography>
              </Stack>
            ) : (
              <Typography sx={{ color: "#94a3b8" }}>
                Select a node in the tree to see its details and revert options.
              </Typography>
            )}
          </Paper>
        </Box>
      )}

      {/* Quick "return to latest" helper */}
      {latestSnapshot && latestSnapshot.id !== headId && (
        <Box sx={{ mt: 2.5 }}>
          <Button
            variant="outlined"
            startIcon={<Save />}
            disabled={busy}
            onClick={() => setRestoreTarget(latestSnapshot)}
            sx={{
              borderRadius: "12px",
              borderColor: "rgba(99, 102, 241, 0.3)",
              color: "#a5b4fc",
              backgroundColor: "rgba(99, 102, 241, 0.06)",
              px: 2.5,
              py: 0.9,
              textTransform: "none",
              fontWeight: 500,
              "&:hover": {
                borderColor: "rgba(99, 102, 241, 0.5)",
                backgroundColor: "rgba(99, 102, 241, 0.12)",
                transform: "translateY(-1px)",
              },
              transition: "all 0.2s ease",
            }}
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
        PaperProps={{
          sx: {
            background: "rgba(15, 23, 42, 0.95)",
            backdropFilter: "blur(40px)",
            WebkitBackdropFilter: "blur(40px)",
            border: "1px solid rgba(255, 255, 255, 0.1)",
            borderRadius: "16px",
            boxShadow: "0 25px 60px rgba(0, 0, 0, 0.6)",
            color: "#f1f5f9",
          },
        }}
      >
        <DialogTitle sx={{ color: "#f1f5f9", fontWeight: 700, fontSize: "1.25rem" }}>
          Create backup
        </DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ mb: 2, color: "#cbd5e1" }}>
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
            sx={{
              mt: 1,
              "& .MuiOutlinedInput-root": {
                backgroundColor: "rgba(255, 255, 255, 0.03)",
                backdropFilter: "blur(10px)",
                borderRadius: "12px",
                "& fieldset": {
                  borderColor: "rgba(255, 255, 255, 0.15)",
                },
                "&:hover fieldset": {
                  borderColor: "rgba(99, 102, 241, 0.4)",
                },
                "&.Mui-focused fieldset": {
                  borderColor: "#6366f1",
                  boxShadow: "0 0 0 3px rgba(99, 102, 241, 0.1)",
                },
              },
              "& .MuiInputLabel-root": {
                color: "#94a3b8",
              },
              "& .MuiInputBase-input": {
                color: "#f1f5f9",
              },
            }}
          />
        </DialogContent>
        <DialogActions sx={{ p: 2.5, pt: 0 }}>
          <Button
            onClick={() => setCreateOpen(false)}
            disabled={busy}
            sx={{
              borderRadius: "10px",
              color: "#94a3b8",
              textTransform: "none",
              "&:hover": { color: "#f1f5f9" },
            }}
          >
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={handleCreate}
            disabled={busy}
            startIcon={busy ? <CircularProgress size={16} /> : <BackupIcon />}
            sx={{
              borderRadius: "12px",
              px: 2.5,
              py: 0.8,
              fontWeight: 600,
              textTransform: "none",
              background: "linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)",
              color: "#ffffff",
              boxShadow:
                "6px 6px 12px rgba(0, 0, 0, 0.35), inset 2px 2px 4px rgba(255, 255, 255, 0.15)",
              "&:hover": {
                background: "linear-gradient(135deg, #4f46e5 0%, #4338ca 100%)",
              },
            }}
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
        PaperProps={{
          sx: {
            background: "rgba(15, 23, 42, 0.95)",
            backdropFilter: "blur(40px)",
            WebkitBackdropFilter: "blur(40px)",
            border: "1px solid rgba(255, 255, 255, 0.1)",
            borderRadius: "16px",
            boxShadow: "0 25px 60px rgba(0, 0, 0, 0.6)",
            color: "#f1f5f9",
          },
        }}
      >
        <DialogTitle sx={{ color: "#f1f5f9", fontWeight: 700, fontSize: "1.25rem" }}>
          Revert to this snapshot?
        </DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ color: "#cbd5e1" }}>
            This will replace your current live data with the snapshot
            <strong style={{ color: "#f1f5f9" }}> &quot;{restoreTarget?.label}&quot;</strong> from{" "}
            {restoreTarget?.createdAt.toLocaleString()}.
          </DialogContentText>
          <Alert
            severity="info"
            sx={{
              mt: 2,
              backgroundColor: "rgba(99, 102, 241, 0.1)",
              border: "1px solid rgba(99, 102, 241, 0.25)",
              color: "#c7d2fe",
              borderRadius: "12px",
            }}
          >
            Your current state is automatically saved as a new backup first, so
            you can always return to it. A new branch is created from this point.
          </Alert>
        </DialogContent>
        <DialogActions sx={{ p: 2.5, pt: 0 }}>
          <Button
            onClick={() => setRestoreTarget(null)}
            disabled={busy}
            sx={{
              borderRadius: "10px",
              color: "#94a3b8",
              textTransform: "none",
              "&:hover": { color: "#f1f5f9" },
            }}
          >
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={handleRestore}
            disabled={busy}
            startIcon={busy ? <CircularProgress size={16} /> : <Restore />}
            sx={{
              borderRadius: "12px",
              px: 2.5,
              py: 0.8,
              fontWeight: 600,
              textTransform: "none",
              background: "linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)",
              color: "#ffffff",
              boxShadow:
                "6px 6px 12px rgba(0, 0, 0, 0.35), inset 2px 2px 4px rgba(255, 255, 255, 0.15)",
              "&:hover": {
                background: "linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%)",
              },
            }}
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
