"use client";

import React, { useEffect, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Checkbox,
  CircularProgress,
  Divider,
  FormControlLabel,
  IconButton,
  Paper,
  TextField,
  Typography,
} from "@mui/material";
import { Add, Delete, Save } from "@mui/icons-material";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";

type BrandingAsset = {
  id: string;
  name: string;
  companyName: string;
  companyAddress: string;
  logoUrl: string;
  stampUrl: string;
  signUrl: string;
  isDefault: boolean;
};

type CompanySettingsForm = {
  companyName: string;
  adminName: string;
  adminMobile: string;
  email: string;
  address: {
    buildingBlock: string;
    street: string;
    city: string;
    state: string;
    pinCode: string;
  };
  brandingAssets: BrandingAsset[];
};

type UploadField = "logoUrl" | "stampUrl" | "signUrl";

type UploadStatus = {
  state: "idle" | "uploading" | "success" | "error";
  message: string;
};

const emptyAsset = (): BrandingAsset => ({
  id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  name: "",
  companyName: "",
  companyAddress: "",
  logoUrl: "",
  stampUrl: "",
  signUrl: "",
  isDefault: false,
});

export default function AdminCompanySettings() {
  const { currentUser } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [uploadStatuses, setUploadStatuses] = useState<
    Record<string, UploadStatus>
  >({});
  const [form, setForm] = useState<CompanySettingsForm>({
    companyName: "",
    adminName: "",
    adminMobile: "",
    email: "",
    address: {
      buildingBlock: "",
      street: "",
      city: "",
      state: "",
      pinCode: "",
    },
    brandingAssets: [],
  });

  useEffect(() => {
    const loadCompanySettings = async () => {
      if (!currentUser?.uid || currentUser.role !== "admin") {
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        const companyRef = doc(db, "companies", currentUser.uid);
        const snapshot = await getDoc(companyRef);

        if (snapshot.exists()) {
          const data = snapshot.data() as Record<string, unknown>;
          const address =
            (data.address as Record<string, unknown> | undefined) || {};
          setForm({
            companyName: String(data.companyName || ""),
            adminName: String(data.adminName || ""),
            adminMobile: String(data.adminMobile || ""),
            email: String(data.email || ""),
            address: {
              buildingBlock: String(address.buildingBlock || ""),
              street: String(address.street || ""),
              city: String(address.city || ""),
              state: String(address.state || ""),
              pinCode: String(address.pinCode || ""),
            },
            brandingAssets: Array.isArray(data.brandingAssets)
              ? (data.brandingAssets as BrandingAsset[]).map((asset) => ({
                  ...emptyAsset(),
                  ...asset,
                  companyName: String(asset.companyName || ""),
                  companyAddress: String(asset.companyAddress || ""),
                }))
              : [],
          });
        }
      } catch (e) {
        console.error("Error loading admin company settings:", e);
        setError("Failed to load company settings.");
      } finally {
        setLoading(false);
      }
    };

    loadCompanySettings();
  }, [currentUser]);

  const updateAsset = (id: string, patch: Partial<BrandingAsset>) => {
    setForm((prev) => ({
      ...prev,
      brandingAssets: prev.brandingAssets.map((asset) =>
        asset.id === id ? { ...asset, ...patch } : asset,
      ),
    }));
  };

  const setDefaultAsset = (id: string) => {
    setForm((prev) => ({
      ...prev,
      brandingAssets: prev.brandingAssets.map((asset) => ({
        ...asset,
        isDefault: asset.id === id,
      })),
    }));
  };

  const addAsset = () => {
    setForm((prev) => ({
      ...prev,
      brandingAssets: [...prev.brandingAssets, emptyAsset()],
    }));
  };

  const removeAsset = (id: string) => {
    setForm((prev) => ({
      ...prev,
      brandingAssets: prev.brandingAssets.filter((asset) => asset.id !== id),
    }));
  };

  const handleAssetFileUpload = (
    assetId: string,
    field: UploadField,
    file?: File,
  ) => {
    if (!file) return;

    const statusKey = `${assetId}:${field}`;

    const uploadFile = async () => {
      try {
        setUploadStatuses((prev) => ({
          ...prev,
          [statusKey]: {
            state: "uploading",
            message: "Uploading...",
          },
        }));
        setError("");

        const formData = new FormData();
        formData.append("file", file);
        formData.append("assetField", field);

        const response = await fetch("/api/uploads/r2", {
          method: "POST",
          body: formData,
        });

        if (!response.ok) {
          const payload = (await response.json().catch(() => null)) as
            | { error?: string }
            | null;
          throw new Error(payload?.error || "Upload failed.");
        }

        const payload = (await response.json()) as { url: string };
        updateAsset(assetId, { [field]: payload.url } as Partial<BrandingAsset>);

        setUploadStatuses((prev) => ({
          ...prev,
          [statusKey]: {
            state: "success",
            message: "Upload successful.",
          },
        }));
      } catch (e) {
        console.error("Error uploading file to R2:", e);
        const message =
          e instanceof Error && e.message
            ? e.message
            : "Upload failed. Please try again.";
        setUploadStatuses((prev) => ({
          ...prev,
          [statusKey]: {
            state: "error",
            message,
          },
        }));
        setError(message);
      }
    };

    void uploadFile();
  };

  const handleSave = async () => {
    if (!currentUser?.uid) return;

    try {
      setSaving(true);
      setError("");
      setSuccess("");

      const normalizedAssets = [...form.brandingAssets];
      if (
        normalizedAssets.length > 0 &&
        !normalizedAssets.some((a) => a.isDefault)
      ) {
        normalizedAssets[0] = { ...normalizedAssets[0], isDefault: true };
      }

      const payload = {
        companyName: form.companyName,
        adminName: form.adminName,
        adminMobile: form.adminMobile,
        email: form.email,
        address: {
          buildingBlock: form.address.buildingBlock,
          street: form.address.street,
          city: form.address.city,
          state: form.address.state,
          pinCode: form.address.pinCode,
        },
        brandingAssets: normalizedAssets,
        updatedAt: new Date(),
      };

      await setDoc(doc(db, "companies", currentUser.uid), payload, {
        merge: true,
      });

      setSuccess("Company settings saved successfully.");
    } catch (e) {
      console.error("Error saving company settings:", e);
      setError("Failed to save company settings.");
    } finally {
      setSaving(false);
    }
  };

  const anyUploading = Object.values(uploadStatuses).some(
    (status) => status.state === "uploading",
  );

  const getUploadStatus = (assetId: string, field: UploadField) =>
    uploadStatuses[`${assetId}:${field}`];

  const textFieldSx = {
    "& .MuiOutlinedInput-root": {
      backgroundColor: "rgba(255, 255, 255, 0.03)",
      backdropFilter: "blur(10px)",
      borderRadius: "12px",
      "& fieldset": {
        borderColor: "rgba(255, 255, 255, 0.1)",
      },
      "&:hover fieldset": {
        borderColor: "rgba(99, 102, 241, 0.4)",
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

  if (loading) {
    return (
      <Box
        display="flex"
        justifyContent="center"
        alignItems="center"
        minHeight="320px"
      >
        <CircularProgress sx={{ color: "#6366f1" }} />
      </Box>
    );
  }

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
          Company Settings
        </Typography>
        <Typography variant="body2" sx={{ color: "#94a3b8" }}>
          Configure company profile, address details, and payslip branding assets.
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

      {/* Company Profile Card */}
      <Card
        elevation={0}
        sx={{
          background: "rgba(255, 255, 255, 0.03)",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
          border: "1px solid rgba(255, 255, 255, 0.08)",
          borderRadius: "16px",
          boxShadow: "0 8px 32px rgba(0, 0, 0, 0.25)",
          mb: 3,
        }}
      >
        <CardContent sx={{ p: 3 }}>
          <Typography variant="h6" sx={{ color: "#f1f5f9", fontWeight: 600, mb: 2.5 }}>
            Company Profile
          </Typography>

          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" },
              gap: 2.5,
            }}
          >
            <Box>
              <TextField
                fullWidth
                label="Company Name"
                value={form.companyName}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, companyName: e.target.value }))
                }
                sx={textFieldSx}
              />
            </Box>
            <Box>
              <TextField
                fullWidth
                label="Company Email"
                value={form.email}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, email: e.target.value }))
                }
                sx={textFieldSx}
              />
            </Box>
            <Box>
              <TextField
                fullWidth
                label="Admin Name"
                value={form.adminName}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, adminName: e.target.value }))
                }
                sx={textFieldSx}
              />
            </Box>
            <Box>
              <TextField
                fullWidth
                label="Admin Mobile"
                value={form.adminMobile}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, adminMobile: e.target.value }))
                }
                sx={textFieldSx}
              />
            </Box>
          </Box>

          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: { xs: "1fr", md: "1fr 2fr" },
              gap: 2.5,
              mt: 2.5,
            }}
          >
            <Box>
              <TextField
                fullWidth
                label="Building/Block"
                value={form.address.buildingBlock}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    address: { ...prev.address, buildingBlock: e.target.value },
                  }))
                }
                sx={textFieldSx}
              />
            </Box>
            <Box>
              <TextField
                fullWidth
                label="Street"
                value={form.address.street}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    address: { ...prev.address, street: e.target.value },
                  }))
                }
                sx={textFieldSx}
              />
            </Box>
          </Box>

          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: { xs: "1fr", md: "1fr 1fr 1fr" },
              gap: 2.5,
              mt: 2.5,
            }}
          >
            <Box>
              <TextField
                fullWidth
                label="City"
                value={form.address.city}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    address: { ...prev.address, city: e.target.value },
                  }))
                }
                sx={textFieldSx}
              />
            </Box>
            <Box>
              <TextField
                fullWidth
                label="State"
                value={form.address.state}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    address: { ...prev.address, state: e.target.value },
                  }))
                }
                sx={textFieldSx}
              />
            </Box>
            <Box>
              <TextField
                fullWidth
                label="Pin Code"
                value={form.address.pinCode}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    address: { ...prev.address, pinCode: e.target.value },
                  }))
                }
                sx={textFieldSx}
              />
            </Box>
          </Box>
        </CardContent>
      </Card>

      {/* Payslip Branding Assets Card */}
      <Card
        elevation={0}
        sx={{
          background: "rgba(255, 255, 255, 0.03)",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
          border: "1px solid rgba(255, 255, 255, 0.08)",
          borderRadius: "16px",
          boxShadow: "0 8px 32px rgba(0, 0, 0, 0.25)",
          mb: 3,
        }}
      >
        <CardContent sx={{ p: 3 }}>
          <Box
            display="flex"
            justifyContent="space-between"
            alignItems="center"
            flexWrap="wrap"
            gap={2}
            mb={2}
          >
            <Typography variant="h6" sx={{ color: "#f1f5f9", fontWeight: 600 }}>
              Payslip Branding Assets
            </Typography>
            <Button
              variant="contained"
              startIcon={<Add />}
              onClick={addAsset}
              sx={{
                borderRadius: "12px",
                px: 2.5,
                py: 0.9,
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
                transition: "all 0.2s ease",
              }}
            >
              Add Logo / Stamp / Sign Set
            </Button>
          </Box>

          <Typography variant="body2" sx={{ color: "#94a3b8", mb: 2.5 }}>
            Add multiple sets. Mark one as default to be used on payslip
            preview/download. Make sure to click &quot;Save Settings&quot; below to save changes.
          </Typography>

          {form.brandingAssets.length === 0 && (
            <Paper
              elevation={0}
              sx={{
                p: 3,
                textAlign: "center",
                background: "rgba(255, 255, 255, 0.02)",
                border: "1px dashed rgba(255, 255, 255, 0.12)",
                borderRadius: "14px",
              }}
            >
              <Typography sx={{ color: "#94a3b8" }}>
                No branding set added yet. Click &quot;Add Logo / Stamp / Sign Set&quot; to create one.
              </Typography>
            </Paper>
          )}

          {form.brandingAssets.map((asset, index) => (
            <Box key={asset.id} sx={{ mb: 2.5 }}>
              <Paper
                elevation={0}
                sx={{
                  p: 2.5,
                  background: "rgba(255, 255, 255, 0.02)",
                  backdropFilter: "blur(10px)",
                  border: "1px solid rgba(255, 255, 255, 0.06)",
                  borderRadius: "14px",
                }}
              >
                <Box
                  display="flex"
                  justifyContent="space-between"
                  alignItems="center"
                  mb={2}
                >
                  <Typography sx={{ color: "#f1f5f9", fontWeight: 600 }}>
                    Branding Set {index + 1}
                  </Typography>
                  <IconButton
                    onClick={() => removeAsset(asset.id)}
                    sx={{
                      color: "#f87171",
                      backgroundColor: "rgba(239, 68, 68, 0.1)",
                      "&:hover": {
                        backgroundColor: "rgba(239, 68, 68, 0.2)",
                      },
                    }}
                  >
                    <Delete fontSize="small" />
                  </IconButton>
                </Box>

                <Box
                  sx={{
                    display: "grid",
                    gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" },
                    gap: 2,
                  }}
                >
                  <Box>
                    <TextField
                      fullWidth
                      label="Set Name"
                      value={asset.name}
                      onChange={(e) =>
                        updateAsset(asset.id, { name: e.target.value })
                      }
                      sx={textFieldSx}
                    />
                  </Box>
                  <Box>
                    <FormControlLabel
                      control={
                        <Checkbox
                          checked={asset.isDefault}
                          onChange={() => setDefaultAsset(asset.id)}
                          sx={{
                            color: "rgba(255, 255, 255, 0.3)",
                            "&.Mui-checked": {
                              color: "#6366f1",
                            },
                          }}
                        />
                      }
                      label="Use this as default"
                      sx={{ color: "#f1f5f9", mt: 1 }}
                    />
                  </Box>
                  <Box>
                    <TextField
                      fullWidth
                      label="Company Name for this asset"
                      value={asset.companyName}
                      onChange={(e) =>
                        updateAsset(asset.id, { companyName: e.target.value })
                      }
                      sx={textFieldSx}
                    />
                  </Box>
                  <Box>
                    <TextField
                      fullWidth
                      label="Company Address for this asset"
                      value={asset.companyAddress}
                      onChange={(e) =>
                        updateAsset(asset.id, {
                          companyAddress: e.target.value,
                        })
                      }
                      multiline
                      minRows={2}
                      sx={textFieldSx}
                    />
                  </Box>
                </Box>

                <Box
                  sx={{
                    display: "grid",
                    gridTemplateColumns: { xs: "1fr", md: "1fr 1fr 1fr" },
                    gap: 2,
                    mt: 2,
                  }}
                >
                  {/* Logo Upload */}
                  <Box>
                    <TextField
                      fullWidth
                      label="Logo URL"
                      value={asset.logoUrl}
                      onChange={(e) =>
                        updateAsset(asset.id, { logoUrl: e.target.value })
                      }
                      disabled
                      sx={textFieldSx}
                    />
                    <Button
                      component="label"
                      size="small"
                      sx={{
                        mt: 1,
                        borderRadius: "10px",
                        border: "1px solid rgba(99, 102, 241, 0.3)",
                        color: "#a5b4fc",
                        backgroundColor: "rgba(99, 102, 241, 0.06)",
                        textTransform: "none",
                        fontWeight: 500,
                        "&:hover": {
                          borderColor: "rgba(99, 102, 241, 0.5)",
                          backgroundColor: "rgba(99, 102, 241, 0.12)",
                        },
                      }}
                      disabled={getUploadStatus(asset.id, "logoUrl")?.state === "uploading"}
                      startIcon={
                        getUploadStatus(asset.id, "logoUrl")?.state === "uploading" ? (
                          <CircularProgress size={14} sx={{ color: "#a5b4fc" }} />
                        ) : undefined
                      }
                    >
                      {getUploadStatus(asset.id, "logoUrl")?.state === "uploading"
                        ? "Uploading..."
                        : "Upload Logo"}
                      <input
                        hidden
                        type="file"
                        accept="image/*"
                        disabled={getUploadStatus(asset.id, "logoUrl")?.state === "uploading"}
                        onChange={(e) =>
                          handleAssetFileUpload(
                            asset.id,
                            "logoUrl",
                            e.target.files?.[0],
                          )
                        }
                      />
                    </Button>
                    {getUploadStatus(asset.id, "logoUrl")?.state === "success" && (
                      <Typography variant="caption" sx={{ color: "#34d399", display: "block", mt: 0.5 }}>
                        {getUploadStatus(asset.id, "logoUrl")?.message}
                      </Typography>
                    )}
                    {getUploadStatus(asset.id, "logoUrl")?.state === "error" && (
                      <Typography variant="caption" sx={{ color: "#f87171", display: "block", mt: 0.5 }}>
                        {getUploadStatus(asset.id, "logoUrl")?.message}
                      </Typography>
                    )}
                  </Box>

                  {/* Stamp Upload */}
                  <Box>
                    <TextField
                      fullWidth
                      label="Stamp URL"
                      value={asset.stampUrl}
                      onChange={(e) =>
                        updateAsset(asset.id, { stampUrl: e.target.value })
                      }
                      disabled
                      sx={textFieldSx}
                    />
                    <Button
                      component="label"
                      size="small"
                      sx={{
                        mt: 1,
                        borderRadius: "10px",
                        border: "1px solid rgba(99, 102, 241, 0.3)",
                        color: "#a5b4fc",
                        backgroundColor: "rgba(99, 102, 241, 0.06)",
                        textTransform: "none",
                        fontWeight: 500,
                        "&:hover": {
                          borderColor: "rgba(99, 102, 241, 0.5)",
                          backgroundColor: "rgba(99, 102, 241, 0.12)",
                        },
                      }}
                      disabled={getUploadStatus(asset.id, "stampUrl")?.state === "uploading"}
                      startIcon={
                        getUploadStatus(asset.id, "stampUrl")?.state === "uploading" ? (
                          <CircularProgress size={14} sx={{ color: "#a5b4fc" }} />
                        ) : undefined
                      }
                    >
                      {getUploadStatus(asset.id, "stampUrl")?.state === "uploading"
                        ? "Uploading..."
                        : "Upload Stamp"}
                      <input
                        hidden
                        type="file"
                        accept="image/*"
                        disabled={getUploadStatus(asset.id, "stampUrl")?.state === "uploading"}
                        onChange={(e) =>
                          handleAssetFileUpload(
                            asset.id,
                            "stampUrl",
                            e.target.files?.[0],
                          )
                        }
                      />
                    </Button>
                    {getUploadStatus(asset.id, "stampUrl")?.state === "success" && (
                      <Typography variant="caption" sx={{ color: "#34d399", display: "block", mt: 0.5 }}>
                        {getUploadStatus(asset.id, "stampUrl")?.message}
                      </Typography>
                    )}
                    {getUploadStatus(asset.id, "stampUrl")?.state === "error" && (
                      <Typography variant="caption" sx={{ color: "#f87171", display: "block", mt: 0.5 }}>
                        {getUploadStatus(asset.id, "stampUrl")?.message}
                      </Typography>
                    )}
                  </Box>

                  {/* Sign Upload */}
                  <Box>
                    <TextField
                      fullWidth
                      label="Signature URL"
                      value={asset.signUrl}
                      onChange={(e) =>
                        updateAsset(asset.id, { signUrl: e.target.value })
                      }
                      disabled
                      sx={textFieldSx}
                    />
                    <Button
                      component="label"
                      size="small"
                      sx={{
                        mt: 1,
                        borderRadius: "10px",
                        border: "1px solid rgba(99, 102, 241, 0.3)",
                        color: "#a5b4fc",
                        backgroundColor: "rgba(99, 102, 241, 0.06)",
                        textTransform: "none",
                        fontWeight: 500,
                        "&:hover": {
                          borderColor: "rgba(99, 102, 241, 0.5)",
                          backgroundColor: "rgba(99, 102, 241, 0.12)",
                        },
                      }}
                      disabled={getUploadStatus(asset.id, "signUrl")?.state === "uploading"}
                      startIcon={
                        getUploadStatus(asset.id, "signUrl")?.state === "uploading" ? (
                          <CircularProgress size={14} sx={{ color: "#a5b4fc" }} />
                        ) : undefined
                      }
                    >
                      {getUploadStatus(asset.id, "signUrl")?.state === "uploading"
                        ? "Uploading..."
                        : "Upload Signature"}
                      <input
                        hidden
                        type="file"
                        accept="image/*"
                        disabled={getUploadStatus(asset.id, "signUrl")?.state === "uploading"}
                        onChange={(e) =>
                          handleAssetFileUpload(
                            asset.id,
                            "signUrl",
                            e.target.files?.[0],
                          )
                        }
                      />
                    </Button>
                    {getUploadStatus(asset.id, "signUrl")?.state === "success" && (
                      <Typography variant="caption" sx={{ color: "#34d399", display: "block", mt: 0.5 }}>
                        {getUploadStatus(asset.id, "signUrl")?.message}
                      </Typography>
                    )}
                    {getUploadStatus(asset.id, "signUrl")?.state === "error" && (
                      <Typography variant="caption" sx={{ color: "#f87171", display: "block", mt: 0.5 }}>
                        {getUploadStatus(asset.id, "signUrl")?.message}
                      </Typography>
                    )}
                  </Box>
                </Box>
              </Paper>
            </Box>
          ))}
        </CardContent>
      </Card>

      {/* Save Button */}
      <Box display="flex" justifyContent="flex-end" mt={3} mb={3}>
        <Button
          variant="contained"
          startIcon={saving ? <CircularProgress size={16} sx={{ color: "#ffffff" }} /> : <Save />}
          onClick={handleSave}
          disabled={saving || anyUploading}
          sx={{
            borderRadius: "12px",
            px: 3.5,
            py: 1.2,
            fontWeight: 600,
            fontSize: "0.95rem",
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
          {saving ? "Saving..." : "Save Settings"}
        </Button>
      </Box>
    </Box>
  );
}
