"use client";

import React, { useState } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Chip,
} from "@mui/material";
import { LoadingButton } from "@/components/ui/LoadingButton";

// ─── Types ────────────────────────────────────────────────────────────────────

interface BulkAttendanceEditDialogProps {
  open: boolean;
  onClose: () => void;
  /** Called with the chosen status when the user clicks "Apply to All". */
  onApply: (status: string) => void;
}

const attendanceStatuses = [
  { value: "present", label: "Present", color: "success" as const },
  { value: "absent", label: "Absent", color: "error" as const },
  { value: "half-day", label: "Half Day", color: "warning" as const },
  { value: "leave", label: "Leave", color: "info" as const },
  { value: "paid-leave", label: "Paid Leave", color: "secondary" as const },
  { value: "working-holiday", label: "Working Holiday", color: "primary" as const },
];

// ─── Component ────────────────────────────────────────────────────────────────

export default function BulkAttendanceEditDialog({
  open,
  onClose,
  onApply,
}: BulkAttendanceEditDialogProps) {
  const [bulkStatus, setBulkStatus] = useState("");

  const handleApply = () => {
    if (!bulkStatus) return;
    onApply(bulkStatus);
    setBulkStatus("");
    onClose();
  };

  const handleClose = () => {
    setBulkStatus("");
    onClose();
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="xs" fullWidth>
      <DialogTitle>Bulk Edit Attendance Status</DialogTitle>
      <DialogContent>
        <FormControl fullWidth sx={{ mt: 2 }}>
          <InputLabel>Select Status</InputLabel>
          <Select
            value={bulkStatus}
            onChange={(e) => setBulkStatus(e.target.value)}
            label="Select Status"
          >
            {attendanceStatuses.map((status) => (
              <MenuItem key={status.value} value={status.value}>
                <Chip
                  label={status.label}
                  color={status.color}
                  size="small"
                  sx={{ minWidth: 80 }}
                />
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose}>Cancel</Button>
        <LoadingButton
          onClick={handleApply}
          variant="contained"
          isLoading={false}
          disabled={!bulkStatus}
          sx={{
            backgroundColor: "#2196f3",
            "&:hover": { backgroundColor: "#1976d2" },
          }}
        >
          Apply to All
        </LoadingButton>
      </DialogActions>
    </Dialog>
  );
}
