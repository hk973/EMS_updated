/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import React, { useState, useEffect } from "react";
import {
  Box,
  Typography,
  Button,
  TextField,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  IconButton,
  TablePagination,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  CircularProgress,
  Tooltip,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Alert,
  Chip,
  Card,
  CardContent,
  Tabs,
  Tab,
  Grid,
} from "@mui/material";
import {
  Download,
  Search,
  PictureAsPdf,
  TableChart,
  BarChart,
  PieChart,
  TrendingUp,
  People,
  AttachMoney,
  Schedule,
  Assessment,
  GetApp,
  Refresh,
} from "@mui/icons-material";
import { collection, getDocs, query, where, orderBy } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Employee, Payroll, Attendance } from "@/types";
import { useAuth } from "@/contexts/AuthContext";
import {
  BarChart as RechartsBarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  Legend,
  ResponsiveContainer,
  PieChart as RechartsPieChart,
  Pie,
  Cell,
  LineChart,
  Line,
} from "recharts";
import * as XLSX from "xlsx";

const months = [
  { value: 1, label: "January" },
  { value: 2, label: "February" },
  { value: 3, label: "March" },
  { value: 4, label: "April" },
  { value: 5, label: "May" },
  { value: 6, label: "June" },
  { value: 7, label: "July" },
  { value: 8, label: "August" },
  { value: 9, label: "September" },
  { value: 10, label: "October" },
  { value: 11, label: "November" },
  { value: 12, label: "December" },
];

const currentYear = new Date().getFullYear();
const years = Array.from({ length: 5 }, (_, i) => currentYear - i);

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

function TabPanel(props: TabPanelProps) {
  const { children, value, index, ...other } = props;

  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`reports-tabpanel-${index}`}
      aria-labelledby={`reports-tab-${index}`}
      {...other}
    >
      {value === index && <Box sx={{ p: 3 }}>{children}</Box>}
    </div>
  );
}

