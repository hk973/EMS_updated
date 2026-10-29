/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import React, { useState, useEffect } from "react";
import {
  Box,
  Grid,
  TextField,
  Button,
  Typography,
  Alert,
  Checkbox,
  FormGroup,
  FormControlLabel,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
} from "@mui/material";
import { LoadingButton } from "@/components/ui/LoadingButton";
import { useAsyncAction } from "@/lib/useAsyncAction";
import type { GridProps } from "@mui/material/Grid";
import { useForm, Controller } from "react-hook-form";
import { yupResolver } from "@hookform/resolvers/yup";
import * as yup from "yup";
import {
  addDoc,
  updateDoc,
  doc,
  collection,
  query,
  getDocs,
  getDoc,
  where,
  limit,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Employee, CustomField } from "@/types";
import { useAuth } from "@/contexts/AuthContext";
import EmployeeAccountSetup from "./EmployeeAccountSetup";
import { generateUserId } from "@/lib/utils";

// Fix 1: Allow dynamic fields in Yup schema
const schema = yup.object().shape({
  fullName: yup.string().required("Full name is required"),
  email: yup.string().email("Invalid email").required("Email is required"),
  mobile: yup.number().required("Mobile number is required"),
  "salary.basic": yup
    .number()
    .min(0, "Salary must be positive")
    .required("Basic salary is required"),
  fatherName: yup.string().required("Father name is required"),
  designation: yup.string().required("Designation is required"),
  dob: yup.string().required("D.O.B is required"),
  joinDate: yup.string().required("D.O.J is required"),
  epfNo: yup.string().required("EPF No is required"),
  uan: yup.string().required("UAN No is required"),
  esicNo: yup.string().required("ESIC is required"),
  hqLocation: yup.string().required("HQ Location is required"),
});

// Replace the interface with a type alias for dynamic fields
type EmployeeFormData = Record<string, any>;

interface EmployeeFormProps {
  open: boolean;
  employee?: Employee | null;
  onSave: () => void;
  onCancel: () => void;
  readOnly?: boolean;
}

