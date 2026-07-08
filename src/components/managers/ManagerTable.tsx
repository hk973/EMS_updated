"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  Box,
  Typography,
  Button,
  TextField,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  IconButton,
  TablePagination,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  CircularProgress,
  Tooltip,
  Chip,
} from "@mui/material";
import {
  Add,
  Edit,
  Delete,
  Search,
  FileUpload,
  FileDownload,
} from "@mui/icons-material";
import {
  collection,
  getDocs,
  getDoc,
  doc,
  deleteDoc,
  query,
  where,
  updateDoc,
  addDoc,
  writeBatch,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Manager, TableColumn } from "@/types";
import { useAuth } from "@/contexts/AuthContext";
import DeletePasswordDialog from "@/components/shared/DeletePasswordDialog";
import ManagerForm from "./ManagerForm";
import * as XLSX from "xlsx";
import { generateUserId } from "@/lib/utils";

const defaultColumns: TableColumn[] = [
  {
    id: "1",
    field: "fullName",
    headerName: "Full Name",
    width: 220,
    sortable: true,
    filterable: true,
    visible: true,
    order: 1,
  },
  {
    id: "2",
    field: "managerId",
    headerName: "Manager ID",
    width: 180,
    sortable: true,
    filterable: true,
    visible: true,
    order: 2,
  },
  {
    id: "3",
    field: "email",
    headerName: "Email",
    width: 250,
    sortable: true,
    filterable: true,
    visible: true,
    order: 3,
  },
  {
    id: "4",
    field: "status",
    headerName: "Status",
    width: 120,
    sortable: true,
    filterable: true,
    visible: true,
    order: 4,
  },
];

