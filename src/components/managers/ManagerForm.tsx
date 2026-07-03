"use client";

import React, { useState, useEffect } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Button,
  Box,
  Typography,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Alert,
  CircularProgress,
  Divider,
} from "@mui/material";
import { LoadingButton } from "@/components/ui/LoadingButton";
import { useAsyncAction } from "@/lib/useAsyncAction";
import { useForm, Controller } from "react-hook-form";
import { yupResolver } from "@hookform/resolvers/yup";
import * as yup from "yup";
import {
  doc,
  updateDoc,
  collection,
  query,
  where,
  getDocs,
  addDoc,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Manager, CustomField } from "@/types";
import { useAuth } from "@/contexts/AuthContext";
import { generateUserId } from "@/lib/utils";

interface ManagerFormProps {
  open: boolean;
  manager?: Manager | null;
  onSave: () => void;
  onCancel: () => void;
}

type UploadField = "logoUrl" | "stampUrl" | "signUrl";
type UploadStatus = {
  state: "idle" | "uploading" | "success" | "error";
  message: string;
};

type ManagerFormValues = {
  managerId: string;
  fullName: string;
  email: string;
  brandingCompanyName: string;
  brandingCompanyAddress: string;
  buildingBlock: string;
  street: string;
  city: string;
  state: string;
  pinCode: string;
  logoUrl: string;
  stampUrl: string;
  signUrl: string;
  managerDeletePassword: string;
  employeeDeletePassword: string;
  [key: string]: string;
};

// Validation schema
const schema = yup
  .object({
    managerId: yup.string().required("Manager ID is required"),
    fullName: yup
      .string()
      .required("Full name is required")
      .min(2, "Name must be at least 2 characters"),
    email: yup
      .string()
      .email("Invalid email format")
      .required("Email is required"),
    brandingCompanyName: yup.string().default(""),
    brandingCompanyAddress: yup.string().default(""),
    buildingBlock: yup.string().default(""),
    street: yup.string().default(""),
    city: yup.string().default(""),
    state: yup.string().default(""),
    pinCode: yup.string().default(""),
    logoUrl: yup.string().default(""),
    stampUrl: yup.string().default(""),
    signUrl: yup.string().default(""),
    managerDeletePassword: yup.string().default(""),
    employeeDeletePassword: yup.string().default(""),
  })
  .required();

