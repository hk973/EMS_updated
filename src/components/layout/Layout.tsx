"use client";

import React, { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import {
  Box,
  AppBar,
  Toolbar,
  Typography,
  IconButton,
  useTheme,
  useMediaQuery,
  Button,
  Chip,
  Tooltip,
} from "@mui/material";
import {
  Menu,
  Search,
  NavigateNext,
  Circle,
  KeyboardCommandKey,
} from "@mui/icons-material";
import Sidebar from "./Sidebar";
import NotificationCenter from "@/components/notifications/NotificationCenter";
import CommandMenu from "./CommandMenu";
import { useAuth } from "@/contexts/AuthContext";

interface LayoutProps {
  children: React.ReactNode;
}

const drawerWidth = 260;

const pathBreadcrumbs: Record<string, { section: string; page: string }> = {
  "/dashboard": { section: "Analytics", page: "BI Intelligence" },
  "/employees": { section: "Workforce", page: "Employee Directory" },
  "/managers": { section: "Workforce", page: "Manager Directory" },
  "/attendance": { section: "Operations", page: "Attendance Manager" },
  "/salary": { section: "Compensation", page: "Salary Structures" },
  "/salary-slip": { section: "Compensation", page: "Salary Slips" },
  "/salary-slips": { section: "Compensation", page: "Salary Slips" },
  "/payroll": { section: "Compensation", page: "Payroll Processing" },
  "/leave-management": { section: "Operations", page: "Leave Management" },
  "/settings": { section: "Configuration", page: "Company Settings" },
  "/backup": { section: "System", page: "Backup & Recovery" },
  "/profile": { section: "Personal", page: "My Profile" },
};

export default function Layout({ children }: LayoutProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [cmdOpen, setCmdOpen] = useState(false);
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));
  const pathname = usePathname();
  const { currentUser } = useAuth();

  const handleDrawerToggle = () => {
    setMobileOpen(!mobileOpen);
  };

  // Global Cmd+K / Ctrl+K keyboard shortcut listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setCmdOpen((prev) => !prev);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const breadcrumb = pathBreadcrumbs[pathname] || {
    section: "Portal",
    page: pathname.replace("/", "").replace(/-/g, " ") || "Dashboard",
  };

  return (
    <Box sx={{ display: "flex", minHeight: "100vh" }}>
      {/* App Bar */}
      <AppBar
        position="fixed"
        elevation={0}
        sx={{
          width: { md: `calc(100% - ${drawerWidth}px)` },
          ml: { md: `${drawerWidth}px` },
          zIndex: theme.zIndex.drawer + 1,
          backgroundColor: "rgba(10, 10, 26, 0.78)",
          backdropFilter: "blur(24px)",
          WebkitBackdropFilter: "blur(24px)",
          borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
          boxShadow: "0 4px 30px rgba(0, 0, 0, 0.25)",
        }}
      >
        <Toolbar
          sx={{
            minHeight: "64px",
            px: { xs: 2, sm: 3 },
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          {/* Left: Mobile Drawer Trigger + Active Breadcrumbs */}
          <Box display="flex" alignItems="center" gap={1.5} sx={{ minWidth: 0 }}>
            <IconButton
              color="inherit"
              aria-label="open drawer"
              edge="start"
              onClick={handleDrawerToggle}
              sx={{
                mr: 1,
                display: { md: "none" },
                color: "#94a3b8",
                "&:hover": { color: "#f1f5f9" },
              }}
            >
              <Menu />
            </IconButton>

            {/* Breadcrumb Trail */}
            <Box display="flex" alignItems="center" gap={0.8} sx={{ minWidth: 0 }}>
              <Typography
                variant="body2"
                sx={{
                  color: "#64748b",
                  fontWeight: 600,
                  fontSize: { xs: "0.75rem", sm: "0.82rem" },
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                  display: { xs: "none", sm: "block" },
                }}
              >
                {breadcrumb.section}
              </Typography>
              <NavigateNext
                sx={{
                  color: "#475569",
                  fontSize: 16,
                  display: { xs: "none", sm: "block" },
                }}
              />
              <Typography
                variant="h6"
                noWrap
                sx={{
                  fontWeight: 700,
                  fontSize: { xs: "0.95rem", sm: "1.1rem" },
                  letterSpacing: "-0.01em",
                  background:
                    "linear-gradient(135deg, #f8fafc 0%, #cbd5e1 100%)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  textTransform: "capitalize",
                }}
              >
                {breadcrumb.page}
              </Typography>
            </Box>
          </Box>

          {/* Center/Right: Spotlight Cmd+K Button + Presence & Notifications */}
          <Box display="flex" alignItems="center" gap={1.5}>
            {/* Linear-style Spotlight Search Button */}
            <Button
              onClick={() => setCmdOpen(true)}
              variant="outlined"
              size="small"
              startIcon={<Search sx={{ color: "#818cf8", fontSize: 18 }} />}
              endIcon={
                <Box
                  sx={{
                    background: "rgba(255, 255, 255, 0.08)",
                    border: "1px solid rgba(255, 255, 255, 0.12)",
                    borderRadius: "6px",
                    px: "6px",
                    py: "2px",
                    fontSize: "0.68rem",
                    fontWeight: 700,
                    color: "#94a3b8",
                    display: { xs: "none", sm: "flex" },
                    alignItems: "center",
                    gap: "2px",
                  }}
                >
                  <KeyboardCommandKey sx={{ fontSize: 11 }} /> K
                </Box>
              }
              sx={{
                display: { xs: "none", sm: "flex" },
                textTransform: "none",
                color: "#94a3b8",
                background: "rgba(255, 255, 255, 0.03)",
                border: "1px solid rgba(255, 255, 255, 0.1)",
                borderRadius: "10px",
                px: 1.5,
                py: 0.6,
                minWidth: { sm: 180, md: 240 },
                justifyContent: "space-between",
                fontSize: "0.82rem",
                "&:hover": {
                  background: "rgba(255, 255, 255, 0.06)",
                  borderColor: "rgba(99, 102, 241, 0.4)",
                  color: "#f8fafc",
                },
              }}
            >
              Search or jump to...
            </Button>

            {/* Mobile Search Icon Button */}
            <IconButton
              onClick={() => setCmdOpen(true)}
              sx={{
                display: { xs: "flex", sm: "none" },
                color: "#94a3b8",
                background: "rgba(255, 255, 255, 0.04)",
                border: "1px solid rgba(255, 255, 255, 0.08)",
                borderRadius: "10px",
                p: "8px",
              }}
            >
              <Search sx={{ fontSize: 20 }} />
            </IconButton>

            {/* Role & Presence Pill */}
            {currentUser && (
              <Chip
                icon={
                  <Circle
                    sx={{
                      fontSize: "8px !important",
                      color:
                        currentUser.role === "admin"
                          ? "#34d399 !important"
                          : "#38bdf8 !important",
                      ml: "8px !important",
                    }}
                  />
                }
                label={
                  currentUser.role === "admin"
                    ? "Admin"
                    : currentUser.role === "manager"
                    ? "Manager"
                    : "Employee"
                }
                size="small"
                sx={{
                  background:
                    currentUser.role === "admin"
                      ? "rgba(99, 102, 241, 0.15)"
                      : "rgba(56, 189, 248, 0.15)",
                  color:
                    currentUser.role === "admin" ? "#c4b5fd" : "#7dd3fc",
                  border: `1px solid ${
                    currentUser.role === "admin"
                      ? "rgba(99, 102, 241, 0.3)"
                      : "rgba(56, 189, 248, 0.3)"
                  }`,
                  fontWeight: 600,
                  fontSize: "0.72rem",
                  height: 26,
                  display: { xs: "none", md: "inline-flex" },
                }}
              />
            )}

            {/* Notification Center */}
            <NotificationCenter />
          </Box>
        </Toolbar>
      </AppBar>

      {/* Global Command Menu Spotlight */}
      <CommandMenu open={cmdOpen} onClose={() => setCmdOpen(false)} />

      {/* Sidebar */}
      <Sidebar open={mobileOpen} onClose={handleDrawerToggle} />

      {/* Main Content Area with Ambient Lighting */}
      <Box
        component="main"
        sx={{
          flexGrow: 1,
          p: { xs: 2, sm: 3, md: 3.5 },
          width: { md: `calc(100% - ${drawerWidth}px)` },
          mt: "64px",
          minHeight: "calc(100vh - 64px)",
          overflowX: "hidden",
          position: "relative",
          "&::before": {
            content: '""',
            position: "absolute",
            top: 0,
            left: "15%",
            width: "500px",
            height: "350px",
            background:
              "radial-gradient(circle, rgba(99, 102, 241, 0.05) 0%, transparent 70%)",
            pointerEvents: "none",
            zIndex: 0,
          },
        }}
      >
        {children}
      </Box>
    </Box>
  );
}
