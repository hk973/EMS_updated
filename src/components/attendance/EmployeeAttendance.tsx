"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  Box,
  Card,
  CardContent,
  Typography,
  CircularProgress,
  Alert,
  Chip,
  IconButton,
  Divider,
} from "@mui/material";
import { ChevronLeft, ChevronRight } from "@mui/icons-material";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import { Attendance } from "@/types";
import { isEmployeeActiveOn, getEmployeeMonthActivity } from "@/lib/employeeStatus";

const dayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function EmployeeAttendance() {
  const { currentUser } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [calendarMonth, setCalendarMonth] = useState<Date>(new Date());
  const [attendanceRecords, setAttendanceRecords] = useState<Attendance[]>([]);
  const [employeeData, setEmployeeData] = useState<any>(null);

  useEffect(() => {
    const loadAttendance = async () => {
      if (!currentUser) {
        setLoading(false);
        setError("Employee identity not found. Please contact administrator.");
        return;
      }

      try {
        setLoading(true);
        setError("");

        const employeeIdentifiers = new Set<string>();

        if (currentUser.employeeId) {
          employeeIdentifiers.add(currentUser.employeeId);

          const employeeDocById = await getDoc(
            doc(db, "employees", currentUser.employeeId),
          );
          if (employeeDocById.exists()) {
            employeeIdentifiers.add(employeeDocById.id);
            setEmployeeData({ id: employeeDocById.id, ...employeeDocById.data() });
          }

          const employeeByEmployeeIdSnapshot = await getDocs(
            query(
              collection(db, "employees"),
              where("employeeId", "==", currentUser.employeeId),
            ),
          );
          employeeByEmployeeIdSnapshot.docs.forEach((employeeDoc) => {
            employeeIdentifiers.add(employeeDoc.id);
          });
        }

        if (currentUser.uid) {
          employeeIdentifiers.add(currentUser.uid);
        }

        if (currentUser.email) {
          const employeeByEmailSnapshot = await getDocs(
            query(
              collection(db, "employees"),
              where("email", "==", currentUser.email),
            ),
          );
          employeeByEmailSnapshot.docs.forEach((employeeDoc) => {
            employeeIdentifiers.add(employeeDoc.id);
          });
        }

        const resolvedIdentifiers =
          Array.from(employeeIdentifiers).filter(Boolean);

        if (resolvedIdentifiers.length === 0) {
          setAttendanceRecords([]);
          setError(
            "Employee identity not found. Please contact administrator.",
          );
          return;
        }

        const attendanceDocs: Record<string, any> = {};

        for (let i = 0; i < resolvedIdentifiers.length; i += 10) {
          const chunk = resolvedIdentifiers.slice(i, i + 10);
          const attendanceQuery =
            chunk.length === 1
              ? query(
                  collection(db, "attendance"),
                  where("employeeId", "==", chunk[0]),
                )
              : query(
                  collection(db, "attendance"),
                  where("employeeId", "in", chunk),
                );

          const attendanceSnapshot = await getDocs(attendanceQuery);
          attendanceSnapshot.docs.forEach((attendanceDoc) => {
            attendanceDocs[attendanceDoc.id] = {
              id: attendanceDoc.id,
              ...attendanceDoc.data(),
            };
          });
        }

        const records = Object.values(attendanceDocs)
          .map((attendanceDoc) => ({
            ...attendanceDoc,
            date:
              attendanceDoc.date?.toDate?.() ||
              attendanceDoc.date ||
              attendanceDoc.markedAt?.toDate?.() ||
              attendanceDoc.markedAt ||
              new Date(),
            createdAt:
              attendanceDoc.createdAt?.toDate?.() ||
              attendanceDoc.markedAt?.toDate?.() ||
              new Date(),
            updatedAt:
              attendanceDoc.updatedAt?.toDate?.() ||
              attendanceDoc.markedAt?.toDate?.() ||
              new Date(),
          }))
          .sort(
            (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
          ) as Attendance[];

        setAttendanceRecords(records);
      } catch (err) {
        console.error("Error loading employee attendance:", err);
        setError("Failed to load attendance.");
      } finally {
        setLoading(false);
      }
    };

    loadAttendance();
  }, [currentUser]);

  const formatDateKey = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  const attendanceByDate = useMemo(
    () =>
      attendanceRecords.reduce(
        (acc, record) => {
          acc[formatDateKey(new Date(record.date))] = record.status;
          return acc;
        },
        {} as Record<string, Attendance["status"]>,
      ),
    [attendanceRecords],
  );

  const activeYear = calendarMonth.getFullYear();
  const activeMonth = calendarMonth.getMonth();

  const activity = useMemo(() => {
    if (!employeeData) return null;
    return getEmployeeMonthActivity(employeeData, activeYear, activeMonth + 1);
  }, [employeeData, activeYear, activeMonth]);

  const firstDayOfMonth = new Date(activeYear, activeMonth, 1);
  const daysInMonth = new Date(activeYear, activeMonth + 1, 0).getDate();
  const leadingEmptyDays = firstDayOfMonth.getDay();
  const totalCells = Math.ceil((leadingEmptyDays + daysInMonth) / 7) * 7;

  const getAttendanceColor = (status?: Attendance["status"] | "inactive") => {
    if (status === "inactive") return "#374151"; // Dark gray for inactive
    if (status === "present") return "#4caf50";
    if (status === "late") return "#ff9800";
    if (status === "half-day") return "#2196f3";
    if (status === "absent") return "#f44336";
    return "transparent";
  };

  const getDayCellStatus = (day: number) => {
    const date = new Date(activeYear, activeMonth, day);
    return attendanceByDate[formatDateKey(date)];
  };

  const prevMonth = () => {
    setCalendarMonth(new Date(activeYear, activeMonth - 1, 1));
  };

  const nextMonth = () => {
    setCalendarMonth(new Date(activeYear, activeMonth + 1, 1));
  };

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

  return (
    <Box>
      <Typography variant="h4" gutterBottom sx={{ color: "#ffffff", mb: 3 }}>
        My Attendance
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      <Card sx={{ backgroundColor: "#2d2d2d", border: "1px solid #333" }}>
        <CardContent>
          <Box
            display="flex"
            alignItems="center"
            justifyContent="space-between"
            mb={2}
          >
            <Typography variant="h6" sx={{ color: "#ffffff" }}>
              Attendance Calendar
            </Typography>
            <Box display="flex" alignItems="center" gap={1}>
              <IconButton size="small" onClick={prevMonth}>
                <ChevronLeft sx={{ color: "#ffffff" }} />
              </IconButton>
              <Typography
                variant="body2"
                sx={{ color: "#ffffff", minWidth: 110, textAlign: "center" }}
              >
                {calendarMonth.toLocaleDateString("en-US", {
                  month: "short",
                  year: "numeric",
                })}
              </Typography>
              <IconButton size="small" onClick={nextMonth}>
                <ChevronRight sx={{ color: "#ffffff" }} />
              </IconButton>
            </Box>
          </Box>

          {!activity?.includeInMonth ? (
            <Box sx={{ py: 4, textAlign: "center" }}>
              <Typography variant="body1" sx={{ color: "#9ca3af" }}>
                You are marked as inactive for this month.
              </Typography>
              {activity?.label && (
                <Typography variant="caption" sx={{ color: "#6b7280" }} display="block" mt={1}>
                  ({activity.label})
                </Typography>
              )}
            </Box>
          ) : (
            <>
              <Box
                sx={{
                  display: "grid",
                  gridTemplateColumns: "repeat(7, 1fr)",
                  gap: 0.7,
                }}
              >
                {dayLabels.map((label) => (
                  <Box
                    key={label}
                    sx={{
                      textAlign: "center",
                      py: 0.5,
                      fontSize: "0.75rem",
                      color: "#9ca3af",
                      fontWeight: 600,
                    }}
                  >
                    {label}
                  </Box>
                ))}

                {Array.from({ length: totalCells }, (_, index) => {
                  const dayNumber = index - leadingEmptyDays + 1;
                  const inMonth = dayNumber > 0 && dayNumber <= daysInMonth;
                  const date = inMonth ? new Date(activeYear, activeMonth, dayNumber) : null;
                  const isActive = (inMonth && date && employeeData) ? isEmployeeActiveOn(employeeData, date) : true;
                  const status = inMonth ? getDayCellStatus(dayNumber) : undefined;
                  const finalStatus = !isActive ? "inactive" : status;

                  return (
                    <Box
                      key={`day-${index}`}
                      sx={{
                        height: 36,
                        borderRadius: 1,
                        border: "1px solid #3b3b3b",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        color: inMonth ? (isActive ? "#ffffff" : "#9ca3af") : "#6b7280",
                        fontSize: "0.8rem",
                        backgroundColor: inMonth
                          ? getAttendanceColor(finalStatus as any)
                          : "#262626",
                        opacity: inMonth ? 1 : 0.4,
                      }}
                    >
                      {inMonth ? dayNumber : ""}
                    </Box>
                  );
                })}
              </Box>

              <Box display="flex" flexWrap="wrap" gap={1} mt={2}>
                <Chip
                  size="small"
                  sx={{ backgroundColor: "#4caf50", color: "#fff" }}
                  label="Present"
                />
                <Chip
                  size="small"
                  sx={{ backgroundColor: "#ff9800", color: "#fff" }}
                  label="Late"
                />
                <Chip
                  size="small"
                  sx={{ backgroundColor: "#2196f3", color: "#fff" }}
                  label="Half-day"
                />
                <Chip
                  size="small"
                  sx={{ backgroundColor: "#f44336", color: "#fff" }}
                  label="Absent"
                />
                <Chip
                  size="small"
                  sx={{ backgroundColor: "#374151", color: "#fff" }}
                  label="Inactive"
                />
              </Box>

              <Divider sx={{ my: 2, borderColor: "#444" }} />

              <Typography variant="subtitle2" sx={{ color: "#ffffff", mb: 1 }}>
                Recent Attendance
              </Typography>
              <Box>
                {attendanceRecords.slice(0, 5).map((record) => (
                  <Box
                    key={record.id}
                    display="flex"
                    justifyContent="space-between"
                    alignItems="center"
                    py={0.8}
                    borderBottom="1px solid #3a3a3a"
                  >
                    <Typography variant="body2" sx={{ color: "#ffffff" }}>
                      {new Date(record.date).toLocaleDateString()}
                    </Typography>
                    <Chip
                      size="small"
                      label={record.status}
                      sx={{
                        backgroundColor: getAttendanceColor(record.status),
                        color: "#ffffff",
                      }}
                    />
                  </Box>
                ))}
                {attendanceRecords.length === 0 && (
                  <Typography variant="body2" sx={{ color: "#9ca3af" }}>
                    No attendance records found.
                  </Typography>
                )}
              </Box>
            </>
          )}
        </CardContent>
      </Card>
    </Box>
  );
}
