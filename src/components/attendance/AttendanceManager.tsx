"use client";

import React, { useState, useEffect, useMemo } from "react";
import {
  Box,
  Paper,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Button,
  Chip,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Alert,
  CircularProgress,
  Card,
  CardContent,
} from "@mui/material";
import { CheckCircle, Cancel, Schedule, Person, EventAvailable, Edit } from "@mui/icons-material";
import { DatePicker } from "@mui/x-date-pickers/DatePicker";
import { LocalizationProvider } from "@mui/x-date-pickers/LocalizationProvider";
import { AdapterDateFns } from "@mui/x-date-pickers/AdapterDateFns";
import {
  collection,
  getDocs,
  addDoc,
  query,
  where,
  doc,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Employee } from "@/types";
import { useAuth } from "@/contexts/AuthContext";
import BulkAttendancePeriodDialog from "@/components/attendance/BulkAttendancePeriodDialog";
import { useAsyncAction, isRowLoading, revertAttendanceStatus } from "@/lib/useAsyncAction";
import { LoadingButton } from "@/components/ui/LoadingButton";
import { isEmployeeActiveOn, getEmployeeMonthActivity } from "@/lib/employeeStatus";

const attendanceStatuses = [
  { value: "present",    label: "Present",    color: "success"   as const },
  { value: "absent",     label: "Absent",     color: "error"     as const },
  { value: "half-day",   label: "Half Day",   color: "warning"   as const },
  { value: "leave",      label: "Leave",      color: "info"      as const },
  { value: "paid-leave", label: "Paid Leave", color: "secondary" as const },
  { value: "working-holiday", label: "Working Holiday", color: "primary" as const },
];

interface ManagerOption {
  id: string;
  name: string;
}

