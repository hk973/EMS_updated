"use client";

import React, { useState } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Box,
  Typography,
  Alert,
} from "@mui/material";
import { LoadingButton } from "../ui/LoadingButton";

interface PasswordRequirement {
  /** Manager firestore doc ID */
  managerId: string;
  /** Human-readable manager name */
  managerName: string;
  /** The expected password for this manager */
  expectedPassword: string;
}

interface DeletePasswordDialogProps {
  open: boolean;
  /** "manager" | "employee" — used for display text */
  entityType: "manager" | "employee";
  /** Human-readable name of the entity being deleted (e.g. "John Doe", "2 employees") */
  entityLabel: string;
  /** List of managers whose passwords are required. For single delete, array of 1 element */
  passwordRequirements: PasswordRequirement[];
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
}

/**
 * Reusable password confirmation dialog for manager and employee deletions.
 * 
 * Supports:
 * - Single manager deletion (admin must enter managerDeletePassword)
 * - Single employee deletion (manager or admin must enter employeeDeletePassword)
 * - Bulk employee deletion across multiple managers (must enter each manager's employeeDeletePassword)
 */
export default function DeletePasswordDialog({
  open,
  entityType,
  entityLabel,
  passwordRequirements,
  onConfirm,
  onCancel,
}: DeletePasswordDialogProps) {
  const [passwords, setPasswords] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleConfirm = async () => {
    setError("");

    // Validate all passwords match
    const missingOrWrong = passwordRequirements.find(
      (req) => passwords[req.managerId]?.trim() !== req.expectedPassword
    );

    if (missingOrWrong) {
      setError(
        `Incorrect password for ${missingOrWrong.managerName}. Please try again.`
      );
      return;
    }

    // All passwords correct
    setIsLoading(true);
    try {
      await onConfirm();
      // Success — parent will close the dialog
      setPasswords({});
      setError("");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Delete operation failed."
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleClose = () => {
    if (isLoading) return;
    setPasswords({});
    setError("");
    onCancel();
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ color: "#f44336", pb: 1 }}>
        Confirm Delete: {entityLabel}
      </DialogTitle>
      <DialogContent>
        <Typography variant="body2" sx={{ color: "#b0b0b0", mb: 2 }}>
          {entityType === "manager"
            ? "Deleting this manager will permanently remove all assigned employees and their records (attendance, payroll, salary slips, notifications). This cannot be undone."
            : "Deleting employee(s) will permanently remove all their records (attendance, payroll, salary slips, notifications). This cannot be undone."}
        </Typography>

        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {passwordRequirements.map((req) => (
            <TextField
              key={req.managerId}
              label={
                passwordRequirements.length > 1
                  ? `Password for ${req.managerName}`
                  : "Delete Password"
              }
              type="password"
              fullWidth
              value={passwords[req.managerId] || ""}
              onChange={(e) =>
                setPasswords((prev) => ({
                  ...prev,
                  [req.managerId]: e.target.value,
                }))
              }
              placeholder="Enter delete password"
              autoComplete="off"
              disabled={isLoading}
            />
          ))}
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose} disabled={isLoading}>
          Cancel
        </Button>
        <LoadingButton
          onClick={handleConfirm}
          variant="contained"
          isLoading={isLoading}
          sx={{
            backgroundColor: "#b71c1c",
            "&:hover": { backgroundColor: "#7f0000" },
          }}
        >
          Delete
        </LoadingButton>
      </DialogActions>
    </Dialog>
  );
}
