"use client";

import React, { useState, useEffect } from "react";
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
  Divider,
  Chip,
  Checkbox,
} from "@mui/material";
import {
  Add,
  Download,
  Visibility,
  Edit,
  Delete,
  Search,
  FileUpload,
  FileDownload,
  AddBox,
} from "@mui/icons-material";
import {
  collection,
  getDocs,
  doc,
  deleteDoc,
  query,
  orderBy,
  addDoc,
  updateDoc,
  where,
  deleteField,
  documentId,
  getDoc,
  writeBatch,
  limit,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { CustomField, TableColumn, Employee as BaseEmployee } from "@/types";
import type { Manager } from "@/types";

// Extend the base Employee type with additional properties used in this component
interface Employee extends BaseEmployee {
  companyName?: string;
  managerNames?: string;
  status?: string;
  department?: string;
}
interface ManagerFilterOption {
  id: string;
  name: string;
}
import { useAuth } from "@/contexts/AuthContext";
import EmployeeForm from "@/components/employees/EmployeeForm";
import DeletePasswordDialog from "@/components/shared/DeletePasswordDialog";
import * as XLSX from "xlsx";

// TODO - Need change

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
    field: "employeeId",
    headerName: "Employee Id",
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
    field: "mobile",
    headerName: "Mobile",
    width: 150,
    sortable: true,
    filterable: true,
    visible: true,
    order: 4,
  },
  {
    id: "5",
    field: "salary.basic",
    headerName: "Basic Salary",
    width: 120,
    sortable: true,
    filterable: true,
    visible: true,
    order: 5,
  },
  {
    id: "6",
    field: "department",
    headerName: "Department",
    width: 150,
    sortable: true,
    filterable: true,
    visible: true,
    order: 6,
  },
  {
    id: "7",
    field: "companyName",
    headerName: "Company",
    width: 200,
    sortable: true,
    filterable: true,
    visible: true,
    order: 7,
  },
  {
    id: "8",
    field: "managerNames",
    headerName: "Managers",
    width: 200,
    sortable: true,
    filterable: true,
    visible: true,
    order: 8,
  },
  {
    id: "9",
    field: "status",
    headerName: "Status",
    width: 120,
    sortable: true,
    filterable: true,
    visible: true,
    order: 9,
  },
];

