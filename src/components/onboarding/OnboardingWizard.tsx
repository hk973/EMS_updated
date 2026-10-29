"use client";

import React, { useState } from "react";
import {
  Box,
  Paper,
  Typography,
  Button,
  Stepper,
  Step,
  StepLabel,
  StepContent,
  Card,
  CardContent,
  Avatar,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Alert,
  CircularProgress,
  Chip,
} from "@mui/material";
import {
  Business,
  People,
  Settings,
  CheckCircle,
  ArrowForward,
  ArrowBack,
  Celebration,
  Dashboard,
} from "@mui/icons-material";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";

interface OnboardingStep {
  label: string;
  description: string;
  icon: React.ReactNode;
  content: React.ReactNode;
}

export default function OnboardingWizard() {
  const [activeStep, setActiveStep] = useState(0);
  const [completed, setCompleted] = useState<{ [k: number]: boolean }>({});
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const { currentUser } = useAuth();

  const handleNext = () => {
    setCompleted((prev) => ({ ...prev, [activeStep]: true }));
    if (activeStep === steps.length - 1) {
      handleComplete();
    } else {
      setActiveStep((prevActiveStep) => prevActiveStep + 1);
    }
  };

  const handleBack = () => {
    setActiveStep((prevActiveStep) => prevActiveStep - 1);
  };

  const handleSkip = () => {
    setCompleted((prev) => ({ ...prev, [activeStep]: true }));
    if (activeStep === steps.length - 1) {
      handleComplete();
    } else {
      setActiveStep((prevActiveStep) => prevActiveStep + 1);
    }
  };

  const handleComplete = async () => {
    setLoading(true);
    try {
      // Mark onboarding as completed
      // You can add logic here to update user preferences
      setTimeout(() => {
        router.push("/dashboard"); // This will show admin panel for new company owners
      }, 1000);
    } catch (error) {
      console.error("Error completing onboarding:", error);
    } finally {
      setLoading(false);
    }
  };

  const cardStyle = {
    backgroundColor: "rgba(255, 255, 255, 0.03)",
    backdropFilter: "blur(20px)",
    border: "1px solid rgba(255, 255, 255, 0.08)",
    borderRadius: 3,
    boxShadow: "0 8px 32px rgba(0, 0, 0, 0.25)",
    mb: 3,
  };

  const steps: OnboardingStep[] = [
    {
      label: "Welcome to Your Dashboard",
      description: "Get started with your new company account",
      icon: <Celebration />,
      content: (
        <Box>
          <Card sx={cardStyle}>
            <CardContent sx={{ p: { xs: 2.5, sm: 3.5 } }}>
              <Box display="flex" alignItems="center" gap={2.5} mb={2.5}>
                <Avatar
                  sx={{
                    background: "linear-gradient(135deg, #10b981 0%, #059669 100%)",
                    width: 56,
                    height: 56,
                    borderRadius: "16px",
                    boxShadow: "0 6px 18px rgba(16, 185, 129, 0.35)",
                  }}
                >
                  <Business sx={{ fontSize: 30, color: "#ffffff" }} />
                </Avatar>
                <Box>
                  <Typography
                    variant="h5"
                    sx={{ color: "#f1f5f9", fontWeight: 700, fontSize: { xs: "1.25rem", sm: "1.4rem" } }}
                  >
                    Welcome, {currentUser?.displayName}!
                  </Typography>
                  <Typography variant="body1" sx={{ color: "#94a3b8" }}>
                    Your company account has been successfully created
                  </Typography>
                </Box>
              </Box>
              <Alert
                severity="success"
                sx={{
                  mb: 2.5,
                  borderRadius: 2.5,
                  border: "1px solid rgba(16, 185, 129, 0.3)",
                  backgroundColor: "rgba(16, 185, 129, 0.08)",
                  backdropFilter: "blur(10px)",
                  color: "#f1f5f9",
                  "& .MuiAlert-icon": { color: "#10b981" },
                }}
              >
                🎉 Your company is now ready to start managing employees and payroll!
              </Alert>
              <Typography variant="body2" sx={{ color: "#94a3b8", mb: 2 }}>
                This quick setup will help you get started with the essential features:
              </Typography>
              <List disablePadding>
                <ListItem sx={{ px: 0, py: 1 }}>
                  <ListItemIcon sx={{ minWidth: 36 }}>
                    <CheckCircle sx={{ color: "#10b981", fontSize: 22 }} />
                  </ListItemIcon>
                  <ListItemText
                    primary="Company Profile Setup"
                    secondary="Configure your company details and preferences"
                    sx={{
                      "& .MuiListItemText-primary": { color: "#f1f5f9", fontWeight: 600, fontSize: "0.95rem" },
                      "& .MuiListItemText-secondary": { color: "#94a3b8" },
                    }}
                  />
                </ListItem>
                <ListItem sx={{ px: 0, py: 1 }}>
                  <ListItemIcon sx={{ minWidth: 36 }}>
                    <CheckCircle sx={{ color: "#10b981", fontSize: 22 }} />
                  </ListItemIcon>
                  <ListItemText
                    primary="Add Your First Employee"
                    secondary="Start building your team"
                    sx={{
                      "& .MuiListItemText-primary": { color: "#f1f5f9", fontWeight: 600, fontSize: "0.95rem" },
                      "& .MuiListItemText-secondary": { color: "#94a3b8" },
                    }}
                  />
                </ListItem>
                <ListItem sx={{ px: 0, py: 1 }}>
                  <ListItemIcon sx={{ minWidth: 36 }}>
                    <CheckCircle sx={{ color: "#10b981", fontSize: 22 }} />
                  </ListItemIcon>
                  <ListItemText
                    primary="Configure Payroll Settings"
                    secondary="Set up salary structures and deductions"
                    sx={{
                      "& .MuiListItemText-primary": { color: "#f1f5f9", fontWeight: 600, fontSize: "0.95rem" },
                      "& .MuiListItemText-secondary": { color: "#94a3b8" },
                    }}
                  />
                </ListItem>
              </List>
            </CardContent>
          </Card>
        </Box>
      ),
    },
    {
      label: "Company Profile",
      description: "Review and update your company information",
      icon: <Business />,
      content: (
        <Box>
          <Card sx={cardStyle}>
            <CardContent sx={{ p: { xs: 2.5, sm: 3.5 } }}>
              <Typography variant="h6" sx={{ color: "#f1f5f9", fontWeight: 700, mb: 2 }}>
                Company Information
              </Typography>
              <Box display="flex" flexWrap="wrap" gap={1.5} mb={3}>
                <Chip
                  label="Company Name"
                  variant="outlined"
                  sx={{
                    backgroundColor: "rgba(16, 185, 129, 0.1)",
                    borderColor: "rgba(16, 185, 129, 0.3)",
                    color: "#34d399",
                    fontWeight: 600,
                    borderRadius: "8px",
                    backdropFilter: "blur(8px)",
                  }}
                />
                <Chip
                  label="Domain"
                  variant="outlined"
                  sx={{
                    backgroundColor: "rgba(99, 102, 241, 0.1)",
                    borderColor: "rgba(99, 102, 241, 0.3)",
                    color: "#a5b4fc",
                    fontWeight: 600,
                    borderRadius: "8px",
                    backdropFilter: "blur(8px)",
                  }}
                />
                <Chip
                  label="Industry"
                  variant="outlined"
                  sx={{
                    backgroundColor: "rgba(245, 158, 11, 0.1)",
                    borderColor: "rgba(245, 158, 11, 0.3)",
                    color: "#fbbf24",
                    fontWeight: 600,
                    borderRadius: "8px",
                    backdropFilter: "blur(8px)",
                  }}
                />
                <Chip
                  label="Status: Active"
                  sx={{
                    backgroundColor: "#10b981",
                    color: "#ffffff",
                    fontWeight: 600,
                    borderRadius: "8px",
                    boxShadow: "0 2px 8px rgba(16, 185, 129, 0.4)",
                  }}
                />
              </Box>
              <Alert
                severity="info"
                sx={{
                  mb: 2.5,
                  borderRadius: 2.5,
                  border: "1px solid rgba(59, 130, 246, 0.3)",
                  backgroundColor: "rgba(59, 130, 246, 0.08)",
                  backdropFilter: "blur(10px)",
                  color: "#f1f5f9",
                  "& .MuiAlert-icon": { color: "#3b82f6" },
                }}
              >
                💡 You can update your company profile anytime from the Settings page
              </Alert>
              <Typography variant="body2" sx={{ color: "#94a3b8", mb: 1.5 }}>
                Your company profile is now active. You can customize it further by:
              </Typography>
              <List disablePadding>
                <ListItem sx={{ px: 0, py: 0.75 }}>
                  <ListItemIcon sx={{ minWidth: 32 }}>
                    <CheckCircle sx={{ color: "#10b981", fontSize: 20 }} />
                  </ListItemIcon>
                  <ListItemText
                    primary="Upload a company logo"
                    sx={{
                      "& .MuiListItemText-primary": {
                        color: "#f1f5f9",
                        fontSize: "0.9rem",
                        fontWeight: 500,
                      },
                    }}
                  />
                </ListItem>
                <ListItem sx={{ px: 0, py: 0.75 }}>
                  <ListItemIcon sx={{ minWidth: 32 }}>
                    <CheckCircle sx={{ color: "#10b981", fontSize: 20 }} />
                  </ListItemIcon>
                  <ListItemText
                    primary="Add company address and contact details"
                    sx={{
                      "& .MuiListItemText-primary": {
                        color: "#f1f5f9",
                        fontSize: "0.9rem",
                        fontWeight: 500,
                      },
                    }}
                  />
                </ListItem>
                <ListItem sx={{ px: 0, py: 0.75 }}>
                  <ListItemIcon sx={{ minWidth: 32 }}>
                    <CheckCircle sx={{ color: "#10b981", fontSize: 20 }} />
                  </ListItemIcon>
                  <ListItemText
                    primary="Configure company policies and settings"
                    sx={{
                      "& .MuiListItemText-primary": {
                        color: "#f1f5f9",
                        fontSize: "0.9rem",
                        fontWeight: 500,
                      },
                    }}
                  />
                </ListItem>
              </List>
            </CardContent>
          </Card>
        </Box>
      ),
    },
    {
      label: "Add Your First Employee",
      description: "Start building your team",
      icon: <People />,
      content: (
        <Box>
          <Card sx={cardStyle}>
            <CardContent sx={{ p: { xs: 2.5, sm: 3.5 } }}>
              <Typography variant="h6" sx={{ color: "#f1f5f9", fontWeight: 700, mb: 2 }}>
                Ready to Add Employees
              </Typography>
              <Alert
                severity="success"
                sx={{
                  mb: 2.5,
                  borderRadius: 2.5,
                  border: "1px solid rgba(16, 185, 129, 0.3)",
                  backgroundColor: "rgba(16, 185, 129, 0.08)",
                  backdropFilter: "blur(10px)",
                  color: "#f1f5f9",
                  "& .MuiAlert-icon": { color: "#10b981" },
                }}
              >
                ✅ Your employee management system is ready!
              </Alert>
              <Typography variant="body2" sx={{ color: "#94a3b8", mb: 2 }}>
                You can now start adding employees to your team. Here's what you can do:
              </Typography>
              <List disablePadding>
                <ListItem sx={{ px: 0, py: 1 }}>
                  <ListItemIcon sx={{ minWidth: 36 }}>
                    <CheckCircle sx={{ color: "#10b981", fontSize: 22 }} />
                  </ListItemIcon>
                  <ListItemText
                    primary="Add individual employees"
                    secondary="Fill out employee details and create accounts"
                    sx={{
                      "& .MuiListItemText-primary": { color: "#f1f5f9", fontWeight: 600, fontSize: "0.95rem" },
                      "& .MuiListItemText-secondary": { color: "#94a3b8" },
                    }}
                  />
                </ListItem>
                <ListItem sx={{ px: 0, py: 1 }}>
                  <ListItemIcon sx={{ minWidth: 36 }}>
                    <CheckCircle sx={{ color: "#10b981", fontSize: 22 }} />
                  </ListItemIcon>
                  <ListItemText
                    primary="Bulk import employees"
                    secondary="Upload CSV file with employee data"
                    sx={{
                      "& .MuiListItemText-primary": { color: "#f1f5f9", fontWeight: 600, fontSize: "0.95rem" },
                      "& .MuiListItemText-secondary": { color: "#94a3b8" },
                    }}
                  />
                </ListItem>
                <ListItem sx={{ px: 0, py: 1 }}>
                  <ListItemIcon sx={{ minWidth: 36 }}>
                    <CheckCircle sx={{ color: "#10b981", fontSize: 22 }} />
                  </ListItemIcon>
                  <ListItemText
                    primary="Set up employee roles"
                    secondary="Assign managers and regular employees"
                    sx={{
                      "& .MuiListItemText-primary": { color: "#f1f5f9", fontWeight: 600, fontSize: "0.95rem" },
                      "& .MuiListItemText-secondary": { color: "#94a3b8" },
                    }}
                  />
                </ListItem>
              </List>
              <Box
                sx={{
                  mt: 3,
                  p: 2.5,
                  backgroundColor: "rgba(16, 185, 129, 0.05)",
                  border: "1px solid rgba(16, 185, 129, 0.2)",
                  borderRadius: "12px",
                  backdropFilter: "blur(10px)",
                }}
              >
                <Typography
                  variant="body2"
                  sx={{ color: "#10b981", fontWeight: 600, mb: 0.5 }}
                >
                  💡 Pro Tip:
                </Typography>
                <Typography variant="body2" sx={{ color: "#94a3b8" }}>
                  Start with a few test employees to familiarize yourself with the system before adding your entire team.
                </Typography>
              </Box>
            </CardContent>
          </Card>
        </Box>
      ),
    },
    {
      label: "Configure Payroll",
      description: "Set up salary structures and payroll settings",
      icon: <Settings />,
      content: (
        <Box>
          <Card sx={cardStyle}>
            <CardContent sx={{ p: { xs: 2.5, sm: 3.5 } }}>
              <Typography variant="h6" sx={{ color: "#f1f5f9", fontWeight: 700, mb: 2 }}>
                Payroll Configuration
              </Typography>
              <Alert
                severity="info"
                sx={{
                  mb: 2.5,
                  borderRadius: 2.5,
                  border: "1px solid rgba(59, 130, 246, 0.3)",
                  backgroundColor: "rgba(59, 130, 246, 0.08)",
                  backdropFilter: "blur(10px)",
                  color: "#f1f5f9",
                  "& .MuiAlert-icon": { color: "#3b82f6" },
                }}
              >
                ⚙️ Configure your payroll settings to get started
              </Alert>
              <Typography variant="body2" sx={{ color: "#94a3b8", mb: 2 }}>
                Set up your payroll system with these essential configurations:
              </Typography>
              <List disablePadding>
                <ListItem sx={{ px: 0, py: 1 }}>
                  <ListItemIcon sx={{ minWidth: 36 }}>
                    <CheckCircle sx={{ color: "#10b981", fontSize: 22 }} />
                  </ListItemIcon>
                  <ListItemText
                    primary="Salary Structures"
                    secondary="Define basic salary, HRA, TA, DA, and other components"
                    sx={{
                      "& .MuiListItemText-primary": { color: "#f1f5f9", fontWeight: 600, fontSize: "0.95rem" },
                      "& .MuiListItemText-secondary": { color: "#94a3b8" },
                    }}
                  />
                </ListItem>
                <ListItem sx={{ px: 0, py: 1 }}>
                  <ListItemIcon sx={{ minWidth: 36 }}>
                    <CheckCircle sx={{ color: "#10b981", fontSize: 22 }} />
                  </ListItemIcon>
                  <ListItemText
                    primary="Tax Settings"
                    secondary="Configure tax regimes and deduction rules"
                    sx={{
                      "& .MuiListItemText-primary": { color: "#f1f5f9", fontWeight: 600, fontSize: "0.95rem" },
                      "& .MuiListItemText-secondary": { color: "#94a3b8" },
                    }}
                  />
                </ListItem>
                <ListItem sx={{ px: 0, py: 1 }}>
                  <ListItemIcon sx={{ minWidth: 36 }}>
                    <CheckCircle sx={{ color: "#10b981", fontSize: 22 }} />
                  </ListItemIcon>
                  <ListItemText
                    primary="Bonus & Deductions"
                    secondary="Set up performance bonuses and custom deductions"
                    sx={{
                      "& .MuiListItemText-primary": { color: "#f1f5f9", fontWeight: 600, fontSize: "0.95rem" },
                      "& .MuiListItemText-secondary": { color: "#94a3b8" },
                    }}
                  />
                </ListItem>
                <ListItem sx={{ px: 0, py: 1 }}>
                  <ListItemIcon sx={{ minWidth: 36 }}>
                    <CheckCircle sx={{ color: "#10b981", fontSize: 22 }} />
                  </ListItemIcon>
                  <ListItemText
                    primary="Payroll Schedule"
                    secondary="Configure monthly payroll processing dates"
                    sx={{
                      "& .MuiListItemText-primary": { color: "#f1f5f9", fontWeight: 600, fontSize: "0.95rem" },
                      "& .MuiListItemText-secondary": { color: "#94a3b8" },
                    }}
                  />
                </ListItem>
              </List>
              <Box
                sx={{
                  mt: 3,
                  p: 2.5,
                  backgroundColor: "rgba(245, 158, 11, 0.05)",
                  border: "1px solid rgba(245, 158, 11, 0.2)",
                  borderRadius: "12px",
                  backdropFilter: "blur(10px)",
                }}
              >
                <Typography
                  variant="body2"
                  sx={{ color: "#f59e0b", fontWeight: 600, mb: 0.5 }}
                >
                  ⚠️ Important:
                </Typography>
                <Typography variant="body2" sx={{ color: "#94a3b8" }}>
                  Make sure to configure payroll settings before processing your first payroll to avoid errors.
                </Typography>
              </Box>
            </CardContent>
          </Card>
        </Box>
      ),
    },
    {
      label: "You're All Set!",
      description: "Start using your employee management system",
      icon: <Dashboard />,
      content: (
        <Box>
          <Card sx={cardStyle}>
            <CardContent sx={{ p: { xs: 2.5, sm: 3.5 } }}>
              <Box textAlign="center" mb={3}>
                <Avatar
                  sx={{
                    background: "linear-gradient(135deg, #10b981 0%, #059669 100%)",
                    width: 76,
                    height: 76,
                    mx: "auto",
                    mb: 2,
                    borderRadius: "20px",
                    boxShadow: "0 8px 24px rgba(16, 185, 129, 0.4)",
                  }}
                >
                  <Celebration sx={{ fontSize: 40, color: "#ffffff" }} />
                </Avatar>
                <Typography
                  variant="h5"
                  sx={{
                    color: "#f1f5f9",
                    fontWeight: 700,
                    mb: 1,
                    fontSize: { xs: "1.35rem", sm: "1.5rem" },
                  }}
                >
                  🎉 Congratulations!
                </Typography>
                <Typography variant="body1" sx={{ color: "#94a3b8" }}>
                  Your employee management system is ready to use
                </Typography>
              </Box>

              <Alert
                severity="success"
                sx={{
                  mb: 3,
                  borderRadius: 2.5,
                  border: "1px solid rgba(16, 185, 129, 0.3)",
                  backgroundColor: "rgba(16, 185, 129, 0.08)",
                  backdropFilter: "blur(10px)",
                  color: "#f1f5f9",
                  "& .MuiAlert-icon": { color: "#10b981" },
                }}
              >
                ✅ All setup steps completed successfully!
              </Alert>

              <Typography variant="h6" sx={{ color: "#f1f5f9", fontWeight: 700, mb: 2 }}>
                What's Next?
              </Typography>

              <List disablePadding>
                <ListItem sx={{ px: 0, py: 1 }}>
                  <ListItemIcon sx={{ minWidth: 36 }}>
                    <CheckCircle sx={{ color: "#10b981", fontSize: 22 }} />
                  </ListItemIcon>
                  <ListItemText
                    primary="Explore your dashboard"
                    secondary="Get familiar with the main features and navigation"
                    sx={{
                      "& .MuiListItemText-primary": { color: "#f1f5f9", fontWeight: 600, fontSize: "0.95rem" },
                      "& .MuiListItemText-secondary": { color: "#94a3b8" },
                    }}
                  />
                </ListItem>
                <ListItem sx={{ px: 0, py: 1 }}>
                  <ListItemIcon sx={{ minWidth: 36 }}>
                    <CheckCircle sx={{ color: "#10b981", fontSize: 22 }} />
                  </ListItemIcon>
                  <ListItemText
                    primary="Add your first employee"
                    secondary="Start building your team by adding employees"
                    sx={{
                      "& .MuiListItemText-primary": { color: "#f1f5f9", fontWeight: 600, fontSize: "0.95rem" },
                      "& .MuiListItemText-secondary": { color: "#94a3b8" },
                    }}
                  />
                </ListItem>
                <ListItem sx={{ px: 0, py: 1 }}>
                  <ListItemIcon sx={{ minWidth: 36 }}>
                    <CheckCircle sx={{ color: "#10b981", fontSize: 22 }} />
                  </ListItemIcon>
                  <ListItemText
                    primary="Configure payroll settings"
                    secondary="Set up salary structures and tax configurations"
                    sx={{
                      "& .MuiListItemText-primary": { color: "#f1f5f9", fontWeight: 600, fontSize: "0.95rem" },
                      "& .MuiListItemText-secondary": { color: "#94a3b8" },
                    }}
                  />
                </ListItem>
                <ListItem sx={{ px: 0, py: 1 }}>
                  <ListItemIcon sx={{ minWidth: 36 }}>
                    <CheckCircle sx={{ color: "#10b981", fontSize: 22 }} />
                  </ListItemIcon>
                  <ListItemText
                    primary="Set up attendance tracking"
                    secondary="Configure attendance policies and monitoring"
                    sx={{
                      "& .MuiListItemText-primary": { color: "#f1f5f9", fontWeight: 600, fontSize: "0.95rem" },
                      "& .MuiListItemText-secondary": { color: "#94a3b8" },
                    }}
                  />
                </ListItem>
              </List>

              <Box
                sx={{
                  mt: 3,
                  p: 2.5,
                  backgroundColor: "rgba(99, 102, 241, 0.05)",
                  border: "1px solid rgba(99, 102, 241, 0.2)",
                  borderRadius: "12px",
                  backdropFilter: "blur(10px)",
                }}
              >
                <Typography
                  variant="body2"
                  sx={{ color: "#818cf8", fontWeight: 600, mb: 0.5 }}
                >
                  📞 Need Help?
                </Typography>
                <Typography variant="body2" sx={{ color: "#94a3b8" }}>
                  Our support team is here to help you get the most out of your employee management system. You can access help documentation and contact support from the Settings page.
                </Typography>
              </Box>
            </CardContent>
          </Card>
        </Box>
      ),
    },
  ];

  return (
    <Box sx={{ maxWidth: 860, mx: "auto", p: { xs: 2, sm: 3 } }}>
      <Paper
        elevation={0}
        sx={{
          backgroundColor: "rgba(255, 255, 255, 0.03)",
          backdropFilter: "blur(24px)",
          WebkitBackdropFilter: "blur(24px)",
          border: "1px solid rgba(255, 255, 255, 0.08)",
          borderRadius: 4,
          boxShadow: "0 20px 50px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.1)",
          p: { xs: 3, sm: 4.5 },
        }}
      >
        <Typography
          variant="h4"
          sx={{
            fontWeight: 700,
            fontSize: { xs: "1.5rem", sm: "1.875rem" },
            letterSpacing: "-0.02em",
            background: "linear-gradient(135deg, #f1f5f9 0%, #cbd5e1 100%)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            mb: 4,
            textAlign: "center",
          }}
        >
          Welcome to Your Employee Management System
        </Typography>

        <Stepper
          activeStep={activeStep}
          orientation="vertical"
          sx={{
            "& .MuiStepConnector-line": {
              borderColor: "rgba(255, 255, 255, 0.08)",
              borderLeftWidth: "2px",
              minHeight: 28,
            },
            "& .MuiStepContent-root": {
              borderLeft: "2px solid rgba(255, 255, 255, 0.08)",
              ml: "19px",
              pl: 3,
            },
          }}
        >
          {steps.map((step, index) => (
            <Step key={step.label}>
              <StepLabel
                StepIconComponent={() => {
                  const isCompleted = completed[index];
                  const isActive = activeStep === index;
                  return (
                    <Box
                      sx={{
                        width: 40,
                        height: 40,
                        borderRadius: "50%",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        transition: "all 0.3s ease",
                        ...(isCompleted
                          ? {
                              background: "linear-gradient(135deg, #10b981 0%, #059669 100%)",
                              color: "#ffffff",
                              boxShadow: "0 0 16px rgba(16, 185, 129, 0.4), inset 1px 1px 2px rgba(255, 255, 255, 0.2)",
                              border: "1px solid rgba(16, 185, 129, 0.5)",
                            }
                          : isActive
                            ? {
                                background: "linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)",
                                color: "#ffffff",
                                boxShadow: "0 0 20px rgba(99, 102, 241, 0.6), inset 1px 1px 2px rgba(255, 255, 255, 0.3)",
                                border: "2px solid rgba(165, 180, 252, 0.8)",
                                transform: "scale(1.06)",
                              }
                            : {
                                background: "rgba(255, 255, 255, 0.04)",
                                color: "#64748b",
                                border: "1px solid rgba(255, 255, 255, 0.1)",
                              }),
                      }}
                    >
                      {isCompleted ? (
                        <CheckCircle sx={{ fontSize: 22 }} />
                      ) : (
                        React.cloneElement(step.icon as React.ReactElement<any>, { sx: { fontSize: 20 } })
                      )}
                    </Box>
                  );
                }}
              >
                <Typography
                  variant="h6"
                  sx={{
                    color: activeStep === index ? "#f1f5f9" : completed[index] ? "#cbd5e1" : "#94a3b8",
                    fontWeight: activeStep === index ? 700 : 600,
                    fontSize: "1.05rem",
                  }}
                >
                  {step.label}
                </Typography>
                <Typography variant="body2" sx={{ color: "#94a3b8" }}>
                  {step.description}
                </Typography>
              </StepLabel>
              <StepContent>
                <Box sx={{ mb: 2 }}>
                  {step.content}
                  <Box sx={{ display: "flex", gap: 1.5, mt: 2.5 }}>
                    <Button
                      variant="contained"
                      onClick={handleNext}
                      disabled={loading}
                      sx={{
                        borderRadius: "12px",
                        py: 1.2,
                        px: 3,
                        fontSize: "0.95rem",
                        fontWeight: 600,
                        textTransform: "none",
                        letterSpacing: "0.2px",
                        background: "linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)",
                        boxShadow: "6px 6px 14px rgba(0, 0, 0, 0.35), inset 2px 2px 4px rgba(255, 255, 255, 0.15)",
                        "&:hover": {
                          background: "linear-gradient(135deg, #4f46e5 0%, #4338ca 100%)",
                          boxShadow: "4px 4px 8px rgba(0, 0, 0, 0.4), inset 2px 2px 4px rgba(255, 255, 255, 0.2)",
                          transform: "translateY(-1px)",
                        },
                        "&:active": {
                          boxShadow: "2px 2px 4px rgba(0, 0, 0, 0.3), inset 3px 3px 6px rgba(0, 0, 0, 0.2)",
                          transform: "translateY(0)",
                        },
                        "&:disabled": {
                          background: "rgba(255, 255, 255, 0.08)",
                          color: "#64748b",
                          boxShadow: "none",
                        },
                        transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
                      }}
                      endIcon={
                        index === steps.length - 1 ? undefined : (
                          <ArrowForward />
                        )
                      }
                    >
                      {index === steps.length - 1 ? (
                        loading ? (
                          <CircularProgress size={20} color="inherit" />
                        ) : (
                          "Get Started"
                        )
                      ) : (
                        "Continue"
                      )}
                    </Button>
                    {index !== steps.length - 1 && (
                      <Button
                        variant="outlined"
                        onClick={handleSkip}
                        sx={{
                          borderRadius: "12px",
                          py: 1.2,
                          px: 2.5,
                          fontSize: "0.95rem",
                          fontWeight: 500,
                          textTransform: "none",
                          borderColor: "rgba(255, 255, 255, 0.12)",
                          color: "#94a3b8",
                          backgroundColor: "rgba(255, 255, 255, 0.02)",
                          backdropFilter: "blur(10px)",
                          "&:hover": {
                            borderColor: "rgba(255, 255, 255, 0.25)",
                            backgroundColor: "rgba(255, 255, 255, 0.06)",
                            color: "#f1f5f9",
                            transform: "translateY(-1px)",
                          },
                          transition: "all 0.2s ease",
                        }}
                      >
                        Skip
                      </Button>
                    )}
                    {index !== 0 && (
                      <Button
                        variant="outlined"
                        onClick={handleBack}
                        startIcon={<ArrowBack />}
                        sx={{
                          borderRadius: "12px",
                          py: 1.2,
                          px: 2.5,
                          fontSize: "0.95rem",
                          fontWeight: 500,
                          textTransform: "none",
                          borderColor: "rgba(255, 255, 255, 0.12)",
                          color: "#94a3b8",
                          backgroundColor: "rgba(255, 255, 255, 0.02)",
                          backdropFilter: "blur(10px)",
                          "&:hover": {
                            borderColor: "rgba(255, 255, 255, 0.25)",
                            backgroundColor: "rgba(255, 255, 255, 0.06)",
                            color: "#f1f5f9",
                            transform: "translateY(-1px)",
                          },
                          transition: "all 0.2s ease",
                        }}
                      >
                        Back
                      </Button>
                    )}
                  </Box>
                </Box>
              </StepContent>
            </Step>
          ))}
        </Stepper>
      </Paper>
    </Box>
  );
}