export default function ManagerTable() {
  const { currentUser } = useAuth();
  const [managers, setManagers] = useState<Manager[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [showForm, setShowForm] = useState(false);
  const [editingManager, setEditingManager] = useState<Manager | null>(null);
  const [columns, setColumns] = useState<TableColumn[]>(defaultColumns);
  const [showAssignDialog, setShowAssignDialog] = useState(false);
  const [selectedManager, setSelectedManager] = useState<string>("");
  const [assignmentFile, setAssignmentFile] = useState<File | null>(null);
  const [assignLoading, setAssignLoading] = useState(false);
  const isAssigningRef = useRef(false);
  const [assignMode, setAssignMode] = useState<"bulk" | "single">("bulk");
  const [employees, setEmployees] = useState<{ id: string; employeeId: string; fullName: string }[]>([]);
  const [selectedEmployee, setSelectedEmployee] = useState<string>("");
  // Delete password dialog state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [managerToDelete, setManagerToDelete] = useState<Manager | null>(null);

  useEffect(() => {
    if (currentUser?.uid) {
      loadManagers();
    }
  }, [currentUser?.uid]);

  const handleExportCSV = () => {
    const headers = columns
      .filter((col: TableColumn) => col.visible && col.field !== "actions")
      .map((col: TableColumn) => col.headerName);
    const csvData = [
      headers.join(","),
      ...filteredManagers.map((manager: Manager) =>
        columns
          .filter((col: TableColumn) => col.visible && col.field !== "actions")
          .map((col: TableColumn) => getFieldValue(manager, col.field))
          .join(","),
      ),
    ].join("\n");

    const blob = new Blob([csvData], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "managers.csv";
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const handleExportXLSX = () => {
    const allFields = new Set<string>();
    managers.forEach((manager: Manager) =>
      Object.keys(manager).forEach((key: string) => allFields.add(key)),
    );
    const fields = Array.from(allFields);
    const data = managers.map((manager: Manager) => {
      const row: Record<string, any> = {};
      fields.forEach((field: string) => {
        row[field] = manager[field] !== undefined ? manager[field] : "";
      });
      return row;
    });
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Managers");
    XLSX.writeFile(wb, "managers.xlsx");
  };

  const loadManagers = async () => {
    try {
      setLoading(true);
      const managersQuery = query(
        collection(db, "managers"),
        where("companyId", "==", currentUser?.uid), // Filter by current admin's company
      );
      const querySnapshot = await getDocs(managersQuery);
      const managersData: Manager[] = [];
      querySnapshot.forEach((doc) => {
        managersData.push({
          id: doc.id,
          ...doc.data(),
          createdAt: doc.data().createdAt?.toDate(),
          updatedAt: doc.data().updatedAt?.toDate(),
        } as Manager);
      });
      setManagers(managersData);

      // Generate auto-detected columns from manager data
      generateAutoDetectedColumns(managersData);
    } catch (error) {
      console.error("Error loading managers:", error);
    } finally {
      setLoading(false);
    }
  };

  const generateAutoDetectedColumns = (managersData: Manager[]) => {
    console.log("Generating auto-detected columns...");

    // Get current custom columns to preserve them
    const customColumns = columns.filter(
      (col) =>
        col.isCustom &&
        !defaultColumns.some((defCol) => defCol.field === col.field),
    );
    console.log("Existing custom columns:", customColumns);

    // Collect all unique field names from manager data
    const allFields = new Set<string>();
    const ignoredFields = [
      "id",
      "fullName",
      "managerId",
      "email",
      "status",
      "companyId",
      "createdAt",
      "updatedAt",
      "payslipBranding",
      "managerDeletePassword",
      "employeeDeletePassword",
    ];

    managersData.forEach((manager) => {
      Object.keys(manager).forEach((key) => {
        // Check if the field should be ignored
        if (
          !ignoredFields.includes(key) &&
          !customColumns.some(
            (col) =>
              col.field === key ||
              col.field === key.replace(/\s+/g, "") ||
              col.field === key.replace(/\s+/g, "_"),
          )
        ) {
          // For fields with spaces, store them in their original format
          allFields.add(key);
        }
      });
    });
    console.log("Detected fields:", Array.from(allFields));

    // Create auto-detected columns
    const autoDetectedColumns = Array.from(allFields).map((field, index) => ({
      id: `auto-${field}`,
      field: field,
      headerName: field,
      width: 150,
      sortable: true,
      filterable: true,
      visible: true,
      order: defaultColumns.length + customColumns.length + index + 1,
      isAutoDetected: true,
    }));

    // Add actions column at the end
    const actionsColumn: TableColumn = {
      id: "actions",
      field: "actions",
      headerName: "Actions",
      width: 120,
      sortable: false,
      filterable: false,
      visible: true,
      order: defaultColumns.length + autoDetectedColumns.length + 1,
    };

    setColumns([...defaultColumns, ...autoDetectedColumns, actionsColumn]);
  };
  const filteredManagers = managers.filter(
    (manager) =>
      manager.fullName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      manager.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      manager.managerId?.toLowerCase().includes(searchTerm.toLowerCase()),
  );

  const getFieldValue = (manager: Manager, field: string) => {
    if (field === "actions") return null;
    if (field === "status") return manager.status || "active";
    // Handle nested object properties if needed in future
    if (field.includes(".")) {
      const keys = field.split(".");
      let value = manager;
      for (const key of keys) {
        if (value && typeof value === "object" && key in value) {
          value = value[key];
        } else {
          return "";
        }
      }
      return value || "";
    }
    // Handle Firestore timestamp objects
    const value = manager[field];
    if (
      value &&
      typeof value === "object" &&
      "seconds" in value &&
      "nanoseconds" in value
    ) {
      const date = new Date(value.seconds * 1000);
      return date.toLocaleDateString();
    }
    return value || "";
  };

  const handleDelete = (managerId: string) => {
    const mgr = managers.find((m) => m.id === managerId);
    if (!mgr) return;
    // If no password set, confirm with simple dialog
    if (!mgr.managerDeletePassword) {
      if (!window.confirm(
        "Are you sure you want to delete this manager?\n\nThis will permanently delete:\n• All assigned employees\n• All their attendance records\n• All their payroll records\n• All their salary slips\n• All their notifications\n\nThis action cannot be undone.",
      )) return;
      void executeManagerDelete(managerId);
      return;
    }
    // Password is set — open the password dialog
    setManagerToDelete(mgr);
    setDeleteDialogOpen(true);
  };

  const executeManagerDelete = async (managerId: string) => {
    try {
      // 1. Collect all employee doc IDs assigned to this manager
      const [byManagerField, byManagersArray] = await Promise.all([
        getDocs(query(collection(db, "employees"), where("assignedManager", "==", managerId))),
        getDocs(query(collection(db, "employees"), where("assignedManagers", "array-contains", managerId))),
      ]);

      const employeeDocIds = new Set<string>();
      byManagerField.docs.forEach((d) => employeeDocIds.add(d.id));
      byManagersArray.docs.forEach((d) => employeeDocIds.add(d.id));

      const empIds = Array.from(employeeDocIds);

      // Helper: fetch and delete all docs matching a query in batches of 500
      const deleteByQuery = async (col: string, field: string, value: string) => {
        const snap = await getDocs(query(collection(db, col), where(field, "==", value)));
        if (snap.empty) return;
        const BATCH_SIZE = 500;
        for (let i = 0; i < snap.docs.length; i += BATCH_SIZE) {
          const batch = writeBatch(db);
          snap.docs.slice(i, i + BATCH_SIZE).forEach((d) => batch.delete(d.ref));
          await batch.commit();
        }
      };

      // 2. For each employee, delete all linked records in parallel
      await Promise.all(
        empIds.map(async (empDocId) => {
          await Promise.all([
            deleteByQuery("attendance",   "employeeId", empDocId),
            deleteByQuery("payroll",      "employeeId", empDocId),
            deleteByQuery("salary_slips", "employeeId", empDocId),
            deleteByQuery("notifications","userId",     empDocId),
          ]);
          await deleteDoc(doc(db, "employees", empDocId));
        })
      );

      // 3. Delete the manager doc
      await deleteDoc(doc(db, "managers", managerId));
      setManagers(managers.filter((m) => m.id !== managerId));
      setDeleteDialogOpen(false);
      setManagerToDelete(null);

      alert(`Manager and ${empIds.length} employee(s) with all their records have been deleted.`);
    } catch (error) {
      console.error("Error deleting manager:", error);
      alert("Error deleting manager: " + (error as Error).message);
      throw error; // rethrow so dialog shows error
    }
  };

  const handleStatusToggle = async (
    managerId: string,
    currentStatus: string,
  ) => {
    try {
      const newStatus = currentStatus === "active" ? "inactive" : "active";
      await updateDoc(doc(db, "managers", managerId), {
        status: newStatus,
        updatedAt: new Date(),
      });

      setManagers(
        managers.map((manager) =>
          manager.id === managerId
            ? {
                ...manager,
                status: newStatus as "active" | "inactive" | "suspended",
              }
            : manager,
        ),
      );
    } catch (error) {
      console.error("Error updating manager status:", error);
    }
  };

  const downloadAssignmentSample = () => {
    const sampleData = [
      {
        "Full Name": "John Doe",
        Email: "john.doe@company.com",
        Mobile: "1234567890",
        "Father Name": "Raj Doe",
        Designation: "Developer",
        "D.O.B": "1997-05-10",
        "D.O.J": "2024-01-15",
        "EPF No": "EPF12345",
        "UAN No": "100200300400",
        ESIC: "ESIC90001",
        "HQ Location": "Pune",
        Department: "IT",
      },
      {
        "Full Name": "Jane Smith",
        Email: "jane.smith@company.com",
        Mobile: "0987654321",
        "Father Name": "Anil Smith",
        Designation: "HR Manager",
        "D.O.B": "1995-09-20",
        "D.O.J": "2024-02-01",
        "EPF No": "EPF54321",
        "UAN No": "400300200100",
        ESIC: "ESIC90002",
        "HQ Location": "Mumbai",
        Department: "HR",
      },
    ];

    const worksheet = XLSX.utils.json_to_sheet(sampleData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Employee Assignments");
    XLSX.writeFile(workbook, "employee_assignment_sample.xlsx");
  };

  const handleAssignEmployees = async () => {
    // Prevent concurrent submissions (e.g. rapid double-clicks)
    if (isAssigningRef.current) return;

    if (!assignmentFile || !selectedManager) {
      alert("Please select both a file and a manager");
      return;
    }

    isAssigningRef.current = true;
    setAssignLoading(true);

    try {
      if (!currentUser?.uid) {
        alert("Current company information is unavailable. Please try again.");
        return;
      }

      const companyDoc = await getDoc(doc(db, "companies", currentUser.uid));
      const companyData = companyDoc.exists() ? companyDoc.data() : null;
      const companyName =
        companyData?.companyName ||
        companyData?.name ||
        companyData?.adminName ||
        "";
      const selectedManagerData = managers.find(
        (manager) => manager.id === selectedManager,
      );
      const selectedManagerName =
        selectedManagerData?.fullName || "Unknown Manager";

      const reader = new FileReader();

      reader.onload = async (e) => {
        try {
          const data = e.target?.result;
          const workbook = XLSX.read(data, { type: "binary" });
          const sheetName = workbook.SheetNames[0];
          const sheet = workbook.Sheets[sheetName];
          const rows: any[] = XLSX.utils.sheet_to_json(sheet);

          if (rows.length === 0) {
            alert("No data found in the uploaded file");
            return;
          }

          const employeesRef = collection(db, "employees");
          const updateBatch: Promise<void>[] = [];
          const createdEmployees: string[] = [];
          const skippedDuplicates: string[] = [];
          const failedAssignments: string[] = [];

          for (const row of rows) {
            if (!row["Full Name"] || !row["Email"]) {
              failedAssignments.push(
                `Row skipped — missing Full Name or Email: ${JSON.stringify(row)}`,
              );
              continue;
            }

            const emailNormalized = String(row["Email"]).trim().toLowerCase();

            try {
              // Check if employee already exists in this company
              const employeeQuery = query(
                employeesRef,
                where("email", "==", emailNormalized),
                where("companyId", "==", currentUser?.uid),
              );
              const employeeSnapshot = await getDocs(employeeQuery);

              if (employeeSnapshot.empty) {
                // New employee — create and assign
                const employeeData = {
                  employeeId: generateUserId("EMP"),
                  externalEmployeeId: row["Employee ID"] || "",
                  fullName: String(row["Full Name"]).trim(),
                  email: emailNormalized,
                  mobile: row["Mobile"] || "",
                  salary: {
                    basic: 0,
                    da: 0,
                    customAllowances: [],
                    customBonuses: [],
                    customDeductions: [],
                    bonuses: {},
                    deductions: {},
                  },
                  fatherName: row["Father Name"] || "",
                  designation: row["Designation"] || row["Position"] || "",
                  dob: row["D.O.B"] || row["DOB"] || "",
                  epfNo: row["EPF No"] || "",
                  uan: row["UAN No"] || row["UAN"] || "",
                  esicNo: row["ESIC"] || row["ESIC No"] || "",
                  hqLocation: row["HQ Location"] || "",
                  department: row["Department"] || "",
                  joinDate: row["D.O.J"] || row["DOJ"] || row["Join Date"] || "",
                  companyId: currentUser?.uid,
                  companyName,
                  status: "active",
                  assignedManagers: [selectedManager],
                  assignedManager: selectedManager,
                  managerNames: selectedManagerName,
                  createdAt: new Date(),
                  updatedAt: new Date(),
                };

                await addDoc(employeesRef, employeeData);
                createdEmployees.push(emailNormalized);
              } else {
                // Employee already exists — check if already assigned to this manager
                const employeeDoc = employeeSnapshot.docs[0];
                const existingData = employeeDoc.data();
                const currentManagers: string[] = existingData.assignedManagers || [];

                if (currentManagers.includes(selectedManager)) {
                  // Already assigned to this exact manager — skip silently
                  skippedDuplicates.push(
                    `${row["Full Name"]} (${emailNormalized})`,
                  );
                } else {
                  // Assigned to a different manager — update assignment
                  updateBatch.push(
                    updateDoc(doc(employeesRef, employeeDoc.id), {
                      assignedManagers: [selectedManager],
                      assignedManager: selectedManager,
                      managerNames: selectedManagerName,
                      companyId: currentUser?.uid,
                      companyName,
                      updatedAt: new Date(),
                    }),
                  );
                  createdEmployees.push(emailNormalized); // count as processed
                }
              }
            } catch (err) {
              console.error("Error processing row:", row["Email"], err);
              failedAssignments.push(
                `Error processing: ${row["Full Name"]} (${emailNormalized})`,
              );
            }
          }

          if (updateBatch.length > 0) {
            await Promise.all(updateBatch);
          }

          // Build result summary
          const lines: string[] = [];
          if (createdEmployees.length > 0) {
            lines.push(`✅ ${createdEmployees.length} employee(s) assigned successfully.`);
          }
          if (skippedDuplicates.length > 0) {
            lines.push(
              `⚠️ ${skippedDuplicates.length} employee(s) already assigned to this manager and were skipped:\n  • ${skippedDuplicates.join("\n  • ")}`,
            );
          }
          if (failedAssignments.length > 0) {
            lines.push(
              `❌ ${failedAssignments.length} row(s) failed:\n  • ${failedAssignments.join("\n  • ")}`,
            );
          }

          alert(lines.length > 0 ? lines.join("\n\n") : "No employees were processed.");

          if (createdEmployees.length > 0) {
            setShowAssignDialog(false);
            setSelectedManager("");
            setAssignmentFile(null);
          }
        } catch (err) {
          console.error("Error processing file:", err);
          alert("Error processing file. Please make sure the file format is correct.");
        } finally {
          setAssignLoading(false);
          isAssigningRef.current = false;
        }
      };

      reader.onerror = () => {
        setAssignLoading(false);
        isAssigningRef.current = false;
        alert("Error reading the uploaded file. Please try again.");
      };

      reader.readAsBinaryString(assignmentFile);
    } catch (error) {
      console.error("Error assigning employees:", error);
      alert("Error assigning employees. Please try again.");
      setAssignLoading(false);
      isAssigningRef.current = false;
    }
  };

  const getStatusColor = (status?: string) => {
    switch (status) {
      case "active":
        return "success";
      case "inactive":
        return "error";
      case "suspended":
        return "warning";
      default:
        return "default";
    }
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
    <Box sx={{ p: 3 }}>
      {/* Header */}
      <Box sx={{ mb: 3 }}>
        <Typography
          variant="h4"
          sx={{ color: "#2196f3", fontWeight: 600, mb: 1 }}
        >
          Manager Management
        </Typography>
        <Typography variant="body1" color="text.secondary">
          Add, view, and manage system managers
        </Typography>
      </Box>

      {/* Action Buttons */}
      <Box sx={{ mb: 3, display: "flex", gap: 2, flexWrap: "wrap" }}>
        <Button
          variant="contained"
          startIcon={<Add />}
          onClick={() => setShowForm(true)}
          sx={{
            backgroundColor: "#2196f3",
            "&:hover": { backgroundColor: "#1976d2" },
          }}
        >
          ADD MANAGER
        </Button>
        <Button
          variant="contained"
          startIcon={<FileDownload />}
          onClick={handleExportCSV}
          sx={{
            backgroundColor: "#4caf50",
            "&:hover": { backgroundColor: "#388e3c" },
          }}
        >
          EXPORT CSV
        </Button>
        <Button
          variant="contained"
          startIcon={<FileDownload />}
          onClick={handleExportXLSX}
          sx={{
            backgroundColor: "#4caf50",
            "&:hover": { backgroundColor: "#388e3c" },
          }}
        >
          EXPORT XLSX
        </Button>
        <Button
          variant="contained"
          startIcon={<Add />}
          onClick={() => setShowAssignDialog(true)}
          sx={{
            backgroundColor: "#ff9800",
            "&:hover": { backgroundColor: "#f57c00" },
          }}
        >
          ASSIGN EMPLOYEES
        </Button>
      </Box>

      {/* Search Bar */}
      <Box sx={{ mb: 3 }}>
        <TextField
          fullWidth
          placeholder="Search by Name, Email, or Manager ID"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          InputProps={{
            startAdornment: <Search sx={{ mr: 1, color: "text.secondary" }} />,
          }}
          sx={{
            "& .MuiOutlinedInput-root": {
              borderRadius: 2,
            },
          }}
        />
      </Box>

      {/* Manager Table */}
      <Box sx={{ overflowX: "auto", maxWidth: "100%" }}>
        <TableContainer
          component={Paper}
          sx={{ backgroundColor: "#2d2d2d", border: "1px solid #333" }}
        >
          <Table>
            <TableHead>
              <TableRow sx={{ backgroundColor: "#1e1e1e" }}>
                {columns
                  .filter((col) => col.visible)
                  .map((column) => (
                    <TableCell
                      key={column.id}
                      sx={{
                        fontWeight: 600,
                        color: "#ffffff",
                        borderBottom: "2px solid #333",
                        width: column.width,
                        ...(column.field === "actions" && {
                          position: "sticky",
                          right: 0,
                          zIndex: 2,
                          backgroundColor: "#1e1e1e",
                          borderLeft: "2px solid #333",
                        }),
                      }}
                    >
                      {column.headerName}
                    </TableCell>
                  ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {filteredManagers
                .slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage)
                .map((manager) => (
                  <TableRow
                    key={manager.id}
                    sx={{ "&:hover": { backgroundColor: "#3d3d3d" } }}
                  >
                    {columns
                      .filter((col) => col.visible)
                      .map((column) => (
                        <TableCell
                          key={column.id}
                          sx={{
                            borderBottom: "1px solid #333",
                            color: "#ffffff",
                            ...(column.field === "actions" && {
                              position: "sticky",
                              right: 0,
                              zIndex: 2,
                              backgroundColor: "#2d2d2d",
                              borderLeft: "2px solid #333",
                            }),
                          }}
                        >
                          {column.field === "actions" ? (
                            <Box sx={{ display: "flex", gap: 1 }}>
                              <Tooltip title="Edit Manager">
                                <IconButton
                                  size="small"
                                  sx={{ color: "#2196f3" }}
                                  onClick={() => {
                                    setEditingManager(manager);
                                    setShowForm(true);
                                  }}
                                >
                                  <Edit />
                                </IconButton>
                              </Tooltip>
                              <Tooltip title="Delete Manager">
                                <IconButton
                                  size="small"
                                  sx={{ color: "#f44336" }}
                                  onClick={() => handleDelete(manager.id)}
                                >
                                  <Delete />
                                </IconButton>
                              </Tooltip>
                            </Box>
                          ) : column.field === "status" ? (
                            <Chip
                              label={manager[column.field] || "active"}
                              color={
                                getStatusColor(manager[column.field]) as any
                              }
                              size="small"
                            />
                          ) : (
                            <Box
                              sx={{
                                maxWidth: 200,
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                              }}
                            >
                              {getFieldValue(manager, column.field)}
                            </Box>
                          )}
                        </TableCell>
                      ))}
                  </TableRow>
                ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Box>

      {/* Pagination */}
      <TablePagination
        component="div"
        count={filteredManagers.length}
        page={page}
        onPageChange={(event, newPage) => setPage(newPage)}
        rowsPerPage={rowsPerPage}
        onRowsPerPageChange={(event) => {
          setRowsPerPage(parseInt(event.target.value, 10));
          setPage(0);
        }}
        sx={{
          color: "#ffffff",
          "& .MuiTablePagination-selectIcon": {
            color: "#ffffff",
          },
        }}
      />

      {/* Manager Form Dialog */}
      <ManagerForm
        open={showForm}
        manager={editingManager}
        onSave={() => {
          setShowForm(false);
          setEditingManager(null);
          loadManagers();
        }}
        onCancel={() => {
          setShowForm(false);
          setEditingManager(null);
        }}
      />

      {/* Manager Delete Password Dialog */}
      {managerToDelete && (
        <DeletePasswordDialog
          open={deleteDialogOpen}
          entityType="manager"
          entityLabel={managerToDelete.fullName}
          passwordRequirements={[
            {
              managerId: managerToDelete.id,
              managerName: managerToDelete.fullName,
              expectedPassword: managerToDelete.managerDeletePassword ?? "",
            },
          ]}
          onConfirm={() => executeManagerDelete(managerToDelete.id)}
          onCancel={() => {
            setDeleteDialogOpen(false);
            setManagerToDelete(null);
          }}
        />
      )}

      {/* Assign Employees Dialog */}
      <Dialog
        open={showAssignDialog}
        onClose={() => setShowAssignDialog(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>Assign Employees to Manager</DialogTitle>
        <DialogContent>
          <Box sx={{ mt: 2, display: "flex", flexDirection: "column", gap: 2 }}>
            <FormControl fullWidth>
              <InputLabel>Select Manager</InputLabel>
              <Select
                value={selectedManager}
                onChange={(e) => setSelectedManager(e.target.value)}
                label="Select Manager"
              >
                {managers.map((manager) => (
                  <MenuItem key={manager.id} value={manager.id}>
                    {manager.fullName} ({manager.managerId})
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <Box sx={{ display: "flex", gap: 2, alignItems: "center" }}>
              <Button
                variant="outlined"
                startIcon={<FileDownload />}
                onClick={downloadAssignmentSample}
              >
                Download Sample Template
              </Button>

              <Button
                variant="contained"
                component="label"
                startIcon={<FileUpload />}
              >
                Upload XLSX
                <input
                  type="file"
                  hidden
                  accept=".xlsx,.xls"
                  onChange={(e) =>
                    setAssignmentFile(e.target.files?.[0] || null)
                  }
                />
              </Button>
            </Box>

            {assignmentFile && (
              <Typography>Selected file: {assignmentFile.name}</Typography>
            )}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => {
              setShowAssignDialog(false);
              setSelectedManager("");
              setAssignmentFile(null);
            }}
          >
            Cancel
          </Button>
          <Button
            onClick={handleAssignEmployees}
            variant="contained"
            disabled={!selectedManager || !assignmentFile || assignLoading}
          >
            {assignLoading ? (
              <CircularProgress size={24} color="inherit" />
            ) : (
              "Assign Employees"
            )}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
