"use client";

import React, { useEffect, useState } from "react";
import {
  Box,
  Card,
  CardContent,
  Typography,
  Avatar,
  Chip,
  Divider,
  CircularProgress,
  Alert,
} from "@mui/material";
import {
  Person,
  Email,
  Phone,
  Work,
  AttachMoney,
  Schedule,
} from "@mui/icons-material";
import {
  collection,
  getDocs,
  query,
  where,
  doc,
  getDoc,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import { Employee } from "@/types";

export default function EmployeeProfile() {
  const { currentUser } = useAuth();
  const [employeeData, setEmployeeData] = useState<Employee | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [managerNames, setManagerNames] = useState<string[]>([]);
  const [companyName, setCompanyName] = useState<string>("");

  const normalizeManagerIds = (
    value: unknown,
    singleValue?: unknown,
  ): string[] => {
    if (Array.isArray(value)) {
      return value.filter(
        (id): id is string => typeof id === "string" && !!id.trim(),
      );
    }
    if (typeof value === "string" && value.trim()) {
      return [value.trim()];
    }
    if (typeof singleValue === "string" && singleValue.trim()) {
      return [singleValue.trim()];
    }
    return [];
  };

  useEffect(() => {
    const fetchEmployeeData = async () => {
      if (!currentUser?.employeeId) return;

      try {
        setLoading(true);

        // Fetch employee data
        const employeeQuery = query(
          collection(db, "employees"),
          where("employeeId", "==", currentUser.employeeId),
        );
        const employeeSnapshot = await getDocs(employeeQuery);

        if (!employeeSnapshot.empty) {
          const empData = {
            id: employeeSnapshot.docs[0].id,
            ...employeeSnapshot.docs[0].data(),
          } as Employee;
          setEmployeeData(empData);

          // Fetch manager names if assigned managers exist
          const assignedManagerIds = normalizeManagerIds(
            empData.assignedManagers,
            (empData as unknown as { assignedManager?: unknown })
              .assignedManager,
          );

          if (assignedManagerIds.length > 0) {
            const managerPromises = assignedManagerIds.map(
              async (managerId: string) => {
                try {
                  const managerDoc = await getDoc(
                    doc(db, "managers", managerId),
                  );
                  if (managerDoc.exists()) {
                    const managerData = managerDoc.data();
                    return (
                      managerData.fullName ||
                      managerData.name ||
                      "Unknown Manager"
                    );
                  }
                  return "Manager Not Found";
                } catch (error) {
                  return "Error Loading Manager";
                }
              },
            );

            const resolvedManagerNames = await Promise.all(managerPromises);
            setManagerNames(resolvedManagerNames);
          } else {
            setManagerNames([]);
          }

          // Fetch company name if company ID exists
          if (empData.companyId) {
            try {
              const companyDoc = await getDoc(
                doc(db, "companies", empData.companyId),
              );
              if (companyDoc.exists()) {
                const companyData = companyDoc.data();
                const resolvedCompanyName =
                  companyData.companyName ||
                  companyData.name ||
                  companyData.adminName ||
                  "Unknown Company";
                setCompanyName(resolvedCompanyName);
              } else {
                setCompanyName("Company Not Found");
              }
            } catch (error) {
              setCompanyName("Error Loading Company");
            }
          } else {
            setCompanyName("No Company ID");
          }
        } else {
          setError("Employee data not found");
        }
      } catch (err) {
        console.error("Error fetching employee data:", err);
        setError("Failed to load employee data");
      } finally {
        setLoading(false);
      }
    };

    fetchEmployeeData();
  }, [currentUser]);

  if (loading) {
    return (
      <Box
        display="flex"
        justifyContent="center"
        alignItems="center"
        minHeight="400px"
      >
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return (
      <Alert severity="error" sx={{ mb: 2 }}>
        {error}
      </Alert>
    );
  }

  if (!employeeData) {
    return (
      <Alert severity="warning">
        Employee profile not found. Please contact your administrator.
      </Alert>
    );
  }

  return (
    <Box>
      <Typography variant="h4" gutterBottom sx={{ color: "#ffffff", mb: 3 }}>
        My Profile
      </Typography>

      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: "1fr",
          gap: 3,
        }}
      >
        {/* Profile Header */}
        <Card sx={{ backgroundColor: "#2d2d2d", border: "1px solid #333" }}>
          <CardContent>
            <Box display="flex" alignItems="center" gap={3}>
              <Avatar
                sx={{
                  width: 120,
                  height: 120,
                  backgroundColor: "#2196f3",
                  fontSize: "3rem",
                }}
              >
                {employeeData.fullName?.charAt(0) || "E"}
              </Avatar>
              <Box flex={1}>
                <Typography variant="h4" sx={{ color: "#ffffff", mb: 1 }}>
                  {employeeData.fullName}
                </Typography>
                <Typography variant="h6" sx={{ color: "#b0b0b0", mb: 2 }}>
                  Employee ID: {employeeData.employeeId}
                </Typography>
                <Chip
                  label="Active Employee"
                  color="success"
                  sx={{ backgroundColor: "#4caf50", color: "#ffffff" }}
                />
              </Box>
            </Box>
          </CardContent>
        </Card>

        {/* Employee Info & Personal Details */}
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: {
              xs: "1fr",
              md: "repeat(2, 1fr)",
            },
            gap: 3,
          }}
        >
          {/* Employee Info */}
          <Card
            sx={{
              backgroundColor: "#2d2d2d",
              border: "1px solid #333",
              height: "100%",
            }}
          >
            <CardContent>
              <Typography
                variant="h6"
                sx={{
                  color: "#ffffff",
                  mb: 2,
                  display: "flex",
                  alignItems: "center",
                  gap: 1,
                }}
              >
                <Person />
                Employee Info
              </Typography>
              <Divider sx={{ mb: 2, borderColor: "#444" }} />

              <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
                {[
                  { label: "Father Name", value: (employeeData as any).fatherName },
                  { label: "Designation", value: (employeeData as any).designation },
                  { label: "Department", value: employeeData.department },
                  { label: "HQ Location", value: (employeeData as any).hqLocation },
                  { label: "Date of Birth", value: (employeeData as any).dob },
                  { label: "Date of Joining", value: (employeeData as any).joinDate || (employeeData as any).joiningDate },
                ].map(({ label, value }) =>
                  value ? (
                    <Box key={label} display="flex" justifyContent="space-between" alignItems="flex-start">
                      <Typography variant="body2" sx={{ color: "#b0b0b0", minWidth: 130 }}>
                        {label}:
                      </Typography>
                      <Typography variant="body1" sx={{ color: "#ffffff", textAlign: "right" }}>
                        {(() => {
                          if (typeof value === "object" && value !== null) {
                            if ((value as any).seconds) {
                              return new Date((value as any).seconds * 1000).toLocaleDateString();
                            }
                            if (typeof (value as any).toDate === "function") {
                              return (value as any).toDate().toLocaleDateString();
                            }
                          }
                          return String(value);
                        })()}
                      </Typography>
                    </Box>
                  ) : null
                )}
              </Box>
            </CardContent>
          </Card>

          {/* Basic Details */}
          <Card
            sx={{
              backgroundColor: "#2d2d2d",
              border: "1px solid #333",
              height: "100%",
            }}
          >
            <CardContent>
              <Typography
                variant="h6"
                sx={{
                  color: "#ffffff",
                  mb: 2,
                  display: "flex",
                  alignItems: "center",
                  gap: 1,
                }}
              >
                <Work />
                Basic
              </Typography>
              <Divider sx={{ mb: 2, borderColor: "#444" }} />

              <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
                {[
                  { label: "Employee ID", value: employeeData.employeeId },
                  { label: "Email", value: employeeData.email },
                  { label: "Mobile", value: employeeData.mobile },
                  { label: "EPF No", value: (employeeData as any).epfNo },
                  { label: "UAN No", value: (employeeData as any).uan },
                  { label: "ESIC No", value: (employeeData as any).esicNo },
                  { label: "Status", value: (employeeData as any).status },
                  { label: "Company", value: companyName || employeeData.companyName },
                  { label: "Manager(s)", value: managerNames.length > 0 ? managerNames.join(", ") : undefined },
                ].map(({ label, value }) =>
                  value ? (
                    <Box key={label} display="flex" justifyContent="space-between" alignItems="flex-start">
                      <Typography variant="body2" sx={{ color: "#b0b0b0", minWidth: 110 }}>
                        {label}:
                      </Typography>
                      <Typography variant="body1" sx={{ color: "#ffffff", textAlign: "right" }}>
                        {String(value)}
                      </Typography>
                    </Box>
                  ) : null
                )}
              </Box>
            </CardContent>
          </Card>
        </Box>

        {/* Personal and Salary Information */}
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: {
              xs: "1fr",
              md: "repeat(2, 1fr)",
            },
            gap: 3,
          }}
        >
          {/* Personal Information */}
          <Card
            sx={{
              backgroundColor: "#2d2d2d",
              border: "1px solid #333",
              height: "100%",
            }}
          >
            <CardContent>
              <Typography
                variant="h6"
                sx={{
                  color: "#ffffff",
                  mb: 2,
                  display: "flex",
                  alignItems: "center",
                  gap: 1,
                }}
              >
                <Person />
                Personal Information
              </Typography>
              <Divider sx={{ mb: 2, borderColor: "#444" }} />

              <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
                <Box display="flex" alignItems="center" gap={2}>
                  <Email sx={{ color: "#b0b0b0" }} />
                  <Box>
                    <Typography variant="body2" sx={{ color: "#b0b0b0" }}>
                      Email Address
                    </Typography>
                    <Typography variant="body1" sx={{ color: "#ffffff" }}>
                      {employeeData.email}
                    </Typography>
                  </Box>
                </Box>

                <Box display="flex" alignItems="center" gap={2}>
                  <Phone sx={{ color: "#b0b0b0" }} />
                  <Box>
                    <Typography variant="body2" sx={{ color: "#b0b0b0" }}>
                      Mobile Number
                    </Typography>
                    <Typography variant="body1" sx={{ color: "#ffffff" }}>
                      {employeeData.mobile}
                    </Typography>
                  </Box>
                </Box>

                <Box display="flex" alignItems="center" gap={2}>
                  <Work sx={{ color: "#b0b0b0" }} />
                  <Box>
                    <Typography variant="body2" sx={{ color: "#b0b0b0" }}>
                      Department
                    </Typography>
                    <Typography variant="body1" sx={{ color: "#ffffff" }}>
                      {employeeData.department || "Not specified"}
                    </Typography>
                  </Box>
                </Box>

                <Box display="flex" alignItems="center" gap={2}>
                  <Schedule sx={{ color: "#b0b0b0" }} />
                  <Box>
                    <Typography variant="body2" sx={{ color: "#b0b0b0" }}>
                      Joining Date
                    </Typography>
                    <Typography variant="body1" sx={{ color: "#ffffff" }}>
                      {(() => {
                        // Check both possible field names
                        const joinDate =
                          employeeData.joinDate || employeeData.joiningDate;
                        if (!joinDate) return "Not specified";

                        // Handle Firestore timestamp
                        if (typeof joinDate === "object" && joinDate.seconds) {
                          return new Date(
                            joinDate.seconds * 1000,
                          ).toLocaleDateString();
                        }

                        // Handle other timestamp formats
                        if (
                          typeof joinDate === "object" &&
                          joinDate.toDate &&
                          typeof joinDate.toDate === "function"
                        ) {
                          return joinDate.toDate().toLocaleDateString();
                        }

                        // Handle regular date
                        return new Date(joinDate).toLocaleDateString();
                      })()}
                    </Typography>
                  </Box>
                </Box>
              </Box>
            </CardContent>
          </Card>

          {/* Salary Information */}
          <Card
            sx={{
              backgroundColor: "#2d2d2d",
              border: "1px solid #333",
              height: "100%",
            }}
          >
            <CardContent>
              <Typography
                variant="h6"
                sx={{
                  color: "#ffffff",
                  mb: 2,
                  display: "flex",
                  alignItems: "center",
                  gap: 1,
                }}
              >
                <AttachMoney />
                Salary Structure
              </Typography>
              <Divider sx={{ mb: 2, borderColor: "#444" }} />

              <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
                <Box
                  display="flex"
                  justifyContent="space-between"
                  alignItems="center"
                >
                  <Typography variant="body2" sx={{ color: "#b0b0b0" }}>
                    Basic Salary:
                  </Typography>
                  <Typography
                    variant="body1"
                    sx={{ color: "#ffffff", fontWeight: "bold" }}
                  >
                    ₹
                    {(
                      employeeData.salary?.basic ||
                      employeeData.salary?.base ||
                      "0"
                    ).toLocaleString()}
                  </Typography>
                </Box>

                {employeeData.salary?.hra && (
                  <Box
                    display="flex"
                    justifyContent="space-between"
                    alignItems="center"
                  >
                    <Typography variant="body2" sx={{ color: "#b0b0b0" }}>
                      HRA:
                    </Typography>
                    <Typography variant="body1" sx={{ color: "#ffffff" }}>
                      ₹{employeeData.salary.hra}
                    </Typography>
                  </Box>
                )}

                {employeeData.salary?.ta && (
                  <Box
                    display="flex"
                    justifyContent="space-between"
                    alignItems="center"
                  >
                    <Typography variant="body2" sx={{ color: "#b0b0b0" }}>
                      TA:
                    </Typography>
                    <Typography variant="body1" sx={{ color: "#ffffff" }}>
                      ₹{employeeData.salary.ta}
                    </Typography>
                  </Box>
                )}

                {employeeData.salary?.da && (
                  <Box
                    display="flex"
                    justifyContent="space-between"
                    alignItems="center"
                  >
                    <Typography variant="body2" sx={{ color: "#b0b0b0" }}>
                      DA:
                    </Typography>
                    <Typography variant="body1" sx={{ color: "#ffffff" }}>
                      ₹{employeeData.salary.da}
                    </Typography>
                  </Box>
                )}

                <Divider sx={{ borderColor: "#444" }} />

                <Box
                  display="flex"
                  justifyContent="space-between"
                  alignItems="center"
                >
                  <Typography
                    variant="body1"
                    sx={{ color: "#ffffff", fontWeight: "bold" }}
                  >
                    Total CTC:
                  </Typography>
                  <Typography
                    variant="h6"
                    sx={{ color: "#2196f3", fontWeight: "bold" }}
                  >
                    ₹
                    {(() => {
                      // Use new salary structure if available, fallback to legacy structure
                      if (employeeData.salary?.ctcPerMonth) {
                        return employeeData.salary.ctcPerMonth.toLocaleString();
                      } else if (employeeData.salary?.totalGrossEarning) {
                        return employeeData.salary.totalGrossEarning.toLocaleString();
                      } else {
                        // Try new structure first (basic + da + hra + allowances)
                        let total = 0;

                        // Basic salary (required field in new structure)
                        const basic = Number(employeeData.salary?.basic || 0);
                        const da = Number(employeeData.salary?.da || 0);
                        const hra = Number(employeeData.salary?.hra || 0);

                        total = basic + da + hra;

                        // Add custom allowances if they exist
                        if (
                          employeeData.salary?.customAllowances &&
                          Array.isArray(employeeData.salary.customAllowances)
                        ) {
                          total += employeeData.salary.customAllowances.reduce(
                            (sum, allowance) => sum + (allowance.amount || 0),
                            0,
                          );
                        }

                        // Fallback to legacy structure if new structure gives 0
                        if (total === 0) {
                          const base = Number(employeeData.salary?.base || 0);
                          const legacyHra = Number(
                            employeeData.salary?.hra || 0,
                          );
                          const ta = Number(employeeData.salary?.ta || 0);
                          const legacyDa = Number(employeeData.salary?.da || 0);
                          total = base + legacyHra + ta + legacyDa;
                        }

                        return total.toLocaleString();
                      }
                    })()}
                  </Typography>
                </Box>

                {employeeData.salary?.taxRegime && (
                  <Box
                    display="flex"
                    justifyContent="space-between"
                    alignItems="center"
                  >
                    <Typography variant="body2" sx={{ color: "#b0b0b0" }}>
                      Tax Regime:
                    </Typography>
                    <Chip
                      label={
                        employeeData.salary.taxRegime === "new"
                          ? "New Regime"
                          : "Old Regime"
                      }
                      color="primary"
                      size="small"
                      sx={{ backgroundColor: "#2196f3", color: "#ffffff" }}
                    />
                  </Box>
                )}
              </Box>
            </CardContent>
          </Card>
        </Box>

        {/* Address Information */}
        {employeeData.address && (
          <Card sx={{ backgroundColor: "#2d2d2d", border: "1px solid #333" }}>
            <CardContent>
              <Typography variant="h6" sx={{ color: "#ffffff", mb: 2 }}>
                Address
              </Typography>
              <Divider sx={{ mb: 2, borderColor: "#444" }} />
              <Typography variant="body1" sx={{ color: "#ffffff" }}>
                {employeeData.address}
              </Typography>
            </CardContent>
          </Card>
        )}

        {/* Additional Information */}
        <Card sx={{ backgroundColor: "#2d2d2d", border: "1px solid #333" }}>
          <CardContent>
            <Typography variant="h6" sx={{ color: "#ffffff", mb: 2 }}>
              Additional Information
            </Typography>
            <Divider sx={{ mb: 2, borderColor: "#444" }} />

            {(() => {
              const additionalFields = Object.entries(employeeData).filter(
                ([key, value]) => {
                  // Exclude main profile fields
                  const mainFields = [
                    "id",
                    "employeeId",
                    "fullName",
                    "email",
                    "mobile",
                    "salary",
                    "address",
                    "department",
                    "joiningDate",
                    "joinDate",
                    "createdAt",
                    "updatedAt",
                    // Employee Info section fields
                    "fatherName",
                    "designation",
                    "hqLocation",
                    "dob",
                    // Basic section fields
                    "epfNo",
                    "uan",
                    "esicNo",
                    "status",
                    "companyName",
                    "companyId",
                    "assignedManagers",
                    "assignedManager",
                    "managerNames",
                  ];

                  // Exclude salary-related fields (already shown in salary section)
                  const salaryFields = [
                    "baseSalary",
                    "base",
                    "basic",
                    "hra",
                    "ta",
                    "da",
                    "grossSalary",
                    "netSalary",
                    "hraPercentage",
                    "esicEmployeePercentage",
                    "esicEmployerPercentage",
                    "pfEmployeePercentage",
                    "pfEmployerPercentage",
                    "taxRegime",
                    "ctcPerMonth",
                    "totalGrossEarning",
                    "totalDeduction",
                  ];

                  // Exclude system/internal fields
                  const systemFields = [
                    "role",
                    "permissions",
                    "lastLoginAt",
                    "isActive",
                    "isDeleted",
                    "version",
                    "externalEmployeeId",
                  ];

                  // Exclude timestamp objects and empty values
                  const allExcludedFields = [
                    ...mainFields,
                    ...salaryFields,
                    ...systemFields,
                  ];

                  return (
                    !allExcludedFields.includes(key) &&
                    value !== null &&
                    value !== undefined &&
                    value !== "" &&
                    !(
                      typeof value === "object" &&
                      value.seconds &&
                      value.nanoseconds
                    )
                  ); // Exclude Firestore timestamps
                },
              );

              if (additionalFields.length === 0) {
                return (
                  <Box sx={{ textAlign: "center", py: 3 }}>
                    <Typography
                      variant="body2"
                      sx={{ color: "#b0b0b0", fontStyle: "italic", mb: 2 }}
                    >
                      No additional information available
                    </Typography>
                    <Typography
                      variant="body2"
                      sx={{ color: "#2196f3", fontSize: "0.875rem" }}
                    >
                      You can add additional information in the Settings page
                    </Typography>
                  </Box>
                );
              }

              return (
                <Box
                  sx={{
                    display: "grid",
                    gridTemplateColumns: {
                      xs: "1fr",
                      sm: "repeat(2, 1fr)",
                      md: "repeat(3, 1fr)",
                    },
                    gap: 3,
                  }}
                >
                  {additionalFields.map(([key, value]) => (
                    <Box
                      key={key}
                      sx={{
                        p: 2,
                        border: "1px solid #444",
                        borderRadius: 1,
                        backgroundColor: "#1a1a1a",
                      }}
                    >
                      <Typography
                        variant="body2"
                        sx={{
                          color: "#2196f3",
                          textTransform: "capitalize",
                          fontWeight: "bold",
                          mb: 1,
                        }}
                      >
                        {key.replace(/([A-Z])/g, " $1").trim()}
                      </Typography>
                      <Typography
                        variant="body1"
                        sx={{
                          color: "#ffffff",
                          wordBreak: "break-word",
                        }}
                      >
                        {(() => {
                          // Special handling for specific fields
                          if (key === "assignedManagers") {
                            if (managerNames.length > 0) {
                              return managerNames.join(", ");
                            }
                            // Show the raw data if we couldn't resolve names
                            if (Array.isArray(value) && value.length > 0) {
                              return `Manager IDs: ${value.join(", ")} (Could not resolve names)`;
                            }
                            return "No managers assigned";
                          }

                          if (key === "companyId") {
                            if (
                              companyName &&
                              companyName !== "Unknown Company"
                            ) {
                              return companyName;
                            }
                            // Show the raw company ID if we couldn't resolve the name
                            return `Company ID: ${value} (Could not resolve name)`;
                          }

                          if (key === "joinDate" || key === "joiningDate") {
                            if (typeof value === "object" && value !== null) {
                              // Handle Firestore timestamp
                              if (
                                value.seconds &&
                                value.nanoseconds !== undefined
                              ) {
                                return new Date(
                                  value.seconds * 1000,
                                ).toLocaleDateString();
                              }
                              // Handle other timestamp formats
                              if (
                                value.toDate &&
                                typeof value.toDate === "function"
                              ) {
                                return value.toDate().toLocaleDateString();
                              }
                            }
                            // Handle string dates
                            if (typeof value === "string") {
                              return new Date(value).toLocaleDateString();
                            }
                            return "Invalid date format";
                          }

                          if (typeof value === "object" && value !== null) {
                            // Check if it's a Firestore timestamp
                            if (value.seconds && value.nanoseconds) {
                              const date = new Date(value.seconds * 1000);
                              return date.toLocaleString();
                            }
                            // For arrays, join them nicely
                            if (Array.isArray(value)) {
                              return value.join(", ");
                            }
                            // For other objects, show as JSON but limit length
                            const jsonStr = JSON.stringify(value);
                            return jsonStr.length > 100
                              ? jsonStr.substring(0, 100) + "..."
                              : jsonStr;
                          }
                          return String(value);
                        })()}
                      </Typography>
                    </Box>
                  ))}
                </Box>
              );
            })()}
          </CardContent>
        </Card>
      </Box>
    </Box>
  );
}
