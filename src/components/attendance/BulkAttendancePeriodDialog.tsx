"use client";

import React, { useState, useCallback } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography,
  FormControl,
  Select,
  MenuItem,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  TableContainer,
  Paper,
  Chip,
  CircularProgress,
  Alert,
  Tooltip,
  Popover,
  IconButton,
} from "@mui/material";
import { DatePicker } from "@mui/x-date-pickers/DatePicker";
import { LocalizationProvider } from "@mui/x-date-pickers/LocalizationProvider";
import { AdapterDateFns } from "@mui/x-date-pickers/AdapterDateFns";
import {
  Save,
  Close,
  CalendarToday,
  Download,
  Upload,
} from "@mui/icons-material";

import {
  collection,
  getDocs,
  query,
  where,
  doc,
  writeBatch,
  Timestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Employee } from "@/types";
import { useAuth } from "@/contexts/AuthContext";
import { useAsyncAction } from "@/lib/useAsyncAction";
import { LoadingButton } from "@/components/ui/LoadingButton";
import { eachDayOfInterval, format, differenceInCalendarDays } from "date-fns";
import {
  AttendanceGrid,
  bulkFillColumn,
  bulkFillRow,
  buildAttendanceBatchEntries,
} from "@/lib/attendanceDeductionUtils";
import { isEmployeeActiveOn, getEmployeeMonthActivity } from "@/lib/employeeStatus";

import * as XLSX from "xlsx";

// ─── Excel helpers ────────────────────────────────────────────────────────────

const VALID_STATUSES = new Set(["present", "absent", "half-day", "leave", "paid-leave", "working-holiday"]);

/** Export current grid (with existing data pre-filled) as .xlsx */
function exportGridToExcel(
  employees: Employee[],
  dateKeys: string[],
  grid: AttendanceGrid,
  startDate: Date,
  endDate: Date,
) {
  const year = startDate.getFullYear();
  const month = startDate.getMonth() + 1;

  const header = ["Employee ID", "Employee", ...dateKeys];
  const rows = employees
    .filter((emp) => getEmployeeMonthActivity(emp, year, month).includeInMonth)
    .map((emp) => {
      const row: string[] = [emp.employeeId || emp.id, emp.fullName];
      for (const dk of dateKeys) {
        const date = new Date(dk + "T00:00:00");
        if (!isEmployeeActiveOn(emp, date)) {
          row.push("Inactive");
        } else {
          row.push(grid[emp.id]?.[dk] ?? "");
        }
      }
      return row;
    });

  const ws = XLSX.utils.aoa_to_sheet([header, ...rows]);
  // Column widths
  ws["!cols"] = [{ wch: 14 }, { wch: 24 }, ...dateKeys.map(() => ({ wch: 12 }))];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Attendance");
  const startStr = format(startDate, "yyyy-MM-dd");
  const endStr = format(endDate, "yyyy-MM-dd");
  XLSX.writeFile(wb, `attendance_${startStr}_${endStr}.xlsx`);
}

