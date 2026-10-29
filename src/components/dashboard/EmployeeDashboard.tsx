"use client";

import React, { useEffect, useState } from "react";
import {
  Card,
  CardContent,
  Typography,
  Box,
  CircularProgress,
  Alert,
  Avatar,
  Chip,
  Divider,
  Button,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Badge,
  LinearProgress,
} from "@mui/material";
import {
  Person,
  AttachMoney,
  Notifications,
  TrendingUp,
  Star,
  Info,
  CheckCircle,
  Warning,
  Schedule,
} from "@mui/icons-material";
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import { Employee, Payroll, Attendance } from "@/types";
import { useRouter } from "next/navigation";

interface EmployeeStats {
  totalAttendance: number;
  presentDays: number;
  absentDays: number;
  lateDays: number;
  currentMonthSalary: number;
  lastPayroll: Payroll | null;
  recentAttendance: Attendance[];
  attendancePercentage: number;
  efficiencyScore: number;
}

interface QuickAction {
  title: string;
  description: string;
  icon: React.ReactNode;
  action: () => void;
  color: string;
}

interface Notification {
  id: string;
  title: string;
  message: string;
  type: "info" | "warning" | "success" | "error";
  date: Date;
  read: boolean;
}

export default function EmployeeDashboard() {
  const { currentUser } = useAuth();
  const router = useRouter();
  const [stats, setStats] = useState<EmployeeStats>({
    totalAttendance: 0,
    presentDays: 0,
    absentDays: 0,
    lateDays: 0,
    currentMonthSalary: 0,
    lastPayroll: null,
    recentAttendance: [],
    attendancePercentage: 0,
    efficiencyScore: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [employeeData, setEmployeeData] = useState<Employee | null>(null);
  const [notifications, setNotifications] = useState<Notification[]>([]);

  useEffect(() => {
    const fetchEmployeeData = async () => {
      if (!currentUser?.employeeId || !currentUser?.uid) {
        setLoading(false);
        return;
      }

      try {
        setLoading(true);

        const [employeeSnapshot, attendanceSnapshot, notificationsSnapshot] =
          await Promise.all([
            getDocs(
              query(
                collection(db, "employees"),
                where("employeeId", "==", currentUser.employeeId),
              ),
            ),
            getDocs(
              query(
                collection(db, "attendance"),
                where("employeeId", "==", currentUser.employeeId),
              ),
            ),
            getDocs(
              query(
                collection(db, "notifications"),
                where("userId", "==", currentUser.uid),
              ),
            ),
          ]);

        if (!employeeSnapshot.empty) {
          const empData = {
            id: employeeSnapshot.docs[0].id,
            ...employeeSnapshot.docs[0].data(),
          } as Employee;
          setEmployeeData(empData);
        }

        const attendanceData = attendanceSnapshot.docs
          .map((doc) => ({
            id: doc.id,
            ...doc.data(),
            date: doc.data().date?.toDate?.() || new Date(doc.data().date),
            createdAt: doc.data().createdAt?.toDate?.() || new Date(),
            updatedAt: doc.data().updatedAt?.toDate?.() || new Date(),
          }))
          .sort(
            (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
          ) as Attendance[];

        const totalAttendance = attendanceData.length;
        const presentDays = attendanceData.filter(
          (record) => record.status === "present",
        ).length;
        const absentDays = attendanceData.filter(
          (record) => record.status === "absent",
        ).length;
        const lateDays = attendanceData.filter(
          (record) => record.status === "late",
        ).length;
        const attendancePercentage =
          totalAttendance > 0
            ? Math.round((presentDays / totalAttendance) * 100)
            : 0;
        const efficiencyScore = attendancePercentage;

        // Fetch current month payroll
        const currentMonth = new Date().getMonth() + 1;
        const currentYear = new Date().getFullYear();
        const payrollQuery = query(
          collection(db, "payroll"),
          where("employeeId", "==", currentUser.employeeId),
          where("month", "==", currentMonth),
          where("year", "==", currentYear),
        );
        const payrollSnapshot = await getDocs(payrollQuery);
        const currentPayroll = payrollSnapshot.empty
          ? null
          : ({
              id: payrollSnapshot.docs[0].id,
              ...payrollSnapshot.docs[0].data(),
            } as Payroll);

        // Fetch last payroll - simplified query to avoid index requirements
        const lastPayrollQuery = query(
          collection(db, "payroll"),
          where("employeeId", "==", currentUser.employeeId),
        );
        const lastPayrollSnapshot = await getDocs(lastPayrollQuery);
        const lastPayroll = lastPayrollSnapshot.empty
          ? null
          : ({
              id: lastPayrollSnapshot.docs[0].id,
              ...lastPayrollSnapshot.docs[0].data(),
            } as Payroll);

        setStats({
          totalAttendance,
          presentDays,
          absentDays,
          lateDays,
          currentMonthSalary: currentPayroll?.netSalary || 0,
          lastPayroll,
          recentAttendance: attendanceData.slice(0, 5),
          attendancePercentage,
          efficiencyScore,
        });

        const notificationData: Notification[] = notificationsSnapshot.docs
          .map((doc) => {
            const data = doc.data();
            return {
              id: doc.id,
              title: data.title || "Notification",
              message: data.message || "",
              type: data.type || "info",
              date: data.createdAt?.toDate?.() || new Date(),
              read: Boolean(data.isRead),
            };
          })
          .sort((a, b) => b.date.getTime() - a.date.getTime());
        setNotifications(notificationData);
      } catch (err) {
        console.error("Error fetching employee data:", err);
        setError("Failed to load dashboard data");
      } finally {
        setLoading(false);
      }
    };

    fetchEmployeeData();
  }, [currentUser]);

  const quickActions: QuickAction[] = [
    {
      title: "My Profile",
      description: "View and update your profile",
      icon: <Person sx={{ fontSize: 22 }} />,
      action: () => router.push("/profile"),
      color: "#f59e0b",
    },
    {
      title: "Attendance Records",
      description: "Check your monthly attendance logs",
      icon: <Schedule sx={{ fontSize: 22 }} />,
      action: () => router.push("/attendance"),
      color: "#8b5cf6",
    },
    {
      title: "Salary Slips",
      description: "Download generated salary slips",
      icon: <AttachMoney sx={{ fontSize: 22 }} />,
      action: () => router.push("/salary-slips"),
      color: "#10b981",
    },
  ];

  const recentAttendanceEntries = stats.recentAttendance.slice(0, 3);

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

  if (error) {
    return (
      <Alert
        severity="error"
        sx={{
          mb: 3,
          background: "rgba(239, 68, 68, 0.1)",
          color: "#fca5a5",
          border: "1px solid rgba(239, 68, 68, 0.2)",
          borderRadius: "12px",
          backdropFilter: "blur(10px)",
        }}
      >
        {error}
      </Alert>
    );
  }

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case "success":
        return <CheckCircle sx={{ color: "#10b981", fontSize: 20 }} />;
      case "warning":
        return <Warning sx={{ color: "#f59e0b", fontSize: 20 }} />;
      case "error":
        return <Warning sx={{ color: "#ef4444", fontSize: 20 }} />;
      default:
        return <Info sx={{ color: "#3b82f6", fontSize: 20 }} />;
    }
  };

  const statCards = [
    {
      title: "This Month's Salary",
      value: `₹${stats.currentMonthSalary.toLocaleString()}`,
      icon: <AttachMoney sx={{ color: "#34d399", fontSize: 28 }} />,
      color: "#34d399",
      accent: "rgba(16, 185, 129, 0.15)",
      border: "rgba(16, 185, 129, 0.25)",
      glow: "rgba(16, 185, 129, 0.2)",
    },
    {
      title: "Efficiency Score",
      value: `${stats.efficiencyScore}%`,
      icon: <Star sx={{ color: "#fbbf24", fontSize: 28 }} />,
      color: "#fbbf24",
      accent: "rgba(245, 158, 11, 0.15)",
      border: "rgba(245, 158, 11, 0.25)",
      glow: "rgba(245, 158, 11, 0.2)",
    },
    {
      title: "Employee ID",
      value: employeeData?.employeeId || currentUser?.employeeId || "N/A",
      icon: <Person sx={{ color: "#818cf8", fontSize: 28 }} />,
      color: "#818cf8",
      accent: "rgba(99, 102, 241, 0.15)",
      border: "rgba(99, 102, 241, 0.25)",
      glow: "rgba(99, 102, 241, 0.2)",
    },
  ];

  return (
    <Box>
      {/* Header */}
      <Box sx={{ mb: 3.5 }}>
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
          Welcome back, {currentUser?.displayName}! 👋
        </Typography>
        <Typography variant="body2" sx={{ color: "#94a3b8" }}>
          Personal attendance, performance metrics, and salary overview
        </Typography>
      </Box>

      {/* Employee Profile Card */}
      <Card
        elevation={0}
        sx={{
          mb: 3.5,
          background: "rgba(255, 255, 255, 0.03)",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
          border: "1px solid rgba(255, 255, 255, 0.08)",
          borderRadius: "16px",
          boxShadow: "0 8px 32px rgba(0, 0, 0, 0.25)",
          position: "relative",
          overflow: "hidden",
          "&::before": {
            content: '""',
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            height: "2px",
            background:
              "linear-gradient(90deg, transparent, #6366f1, transparent)",
            opacity: 0.8,
          },
        }}
      >
        <CardContent
          sx={{
            p: { xs: 2.5, sm: 3 },
            "&:last-child": { pb: { xs: 2.5, sm: 3 } },
          }}
        >
          <Box
            display="flex"
            flexDirection={{ xs: "column", sm: "row" }}
            alignItems={{ xs: "flex-start", sm: "center" }}
            gap={2.5}
          >
            <Avatar
              sx={{
                width: 72,
                height: 72,
                background:
                  "linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)",
                boxShadow:
                  "0 8px 24px rgba(99, 102, 241, 0.35), inset 2px 2px 4px rgba(255, 255, 255, 0.2)",
                border: "2px solid rgba(255, 255, 255, 0.15)",
                fontSize: "1.75rem",
                fontWeight: 700,
                color: "#ffffff",
              }}
            >
              {currentUser?.displayName?.charAt(0) || "E"}
            </Avatar>
            <Box flex={1} sx={{ minWidth: 0 }}>
              <Typography
                variant="h6"
                sx={{
                  color: "#f1f5f9",
                  fontWeight: 600,
                  fontSize: "1.25rem",
                  letterSpacing: "-0.01em",
                  mb: 0.5,
                }}
              >
                {currentUser?.displayName}
              </Typography>
              <Typography variant="body2" sx={{ color: "#94a3b8", mb: 0.25 }}>
                Employee ID: {currentUser?.employeeId}
              </Typography>
              <Typography variant="body2" sx={{ color: "#94a3b8", mb: 0.25 }}>
                Email: {currentUser?.email}
              </Typography>
              {employeeData && (
                <Typography variant="body2" sx={{ color: "#94a3b8" }}>
                  Mobile: {employeeData.mobile}
                </Typography>
              )}
            </Box>
            <Box
              sx={{
                alignSelf: { xs: "flex-start", sm: "center" },
                textAlign: { sm: "right" },
              }}
            >
              <Chip
                label="Employee"
                sx={{
                  backgroundColor: "rgba(99, 102, 241, 0.15)",
                  color: "#a5b4fc",
                  border: "1px solid rgba(99, 102, 241, 0.25)",
                  backdropFilter: "blur(10px)",
                  fontWeight: 600,
                  borderRadius: "10px",
                  px: 1,
                  mb: 1.5,
                  display: "inline-flex",
                }}
              />
              <Box
                sx={{
                  display: "flex",
                  alignItems: "center",
                  gap: 1,
                  justifyContent: { xs: "flex-start", sm: "flex-end" },
                }}
              >
                <Star sx={{ color: "#fbbf24", fontSize: 20 }} />
                <Typography
                  variant="body2"
                  sx={{ color: "#f1f5f9", fontWeight: 600 }}
                >
                  {stats.efficiencyScore}% Efficiency
                </Typography>
              </Box>
            </Box>
          </Box>
        </CardContent>
      </Card>

      {/* Quick Actions */}
      <Card
        elevation={0}
        sx={{
          mb: 3.5,
          background: "rgba(255, 255, 255, 0.03)",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
          border: "1px solid rgba(255, 255, 255, 0.08)",
          borderRadius: "16px",
          boxShadow: "0 8px 32px rgba(0, 0, 0, 0.25)",
        }}
      >
        <CardContent
          sx={{
            p: { xs: 2.5, sm: 3 },
            "&:last-child": { pb: { xs: 2.5, sm: 3 } },
          }}
        >
          <Typography
            variant="h6"
            sx={{
              color: "#f1f5f9",
              fontWeight: 600,
              fontSize: "1.125rem",
              letterSpacing: "-0.01em",
              mb: 2.5,
            }}
          >
            Quick Actions
          </Typography>
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: {
                xs: "1fr",
                sm: "repeat(2, 1fr)",
                md: "repeat(3, 1fr)",
              },
              gap: 2,
            }}
          >
            {quickActions.map((action, index) => (
              <Button
                key={index}
                onClick={action.action}
                sx={{
                  background: "rgba(255, 255, 255, 0.03)",
                  backdropFilter: "blur(10px)",
                  border: "1px solid rgba(255, 255, 255, 0.08)",
                  borderRadius: "14px",
                  p: 2,
                  textTransform: "none",
                  justifyContent: "flex-start",
                  alignItems: "center",
                  display: "flex",
                  width: "100%",
                  textAlign: "left",
                  boxShadow:
                    "4px 4px 12px rgba(0, 0, 0, 0.25), inset 1px 1px 2px rgba(255, 255, 255, 0.05)",
                  transition: "all 0.25s cubic-bezier(0.4, 0, 0.2, 1)",
                  "&:hover": {
                    transform: "translateY(-2px)",
                    background: "rgba(255, 255, 255, 0.06)",
                    borderColor: action.color,
                    boxShadow: `0 8px 24px rgba(0, 0, 0, 0.3), 0 0 16px ${action.color}25`,
                  },
                  "&:active": {
                    transform: "translateY(0)",
                  },
                }}
              >
                <Box
                  sx={{
                    width: 44,
                    height: 44,
                    borderRadius: "12px",
                    background: `${action.color}20`,
                    border: `1px solid ${action.color}40`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: action.color,
                    mr: 2,
                    flexShrink: 0,
                  }}
                >
                  {action.icon}
                </Box>
                <Box sx={{ minWidth: 0, flex: 1 }}>
                  <Typography
                    variant="body2"
                    sx={{
                      color: "#f1f5f9",
                      fontWeight: 600,
                      fontSize: "0.925rem",
                    }}
                  >
                    {action.title}
                  </Typography>
                  <Typography
                    variant="caption"
                    sx={{ color: "#94a3b8", display: "block" }}
                  >
                    {action.description}
                  </Typography>
                </Box>
              </Button>
            ))}
          </Box>
        </CardContent>
      </Card>

      {/* Stats Cards */}
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: {
            xs: "1fr",
            sm: "repeat(2, 1fr)",
            md: "repeat(3, 1fr)",
          },
          gap: 2.5,
          mb: 3.5,
        }}
      >
        {statCards.map((card, index) => (
          <Card
            key={index}
            elevation={0}
            sx={{
              background: "rgba(255, 255, 255, 0.03)",
              backdropFilter: "blur(20px)",
              WebkitBackdropFilter: "blur(20px)",
              border: "1px solid rgba(255, 255, 255, 0.08)",
              borderRadius: "16px",
              boxShadow: "0 8px 32px rgba(0, 0, 0, 0.25)",
              transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
              position: "relative",
              overflow: "hidden",
              "&:hover": {
                transform: "translateY(-3px)",
                borderColor: card.border,
                boxShadow: `0 14px 40px rgba(0, 0, 0, 0.35), 0 0 24px ${card.glow}`,
              },
              "&::before": {
                content: '""',
                position: "absolute",
                top: 0,
                left: 0,
                right: 0,
                height: "2px",
                background: `linear-gradient(90deg, transparent, ${card.color}, transparent)`,
                opacity: 0.8,
              },
            }}
          >
            <CardContent sx={{ p: 2.5, "&:last-child": { pb: 2.5 } }}>
              <Box
                display="flex"
                alignItems="center"
                justifyContent="space-between"
              >
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography
                    sx={{
                      color: "#94a3b8",
                      fontWeight: 600,
                      fontSize: "0.75rem",
                      textTransform: "uppercase",
                      letterSpacing: "0.06em",
                      mb: 1,
                    }}
                  >
                    {card.title}
                  </Typography>
                  <Typography
                    variant="h4"
                    component="div"
                    sx={{
                      color: "#f1f5f9",
                      fontWeight: 700,
                      fontSize: "1.75rem",
                      letterSpacing: "-0.02em",
                      lineHeight: 1.2,
                    }}
                  >
                    {card.value}
                  </Typography>
                </Box>
                <Box
                  sx={{
                    width: 52,
                    height: 52,
                    borderRadius: "14px",
                    background: card.accent,
                    border: `1px solid ${card.border}`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    boxShadow: `0 4px 14px ${card.glow}`,
                    flexShrink: 0,
                    ml: 2,
                  }}
                >
                  {card.icon}
                </Box>
              </Box>
            </CardContent>
          </Card>
        ))}
      </Box>

      {/* Main Content Grid */}
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: { xs: "1fr", lg: "2fr 1fr" },
          gap: 3,
        }}
      >
        {/* Salary Information */}
        <Box>
          <Card
            elevation={0}
            sx={{
              background: "rgba(255, 255, 255, 0.03)",
              backdropFilter: "blur(20px)",
              WebkitBackdropFilter: "blur(20px)",
              border: "1px solid rgba(255, 255, 255, 0.08)",
              borderRadius: "16px",
              boxShadow: "0 8px 32px rgba(0, 0, 0, 0.25)",
              height: "100%",
            }}
          >
            <CardContent
              sx={{
                p: { xs: 2.5, sm: 3 },
                "&:last-child": { pb: { xs: 2.5, sm: 3 } },
              }}
            >
              <Typography
                variant="h6"
                sx={{
                  color: "#f1f5f9",
                  fontWeight: 600,
                  fontSize: "1.125rem",
                  letterSpacing: "-0.01em",
                  mb: 2.5,
                }}
              >
                Salary Information
              </Typography>
              {employeeData ? (
                <Box>
                  <Box
                    display="flex"
                    justifyContent="space-between"
                    alignItems="center"
                    py={1.5}
                    sx={{ borderBottom: "1px solid rgba(255, 255, 255, 0.05)" }}
                  >
                    <Typography variant="body2" sx={{ color: "#94a3b8" }}>
                      Basic Salary:
                    </Typography>
                    <Typography
                      variant="body2"
                      sx={{ color: "#f1f5f9", fontWeight: 600 }}
                    >
                      ₹{employeeData.salary?.basic || "0"}
                    </Typography>
                  </Box>
                  {employeeData.salary?.hra && (
                    <Box
                      display="flex"
                      justifyContent="space-between"
                      alignItems="center"
                      py={1.5}
                      sx={{ borderBottom: "1px solid rgba(255, 255, 255, 0.05)" }}
                    >
                      <Typography variant="body2" sx={{ color: "#94a3b8" }}>
                        HRA:
                      </Typography>
                      <Typography
                        variant="body2"
                        sx={{ color: "#f1f5f9", fontWeight: 600 }}
                      >
                        ₹{employeeData.salary.hra}
                      </Typography>
                    </Box>
                  )}
                  {employeeData.salary?.ta && (
                    <Box
                      display="flex"
                      justifyContent="space-between"
                      alignItems="center"
                      py={1.5}
                      sx={{ borderBottom: "1px solid rgba(255, 255, 255, 0.05)" }}
                    >
                      <Typography variant="body2" sx={{ color: "#94a3b8" }}>
                        TA:
                      </Typography>
                      <Typography
                        variant="body2"
                        sx={{ color: "#f1f5f9", fontWeight: 600 }}
                      >
                        ₹{employeeData.salary.ta}
                      </Typography>
                    </Box>
                  )}
                  {employeeData.salary?.da && (
                    <Box
                      display="flex"
                      justifyContent="space-between"
                      alignItems="center"
                      py={1.5}
                      sx={{ borderBottom: "1px solid rgba(255, 255, 255, 0.05)" }}
                    >
                      <Typography variant="body2" sx={{ color: "#94a3b8" }}>
                        DA:
                      </Typography>
                      <Typography
                        variant="body2"
                        sx={{ color: "#f1f5f9", fontWeight: 600 }}
                      >
                        ₹{employeeData.salary.da}
                      </Typography>
                    </Box>
                  )}
                  <Divider
                    sx={{ my: 2.5, borderColor: "rgba(255, 255, 255, 0.08)" }}
                  />
                  <Box
                    display="flex"
                    justifyContent="space-between"
                    alignItems="center"
                    sx={{
                      background: "rgba(99, 102, 241, 0.08)",
                      border: "1px solid rgba(99, 102, 241, 0.2)",
                      borderRadius: "12px",
                      p: 2,
                    }}
                  >
                    <Typography
                      variant="body1"
                      sx={{ color: "#f1f5f9", fontWeight: 600 }}
                    >
                      Total Monthly Calculation:
                    </Typography>
                    <Typography
                      variant="h6"
                      sx={{ color: "#34d399", fontWeight: 700 }}
                    >
                      ₹{stats.currentMonthSalary.toLocaleString()}
                    </Typography>
                  </Box>
                </Box>
              ) : (
                <Typography variant="body2" sx={{ color: "#94a3b8" }}>
                  No salary records found.
                </Typography>
              )}
            </CardContent>
          </Card>
        </Box>

        {/* Sidebar - Notifications, Attendance & Performance */}
        <Box sx={{ display: "flex", flexDirection: "column", gap: 3 }}>
          {/* Notifications */}
          <Card
            elevation={0}
            sx={{
              background: "rgba(255, 255, 255, 0.03)",
              backdropFilter: "blur(20px)",
              WebkitBackdropFilter: "blur(20px)",
              border: "1px solid rgba(255, 255, 255, 0.08)",
              borderRadius: "16px",
              boxShadow: "0 8px 32px rgba(0, 0, 0, 0.25)",
            }}
          >
            <CardContent sx={{ p: 2.5, "&:last-child": { pb: 2.5 } }}>
              <Box
                display="flex"
                alignItems="center"
                justifyContent="space-between"
                mb={2}
              >
                <Typography
                  variant="h6"
                  sx={{
                    color: "#f1f5f9",
                    fontWeight: 600,
                    fontSize: "1.125rem",
                    letterSpacing: "-0.01em",
                  }}
                >
                  Notifications
                </Typography>
                <Badge
                  badgeContent={notifications.filter((n) => !n.read).length}
                  sx={{
                    "& .MuiBadge-badge": {
                      backgroundColor: "#ef4444",
                      color: "#ffffff",
                      fontWeight: 600,
                    },
                  }}
                >
                  <Notifications sx={{ color: "#94a3b8" }} />
                </Badge>
              </Box>
              <List
                sx={{
                  p: 0,
                  display: "flex",
                  flexDirection: "column",
                  gap: 1,
                }}
              >
                {notifications.slice(0, 3).map((notification) => (
                  <ListItem
                    key={notification.id}
                    sx={{
                      px: 1.5,
                      py: 1.25,
                      borderRadius: "12px",
                      background: "rgba(255, 255, 255, 0.02)",
                      border: "1px solid rgba(255, 255, 255, 0.04)",
                      transition: "all 0.2s ease",
                      "&:hover": {
                        background: "rgba(255, 255, 255, 0.04)",
                      },
                    }}
                  >
                    <ListItemIcon sx={{ minWidth: 36 }}>
                      {getNotificationIcon(notification.type)}
                    </ListItemIcon>
                    <ListItemText
                      primary={
                        <Typography
                          variant="body2"
                          sx={{
                            color: "#f1f5f9",
                            fontWeight: notification.read ? 400 : 600,
                            fontSize: "0.875rem",
                          }}
                        >
                          {notification.title}
                        </Typography>
                      }
                      secondary={
                        <Typography
                          variant="caption"
                          sx={{ color: "#94a3b8", display: "block", mt: 0.25 }}
                        >
                          {notification.message}
                        </Typography>
                      }
                    />
                  </ListItem>
                ))}
                {notifications.length === 0 && (
                  <ListItem sx={{ px: 0, py: 1.5 }}>
                    <ListItemText
                      primary={
                        <Typography variant="body2" sx={{ color: "#94a3b8" }}>
                          No notifications available.
                        </Typography>
                      }
                    />
                  </ListItem>
                )}
              </List>
            </CardContent>
          </Card>

          {/* Recent Attendance */}
          <Card
            elevation={0}
            sx={{
              background: "rgba(255, 255, 255, 0.03)",
              backdropFilter: "blur(20px)",
              WebkitBackdropFilter: "blur(20px)",
              border: "1px solid rgba(255, 255, 255, 0.08)",
              borderRadius: "16px",
              boxShadow: "0 8px 32px rgba(0, 0, 0, 0.25)",
            }}
          >
            <CardContent sx={{ p: 2.5, "&:last-child": { pb: 2.5 } }}>
              <Typography
                variant="h6"
                sx={{
                  color: "#f1f5f9",
                  fontWeight: 600,
                  fontSize: "1.125rem",
                  letterSpacing: "-0.01em",
                  mb: 2,
                }}
              >
                Recent Attendance
              </Typography>
              <List
                sx={{
                  p: 0,
                  display: "flex",
                  flexDirection: "column",
                  gap: 1,
                }}
              >
                {recentAttendanceEntries.map((record) => (
                  <ListItem
                    key={record.id}
                    sx={{
                      px: 1.5,
                      py: 1.25,
                      borderRadius: "12px",
                      background: "rgba(255, 255, 255, 0.02)",
                      border: "1px solid rgba(255, 255, 255, 0.04)",
                    }}
                  >
                    <ListItemIcon sx={{ minWidth: 36 }}>
                      {record.status === "present" ? (
                        <CheckCircle sx={{ color: "#10b981", fontSize: 20 }} />
                      ) : record.status === "late" ? (
                        <Warning sx={{ color: "#f59e0b", fontSize: 20 }} />
                      ) : (
                        <Info sx={{ color: "#3b82f6", fontSize: 20 }} />
                      )}
                    </ListItemIcon>
                    <ListItemText
                      primary={
                        <Typography
                          variant="body2"
                          sx={{ color: "#f1f5f9", fontWeight: 500 }}
                        >
                          {new Date(record.date).toLocaleDateString()}
                        </Typography>
                      }
                      secondary={
                        <Typography
                          variant="caption"
                          sx={{ color: "#94a3b8" }}
                        >
                          {record.status.toUpperCase()}
                        </Typography>
                      }
                    />
                    <Chip
                      label={record.status}
                      size="small"
                      sx={{
                        backgroundColor:
                          record.status === "present"
                            ? "rgba(16, 185, 129, 0.15)"
                            : record.status === "late"
                              ? "rgba(245, 158, 11, 0.15)"
                              : "rgba(99, 102, 241, 0.15)",
                        color:
                          record.status === "present"
                            ? "#34d399"
                            : record.status === "late"
                              ? "#fbbf24"
                              : "#a5b4fc",
                        border: `1px solid ${
                          record.status === "present"
                            ? "rgba(16, 185, 129, 0.25)"
                            : record.status === "late"
                              ? "rgba(245, 158, 11, 0.25)"
                              : "rgba(99, 102, 241, 0.25)"
                        }`,
                        borderRadius: "8px",
                        fontSize: "0.7rem",
                        fontWeight: 600,
                        textTransform: "capitalize",
                      }}
                    />
                  </ListItem>
                ))}
                {recentAttendanceEntries.length === 0 && (
                  <ListItem sx={{ px: 0, py: 1.5 }}>
                    <ListItemText
                      primary={
                        <Typography variant="body2" sx={{ color: "#94a3b8" }}>
                          No attendance records found.
                        </Typography>
                      }
                    />
                  </ListItem>
                )}
              </List>
            </CardContent>
          </Card>

          {/* Performance Metrics */}
          <Card
            elevation={0}
            sx={{
              background: "rgba(255, 255, 255, 0.03)",
              backdropFilter: "blur(20px)",
              WebkitBackdropFilter: "blur(20px)",
              border: "1px solid rgba(255, 255, 255, 0.08)",
              borderRadius: "16px",
              boxShadow: "0 8px 32px rgba(0, 0, 0, 0.25)",
            }}
          >
            <CardContent sx={{ p: 2.5, "&:last-child": { pb: 2.5 } }}>
              <Typography
                variant="h6"
                sx={{
                  color: "#f1f5f9",
                  fontWeight: 600,
                  fontSize: "1.125rem",
                  letterSpacing: "-0.01em",
                  mb: 2.5,
                }}
              >
                Performance Metrics
              </Typography>

              <Box sx={{ mb: 2.5 }}>
                <Box display="flex" justifyContent="space-between" mb={1}>
                  <Typography variant="body2" sx={{ color: "#94a3b8" }}>
                    Efficiency Score
                  </Typography>
                  <Typography
                    variant="body2"
                    sx={{ color: "#f1f5f9", fontWeight: 600 }}
                  >
                    {stats.efficiencyScore}%
                  </Typography>
                </Box>
                <LinearProgress
                  variant="determinate"
                  value={stats.efficiencyScore}
                  sx={{
                    height: 8,
                    borderRadius: 4,
                    backgroundColor: "rgba(255, 255, 255, 0.06)",
                    "& .MuiLinearProgress-bar": {
                      borderRadius: 4,
                      background:
                        "linear-gradient(90deg, #6366f1 0%, #8b5cf6 100%)",
                    },
                  }}
                />
              </Box>

              <Box>
                <Box display="flex" justifyContent="space-between" mb={1}>
                  <Typography variant="body2" sx={{ color: "#94a3b8" }}>
                    This Month's Salary
                  </Typography>
                  <Typography
                    variant="body2"
                    sx={{ color: "#f1f5f9", fontWeight: 600 }}
                  >
                    ₹{stats.currentMonthSalary.toLocaleString()}
                  </Typography>
                </Box>
                <LinearProgress
                  variant="determinate"
                  value={Math.min(
                    (stats.currentMonthSalary / 100000) * 100,
                    100,
                  )}
                  sx={{
                    height: 8,
                    borderRadius: 4,
                    backgroundColor: "rgba(255, 255, 255, 0.06)",
                    "& .MuiLinearProgress-bar": {
                      borderRadius: 4,
                      background:
                        "linear-gradient(90deg, #10b981 0%, #34d399 100%)",
                    },
                  }}
                />
              </Box>
            </CardContent>
          </Card>
        </Box>
      </Box>
    </Box>
  );
}
