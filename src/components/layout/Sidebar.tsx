"use client";

import React from "react";
import {
  Drawer,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Divider,
  Box,
  Typography,
  Avatar,
  IconButton,
  useTheme,
  useMediaQuery,
} from "@mui/material";
import {
  Dashboard,
  People,
  AttachMoney,
  Assessment,
  Settings,
  Logout,
  Person,
  Schedule,
  Receipt,
  Business,
  EventAvailable,
  Notifications,
  FolderOpen,
  TrendingUp,
  SupervisorAccount,
  Backup,
} from "@mui/icons-material";
// import { TrendingUp, FolderOpen, History } from '@mui/icons-material';
import { useAuth } from "@/contexts/AuthContext";
import { useRouter, usePathname } from "next/navigation";
import NotificationCenter from "@/components/notifications/NotificationCenter";

const drawerWidth = 260;

interface SidebarProps {
  open: boolean;
  onClose: () => void;
}

const menuItems = {
  admin: [
    { text: "Dashboard", icon: <Dashboard />, path: "/dashboard" },
    { text: "Employees", icon: <People />, path: "/employees" },
    { text: "Managers", icon: <SupervisorAccount />, path: "/managers" },
    { text: "Attendance", icon: <Schedule />, path: "/attendance" },
    {
      text: "Leave Management",
      icon: <EventAvailable />,
      path: "/leave-management",
    },
    { text: "Salary Structures", icon: <AttachMoney />, path: "/salary" },
    { text: "Salary Slip", icon: <Receipt />, path: "/salary-slip" },
    { text: "Backup", icon: <Backup />, path: "/backup" },
    { text: "Settings", icon: <Settings />, path: "/settings" },
  ],
  manager: [
    { text: "Dashboard", icon: <Dashboard />, path: "/dashboard" },
    { text: "Employees", icon: <People />, path: "/employees" },
    { text: "Attendance", icon: <Schedule />, path: "/attendance" },
    { text: "My Leaves", icon: <EventAvailable />, path: "/leave-management" },
    { text: "Salary Slips", icon: <Assessment />, path: "/salary-slips" },
  ],
  employee: [
    { text: "Dashboard", icon: <Dashboard />, path: "/dashboard" },
    { text: "Profile", icon: <Person />, path: "/profile" },
    { text: "Attendance", icon: <Schedule />, path: "/attendance" },
    { text: "My Leaves", icon: <EventAvailable />, path: "/leave-management" },
    { text: "Salary Slips", icon: <Assessment />, path: "/salary-slips" },
    { text: "Settings", icon: <Settings />, path: "/settings" },
  ],
};

