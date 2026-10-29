"use client";

import React from "react";
import { Box, Typography } from "@mui/material";

interface StatusDotProps {
  status: string;
  label?: string;
  size?: "small" | "medium";
}

export default function StatusDot({
  status,
  label,
  size = "small",
}: StatusDotProps) {
  const normalized = (status || "").toLowerCase();

  let color = "#10b981"; // Emerald
  let bg = "rgba(16, 185, 129, 0.12)";
  let border = "rgba(16, 185, 129, 0.3)";
  let text = label || "Active";

  if (
    normalized === "inactive" ||
    normalized === "absent" ||
    normalized === "terminated" ||
    normalized === "rejected"
  ) {
    color = "#f43f5e"; // Rose
    bg = "rgba(244, 63, 94, 0.12)";
    border = "rgba(244, 63, 94, 0.3)";
    text = label || "Inactive";
  } else if (
    normalized === "pending" ||
    normalized === "half-day" ||
    normalized === "warning" ||
    normalized.includes("leave")
  ) {
    color = "#f59e0b"; // Amber
    bg = "rgba(245, 158, 11, 0.12)";
    border = "rgba(245, 158, 11, 0.3)";
    text = label || (normalized === "half-day" ? "Half Day" : "Pending");
  } else if (normalized === "draft" || normalized === "unprocessed") {
    color = "#818cf8"; // Indigo
    bg = "rgba(99, 102, 241, 0.12)";
    border = "rgba(99, 102, 241, 0.3)";
    text = label || "Draft";
  }

  const isSmall = size === "small";

  return (
    <Box
      sx={{
        display: "inline-flex",
        alignItems: "center",
        gap: 0.8,
        px: isSmall ? 1.2 : 1.5,
        py: isSmall ? 0.3 : 0.5,
        borderRadius: "999px",
        background: bg,
        border: `1px solid ${border}`,
        width: "fit-content",
      }}
    >
      <Box
        sx={{
          width: isSmall ? 6 : 8,
          height: isSmall ? 6 : 8,
          borderRadius: "50%",
          backgroundColor: color,
          boxShadow: `0 0 8px ${color}`,
          animation: "pulseDot 2.2s infinite ease-in-out",
          flexShrink: 0,
          "@keyframes pulseDot": {
            "0%, 100%": {
              opacity: 1,
              transform: "scale(1)",
            },
            "50%": {
              opacity: 0.5,
              transform: "scale(0.85)",
            },
          },
        }}
      />
      <Typography
        sx={{
          fontSize: isSmall ? "0.72rem" : "0.8rem",
          fontWeight: 600,
          color: color,
          letterSpacing: "0.02em",
          lineHeight: 1,
          textTransform: "capitalize",
        }}
      >
        {text}
      </Typography>
    </Box>
  );
}
