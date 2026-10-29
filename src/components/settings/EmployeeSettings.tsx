"use client";

import React, { useState, useEffect } from "react";
import {
  Box,
  Card,
  CardContent,
  Typography,
  TextField,
  Button,
  Grid,
  Alert,
  CircularProgress,
  Avatar,
} from "@mui/material";
import {
  Person,
  Email,
  Phone,
  LocationOn,
  Save,
  Edit,
} from "@mui/icons-material";
import { useForm, Controller } from "react-hook-form";
import { yupResolver } from "@hookform/resolvers/yup";
import * as yup from "yup";
import {
  doc,
  getDoc,
  updateDoc,
  collection,
  query,
  where,
  getDocs,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import { Employee } from "@/types";

const schema = yup
  .object({
    fullName: yup.string().required("Full name is required"),
    email: yup.string().email("Invalid email").required("Email is required"),
    mobile: yup.string().required("Mobile number is required"),
    address: yup.string().required("Address is required"),
  })
  .required();

interface FormData {
  fullName: string;
  email: string;
  mobile: string;
  address: string;
}

export default function EmployeeSettings() {
  const { currentUser } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const [employeeData, setEmployeeData] = useState<Employee | null>(null);
  const [employeeDocId, setEmployeeDocId] = useState("");

  const {
    control,
    handleSubmit,
    reset,
    formState: { errors, isDirty },
  } = useForm<FormData>({
    resolver: yupResolver(schema),
    defaultValues: {
      fullName: "",
      email: "",
      mobile: "",
      address: "",
    },
  });

  useEffect(() => {
    const fetchEmployeeData = async () => {
      if (!currentUser?.employeeId) {
        setError("Employee ID not found. Please contact administrator.");
        setLoading(false);
        return;
      }

      try {
        setLoading(true);

        const employeeDoc = await getDoc(
          doc(db, "employees", currentUser.employeeId),
        );

        if (employeeDoc.exists()) {
          const data = employeeDoc.data() as Employee;
          setEmployeeDocId(employeeDoc.id);
          setEmployeeData(data);

          // Set form values
          const formData = {
            fullName: data.fullName || "",
            email: data.email || "",
            mobile: String(data.mobile || ""),
            address: data.address || "",
          };
          reset(formData);
        } else {
          // Try to find employee by email as fallback
          const employeesQuery = query(
            collection(db, "employees"),
            where("email", "==", currentUser.email),
          );
          const employeesSnapshot = await getDocs(employeesQuery);

          if (!employeesSnapshot.empty) {
            const employeeDocSnapshot = employeesSnapshot.docs[0];
            const employeeData = employeeDocSnapshot.data() as Employee;
            setEmployeeDocId(employeeDocSnapshot.id);
            setEmployeeData(employeeData);

            const formData = {
              fullName: employeeData.fullName || "",
              email: employeeData.email || "",
              mobile: String(employeeData.mobile || ""),
              address: employeeData.address || "",
            };
            reset(formData);
          } else {
            setError("Employee data not found. Please contact administrator.");
          }
        }
      } catch (error) {
        console.error("Error fetching employee data:", error);
        setError("Failed to load employee data");
      } finally {
        setLoading(false);
      }
    };

    fetchEmployeeData();
  }, [currentUser?.employeeId, reset]);

  const onSubmit = async (data: FormData) => {
    if (!employeeDocId) return;

    try {
      setSaving(true);
      setError("");
      setSuccess("");

      // Prepare update data
      const updateData: any = {
        fullName: data.fullName,
        mobile: data.mobile,
        address: data.address,
        updatedAt: new Date(),
      };

      // Update employee document
      await updateDoc(doc(db, "employees", employeeDocId), updateData);

      // Update local state
      setEmployeeData((prev) =>
        prev
          ? {
              ...prev,
              ...updateData,
            }
          : null,
      );

      setSuccess("Profile updated successfully!");
      setIsEditing(false);
      reset(data); // Reset form with new values
    } catch (error) {
      console.error("Error updating profile:", error);
      setError("Failed to update profile. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    if (employeeData) {
      reset({
        fullName: employeeData.fullName || "",
        email: employeeData.email || "",
        mobile: String(employeeData.mobile || ""),
        address: employeeData.address || "",
      });
    }
    setIsEditing(false);
    setError("");
    setSuccess("");
  };

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

  const formFieldSx = {
    "& .MuiOutlinedInput-root": {
      backgroundColor: "rgba(255, 255, 255, 0.03)",
      backdropFilter: "blur(10px)",
      borderRadius: "12px",
      "& fieldset": {
        borderColor: "rgba(255, 255, 255, 0.1)",
      },
      "&:hover fieldset": {
        borderColor: isEditing ? "rgba(99, 102, 241, 0.4)" : "rgba(255, 255, 255, 0.1)",
      },
      "&.Mui-focused fieldset": {
        borderColor: "#6366f1",
        boxShadow: "0 0 0 3px rgba(99, 102, 241, 0.1)",
      },
      "&.Mui-disabled fieldset": {
        borderColor: "rgba(255, 255, 255, 0.05)",
      },
    },
    "& .MuiInputLabel-root": {
      color: "#94a3b8",
    },
    "& .MuiInputBase-input": {
      color: "#f1f5f9",
    },
    "& .MuiInputBase-input.Mui-disabled": {
      WebkitTextFillColor: "#64748b",
    },
  };

  return (
    <Box sx={{ p: { xs: 2, sm: 3 } }}>
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
          Profile Settings
        </Typography>
        <Typography variant="body2" sx={{ color: "#94a3b8" }}>
          Update your personal information and contact details
        </Typography>
      </Box>

      {error && (
        <Alert
          severity="error"
          sx={{
            mb: 3,
            backgroundColor: "rgba(239, 68, 68, 0.1)",
            border: "1px solid rgba(239, 68, 68, 0.25)",
            color: "#fca5a5",
            borderRadius: "14px",
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
            mb: 3,
            backgroundColor: "rgba(16, 185, 129, 0.1)",
            border: "1px solid rgba(16, 185, 129, 0.25)",
            color: "#6ee7b7",
            borderRadius: "14px",
          }}
          onClose={() => setSuccess("")}
        >
          {success}
        </Alert>
      )}

      <Grid container spacing={3}>
        {/* Profile Overview */}
        {/* @ts-ignore */}
        <Grid item xs={12} md={4}>
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
            <CardContent sx={{ textAlign: "center", p: 3 }}>
              <Avatar
                sx={{
                  width: 88,
                  height: 88,
                  mx: "auto",
                  mb: 2,
                  background: "linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)",
                  boxShadow:
                    "0 8px 24px rgba(99, 102, 241, 0.45), inset 2px 2px 4px rgba(255, 255, 255, 0.25)",
                  border: "2px solid rgba(255, 255, 255, 0.15)",
                  fontSize: "2.25rem",
                  fontWeight: 700,
                  color: "#ffffff",
                }}
              >
                {employeeData?.fullName?.charAt(0).toUpperCase() || "E"}
              </Avatar>

              <Typography variant="h6" sx={{ color: "#f1f5f9", fontWeight: 600, mb: 1 }}>
                {employeeData?.fullName}
              </Typography>

              <Typography variant="body2" sx={{ color: "#818cf8", mb: 2, fontWeight: 500 }}>
                Employee ID: {employeeData?.employeeId}
              </Typography>

              <Typography variant="body2" sx={{ color: "#94a3b8", mb: 0.5 }}>
                Department: {employeeData?.department || "N/A"}
              </Typography>

              {employeeData?.joiningDate && (
                <Typography variant="body2" sx={{ color: "#94a3b8", mt: 1 }}>
                  Joined:{" "}
                  {new Date(
                    employeeData.joiningDate.seconds * 1000,
                  ).toLocaleDateString()}
                </Typography>
              )}
            </CardContent>
          </Card>
        </Grid>

        {/* Edit Form */}
        {/* @ts-ignore */}
        <Grid item xs={12} md={8}>
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
            <CardContent sx={{ p: 3 }}>
              <Box
                display="flex"
                justifyContent="space-between"
                alignItems="center"
                flexWrap="wrap"
                gap={2}
                mb={3}
              >
                <Typography variant="h6" sx={{ color: "#f1f5f9", fontWeight: 600 }}>
                  Personal Information
                </Typography>

                {!isEditing ? (
                  <Button
                    variant="outlined"
                    startIcon={<Edit />}
                    onClick={() => setIsEditing(true)}
                    sx={{
                      borderRadius: "12px",
                      borderColor: "rgba(99, 102, 241, 0.4)",
                      color: "#a5b4fc",
                      backgroundColor: "rgba(99, 102, 241, 0.08)",
                      px: 2.5,
                      py: 0.8,
                      fontWeight: 500,
                      textTransform: "none",
                      "&:hover": {
                        borderColor: "rgba(99, 102, 241, 0.6)",
                        backgroundColor: "rgba(99, 102, 241, 0.15)",
                        transform: "translateY(-1px)",
                      },
                      transition: "all 0.2s ease",
                    }}
                  >
                    Edit Profile
                  </Button>
                ) : (
                  <Box display="flex" gap={1.5} alignItems="center">
                    <Button
                      variant="outlined"
                      onClick={handleCancel}
                      disabled={saving}
                      sx={{
                        borderRadius: "12px",
                        borderColor: "rgba(239, 68, 68, 0.3)",
                        color: "#f87171",
                        backgroundColor: "rgba(239, 68, 68, 0.06)",
                        px: 2,
                        py: 0.8,
                        textTransform: "none",
                        fontWeight: 500,
                        "&:hover": {
                          borderColor: "rgba(239, 68, 68, 0.5)",
                          backgroundColor: "rgba(239, 68, 68, 0.12)",
                        },
                      }}
                    >
                      Cancel
                    </Button>
                    <Button
                      variant="contained"
                      onClick={handleSubmit(onSubmit)}
                      disabled={saving || !isDirty}
                      startIcon={
                        saving ? <CircularProgress size={16} sx={{ color: "#ffffff" }} /> : <Save />
                      }
                      sx={{
                        borderRadius: "12px",
                        px: 2.5,
                        py: 0.8,
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
                        "&.Mui-disabled": {
                          background: "rgba(255, 255, 255, 0.05)",
                          color: "#64748b",
                          boxShadow: "none",
                        },
                        transition: "all 0.2s ease",
                      }}
                    >
                      {saving ? "Saving..." : "Save Changes"}
                    </Button>
                  </Box>
                )}
              </Box>

              <form onSubmit={handleSubmit(onSubmit)}>
                <Grid container spacing={2.5}>
                  {/* @ts-ignore */}
                  <Grid item xs={12} sm={6}>
                    <Controller
                      name="fullName"
                      control={control}
                      render={({ field }) => (
                        <TextField
                          {...field}
                          label="Full Name"
                          fullWidth
                          disabled={!isEditing}
                          error={!!errors.fullName}
                          helperText={errors.fullName?.message}
                          InputProps={{
                            startAdornment: (
                              <Person sx={{ color: isEditing ? "#818cf8" : "#64748b", mr: 1 }} />
                            ),
                          }}
                          sx={formFieldSx}
                        />
                      )}
                    />
                  </Grid>
                  {/* @ts-ignore */}
                  <Grid item xs={12} sm={6}>
                    <Controller
                      name="email"
                      control={control}
                      render={({ field }) => (
                        <TextField
                          {...field}
                          label="Email"
                          type="email"
                          fullWidth
                          disabled
                          InputProps={{
                            startAdornment: (
                              <Email sx={{ color: "#64748b", mr: 1 }} />
                            ),
                          }}
                          sx={formFieldSx}
                        />
                      )}
                    />
                  </Grid>
                  {/* @ts-ignore */}
                  <Grid item xs={12} sm={6}>
                    <Controller
                      name="mobile"
                      control={control}
                      render={({ field }) => (
                        <TextField
                          {...field}
                          label="Mobile Number"
                          fullWidth
                          disabled={!isEditing}
                          error={!!errors.mobile}
                          helperText={errors.mobile?.message}
                          InputProps={{
                            startAdornment: (
                              <Phone sx={{ color: isEditing ? "#818cf8" : "#64748b", mr: 1 }} />
                            ),
                          }}
                          sx={formFieldSx}
                        />
                      )}
                    />
                  </Grid>
                  {/* @ts-ignore */}
                  <Grid item xs={12}>
                    <Controller
                      name="address"
                      control={control}
                      render={({ field }) => (
                        <TextField
                          {...field}
                          label="Address"
                          fullWidth
                          multiline
                          rows={3}
                          disabled={!isEditing}
                          error={!!errors.address}
                          helperText={errors.address?.message}
                          InputProps={{
                            startAdornment: (
                              <LocationOn
                                sx={{ color: isEditing ? "#818cf8" : "#64748b", mr: 1, mt: 1 }}
                              />
                            ),
                          }}
                          sx={formFieldSx}
                        />
                      )}
                    />
                  </Grid>
                </Grid>
              </form>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
}