export default function EmployeeTable() {
  const { currentUser } = useAuth();
  const isEditable = currentUser?.role === "admin";
  const isGood = currentUser?.userId;

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterType, setFilterType] = useState("all");
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [showForm, setShowForm] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [columns, setColumns] = useState<TableColumn[]>(defaultColumns);
  const [customFields, setCustomFields] = useState<CustomField[]>([]);
  const [showAddColumnDialog, setShowAddColumnDialog] = useState(false);
  const [newColumn, setNewColumn] = useState({
    name: "",
    type: "text" as const,
    defaultValue: "",
  });
  const [showEditColumnDialog, setShowEditColumnDialog] = useState(false);
  const [editingColumn, setEditingColumn] = useState<string>("");
  const [columnValues, setColumnValues] = useState<{ [key: string]: string }>(
    {},
  );
  const [editColumnLoading, setEditColumnLoading] = useState(false);
  const [showDeleteColumnDialog, setShowDeleteColumnDialog] = useState(false);
  const [columnToDelete, setColumnToDelete] = useState<string>("");
  const [managerFilterOptions, setManagerFilterOptions] = useState<
    ManagerFilterOption[]
  >([]);
  const [selectedEmployeeIds, setSelectedEmployeeIds] = useState<string[]>([]);
  // Delete password dialog state
  const [empDeleteDialogOpen, setEmpDeleteDialogOpen] = useState(false);
  const [empDeleteTarget, setEmpDeleteTarget] = useState<{
    ids: string[];
    label: string;
    passwordRequirements: { managerId: string; managerName: string; expectedPassword: string }[];
  } | null>(null);

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
    if (currentUser?.uid) {
      loadEmployees();
      loadCustomFields();
    }
  }, [currentUser?.uid]);

  const loadEmployees = async () => {
    try {
      setLoading(true);

      if (!currentUser?.uid) return;

      let employeesQuery;
      let companyId: string;

      // Different query logic based on user role
      if (currentUser.role === "admin") {
        // Admin can see all employees in their company
        companyId = currentUser.uid;
        employeesQuery = query(
          collection(db, "employees"),
          where("companyId", "==", companyId),
        );
      } else if (currentUser.role === "manager") {
        // Manager can see all employees in their company (for viewing)
        // but can only manage employees assigned to them
        companyId = currentUser.companyId || "";
        console.log("🔍 DEBUGGING - Manager companyId:", companyId);
        console.log("🔍 DEBUGGING - Manager UID:", currentUser.uid);
        console.log("🔍 DEBUGGING - Current user data:", currentUser);

        if (!companyId) {
          console.error(
            "❌ Manager does not have companyId. Current user:",
            currentUser,
          );
          setLoading(false);
          return;
        }
        employeesQuery = query(
          collection(db, "employees"),
          where("companyId", "==", companyId),
        );
      } else {
        // Employee role shouldn't access this component, but just in case
        setLoading(false);
        return;
      }

      const querySnapshot = await getDocs(employeesQuery);
      const employeesData: Employee[] = [];

      // Get all unique manager IDs
      const managerIds = new Set<string>();
      querySnapshot.forEach((doc) => {
        const data = doc.data();
        const assignedManagerIds = normalizeManagerIds(
          data.assignedManagers,
          data.assignedManager,
        );
        assignedManagerIds.forEach((id: string) => managerIds.add(id));
      });

      // Fetch managers data
      const managersData = new Map<string, any>();
      if (managerIds.size > 0) {
        const managersSnapshot = await getDocs(
          query(
            collection(db, "managers"),
            where(documentId(), "in", Array.from(managerIds)),
          ),
        );
        managersSnapshot.forEach((doc) => {
          managersData.set(doc.id, doc.data());
        });
      }

      setManagerFilterOptions(
        Array.from(managersData.entries())
          .map(([id, manager]) => ({
            id,
            name:
              manager.fullName ||
              manager.name ||
              manager.email ||
              "Unknown Manager",
          }))
          .sort((a, b) => a.name.localeCompare(b.name)),
      );

      // Fetch company data
      const companyDoc = await getDoc(doc(db, "companies", companyId));
      const companyName = companyDoc.exists()
        ? companyDoc.data().companyName ||
          companyDoc.data().name ||
          companyDoc.data().adminName ||
          ""
        : "";

      querySnapshot.forEach((doc) => {
        const data = doc.data();

        // Manager filtering logic
        if (currentUser.role === "manager") {
          // Find manager doc in managersData by email (or other unique property if needed)
          let managerDocId: string | null = null;
          for (const [docId, mgr] of managersData.entries()) {
            if (mgr.email === currentUser.email) {
              managerDocId = docId;
              break;
            }
          }
          // Fallback to currentUser.uid if not found
          managerDocId = managerDocId || currentUser.uid;
          const assignedManagerIds = normalizeManagerIds(
            data.assignedManagers,
            data.assignedManager,
          );
          const isAssignedToManager = assignedManagerIds.includes(managerDocId);
          console.log(
            "🔍 DEBUGGING - Manager Firestore ID for assignment:",
            managerDocId,
            "isAssigned:",
            isAssignedToManager,
          );
          if (!isAssignedToManager) {
            console.log("🔍 DEBUGGING - Skipping employee (not assigned)");
            return; // Skip this employee
          }
        }

        const managerNames =
          data.managerNames ||
          (normalizeManagerIds(data.assignedManagers, data.assignedManager)
            .length
            ? normalizeManagerIds(data.assignedManagers, data.assignedManager)
                .map((managerId: string) => {
                  const manager = managersData.get(managerId);
                  return manager ? manager.fullName : "Unknown Manager";
                })
                .join(", ")
            : "");

        employeesData.push({
          id: doc.id,
          ...data,
          assignedManagers: normalizeManagerIds(
            data.assignedManagers,
            data.assignedManager,
          ),
          assignedManager:
            normalizeManagerIds(
              data.assignedManagers,
              data.assignedManager,
            )[0] || "",
          companyName: data.companyName || companyName,
          managerNames,
        } as Employee);
      });

      console.log(
        "🔍 DEBUGGING - Final employees data length:",
        employeesData.length,
      );
      console.log("🔍 DEBUGGING - Final employees data:", employeesData);

      setEmployees(employeesData);

      // Generate auto-detected columns from employee data
      generateAutoDetectedColumns(employeesData);
    } catch (error) {
      console.error("Error loading employees:", error);
    } finally {
      setLoading(false);
    }
  };

  const generateAutoDetectedColumns = (employeesData: Employee[]) => {
    // Collect all unique field names from employee data
    const allFields = new Set<string>();
    employeesData.forEach((employee) => {
      Object.keys(employee).forEach((key) => {
        // Exclude main columns, special fields, sensitive data, and 'salaryOverrides'
        if (
          ![
            "id",
            "fullName",
            "employeeId",
            "email",
            "mobile",
            "salary",
            "companyId",
            "assignedManagers",
            "salaryOverrides",
            "companyName",
            "managerNames",
          ].includes(key)
        ) {
          allFields.add(key);
        }
      });
    });

    // Create auto-detected columns, excluding 'salaryOverrides'
    const autoDetectedColumns = Array.from(allFields)
      .filter((field) => field !== "salaryOverrides")
      .map((field, index) => ({
        id: `auto-${field}`,
        field: field,
        headerName: field,
        width: 150,
        sortable: true,
        filterable: true,
        visible: true,
        order: defaultColumns.length + index + 1,
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

  const handleDeleteColumn = async () => {
    try {
      console.log("Starting column deletion for:", columnToDelete);

      // Find the column to delete
      const columnToDeleteObj = columns.find(
        (col) => col.field === columnToDelete,
      );
      if (!columnToDeleteObj) {
        console.error("Column not found:", columnToDelete);
        alert("Column not found");
        return;
      }

      // Don't allow deletion of required default columns and actions column
      if (
        defaultColumns.some((col) => col.field === columnToDelete) ||
        columnToDelete === "actions"
      ) {
        alert(
          "Cannot delete system default columns (Full Name, Manager ID, Email, Status, Actions)",
        );
        return;
      }

      // First, remove the field from all managers in Firestore
      console.log("Removing field from managers...");
      const batch = [];
      for (const manager of employees) {
        const updateData = {
          updatedAt: new Date(),
        } as Record<string, any>;

        // Handle both normal fields and fields with spaces
        updateData[columnToDelete] = deleteField();

        // If the field contains spaces, also try to delete its alternative formats
        if (columnToDelete.includes(" ")) {
          const noSpaceVersion = columnToDelete.replace(/\s+/g, "");
          updateData[noSpaceVersion] = deleteField();
          const underscoreVersion = columnToDelete.replace(/\s+/g, "_");
          updateData[underscoreVersion] = deleteField();
        }

        batch.push(updateDoc(doc(db, "managers", manager.id), updateData));
      }
      await Promise.all(batch);
      console.log("Field removed from all managers");

      // If it's a custom field, remove it from the customFields collection
      const customField = customFields.find(
        (field) =>
          field.name === columnToDelete ||
          field.name.replace(/\s+/g, "") === columnToDelete ||
          field.name.replace(/\s+/g, "_") === columnToDelete,
      );

      if (customField?.id) {
        console.log("Removing custom field definition...");
        await deleteDoc(doc(collection(db, "customFields"), customField.id));
        console.log("Custom field definition removed");

        // Update custom fields state
        setCustomFields((prev) =>
          prev.filter((field) => field.id !== customField.id),
        );
      }

      // Update the columns state
      console.log("Updating columns state...");
      const actionsColumn = columns.find((col) => col.field === "actions");
      const filteredColumns = columns.filter(
        (col) =>
          col.field !== columnToDelete &&
          col.field !== columnToDelete.replace(/\s+/g, "") &&
          col.field !== columnToDelete.replace(/\s+/g, "_") &&
          col.field !== "actions",
      );

      const newColumns = actionsColumn
        ? [...filteredColumns, actionsColumn]
        : filteredColumns;

      console.log("New columns:", newColumns);
      setColumns(newColumns);

      // Close dialog and clear selection
      setShowDeleteColumnDialog(false);
      setColumnToDelete("");

      // Force a reload of data to ensure UI is in sync with database
      await loadEmployees();

      // Show success message
      alert(`Column "${columnToDelete}" has been deleted successfully`);
    } catch (error) {
      console.error("Error deleting column:", error);
      alert("Error deleting column: " + (error as Error).message);
    }
  };

  const loadCustomFields = async () => {
    try {
      const customFieldsQuery = query(
        collection(db, "customFields"),
        orderBy("order"),
      );
      const querySnapshot = await getDocs(customFieldsQuery);
      const fields: CustomField[] = [];
      querySnapshot.forEach((doc) => {
        fields.push({ id: doc.id, ...doc.data() } as CustomField);
      });
      setCustomFields(fields);
    } catch (error) {
      console.error("Error loading custom fields:", error);
    }
  };

  // Helper: delete all Firestore docs matching a single-field query, in batches of 500
  const deleteRelatedDocs = async (col: string, field: string, value: string) => {
    const snap = await getDocs(query(collection(db, col), where(field, "==", value)));
    if (snap.empty) return;
    const BATCH_SIZE = 500;
    for (let i = 0; i < snap.docs.length; i += BATCH_SIZE) {
      const batch = writeBatch(db);
      snap.docs.slice(i, i + BATCH_SIZE).forEach((d) => batch.delete(d.ref));
      await batch.commit();
    }
  };

  // Delete one employee and all their related records
  const deleteEmployeeAndRelated = async (employeeId: string) => {
    await Promise.all([
      deleteRelatedDocs("attendance",    "employeeId", employeeId),
      deleteRelatedDocs("payroll",       "employeeId", employeeId),
      deleteRelatedDocs("salary_slips",  "employeeId", employeeId),
      deleteRelatedDocs("notifications", "userId",     employeeId),
    ]);
    await deleteDoc(doc(db, "employees", employeeId));
  };

  const handleDelete = async (employeeId: string) => {
    const employee = employees.find((e) => e.id === employeeId);
    if (!employee) return;

    // Determine the manager(s) this employee is assigned to
    const managerDocIds: string[] = Array.isArray(employee.assignedManagers)
      ? employee.assignedManagers
      : employee.assignedManager
      ? [employee.assignedManager]
      : [];

    // Fetch manager docs to get their employeeDeletePassword
    let requirements: { managerId: string; managerName: string; expectedPassword: string }[] = [];
    if (managerDocIds.length > 0) {
      const managerDocs = await Promise.all(
        managerDocIds.map((id) => getDoc(doc(db, "managers", id)))
      );
      for (const snap of managerDocs) {
        if (!snap.exists()) continue;
        const mgr = snap.data() as Manager;
        if (mgr.employeeDeletePassword) {
          requirements.push({
            managerId: snap.id,
            managerName: mgr.fullName,
            expectedPassword: mgr.employeeDeletePassword,
          });
        }
      }
    }

    if (requirements.length === 0) {
      // No password set for any manager — use simple confirm
      if (!window.confirm("Are you sure you want to delete this employee?\n\nThis will also delete all their attendance, payroll, salary slips and notifications. This cannot be undone.")) return;
      try {
        await deleteEmployeeAndRelated(employeeId);
        setEmployees(employees.filter((emp) => emp.id !== employeeId));
      } catch (error) {
        console.error("Error deleting employee:", error);
        alert("Error deleting employee: " + (error as Error).message);
      }
      return;
    }

    // Password required — open dialog
    setEmpDeleteTarget({
      ids: [employeeId],
      label: employee.fullName,
      passwordRequirements: requirements,
    });
    setEmpDeleteDialogOpen(true);
  };

  const handleBulkDelete = async () => {
    if (selectedEmployeeIds.length === 0) return;

    // Find all unique managers for the selected employees
    const managerIdSet = new Set<string>();
    for (const id of selectedEmployeeIds) {
      const emp = employees.find((e) => e.id === id);
      if (!emp) continue;
      const mgrIds = Array.isArray(emp.assignedManagers)
        ? emp.assignedManagers
        : emp.assignedManager
        ? [emp.assignedManager]
        : [];
      mgrIds.forEach((mid) => managerIdSet.add(mid));
    }

    const managerDocIds = Array.from(managerIdSet);

    // Fetch password requirements for all unique managers
    let requirements: { managerId: string; managerName: string; expectedPassword: string }[] = [];
    if (managerDocIds.length > 0) {
      const managerDocs = await Promise.all(
        managerDocIds.map((id) => getDoc(doc(db, "managers", id)))
      );
      for (const snap of managerDocs) {
        if (!snap.exists()) continue;
        const mgr = snap.data() as Manager;
        if (mgr.employeeDeletePassword) {
          requirements.push({
            managerId: snap.id,
            managerName: mgr.fullName,
            expectedPassword: mgr.employeeDeletePassword,
          });
        }
      }
    }

    if (requirements.length === 0) {
      // No password set for any manager — use simple confirm
      if (!window.confirm(`Are you sure you want to delete ${selectedEmployeeIds.length} selected employee(s)?\n\nThis will also delete all their attendance, payroll, salary slips and notifications. This cannot be undone.`)) return;
      try {
        await Promise.all(selectedEmployeeIds.map((id) => deleteEmployeeAndRelated(id)));
        setEmployees((prev) => prev.filter((emp) => !selectedEmployeeIds.includes(emp.id)));
        setSelectedEmployeeIds([]);
      } catch (error) {
        console.error("Error bulk deleting employees:", error);
        alert("Error deleting employees: " + (error as Error).message);
      }
      return;
    }

    // Password required for one or more managers — open dialog
    setEmpDeleteTarget({
      ids: [...selectedEmployeeIds],
      label: `${selectedEmployeeIds.length} employee(s)`,
      passwordRequirements: requirements,
    });
    setEmpDeleteDialogOpen(true);
  };

  const executeEmployeeDelete = async () => {
    if (!empDeleteTarget) return;
    await Promise.all(empDeleteTarget.ids.map((id) => deleteEmployeeAndRelated(id)));
    setEmployees((prev) => prev.filter((emp) => !empDeleteTarget.ids.includes(emp.id)));
    setSelectedEmployeeIds((prev) => prev.filter((id) => !empDeleteTarget.ids.includes(id)));
    setEmpDeleteDialogOpen(false);
    setEmpDeleteTarget(null);
  };

  const handleAddColumn = async () => {
    try {
      const newCustomField: CustomField = {
        id: Date.now().toString(),
        name: newColumn.name,
        type: newColumn.type,
        required: false,
        order: customFields.length + 1,
        createdAt: new Date(),
        defaultValue: newColumn.defaultValue || undefined,
      };

      // Add to custom fields
      setCustomFields([...customFields, newCustomField]);

      // Add to columns (before actions column)
      const currentColumns = [...columns];
      const actionsColumn = currentColumns.pop(); // Remove actions column temporarily

      const newColumnConfig: TableColumn = {
        id: `custom-${newCustomField.id}`,
        field: newColumn.name,
        headerName: newColumn.name,
        width: 150,
        sortable: true,
        filterable: true,
        visible: true,
        order: currentColumns.length + 1,
        isCustom: true,
      };

      setColumns([...currentColumns, newColumnConfig, actionsColumn!]);
      setShowAddColumnDialog(false);
      setNewColumn({ name: "", type: "text", defaultValue: "" });
    } catch (error) {
      console.error("Error adding column:", error);
    }
  };

  const filteredEmployees = employees.filter((employee) => {
    const matchesSearch =
      employee.fullName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      employee.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      employee.employeeId?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      employee.department?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      employee.managerNames?.toLowerCase().includes(searchTerm.toLowerCase());

    if (filterType === "all") return matchesSearch;
    if (filterType === "active")
      return matchesSearch && employee.status === "active";
    if (filterType === "inactive")
      return matchesSearch && employee.status === "inactive";
    if (filterType.startsWith("department:")) {
      const department = filterType.split(":")[1];
      return matchesSearch && employee.department === department;
    }
    if (filterType.startsWith("manager:")) {
      const managerId = filterType.split(":")[1];
      return (
        matchesSearch &&
        normalizeManagerIds(
          employee.assignedManagers,
          employee.assignedManager,
        ).includes(managerId)
      );
    }
    return matchesSearch;
  });

  const getFieldValue = (
    employee: Employee,
    field: string,
  ): React.ReactNode => {
    if (field === "salary.basic") {
      return employee.salary?.basic ?? employee.salary?.base ?? "";
    }
    if (field === "actions") {
      return null;
    }

    // Gather value (supports nested dot paths)
    let value: any;
    if (field.includes(".")) {
      const keys = field.split(".");
      value = employee as any;
      for (const key of keys) {
        if (value && typeof value === "object" && key in value) {
          value = value[key];
        } else {
          return "";
        }
      }
    } else {
      value = (employee as any)[field];
    }

    // Special handling for joinDate
    if (field === "joinDate") {
      // Firestore timestamp object
      if (
        value &&
        typeof value === "object" &&
        "seconds" in value &&
        "nanoseconds" in value
      ) {
        const date = new Date(value.seconds * 1000);
        return date.toLocaleDateString();
      }
      // Numeric timestamp (milliseconds or seconds)
      if (typeof value === "number") {
        // If value is too large, treat as milliseconds
        const date = new Date(value > 1e12 ? value : value * 1000);
        return date.toLocaleDateString();
      }
      // String that looks like a number
      if (typeof value === "string" && /^\d+(\.\d+)?$/.test(value)) {
        const num = Number(value);
        if (!isNaN(num)) {
          const date = new Date(num > 1e12 ? num : num * 1000);
          return date.toLocaleDateString();
        }
      }
      // Otherwise, show as-is
      return value ?? "";
    }

    // Handle Firestore timestamp objects
    if (
      value &&
      typeof value === "object" &&
      "seconds" in value &&
      "nanoseconds" in value
    ) {
      // Convert Firestore timestamp to readable date
      const date = new Date((value as any).seconds * 1000);
      return date.toLocaleDateString();
    }

    // If the final value is an object or array, convert to a readable string
    if (value && typeof value === "object") {
      // Prefer showing salary.basic when available
      if (!Array.isArray(value) && "basic" in value) {
        return String((value as any).basic ?? "");
      }

      if (Array.isArray(value)) {
        return value
          .map((v) =>
            v && typeof v === "object" ? JSON.stringify(v) : String(v),
          )
          .join(", ");
      }

      try {
        return JSON.stringify(value);
      } catch (err) {
        return String(value);
      }
    }

    return value !== undefined && value !== null ? String(value) : "";
  };

  const handleExportCSV = () => {
    const headers = columns
      .filter((col) => col.visible && col.field !== "actions")
      .map((col) => col.headerName);
    const csvData = [
      headers.join(","),
      ...filteredEmployees.map((emp) =>
        columns
          .filter((col) => col.visible && col.field !== "actions")
          .map((col) => getFieldValue(emp, col.field))
          .join(","),
      ),
    ].join("\n");

    const blob = new Blob([csvData], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "employees.csv";
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const handleExportXLSX = () => {
    // Gather all unique fields from employees
    const allFields = new Set<string>();
    employees.forEach((emp) =>
      Object.keys(emp).forEach((key) => allFields.add(key)),
    );
    const fields = Array.from(allFields);
    // Prepare data for XLSX
    const data = employees.map((emp) => {
      const row: Record<string, any> = {};
      fields.forEach((field) => {
        row[field] = emp[field] !== undefined ? emp[field] : "";
      });
      return row;
    });
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Employees");
    XLSX.writeFile(wb, "employees.xlsx");
  };

  const handleUploadXLSX = () => {
    const parseExcelDate = (value: any): string => {
      if (value === null || value === undefined || value === "") return "";

      if (typeof value === "number") {
        const parsed = XLSX.SSF.parse_date_code(value);
        if (parsed) {
          const mm = String(parsed.m).padStart(2, "0");
          const dd = String(parsed.d).padStart(2, "0");
          return `${parsed.y}-${mm}-${dd}`;
        }
      }

      const str = String(value).trim();
      if (!str) return "";

      const dt = new Date(str);
      if (!Number.isNaN(dt.getTime())) {
        return dt.toISOString().slice(0, 10);
      }

      return str;
    };

    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".xlsx,.xls";
    input.onchange = async (e: any) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = async (evt) => {
        const data = evt.target?.result;
        const workbook = XLSX.read(data, { type: "binary" });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const rows: any[] = XLSX.utils.sheet_to_json(sheet);
        for (const row of rows) {
          // Require fullName, employeeId, email, mobile
          const fullName = row.fullName || row["Full Name"];
          const employeeId = row.employeeId || row["Employee ID"];
          const email = row.email || row["Email"];
          const mobile = row.mobile || row["Mobile"];

          if (!fullName || !employeeId || !email || !mobile) continue;

          // Filter out empty columns and clean the data
          const cleanedRow: any = {};
          Object.keys(row).forEach((key) => {
            // Skip empty columns (like __EMPTY"", __EMPTY_1"", etc.)
            if (key.startsWith("__EMPTY")) return;

            // Skip keys that are just empty strings or whitespace
            if (!key.trim()) return;

            // Only include non-empty values
            const value = row[key];
            if (value !== null && value !== undefined && value !== "") {
              cleanedRow[key] = value;
            }
          });

          const basicSalary = Number(
            row["salary.basic"] || row.salary || row["Basic Salary"] || 0,
          );

          const employeeDoc = {
            ...cleanedRow,
            fullName,
            employeeId,
            email,
            mobile: Number(mobile),
            fatherName: String(
              row.fatherName ||
                row["Father Name"] ||
                cleanedRow.fatherName ||
                "",
            ),
            designation: String(
              row.designation ||
                row["Designation"] ||
                cleanedRow.designation ||
                "",
            ),
            dob: parseExcelDate(row.dob || row["D.O.B"] || row["DOB"]),
            joinDate: parseExcelDate(
              row.joinDate ||
                row["D.O.J"] ||
                row["DOJ"] ||
                row["Date of Joining"],
            ),
            epfNo: String(row.epfNo || row["EPF No"] || cleanedRow.epfNo || ""),
            uan: String(row.uan || row["UAN No"] || row["UAN"] || ""),
            esicNo: String(row.esicNo || row["ESIC"] || row["ESIC No"] || ""),
            hqLocation: String(
              row.hqLocation ||
                row["HQ Location"] ||
                cleanedRow.hqLocation ||
                "",
            ),
            companyId: currentUser?.uid || cleanedRow.companyId,
            salary: {
              basic: Number.isFinite(basicSalary) ? basicSalary : 0,
              da: 0,
              customAllowances: [],
              customBonuses: [],
              customDeductions: [],
              bonuses: {},
              deductions: {},
            },
            createdAt: new Date(),
            updatedAt: new Date(),
          };

          // Add to Firebase with normalized data
          await addDoc(collection(db, "employees"), {
            ...employeeDoc,
          });
        }
        // Reload employees after upload
        loadEmployees();
      };
      reader.readAsBinaryString(file);
    };
    input.click();
  };

  const handleDownloadSample = () => {
    // Create a proper Excel file with sample data
    const sampleData = [
      {
        fullName: "John Doe",
        employeeId: "EMP001",
        email: "john.doe@company.com",
        mobile: "1234567890",
        "salary.basic": "50000",
        fatherName: "Raj Doe",
        designation: "Developer",
        "D.O.B": "1997-05-10",
        "D.O.J": "2024-01-15",
        "EPF No": "EPF12345",
        "UAN No": "100200300400",
        ESIC: "ESIC90001",
        "HQ Location": "Pune",
        department: "IT",
      },
      {
        fullName: "Jane Smith",
        employeeId: "EMP002",
        email: "jane.smith@company.com",
        mobile: "0987654321",
        "salary.basic": "55000",
        fatherName: "Anil Smith",
        designation: "HR Manager",
        "D.O.B": "1995-09-20",
        "D.O.J": "2024-02-01",
        "EPF No": "EPF54321",
        "UAN No": "400300200100",
        ESIC: "ESIC90002",
        "HQ Location": "Mumbai",
        department: "HR",
      },
    ];

    const ws = XLSX.utils.json_to_sheet(sampleData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Employee Sample");
    XLSX.writeFile(wb, "sample_employees.xlsx");
  };

  const openEditColumnDialog = (columnField: string) => {
    setEditingColumn(columnField);
    const values: { [key: string]: string } = {};
    employees.forEach((emp) => {
      values[emp.id] = String(getFieldValue(emp, columnField) ?? "");
    });
    setColumnValues(values);
    setShowEditColumnDialog(true);
  };

  const handleEditColumn = async () => {
    try {
      setEditColumnLoading(true);
      const updates = Object.entries(columnValues).map(([employeeId, value]) =>
        updateDoc(doc(db, "employees", employeeId), {
          [editingColumn]: value,
          updatedAt: new Date(),
        }),
      );
      await Promise.all(updates);
      setShowEditColumnDialog(false);
      setEditingColumn("");
      setColumnValues({});
      loadEmployees(); // Reload to show updated data
    } catch (error) {
      console.error("Error updating column:", error);
    } finally {
      setEditColumnLoading(false);
    }
  };

  const updateColumnValues = (employeeId: string, value: string) => {
    setColumnValues((prev) => ({
      ...prev,
      [employeeId]: value,
    }));
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
          Employees
        </Typography>
        {isEditable && (
          <>
            <Typography variant="body1" color="text.secondary">
              View, and manage employees
            </Typography>
            <Typography variant="body1" color="text.secondary">
              Note: To add employees go to managers tab and click "ASSIGN
              EMPLOYEES"
            </Typography>
          </>
        )}
      </Box>

      {/* Action Buttons */}
      <Box sx={{ mb: 3, display: "flex", gap: 2, flexWrap: "wrap" }}>
        {/* Admin-only buttons */}
        {currentUser?.role === "admin" && (
          <>
            {/* <Button
              variant="contained"
              startIcon={<Add />}
              onClick={() => setShowForm(true)}
              sx={{
                backgroundColor: '#2196f3',
                '&:hover': { backgroundColor: '#1976d2' },
              }}
            >
              ADD EMPLOYEE
            </Button> */}

            {/* <Button
              variant="contained"
              startIcon={<FileUpload />}
              onClick={handleUploadXLSX}
              sx={{
                backgroundColor: '#9c27b0',
                '&:hover': { backgroundColor: '#7b1fa2' },
              }}
            >
              UPLOAD XLSX
            </Button> */}

            {/* <Button
              variant="contained"
              startIcon={<Download />}
              onClick={handleDownloadSample}
              sx={{
                backgroundColor: '#2196f3',
                '&:hover': { backgroundColor: '#1976d2' },
              }}
            >
              DOWNLOAD SAMPLE TEMPLATE
            </Button> */}

            <Button
              variant="contained"
              startIcon={<AddBox />}
              onClick={() => setShowAddColumnDialog(true)}
              sx={{
                backgroundColor: "#2196f3",
                "&:hover": { backgroundColor: "#1976d2" },
              }}
            >
              ADD COLUMN
            </Button>

            <Button
              variant="contained"
              startIcon={<Delete />}
              onClick={() => setShowDeleteColumnDialog(true)}
              sx={{
                backgroundColor: "#f44336",
                "&:hover": { backgroundColor: "#d32f2f" },
              }}
            >
              DELETE COLUMN
            </Button>

            {selectedEmployeeIds.length > 0 && (
              <Button
                variant="contained"
                startIcon={<Delete />}
                onClick={handleBulkDelete}
                sx={{
                  backgroundColor: "#b71c1c",
                  "&:hover": { backgroundColor: "#7f0000" },
                }}
              >
                DELETE SELECTED ({selectedEmployeeIds.length})
              </Button>
            )}

            <Button
              variant="contained"
              startIcon={<Edit />}
              onClick={() => {
                // Show a dropdown or dialog to select which column to edit
                const columnField = prompt(
                  "Enter column field name to edit (e.g., fullName, email, Employee Id):",
                );
                if (columnField) {
                  openEditColumnDialog(columnField);
                }
              }}
              sx={{
                backgroundColor: "#ff9800",
                "&:hover": { backgroundColor: "#f57c00" },
              }}
            >
              EDIT COLUMN
            </Button>
          </>
        )}

        {/* Buttons available for both admin and manager */}
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
            backgroundColor: "#2196f3",
            "&:hover": { backgroundColor: "#1976d2" },
          }}
        >
          EXPORT XLSX
        </Button>
      </Box>

      {/* Search Bar and Filters */}
      <Box sx={{ mb: 3, display: "flex", gap: 2 }}>
        <TextField
          sx={{ flex: 1 }}
          placeholder="Search by Name, Email, ID, Department, or Manager"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          InputProps={{
            startAdornment: <Search sx={{ mr: 1, color: "text.secondary" }} />,
          }}
        />
        <FormControl sx={{ minWidth: 200 }}>
          <InputLabel>Filter By</InputLabel>
          <Select
            value={filterType}
            onChange={(e) => { setFilterType(e.target.value); setSelectedEmployeeIds([]); setPage(0); }}
            label="Filter By"
          >
            <MenuItem value="all">All Employees</MenuItem>
            <MenuItem value="active">Active Employees</MenuItem>
            <MenuItem value="inactive">Inactive Employees</MenuItem>
            <Divider />
            {Array.from(new Set(employees.map((emp) => emp.department)))
              .filter(Boolean)
              .map((dept) => (
                <MenuItem key={dept} value={`department:${dept}`}>
                  Department: {dept}
                </MenuItem>
              ))}
            <Divider />
            {managerFilterOptions.map((manager) => (
              <MenuItem key={manager.id} value={`manager:${manager.id}`}>
                Manager: {manager.name}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      </Box>

      {/* Employee Table */}
      <Box sx={{ overflowX: "auto", maxWidth: "100%" }}>
        <TableContainer
          component={Paper}
          sx={{ backgroundColor: "#2d2d2d", border: "1px solid #333" }}
        >
          <Table>
            <TableHead>
              <TableRow sx={{ backgroundColor: "#1e1e1e" }}>
                {currentUser?.role === "admin" && (
                  <TableCell
                    padding="checkbox"
                    sx={{ backgroundColor: "#1e1e1e", borderBottom: "2px solid #333" }}
                  >
                    <Checkbox
                      indeterminate={
                        selectedEmployeeIds.length > 0 &&
                        selectedEmployeeIds.length <
                          filteredEmployees.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage).length
                      }
                      checked={
                        filteredEmployees.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage).length > 0 &&
                        filteredEmployees
                          .slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage)
                          .every((emp) => selectedEmployeeIds.includes(emp.id))
                      }
                      onChange={(e) => {
                        const pageEmployees = filteredEmployees.slice(
                          page * rowsPerPage,
                          page * rowsPerPage + rowsPerPage,
                        );
                        if (e.target.checked) {
                          setSelectedEmployeeIds((prev) =>
                            Array.from(new Set([...prev, ...pageEmployees.map((emp) => emp.id)])),
                          );
                        } else {
                          const pageIds = pageEmployees.map((emp) => emp.id);
                          setSelectedEmployeeIds((prev) =>
                            prev.filter((id) => !pageIds.includes(id)),
                          );
                        }
                      }}
                      sx={{ color: "#ffffff" }}
                    />
                  </TableCell>
                )}
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
              {filteredEmployees
                .slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage)
                .map((employee) => (
                  <TableRow
                    key={employee.id}
                    sx={{ "&:hover": { backgroundColor: "#3d3d3d" } }}
                  >
                    {currentUser?.role === "admin" && (
                      <TableCell padding="checkbox" sx={{ borderBottom: "1px solid #333" }}>
                        <Checkbox
                          checked={selectedEmployeeIds.includes(employee.id)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedEmployeeIds((prev) => [...prev, employee.id]);
                            } else {
                              setSelectedEmployeeIds((prev) =>
                                prev.filter((id) => id !== employee.id),
                              );
                            }
                          }}
                          sx={{ color: "#ffffff" }}
                        />
                      </TableCell>
                    )}
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
                              <Tooltip title="View">
                                <IconButton
                                  size="small"
                                  sx={{ color: "#2196f3" }}
                                  onClick={() => {
                                    setEditingEmployee(employee);
                                    setShowForm(true);
                                  }}
                                >
                                  <Visibility />
                                </IconButton>
                              </Tooltip>
                              {currentUser?.role === "admin" && (
                                <Tooltip title="Delete">
                                  <IconButton
                                    size="small"
                                    sx={{ color: "#f44336" }}
                                    onClick={() => handleDelete(employee.id)}
                                  >
                                    <Delete />
                                  </IconButton>
                                </Tooltip>
                              )}
                            </Box>
                          ) : (
                            getFieldValue(employee, column.field)
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
        count={filteredEmployees.length}
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

      {/* Employee Form Dialog */}
      <EmployeeForm
        open={showForm}
        employee={editingEmployee}
        readOnly={currentUser?.role === "manager"}
        onSave={() => {
          setShowForm(false);
          setEditingEmployee(null);
          loadEmployees();
        }}
        onCancel={() => {
          setShowForm(false);
          setEditingEmployee(null);
        }}
      />

      {/* Employee Delete Password Dialog */}
      {empDeleteTarget && (
        <DeletePasswordDialog
          open={empDeleteDialogOpen}
          entityType="employee"
          entityLabel={empDeleteTarget.label}
          passwordRequirements={empDeleteTarget.passwordRequirements}
          onConfirm={executeEmployeeDelete}
          onCancel={() => {
            setEmpDeleteDialogOpen(false);
            setEmpDeleteTarget(null);
          }}
        />
      )}

      {/* Delete Column Dialog */}
      <Dialog
        open={showDeleteColumnDialog}
        onClose={() => setShowDeleteColumnDialog(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Delete Column</DialogTitle>
        <DialogContent>
          <Box sx={{ mt: 2 }}>
            <FormControl fullWidth>
              <InputLabel>Select Column to Delete</InputLabel>
              <Select
                value={columnToDelete}
                onChange={(e) => setColumnToDelete(e.target.value)}
                label="Select Column to Delete"
              >
                {columns
                  .filter(
                    (col) =>
                      !defaultColumns.some(
                        (defCol) => defCol.field === col.field,
                      ),
                  ) // Filter out default columns
                  .map((column) => (
                    <MenuItem key={column.id} value={column.field}>
                      {column.headerName}
                    </MenuItem>
                  ))}
              </Select>
            </FormControl>
            {columnToDelete && (
              <Typography sx={{ mt: 2, color: "error.main" }}>
                Warning: This action will permanently delete the column "
                {columnToDelete}" and all its data. This cannot be undone.
              </Typography>
            )}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowDeleteColumnDialog(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleDeleteColumn}
            variant="contained"
            color="error"
            disabled={!columnToDelete}
          >
            Delete Column
          </Button>
        </DialogActions>
      </Dialog>

      {/* Add Column Dialog */}
      <Dialog
        open={showAddColumnDialog}
        onClose={() => setShowAddColumnDialog(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Add Custom Column</DialogTitle>
        <DialogContent>
          <TextField
            fullWidth
            label="Column Name"
            value={newColumn.name}
            onChange={(e) =>
              setNewColumn({ ...newColumn, name: e.target.value })
            }
            sx={{ mt: 2, mb: 2 }}
          />
          <FormControl fullWidth sx={{ mb: 2 }}>
            <InputLabel>Column Type</InputLabel>
            <Select
              value={newColumn.type}
              onChange={(e) =>
                setNewColumn({ ...newColumn, type: e.target.value as any })
              }
              label="Column Type"
            >
              <MenuItem value="text">Text</MenuItem>
              <MenuItem value="number">Number</MenuItem>
              <MenuItem value="boolean">Boolean</MenuItem>
              <MenuItem value="date">Date</MenuItem>
            </Select>
          </FormControl>
          <TextField
            fullWidth
            label="Default Value (optional)"
            value={newColumn.defaultValue ?? ""}
            onChange={(e) =>
              setNewColumn({ ...newColumn, defaultValue: e.target.value })
            }
            sx={{ mb: 2 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowAddColumnDialog(false)}>Cancel</Button>
          <Button
            onClick={handleAddColumn}
            variant="contained"
            disabled={!newColumn.name}
          >
            Add Column
          </Button>
        </DialogActions>
      </Dialog>

      {/* Edit Column Dialog */}
      <Dialog
        open={showEditColumnDialog}
        onClose={() => setShowEditColumnDialog(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>Edit Column: {editingColumn}</DialogTitle>
        <DialogContent>
          <Box sx={{ mt: 2, maxHeight: 400, overflowY: "auto" }}>
            {employees.map((employee) => (
              <Box
                key={employee.id}
                sx={{ display: "flex", gap: 2, mb: 2, alignItems: "center" }}
              >
                <Typography sx={{ minWidth: 200, color: "#ffffff" }}>
                  {employee.fullName} ({employee.employeeId})
                </Typography>
                <TextField
                  fullWidth
                  label="Value"
                  value={columnValues[employee.id] ?? ""}
                  onChange={(e) =>
                    updateColumnValues(employee.id, e.target.value)
                  }
                  sx={{
                    "& .MuiOutlinedInput-root": {
                      borderRadius: 2,
                    },
                  }}
                />
              </Box>
            ))}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowEditColumnDialog(false)}>Cancel</Button>
          <Button
            onClick={handleEditColumn}
            variant="contained"
            disabled={editColumnLoading}
            sx={{
              backgroundColor: "#ff9800",
              "&:hover": { backgroundColor: "#f57c00" },
            }}
          >
            {editColumnLoading ? (
              <CircularProgress size={24} />
            ) : (
              "Update Column"
            )}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
