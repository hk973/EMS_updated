"use client";

import React, { useState, useEffect, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  Dialog,
  Box,
  Typography,
  TextField,
  InputAdornment,
  Chip,
  Divider,
} from "@mui/material";
import {
  Search,
  Dashboard as DashboardIcon,
  People,
  SupervisorAccount,
  Schedule,
  EventAvailable,
  AttachMoney,
  Receipt,
  Backup,
  Settings,
  Person,
  Add,
  FileUpload,
  AccountBalanceWallet,
} from "@mui/icons-material";
import { collection, getDocs, query, where, limit } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";

interface CommandItem {
  id: string;
  category: "Navigation" | "Quick Action" | "Employee";
  title: string;
  subtitle?: string;
  icon: React.ReactNode;
  action: () => void;
}

interface CommandMenuProps {
  open: boolean;
  onClose: () => void;
}

export default function CommandMenu({ open, onClose }: CommandMenuProps) {
  const router = useRouter();
  const { currentUser } = useAuth();
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [employees, setEmployees] = useState<any[]>([]);
  const listRef = useRef<HTMLDivElement>(null);

  // Fetch quick employee search pool
  useEffect(() => {
    if (!open || !currentUser?.uid) return;

    const fetchEmployees = async () => {
      try {
        const companyId =
          currentUser.role === "admin"
            ? currentUser.uid
            : currentUser.companyId || "";
        if (!companyId) return;

        const q = query(
          collection(db, "employees"),
          where("companyId", "==", companyId),
          limit(50),
        );
        const snap = await getDocs(q);
        const data = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        setEmployees(data);
      } catch (err) {
        console.warn("Could not fetch employees for command menu:", err);
      }
    };

    fetchEmployees();
  }, [open, currentUser]);

  // Static navigation and actions
  const defaultCommands: CommandItem[] = useMemo(() => {
    const list: CommandItem[] = [
      {
        id: "nav-dashboard",
        category: "Navigation",
        title: "Intelligence & BI Dashboard",
        subtitle: "Real-time analytics and workforce overview",
        icon: <DashboardIcon sx={{ color: "#818cf8", fontSize: 20 }} />,
        action: () => {
          router.push("/dashboard");
          onClose();
        },
      },
      {
        id: "nav-employees",
        category: "Navigation",
        title: "Employee Directory",
        subtitle: "Manage staff, custom fields & documentation",
        icon: <People sx={{ color: "#38bdf8", fontSize: 20 }} />,
        action: () => {
          router.push("/employees");
          onClose();
        },
      },
      {
        id: "nav-managers",
        category: "Navigation",
        title: "Manager Directory",
        subtitle: "Leadership assignments & authorizations",
        icon: <SupervisorAccount sx={{ color: "#34d399", fontSize: 20 }} />,
        action: () => {
          router.push("/managers");
          onClose();
        },
      },
      {
        id: "nav-attendance",
        category: "Navigation",
        title: "Attendance Manager",
        subtitle: "Daily logs, bulk markings & period tracking",
        icon: <Schedule sx={{ color: "#f59e0b", fontSize: 20 }} />,
        action: () => {
          router.push("/attendance");
          onClose();
        },
      },
      {
        id: "nav-salary",
        category: "Navigation",
        title: "Salary Structures & CTC",
        subtitle: "Components, allowances, deductions & templates",
        icon: <AttachMoney sx={{ color: "#10b981", fontSize: 20 }} />,
        action: () => {
          router.push("/salary");
          onClose();
        },
      },
      {
        id: "nav-salary-slip",
        category: "Navigation",
        title: "Salary Slips & PDF Generation",
        subtitle: "Branded payslips & period downloads",
        icon: <Receipt sx={{ color: "#a78bfa", fontSize: 20 }} />,
        action: () => {
          router.push("/salary-slip");
          onClose();
        },
      },
      {
        id: "nav-leave",
        category: "Navigation",
        title: "Leave Management",
        subtitle: "Applications, balances & public holidays",
        icon: <EventAvailable sx={{ color: "#ec4899", fontSize: 20 }} />,
        action: () => {
          router.push("/leave-management");
          onClose();
        },
      },
      {
        id: "nav-settings",
        category: "Navigation",
        title: "Company Settings",
        subtitle: "Branding, profile & portal configuration",
        icon: <Settings sx={{ color: "#94a3b8", fontSize: 20 }} />,
        action: () => {
          router.push("/settings");
          onClose();
        },
      },
      {
        id: "action-add-emp",
        category: "Quick Action",
        title: "Add New Employee",
        subtitle: "Open employee onboarding form",
        icon: <Add sx={{ color: "#6366f1", fontSize: 20 }} />,
        action: () => {
          router.push("/employees");
          onClose();
        },
      },
      {
        id: "action-payroll",
        category: "Quick Action",
        title: "Process Monthly Payroll",
        subtitle: "Compute salary disbursements and attendance",
        icon: <AccountBalanceWallet sx={{ color: "#10b981", fontSize: 20 }} />,
        action: () => {
          router.push("/payroll");
          onClose();
        },
      },
    ];

    if (currentUser?.role === "admin") {
      list.push({
        id: "nav-backup",
        category: "Navigation",
        title: "Backup & Recovery",
        subtitle: "Company snapshots and JSON export",
        icon: <Backup sx={{ color: "#60a5fa", fontSize: 20 }} />,
        action: () => {
          router.push("/backup");
          onClose();
        },
      });
    }

    return list;
  }, [currentUser, router, onClose]);

  // Combine static commands with dynamically matched employees
  const filteredItems = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    const staticMatches = defaultCommands.filter(
      (c) =>
        c.title.toLowerCase().includes(term) ||
        c.subtitle?.toLowerCase().includes(term) ||
        c.category.toLowerCase().includes(term),
    );

    if (!term) return staticMatches;

    // Filter employees
    const matchedEmps = employees
      .filter((emp) => {
        const name = (emp.fullName || "").toLowerCase();
        const email = (emp.email || "").toLowerCase();
        const empId = (emp.employeeId || "").toLowerCase();
        const dept = (emp.department || "").toLowerCase();
        return (
          name.includes(term) ||
          email.includes(term) ||
          empId.includes(term) ||
          dept.includes(term)
        );
      })
      .map((emp) => ({
        id: `emp-${emp.id}`,
        category: "Employee" as const,
        title: emp.fullName || "Unnamed Employee",
        subtitle: `${emp.employeeId ? `ID: ${emp.employeeId} • ` : ""}${emp.department || "Operations"} • ${emp.email || ""}`,
        icon: (
          <Box
            sx={{
              width: 24,
              height: 24,
              borderRadius: "50%",
              background: "linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "0.7rem",
              fontWeight: 700,
              color: "#fff",
            }}
          >
            {(emp.fullName || "E").charAt(0).toUpperCase()}
          </Box>
        ),
        action: () => {
          router.push(`/employees?search=${encodeURIComponent(emp.fullName || "")}`);
          onClose();
        },
      }));

    return [...matchedEmps, ...staticMatches];
  }, [searchTerm, defaultCommands, employees, router, onClose]);

  // Reset index when search term changes
  useEffect(() => {
    setSelectedIndex(0);
  }, [searchTerm]);

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((prev) =>
        prev < filteredItems.length - 1 ? prev + 1 : 0,
      );
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((prev) =>
        prev > 0 ? prev - 1 : filteredItems.length - 1,
      );
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (filteredItems[selectedIndex]) {
        filteredItems[selectedIndex].action();
      }
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="sm"
      fullWidth
      PaperProps={{
        sx: {
          background: "rgba(11, 15, 23, 0.94)",
          backdropFilter: "blur(28px)",
          WebkitBackdropFilter: "blur(28px)",
          border: "1px solid rgba(255, 255, 255, 0.12)",
          borderRadius: "20px",
          boxShadow: "0 25px 70px rgba(0, 0, 0, 0.7), 0 0 35px rgba(99, 102, 241, 0.2)",
          color: "#f8fafc",
          overflow: "hidden",
          m: 2,
        },
      }}
    >
      {/* Top Search Field */}
      <Box sx={{ p: 2, borderBottom: "1px solid rgba(255, 255, 255, 0.08)" }}>
        <TextField
          autoFocus
          fullWidth
          variant="standard"
          placeholder="Type a command, page, or employee name..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          onKeyDown={handleKeyDown}
          InputProps={{
            disableUnderline: true,
            startAdornment: (
              <InputAdornment position="start">
                <Search sx={{ color: "#818cf8", fontSize: 22, mr: 0.5 }} />
              </InputAdornment>
            ),
            endAdornment: (
              <InputAdornment position="end">
                <Chip
                  label="ESC"
                  size="small"
                  onClick={onClose}
                  sx={{
                    background: "rgba(255, 255, 255, 0.08)",
                    color: "#94a3b8",
                    fontSize: "0.68rem",
                    fontWeight: 600,
                    height: 20,
                    cursor: "pointer",
                  }}
                />
              </InputAdornment>
            ),
            sx: {
              color: "#f8fafc",
              fontSize: "1.05rem",
              fontWeight: 500,
            },
          }}
        />
      </Box>

      {/* Results List */}
      <Box
        ref={listRef}
        sx={{
          maxHeight: 380,
          overflowY: "auto",
          p: 1.5,
          display: "flex",
          flexDirection: "column",
          gap: 0.5,
        }}
      >
        {filteredItems.length === 0 ? (
          <Box sx={{ py: 6, textAlign: "center" }}>
            <Typography sx={{ color: "#64748b", fontSize: "0.9rem" }}>
              No commands or employees matching "{searchTerm}"
            </Typography>
          </Box>
        ) : (
          filteredItems.map((item, index) => {
            const isSelected = index === selectedIndex;
            return (
              <Box
                key={item.id}
                onClick={item.action}
                onMouseEnter={() => setSelectedIndex(index)}
                sx={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  p: 1.2,
                  px: 1.5,
                  borderRadius: "12px",
                  cursor: "pointer",
                  background: isSelected
                    ? "rgba(99, 102, 241, 0.18)"
                    : "transparent",
                  border: isSelected
                    ? "1px solid rgba(99, 102, 241, 0.4)"
                    : "1px solid transparent",
                  transition: "all 0.15s ease",
                }}
              >
                <Box
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    gap: 1.5,
                    minWidth: 0,
                  }}
                >
                  <Box
                    sx={{
                      width: 32,
                      height: 32,
                      borderRadius: "10px",
                      background: "rgba(255, 255, 255, 0.04)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                    }}
                  >
                    {item.icon}
                  </Box>
                  <Box sx={{ minWidth: 0 }}>
                    <Typography
                      sx={{
                        color: isSelected ? "#ffffff" : "#f1f5f9",
                        fontWeight: 600,
                        fontSize: "0.9rem",
                        lineHeight: 1.2,
                      }}
                    >
                      {item.title}
                    </Typography>
                    {item.subtitle && (
                      <Typography
                        noWrap
                        sx={{
                          color: isSelected ? "#cbd5e1" : "#64748b",
                          fontSize: "0.75rem",
                          mt: 0.3,
                        }}
                      >
                        {item.subtitle}
                      </Typography>
                    )}
                  </Box>
                </Box>

                <Chip
                  label={item.category}
                  size="small"
                  sx={{
                    background:
                      item.category === "Employee"
                        ? "rgba(16, 185, 129, 0.15)"
                        : item.category === "Quick Action"
                        ? "rgba(245, 158, 11, 0.15)"
                        : "rgba(255, 255, 255, 0.05)",
                    color:
                      item.category === "Employee"
                        ? "#34d399"
                        : item.category === "Quick Action"
                        ? "#fbbf24"
                        : "#94a3b8",
                    fontSize: "0.68rem",
                    fontWeight: 600,
                    height: 20,
                  }}
                />
              </Box>
            );
          })
        )}
      </Box>

      {/* Footer Helper Hints */}
      <Box
        sx={{
          p: 1.5,
          px: 2,
          background: "rgba(0, 0, 0, 0.3)",
          borderTop: "1px solid rgba(255, 255, 255, 0.06)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          color: "#64748b",
          fontSize: "0.75rem",
        }}
      >
        <Box display="flex" alignItems="center" gap={1.5}>
          <span>↑↓ to navigate</span>
          <span>•</span>
          <span>↵ to execute</span>
          <span>•</span>
          <span>esc to dismiss</span>
        </Box>
        <span>Linear / Raycast Mode</span>
      </Box>
    </Dialog>
  );
}
