"use client";

/**
 * SlipTemplateDesigner
 *
 * List view of all slip templates for this company.
 * "Add Template" opens a scope dialog (Global or Manager).
 * Opening a template launches SlipTemplateCanvas (the drag-and-drop designer).
 */

import React, { useState, useEffect, useCallback } from "react";
import {
  Box,
  Typography,
  Button,
  Paper,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  CircularProgress,
  Alert,
  Chip,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  TextField,
  Tooltip,
  Card,
  CardContent,
  CardActions,
  Divider,
} from "@mui/material";
import {
  Add,
  Edit,
  Delete,
  ContentCopy,
  Language,
  SupervisorAccount,
  ArrowBack,
} from "@mui/icons-material";
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import {
  slipTemplateService,
  SlipTemplate,
  DEFAULT_CANVAS_WIDTH,
  DEFAULT_CANVAS_HEIGHT,
} from "@/lib/slipTemplateService";
import dynamic from "next/dynamic";

const SlipTemplateCanvas = dynamic(() => import("./SlipTemplateCanvas"), {
  ssr: false,
  loading: () => (
    <Box display="flex" justifyContent="center" pt={8}>
      <CircularProgress />
    </Box>
  ),
});

// ─── Types ────────────────────────────────────────────────────────────────────

interface ManagerInfo {
  id: string;
  name: string;
}

// ─── Scope Dialog ─────────────────────────────────────────────────────────────

interface ScopeDialogProps {
  open: boolean;
  managers: ManagerInfo[];
  onConfirm: (scope: "global" | "manager", managerId: string | null, name: string) => void;
  onClose: () => void;
}

