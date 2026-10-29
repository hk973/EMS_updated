"use client";

import React from "react";
import { Box, Typography, Button } from "@mui/material";
import { Inbox } from "@mui/icons-material";

interface EmptyStateProps {
  title: string;
  description: string;
  icon?: React.ReactNode;
  actionText?: string;
  onAction?: () => void;
}

export default function EmptyState({
  title,
  description,
  icon,
  actionText,
  onAction,
}: EmptyStateProps) {
  return (
    <Box
      sx={{
        py: 8,
        px: 3,
        textAlign: "center",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Box
        sx={{
          width: 64,
          height: 64,
          borderRadius: "18px",
          background: "rgba(99, 102, 241, 0.08)",
          border: "1px solid rgba(99, 102, 241, 0.2)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#818cf8",
          mb: 2,
          boxShadow: "0 8px 24px rgba(0, 0, 0, 0.25)",
        }}
      >
        {icon || <Inbox sx={{ fontSize: 32 }} />}
      </Box>

      <Typography
        variant="h6"
        sx={{
          fontWeight: 700,
          fontSize: "1.05rem",
          color: "#f8fafc",
          letterSpacing: "-0.01em",
          mb: 0.5,
        }}
      >
        {title}
      </Typography>

      <Typography
        variant="body2"
        sx={{
          color: "#64748b",
          maxWidth: 380,
          lineHeight: 1.5,
          mb: actionText ? 2.5 : 0,
        }}
      >
        {description}
      </Typography>

      {actionText && onAction && (
        <Button
          variant="contained"
          size="small"
          onClick={onAction}
          sx={{
            background: "linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)",
            color: "#ffffff",
            fontWeight: 600,
            fontSize: "0.82rem",
            textTransform: "none",
            borderRadius: "10px",
            px: 2.5,
            py: 0.8,
            boxShadow: "0 4px 14px rgba(99, 102, 241, 0.35)",
            border: "1px solid rgba(255, 255, 255, 0.15)",
            "&:hover": {
              background: "linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)",
            },
          }}
        >
          {actionText}
        </Button>
      )}
    </Box>
  );
}