/** Parse uploaded .xlsx and return a partial grid (only valid, non-empty cells) */
function parseExcelToGrid(
  file: File,
  employees: Employee[],
  dateKeys: string[],
): Promise<AttendanceGrid> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target!.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: "array" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows: string[][] = XLSX.utils.sheet_to_json(ws, { header: 1 });

        if (rows.length < 2) return resolve({});

        const headerRow = rows[0].map((h) => String(h ?? "").trim());

        // Map employeeId (e.g. "EMP001") → Firestore doc id
        const empIdToDocId = new Map(employees.map((e) => [e.employeeId?.trim(), e.id]));
        // Fallback: name → doc id (for backwards compat)
        const nameToDocId = new Map(employees.map((e) => [e.fullName.trim(), e.id]));

        // Detect which column holds the employee identifier
        const empIdColIndex = headerRow.findIndex(
          (h) => h.toLowerCase() === "employee id" || h.toLowerCase() === "employeeid",
        );
        const empNameColIndex = headerRow.findIndex(
          (h) => h.toLowerCase() === "employee" || h.toLowerCase() === "name",
        );

        // Date columns start after the last identifier column
        const firstDateCol = Math.max(empIdColIndex, empNameColIndex) + 1;

        const partial: AttendanceGrid = {};
        for (let r = 1; r < rows.length; r++) {
          const row = rows[r];

          // Resolve Firestore doc id — prefer Employee ID column, fall back to name
          let docId: string | undefined;
          if (empIdColIndex >= 0) {
            const rawEmpId = String(row[empIdColIndex] ?? "").trim();
            docId = empIdToDocId.get(rawEmpId);
          }
          if (!docId && empNameColIndex >= 0) {
            const empName = String(row[empNameColIndex] ?? "").trim();
            docId = nameToDocId.get(empName);
          }
          if (!docId) continue;

          for (let c = firstDateCol; c < headerRow.length; c++) {
            const dk = headerRow[c].trim();
            if (!dateKeys.includes(dk)) continue;
            const rawStatus = String(row[c] ?? "").trim().toLowerCase();
            if (!rawStatus) continue;
            if (!VALID_STATUSES.has(rawStatus)) continue;
            if (!partial[docId]) partial[docId] = {};
            partial[docId][dk] = rawStatus;
          }
        }
        resolve(partial);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}

// ─── Constants ────────────────────────────────────────────────────────────────

const ATTENDANCE_STATUSES = [
  { value: "present", label: "Present", color: "success" as const },
  { value: "absent", label: "Absent", color: "error" as const },
  { value: "half-day", label: "Half Day", color: "warning" as const },
  { value: "leave", label: "Leave", color: "info" as const },
  { value: "paid-leave", label: "Paid Leave", color: "secondary" as const },
  { value: "working-holiday", label: "Working Holiday", color: "primary" as const },
];

const MAX_PERIOD_DAYS = 62;

// ─── Types ────────────────────────────────────────────────────────────────────

export interface BulkAttendancePeriodDialogProps {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  employees: Employee[];
}

// ─── AttendanceGrid sub-component ────────────────────────────────────────────

interface AttendanceGridProps {
  employees: Employee[];
  dateKeys: string[];
  grid: AttendanceGrid;
  onCellChange: (employeeId: string, dateKey: string, status: string) => void;
  onBulkFillColumn: (dateKey: string, status: string) => void;
  onBulkFillRow: (employeeId: string, status: string) => void;
}

