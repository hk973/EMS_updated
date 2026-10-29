/* eslint-disable @typescript-eslint/ban-ts-comment */
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
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Badge,
  LinearProgress,
} from "@mui/material";
import {
  AttachMoney,
  Notifications,
  Info,
  CheckCircle,
  Warning,
  People,
} from "@mui/icons-material";
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import { Employee, Payroll } from "@/types";

interface ManagerStats {
  totalEmployees: number;
  activeEmployees: number;
  totalPayroll: number;
  pendingApprovals: number;
}

interface Notification {
  id: string;
  title: string;
  message: string;
  type: "info" | "warning" | "success" | "error";
  date: Date;
  read: boolean;
}

export default function ManagerDashboard() {
  const { currentUser } = useAuth();
  const [stats, setStats] = useState<ManagerStats>({
    totalEmployees: 0,
    activeEmployees: 0,
    totalPayroll: 0,
    pendingApprovals: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [payrollActivity, setPayrollActivity] = useState<Payroll[]>([]);

  useEffect(() => {
    const fetchManagerData = async () => {
      try {
        setLoading(true);

        if (!currentUser?.uid) {
          setNotifications([]);
          setPayrollActivity([]);
          setStats({
            totalEmployees: 0,
            activeEmployees: 0,
            totalPayroll: 0,
            pendingApprovals: 0,
          });
          setLoading(false);
          return;
        }

        const companyId = currentUser.companyId || currentUser.uid;

        const [employeesSnapshot, notificationsSnapshot, payrollSnapshot] =
          await Promise.all([
            getDocs(
              query(
                collection(db, "employees"),
                where("companyId", "==", companyId),
              ),
            ),
            getDocs(
              query(
                collection(db, "notifications"),
                where("userId", "==", currentUser.uid),
              ),
            ),
            getDocs(
              query(
                collection(db, "payroll"),
                where("companyId", "==", companyId),
              ),
            ),
          ]);

        const employeesData: Employee[] = employeesSnapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })) as Employee[];

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

        const payrollData: Payroll[] = payrollSnapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })) as Payroll[];
        setPayrollActivity(
          payrollData.sort((a, b) => {
            const left = a.processedAt ? new Date(a.processedAt).getTime() : 0;
            const right = b.processedAt ? new Date(b.processedAt).getTime() : 0;
            return right - left;
          }),
        );

        // Calculate stats
        const totalEmployees = employeesData.length;
        const activeEmployees = employeesData.filter(
          (emp) => emp.status !== "inactive",
        ).length;
        const totalPayroll = employeesData.reduce((sum, emp) => {
          // Use new salary structure if available, fallback to legacy structure
          if (emp.salary?.ctcPerMonth) {
            return sum + emp.salary.ctcPerMonth;
          } else {
            const basic =
              typeof emp.salary?.basic === "string"
                ? parseInt(emp.salary.basic || "0") || 0
                : (emp.salary?.basic ?? emp.salary?.base) || 0;
            const hra =
              typeof emp.salary?.hra === "string"
                ? parseInt(emp.salary.hra || "0") || 0
                : emp.salary?.hra || 0;
            const ta =
              typeof emp.salary?.ta === "string"
                ? parseInt(emp.salary.ta || "0") || 0
                : emp.salary?.ta || 0;
            const da =
              typeof emp.salary?.da === "string"
                ? parseInt(emp.salary.da || "0") || 0
                : emp.salary?.da || 0;
            return sum + basic + hra + ta + da;
          }
        }, 0);

        const pendingApprovals = payrollData.filter(
          (record) => record.status === "pending",
        ).length;

        setStats({
          totalEmployees,
          activeEmployees,
          totalPayroll,
          pendingApprovals,
        });
      } catch (err) {
        console.error("Error fetching manager data:", err);
        setError("Failed to load dashboard data");
      } finally {
        setLoading(false);
      }
    };

    fetchManagerData();
  }, [currentUser]);

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
      title: "Total Employees",
      value: stats.totalEmployees,
      icon: <People sx={{ color: "#818cf8", fontSize: 28 }} />,
      color: "#818cf8",
      accent: "rgba(99, 102, 241, 0.15)",
      border: "rgba(99, 102, 241, 0.25)",
      glow: "rgba(99, 102, 241, 0.2)",
    },
    {
      title: "Active Employees",
      value: stats.activeEmployees,
      icon: <CheckCircle sx={{ color: "#34d399", fontSize: 28 }} />,
      color: "#34d399",
      accent: "rgba(16, 185, 129, 0.15)",
      border: "rgba(16, 185, 129, 0.25)",
      glow: "rgba(16, 185, 129, 0.2)",
    },
    {
      title: "Total Payroll",
      value: `₹${stats.totalPayroll.toLocaleString()}`,
      icon: <AttachMoney sx={{ color: "#fbbf24", fontSize: 28 }} />,
      color: "#fbbf24",
      accent: "rgba(245, 158, 11, 0.15)",
      border: "rgba(245, 158, 11, 0.25)",
      glow: "rgba(245, 158, 11, 0.2)",
    },
    {
      title: "Pending Approvals",
      value: stats.pendingApprovals,
      icon: <Warning sx={{ color: "#f87171", fontSize: 28 }} />,
      color: "#f87171",
      accent: "rgba(239, 68, 68, 0.15)",
      border: "rgba(239, 68, 68, 0.25)",
      glow: "rgba(239, 68, 68, 0.2)",
    },
  ];

  return (
    <Box>
      {/* Dashboard Header */}
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
          Welcome, {currentUser?.displayName} to the Dashboard! 👋
        </Typography>
        <Typography variant="body2" sx={{ color: "#94a3b8" }}>
          Manager workspace, employee statistics, and team approvals overview
        </Typography>
      </Box>

      {/* Manager Profile Card */}
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
            background: "linear-gradient(90deg, transparent, #10b981, transparent)",
            opacity: 0.8,
          },
        }}
      >
        <CardContent sx={{ p: { xs: 2.5, sm: 3 }, "&:last-child": { pb: { xs: 2.5, sm: 3 } } }}>
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
                background: "linear-gradient(135deg, #10b981 0%, #059669 100%)",
                boxShadow:
                  "0 8px 24px rgba(16, 185, 129, 0.35), inset 2px 2px 4px rgba(255, 255, 255, 0.2)",
                border: "2px solid rgba(255, 255, 255, 0.15)",
                fontSize: "1.75rem",
                fontWeight: 700,
                color: "#ffffff",
              }}
            >
              {currentUser?.displayName?.charAt(0).toUpperCase() || "M"}
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
                Manager ID: {currentUser?.userId}
              </Typography>
              <Typography variant="body2" sx={{ color: "#94a3b8" }}>
                Email: {currentUser?.email}
              </Typography>
            </Box>
            <Box
              sx={{
                alignSelf: { xs: "flex-start", sm: "center" },
                textAlign: { sm: "right" },
              }}
            >
              <Chip
                label="Manager"
                sx={{
                  backgroundColor: "rgba(16, 185, 129, 0.15)",
                  color: "#34d399",
                  border: "1px solid rgba(16, 185, 129, 0.25)",
                  backdropFilter: "blur(10px)",
                  fontWeight: 600,
                  borderRadius: "10px",
                  px: 1,
                }}
              />
            </Box>
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
            lg: "repeat(4, 1fr)",
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
        {/* Team Overview */}
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
            <CardContent sx={{ p: { xs: 2.5, sm: 3 }, "&:last-child": { pb: { xs: 2.5, sm: 3 } } }}>
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
                Team Overview
              </Typography>
              <Box>
                <Box
                  display="flex"
                  justifyContent="space-between"
                  alignItems="center"
                  py={1.75}
                  sx={{ borderBottom: "1px solid rgba(255, 255, 255, 0.05)" }}
                >
                  <Typography variant="body2" sx={{ color: "#94a3b8" }}>
                    Total Team Members:
                  </Typography>
                  <Typography
                    variant="body2"
                    sx={{ color: "#f1f5f9", fontWeight: 600 }}
                  >
                    {stats.totalEmployees}
                  </Typography>
                </Box>
                <Box
                  display="flex"
                  justifyContent="space-between"
                  alignItems="center"
                  py={1.75}
                  sx={{ borderBottom: "1px solid rgba(255, 255, 255, 0.05)" }}
                >
                  <Typography variant="body2" sx={{ color: "#94a3b8" }}>
                    Active Members:
                  </Typography>
                  <Typography
                    variant="body2"
                    sx={{ color: "#34d399", fontWeight: 600 }}
                  >
                    {stats.activeEmployees}
                  </Typography>
                </Box>
                <Box
                  display="flex"
                  justifyContent="space-between"
                  alignItems="center"
                  py={1.75}
                >
                  <Typography variant="body2" sx={{ color: "#94a3b8" }}>
                    Inactive Members:
                  </Typography>
                  <Typography
                    variant="body2"
                    sx={{ color: "#f87171", fontWeight: 600 }}
                  >
                    {stats.totalEmployees - stats.activeEmployees}
                  </Typography>
                </Box>

                {/* Team Health Ratio */}
                <Box sx={{ mt: 3, pt: 2, borderTop: "1px solid rgba(255, 255, 255, 0.06)" }}>
                  <Box display="flex" justifyContent="space-between" mb={1}>
                    <Typography variant="caption" sx={{ color: "#94a3b8" }}>
                      Team Active Ratio
                    </Typography>
                    <Typography
                      variant="caption"
                      sx={{ color: "#34d399", fontWeight: 600 }}
                    >
                      {stats.totalEmployees > 0
                        ? Math.round(
                            (stats.activeEmployees / stats.totalEmployees) * 100,
                          )
                        : 0}
                      % Active
                    </Typography>
                  </Box>
                  <LinearProgress
                    variant="determinate"
                    value={
                      stats.totalEmployees > 0
                        ? (stats.activeEmployees / stats.totalEmployees) * 100
                        : 0
                    }
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
              </Box>
            </CardContent>
          </Card>
        </Box>

        {/* Sidebar - Notifications, Payroll & Metrics */}
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
              <List sx={{ p: 0, display: "flex", flexDirection: "column", gap: 1 }}>
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

          {/* Pending Payroll Approvals */}
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
                Pending Payroll Approvals
              </Typography>
              <List sx={{ p: 0, display: "flex", flexDirection: "column", gap: 1 }}>
                {payrollActivity
                  .filter((record) => record.status === "pending")
                  .slice(0, 3)
                  .map((record) => (
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
                        <AttachMoney sx={{ color: "#f59e0b", fontSize: 22 }} />
                      </ListItemIcon>
                      <ListItemText
                        primary={
                          <Typography
                            variant="body2"
                            sx={{ color: "#f1f5f9", fontWeight: 500 }}
                          >
                            Payroll for ID {record.employeeId}
                          </Typography>
                        }
                        secondary={
                          <Typography
                            variant="caption"
                            sx={{ color: "#94a3b8" }}
                          >
                            Month {record.month}/{record.year}
                          </Typography>
                        }
                      />
                      <Chip
                        label={record.status}
                        size="small"
                        sx={{
                          backgroundColor: "rgba(245, 158, 11, 0.15)",
                          color: "#fbbf24",
                          border: "1px solid rgba(245, 158, 11, 0.25)",
                          borderRadius: "8px",
                          fontSize: "0.7rem",
                          fontWeight: 600,
                          textTransform: "capitalize",
                        }}
                      />
                    </ListItem>
                  ))}
                {payrollActivity.filter((record) => record.status === "pending")
                  .length === 0 && (
                  <ListItem sx={{ px: 0, py: 1.5 }}>
                    <ListItemText
                      primary={
                        <Typography variant="body2" sx={{ color: "#94a3b8" }}>
                          No pending payroll approvals.
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
                  mb: 2,
                }}
              >
                Performance Metrics
              </Typography>
              <Box>
                <Box display="flex" justifyContent="space-between" mb={1}>
                  <Typography variant="body2" sx={{ color: "#94a3b8" }}>
                    Employee Retention
                  </Typography>
                  <Typography
                    variant="body2"
                    sx={{ color: "#f1f5f9", fontWeight: 600 }}
                  >
                    {stats.totalEmployees > 0
                      ? Math.round(
                          (stats.activeEmployees / stats.totalEmployees) * 100,
                        )
                      : 0}
                    %
                  </Typography>
                </Box>
                <LinearProgress
                  variant="determinate"
                  value={
                    stats.totalEmployees > 0
                      ? (stats.activeEmployees / stats.totalEmployees) * 100
                      : 0
                  }
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
            </CardContent>
          </Card>
        </Box>
      </Box>
    </Box>
  );
}