export default function EmployeeForm({
  open,
  employee,
  onSave,
  onCancel,
  readOnly = false,
}: EmployeeFormProps) {
  const { currentUser } = useAuth();
  const isEditable = currentUser?.role === "admin";
  const [, setSavedEmployee] = useState<Employee | null>(null);
  const [customFields] = useState<CustomField[]>([]);
  const [existingFields, setExistingFields] = useState<string[]>([]);
  const { execute, isLoading, error: asyncError } = useAsyncAction();
  const [resolvedCompanyName, setResolvedCompanyName] = useState("");
  const [resolvedManagerNames, setResolvedManagerNames] = useState("");
  const [moreInfoFields, setMoreInfoFields] = useState<
    { name: string; value: string }[]
  >([]);

  const displayExistingFields = Array.from(
    new Set([
      ...existingFields,
      ...(open && employee ? ["companyName", "managerNames", "companyId"] : []),
    ]),
  ).filter((field) => field !== "assignedManagers" && field !== "companyId");

  // Get current authenticated user from context

  // Initialize useForm hook first
  const {
    control,
    handleSubmit,
    formState: { errors },
    reset,
    watch,
  } = useForm<EmployeeFormData>({
    resolver: yupResolver(schema) as any,
    defaultValues: {
      fullName: "",
      email: "",
      mobile: 0,
      "salary.basic": 0,
      fatherName: "",
      designation: "",
      dob: "",
      joinDate: "",
      epfNo: "",
      uan: "",
      esicNo: "",
      hqLocation: "",
    },
  });

  // Load existing custom fields from employee data
  const loadExistingFields = async () => {
    try {
      const companyId =
        currentUser?.role === "admin"
          ? currentUser.uid
          : currentUser?.companyId || "";
      if (!companyId) return;

      const employeesQuery = query(
        collection(db, "employees"),
        where("companyId", "==", companyId),
        limit(25),
      );
      const querySnapshot = await getDocs(employeesQuery);
      const allFields = new Set<string>();

      querySnapshot.forEach((doc) => {
        const data = doc.data();
        Object.keys(data).forEach((key) => {
          // Exclude main fields and special fields
          if (
            ![
              "id",
              "fullName",
              "employeeId",
              "email",
              "mobile",
              "salary",
              "createdAt",
              "updatedAt",
            ].includes(key)
          ) {
            allFields.add(key);
          }
        });
      });

      setExistingFields(Array.from(allFields));
    } catch (error) {
      console.error("Error loading existing fields:", error);
    }
  };

  // Load existing fields when form opens
  useEffect(() => {
    if (open) {
      loadExistingFields();
    }
  }, [open]);

  // Reset form with employee data when editing
  useEffect(() => {
    if (open && employee) {
      const resolveReferenceNames = async () => {
        try {
          if (employee.companyId) {
            const companyDoc = await getDoc(
              doc(db, "companies", employee.companyId),
            );
            if (companyDoc.exists()) {
              const companyData = companyDoc.data();
              setResolvedCompanyName(
                companyData.companyName ||
                  companyData.name ||
                  companyData.adminName ||
                  "Unknown Company",
              );
            } else {
              setResolvedCompanyName(employee.companyName || "Unknown Company");
            }
          } else {
            setResolvedCompanyName(employee.companyName || "");
          }

          const managerIds = Array.isArray(employee.assignedManagers)
            ? employee.assignedManagers
            : [];

          if (managerIds.length > 0) {
            const managerDocs = await Promise.all(
              managerIds.map((managerId) =>
                getDoc(doc(db, "managers", managerId)),
              ),
            );
            const managerNames = managerDocs
              .map((managerDoc) => {
                if (!managerDoc.exists()) return "Unknown Manager";
                const managerData = managerDoc.data();
                return (
                  managerData.fullName || managerData.name || "Unknown Manager"
                );
              })
              .filter(Boolean);
            setResolvedManagerNames(managerNames.join(", "));
          } else {
            setResolvedManagerNames(
              employee.managerNames || "No managers assigned",
            );
          }
        } catch (error) {
          console.error("Error resolving company/manager names:", error);
          setResolvedCompanyName(employee.companyName || "");
          setResolvedManagerNames(
            employee.managerNames || "No managers assigned",
          );
        }
      };

      resolveReferenceNames();

      // Prepare form data with all employee fields
      const formData: EmployeeFormData = {
        fullName: employee.fullName || "",
        email: employee.email || "",
        mobile: employee.mobile || 0,
        "salary.basic": employee.salary?.basic || employee.salary?.base || 0,
        fatherName: String((employee as any).fatherName || ""),
        designation: String((employee as any).designation || ""),
        dob: String((employee as any).dob || ""),
        joinDate: String((employee as any).joinDate || ""),
        epfNo: String((employee as any).epfNo || ""),
        uan: String((employee as any).uan || ""),
        esicNo: String((employee as any).esicNo || ""),
        hqLocation: String((employee as any).hqLocation || ""),
      };

      // Add all other dynamic fields from the employee
      Object.keys(employee).forEach((key) => {
        if (
          ![
            "id",
            "fullName",
            "email",
            "mobile",
            "salary",
            "createdAt",
            "updatedAt",
            "companyName",
            "managerNames",
            "companyId",
          ].includes(key)
        ) {
          formData[key] = employee[key];
        }
      });

      // Reset form with the employee data
      reset(formData);

      // Also populate additional info fields if they exist
      const additionalFields: { name: string; value: string }[] = [];
      Object.entries(employee).forEach(([key, value]) => {
        if (
          ![
            "id",
            "employeeId",
            "fullName",
            "email",
            "mobile",
            "salary",
            "createdAt",
            "updatedAt",
            "companyName",
            "managerNames",
            "companyId",
          ].includes(key) &&
          value !== null &&
          value !== undefined &&
          value !== ""
        ) {
          // Only add to moreInfoFields if it's not already in existingFields
          if (!existingFields.includes(key)) {
            additionalFields.push({ name: key, value: String(value) });
          }
        }
      });
      setMoreInfoFields(additionalFields);
    } else if (open && !employee) {
      // Reset form for new employee
      reset({
        fullName: "",
        email: "",
        mobile: 0,
        "salary.basic": 0,
        fatherName: "",
        designation: "",
        dob: "",
        joinDate: "",
        epfNo: "",
        uan: "",
        esicNo: "",
        hqLocation: "",
      });
      setMoreInfoFields([]);
      setResolvedCompanyName("");
      setResolvedManagerNames("");
    }
  }, [open, employee, reset, existingFields]);

  const watchedValues = watch();

  const onSubmit = async (data: EmployeeFormData) => {
    await execute(async () => {
      // Generate employee ID if not exists
      const employeeId = employee?.employeeId || generateUserId("employee");

      // Prepare employee data
      const employeeData = {
        employeeId,
        fullName: data.fullName,
        email: data.email,
        mobile: data.mobile,
        companyId: currentUser?.uid, // Link employee to current admin's company
        salary: {
          basic: Number(data["salary.basic"]) || 0,
          da: 0, // Default dearness allowance
          // Custom components as arrays
          customAllowances: [],
          customBonuses: [],
          customDeductions: [],
          bonuses: {},
          deductions: {},
        },
        // Include all other dynamic fields
        ...Object.keys(data).reduce(
          (acc, key) => {
            if (
              !["fullName", "email", "mobile", "salary.basic"].includes(key)
            ) {
              acc[key] = data[key];
            }
            return acc;
          },
          {} as Record<string, any>,
        ),
        createdAt: employee?.createdAt || new Date(),
        updatedAt: new Date(),
      };

      // Fix 2: Cast employeeData as any for dynamic assignment
      moreInfoFields.forEach((f) => {
        if (f.name) (employeeData as any)[f.name] = f.value;
      });

      let savedEmployeeData: Employee;

      if (employee) {
        await updateDoc(doc(db, "employees", employee.id), employeeData);
        savedEmployeeData = { ...employee, ...employeeData };
      } else {
        const docRef = await addDoc(collection(db, "employees"), employeeData);
        savedEmployeeData = { id: docRef.id, ...employeeData };
      }

      setSavedEmployee(savedEmployeeData);

      onSave();
      reset();
    });
  };

  return (
    <Dialog
      open={open}
      onClose={isLoading ? undefined : onCancel}
      maxWidth="md"
      fullWidth
      disableEscapeKeyDown={isLoading}
    >
      <DialogTitle>
        <Typography variant="h5" component="span" sx={{ color: "#ffffff" }}>
          {employee ? "Edit Employee" : "Add New Employee"}
        </Typography>
      </DialogTitle>
      <DialogContent>
        <Box component="form" onSubmit={handleSubmit(onSubmit)} sx={{ mt: 2 }}>
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
              gap: 3,
            }}
          >
            {/* Basic Information */}
            <Box sx={{ gridColumn: "1 / -1" }}>
              <Typography variant="h6" gutterBottom sx={{ color: "#ffffff" }}>
                Basic Information
              </Typography>
            </Box>

            <Box>
              <Controller
                name="fullName"
                control={control}
                render={({ field }) => (
                  <TextField
                    {...field}
                    fullWidth
                    label="Full Name"
                    error={!!errors.fullName}
                    helperText={errors.fullName?.message?.toString()}
                    sx={{
                      "& .MuiOutlinedInput-root": {
                        borderRadius: 2,
                      },
                    }}
                    InputProps={{ readOnly: !isEditable }}
                  />
                )}
              />
            </Box>

            <Box>
              <Controller
                name="email"
                control={control}
                render={({ field }) => (
                  <TextField
                    {...field}
                    fullWidth
                    label="Email"
                    type="email"
                    error={!!errors.email}
                    helperText={errors.email?.message?.toString()}
                    sx={{
                      "& .MuiOutlinedInput-root": {
                        borderRadius: 2,
                      },
                    }}
                    InputProps={{ readOnly: !isEditable }}
                  />
                )}
              />
            </Box>

            <Box>
              <Controller
                name="mobile"
                control={control}
                render={({ field }) => (
                  <TextField
                    {...field}
                    fullWidth
                    label="Mobile"
                    type="tel"
                    error={!!errors.mobile}
                    helperText={errors.mobile?.message?.toString()}
                    sx={{
                      "& .MuiOutlinedInput-root": {
                        borderRadius: 2,
                      },
                    }}
                    InputProps={{ readOnly: !isEditable }}
                  />
                )}
              />
            </Box>

            <Box>
              <Controller
                name="salary.basic"
                control={control}
                render={({ field }) => (
                  <TextField
                    {...field}
                    fullWidth
                    label="Basic Salary"
                    type="number"
                    inputProps={{ min: 0, step: 0.01, readOnly: !isEditable }}
                    error={!!errors["salary.basic"]}
                    helperText={errors["salary.basic"]?.message?.toString()}
                    sx={{
                      "& .MuiOutlinedInput-root": {
                        borderRadius: 2,
                      },
                    }}
                  />
                )}
              />
            </Box>

            <Box sx={{ gridColumn: "1 / -1", mt: 1 }}>
              <Typography variant="h6" gutterBottom sx={{ color: "#ffffff" }}>
                Additional Employee Information
              </Typography>
            </Box>

            <Box>
              <Controller
                name="fatherName"
                control={control}
                render={({ field }) => (
                  <TextField
                    {...field}
                    fullWidth
                    label="Father Name"
                    required
                    error={!!errors.fatherName}
                    helperText={errors.fatherName?.message?.toString()}
                    InputProps={{ readOnly: !isEditable }}
                  />
                )}
              />
            </Box>

            <Box>
              <Controller
                name="designation"
                control={control}
                render={({ field }) => (
                  <TextField
                    {...field}
                    fullWidth
                    label="Designation"
                    required
                    error={!!errors.designation}
                    helperText={errors.designation?.message?.toString()}
                    InputProps={{ readOnly: !isEditable }}
                  />
                )}
              />
            </Box>

            <Box>
              <Controller
                name="dob"
                control={control}
                render={({ field }) => (
                  <TextField
                    {...field}
                    fullWidth
                    label="D.O.B"
                    type="date"
                    required
                    error={!!errors.dob}
                    helperText={errors.dob?.message?.toString()}
                    InputLabelProps={{ shrink: true }}
                    inputProps={{ readOnly: !isEditable }}
                  />
                )}
              />
            </Box>

            <Box>
              <Controller
                name="joinDate"
                control={control}
                render={({ field }) => (
                  <TextField
                    {...field}
                    fullWidth
                    label="D.O.J"
                    type="date"
                    required
                    error={!!errors.joinDate}
                    helperText={errors.joinDate?.message?.toString()}
                    InputLabelProps={{ shrink: true }}
                    inputProps={{ readOnly: !isEditable }}
                  />
                )}
              />
            </Box>

            <Box>
              <Controller
                name="epfNo"
                control={control}
                render={({ field }) => (
                  <TextField
                    {...field}
                    fullWidth
                    label="EPF No"
                    required
                    error={!!errors.epfNo}
                    helperText={errors.epfNo?.message?.toString()}
                    InputProps={{ readOnly: !isEditable }}
                  />
                )}
              />
            </Box>

            <Box>
              <Controller
                name="uan"
                control={control}
                render={({ field }) => (
                  <TextField
                    {...field}
                    fullWidth
                    label="UAN No"
                    required
                    error={!!errors.uan}
                    helperText={errors.uan?.message?.toString()}
                    InputProps={{ readOnly: !isEditable }}
                  />
                )}
              />
            </Box>

            <Box>
              <Controller
                name="esicNo"
                control={control}
                render={({ field }) => (
                  <TextField
                    {...field}
                    fullWidth
                    label="ESIC"
                    required
                    error={!!errors.esicNo}
                    helperText={errors.esicNo?.message?.toString()}
                    InputProps={{ readOnly: !isEditable }}
                  />
                )}
              />
            </Box>

            <Box>
              <Controller
                name="hqLocation"
                control={control}
                render={({ field }) => (
                  <TextField
                    {...field}
                    fullWidth
                    label="HQ Location"
                    required
                    error={!!errors.hqLocation}
                    helperText={errors.hqLocation?.message?.toString()}
                    InputProps={{ readOnly: !isEditable }}
                  />
                )}
              />
            </Box>

            {/* Dynamic Fields */}
            {customFields.map((field) => (
              <Box key={field.id}>
                <Controller
                  name={field.name}
                  control={control}
                  render={({ field: formField }) => (
                    <TextField
                      {...formField}
                      fullWidth
                      label={field.name}
                      type={field.type === "number" ? "number" : "text"}
                      error={!!errors[field.name]}
                      helperText={errors[field.name]?.message?.toString()}
                      sx={{
                        "& .MuiOutlinedInput-root": {
                          borderRadius: 2,
                        },
                      }}
                      InputProps={{ readOnly: !isEditable }}
                    />
                  )}
                />
              </Box>
            ))}

            {/* Existing Custom Fields from other employees */}
            {displayExistingFields.length > 0 && (
              <>
                <Box sx={{ gridColumn: "1 / -1", mt: 2 }}>
                  <Typography
                    variant="h6"
                    gutterBottom
                    sx={{ color: "#ffffff" }}
                  >
                    Existing Custom Fields
                  </Typography>
                </Box>
                {displayExistingFields.map((fieldName) => (
                  <Box key={fieldName}>
                    <Controller
                      name={fieldName}
                      control={control}
                      render={({ field }) => {
                        // Special formatting for joinDate and reference fields
                        let displayValue = field.value;

                        if (fieldName === "companyName") {
                          displayValue = field.value || resolvedCompanyName;
                        }

                        if (fieldName === "managerNames") {
                          displayValue = field.value || resolvedManagerNames;
                        }

                        if (fieldName === "assignedManagers") {
                          displayValue =
                            resolvedManagerNames ||
                            employee?.managerNames ||
                            "";
                        }

                        if (fieldName === "joinDate") {
                          // Firestore timestamp object
                          if (
                            displayValue &&
                            typeof displayValue === "object" &&
                            "seconds" in displayValue &&
                            "nanoseconds" in displayValue
                          ) {
                            const date = new Date(displayValue.seconds * 1000);
                            displayValue = date.toLocaleDateString();
                          } else if (typeof displayValue === "number") {
                            const date = new Date(
                              displayValue > 1e12
                                ? displayValue
                                : displayValue * 1000,
                            );
                            displayValue = date.toLocaleDateString();
                          } else if (
                            typeof displayValue === "string" &&
                            /^\d+(\.\d+)?$/.test(displayValue)
                          ) {
                            const num = Number(displayValue);
                            if (!isNaN(num)) {
                              const date = new Date(
                                num > 1e12 ? num : num * 1000,
                              );
                              displayValue = date.toLocaleDateString();
                            }
                          }
                        }
                        return (
                          <TextField
                            {...field}
                            value={displayValue}
                            fullWidth
                            label={fieldName}
                            placeholder={`Enter ${fieldName}`}
                            sx={{
                              "& .MuiOutlinedInput-root": {
                                borderRadius: 2,
                              },
                            }}
                            InputProps={{
                              readOnly:
                                !isEditable ||
                                ["companyName", "managerNames"].includes(
                                  fieldName,
                                ),
                            }}
                          />
                        );
                      }}
                    />
                  </Box>
                ))}
              </>
            )}

            {/* --- ADDITIONAL INFO SECTION (editable, see comment below) --- */}
            {/* Add More Info Section: You can edit this section to change how extra fields are handled */}
            <Box sx={{ gridColumn: "1 / -1", mt: 2 }}>
              <Typography variant="subtitle1" sx={{ color: "#ffffff", mb: 1 }}>
                Additional Information
              </Typography>
              {moreInfoFields.map((field, idx) => (
                <Box key={idx} sx={{ display: "flex", gap: 2, mb: 1 }}>
                  <TextField
                    label="Field Name"
                    value={field.name}
                    onChange={(e) => {
                      const updated = [...moreInfoFields];
                      updated[idx].name = e.target.value;
                      setMoreInfoFields(updated);
                    }}
                    sx={{ flex: 1 }}
                    InputProps={{ readOnly: !isEditable }}
                  />
                  <TextField
                    label="Field Value"
                    value={field.value}
                    onChange={(e) => {
                      const updated = [...moreInfoFields];
                      updated[idx].value = e.target.value;
                      setMoreInfoFields(updated);
                    }}
                    sx={{ flex: 1 }}
                    InputProps={{ readOnly: !isEditable }}
                  />
                  {isEditable && (
                    <Button
                      variant="outlined"
                      color="error"
                      onClick={() =>
                        setMoreInfoFields(
                          moreInfoFields.filter((_, i) => i !== idx),
                        )
                      }
                    >
                      Remove
                    </Button>
                  )}
                </Box>
              ))}
              {isEditable && (
                <Button
                  variant="contained"
                  sx={{
                    mt: 1,
                    background: "linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)",
                    borderRadius: "10px",
                    fontWeight: 600,
                    boxShadow: "0 4px 12px rgba(99, 102, 241, 0.3)",
                    "&:hover": {
                      background: "linear-gradient(135deg, #4f46e5 0%, #4338ca 100%)",
                      transform: "translateY(-1px)",
                    },
                  }}
                  onClick={() =>
                    setMoreInfoFields([
                      ...moreInfoFields,
                      { name: "", value: "" },
                    ])
                  }
                >
                  Add More Info
                </Button>
              )}
            </Box>
            {/* --- END ADDITIONAL INFO SECTION --- */}
          </Box>
        </Box>
      </DialogContent>
      <DialogActions>
        {asyncError && (
          <Alert severity="error" sx={{ flex: 1, mr: 1 }}>
            {asyncError}
          </Alert>
        )}
        <Button onClick={onCancel} variant="outlined" disabled={isLoading}>
          Cancel
        </Button>
        {currentUser?.role === "admin" && (
          <LoadingButton
            type="submit"
            variant="contained"
            isLoading={isLoading}
            onClick={handleSubmit(onSubmit)}
            sx={{
              background: "linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)",
              borderRadius: "10px",
              fontWeight: 600,
              boxShadow: "0 4px 12px rgba(99, 102, 241, 0.3)",
              "&:hover": {
                background: "linear-gradient(135deg, #4f46e5 0%, #4338ca 100%)",
                transform: "translateY(-1px)",
              },
            }}
          >
            {employee ? "Update" : "Save"}
          </LoadingButton>
        )}
      </DialogActions>
    </Dialog>
  );
}
