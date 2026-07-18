"use client";

import React, { useState, useEffect } from "react";
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
  const filteredEmployees =
    currentUser?.role === "admin" && selectedManagerId !== "all"
      ? employees.filter(
          (emp) => Array.isArray(emp.assignedManagers) && emp.assignedManagers.includes(selectedManagerId),
        )
      : employees;

  const stats = (() => {
    const s = { present: 0, absent: 0, "half-day": 0, leave: 0, "paid-leave": 0 };
    filteredEmployees.forEach((emp) => {
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
      <Box>
        <Typography variant="h4" gutterBottom>
          Attendance Management
        </Typography>

        {/* Manager filter (admin only) */}
        {currentUser?.role === "admin" && (
          <FormControl size="small" sx={{ minWidth: 260, mb: 2, mr: 2 }}>
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

        {error   && <Alert severity="error"   sx={{ mb: 2 }}>{error}</Alert>}
        {success && <Alert severity="success" sx={{ mb: 2 }}>{success}</Alert>}

        {/* Date picker + Bulk Edit Period + Stats */}
        <Box sx={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 3, mb: 3 }}>
          <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <DatePicker
              label="Select Date"
              value={selectedDate}
              onChange={(d) => setSelectedDate(d || new Date())}
              slotProps={{ textField: { fullWidth: true } }}
            />
            <Button
              variant="outlined"
              startIcon={<Edit />}
              onClick={() => setShowBulkPeriodDialog(true)}
              fullWidth
            >
              Bulk Edit Period
            </Button>
          </Box>

          {/* Stats cards */}
          <Box sx={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 2 }}>
            {[
              { icon: <CheckCircle color="success" sx={{ fontSize: 40, mb: 1 }} />, value: stats.present,       label: "Present"  },
              { icon: <Cancel      color="error"   sx={{ fontSize: 40, mb: 1 }} />, value: stats.absent,        label: "Absent"   },
              { icon: <Schedule    color="warning" sx={{ fontSize: 40, mb: 1 }} />, value: stats["half-day"],   label: "Half Day" },
              { icon: <Person      color="info"    sx={{ fontSize: 40, mb: 1 }} />, value: stats.leave,         label: "Leave"    },
              { icon: <EventAvailable color="secondary" sx={{ fontSize: 40, mb: 1 }} />, value: stats["paid-leave"], label: "Paid Leave" },
            ].map(({ icon, value, label }) => (
              <Card key={label}>
                <CardContent sx={{ textAlign: "center", py: 2 }}>
                  {icon}
                  <Typography variant="h6">{value}</Typography>
                  <Typography variant="caption">{label}</Typography>
                </CardContent>
              </Card>
            ))}
          </Box>
        </Box>

        {/* Attendance Table */}
        <Paper sx={{ width: "100%", overflow: "hidden" }}>
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
                    <TableCell>{employee.fullName}</TableCell>
                    <TableCell>{(employee as any).department  || "-"}</TableCell>
                    <TableCell>{(employee as any).designation || "-"}</TableCell>
                    <TableCell align="center">
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