export default function Reports() {
  const { currentUser } = useAuth();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [payrolls, setPayrolls] = useState<Payroll[]>([]);
  const [attendance, setAttendance] = useState<Attendance[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [tabValue, setTabValue] = useState(0);
  const [success, setSuccess] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    loadData();
  }, [selectedMonth, selectedYear]);

  const loadData = async () => {
    try {
      setLoading(true);

      // Load employees
      const employeesQuery = query(
        collection(db, "employees"),
        orderBy("fullName"),
      );
      const employeesSnapshot = await getDocs(employeesQuery);
      const employeesData = employeesSnapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as Employee[];
      setEmployees(employeesData);

      // Load payrolls for selected month/year
      const payrollsQuery = query(
        collection(db, "payroll"),
        where("month", "==", selectedMonth),
        where("year", "==", selectedYear),
      );
      const payrollsSnapshot = await getDocs(payrollsQuery);
      const payrollsData = payrollsSnapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as Payroll[];
      setPayrolls(payrollsData);

      // Load attendance by date because attendance docs store "date" (not month/year fields).
      const attendanceSnapshot = await getDocs(collection(db, "attendance"));
      const attendanceData = attendanceSnapshot.docs
        .map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }))
        .filter((record) => {
          const rawDate = (record as { date?: unknown }).date;
          const d =
            rawDate instanceof Date
              ? rawDate
              : (rawDate as { toDate?: () => Date } | undefined)?.toDate?.();
          if (!d) return false;
          return (
            d.getMonth() + 1 === selectedMonth &&
            d.getFullYear() === selectedYear
          );
        }) as Attendance[];
      setAttendance(attendanceData);
    } catch (error) {
      console.error("Error loading data:", error);
      setError("Failed to load data");
    } finally {
      setLoading(false);
    }
  };

  const getEmployeeStats = () => {
    const totalEmployees = employees.length;
    const activeEmployees = employees.filter(
      (emp) => emp.status !== "inactive",
    ).length;
    const newEmployees = employees.filter((emp) => {
      const joiningDate =
        emp.dateOfJoining instanceof Date
          ? emp.dateOfJoining
          : (emp.dateOfJoining as any)?.toDate?.();
      if (!joiningDate) return false;
      const threeMonthsAgo = new Date();
      threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
      return joiningDate > threeMonthsAgo;
    }).length;

    return { totalEmployees, activeEmployees, newEmployees };
  };

  const getPayrollStats = () => {
    const totalPayroll = payrolls.reduce((sum, p) => sum + p.grossSalary, 0);
    const totalNetPayroll = payrolls.reduce((sum, p) => sum + p.netSalary, 0);
    const totalTax = payrolls.reduce((sum, p) => sum + p.taxAmount, 0);
    const avgSalary = payrolls.length > 0 ? totalPayroll / payrolls.length : 0;

    return { totalPayroll, totalNetPayroll, totalTax, avgSalary };
  };

  const getAttendanceStats = () => {
    const totalDays = attendance.length;
    const presentDays = attendance.filter((a) => a.status === "present").length;
    const absentDays = attendance.filter((a) => a.status === "absent").length;
    const attendanceRate = totalDays > 0 ? (presentDays / totalDays) * 100 : 0;

    return { totalDays, presentDays, absentDays, attendanceRate };
  };

  const getPayrollChartData = () => {
    const monthlyData = [];
    for (let i = 1; i <= 12; i++) {
      const monthPayrolls = payrolls.filter((p) => p.month === i);
      const totalGross = monthPayrolls.reduce(
        (sum, p) => sum + p.grossSalary,
        0,
      );
      const totalNet = monthPayrolls.reduce((sum, p) => sum + p.netSalary, 0);

      monthlyData.push({
        month: months[i - 1]?.label || `Month ${i}`,
        gross: totalGross,
        net: totalNet,
      });
    }
    return monthlyData;
  };

  const getAttendanceChartData = () => {
    const statusCounts = {
      present: attendance.filter((a) => a.status === "present").length,
      absent: attendance.filter((a) => a.status === "absent").length,
      late: attendance.filter((a) => a.status === "late").length,
      "half-day": attendance.filter((a) => a.status === "half-day").length,
    };

    return Object.entries(statusCounts).map(([status, count]) => ({
      name: status.charAt(0).toUpperCase() + status.slice(1),
      value: count,
    }));
  };

  const exportToExcel = (data: any[], filename: string) => {
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Report");
    XLSX.writeFile(wb, `${filename}.xlsx`);
  };

  const exportEmployeeReport = () => {
    const employeeData = employees.map((emp) => ({
      "Employee ID": emp.employeeId,
      "Full Name": emp.fullName,
      Email: emp.email,
      Mobile: emp.mobile,
      "Basic Salary": emp.salary?.basic || "0",
      HRA: emp.salary?.hra || "0",
      TA: emp.salary?.ta || "0",
      DA: emp.salary?.da || "0",
      Status: emp.status || "active",
    }));
    exportToExcel(
      employeeData,
      `employee_report_${selectedMonth}_${selectedYear}`,
    );
    setSuccess("Employee report exported successfully!");
  };

  const exportPayrollReport = () => {
    const payrollData = payrolls.map((p) => {
      const employee = employees.find(
        (emp) => emp.id === p.employeeId || emp.employeeId === p.employeeId,
      );
      return {
        "Employee ID": employee?.employeeId || "Unknown",
        "Employee Name": employee?.fullName || "Unknown",
        Month: months.find((m) => m.value === p.month)?.label || p.month,
        Year: p.year,
        "Basic Salary": p.baseSalary,
        HRA: p.hra,
        TA: p.ta,
        DA: p.da,
        "Total Bonus": p.totalBonus,
        "Total Deduction": p.totalDeduction,
        "Tax Amount": p.taxAmount,
        "Gross Salary": p.grossSalary,
        "Net Salary": p.netSalary,
        Status: p.status,
      };
    });
    exportToExcel(
      payrollData,
      `payroll_report_${selectedMonth}_${selectedYear}`,
    );
    setSuccess("Payroll report exported successfully!");
  };

  const exportAttendanceReport = () => {
    const attendanceData = attendance.map((a) => {
      const employee = employees.find(
        (emp) => emp.id === a.employeeId || emp.employeeId === a.employeeId,
      );
      return {
        "Employee ID": employee?.employeeId || "Unknown",
        "Employee Name": employee?.fullName || "Unknown",
        Date:
          a.date instanceof Date
            ? a.date.toLocaleDateString()
            : (a.date as any)?.toDate?.()?.toLocaleDateString() || "Unknown",
        Status: a.status,
        "Check In":
          a.checkIn instanceof Date
            ? a.checkIn.toLocaleTimeString()
            : (a.checkIn as any)?.toDate?.()?.toLocaleTimeString() || "N/A",
        "Check Out":
          a.checkOut instanceof Date
            ? a.checkOut.toLocaleTimeString()
            : (a.checkOut as any)?.toDate?.()?.toLocaleTimeString() || "N/A",
        Notes: a.notes || "",
      };
    });
    exportToExcel(
      attendanceData,
      `attendance_report_${selectedMonth}_${selectedYear}`,
    );
    setSuccess("Attendance report exported successfully!");
  };

  const employeeStats = getEmployeeStats();
  const payrollStats = getPayrollStats();
  const attendanceStats = getAttendanceStats();
  const payrollChartData = getPayrollChartData();
  const attendanceChartData = getAttendanceChartData();

  const COLORS = ["#6366f1", "#10b981", "#f59e0b", "#8b5cf6"];

  if (loading) {
    return (
      <Box
        display="flex"
        justifyContent="center"
        alignItems="center"
        minHeight="400px"
      >
        <CircularProgress sx={{ color: "#6366f1" }} />
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3 }}>
      {/* Header */}
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
          Reports &amp; Analytics
        </Typography>
        <Typography variant="body2" sx={{ color: "#94a3b8" }}>
          Comprehensive reports and analytics for your organization
        </Typography>
      </Box>

      {/* Alerts */}
      {error && (
        <Alert
          severity="error"
          sx={{
            mb: 2,
            backgroundColor: "rgba(239, 68, 68, 0.1)",
            border: "1px solid rgba(239, 68, 68, 0.25)",
            color: "#fca5a5",
            borderRadius: "12px",
          }}
          onClose={() => setError("")}
        >
          {error}
        </Alert>
      )}

      {success && (
        <Alert
          severity="success"
          sx={{
            mb: 2,
            backgroundColor: "rgba(16, 185, 129, 0.1)",
            border: "1px solid rgba(16, 185, 129, 0.25)",
            color: "#6ee7b7",
            borderRadius: "12px",
          }}
          onClose={() => setSuccess("")}
        >
          {success}
        </Alert>
      )}

      {/* Month/Year Selection */}
      <Card
        elevation={0}
        sx={{
          mb: 3,
          background: "rgba(255, 255, 255, 0.03)",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
          border: "1px solid rgba(255, 255, 255, 0.08)",
          borderRadius: "16px",
          boxShadow: "0 8px 32px rgba(0, 0, 0, 0.25)",
        }}
      >
        <CardContent sx={{ p: 2.5, "&:last-child": { pb: 2.5 } }}>
          <Box sx={{ display: "flex", gap: 2, alignItems: "center", flexWrap: "wrap" }}>
            <FormControl
              size="small"
              sx={{
                minWidth: 140,
                "& .MuiOutlinedInput-root": {
                  backgroundColor: "rgba(255, 255, 255, 0.03)",
                  backdropFilter: "blur(10px)",
                  borderRadius: "12px",
                  "& fieldset": {
                    borderColor: "rgba(255, 255, 255, 0.1)",
                  },
                  "&:hover fieldset": {
                    borderColor: "rgba(99, 102, 241, 0.4)",
                  },
                  "&.Mui-focused fieldset": {
                    borderColor: "#6366f1",
                  },
                },
                "& .MuiInputLabel-root": {
                  color: "#94a3b8",
                },
                "& .MuiSelect-select": {
                  color: "#f1f5f9",
                },
              }}
            >
              <InputLabel>Month</InputLabel>
              <Select
                value={selectedMonth}
                label="Month"
                onChange={(e) => setSelectedMonth(e.target.value as number)}
              >
                {months.map((month) => (
                  <MenuItem key={month.value} value={month.value}>
                    {month.label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <FormControl
              size="small"
              sx={{
                minWidth: 120,
                "& .MuiOutlinedInput-root": {
                  backgroundColor: "rgba(255, 255, 255, 0.03)",
                  backdropFilter: "blur(10px)",
                  borderRadius: "12px",
                  "& fieldset": {
                    borderColor: "rgba(255, 255, 255, 0.1)",
                  },
                  "&:hover fieldset": {
                    borderColor: "rgba(99, 102, 241, 0.4)",
                  },
                  "&.Mui-focused fieldset": {
                    borderColor: "#6366f1",
                  },
                },
                "& .MuiInputLabel-root": {
                  color: "#94a3b8",
                },
                "& .MuiSelect-select": {
                  color: "#f1f5f9",
                },
              }}
            >
              <InputLabel>Year</InputLabel>
              <Select
                value={selectedYear}
                label="Year"
                onChange={(e) => setSelectedYear(e.target.value as number)}
              >
                {years.map((year) => (
                  <MenuItem key={year} value={year}>
                    {year}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <Button
              variant="contained"
              startIcon={<Refresh />}
              onClick={loadData}
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
                transition: "all 0.2s ease",
              }}
            >
              Refresh
            </Button>
          </Box>
        </CardContent>
      </Card>

      {/* Stats Cards */}
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
          gap: 2.5,
          mb: 3,
        }}
      >
        <Card
          elevation={0}
          sx={{
            background:
              "linear-gradient(135deg, rgba(99, 102, 241, 0.12) 0%, rgba(99, 102, 241, 0.03) 100%)",
            backdropFilter: "blur(20px)",
            WebkitBackdropFilter: "blur(20px)",
            border: "1px solid rgba(99, 102, 241, 0.22)",
            borderRadius: "16px",
            boxShadow: "0 8px 32px rgba(0, 0, 0, 0.25)",
            position: "relative",
            overflow: "hidden",
            transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
            "&:hover": {
              transform: "translateY(-3px)",
              borderColor: "rgba(99, 102, 241, 0.4)",
              boxShadow:
                "0 14px 40px rgba(0, 0, 0, 0.35), 0 0 20px rgba(99, 102, 241, 0.2)",
            },
            "&::before": {
              content: '""',
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              height: "2px",
              background:
                "linear-gradient(90deg, transparent, #818cf8, transparent)",
            },
          }}
        >
          <CardContent sx={{ p: 2.5 }}>
            <Box sx={{ display: "flex", alignItems: "center", mb: 1.5 }}>
              <Box
                sx={{
                  width: 40,
                  height: 40,
                  borderRadius: "12px",
                  background: "rgba(99, 102, 241, 0.15)",
                  border: "1px solid rgba(99, 102, 241, 0.25)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  mr: 1.5,
                }}
              >
                <People sx={{ color: "#818cf8", fontSize: 22 }} />
              </Box>
              <Typography variant="subtitle1" sx={{ color: "#f1f5f9", fontWeight: 600 }}>
                Employee Statistics
              </Typography>
            </Box>
            <Typography variant="h4" sx={{ color: "#f1f5f9", fontWeight: 700, mb: 0.5 }}>
              {employeeStats.totalEmployees}
            </Typography>
            <Typography variant="caption" sx={{ color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.05em" }}>
              Total Employees
            </Typography>
            <Box sx={{ mt: 2, pt: 1.5, borderTop: "1px solid rgba(255, 255, 255, 0.06)", display: "flex", gap: 2 }}>
              <Typography variant="body2" sx={{ color: "#cbd5e1" }}>
                Active: <strong style={{ color: "#34d399" }}>{employeeStats.activeEmployees}</strong>
              </Typography>
              <Typography variant="body2" sx={{ color: "#cbd5e1" }}>
                New (3m): <strong style={{ color: "#818cf8" }}>{employeeStats.newEmployees}</strong>
              </Typography>
            </Box>
          </CardContent>
        </Card>

        <Card
          elevation={0}
          sx={{
            background:
              "linear-gradient(135deg, rgba(16, 185, 129, 0.12) 0%, rgba(16, 185, 129, 0.03) 100%)",
            backdropFilter: "blur(20px)",
            WebkitBackdropFilter: "blur(20px)",
            border: "1px solid rgba(16, 185, 129, 0.22)",
            borderRadius: "16px",
            boxShadow: "0 8px 32px rgba(0, 0, 0, 0.25)",
            position: "relative",
            overflow: "hidden",
            transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
            "&:hover": {
              transform: "translateY(-3px)",
              borderColor: "rgba(16, 185, 129, 0.4)",
              boxShadow:
                "0 14px 40px rgba(0, 0, 0, 0.35), 0 0 20px rgba(16, 185, 129, 0.2)",
            },
            "&::before": {
              content: '""',
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              height: "2px",
              background:
                "linear-gradient(90deg, transparent, #34d399, transparent)",
            },
          }}
        >
          <CardContent sx={{ p: 2.5 }}>
            <Box sx={{ display: "flex", alignItems: "center", mb: 1.5 }}>
              <Box
                sx={{
                  width: 40,
                  height: 40,
                  borderRadius: "12px",
                  background: "rgba(16, 185, 129, 0.15)",
                  border: "1px solid rgba(16, 185, 129, 0.25)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  mr: 1.5,
                }}
              >
                <AttachMoney sx={{ color: "#34d399", fontSize: 22 }} />
              </Box>
              <Typography variant="subtitle1" sx={{ color: "#f1f5f9", fontWeight: 600 }}>
                Payroll Statistics
              </Typography>
            </Box>
            <Typography variant="h4" sx={{ color: "#f1f5f9", fontWeight: 700, mb: 0.5 }}>
              ₹{payrollStats.totalPayroll.toLocaleString()}
            </Typography>
            <Typography variant="caption" sx={{ color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.05em" }}>
              Total Gross Payroll
            </Typography>
            <Box sx={{ mt: 2, pt: 1.5, borderTop: "1px solid rgba(255, 255, 255, 0.06)", display: "flex", gap: 2 }}>
              <Typography variant="body2" sx={{ color: "#cbd5e1" }}>
                Net: <strong style={{ color: "#34d399" }}>₹{payrollStats.totalNetPayroll.toLocaleString()}</strong>
              </Typography>
              <Typography variant="body2" sx={{ color: "#cbd5e1" }}>
                Tax: <strong style={{ color: "#fbbf24" }}>₹{payrollStats.totalTax.toLocaleString()}</strong>
              </Typography>
            </Box>
          </CardContent>
        </Card>

        <Card
          elevation={0}
          sx={{
            background:
              "linear-gradient(135deg, rgba(245, 158, 11, 0.12) 0%, rgba(245, 158, 11, 0.03) 100%)",
            backdropFilter: "blur(20px)",
            WebkitBackdropFilter: "blur(20px)",
            border: "1px solid rgba(245, 158, 11, 0.22)",
            borderRadius: "16px",
            boxShadow: "0 8px 32px rgba(0, 0, 0, 0.25)",
            position: "relative",
            overflow: "hidden",
            transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
            "&:hover": {
              transform: "translateY(-3px)",
              borderColor: "rgba(245, 158, 11, 0.4)",
              boxShadow:
                "0 14px 40px rgba(0, 0, 0, 0.35), 0 0 20px rgba(245, 158, 11, 0.2)",
            },
            "&::before": {
              content: '""',
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              height: "2px",
              background:
                "linear-gradient(90deg, transparent, #fbbf24, transparent)",
            },
          }}
        >
          <CardContent sx={{ p: 2.5 }}>
            <Box sx={{ display: "flex", alignItems: "center", mb: 1.5 }}>
              <Box
                sx={{
                  width: 40,
                  height: 40,
                  borderRadius: "12px",
                  background: "rgba(245, 158, 11, 0.15)",
                  border: "1px solid rgba(245, 158, 11, 0.25)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  mr: 1.5,
                }}
              >
                <Schedule sx={{ color: "#fbbf24", fontSize: 22 }} />
              </Box>
              <Typography variant="subtitle1" sx={{ color: "#f1f5f9", fontWeight: 600 }}>
                Attendance Statistics
              </Typography>
            </Box>
            <Typography variant="h4" sx={{ color: "#f1f5f9", fontWeight: 700, mb: 0.5 }}>
              {attendanceStats.attendanceRate.toFixed(1)}%
            </Typography>
            <Typography variant="caption" sx={{ color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.05em" }}>
              Attendance Rate
            </Typography>
            <Box sx={{ mt: 2, pt: 1.5, borderTop: "1px solid rgba(255, 255, 255, 0.06)", display: "flex", gap: 2 }}>
              <Typography variant="body2" sx={{ color: "#cbd5e1" }}>
                Present: <strong style={{ color: "#34d399" }}>{attendanceStats.presentDays}</strong>
              </Typography>
              <Typography variant="body2" sx={{ color: "#cbd5e1" }}>
                Absent: <strong style={{ color: "#f87171" }}>{attendanceStats.absentDays}</strong>
              </Typography>
            </Box>
          </CardContent>
        </Card>
      </Box>

      {/* Tabs */}
      <Card
        elevation={0}
        sx={{
          background: "rgba(255, 255, 255, 0.03)",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
          border: "1px solid rgba(255, 255, 255, 0.08)",
          borderRadius: "16px",
          boxShadow: "0 8px 32px rgba(0, 0, 0, 0.25)",
          overflow: "hidden",
        }}
      >
        <Box
          sx={{
            p: 1.5,
            borderBottom: "1px solid rgba(255, 255, 255, 0.06)",
            background: "rgba(255, 255, 255, 0.02)",
          }}
        >
          <Tabs
            value={tabValue}
            onChange={(e, newValue) => setTabValue(newValue)}
            sx={{
              minHeight: "unset",
              "& .MuiTabs-flexContainer": {
                gap: 1,
                flexWrap: "wrap",
              },
              "& .MuiTabs-indicator": {
                display: "none",
              },
              "& .MuiTab-root": {
                minHeight: 40,
                py: 1,
                px: 2.5,
                borderRadius: "12px",
                color: "#94a3b8",
                fontWeight: 500,
                fontSize: "0.875rem",
                textTransform: "none",
                display: "flex",
                flexDirection: "row",
                gap: 1,
                transition: "all 0.2s ease",
                "&:hover": {
                  color: "#f1f5f9",
                  backgroundColor: "rgba(255, 255, 255, 0.05)",
                },
                "&.Mui-selected": {
                  color: "#ffffff !important",
                  fontWeight: 600,
                  backgroundColor: "rgba(99, 102, 241, 0.2)",
                  border: "1px solid rgba(99, 102, 241, 0.35)",
                  boxShadow: "0 4px 16px rgba(99, 102, 241, 0.25)",
                },
              },
            }}
          >
            <Tab label="Analytics" icon={<BarChart fontSize="small" />} />
            <Tab label="Employee Report" icon={<People fontSize="small" />} />
            <Tab label="Payroll Report" icon={<AttachMoney fontSize="small" />} />
            <Tab label="Attendance Report" icon={<Schedule fontSize="small" />} />
          </Tabs>
        </Box>

        {/* Analytics Tab */}
        <TabPanel value={tabValue} index={0}>
          <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, gap: 3 }}>
            {/* Payroll Chart */}
            <Card
              elevation={0}
              sx={{
                background: "rgba(255, 255, 255, 0.02)",
                backdropFilter: "blur(20px)",
                WebkitBackdropFilter: "blur(20px)",
                border: "1px solid rgba(255, 255, 255, 0.06)",
                borderRadius: "14px",
                boxShadow: "0 4px 20px rgba(0, 0, 0, 0.2)",
              }}
            >
              <CardContent sx={{ p: 2.5 }}>
                <Typography variant="h6" sx={{ color: "#f1f5f9", fontWeight: 600, mb: 2 }}>
                  Monthly Payroll Trend
                </Typography>
                <ResponsiveContainer width="100%" height={300}>
                  <RechartsBarChart data={payrollChartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255, 255, 255, 0.08)" />
                    <XAxis dataKey="month" stroke="#94a3b8" tick={{ fill: "#94a3b8", fontSize: 12 }} />
                    <YAxis stroke="#94a3b8" tick={{ fill: "#94a3b8", fontSize: 12 }} />
                    <RechartsTooltip
                      contentStyle={{
                        backgroundColor: "rgba(15, 23, 42, 0.95)",
                        backdropFilter: "blur(20px)",
                        border: "1px solid rgba(255, 255, 255, 0.1)",
                        borderRadius: "10px",
                        color: "#f1f5f9",
                        boxShadow: "0 8px 32px rgba(0, 0, 0, 0.5)",
                      }}
                    />
                    <Legend wrapperStyle={{ color: "#94a3b8" }} />
                    <Bar dataKey="gross" fill="#6366f1" name="Gross Salary" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="net" fill="#10b981" name="Net Salary" radius={[4, 4, 0, 0]} />
                  </RechartsBarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Attendance Chart */}
            <Card
              elevation={0}
              sx={{
                background: "rgba(255, 255, 255, 0.02)",
                backdropFilter: "blur(20px)",
                WebkitBackdropFilter: "blur(20px)",
                border: "1px solid rgba(255, 255, 255, 0.06)",
                borderRadius: "14px",
                boxShadow: "0 4px 20px rgba(0, 0, 0, 0.2)",
              }}
            >
              <CardContent sx={{ p: 2.5 }}>
                <Typography variant="h6" sx={{ color: "#f1f5f9", fontWeight: 600, mb: 2 }}>
                  Attendance Distribution
                </Typography>
                <ResponsiveContainer width="100%" height={300}>
                  <RechartsPieChart>
                    <Pie
                      data={attendanceChartData}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ name, percent }) =>
                        `${name} ${percent ? (percent * 100).toFixed(0) : "0"}%`
                      }
                      outerRadius={85}
                      fill="#8884d8"
                      dataKey="value"
                    >
                      {attendanceChartData.map((entry, index) => (
                        <Cell
                          key={`cell-${index}`}
                          fill={COLORS[index % COLORS.length]}
                        />
                      ))}
                    </Pie>
                    <RechartsTooltip
                      contentStyle={{
                        backgroundColor: "rgba(15, 23, 42, 0.95)",
                        backdropFilter: "blur(20px)",
                        border: "1px solid rgba(255, 255, 255, 0.1)",
                        borderRadius: "10px",
                        color: "#f1f5f9",
                        boxShadow: "0 8px 32px rgba(0, 0, 0, 0.5)",
                      }}
                    />
                  </RechartsPieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </Box>
        </TabPanel>

        {/* Employee Report Tab */}
        <TabPanel value={tabValue} index={1}>
          <Box sx={{ mb: 2.5, display: "flex", gap: 2, alignItems: "center", flexWrap: "wrap" }}>
            <TextField
              size="small"
              placeholder="Search employees..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              InputProps={{
                startAdornment: (
                  <Search sx={{ mr: 1, color: "#94a3b8" }} />
                ),
              }}
              sx={{
                flex: 1,
                minWidth: 240,
                "& .MuiOutlinedInput-root": {
                  backgroundColor: "rgba(255, 255, 255, 0.03)",
                  backdropFilter: "blur(10px)",
                  borderRadius: "12px",
                  "& fieldset": {
                    borderColor: "rgba(255, 255, 255, 0.1)",
                  },
                  "&:hover fieldset": {
                    borderColor: "rgba(99, 102, 241, 0.4)",
                  },
                  "&.Mui-focused fieldset": {
                    borderColor: "#6366f1",
                    boxShadow: "0 0 0 3px rgba(99, 102, 241, 0.1)",
                  },
                },
                "& .MuiInputBase-input": {
                  color: "#f1f5f9",
                },
              }}
            />
            <Button
              variant="contained"
              startIcon={<GetApp />}
              onClick={exportEmployeeReport}
              sx={{
                borderRadius: "12px",
                px: 2.5,
                py: 0.9,
                fontWeight: 600,
                textTransform: "none",
                background: "linear-gradient(135deg, #10b981 0%, #059669 100%)",
                color: "#ffffff",
                boxShadow:
                  "6px 6px 12px rgba(0, 0, 0, 0.35), inset 2px 2px 4px rgba(255, 255, 255, 0.15)",
                "&:hover": {
                  background: "linear-gradient(135deg, #059669 0%, #047857 100%)",
                  boxShadow:
                    "4px 4px 8px rgba(0, 0, 0, 0.4), inset 2px 2px 4px rgba(255, 255, 255, 0.2)",
                  transform: "translateY(-1px)",
                },
                "&:active": {
                  boxShadow:
                    "2px 2px 4px rgba(0, 0, 0, 0.3), inset 3px 3px 6px rgba(0, 0, 0, 0.2)",
                  transform: "translateY(0)",
                },
                transition: "all 0.2s ease",
              }}
            >
              Export Excel
            </Button>
          </Box>

          <TableContainer
            component={Paper}
            elevation={0}
            sx={{
              backgroundColor: "rgba(255, 255, 255, 0.02)",
              backdropFilter: "blur(20px)",
              WebkitBackdropFilter: "blur(20px)",
              border: "1px solid rgba(255, 255, 255, 0.06)",
              borderRadius: "14px",
              overflow: "hidden",
            }}
          >
            <Table>
              <TableHead>
                <TableRow
                  sx={{
                    "& .MuiTableCell-root": {
                      backgroundColor: "rgba(255, 255, 255, 0.04)",
                      borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
                      color: "#94a3b8",
                      fontWeight: 600,
                      fontSize: "0.75rem",
                      textTransform: "uppercase",
                      letterSpacing: "0.05em",
                      py: 1.5,
                    },
                  }}
                >
                  <TableCell>Employee ID</TableCell>
                  <TableCell>Name</TableCell>
                  <TableCell>Email</TableCell>
                  <TableCell>Basic Salary</TableCell>
                  <TableCell>Status</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {employees
                  .filter(
                    (emp) =>
                      emp.fullName
                        ?.toLowerCase()
                        .includes(searchTerm.toLowerCase()) ||
                      emp.employeeId
                        ?.toLowerCase()
                        .includes(searchTerm.toLowerCase()),
                  )
                  .slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage)
                  .map((employee) => (
                    <TableRow
                      key={employee.id}
                      sx={{
                        "&:hover": { backgroundColor: "rgba(255, 255, 255, 0.04)" },
                        "& .MuiTableCell-root": {
                          borderBottom: "1px solid rgba(255, 255, 255, 0.04)",
                          color: "#f1f5f9",
                        },
                      }}
                    >
                      <TableCell sx={{ fontWeight: 600, color: "#818cf8 !important" }}>
                        {employee.employeeId}
                      </TableCell>
                      <TableCell>{employee.fullName}</TableCell>
                      <TableCell sx={{ color: "#94a3b8 !important" }}>{employee.email}</TableCell>
                      <TableCell>₹{employee.salary?.basic || "0"}</TableCell>
                      <TableCell>
                        <Chip
                          label={employee.status || "active"}
                          size="small"
                          sx={{
                            backgroundColor:
                              employee.status === "active"
                                ? "rgba(16, 185, 129, 0.15)"
                                : "rgba(255, 255, 255, 0.06)",
                            color:
                              employee.status === "active" ? "#34d399" : "#94a3b8",
                            border: `1px solid ${
                              employee.status === "active"
                                ? "rgba(16, 185, 129, 0.3)"
                                : "rgba(255, 255, 255, 0.1)"
                            }`,
                            fontWeight: 500,
                            textTransform: "capitalize",
                          }}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
          </TableContainer>

          <TablePagination
            component="div"
            count={
              employees.filter(
                (emp) =>
                  emp.fullName
                    ?.toLowerCase()
                    .includes(searchTerm.toLowerCase()) ||
                  emp.employeeId
                    ?.toLowerCase()
                    .includes(searchTerm.toLowerCase()),
              ).length
            }
            page={page}
            onPageChange={(event, newPage) => setPage(newPage)}
            rowsPerPage={rowsPerPage}
            onRowsPerPageChange={(event) => {
              setRowsPerPage(parseInt(event.target.value, 10));
              setPage(0);
            }}
            sx={{
              color: "#94a3b8",
              "& .MuiTablePagination-select": {
                color: "#f1f5f9",
              },
              "& .MuiTablePagination-selectIcon": {
                color: "#94a3b8",
              },
              "& .MuiTablePagination-actions button": {
                color: "#f1f5f9",
              },
            }}
          />
        </TabPanel>

        {/* Payroll Report Tab */}
        <TabPanel value={tabValue} index={2}>
          <Box sx={{ mb: 2.5, display: "flex", gap: 2, alignItems: "center" }}>
            <Button
              variant="contained"
              startIcon={<GetApp />}
              onClick={exportPayrollReport}
              sx={{
                borderRadius: "12px",
                px: 2.5,
                py: 0.9,
                fontWeight: 600,
                textTransform: "none",
                background: "linear-gradient(135deg, #10b981 0%, #059669 100%)",
                color: "#ffffff",
                boxShadow:
                  "6px 6px 12px rgba(0, 0, 0, 0.35), inset 2px 2px 4px rgba(255, 255, 255, 0.15)",
                "&:hover": {
                  background: "linear-gradient(135deg, #059669 0%, #047857 100%)",
                  boxShadow:
                    "4px 4px 8px rgba(0, 0, 0, 0.4), inset 2px 2px 4px rgba(255, 255, 255, 0.2)",
                  transform: "translateY(-1px)",
                },
                "&:active": {
                  boxShadow:
                    "2px 2px 4px rgba(0, 0, 0, 0.3), inset 3px 3px 6px rgba(0, 0, 0, 0.2)",
                  transform: "translateY(0)",
                },
                transition: "all 0.2s ease",
              }}
            >
              Export Excel
            </Button>
          </Box>

          <TableContainer
            component={Paper}
            elevation={0}
            sx={{
              backgroundColor: "rgba(255, 255, 255, 0.02)",
              backdropFilter: "blur(20px)",
              WebkitBackdropFilter: "blur(20px)",
              border: "1px solid rgba(255, 255, 255, 0.06)",
              borderRadius: "14px",
              overflow: "hidden",
            }}
          >
            <Table>
              <TableHead>
                <TableRow
                  sx={{
                    "& .MuiTableCell-root": {
                      backgroundColor: "rgba(255, 255, 255, 0.04)",
                      borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
                      color: "#94a3b8",
                      fontWeight: 600,
                      fontSize: "0.75rem",
                      textTransform: "uppercase",
                      letterSpacing: "0.05em",
                      py: 1.5,
                    },
                  }}
                >
                  <TableCell>Employee</TableCell>
                  <TableCell>Month</TableCell>
                  <TableCell>Gross Salary</TableCell>
                  <TableCell>Net Salary</TableCell>
                  <TableCell>Tax</TableCell>
                  <TableCell>Status</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {payrolls.map((payroll) => {
                  const employee = employees.find(
                    (emp) =>
                      emp.id === payroll.employeeId ||
                      emp.employeeId === payroll.employeeId,
                  );
                  return (
                    <TableRow
                      key={payroll.id}
                      sx={{
                        "&:hover": { backgroundColor: "rgba(255, 255, 255, 0.04)" },
                        "& .MuiTableCell-root": {
                          borderBottom: "1px solid rgba(255, 255, 255, 0.04)",
                          color: "#f1f5f9",
                        },
                      }}
                    >
                      <TableCell sx={{ fontWeight: 600 }}>
                        {employee?.fullName || "Unknown"}
                      </TableCell>
                      <TableCell sx={{ color: "#94a3b8 !important" }}>
                        {months.find((m) => m.value === payroll.month)?.label}{" "}
                        {payroll.year}
                      </TableCell>
                      <TableCell>
                        ₹{payroll.grossSalary.toLocaleString()}
                      </TableCell>
                      <TableCell sx={{ color: "#34d399 !important", fontWeight: 600 }}>
                        ₹{payroll.netSalary.toLocaleString()}
                      </TableCell>
                      <TableCell sx={{ color: "#fbbf24 !important" }}>
                        ₹{payroll.taxAmount.toLocaleString()}
                      </TableCell>
                      <TableCell>
                        <Chip
                          label={payroll.status}
                          size="small"
                          sx={{
                            backgroundColor:
                              payroll.status === "paid"
                                ? "rgba(16, 185, 129, 0.15)"
                                : payroll.status === "approved"
                                  ? "rgba(245, 158, 11, 0.15)"
                                  : "rgba(255, 255, 255, 0.06)",
                            color:
                              payroll.status === "paid"
                                ? "#34d399"
                                : payroll.status === "approved"
                                  ? "#fbbf24"
                                  : "#94a3b8",
                            border: `1px solid ${
                              payroll.status === "paid"
                                ? "rgba(16, 185, 129, 0.3)"
                                : payroll.status === "approved"
                                  ? "rgba(245, 158, 11, 0.3)"
                                  : "rgba(255, 255, 255, 0.1)"
                            }`,
                            fontWeight: 500,
                            textTransform: "capitalize",
                          }}
                        />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
        </TabPanel>

        {/* Attendance Report Tab */}
        <TabPanel value={tabValue} index={3}>
          <Box sx={{ mb: 2.5, display: "flex", gap: 2, alignItems: "center" }}>
            <Button
              variant="contained"
              startIcon={<GetApp />}
              onClick={exportAttendanceReport}
              sx={{
                borderRadius: "12px",
                px: 2.5,
                py: 0.9,
                fontWeight: 600,
                textTransform: "none",
                background: "linear-gradient(135deg, #10b981 0%, #059669 100%)",
                color: "#ffffff",
                boxShadow:
                  "6px 6px 12px rgba(0, 0, 0, 0.35), inset 2px 2px 4px rgba(255, 255, 255, 0.15)",
                "&:hover": {
                  background: "linear-gradient(135deg, #059669 0%, #047857 100%)",
                  boxShadow:
                    "4px 4px 8px rgba(0, 0, 0, 0.4), inset 2px 2px 4px rgba(255, 255, 255, 0.2)",
                  transform: "translateY(-1px)",
                },
                "&:active": {
                  boxShadow:
                    "2px 2px 4px rgba(0, 0, 0, 0.3), inset 3px 3px 6px rgba(0, 0, 0, 0.2)",
                  transform: "translateY(0)",
                },
                transition: "all 0.2s ease",
              }}
            >
              Export Excel
            </Button>
          </Box>

          <TableContainer
            component={Paper}
            elevation={0}
            sx={{
              backgroundColor: "rgba(255, 255, 255, 0.02)",
              backdropFilter: "blur(20px)",
              WebkitBackdropFilter: "blur(20px)",
              border: "1px solid rgba(255, 255, 255, 0.06)",
              borderRadius: "14px",
              overflow: "hidden",
            }}
          >
            <Table>
              <TableHead>
                <TableRow
                  sx={{
                    "& .MuiTableCell-root": {
                      backgroundColor: "rgba(255, 255, 255, 0.04)",
                      borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
                      color: "#94a3b8",
                      fontWeight: 600,
                      fontSize: "0.75rem",
                      textTransform: "uppercase",
                      letterSpacing: "0.05em",
                      py: 1.5,
                    },
                  }}
                >
                  <TableCell>Employee</TableCell>
                  <TableCell>Date</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Check In</TableCell>
                  <TableCell>Check Out</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {attendance.map((record) => {
                  const employee = employees.find(
                    (emp) =>
                      emp.id === record.employeeId ||
                      emp.employeeId === record.employeeId,
                  );
                  return (
                    <TableRow
                      key={record.id}
                      sx={{
                        "&:hover": { backgroundColor: "rgba(255, 255, 255, 0.04)" },
                        "& .MuiTableCell-root": {
                          borderBottom: "1px solid rgba(255, 255, 255, 0.04)",
                          color: "#f1f5f9",
                        },
                      }}
                    >
                      <TableCell sx={{ fontWeight: 600 }}>
                        {employee?.fullName || "Unknown"}
                      </TableCell>
                      <TableCell sx={{ color: "#94a3b8 !important" }}>
                        {record.date instanceof Date
                          ? record.date.toLocaleDateString()
                          : (record.date as any)
                              ?.toDate?.()
                              ?.toLocaleDateString() || "Unknown"}
                      </TableCell>
                      <TableCell>
                        <Chip
                          label={record.status}
                          size="small"
                          sx={{
                            backgroundColor:
                              record.status === "present"
                                ? "rgba(16, 185, 129, 0.15)"
                                : record.status === "absent"
                                  ? "rgba(239, 68, 68, 0.15)"
                                  : "rgba(245, 158, 11, 0.15)",
                            color:
                              record.status === "present"
                                ? "#34d399"
                                : record.status === "absent"
                                  ? "#f87171"
                                  : "#fbbf24",
                            border: `1px solid ${
                              record.status === "present"
                                ? "rgba(16, 185, 129, 0.3)"
                                : record.status === "absent"
                                  ? "rgba(239, 68, 68, 0.3)"
                                  : "rgba(245, 158, 11, 0.3)"
                            }`,
                            fontWeight: 500,
                            textTransform: "capitalize",
                          }}
                        />
                      </TableCell>
                      <TableCell sx={{ color: "#94a3b8 !important" }}>
                        {record.checkIn instanceof Date
                          ? record.checkIn.toLocaleTimeString()
                          : (record.checkIn as any)
                              ?.toDate?.()
                              ?.toLocaleTimeString() || "N/A"}
                      </TableCell>
                      <TableCell sx={{ color: "#94a3b8 !important" }}>
                        {record.checkOut instanceof Date
                          ? record.checkOut.toLocaleTimeString()
                          : (record.checkOut as any)
                              ?.toDate?.()
                              ?.toLocaleTimeString() || "N/A"}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
        </TabPanel>
      </Card>
    </Box>
  );
}