function AttendanceGridTable({
  employees,
  dateKeys,
  grid,
  onCellChange,
  onBulkFillColumn,
  onBulkFillRow,
}: AttendanceGridProps) {
  // Popover state for column header bulk-fill
  const [colAnchor, setColAnchor] = useState<{
    el: HTMLElement;
    dateKey: string;
  } | null>(null);
  const [colStatus, setColStatus] = useState("present");

  // Popover state for row header bulk-fill
  const [rowAnchor, setRowAnchor] = useState<{
    el: HTMLElement;
    employeeId: string;
  } | null>(null);
  const [rowStatus, setRowStatus] = useState("present");

  return (
    <>
      <TableContainer
        component={Paper}
        sx={{ maxHeight: 420, overflow: "auto" }}
      >
        <Table size="small" stickyHeader>
          <TableHead>
            <TableRow>
              {/* Employee ID column */}
              <TableCell
                sx={{
                  minWidth: 110,
                  position: "sticky",
                  left: 0,
                  zIndex: 3,
                  bgcolor: "background.paper",
                  fontWeight: 700,
                }}
              >
                Emp ID
              </TableCell>
              {/* Employee name column */}
              <TableCell
                sx={{
                  minWidth: 160,
                  position: "sticky",
                  left: 110,
                  zIndex: 3,
                  bgcolor: "background.paper",
                  fontWeight: 700,
                }}
              >
                Employee
              </TableCell>
              {dateKeys.map((dk) => (
                <TableCell
                  key={dk}
                  align="center"
                  sx={{ minWidth: 110, cursor: "pointer", fontWeight: 600 }}
                  onClick={(e) =>
                    setColAnchor({ el: e.currentTarget, dateKey: dk })
                  }
                >
                  <Tooltip title="Click to bulk-fill this day">
                    <span>{dk}</span>
                  </Tooltip>
                </TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {employees.map((emp) => (
              <TableRow key={emp.id}>
                {/* Employee ID cell */}
                <TableCell
                  sx={{
                    position: "sticky",
                    left: 0,
                    zIndex: 1,
                    bgcolor: "background.paper",
                    fontWeight: 500,
                    fontSize: "0.75rem",
                    color: "text.secondary",
                  }}
                >
                  {emp.employeeId || emp.id}
                </TableCell>
                {/* Row header — click to bulk-fill employee */}
                <TableCell
                  sx={{
                    position: "sticky",
                    left: 110,
                    zIndex: 1,
                    bgcolor: "background.paper",
                    cursor: "pointer",
                    fontWeight: 500,
                  }}
                  onClick={(e) =>
                    setRowAnchor({ el: e.currentTarget, employeeId: emp.id })
                  }
                >
                  <Tooltip title="Click to bulk-fill this employee">
                    <Box>
                      <Typography variant="body2">{emp.fullName}</Typography>
                      {(() => {
                        const date = dateKeys.length > 0 ? new Date(dateKeys[0] + "T00:00:00") : new Date();
                        const activity = getEmployeeMonthActivity(emp, date.getFullYear(), date.getMonth() + 1);
                        return activity.label ? (
                          <Typography variant="caption" color="text.secondary" display="block">
                            {activity.label}
                          </Typography>
                        ) : null;
                      })()}
                    </Box>
                  </Tooltip>
                </TableCell>
                {dateKeys.map((dk) => {
                  const date = new Date(dk + "T00:00:00");
                  const isActive = isEmployeeActiveOn(emp, date);
                  const status = grid[emp.id]?.[dk] ?? "";
                  return (
                    <TableCell key={dk} align="center" sx={{ p: 0.5 }}>
                      {isActive ? (
                        <FormControl size="small" sx={{ minWidth: 100 }}>
                          <Select
                            value={status}
                            onChange={(e) =>
                              onCellChange(emp.id, dk, e.target.value)
                            }
                            displayEmpty
                            sx={{ fontSize: "0.75rem" }}
                          >
                            <MenuItem value="">
                              <em style={{ fontSize: "0.75rem" }}>—</em>
                            </MenuItem>
                            {ATTENDANCE_STATUSES.map((s) => (
                              <MenuItem key={s.value} value={s.value}>
                                <Chip
                                  label={s.label}
                                  color={s.color}
                                  size="small"
                                  sx={{ fontSize: "0.65rem", height: 20 }}
                                />
                              </MenuItem>
                            ))}
                          </Select>
                        </FormControl>
                      ) : (
                        <Typography variant="caption" color="text.disabled">Inactive</Typography>
                      )}
                    </TableCell>
                  );
                })}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      {/* Column bulk-fill popover */}
      <Popover
        open={Boolean(colAnchor)}
        anchorEl={colAnchor?.el}
        onClose={() => setColAnchor(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
        transformOrigin={{ vertical: "top", horizontal: "center" }}
      >
        <Box sx={{ p: 2, minWidth: 200 }}>
          <Typography variant="subtitle2" gutterBottom>
            Fill all employees — {colAnchor?.dateKey}
          </Typography>
          <FormControl fullWidth size="small" sx={{ mb: 1 }}>
            <Select
              value={colStatus}
              onChange={(e) => setColStatus(e.target.value)}
            >
              {ATTENDANCE_STATUSES.map((s) => (
                <MenuItem key={s.value} value={s.value}>
                  <Chip label={s.label} color={s.color} size="small" />
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <Button
            variant="contained"
            size="small"
            fullWidth
            onClick={() => {
              if (colAnchor) {
                onBulkFillColumn(colAnchor.dateKey, colStatus);
                setColAnchor(null);
              }
            }}
          >
            Apply
          </Button>
        </Box>
      </Popover>

      {/* Row bulk-fill popover */}
      <Popover
        open={Boolean(rowAnchor)}
        anchorEl={rowAnchor?.el}
        onClose={() => setRowAnchor(null)}
        anchorOrigin={{ vertical: "center", horizontal: "right" }}
        transformOrigin={{ vertical: "center", horizontal: "left" }}
      >
        <Box sx={{ p: 2, minWidth: 200 }}>
          <Typography variant="subtitle2" gutterBottom>
            Fill all days for employee
          </Typography>
          <FormControl fullWidth size="small" sx={{ mb: 1 }}>
            <Select
              value={rowStatus}
              onChange={(e) => setRowStatus(e.target.value)}
            >
              {ATTENDANCE_STATUSES.map((s) => (
                <MenuItem key={s.value} value={s.value}>
                  <Chip label={s.label} color={s.color} size="small" />
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <Button
            variant="contained"
            size="small"
            fullWidth
            onClick={() => {
              if (rowAnchor) {
                onBulkFillRow(rowAnchor.employeeId, rowStatus);
                setRowAnchor(null);
              }
            }}
          >
            Apply
          </Button>
        </Box>
      </Popover>
    </>
  );
}

// ─── BulkAttendancePeriodDialog ───────────────────────────────────────────────

export default function BulkAttendancePeriodDialog({
  open,
  onClose,
  onSaved,
  employees,
}: BulkAttendancePeriodDialogProps) {
  const { currentUser } = useAuth();

  const [startDate, setStartDate] = useState<Date | null>(null);
  const [endDate, setEndDate] = useState<Date | null>(null);
  const [dateKeys, setDateKeys] = useState<string[]>([]);
  const [grid, setGrid] = useState<AttendanceGrid>({});
  const [loading, setLoading] = useState(false);
  const [rangeError, setRangeError] = useState("");
  const [gridReady, setGridReady] = useState(false);
  const [fetchError, setFetchError] = useState("");
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const {
    execute: executeSave,
    isLoading: saving,
    error: saveError,
    clearError: clearSaveError,
  } = useAsyncAction<void>();

  const {
    execute: executeUpload,
    isLoading: uploading,
    error: uploadError,
    clearError: clearUploadError,
  } = useAsyncAction<void>();

  const handleExcelUpload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      clearUploadError();
      // Reset input immediately so the same file can be re-selected after upload
      const inputEl = e.target;
      await executeUpload(async () => {
        const partial = await parseExcelToGrid(file, employees, dateKeys);
        setGrid((prev) => {
          const merged = { ...prev };
          for (const empId of Object.keys(partial)) {
            merged[empId] = { ...(merged[empId] ?? {}), ...partial[empId] };
          }
          return merged;
        });
      });
      inputEl.value = "";
    },
    [employees, dateKeys, executeUpload, clearUploadError],
  );

  // ── Date range validation & grid fetch ──────────────────────────────────────

  const validateAndLoadGrid = useCallback(async () => {
    setRangeError("");
    setGridReady(false);

    if (!startDate || !endDate) {
      setRangeError("Please select both start and end dates.");
      return;
    }
    if (startDate > endDate) {
      setRangeError("Start date must be on or before end date.");
      return;
    }
    const span = differenceInCalendarDays(endDate, startDate) + 1;
    if (span > MAX_PERIOD_DAYS) {
      setRangeError(
        `Period spans ${span} days — maximum allowed is ${MAX_PERIOD_DAYS} days.`,
      );
      return;
    }

    // Build date keys
    const days = eachDayOfInterval({ start: startDate, end: endDate });
    const keys = days.map((d) => format(d, "yyyy-MM-dd"));
    setDateKeys(keys);

    // Fetch existing attendance from Firestore
    setLoading(true);
    setFetchError("");
    try {
      const startTs = Timestamp.fromDate(
        new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate(), 0, 0, 0),
      );
      const endTs = Timestamp.fromDate(
        new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate(), 23, 59, 59),
      );

      const q = query(
        collection(db, "attendance"),
        where("date", ">=", startTs),
        where("date", "<=", endTs),
      );
      const snapshot = await getDocs(q);

    // Build initial grid: all employees × all days = ""
    const initialGrid: AttendanceGrid = {};
    const year = startDate.getFullYear();
    const month = startDate.getMonth() + 1;

    const includedEmployees = employees.filter((emp) => {
      const activity = getEmployeeMonthActivity(emp, year, month);
      return activity.includeInMonth;
    });

    for (const emp of includedEmployees) {
      initialGrid[emp.id] = {};
      for (const dk of keys) {
        initialGrid[emp.id][dk] = "";
      }
    }

    // Overlay fetched records
    snapshot.docs.forEach((docSnap) => {
      const data = docSnap.data();
      const empId: string = data.employeeId;
      const dateVal = data.date?.toDate ? data.date.toDate() : new Date(data.date);
      const dk = format(dateVal, "yyyy-MM-dd");
      if (initialGrid[empId] && keys.includes(dk)) {
        initialGrid[empId][dk] = data.status ?? "";
      }
    });

      setGrid(initialGrid);
      setGridReady(true);
    } catch (err) {
      console.error("Error fetching attendance:", err);
      setFetchError("Failed to load attendance data. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate, employees]);

  // ── Grid mutation handlers ───────────────────────────────────────────────────

  const handleCellChange = useCallback(
    (employeeId: string, dateKey: string, status: string) => {
      setGrid((prev) => ({
        ...prev,
        [employeeId]: { ...(prev[employeeId] ?? {}), [dateKey]: status },
      }));
    },
    [],
  );

  const handleBulkFillColumn = useCallback(
    (dateKey: string, status: string) => {
      setGrid((prev) =>
        bulkFillColumn(
          prev,
          employees.map((e) => e.id),
          dateKey,
          status,
        ),
      );
    },
    [employees],
  );

  const handleBulkFillRow = useCallback(
    (employeeId: string, status: string) => {
      setGrid((prev) => bulkFillRow(prev, employeeId, dateKeys, status));
    },
    [dateKeys],
  );

  // ── Save ─────────────────────────────────────────────────────────────────────

  const handleSave = async () => {
    if (!currentUser || !startDate || !endDate) return;
    clearSaveError();

    await executeSave(async () => {
      const companyId = currentUser.companyId || currentUser.uid;
      const batch = writeBatch(db);

      // Write one attendance doc per employee-day cell
      const entries = buildAttendanceBatchEntries(
        grid,
        employees.map((e) => e.id),
        dateKeys,
      );
      for (const entry of entries) {
        const dateObj = new Date(entry.dateKey + "T00:00:00");
        // Use a deterministic doc ID so re-saving overwrites instead of duplicating
        const docId = `${entry.employeeId}_${entry.dateKey}`;
        const docRef = doc(db, "attendance", docId);
        batch.set(docRef, {
          employeeId: entry.employeeId,
          date: Timestamp.fromDate(dateObj),
          status: entry.status,
          markedBy: currentUser.uid,
          markedAt: Timestamp.now(),
        });
      }

      // Write attendancePeriodConfig doc
      const startStr = format(startDate, "yyyy-MM-dd");
      const endStr = format(endDate, "yyyy-MM-dd");
      const configDocId = `${companyId}_${startStr}_${endStr}`;
      const configRef = doc(db, "attendancePeriodConfig", configDocId);
      batch.set(configRef, {
        companyId,
        startDate: Timestamp.fromDate(startDate),
        endDate: Timestamp.fromDate(endDate),
        month: startDate.getMonth() + 1,
        year: startDate.getFullYear(),
        createdBy: currentUser.uid,
        createdAt: Timestamp.now(),
      });

      await batch.commit();
      onSaved();
      onClose();
    });
  };

  // ── Reset on close ───────────────────────────────────────────────────────────

  const handleClose = () => {
    if (saving) return;
    setStartDate(null);
    setEndDate(null);
    setDateKeys([]);
    setGrid({});
    setGridReady(false);
    setFetchError("");
    setRangeError("");
    clearSaveError();
    clearUploadError();
    onClose();
  };

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <LocalizationProvider dateAdapter={AdapterDateFns}>
      <Dialog
        open={open}
        onClose={handleClose}
        disableEscapeKeyDown={saving}
        maxWidth="xl"
        fullWidth
        PaperProps={{ sx: { minHeight: "80vh" } }}
      >
        <DialogTitle sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <CalendarToday fontSize="small" />
          Bulk Attendance Period Edit
          <IconButton
            onClick={handleClose}
            sx={{ ml: "auto" }}
            aria-label="close"
          >
            <Close />
          </IconButton>
        </DialogTitle>

        <DialogContent dividers>
          {/* Date range pickers */}
          <Box sx={{ display: "flex", gap: 2, mb: 2, flexWrap: "wrap", alignItems: "flex-end" }}>
            <DatePicker
              label="Start Date"
              value={startDate}
              onChange={(d) => {
                setStartDate(d);
                setGridReady(false);
              }}
              format="dd/MM/yyyy"
              slotProps={{ textField: { size: "small" } }}
            />
            <DatePicker
              label="End Date"
              value={endDate}
              onChange={(d) => {
                setEndDate(d);
                setGridReady(false);
              }}
              format="dd/MM/yyyy"
              slotProps={{ textField: { size: "small" } }}
            />
            <Button
              variant="contained"
              onClick={validateAndLoadGrid}
              disabled={loading}
              startIcon={loading ? <CircularProgress size={16} /> : undefined}
            >
              Load Grid
            </Button>
          </Box>

          {rangeError && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {rangeError}
            </Alert>
          )}
          {fetchError && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {fetchError}
            </Alert>
          )}
          {saveError && (
            <Alert severity="error" sx={{ mb: 2 }} onClose={clearSaveError}>
              {saveError}
            </Alert>
          )}

          {gridReady && (
            <Box sx={{ display: "flex", flexDirection: "column", gap: 3 }}>
              {/* Excel import/export toolbar */}
              <Box sx={{ display: "flex", gap: 1, alignItems: "center", flexWrap: "wrap" }}>
                <Button
                  size="small"
                  variant="outlined"
                  startIcon={<Download />}
                  onClick={() =>
                    exportGridToExcel(employees, dateKeys, grid, startDate!, endDate!)
                  }
                >
                  Download Excel
                </Button>
                <LoadingButton
                  size="small"
                  variant="outlined"
                  startIcon={<Upload />}
                  isLoading={uploading}
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                >
                  Upload Excel
                </LoadingButton>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xls"
                  style={{ display: "none" }}
                  onChange={handleExcelUpload}
                />
                <Typography variant="caption" color="text.secondary">
                  Download → fill in Excel → upload to populate the grid
                </Typography>
              </Box>

              {uploadError && (
                <Alert severity="error" onClose={clearUploadError}>
                  {uploadError}
                </Alert>
              )}

              {/* Attendance Grid */}
              <AttendanceGridTable
                employees={employees.filter(e => {
                  const date = startDate || new Date();
                  return getEmployeeMonthActivity(e, date.getFullYear(), date.getMonth() + 1).includeInMonth;
                })}
                dateKeys={dateKeys}
                grid={grid}
                onCellChange={handleCellChange}
                onBulkFillColumn={handleBulkFillColumn}
                onBulkFillRow={handleBulkFillRow}
              />
            </Box>
          )}
        </DialogContent>

        <DialogActions>
          <Button onClick={handleClose} startIcon={<Close />} disabled={saving}>
            Cancel
          </Button>
          <LoadingButton
            variant="contained"
            onClick={handleSave}
            disabled={!gridReady}
            isLoading={saving}
            startIcon={<Save />}
          >
            Save Period
          </LoadingButton>
        </DialogActions>
      </Dialog>
    </LocalizationProvider>
  );
}