export default function ManagerForm({
  open,
  manager,
  onSave,
  onCancel,
}: ManagerFormProps) {
  const { currentUser } = useAuth();
  const [savedManager, setSavedManager] = useState<Manager | null>(null);
  const [customFields, setCustomFields] = useState<CustomField[]>([]);
  const [existingFields, setExistingFields] = useState<string[]>([]);
  const [moreInfoFields, setMoreInfoFields] = useState<
    { name: string; value: string }[]
  >([]);
  const [uploadStatuses, setUploadStatuses] = useState<
    Record<string, UploadStatus>
  >({});

  const composeAddress = (data: Record<string, unknown>) => {
    const parts = [
      String(data.buildingBlock || "").trim(),
      String(data.street || "").trim(),
      String(data.city || "").trim(),
      String(data.state || "").trim(),
      String(data.pinCode || "").trim(),
    ].filter(Boolean);
    return parts.join(", ");
  };
  // Load existing custom fields from manager data
  const loadExistingFields = async () => {
    try {
      const managersQuery = query(collection(db, "managers"));
      const querySnapshot = await getDocs(managersQuery);
      const allFields = new Set<string>();
      querySnapshot.forEach((doc) => {
        const data = doc.data();
        Object.keys(data).forEach((key) => {
          if (
            ![
              "id",
              "managerId",
              "fullName",
              "email",
              "companyId",
              "createdAt",
              "updatedAt",
              "status",
              "payslipBranding",
              "managerDeletePassword",
              "employeeDeletePassword",
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

  useEffect(() => {
    if (open) {
      loadExistingFields();
    }
  }, [open]);
  const { execute, isLoading, error: asyncError } = useAsyncAction();

  const {
    control,
    handleSubmit,
    formState: { errors },
    reset,
    setValue,
    watch,
  } = useForm<ManagerFormValues>({
    resolver: yupResolver(schema),
    defaultValues: {
      managerId: "",
      fullName: "",
      email: "",
      brandingCompanyName: "",
      brandingCompanyAddress: "",
      buildingBlock: "",
      street: "",
      city: "",
      state: "",
      pinCode: "",
      logoUrl: "",
      stampUrl: "",
      signUrl: "",
      managerDeletePassword: "",
      employeeDeletePassword: "",
    },
  });

  useEffect(() => {
    loadCustomFields();
  }, []);

  useEffect(() => {
    if (manager && open) {
      setValue("managerId", manager.managerId || "");
      setValue("fullName", manager.fullName || "");
      setValue("email", manager.email || "");
      const branding =
        (manager.payslipBranding as Record<string, unknown> | undefined) || {};
      const address =
        (branding.address as Record<string, unknown> | undefined) || {};
      setValue("brandingCompanyName", String(branding.companyName || ""));
      setValue("brandingCompanyAddress", String(branding.companyAddress || ""));
      setValue("buildingBlock", String(address.buildingBlock || ""));
      setValue("street", String(address.street || ""));
      setValue("city", String(address.city || ""));
      setValue("state", String(address.state || ""));
      setValue("pinCode", String(address.pinCode || ""));
      setValue("logoUrl", String(branding.logoUrl || ""));
      setValue("stampUrl", String(branding.stampUrl || ""));
      setValue("signUrl", String(branding.signUrl || ""));
      // Populate delete passwords if set
      setValue("managerDeletePassword", String(manager.managerDeletePassword || ""));
      setValue("employeeDeletePassword", String(manager.employeeDeletePassword || ""));
      // Add all other dynamic fields from the manager
      const additionalFields: { name: string; value: string }[] = [];
      Object.entries(manager).forEach(([key, value]) => {
        if (
          ![
            "id",
            "managerId",
            "fullName",
            "email",
            "companyId",
            "createdAt",
            "updatedAt",
            "status",
            "payslipBranding",
            "managerDeletePassword",
            "employeeDeletePassword",
          ].includes(key) &&
          value !== null &&
          value !== undefined &&
          value !== "" &&
          typeof value !== "object"
        ) {
          if (!existingFields.includes(key)) {
            additionalFields.push({ name: key, value: String(value) });
          }
        }
      });
      setMoreInfoFields(additionalFields);
    } else if (open) {
      reset();
      const managerId = generateUserId("MGR");
      setValue("managerId", managerId);
      setValue("brandingCompanyName", "");
      setValue("brandingCompanyAddress", "");
      setValue("buildingBlock", "");
      setValue("street", "");
      setValue("city", "");
      setValue("state", "");
      setValue("pinCode", "");
      setValue("logoUrl", "");
      setValue("stampUrl", "");
      setValue("signUrl", "");
      setValue("managerDeletePassword", "");
      setValue("employeeDeletePassword", "");
      setMoreInfoFields([]);
    }
  }, [manager, open, setValue, reset, existingFields]);

  const loadCustomFields = async () => {
    try {
      const customFieldsSnapshot = await getDocs(
        collection(db, "customFields"),
      );
      const fields: CustomField[] = [];
      customFieldsSnapshot.forEach((doc) => {
        const data = doc.data();
        if (data.entityType === "manager" || !data.entityType) {
          fields.push({ id: doc.id, ...data } as CustomField);
        }
      });
      setCustomFields(fields.sort((a, b) => a.order - b.order));
    } catch (error) {
      console.error("Error loading custom fields:", error);
    }
  };

  const getUploadStatus = (field: UploadField) => uploadStatuses[field];

  const handleAssetFileUpload = (field: UploadField, file?: File) => {
    if (!file) return;

    const uploadFile = async () => {
      try {
        setUploadStatuses((prev) => ({
          ...prev,
          [field]: { state: "uploading", message: "Uploading..." },
        }));

        const formData = new FormData();
        formData.append("file", file);
        formData.append("assetField", field);

        const response = await fetch("/api/uploads/r2", {
          method: "POST",
          body: formData,
        });

        if (!response.ok) {
          const payload = (await response.json().catch(() => null)) as {
            error?: string;
          } | null;
          throw new Error(payload?.error || "Upload failed.");
        }

        const payload = (await response.json()) as { url: string };
        setValue(field as any, payload.url, { shouldDirty: true });
        setUploadStatuses((prev) => ({
          ...prev,
          [field]: { state: "success", message: "Upload successful." },
        }));
      } catch (e) {
        console.error("Error uploading manager branding file:", e);
        const message =
          e instanceof Error && e.message
            ? e.message
            : "Upload failed. Please try again.";
        setUploadStatuses((prev) => ({
          ...prev,
          [field]: { state: "error", message },
        }));
      }
    };

    void uploadFile();
  };

  const checkDuplicates = async (managerId: string, email: string) => {
    // Check if managerId already exists (excluding current manager if editing)
    const managerIdQuery = query(
      collection(db, "managers"),
      where("managerId", "==", managerId),
      where("companyId", "==", currentUser?.uid),
    );
    const managerIdSnapshot = await getDocs(managerIdQuery);

    if (!managerIdSnapshot.empty) {
      const existingManager = managerIdSnapshot.docs[0];
      if (!manager || existingManager.id !== manager.id) {
        throw new Error("Manager ID already exists in your company");
      }
    }

    // Check if email already exists (excluding current manager if editing)
    const emailQuery = query(
      collection(db, "managers"),
      where("email", "==", email),
      where("companyId", "==", currentUser?.uid),
    );
    const emailSnapshot = await getDocs(emailQuery);

    if (!emailSnapshot.empty) {
      const existingManager = emailSnapshot.docs[0];
      if (!manager || existingManager.id !== manager.id) {
        throw new Error("Email already exists in your company");
      }
    }
  };

  const onSubmit = async (data: any) => {
    await execute(async () => {
      // Validate that currentUser exists
      if (!currentUser?.uid) {
        throw new Error("User not authenticated");
      }

      await checkDuplicates(data.managerId, data.email);

      // Prepare manager data
      const managerData: Record<string, any> = {
        managerId: data.managerId,
        fullName: data.fullName,
        email: data.email,
        status: "active", // Always set to active
        companyId: currentUser.uid, // Now guaranteed to be string
        createdAt: manager?.createdAt || new Date(),
        updatedAt: new Date(),
        payslipBranding: {
          companyName: String(data.brandingCompanyName || ""),
          companyAddress: String(
            data.brandingCompanyAddress ||
              composeAddress({
                buildingBlock: data.buildingBlock,
                street: data.street,
                city: data.city,
                state: data.state,
                pinCode: data.pinCode,
              }),
          ),
          address: {
            buildingBlock: String(data.buildingBlock || ""),
            street: String(data.street || ""),
            city: String(data.city || ""),
            state: String(data.state || ""),
            pinCode: String(data.pinCode || ""),
          },
          logoUrl: String(data.logoUrl || ""),
          stampUrl: String(data.stampUrl || ""),
          signUrl: String(data.signUrl || ""),
        },
      };

      // Always persist delete passwords (even on edit — allows updating them)
      if (data.managerDeletePassword?.trim()) {
        managerData.managerDeletePassword = data.managerDeletePassword.trim();
      }
      if (data.employeeDeletePassword?.trim()) {
        managerData.employeeDeletePassword = data.employeeDeletePassword.trim();
      }

      // Add custom fields
      moreInfoFields.forEach((field) => {
        if (field.name) {
          (managerData as any)[field.name] = field.value;
        }
      });

      let savedManagerData: Manager;

      if (manager) {
        await updateDoc(doc(db, "managers", manager.id), managerData);
        savedManagerData = { ...manager, ...managerData } as Manager;
      } else {
        const docRef = await addDoc(collection(db, "managers"), managerData);
        savedManagerData = { id: docRef.id, ...managerData } as Manager;
      }

      setSavedManager(savedManagerData);
      onSave();
      reset();
    });
  };

  return (
    <Dialog open={open} onClose={isLoading ? undefined : onCancel} maxWidth="md" fullWidth disableEscapeKeyDown={isLoading}>
      <DialogTitle>{manager ? "Edit Manager" : "Add New Manager"}</DialogTitle>
      <DialogContent>
        <Box component="form" onSubmit={handleSubmit(onSubmit)} sx={{ pt: 2 }}>
          {asyncError && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {asyncError}
            </Alert>
          )}

          <Box sx={{ display: "flex", flexDirection: "column", gap: 3 }}>
            {/* Basic Information */}
            <Typography variant="h6" sx={{ color: "primary.main" }}>
              Basic Information
            </Typography>

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
                  name="managerId"
                  control={control}
                  render={({ field }) => (
                    <TextField
                      {...field}
                      fullWidth
                      label="Manager ID *"
                      error={!!errors.managerId}
                      helperText={errors.managerId?.message}
                      placeholder="e.g., MGR001"
                    />
                  )}
                />
              </Box>
              <Box>
                <Controller
                  name="fullName"
                  control={control}
                  render={({ field }) => (
                    <TextField
                      {...field}
                      fullWidth
                      label="Full Name *"
                      error={!!errors.fullName}
                      helperText={errors.fullName?.message}
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
                      label="Email *"
                      type="email"
                      error={!!errors.email}
                      helperText={errors.email?.message}
                    />
                  )}
                />
              </Box>

              <Box sx={{ gridColumn: "1 / -1", mt: 1 }}>
                <Divider sx={{ borderColor: "#3b3b3b", mb: 2 }} />
                <Typography variant="h6" gutterBottom sx={{ color: "#ffffff" }}>
                  Payslip Branding For This Manager
                </Typography>
                <Typography variant="body2" sx={{ color: "#9ca3af", mb: 2 }}>
                  This branding will be used in Salary Slips when this manager
                  is selected.
                </Typography>
              </Box>

              <Box>
                <Controller
                  name="brandingCompanyName"
                  control={control}
                  render={({ field }) => (
                    <TextField
                      {...field}
                      fullWidth
                      label="Company Name (Payslip)"
                    />
                  )}
                />
              </Box>

              <Box>
                <Controller
                  name="brandingCompanyAddress"
                  control={control}
                  render={({ field }) => (
                    <TextField
                      {...field}
                      fullWidth
                      label="Company Address (single line override)"
                      placeholder="Leave blank to auto-build from full address fields"
                    />
                  )}
                />
              </Box>

              <Box>
                <Controller
                  name="buildingBlock"
                  control={control}
                  render={({ field }) => (
                    <TextField {...field} fullWidth label="Building / Block" />
                  )}
                />
              </Box>

              <Box>
                <Controller
                  name="street"
                  control={control}
                  render={({ field }) => (
                    <TextField {...field} fullWidth label="Street" />
                  )}
                />
              </Box>

              <Box>
                <Controller
                  name="city"
                  control={control}
                  render={({ field }) => (
                    <TextField {...field} fullWidth label="City" />
                  )}
                />
              </Box>

              <Box>
                <Controller
                  name="state"
                  control={control}
                  render={({ field }) => (
                    <TextField {...field} fullWidth label="State" />
                  )}
                />
              </Box>

              <Box>
                <Controller
                  name="pinCode"
                  control={control}
                  render={({ field }) => (
                    <TextField {...field} fullWidth label="Pin Code" />
                  )}
                />
              </Box>

              <Box sx={{ gridColumn: "1 / -1" }}>
                <Controller
                  name="logoUrl"
                  control={control}
                  render={({ field }) => (
                    <TextField {...field} fullWidth label="Logo URL" disabled />
                  )}
                />
                <Button
                  component="label"
                  size="small"
                  sx={{ mt: 1 }}
                  disabled={getUploadStatus("logoUrl")?.state === "uploading"}
                  startIcon={
                    getUploadStatus("logoUrl")?.state === "uploading" ? (
                      <CircularProgress size={14} />
                    ) : undefined
                  }
                >
                  {getUploadStatus("logoUrl")?.state === "uploading"
                    ? "Uploading..."
                    : "Upload Logo"}
                  <input
                    hidden
                    type="file"
                    accept="image/*"
                    disabled={getUploadStatus("logoUrl")?.state === "uploading"}
                    onChange={(e) =>
                      handleAssetFileUpload("logoUrl", e.target.files?.[0])
                    }
                  />
                </Button>
                {getUploadStatus("logoUrl")?.state === "success" && (
                  <Typography
                    variant="caption"
                    sx={{ color: "#4caf50", display: "block", mt: 0.5 }}
                  >
                    {getUploadStatus("logoUrl")?.message}
                  </Typography>
                )}
                {getUploadStatus("logoUrl")?.state === "error" && (
                  <Typography
                    variant="caption"
                    sx={{ color: "#ef4444", display: "block", mt: 0.5 }}
                  >
                    {getUploadStatus("logoUrl")?.message}
                  </Typography>
                )}
              </Box>

              <Box sx={{ gridColumn: "1 / -1" }}>
                <Controller
                  name="stampUrl"
                  control={control}
                  render={({ field }) => (
                    <TextField
                      {...field}
                      fullWidth
                      label="Stamp URL"
                      disabled
                    />
                  )}
                />
                <Button
                  component="label"
                  size="small"
                  sx={{ mt: 1 }}
                  disabled={getUploadStatus("stampUrl")?.state === "uploading"}
                  startIcon={
                    getUploadStatus("stampUrl")?.state === "uploading" ? (
                      <CircularProgress size={14} />
                    ) : undefined
                  }
                >
                  {getUploadStatus("stampUrl")?.state === "uploading"
                    ? "Uploading..."
                    : "Upload Stamp"}
                  <input
                    hidden
                    type="file"
                    accept="image/*"
                    disabled={
                      getUploadStatus("stampUrl")?.state === "uploading"
                    }
                    onChange={(e) =>
                      handleAssetFileUpload("stampUrl", e.target.files?.[0])
                    }
                  />
                </Button>
                {getUploadStatus("stampUrl")?.state === "success" && (
                  <Typography
                    variant="caption"
                    sx={{ color: "#4caf50", display: "block", mt: 0.5 }}
                  >
                    {getUploadStatus("stampUrl")?.message}
                  </Typography>
                )}
                {getUploadStatus("stampUrl")?.state === "error" && (
                  <Typography
                    variant="caption"
                    sx={{ color: "#ef4444", display: "block", mt: 0.5 }}
                  >
                    {getUploadStatus("stampUrl")?.message}
                  </Typography>
                )}
              </Box>

              <Box sx={{ gridColumn: "1 / -1" }}>
                <Controller
                  name="signUrl"
                  control={control}
                  render={({ field }) => (
                    <TextField
                      {...field}
                      fullWidth
                      label="Signature URL"
                      disabled
                    />
                  )}
                />
                <Button
                  component="label"
                  size="small"
                  sx={{ mt: 1 }}
                  disabled={getUploadStatus("signUrl")?.state === "uploading"}
                  startIcon={
                    getUploadStatus("signUrl")?.state === "uploading" ? (
                      <CircularProgress size={14} />
                    ) : undefined
                  }
                >
                  {getUploadStatus("signUrl")?.state === "uploading"
                    ? "Uploading..."
                    : "Upload Signature"}
                  <input
                    hidden
                    type="file"
                    accept="image/*"
                    disabled={getUploadStatus("signUrl")?.state === "uploading"}
                    onChange={(e) =>
                      handleAssetFileUpload("signUrl", e.target.files?.[0])
                    }
                  />
                </Button>
                {getUploadStatus("signUrl")?.state === "success" && (
                  <Typography
                    variant="caption"
                    sx={{ color: "#4caf50", display: "block", mt: 0.5 }}
                  >
                    {getUploadStatus("signUrl")?.message}
                  </Typography>
                )}
                {getUploadStatus("signUrl")?.state === "error" && (
                  <Typography
                    variant="caption"
                    sx={{ color: "#ef4444", display: "block", mt: 0.5 }}
                  >
                    {getUploadStatus("signUrl")?.message}
                  </Typography>
                )}
              </Box>

              {/* Delete Password Section */}
              <Box sx={{ gridColumn: "1 / -1", mt: 1 }}>
                <Divider sx={{ borderColor: "#3b3b3b", mb: 2 }} />
                <Typography variant="h6" gutterBottom sx={{ color: "#ff9800" }}>
                  Delete Protection Passwords
                </Typography>
                <Typography variant="body2" sx={{ color: "#9ca3af", mb: 2 }}>
                  These passwords will be required to confirm delete actions.
                  Keep them safe — they cannot be recovered from the UI, only updated.
                </Typography>
              </Box>

              <Box>
                <Controller
                  name="managerDeletePassword"
                  control={control}
                  render={({ field }) => (
                    <TextField
                      {...field}
                      fullWidth
                      label="Manager Delete Password"
                      type="password"
                      helperText="Admin must enter this to delete this manager"
                      placeholder="Set a password to protect manager deletion"
                    />
                  )}
                />
              </Box>

              <Box>
                <Controller
                  name="employeeDeletePassword"
                  control={control}
                  render={({ field }) => (
                    <TextField
                      {...field}
                      fullWidth
                      label="Employee Delete Password"
                      type="password"
                      helperText="Required when deleting any employee assigned to this manager"
                      placeholder="Set a password to protect employee deletion"
                    />
                  )}
                />
              </Box>

              {/* Existing Custom Fields from other managers */}
              {existingFields.length > 0 && (
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
                  {existingFields.map((fieldName) => (
                    <Box key={fieldName}>
                      <TextField
                        fullWidth
                        label={fieldName}
                        value={manager ? manager[fieldName] || "" : ""}
                        onChange={(e) => {
                          if (manager) {
                            setValue(fieldName as any, e.target.value);
                          }
                        }}
                      />
                    </Box>
                  ))}
                </>
              )}

              {/* Additional Information Section */}
              <Box sx={{ gridColumn: "1 / -1", mt: 2 }}>
                <Typography
                  variant="subtitle1"
                  sx={{ color: "#ffffff", mb: 1 }}
                >
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
                    />
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
                  </Box>
                ))}
                <Button
                  variant="contained"
                  sx={{
                    mt: 1,
                    backgroundColor: "#2196f3",
                    "&:hover": { backgroundColor: "#1976d2" },
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
              </Box>
            </Box>
          </Box>
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onCancel} disabled={isLoading}>
          Cancel
        </Button>
        <LoadingButton
          onClick={handleSubmit(onSubmit)}
          variant="contained"
          isLoading={isLoading}
          sx={{
            backgroundColor: "#2196f3",
            "&:hover": { backgroundColor: "#1976d2" },
          }}
        >
          {manager ? "Update" : "Create"}
        </LoadingButton>
      </DialogActions>
    </Dialog>
  );
}