export default function AttendanceManager() {
  const { currentUser } = useAuth();
  const [employees,          setEmployees]          = useState<Employee[]>([]);
  const [managers,           setManagers]           = useState<ManagerOption[]>([]);
  const [selectedManagerId,  setSelectedManagerId]  = useState("all");
  const [attendanceData,     setAttendanceData]     = useState<Record<string, string>>({});
  const [selectedDate,       setSelectedDate]       = useState<Date>(new Date());
  const [loading,            setLoading]            = useState(true);
  const [savingRows,         setSavingRows]         = useState<Set<string>>(new Set());
  const [error,              setError]              = useState("");
  const [success,            setSuccess]            = useState("");
  const [showBulkPeriodDialog, setShowBulkPeriodDialog] = useState(false);
  const { execute: executeSave, isLoading: isSaving } = useAsyncAction<void>();

  // ── Load on mount ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!currentUser) return;
    fetchEmployees();
    if (currentUser.role === "admin") {
      loadManagers();
    } else {
      setManagers([]);
      setSelectedManagerId("all");
    }
  }, [currentUser]);

  useEffect(() => {
    if (employees.length > 0) fetchAttendanceForDate();
  }, [selectedDate, employees]);

  // ── Data fetchers ──────────────────────────────────────────────────────────
  const fetchEmployees = async () => {
    try {
      setLoading(true);
      let employeesQuery;
      if (currentUser?.role === "admin") {
        employeesQuery = query(
          collection(db, "employees"),
          where("companyId", "==", currentUser.uid),
        );
      } else if (currentUser?.role === "manager") {
        employeesQuery = query(
          collection(db, "employees"),
          where("companyId", "==", currentUser.companyId || ""),
        );
      } else {
        setEmployees([]);
        setLoading(false);
        return;
      }

      const snapshot = await getDocs(employeesQuery);
      let employeesData = snapshot.docs.map((d) => ({ id: d.id, ...d.data() })) as Employee[];

      if (currentUser?.role === "manager") {
        const managerIds = new Set<string>();
        employeesData.forEach((emp) => {
          if (Array.isArray(emp.assignedManagers))
            emp.assignedManagers.forEach((id: string) => managerIds.add(id));
        });

        const managersData = new Map<string, any>();
        if (managerIds.size > 0) {
          const snap = await getDocs(
            query(collection(db, "managers"), where("__name__", "in", Array.from(managerIds))),
          );
          snap.forEach((d) => managersData.set(d.id, d.data()));
        }

        let managerDocId: string | null = null;
        for (const [docId, mgr] of managersData.entries()) {
          if (mgr.email === currentUser.email) { managerDocId = docId; break; }
        }
        managerDocId = managerDocId || currentUser.uid;
        employeesData = employeesData.filter(
          (emp) => Array.isArray(emp.assignedManagers) && emp.assignedManagers.includes(managerDocId),
        );
      }

      employeesData.sort((a, b) => (a.fullName || "").localeCompare(b.fullName || ""));
      setEmployees(employeesData);
    } catch (err) {
      console.error("Error fetching employees:", err);
      setError("Failed to load employees");
    } finally {
      setLoading(false);
    }
  };

  const loadManagers = async () => {
    if (!currentUser || currentUser.role !== "admin") return;
    try {
      const snap = await getDocs(
        query(collection(db, "managers"), where("companyId", "==", currentUser.uid)),
      );
      setManagers(
        snap.docs.map((d) => ({
          id: d.id,
          name: d.data().fullName || d.data().name || d.data().email || "Unknown Manager",
        })),
      );
    } catch (err) {
      console.error("Error loading managers:", err);
    }
  };

  const fetchAttendanceForDate = async () => {
    try {
      const startOfDay = new Date(selectedDate); startOfDay.setHours(0, 0, 0, 0);
      const endOfDay   = new Date(selectedDate); endOfDay.setHours(23, 59, 59, 999);
      const snap = await getDocs(
        query(collection(db, "attendance"), where("date", ">=", startOfDay), where("date", "<=", endOfDay)),
      );
      const map: Record<string, string> = {};
      snap.docs.forEach((d) => { map[d.data().employeeId] = d.data().status; });
      setAttendanceData(map);
    } catch (err) {
      console.error("Error fetching attendance:", err);
    }
  };

  // ── Handlers ───────────────────────────────────────────────────────────────
  const handleAttendanceChange = (employeeId: string, status: string) => {
    const prev = { ...attendanceData };
    setAttendanceData((p) => ({ ...p, [employeeId]: status }));
    setSavingRows((p) => new Set(p).add(employeeId));

    addDoc(collection(db, "attendance"), {
      employeeId,
      date: selectedDate,
      status,
      markedBy: currentUser?.uid || "",
      markedAt: new Date(),
    })
      .catch((err) => {
        console.error("Error saving attendance row:", err);
        setError("Failed to save attendance for one employee. Reverting.");
        setAttendanceData((cur) => revertAttendanceStatus(cur, prev, employeeId));
      })
      .finally(() => {
        setSavingRows((p) => { const n = new Set(p); n.delete(employeeId); return n; });
      });
  };

  const handleSaveAttendance = async () => {
    await executeSave(async () => {
      setError(""); setSuccess("");
      const records = Object.entries(attendanceData).map(([employeeId, status]) => ({
        employeeId, date: selectedDate, status,
        markedBy: currentUser?.uid || "", markedAt: new Date(),
      }));
      for (const record of records) await addDoc(collection(db, "attendance"), record);
      setSuccess("Attendance saved successfully!");
      await fetchAttendanceForDate();
    }).catch((err) => {
      console.error("Error saving attendance:", err);
      setError("Failed to save attendance");
    });
  };

  // ── Derived values ─────────────────────────────────────────────────────────
  const filteredEmployees = useMemo(() => {
    const base = currentUser?.role === "admin" && selectedManagerId !== "all"
      ? employees.filter(
          (emp) => Array.isArray(emp.assignedManagers) && emp.assignedManagers.includes(selectedManagerId),
        )
      : employees;

    const year = selectedDate.getFullYear();
    const month = selectedDate.getMonth() + 1;

    return base.filter((emp) => {
      const activity = getEmployeeMonthActivity(emp, year, month);
      return activity.includeInMonth;
    });
  }, [employees, currentUser, selectedManagerId, selectedDate]);

  const stats = (() => {
    const s = { present: 0, absent: 0, "half-day": 0, leave: 0, "paid-leave": 0 };
    filteredEmployees.forEach((emp) => {
      if (!isEmployeeActiveOn(emp, selectedDate)) return;
      const st = attendanceData[emp.id];
      if (st && st in s) s[st as keyof typeof s]++;
    });
    return s;
  })();

  // ── Render ─────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
        <CircularProgress />
      </Box>
    );
  }

  return (
    <LocalizationProvider dateAdapter={AdapterDateFns}>
      <Box sx={{ p: { xs: 2, sm: 3 } }}>
        <Box sx={{ mb: 3 }}>
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
            Attendance Management
          </Typography>
          <Typography variant="body2" sx={{ color: "#94a3b8" }}>
            Track, mark, and update employee daily attendance records
          </Typography>
        </Box>

        {error   && <Alert severity="error"   sx={{ mb: 2 }}>{error}</Alert>}
        {success && <Alert severity="success" sx={{ mb: 2 }}>{success}</Alert>}

        {/* Action Toolbar & Filters */}
        <Paper
          elevation={0}
          sx={{
            mb: 3,
            p: 2.5,
            background: "rgba(255, 255, 255, 0.03)",
            backdropFilter: "blur(20px)",
            WebkitBackdropFilter: "blur(20px)",
            border: "1px solid rgba(255, 255, 255, 0.08)",
            borderRadius: "16px",
            display: "flex",
            flexDirection: { xs: "column", md: "row" },
            gap: 2,
            alignItems: { xs: "stretch", md: "center" },
            justifyContent: "space-between",
          }}
        >
          <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap", alignItems: "center", flex: 1 }}>
            {currentUser?.role === "admin" && (
              <FormControl size="small" sx={{ minWidth: 220 }}>
                <InputLabel id="attendance-manager-filter-label">Filter By Manager</InputLabel>
                <Select
                  labelId="attendance-manager-filter-label"
                  value={selectedManagerId}
                  label="Filter By Manager"
                  onChange={(e) => setSelectedManagerId(e.target.value)}
                >
                  <MenuItem value="all">All Managers</MenuItem>
                  {managers.map((m) => (
                    <MenuItem key={m.id} value={m.id}>{m.name}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            )}

            <DatePicker
              label="Select Date"
              value={selectedDate}
              onChange={(d) => setSelectedDate(d || new Date())}
              slotProps={{ textField: { size: "small", sx: { minWidth: 200 } } }}
            />
          </Box>

          <Button
            variant="outlined"
            startIcon={<Edit />}
            onClick={() => setShowBulkPeriodDialog(true)}
            sx={{
              borderRadius: "10px",
              borderColor: "rgba(99, 102, 241, 0.3)",
              color: "#a5b4fc",
              backgroundColor: "rgba(99, 102, 241, 0.06)",
              "&:hover": {
                borderColor: "rgba(99, 102, 241, 0.5)",
                backgroundColor: "rgba(99, 102, 241, 0.12)",
                transform: "translateY(-1px)",
              },
            }}
          >
            Bulk Edit Period
          </Button>
        </Paper>

        {/* Stats Cards */}
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            gap: 2,
            mb: 3,
          }}
        >
          {[
            {
              icon: <CheckCircle sx={{ fontSize: 28, color: "#34d399" }} />,
              value: stats.present,
              label: "Present",
              accent: "rgba(16, 185, 129, 0.12)",
              border: "rgba(16, 185, 129, 0.25)",
              glow: "rgba(16, 185, 129, 0.15)",
            },
            {
              icon: <Cancel sx={{ fontSize: 28, color: "#f87171" }} />,
              value: stats.absent,
              label: "Absent",
              accent: "rgba(239, 68, 68, 0.12)",
              border: "rgba(239, 68, 68, 0.25)",
              glow: "rgba(239, 68, 68, 0.15)",
            },
            {
              icon: <Schedule sx={{ fontSize: 28, color: "#fbbf24" }} />,
              value: stats["half-day"],
              label: "Half Day",
              accent: "rgba(245, 158, 11, 0.12)",
              border: "rgba(245, 158, 11, 0.25)",
              glow: "rgba(245, 158, 11, 0.15)",
            },
            {
              icon: <Person sx={{ fontSize: 28, color: "#60a5fa" }} />,
              value: stats.leave,
              label: "Leave",
              accent: "rgba(59, 130, 246, 0.12)",
              border: "rgba(59, 130, 246, 0.25)",
              glow: "rgba(59, 130, 246, 0.15)",
            },
            {
              icon: <EventAvailable sx={{ fontSize: 28, color: "#a78bfa" }} />,
              value: stats["paid-leave"],
              label: "Paid Leave",
              accent: "rgba(139, 92, 246, 0.12)",
              border: "rgba(139, 92, 246, 0.25)",
              glow: "rgba(139, 92, 246, 0.15)",
            },
          ].map(({ icon, value, label, accent, border, glow }) => (
            <Card
              key={label}
              elevation={0}
              sx={{
                background: "rgba(255, 255, 255, 0.03)",
                backdropFilter: "blur(20px)",
                WebkitBackdropFilter: "blur(20px)",
                border: "1px solid rgba(255, 255, 255, 0.08)",
                borderRadius: "16px",
                boxShadow: "0 8px 32px rgba(0, 0, 0, 0.2)",
                transition: "all 0.25s ease",
                "&:hover": {
                  transform: "translateY(-3px)",
                  borderColor: border,
                  boxShadow: `0 12px 36px rgba(0, 0, 0, 0.3), 0 0 20px ${glow}`,
                },
              }}
            >
              <CardContent sx={{ p: 2, "&:last-child": { pb: 2 } }}>
                <Box display="flex" alignItems="center" gap={1.5}>
                  <Box
                    sx={{
                      width: 44,
                      height: 44,
                      borderRadius: "12px",
                      background: accent,
                      border: `1px solid ${border}`,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      boxShadow: `0 4px 12px ${glow}`,
                      flexShrink: 0,
                    }}
                  >
                    {icon}
                  </Box>
                  <Box>
                    <Typography
                      variant="h5"
                      sx={{
                        fontWeight: 700,
                        fontSize: "1.35rem",
                        color: "#f1f5f9",
                        lineHeight: 1.2,
                      }}
                    >
                      {value}
                    </Typography>
                    <Typography
                      variant="caption"
                      sx={{
                        color: "#94a3b8",
                        fontWeight: 500,
                        textTransform: "uppercase",
                        letterSpacing: "0.05em",
                        fontSize: "0.6875rem",
                      }}
                    >
                      {label}
                    </Typography>
                  </Box>
                </Box>
              </CardContent>
            </Card>
          ))}
        </Box>

        {/* Attendance Table */}
        <Paper
          elevation={0}
          sx={{
            width: "100%",
            overflow: "hidden",
            backgroundColor: "rgba(255, 255, 255, 0.02)",
            backdropFilter: "blur(20px)",
            WebkitBackdropFilter: "blur(20px)",
            border: "1px solid rgba(255, 255, 255, 0.08)",
            borderRadius: "16px",
          }}
        >
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Employee ID</TableCell>
                  <TableCell>Name</TableCell>
                  <TableCell>Department</TableCell>
                  <TableCell>Designation</TableCell>
                  <TableCell align="center">Attendance Status</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {filteredEmployees.map((employee) => (
                  <TableRow key={employee.id}>
                    <TableCell>{employee.employeeId}</TableCell>
                    <TableCell>
                      <Box>
                        <Typography variant="body2">{employee.fullName}</Typography>
                        {(() => {
                          const activity = getEmployeeMonthActivity(
                            employee,
                            selectedDate.getFullYear(),
                            selectedDate.getMonth() + 1
                          );
                          return activity.label ? (
                            <Typography variant="caption" color="text.secondary" display="block">
                              {activity.label}
                            </Typography>
                          ) : null;
                        })()}
                      </Box>
                    </TableCell>
                    <TableCell>{(employee as any).department  || "-"}</TableCell>
                    <TableCell>{(employee as any).designation || "-"}</TableCell>
                    <TableCell align="center">
                      {isEmployeeActiveOn(employee, selectedDate) ? (
                        <FormControl size="small" sx={{ minWidth: 120 }}>
                          <Select
                            value={attendanceData[employee.id] || ""}
                            onChange={(e) => handleAttendanceChange(employee.id, e.target.value)}
                            displayEmpty
                            disabled={isRowLoading(savingRows, employee.id)}
                          >
                            <MenuItem value=""><em>Not Marked</em></MenuItem>
                            {attendanceStatuses.map((s) => (
                              <MenuItem key={s.value} value={s.value}>
                                <Chip label={s.label} color={s.color} size="small" sx={{ minWidth: 80 }} />
                              </MenuItem>
                            ))}
                          </Select>
                        </FormControl>
                      ) : (
                        <Chip label="Inactive" size="small" variant="outlined" disabled />
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>

        {/* Save Button */}
        <Box display="flex" justifyContent="flex-end" sx={{ mt: 3 }}>
          <LoadingButton variant="contained" onClick={handleSaveAttendance} isLoading={isSaving} size="large">
            Save Attendance
          </LoadingButton>
        </Box>

        {/* Bulk Attendance Period Dialog */}
        <BulkAttendancePeriodDialog
          open={showBulkPeriodDialog}
          onClose={() => setShowBulkPeriodDialog(false)}
          onSaved={() => { setShowBulkPeriodDialog(false); fetchAttendanceForDate(); }}
          employees={filteredEmployees}
        />
      </Box>
    </LocalizationProvider>
  );
}
