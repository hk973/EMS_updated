"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import Layout from "@/components/layout/Layout";
import RouteGuard from "@/components/auth/RouteGuard";
import EmployeeSettings from "@/components/settings/EmployeeSettings";
import AdminCompanySettings from "@/components/settings/AdminCompanySettings";
import { Box, CircularProgress, Typography, Paper, Alert } from "@mui/material";

export default function Settings() {
  const { currentUser, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !currentUser) {
      router.push("/login");
    }
  }, [currentUser, loading, router]);

  if (loading) {
    return (
      <Box
        display="flex"
        justifyContent="center"
        alignItems="center"
        minHeight="100vh"
      >
        <CircularProgress />
      </Box>
    );
  }

  if (!currentUser) {
    return null;
  }

  return (
    <RouteGuard allowedRoles={["admin", "manager", "employee"]}>
      <Layout>
        {currentUser.role === "employee" ? (
          <EmployeeSettings />
        ) : currentUser.role === "admin" ? (
          <AdminCompanySettings />
        ) : (
          <Box>
            <Typography
              variant="h4"
              sx={{
                fontWeight: 700,
                fontSize: { xs: "1.5rem", sm: "1.875rem" },
                letterSpacing: "-0.02em",
                background: "linear-gradient(135deg, #f1f5f9 0%, #cbd5e1 100%)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                mb: 1,
              }}
            >
              System Settings
            </Typography>

            <Paper
              elevation={0}
              sx={{
                p: 3,
                mt: 2,
                backgroundColor: "rgba(255, 255, 255, 0.03)",
                backdropFilter: "blur(20px)",
                WebkitBackdropFilter: "blur(20px)",
                border: "1px solid rgba(255, 255, 255, 0.08)",
                borderRadius: "16px",
              }}
            >
              <Alert
                severity="info"
                sx={{
                  backgroundColor: "rgba(59, 130, 246, 0.1)",
                  border: "1px solid rgba(59, 130, 246, 0.2)",
                  color: "#93c5fd",
                }}
              >
                System settings and configuration features are coming soon. This
                will include:
                <ul>
                  <li>Company information and branding</li>
                  <li>Tax configuration and rates</li>
                  <li>Email notification settings</li>
                  <li>User management and permissions</li>
                  <li>System backup and restore</li>
                  <li>Integration settings</li>
                </ul>
              </Alert>
            </Paper>
          </Box>
        )}
      </Layout>
    </RouteGuard>
  );
}