function ScopeDialog({ open, managers, onConfirm, onClose }: ScopeDialogProps) {
  const [scope, setScope] = useState<"global" | "manager">("global");
  const [managerId, setManagerId] = useState("");
  const [name, setName] = useState("");

  // Reset when opened
  useEffect(() => {
    if (open) {
      setScope("global");
      setManagerId("");
      setName("");
    }
  }, [open]);

  const defaultName =
    scope === "global"
      ? "Global Slip Template"
      : managerId
      ? `${managers.find((m) => m.id === managerId)?.name ?? "Manager"} Slip Template`
      : "Manager Slip Template";

  const canConfirm = scope === "global" || (scope === "manager" && !!managerId);

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ pb: 0 }}>
        <Typography variant="h6" sx={{ fontWeight: 700 }}>
          Create Slip Template
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
          Choose whether this template applies to all employees or a specific manager's employees.
        </Typography>
      </DialogTitle>

      <DialogContent>
        <Box sx={{ mt: 2, display: "flex", flexDirection: "column", gap: 2.5 }}>
          {/* Scope selector cards */}
          <Box sx={{ display: "flex", gap: 2 }}>
            {/* Global option */}
            <Paper
              onClick={() => setScope("global")}
              sx={{
                flex: 1,
                p: 2,
                cursor: "pointer",
                border: "2px solid",
                borderColor: scope === "global" ? "primary.main" : "#444",
                borderRadius: 2,
                backgroundColor: scope === "global" ? "rgba(33,150,243,0.08)" : "#2a2a2a",
                transition: "all 0.15s",
                "&:hover": { borderColor: "primary.main" },
              }}
            >
              <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1 }}>
                <Language sx={{ color: scope === "global" ? "primary.main" : "#888", fontSize: 28 }} />
                <Typography variant="subtitle1" sx={{ fontWeight: 700, color: scope === "global" ? "primary.main" : "#ccc" }}>
                  Global
                </Typography>
              </Box>
              <Typography variant="body2" color="text.secondary" sx={{ fontSize: 12 }}>
                One template for all employees. Logo, stamp and signature are resolved per-manager automatically at print time.
              </Typography>
            </Paper>

            {/* Manager option */}
            <Paper
              onClick={() => setScope("manager")}
              sx={{
                flex: 1,
                p: 2,
                cursor: "pointer",
                border: "2px solid",
                borderColor: scope === "manager" ? "#9c27b0" : "#444",
                borderRadius: 2,
                backgroundColor: scope === "manager" ? "rgba(156,39,176,0.08)" : "#2a2a2a",
                transition: "all 0.15s",
                "&:hover": { borderColor: "#9c27b0" },
              }}
            >
              <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1 }}>
                <SupervisorAccount sx={{ color: scope === "manager" ? "#ce93d8" : "#888", fontSize: 28 }} />
                <Typography variant="subtitle1" sx={{ fontWeight: 700, color: scope === "manager" ? "#ce93d8" : "#ccc" }}>
                  Per Manager
                </Typography>
              </Box>
              <Typography variant="body2" color="text.secondary" sx={{ fontSize: 12 }}>
                Custom layout for one manager's employees. Manager-specific logo, stamp and signature are embedded directly.
              </Typography>
            </Paper>
          </Box>

          {/* Manager selector */}
          {scope === "manager" && (
            <FormControl fullWidth>
              <InputLabel>Select Manager</InputLabel>
              <Select
                value={managerId}
                label="Select Manager"
                onChange={(e) => setManagerId(e.target.value)}
              >
                {managers.length === 0 ? (
                  <MenuItem disabled>No managers found</MenuItem>
                ) : (
                  managers.map((m) => (
                    <MenuItem key={m.id} value={m.id}>
                      {m.name}
                    </MenuItem>
                  ))
                )}
              </Select>
            </FormControl>
          )}

          {/* Template name */}
          <TextField
            label="Template Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={defaultName}
            fullWidth
            helperText="Leave blank to use the default name"
          />
        </Box>
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          variant="contained"
          disabled={!canConfirm}
          onClick={() => onConfirm(scope, scope === "manager" ? managerId : null, name || defaultName)}
        >
          Design Template →
        </Button>
      </DialogActions>
    </Dialog>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function SlipTemplateDesigner() {
  const { currentUser } = useAuth();
  const companyId = currentUser?.uid ?? "";

  const [templates, setTemplates] = useState<SlipTemplate[]>([]);
  const [managers, setManagers] = useState<ManagerInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [alert, setAlert] = useState<{ type: "success" | "error"; message: string } | null>(null);

  // Which template is open in the canvas (null = list view)
  const [canvasTemplate, setCanvasTemplate] = useState<SlipTemplate | null>(null);

  // Scope dialog
  const [scopeOpen, setScopeOpen] = useState(false);

  // Delete confirm
  const [deleteId, setDeleteId] = useState<string | null>(null);

  // ── Load ──────────────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    try {
      const [tmplSnap, mgrSnap] = await Promise.all([
        slipTemplateService.getAll(companyId),
        getDocs(query(collection(db, "managers"), where("companyId", "==", companyId))),
      ]);
      setTemplates(tmplSnap);
      setManagers(
        mgrSnap.docs.map((d) => ({
          id: d.id,
          name: d.data().fullName || d.data().name || d.data().email || "Unknown",
        }))
      );
    } catch {
      setAlert({ type: "error", message: "Failed to load templates" });
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    load();
  }, [load]);

  // ── Create new template ───────────────────────────────────────────────────

  const handleCreate = async (
    scope: "global" | "manager",
    managerId: string | null,
    name: string
  ) => {
    setScopeOpen(false);
    const draft: SlipTemplate = {
      id: "",
      name,
      companyId,
      scope,
      managerId,
      canvasWidth: DEFAULT_CANVAS_WIDTH,
      canvasHeight: DEFAULT_CANVAS_HEIGHT,
      elements: [],
      createdAt: new Date(),
      updatedAt: new Date(),
      createdBy: currentUser?.uid ?? "",
    };
    setCanvasTemplate(draft);
  };

  // ── Duplicate template ────────────────────────────────────────────────────

  const handleDuplicate = (tmpl: SlipTemplate) => {
    setCanvasTemplate({
      ...tmpl,
      id: "",
      name: `${tmpl.name} (Copy)`,
    });
  };

  // ── Delete ────────────────────────────────────────────────────────────────

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      await slipTemplateService.delete(deleteId);
      setAlert({ type: "success", message: "Template deleted" });
      setDeleteId(null);
      await load();
    } catch {
      setAlert({ type: "error", message: "Failed to delete template" });
    }
  };

  // ── Save callback from canvas ─────────────────────────────────────────────

  const handleCanvasSave = async (tmpl: SlipTemplate) => {
    try {
      if (!tmpl.id) {
        // new
        const id = await slipTemplateService.create(companyId, currentUser?.uid ?? "", {
          name: tmpl.name,
          scope: tmpl.scope,
          managerId: tmpl.managerId,
          canvasWidth: tmpl.canvasWidth,
          canvasHeight: tmpl.canvasHeight,
          elements: tmpl.elements,
        });
        setCanvasTemplate({ ...tmpl, id });
      } else {
        await slipTemplateService.update(tmpl.id, {
          name: tmpl.name,
          scope: tmpl.scope,
          managerId: tmpl.managerId,
          canvasWidth: tmpl.canvasWidth,
          canvasHeight: tmpl.canvasHeight,
          elements: tmpl.elements,
        });
      }
      setAlert({ type: "success", message: "Template saved" });
      await load();
    } catch {
      setAlert({ type: "error", message: "Failed to save template" });
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────

  if (canvasTemplate) {
    return (
      <Box>
        {alert && (
          <Alert severity={alert.type} onClose={() => setAlert(null)} sx={{ mb: 2 }}>
            {alert.message}
          </Alert>
        )}
        <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 2 }}>
          <Button
            startIcon={<ArrowBack />}
            onClick={() => { setCanvasTemplate(null); load(); }}
            variant="outlined"
            size="small"
          >
            Back to Templates
          </Button>
        </Box>
        <SlipTemplateCanvas
          template={canvasTemplate}
          managers={managers}
          onSave={handleCanvasSave}
          onBack={() => { setCanvasTemplate(null); load(); }}
        />
      </Box>
    );
  }

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight={300}>
        <CircularProgress />
      </Box>
    );
  }

  const globalTemplates = templates.filter((t) => t.scope === "global");
  const managerTemplates = templates.filter((t) => t.scope === "manager");

  return (
    <Box sx={{ p: 3 }}>
      {alert && (
        <Alert severity={alert.type} onClose={() => setAlert(null)} sx={{ mb: 2 }}>
          {alert.message}
        </Alert>
      )}

      {/* Header */}
      <Box sx={{ display: "flex", alignItems: "center", mb: 3 }}>
        <Box sx={{ flex: 1 }}>
          <Typography variant="h5" sx={{ fontWeight: 700, color: "#fff" }}>
            Slip Templates
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Design the layout of salary slips. Global templates auto-assign manager assets; per-manager templates embed specific branding.
          </Typography>
        </Box>
        <Button
          variant="contained"
          startIcon={<Add />}
          onClick={() => setScopeOpen(true)}
          sx={{ backgroundColor: "#2196f3" }}
        >
          Add Template
        </Button>
      </Box>

      {templates.length === 0 ? (
        <Paper
          sx={{
            p: 6,
            textAlign: "center",
            backgroundColor: "#2a2a2a",
            border: "1px dashed #555",
            borderRadius: 2,
          }}
        >
          <Typography variant="h6" color="text.secondary" sx={{ mb: 1 }}>
            No slip templates yet
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            Create a global template (one layout for all) or per-manager templates with custom branding.
          </Typography>
          <Button variant="contained" startIcon={<Add />} onClick={() => setScopeOpen(true)}>
            Create First Template
          </Button>
        </Paper>
      ) : (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 3 }}>
          {/* Global templates */}
          {globalTemplates.length > 0 && (
            <Box>
              <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1.5 }}>
                <Language sx={{ color: "#2196f3", fontSize: 20 }} />
                <Typography variant="subtitle1" sx={{ fontWeight: 700, color: "#2196f3" }}>
                  Global Templates
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  — applied to all employees (manager assets auto-resolved at print time)
                </Typography>
              </Box>
              <Box sx={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 2 }}>
                {globalTemplates.map((tmpl) => (
                  <TemplateCard
                    key={tmpl.id}
                    template={tmpl}
                    managers={managers}
                    onEdit={() => setCanvasTemplate(tmpl)}
                    onDuplicate={() => handleDuplicate(tmpl)}
                    onDelete={() => setDeleteId(tmpl.id)}
                  />
                ))}
              </Box>
            </Box>
          )}

          {/* Manager templates */}
          {managerTemplates.length > 0 && (
            <Box>
              <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1.5 }}>
                <SupervisorAccount sx={{ color: "#ce93d8", fontSize: 20 }} />
                <Typography variant="subtitle1" sx={{ fontWeight: 700, color: "#ce93d8" }}>
                  Per-Manager Templates
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  — specific layout per manager's team
                </Typography>
              </Box>
              <Box sx={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 2 }}>
                {managerTemplates.map((tmpl) => (
                  <TemplateCard
                    key={tmpl.id}
                    template={tmpl}
                    managers={managers}
                    onEdit={() => setCanvasTemplate(tmpl)}
                    onDuplicate={() => handleDuplicate(tmpl)}
                    onDelete={() => setDeleteId(tmpl.id)}
                  />
                ))}
              </Box>
            </Box>
          )}
        </Box>
      )}

      {/* Scope dialog */}
      <ScopeDialog
        open={scopeOpen}
        managers={managers}
        onConfirm={handleCreate}
        onClose={() => setScopeOpen(false)}
      />

      {/* Delete confirm */}
      <Dialog open={!!deleteId} onClose={() => setDeleteId(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Delete Template?</DialogTitle>
        <DialogContent>
          <Typography>This will permanently delete the slip template.</Typography>
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

// ─── Template card ────────────────────────────────────────────────────────────

function TemplateCard({
  template,
  managers,
  onEdit,
  onDuplicate,
  onDelete,
}: {
  template: SlipTemplate;
  managers: ManagerInfo[];
  onEdit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const managerName =
    template.managerId
      ? managers.find((m) => m.id === template.managerId)?.name ?? "Unknown Manager"
      : null;

  return (
    <Card
      sx={{
        backgroundColor: "#2a2a2a",
        border: "1px solid #3a3a3a",
        borderRadius: 2,
        "&:hover": { borderColor: template.scope === "global" ? "#2196f3" : "#9c27b0" },
        transition: "border-color 0.15s",
      }}
    >
      <CardContent sx={{ pb: 1 }}>
        {/* Scope badge */}
        <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1 }}>
          <Chip
            size="small"
            icon={template.scope === "global" ? <Language sx={{ fontSize: 14 }} /> : <SupervisorAccount sx={{ fontSize: 14 }} />}
            label={template.scope === "global" ? "Global" : managerName ?? "Manager"}
            color={template.scope === "global" ? "primary" : "secondary"}
            variant="outlined"
            sx={{ fontSize: 11 }}
          />
        </Box>

        <Typography variant="subtitle1" sx={{ fontWeight: 700, color: "#fff", mb: 0.5 }}>
          {template.name}
        </Typography>

        <Typography variant="caption" color="text.secondary">
          {template.elements.length} elements · {template.canvasWidth}×{template.canvasHeight}px
        </Typography>

        {/* Element type summary */}
        {template.elements.length > 0 && (
          <Box sx={{ display: "flex", gap: 0.5, mt: 1, flexWrap: "wrap" }}>
            {[...new Set(template.elements.map((e) => e.type))].map((type) => (
              <Chip
                key={type}
                label={type}
                size="small"
                sx={{ fontSize: 10, height: 18 }}
                variant="outlined"
              />
            ))}
          </Box>
        )}
      </CardContent>

      <Divider sx={{ borderColor: "#3a3a3a" }} />

      <CardActions sx={{ px: 1, py: 0.5 }}>
        <Tooltip title="Edit / Design">
          <IconButton size="small" onClick={onEdit} sx={{ color: "#2196f3" }}>
            <Edit fontSize="small" />
          </IconButton>
        </Tooltip>
        <Tooltip title="Duplicate">
          <IconButton size="small" onClick={onDuplicate} sx={{ color: "#ff9800" }}>
            <ContentCopy fontSize="small" />
          </IconButton>
        </Tooltip>
        <Tooltip title="Delete">
          <IconButton size="small" onClick={onDelete} sx={{ color: "#f44336" }}>
            <Delete fontSize="small" />
          </IconButton>
        </Tooltip>
      </CardActions>
    </Card>
  );
}
