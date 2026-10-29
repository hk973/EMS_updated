"use client";

import React, { createContext, useContext, useState, useCallback } from "react";
import { Box, Typography, IconButton } from "@mui/material";
import {
  CheckCircle,
  Error as ErrorIcon,
  Warning as WarningIcon,
  Info as InfoIcon,
  Close,
} from "@mui/icons-material";

export type ToastType = "success" | "error" | "warning" | "info";

interface ToastItem {
  id: string;
  message: string;
  type: ToastType;
  duration: number;
}

interface ToastContextType {
  showToast: (message: string, type?: ToastType, duration?: number) => void;
}

const ToastContext = createContext<ToastContextType>({
  showToast: () => {},
});

export const useToast = () => useContext(ToastContext);

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback(
    (message: string, type: ToastType = "success", duration: number = 4000) => {
      const id = `toast-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
      setToasts((prev) => [...prev, { id, message, type, duration }]);

      if (duration > 0) {
        setTimeout(() => {
          removeToast(id);
        }, duration);
      }
    },
    [removeToast],
  );

  const getToastColors = (type: ToastType) => {
    switch (type) {
      case "success":
        return {
          icon: <CheckCircle sx={{ color: "#34d399", fontSize: 20 }} />,
          border: "rgba(16, 185, 129, 0.4)",
          glow: "rgba(16, 185, 129, 0.25)",
          accent: "#10b981",
        };
      case "error":
        return {
          icon: <ErrorIcon sx={{ color: "#fb7185", fontSize: 20 }} />,
          border: "rgba(244, 63, 94, 0.4)",
          glow: "rgba(244, 63, 94, 0.25)",
          accent: "#f43f5e",
        };
      case "warning":
        return {
          icon: <WarningIcon sx={{ color: "#fbbf24", fontSize: 20 }} />,
          border: "rgba(245, 158, 11, 0.4)",
          glow: "rgba(245, 158, 11, 0.25)",
          accent: "#f59e0b",
        };
      case "info":
      default:
        return {
          icon: <InfoIcon sx={{ color: "#818cf8", fontSize: 20 }} />,
          border: "rgba(99, 102, 241, 0.4)",
          glow: "rgba(99, 102, 241, 0.25)",
          accent: "#6366f1",
        };
    }
  };

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}

      {/* Floating Glass Toast Notification Stack */}
      <Box
        sx={{
          position: "fixed",
          bottom: 24,
          right: 24,
          zIndex: 9999,
          display: "flex",
          flexDirection: "column",
          gap: 1.5,
          maxWidth: 420,
          width: "calc(100vw - 48px)",
          pointerEvents: "none",
        }}
      >
        {toasts.map((toast) => {
          const { icon, border, glow, accent } = getToastColors(toast.type);

          return (
            <Box
              key={toast.id}
              sx={{
                pointerEvents: "auto",
                background: "rgba(15, 23, 42, 0.94)",
                backdropFilter: "blur(24px)",
                WebkitBackdropFilter: "blur(24px)",
                border: `1px solid ${border}`,
                borderRadius: "14px",
                p: 2,
                boxShadow: `0 12px 35px rgba(0, 0, 0, 0.5), 0 0 20px ${glow}`,
                display: "flex",
                alignItems: "flex-start",
                gap: 1.5,
                position: "relative",
                overflow: "hidden",
                animation: "toastSlideIn 0.35s cubic-bezier(0.16, 1, 0.3, 1)",
                "@keyframes toastSlideIn": {
                  "0%": {
                    opacity: 0,
                    transform: "translateY(20px) scale(0.95)",
                  },
                  "100%": {
                    opacity: 1,
                    transform: "translateY(0) scale(1)",
                  },
                },
                "&::before": {
                  content: '""',
                  position: "absolute",
                  left: 0,
                  top: 0,
                  bottom: 0,
                  width: "3px",
                  backgroundColor: accent,
                },
              }}
            >
              <Box sx={{ mt: "1px", flexShrink: 0 }}>{icon}</Box>
              <Typography
                sx={{
                  flex: 1,
                  fontSize: "0.86rem",
                  color: "#f1f5f9",
                  fontWeight: 500,
                  lineHeight: 1.45,
                  wordBreak: "break-word",
                }}
              >
                {toast.message}
              </Typography>
              <IconButton
                size="small"
                onClick={() => removeToast(toast.id)}
                sx={{
                  color: "#94a3b8",
                  p: 0.5,
                  "&:hover": { color: "#f8fafc" },
                }}
              >
                <Close sx={{ fontSize: 16 }} />
              </IconButton>
            </Box>
          );
        })}
      </Box>
    </ToastContext.Provider>
  );
};