export default function Sidebar({ open, onClose }: SidebarProps) {
  const { currentUser, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));

  const handleLogout = async () => {
    try {
      await logout();
      router.push("/login");
    } catch (error) {
      console.error("Logout error:", error);
    }
  };

  const handleNavigation = (path: string) => {
    router.push(path);
    if (isMobile) {
      onClose();
    }
  };

  const currentMenuItems = currentUser ? menuItems[currentUser.role] : [];

  return (
    <Drawer
      variant={isMobile ? "temporary" : "permanent"}
      open={isMobile ? open : true}
      onClose={onClose}
      ModalProps={{ keepMounted: true }}
      sx={{
        width: drawerWidth,
        flexShrink: 0,
        "& .MuiDrawer-paper": {
          width: drawerWidth,
          boxSizing: "border-box",
        },
      }}
    >
      <Box sx={{ display: "flex", flexDirection: "column", height: "100%", overflow: "auto" }}>
        {/* Brand Header */}
        <Box
          sx={{
            p: 2.5,
            pb: 2,
            borderBottom: "1px solid rgba(255, 255, 255, 0.06)",
          }}
        >
          <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
            <Box
              sx={{
                width: 36,
                height: 36,
                borderRadius: "10px",
                background: "linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                boxShadow: "0 4px 12px rgba(99, 102, 241, 0.3)",
              }}
            >
              <Typography
                variant="h6"
                sx={{ color: "#fff", fontWeight: 800, fontSize: "0.875rem" }}
              >
                E
              </Typography>
            </Box>
            <Box>
              <Typography
                variant="h6"
                sx={{
                  fontWeight: 700,
                  fontSize: "1rem",
                  background: "linear-gradient(135deg, #f1f5f9 0%, #94a3b8 100%)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  letterSpacing: "-0.01em",
                }}
              >
                EMS Pro
              </Typography>
              <Typography
                variant="caption"
                sx={{ color: "#64748b", fontSize: "0.65rem", lineHeight: 1 }}
              >
                Employee Management
              </Typography>
            </Box>
          </Box>
        </Box>

        {/* User Info */}
        {currentUser && (
          <Box
            sx={{
              mx: 1.5,
              mt: 1.5,
              mb: 1,
              p: 1.5,
              borderRadius: "12px",
              background: "rgba(99, 102, 241, 0.06)",
              border: "1px solid rgba(99, 102, 241, 0.1)",
            }}
          >
            <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
              <Avatar
                sx={{
                  width: 36,
                  height: 36,
                  fontSize: "0.875rem",
                  background: "linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)",
                  border: "2px solid rgba(99, 102, 241, 0.3)",
                }}
              >
                {(currentUser.displayName || currentUser.email || "U")
                  .charAt(0)
                  .toUpperCase()}
              </Avatar>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography
                  variant="body2"
                  sx={{
                    fontWeight: 600,
                    color: "#f1f5f9",
                    fontSize: "0.8125rem",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {currentUser.displayName || currentUser.email || "User"}
                </Typography>
                <Box
                  sx={{
                    display: "inline-flex",
                    mt: 0.25,
                    px: 1,
                    py: 0.125,
                    borderRadius: "6px",
                    background: "rgba(99, 102, 241, 0.15)",
                    border: "1px solid rgba(99, 102, 241, 0.2)",
                  }}
                >
                  <Typography
                    variant="caption"
                    sx={{
                      color: "#a5b4fc",
                      fontSize: "0.625rem",
                      fontWeight: 600,
                      textTransform: "uppercase",
                      letterSpacing: "0.05em",
                    }}
                  >
                    {currentUser.role?.charAt(0).toUpperCase() +
                      currentUser.role?.slice(1) || "User"}
                  </Typography>
                </Box>
              </Box>
              {/* <NotificationCenter /> */}
            </Box>
          </Box>
        )}

        {/* Navigation Menu */}
        <Box sx={{ flex: 1, px: 1, py: 0.5 }}>
          <Typography
            variant="overline"
            sx={{
              px: 1.5,
              pt: 1,
              pb: 0.5,
              display: "block",
              color: "#475569",
              fontSize: "0.625rem",
              fontWeight: 700,
              letterSpacing: "0.1em",
            }}
          >
            Navigation
          </Typography>
          <List sx={{ py: 0 }}>
            {currentMenuItems.map((item) => {
              const isActive = pathname === item.path;
              return (
                <ListItem key={item.text} disablePadding sx={{ mb: 0.25 }}>
                  <ListItemButton
                    selected={isActive}
                    onClick={() => handleNavigation(item.path)}
                    sx={{
                      borderRadius: "10px",
                      py: 1,
                      px: 1.5,
                      minHeight: 42,
                      transition: "all 0.2s ease",
                      "&.Mui-selected": {
                        background:
                          "linear-gradient(135deg, rgba(99, 102, 241, 0.2) 0%, rgba(139, 92, 246, 0.12) 100%)",
                        border: "1px solid rgba(99, 102, 241, 0.2)",
                        boxShadow: "0 4px 12px rgba(99, 102, 241, 0.15)",
                        "&:hover": {
                          background:
                            "linear-gradient(135deg, rgba(99, 102, 241, 0.25) 0%, rgba(139, 92, 246, 0.15) 100%)",
                        },
                        "& .MuiListItemIcon-root": {
                          color: "#a5b4fc",
                        },
                        "& .MuiListItemText-primary": {
                          color: "#e0e7ff",
                          fontWeight: 600,
                        },
                      },
                      "&:not(.Mui-selected)": {
                        border: "1px solid transparent",
                        "&:hover": {
                          backgroundColor: "rgba(255, 255, 255, 0.04)",
                          "& .MuiListItemIcon-root": {
                            color: "#a5b4fc",
                          },
                        },
                      },
                    }}
                  >
                    <ListItemIcon
                      sx={{
                        minWidth: 36,
                        color: isActive ? "#a5b4fc" : "#64748b",
                        transition: "color 0.2s ease",
                        "& .MuiSvgIcon-root": {
                          fontSize: "1.2rem",
                        },
                      }}
                    >
                      {item.icon}
                    </ListItemIcon>
                    <ListItemText
                      primary={item.text}
                      primaryTypographyProps={{
                        fontSize: "0.8125rem",
                        fontWeight: isActive ? 600 : 400,
                        color: isActive ? "#e0e7ff" : "#94a3b8",
                      }}
                    />
                  </ListItemButton>
                </ListItem>
              );
            })}
          </List>
        </Box>

        <Divider sx={{ mx: 2 }} />

        {/* Logout */}
        <Box sx={{ p: 1, pb: 1.5 }}>
          <List sx={{ py: 0 }}>
            <ListItem disablePadding>
              <ListItemButton
                onClick={handleLogout}
                sx={{
                  borderRadius: "10px",
                  py: 1,
                  px: 1.5,
                  transition: "all 0.2s ease",
                  "&:hover": {
                    backgroundColor: "rgba(239, 68, 68, 0.08)",
                    "& .MuiListItemIcon-root": {
                      color: "#f87171",
                    },
                    "& .MuiListItemText-primary": {
                      color: "#f87171",
                    },
                  },
                }}
              >
                <ListItemIcon
                  sx={{
                    minWidth: 36,
                    color: "#64748b",
                    "& .MuiSvgIcon-root": { fontSize: "1.2rem" },
                  }}
                >
                  <Logout />
                </ListItemIcon>
                <ListItemText
                  primary="Logout"
                  primaryTypographyProps={{
                    fontSize: "0.8125rem",
                    color: "#94a3b8",
                  }}
                />
              </ListItemButton>
            </ListItem>
          </List>
        </Box>
      </Box>
    </Drawer>
  );
}
