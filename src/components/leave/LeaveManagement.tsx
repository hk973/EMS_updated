'use client';

import React, { useState, useEffect } from 'react';
import {
    Box,
    Typography,
    Tabs,
    Tab,
    Card,
    CardContent,
    Button,
    Chip,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    Paper,
    IconButton,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    TextField,
    FormControl,
    InputLabel,
    Select,
    MenuItem,
    Alert,
} from '@mui/material';
import {
    Add,
    Edit,
    Delete,
    Visibility,
    CheckCircle,
    Cancel,
    CalendarToday,
    Refresh,
} from '@mui/icons-material';

import { collection, getDocs, addDoc, updateDoc, doc, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { LeaveApplication, LeaveType, LeaveBalance, Holiday } from '@/types/leave';
import { Employee } from '@/types';

// Manual leave types
const now = new Date();
const MANUAL_LEAVE_TYPES: LeaveType[] = [
    { id: 'casual', name: 'Casual Leave', color: '#6366f1', code: 'CL', maxDaysPerYear: 12, carryForward: false, isActive: true, createdAt: now, updatedAt: now },
    { id: 'sick', name: 'Sick Leave', color: '#10b981', code: 'SL', maxDaysPerYear: 8, carryForward: false, isActive: true, createdAt: now, updatedAt: now },
    { id: 'earned', name: 'Earned Leave', color: '#f59e0b', code: 'EL', maxDaysPerYear: 15, carryForward: true, isActive: true, createdAt: now, updatedAt: now },
    { id: 'other', name: 'Other', color: '#94a3b8', code: 'OT', maxDaysPerYear: 0, carryForward: false, isActive: true, createdAt: now, updatedAt: now },
];

interface TabPanelProps {
    children?: React.ReactNode;
    index: number;
    value: number;
}

function TabPanel(props: TabPanelProps) {
    const { children, value, index, ...other } = props;
    return (
        <div
            role="tabpanel"
            hidden={value !== index}
            id={`leave-tabpanel-${index}`}
            aria-labelledby={`leave-tab-${index}`}
            {...other}
        >
            {value === index && <Box sx={{ pt: 2.5, pb: 2 }}>{children}</Box>}
        </div>
    );
}

export default function LeaveManagement() {
    const { currentUser } = useAuth();
    const [tabValue, setTabValue] = useState(0);
    const [leaveApplications, setLeaveApplications] = useState<LeaveApplication[]>([]);
    const [leaveTypes, setLeaveTypes] = useState<LeaveType[]>(MANUAL_LEAVE_TYPES);
    const [leaveBalances, setLeaveBalances] = useState<LeaveBalance[]>([]);
    const [holidays, setHolidays] = useState<Holiday[]>([]);
    const [employees, setEmployees] = useState<Employee[]>([]);
    const [showApplicationDialog, setShowApplicationDialog] = useState(false);
    const [showLeaveTypeDialog, setShowLeaveTypeDialog] = useState(false);
    const [showHolidayDialog, setShowHolidayDialog] = useState(false);
    const [showViewDialog, setShowViewDialog] = useState(false);
    const [selectedApplication, setSelectedApplication] = useState<LeaveApplication | null>(null);
    const [leaveBalanceError, setLeaveBalanceError] = useState('');

    // Form states
    const [applicationForm, setApplicationForm] = useState({
        leaveTypeId: '',
        startDate: '',
        endDate: '',
        reason: '',
        isHalfDay: false,
        halfDayType: 'first-half' as 'first-half' | 'second-half',
    });

    const [customLeaveType, setCustomLeaveType] = useState('');

    const [leaveTypeForm, setLeaveTypeForm] = useState({
        name: '',
        code: '',
        maxDaysPerYear: 0,
        carryForward: false,
        maxCarryForwardDays: 0,
        color: '#6366f1',
    });

    const [holidayForm, setHolidayForm] = useState({
        name: '',
        date: '',
        type: 'company' as 'national' | 'regional' | 'company',
        isOptional: false,
        description: '',
    });

    useEffect(() => {
        loadData();
    }, [currentUser]);

    const loadData = async () => {
        if (!currentUser) return;

        try {
            // Load leave applications
            const applicationsQuery = currentUser.role === 'employee'
                ? query(collection(db, 'leaveApplications'), where('employeeId', '==', currentUser.employeeId))
                : query(collection(db, 'leaveApplications'));
            const applicationsSnapshot = await getDocs(applicationsQuery);
            const applications = applicationsSnapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data(),
                startDate: doc.data().startDate?.toDate(),
                endDate: doc.data().endDate?.toDate(),
                appliedAt: doc.data().appliedAt?.toDate(),
                approvedAt: doc.data().approvedAt?.toDate(),
            })) as LeaveApplication[];
            setLeaveApplications(applications);

            // Use manual leave types
            setLeaveTypes(MANUAL_LEAVE_TYPES);

            // Load leave balances
            const balancesQuery = currentUser.role === 'employee'
                ? query(collection(db, 'leaveBalances'), where('employeeId', '==', currentUser.employeeId))
                : query(collection(db, 'leaveBalances'));
            const balancesSnapshot = await getDocs(balancesQuery);
            const balances = balancesSnapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data(),
                updatedAt: doc.data().updatedAt?.toDate(),
            })) as LeaveBalance[];
            setLeaveBalances(balances);

            // Load holidays
            const holidaysSnapshot = await getDocs(collection(db, 'holidays'));
            const holidaysList = holidaysSnapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data(),
                date: doc.data().date?.toDate(),
                createdAt: doc.data().createdAt?.toDate(),
            })) as Holiday[];
            setHolidays(holidaysList);

            // Load employees for all users to display names
            const employeesSnapshot = await getDocs(collection(db, 'employees'));
            const employeesList = employeesSnapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data(),
            })) as Employee[];
            setEmployees(employeesList);
        } catch (error) {
            console.error('Error loading leave data:', error);
        }
    };

    const handleApplyLeave = async () => {
        if (!currentUser || !applicationForm.leaveTypeId || !applicationForm.startDate || !applicationForm.endDate) {
            return;
        }

        try {
            const startDate = new Date(applicationForm.startDate);
            const endDate = new Date(applicationForm.endDate);
            const totalDays = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;

            // Use custom leave type if 'other' is selected
            const leaveTypeId = applicationForm.leaveTypeId === 'other' ? customLeaveType.trim() : applicationForm.leaveTypeId;
            if (!leaveTypeId) {
                // If custom leave type is empty, do not submit
                return;
            }

            const requestedDays = applicationForm.isHalfDay ? 0.5 : totalDays;

            // Check leave balance for non-custom leave types
            if (applicationForm.leaveTypeId !== 'other') {
                const balance = leaveBalances.find(
                    b => b.leaveTypeId === leaveTypeId && 
                    b.employeeId === (currentUser.employeeId || currentUser.uid)
                );
                
                const leaveType = leaveTypes.find(lt => lt.id === leaveTypeId);
                const availableBalance = balance?.remaining ?? leaveType?.maxDaysPerYear ?? 0;

                if (requestedDays > availableBalance) {
                    setLeaveBalanceError(`Insufficient leave balance. You have ${availableBalance} days remaining for ${leaveType?.name}.`);
                    return;
                }
            }

            setLeaveBalanceError('');

            const newApplication: Omit<LeaveApplication, 'id'> = {
                employeeId: currentUser.employeeId || currentUser.uid,
                leaveTypeId,
                startDate,
                endDate,
                totalDays: requestedDays,
                reason: applicationForm.reason,
                status: 'pending',
                appliedAt: new Date(),
                isHalfDay: applicationForm.isHalfDay,
                ...(applicationForm.isHalfDay && { halfDayType: applicationForm.halfDayType }),
            };

            await addDoc(collection(db, 'leaveApplications'), newApplication);
            setShowApplicationDialog(false);
            setLeaveBalanceError('');
            setApplicationForm({
                leaveTypeId: '',
                startDate: '',
                endDate: '',
                reason: '',
                isHalfDay: false,
                halfDayType: 'first-half',
            });
            setCustomLeaveType('');
            loadData();
        } catch (error) {
            console.error('Error applying for leave:', error);
        }
    };

    const handleApproveReject = async (applicationId: string, status: 'approved' | 'rejected', rejectionReason?: string) => {
        try {
            const application = leaveApplications.find(app => app.id === applicationId);
            if (!application) return;

            await updateDoc(doc(db, 'leaveApplications', applicationId), {
                status,
                approvedBy: currentUser?.uid,
                approvedAt: new Date(),
                ...(rejectionReason && { rejectionReason }),
            });

            // Update leave balance if approved
            if (status === 'approved' && application) {
                const balanceQuery = query(
                    collection(db, 'leaveBalances'),
                    where('employeeId', '==', application.employeeId),
                    where('leaveTypeId', '==', application.leaveTypeId)
                );
                const balanceSnapshot = await getDocs(balanceQuery);

                if (!balanceSnapshot.empty) {
                    // Update existing balance
                    const balanceDoc = balanceSnapshot.docs[0];
                    const currentBalance = balanceDoc.data();
                    const newUsed = (currentBalance.used || 0) + application.totalDays;
                    const newRemaining = (currentBalance.allocated || 0) - newUsed - (currentBalance.pending || 0);

                    await updateDoc(doc(db, 'leaveBalances', balanceDoc.id), {
                        used: newUsed,
                        remaining: newRemaining,
                        updatedAt: new Date(),
                    });
                } else {
                    // Create new balance record
                    const leaveType = leaveTypes.find(lt => lt.id === application.leaveTypeId);
                    const allocated = leaveType?.maxDaysPerYear || 0;
                    await addDoc(collection(db, 'leaveBalances'), {
                        employeeId: application.employeeId,
                        leaveTypeId: application.leaveTypeId,
                        allocated,
                        used: application.totalDays,
                        pending: 0,
                        remaining: allocated - application.totalDays,
                        updatedAt: new Date(),
                    });
                }
            }

            loadData();
        } catch (error) {
            console.error('Error updating leave application:', error);
        }
    };

    const handleCreateLeaveType = async () => {
        try {
            const newLeaveType: Omit<LeaveType, 'id'> = {
                ...leaveTypeForm,
                isActive: true,
                createdAt: new Date(),
                updatedAt: new Date(),
            };

            await addDoc(collection(db, 'leaveTypes'), newLeaveType);
            setShowLeaveTypeDialog(false);
            setLeaveTypeForm({
                name: '',
                code: '',
                maxDaysPerYear: 0,
                carryForward: false,
                maxCarryForwardDays: 0,
                color: '#6366f1',
            });
            loadData();
        } catch (error) {
            console.error('Error creating leave type:', error);
        }
    };

    const handleCreateHoliday = async () => {
        try {
            const newHoliday: Omit<Holiday, 'id'> = {
                ...holidayForm,
                date: new Date(holidayForm.date),
                createdAt: new Date(),
            };

            await addDoc(collection(db, 'holidays'), newHoliday);
            setShowHolidayDialog(false);
            setHolidayForm({
                name: '',
                date: '',
                type: 'company',
                isOptional: false,
                description: '',
            });
            loadData();
        } catch (error) {
            console.error('Error creating holiday:', error);
        }
    };

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'approved': return 'success';
            case 'rejected': return 'error';
            case 'pending': return 'warning';
            case 'cancelled': return 'default';
            default: return 'default';
        }
    };

    const getStatusChipProps = (status: string) => {
        switch (status) {
            case 'approved':
                return {
                    backgroundColor: 'rgba(16, 185, 129, 0.15)',
                    color: '#34d399',
                    border: '1px solid rgba(16, 185, 129, 0.3)',
                };
            case 'rejected':
                return {
                    backgroundColor: 'rgba(239, 68, 68, 0.15)',
                    color: '#f87171',
                    border: '1px solid rgba(239, 68, 68, 0.3)',
                };
            case 'pending':
                return {
                    backgroundColor: 'rgba(245, 158, 11, 0.15)',
                    color: '#fbbf24',
                    border: '1px solid rgba(245, 158, 11, 0.3)',
                };
            case 'cancelled':
            default:
                return {
                    backgroundColor: 'rgba(148, 163, 184, 0.15)',
                    color: '#94a3b8',
                    border: '1px solid rgba(148, 163, 184, 0.3)',
                };
        }
    };

    const getLeaveTypeName = (leaveTypeId: string) => {
        const leaveType = leaveTypes.find(type => type.id === leaveTypeId);
        return leaveType?.name || 'Unknown';
    };

    const getEmployeeName = (employeeId: string) => {
        const employee = employees.find(emp => emp.employeeId === employeeId || emp.id === employeeId);
        return employee?.fullName || 'Unknown Employee';
    };

    return (
        <Box>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: { xs: 'flex-start', sm: 'center' }, mb: 3.5, flexDirection: { xs: 'column', sm: 'row' }, gap: 2 }}>
                <Box>
                    <Typography
                        variant="h4"
                        sx={{
                            fontWeight: 700,
                            fontSize: { xs: '1.5rem', sm: '1.875rem' },
                            letterSpacing: '-0.02em',
                            background: 'linear-gradient(135deg, #f1f5f9 0%, #cbd5e1 100%)',
                            WebkitBackgroundClip: 'text',
                            WebkitTextFillColor: 'transparent',
                            mb: 0.5,
                        }}
                    >
                        Leave Management
                    </Typography>
                    <Typography variant="body2" sx={{ color: '#94a3b8' }}>
                        Track leave balances, submit requests, and manage company holidays
                    </Typography>
                </Box>
                <Button
                    variant="outlined"
                    startIcon={<Refresh />}
                    onClick={loadData}
                    sx={{
                        borderRadius: '12px',
                        borderColor: 'rgba(99, 102, 241, 0.35)',
                        backgroundColor: 'rgba(99, 102, 241, 0.06)',
                        color: '#a5b4fc',
                        fontWeight: 600,
                        px: 2,
                        py: 1,
                        textTransform: 'none',
                        backdropFilter: 'blur(10px)',
                        '&:hover': {
                            borderColor: 'rgba(99, 102, 241, 0.6)',
                            backgroundColor: 'rgba(99, 102, 241, 0.15)',
                            transform: 'translateY(-1px)',
                        },
                        transition: 'all 0.2s ease',
                    }}
                >
                    Refresh
                </Button>
            </Box>

            <Box
                sx={{
                    borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
                    mb: 3,
                    background: 'rgba(255, 255, 255, 0.02)',
                    borderRadius: '14px',
                    p: 0.5,
                    backdropFilter: 'blur(10px)',
                    WebkitBackdropFilter: 'blur(10px)',
                }}
            >
                <Tabs
                    value={tabValue}
                    onChange={(e, newValue) => setTabValue(newValue)}
                    sx={{
                        minHeight: 48,
                        '& .MuiTab-root': {
                            color: '#94a3b8',
                            fontWeight: 500,
                            fontSize: '0.875rem',
                            textTransform: 'none',
                            minHeight: 44,
                            borderRadius: '10px',
                            px: 2.5,
                            transition: 'all 0.2s ease',
                            '&:hover': {
                                color: '#c7d2fe',
                                backgroundColor: 'rgba(99, 102, 241, 0.08)',
                            },
                        },
                        '& .Mui-selected': {
                            color: '#a5b4fc !important',
                            fontWeight: 600,
                            backgroundColor: 'rgba(99, 102, 241, 0.12)',
                        },
                        '& .MuiTabs-indicator': {
                            backgroundColor: '#6366f1',
                            height: 3,
                            borderRadius: '3px 3px 0 0',
                        },
                    }}
                >
                    {currentUser?.role !== 'admin' && <Tab label="My Leaves" />}
                    {currentUser?.role !== 'admin' && <Tab label="Leave Balance" />}
                    {currentUser?.role !== 'employee' && <Tab label="All Applications" />}
                    {currentUser?.role === 'admin' && <Tab label="Leave Types" />}
                    {currentUser?.role === 'admin' && <Tab label="Holidays" />}
                </Tabs>
            </Box>

            {/* My Leaves Tab - Employees and Managers Only */}
            {currentUser?.role !== 'admin' && (
                <TabPanel value={tabValue} index={0}>
                    <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 2 }}>
                        <Typography variant="h6" sx={{ color: '#f1f5f9', fontWeight: 600 }}>
                            My Leave Applications
                        </Typography>
                        <Button
                            variant="contained"
                            startIcon={<Add />}
                            onClick={() => setShowApplicationDialog(true)}
                            sx={{
                                borderRadius: '12px',
                                background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)',
                                color: '#ffffff',
                                fontWeight: 600,
                                px: 2.5,
                                py: 1,
                                textTransform: 'none',
                                boxShadow: '6px 6px 14px rgba(0, 0, 0, 0.35), inset 2px 2px 4px rgba(255, 255, 255, 0.2)',
                                '&:hover': {
                                    background: 'linear-gradient(135deg, #4f46e5 0%, #4338ca 100%)',
                                    boxShadow: '4px 4px 10px rgba(0, 0, 0, 0.4), inset 2px 2px 4px rgba(255, 255, 255, 0.25)',
                                    transform: 'translateY(-1px)',
                                },
                                '&:active': {
                                    boxShadow: '2px 2px 4px rgba(0, 0, 0, 0.3), inset 3px 3px 6px rgba(0, 0, 0, 0.2)',
                                    transform: 'translateY(0)',
                                },
                                transition: 'all 0.2s ease',
                            }}
                        >
                            Apply for Leave
                        </Button>
                    </Box>

                    <TableContainer
                        component={Paper}
                        elevation={0}
                        sx={{
                            background: 'rgba(255, 255, 255, 0.02)',
                            backdropFilter: 'blur(20px)',
                            WebkitBackdropFilter: 'blur(20px)',
                            border: '1px solid rgba(255, 255, 255, 0.08)',
                            borderRadius: '16px',
                            overflow: 'hidden',
                            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.25)',
                        }}
                    >
                        <Table>
                            <TableHead
                                sx={{
                                    '& .MuiTableCell-root': {
                                        backgroundColor: 'rgba(255, 255, 255, 0.03)',
                                        borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
                                        color: '#94a3b8',
                                        fontWeight: 600,
                                        fontSize: '0.75rem',
                                        textTransform: 'uppercase',
                                        letterSpacing: '0.05em',
                                        py: 1.75,
                                    },
                                }}
                            >
                                <TableRow>
                                    <TableCell>Leave Type</TableCell>
                                    <TableCell>Start Date</TableCell>
                                    <TableCell>End Date</TableCell>
                                    <TableCell>Days</TableCell>
                                    <TableCell>Status</TableCell>
                                    <TableCell>Applied On</TableCell>
                                    <TableCell align="center">Actions</TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {leaveApplications
                                    .filter(app => app.employeeId === (currentUser?.employeeId || currentUser?.uid))
                                    .map((application) => (
                                        <TableRow
                                            key={application.id}
                                            sx={{
                                                '&:hover': {
                                                    backgroundColor: 'rgba(255, 255, 255, 0.03)',
                                                },
                                                '& .MuiTableCell-root': {
                                                    borderBottom: '1px solid rgba(255, 255, 255, 0.04)',
                                                    color: '#f1f5f9',
                                                    py: 1.5,
                                                },
                                            }}
                                        >
                                            <TableCell sx={{ fontWeight: 500 }}>
                                                {getLeaveTypeName(application.leaveTypeId)}
                                            </TableCell>
                                            <TableCell>{application.startDate?.toLocaleDateString()}</TableCell>
                                            <TableCell>{application.endDate?.toLocaleDateString()}</TableCell>
                                            <TableCell>{application.totalDays}</TableCell>
                                            <TableCell>
                                                <Chip
                                                    label={application.status}
                                                    size="small"
                                                    sx={{
                                                        fontWeight: 600,
                                                        fontSize: '0.75rem',
                                                        textTransform: 'capitalize',
                                                        backdropFilter: 'blur(10px)',
                                                        ...getStatusChipProps(application.status),
                                                    }}
                                                />
                                            </TableCell>
                                            <TableCell>{application.appliedAt?.toLocaleDateString()}</TableCell>
                                            <TableCell align="center">
                                                <Box sx={{ display: 'flex', gap: 1, justifyContent: 'center' }}>
                                                    <IconButton 
                                                        size="small"
                                                        onClick={() => {
                                                            setSelectedApplication(application);
                                                            setShowViewDialog(true);
                                                        }}
                                                        sx={{
                                                            color: '#a5b4fc',
                                                            backgroundColor: 'rgba(99, 102, 241, 0.08)',
                                                            border: '1px solid rgba(99, 102, 241, 0.2)',
                                                            borderRadius: '8px',
                                                            p: 0.75,
                                                            '&:hover': {
                                                                backgroundColor: 'rgba(99, 102, 241, 0.18)',
                                                                borderColor: 'rgba(99, 102, 241, 0.4)',
                                                            },
                                                        }}
                                                    >
                                                        <Visibility sx={{ fontSize: 18 }} />
                                                    </IconButton>
                                                    {application.status === 'pending' && (
                                                        <IconButton
                                                            size="small"
                                                            sx={{
                                                                color: '#f87171',
                                                                backgroundColor: 'rgba(239, 68, 68, 0.08)',
                                                                border: '1px solid rgba(239, 68, 68, 0.2)',
                                                                borderRadius: '8px',
                                                                p: 0.75,
                                                                '&:hover': {
                                                                    backgroundColor: 'rgba(239, 68, 68, 0.18)',
                                                                    borderColor: 'rgba(239, 68, 68, 0.4)',
                                                                },
                                                            }}
                                                        >
                                                            <Cancel sx={{ fontSize: 18 }} />
                                                        </IconButton>
                                                    )}
                                                </Box>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                            </TableBody>
                        </Table>
                    </TableContainer>
                </TabPanel>
            )}

            {/* Leave Balance Tab - Employees and Managers Only */}
            {currentUser?.role !== 'admin' && (
                <TabPanel value={tabValue} index={1}>
                    <Typography variant="h6" sx={{ mb: 3, color: '#f1f5f9', fontWeight: 600 }}>
                        Leave Balance
                    </Typography>
                    <Box
                        sx={{
                            display: 'grid',
                            gridTemplateColumns: {
                                xs: '1fr',
                                sm: 'repeat(2, 1fr)',
                                md: 'repeat(3, 1fr)',
                            },
                            gap: 3,
                        }}
                    >
                        {leaveTypes.map((leaveType) => {
                            const balance = leaveBalances.find(b => b.leaveTypeId === leaveType.id && b.employeeId === (currentUser?.employeeId || currentUser?.uid));
                            const allocated = balance?.allocated || leaveType.maxDaysPerYear;
                            const used = balance?.used || 0;
                            const pending = balance?.pending || 0;
                            const remaining = balance?.remaining || leaveType.maxDaysPerYear;
                            return (
                                <Box key={leaveType.id}>
                                    <Card
                                        elevation={0}
                                        sx={{
                                            background: 'rgba(255, 255, 255, 0.03)',
                                            backdropFilter: 'blur(20px)',
                                            WebkitBackdropFilter: 'blur(20px)',
                                            border: '1px solid rgba(255, 255, 255, 0.08)',
                                            borderRadius: '16px',
                                            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.2)',
                                            transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                                            position: 'relative',
                                            overflow: 'hidden',
                                            '&:hover': {
                                                transform: 'translateY(-3px)',
                                                borderColor: 'rgba(99, 102, 241, 0.35)',
                                                boxShadow: '0 14px 40px rgba(0, 0, 0, 0.35)',
                                            },
                                            '&::before': {
                                                content: '""',
                                                position: 'absolute',
                                                top: 0,
                                                left: 0,
                                                right: 0,
                                                height: '2px',
                                                background: `linear-gradient(90deg, transparent, ${leaveType.color || '#6366f1'}, transparent)`,
                                                opacity: 0.85,
                                            },
                                        }}
                                    >
                                        <CardContent sx={{ p: 2.5, '&:last-child': { pb: 2.5 } }}>
                                            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
                                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
                                                    <Box
                                                        sx={{
                                                            width: 12,
                                                            height: 12,
                                                            borderRadius: '50%',
                                                            backgroundColor: leaveType.color || '#6366f1',
                                                            boxShadow: `0 0 10px ${leaveType.color || '#6366f1'}`,
                                                        }}
                                                    />
                                                    <Typography variant="h6" sx={{ color: '#f1f5f9', fontWeight: 600 }}>
                                                        {leaveType.name}
                                                    </Typography>
                                                </Box>
                                                <Chip
                                                    label={leaveType.code}
                                                    size="small"
                                                    sx={{
                                                        backgroundColor: 'rgba(255, 255, 255, 0.05)',
                                                        color: '#94a3b8',
                                                        border: '1px solid rgba(255, 255, 255, 0.08)',
                                                        fontWeight: 600,
                                                        fontSize: '0.75rem',
                                                    }}
                                                />
                                            </Box>
                                            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, mb: 2 }}>
                                                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                                                    <Typography variant="body2" sx={{ color: '#94a3b8' }}>Allocated:</Typography>
                                                    <Typography variant="body2" sx={{ color: '#f1f5f9', fontWeight: 500 }}>{allocated} days</Typography>
                                                </Box>
                                                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                                                    <Typography variant="body2" sx={{ color: '#94a3b8' }}>Used:</Typography>
                                                    <Typography variant="body2" sx={{ color: '#f1f5f9', fontWeight: 500 }}>{used} days</Typography>
                                                </Box>
                                                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                                                    <Typography variant="body2" sx={{ color: '#94a3b8' }}>Pending:</Typography>
                                                    <Typography variant="body2" sx={{ color: '#f1f5f9', fontWeight: 500 }}>{pending} days</Typography>
                                                </Box>
                                            </Box>
                                            <Box
                                                sx={{
                                                    pt: 1.5,
                                                    borderTop: '1px solid rgba(255, 255, 255, 0.06)',
                                                    display: 'flex',
                                                    justifyContent: 'space-between',
                                                    alignItems: 'baseline',
                                                }}
                                            >
                                                <Typography variant="body2" sx={{ color: '#94a3b8', fontWeight: 600 }}>
                                                    Remaining:
                                                </Typography>
                                                <Typography
                                                    variant="h5"
                                                    sx={{
                                                        fontWeight: 700,
                                                        color: '#6366f1',
                                                        letterSpacing: '-0.02em',
                                                    }}
                                                >
                                                    {remaining} <Typography component="span" variant="body2" sx={{ color: '#94a3b8', fontWeight: 400 }}>days</Typography>
                                                </Typography>
                                            </Box>
                                        </CardContent>
                                    </Card>
                                </Box>
                            );
                        })}
                    </Box>
                </TabPanel>
            )}

            {/* All Applications Tab (Admin/Manager) */}
            {currentUser?.role !== 'employee' && (
                <TabPanel value={tabValue} index={currentUser?.role === 'admin' ? 0 : 2}>
                    <Typography variant="h6" sx={{ mb: 3, color: '#f1f5f9', fontWeight: 600 }}>
                        All Leave Applications
                    </Typography>
                    <TableContainer
                        component={Paper}
                        elevation={0}
                        sx={{
                            background: 'rgba(255, 255, 255, 0.02)',
                            backdropFilter: 'blur(20px)',
                            WebkitBackdropFilter: 'blur(20px)',
                            border: '1px solid rgba(255, 255, 255, 0.08)',
                            borderRadius: '16px',
                            overflow: 'hidden',
                            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.25)',
                        }}
                    >
                        <Table>
                            <TableHead
                                sx={{
                                    '& .MuiTableCell-root': {
                                        backgroundColor: 'rgba(255, 255, 255, 0.03)',
                                        borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
                                        color: '#94a3b8',
                                        fontWeight: 600,
                                        fontSize: '0.75rem',
                                        textTransform: 'uppercase',
                                        letterSpacing: '0.05em',
                                        py: 1.75,
                                    },
                                }}
                            >
                                <TableRow>
                                    <TableCell>Employee</TableCell>
                                    <TableCell>Leave Type</TableCell>
                                    <TableCell>Start Date</TableCell>
                                    <TableCell>End Date</TableCell>
                                    <TableCell>Days</TableCell>
                                    <TableCell>Status</TableCell>
                                    <TableCell align="center">Actions</TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {leaveApplications.map((application) => (
                                    <TableRow
                                        key={application.id}
                                        sx={{
                                            '&:hover': {
                                                backgroundColor: 'rgba(255, 255, 255, 0.03)',
                                            },
                                            '& .MuiTableCell-root': {
                                                borderBottom: '1px solid rgba(255, 255, 255, 0.04)',
                                                color: '#f1f5f9',
                                                py: 1.5,
                                            },
                                        }}
                                    >
                                        <TableCell sx={{ fontWeight: 500 }}>
                                            {getEmployeeName(application.employeeId)}
                                        </TableCell>
                                        <TableCell>{getLeaveTypeName(application.leaveTypeId)}</TableCell>
                                        <TableCell>{application.startDate?.toLocaleDateString()}</TableCell>
                                        <TableCell>{application.endDate?.toLocaleDateString()}</TableCell>
                                        <TableCell>{application.totalDays}</TableCell>
                                        <TableCell>
                                            <Chip
                                                label={application.status}
                                                size="small"
                                                sx={{
                                                    fontWeight: 600,
                                                    fontSize: '0.75rem',
                                                    textTransform: 'capitalize',
                                                    backdropFilter: 'blur(10px)',
                                                    ...getStatusChipProps(application.status),
                                                }}
                                            />
                                        </TableCell>
                                        <TableCell align="center">
                                            <Box sx={{ display: 'flex', gap: 1, justifyContent: 'center' }}>
                                                {currentUser?.role === 'admin' && application.status === 'pending' && (
                                                    <>
                                                        <IconButton
                                                            size="small"
                                                            onClick={() => handleApproveReject(application.id, 'approved')}
                                                            sx={{
                                                                color: '#34d399',
                                                                backgroundColor: 'rgba(16, 185, 129, 0.1)',
                                                                border: '1px solid rgba(16, 185, 129, 0.25)',
                                                                borderRadius: '8px',
                                                                p: 0.75,
                                                                '&:hover': {
                                                                    backgroundColor: 'rgba(16, 185, 129, 0.2)',
                                                                    borderColor: 'rgba(16, 185, 129, 0.4)',
                                                                },
                                                            }}
                                                        >
                                                            <CheckCircle sx={{ fontSize: 18 }} />
                                                        </IconButton>
                                                        <IconButton
                                                            size="small"
                                                            onClick={() => handleApproveReject(application.id, 'rejected', 'Rejected by admin')}
                                                            sx={{
                                                                color: '#f87171',
                                                                backgroundColor: 'rgba(239, 68, 68, 0.1)',
                                                                border: '1px solid rgba(239, 68, 68, 0.25)',
                                                                borderRadius: '8px',
                                                                p: 0.75,
                                                                '&:hover': {
                                                                    backgroundColor: 'rgba(239, 68, 68, 0.2)',
                                                                    borderColor: 'rgba(239, 68, 68, 0.4)',
                                                                },
                                                            }}
                                                        >
                                                            <Cancel sx={{ fontSize: 18 }} />
                                                        </IconButton>
                                                    </>
                                                )}
                                                <IconButton 
                                                    size="small"
                                                    onClick={() => {
                                                        setSelectedApplication(application);
                                                        setShowViewDialog(true);
                                                    }}
                                                    sx={{
                                                        color: '#a5b4fc',
                                                        backgroundColor: 'rgba(99, 102, 241, 0.08)',
                                                        border: '1px solid rgba(99, 102, 241, 0.2)',
                                                        borderRadius: '8px',
                                                        p: 0.75,
                                                        '&:hover': {
                                                            backgroundColor: 'rgba(99, 102, 241, 0.18)',
                                                            borderColor: 'rgba(99, 102, 241, 0.4)',
                                                        },
                                                    }}
                                                >
                                                    <Visibility sx={{ fontSize: 18 }} />
                                                </IconButton>
                                            </Box>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </TableContainer>
                </TabPanel>
            )}

            {/* Leave Types Tab (Admin) */}
            {currentUser?.role === 'admin' && (
                <TabPanel value={tabValue} index={1}>
                    <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 2 }}>
                        <Typography variant="h6" sx={{ color: '#f1f5f9', fontWeight: 600 }}>
                            Leave Types
                        </Typography>
                        <Button
                            variant="contained"
                            startIcon={<Add />}
                            onClick={() => setShowLeaveTypeDialog(true)}
                            sx={{
                                borderRadius: '12px',
                                background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)',
                                color: '#ffffff',
                                fontWeight: 600,
                                px: 2.5,
                                py: 1,
                                textTransform: 'none',
                                boxShadow: '6px 6px 14px rgba(0, 0, 0, 0.35), inset 2px 2px 4px rgba(255, 255, 255, 0.2)',
                                '&:hover': {
                                    background: 'linear-gradient(135deg, #4f46e5 0%, #4338ca 100%)',
                                    boxShadow: '4px 4px 10px rgba(0, 0, 0, 0.4), inset 2px 2px 4px rgba(255, 255, 255, 0.25)',
                                    transform: 'translateY(-1px)',
                                },
                                '&:active': {
                                    boxShadow: '2px 2px 4px rgba(0, 0, 0, 0.3), inset 3px 3px 6px rgba(0, 0, 0, 0.2)',
                                    transform: 'translateY(0)',
                                },
                                transition: 'all 0.2s ease',
                            }}
                        >
                            Add Leave Type
                        </Button>
                    </Box>

                    <Box
                        sx={{
                            display: 'grid',
                            gridTemplateColumns: {
                                xs: '1fr',
                                sm: 'repeat(2, 1fr)',
                                md: 'repeat(3, 1fr)',
                            },
                            gap: 3,
                        }}
                    >
                        {leaveTypes.map((leaveType) => (
                            <Box key={leaveType.id}>
                                <Card
                                    elevation={0}
                                    sx={{
                                        background: 'rgba(255, 255, 255, 0.03)',
                                        backdropFilter: 'blur(20px)',
                                        WebkitBackdropFilter: 'blur(20px)',
                                        border: '1px solid rgba(255, 255, 255, 0.08)',
                                        borderRadius: '16px',
                                        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.2)',
                                        transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                                        position: 'relative',
                                        overflow: 'hidden',
                                        '&:hover': {
                                            transform: 'translateY(-3px)',
                                            borderColor: 'rgba(99, 102, 241, 0.35)',
                                            boxShadow: '0 14px 40px rgba(0, 0, 0, 0.35)',
                                        },
                                        '&::before': {
                                            content: '""',
                                            position: 'absolute',
                                            top: 0,
                                            left: 0,
                                            right: 0,
                                            height: '2px',
                                            background: `linear-gradient(90deg, transparent, ${leaveType.color || '#6366f1'}, transparent)`,
                                            opacity: 0.85,
                                        },
                                    }}
                                >
                                    <CardContent sx={{ p: 2.5, '&:last-child': { pb: 2.5 } }}>
                                        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
                                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
                                                <Box
                                                    sx={{
                                                        width: 12,
                                                        height: 12,
                                                        borderRadius: '50%',
                                                        backgroundColor: leaveType.color || '#6366f1',
                                                        boxShadow: `0 0 10px ${leaveType.color || '#6366f1'}`,
                                                    }}
                                                />
                                                <Typography variant="h6" sx={{ color: '#f1f5f9', fontWeight: 600 }}>
                                                    {leaveType.name}
                                                </Typography>
                                            </Box>
                                            <Box sx={{ display: 'flex', gap: 0.5 }}>
                                                <IconButton
                                                    size="small"
                                                    sx={{
                                                        color: '#a5b4fc',
                                                        backgroundColor: 'rgba(99, 102, 241, 0.08)',
                                                        borderRadius: '8px',
                                                        p: 0.75,
                                                        '&:hover': {
                                                            backgroundColor: 'rgba(99, 102, 241, 0.18)',
                                                        },
                                                    }}
                                                >
                                                    <Edit sx={{ fontSize: 18 }} />
                                                </IconButton>
                                                <IconButton
                                                    size="small"
                                                    sx={{
                                                        color: '#f87171',
                                                        backgroundColor: 'rgba(239, 68, 68, 0.08)',
                                                        borderRadius: '8px',
                                                        p: 0.75,
                                                        '&:hover': {
                                                            backgroundColor: 'rgba(239, 68, 68, 0.18)',
                                                        },
                                                    }}
                                                >
                                                    <Delete sx={{ fontSize: 18 }} />
                                                </IconButton>
                                            </Box>
                                        </Box>
                                        <Typography variant="body2" sx={{ color: '#94a3b8', mb: 1 }}>
                                            Code: <strong style={{ color: '#f1f5f9' }}>{leaveType.code}</strong>
                                        </Typography>
                                        <Typography variant="body2" sx={{ color: '#94a3b8', mb: 1 }}>
                                            Max Days: <strong style={{ color: '#f1f5f9' }}>{leaveType.maxDaysPerYear}</strong> per year
                                        </Typography>
                                        <Typography variant="body2" sx={{ color: '#94a3b8' }}>
                                            Carry Forward: <strong style={{ color: '#f1f5f9' }}>{leaveType.carryForward ? 'Yes' : 'No'}</strong>
                                        </Typography>
                                    </CardContent>
                                </Card>
                            </Box>
                        ))}
                    </Box>
                </TabPanel>
            )}

            {/* Holidays Tab (Admin) */}
            {currentUser?.role === 'admin' && (
                <TabPanel value={tabValue} index={2}>
                    <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 2 }}>
                        <Typography variant="h6" sx={{ color: '#f1f5f9', fontWeight: 600 }}>
                            Holidays
                        </Typography>
                        <Button
                            variant="contained"
                            startIcon={<CalendarToday />}
                            onClick={() => setShowHolidayDialog(true)}
                            sx={{
                                borderRadius: '12px',
                                background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)',
                                color: '#ffffff',
                                fontWeight: 600,
                                px: 2.5,
                                py: 1,
                                textTransform: 'none',
                                boxShadow: '6px 6px 14px rgba(0, 0, 0, 0.35), inset 2px 2px 4px rgba(255, 255, 255, 0.2)',
                                '&:hover': {
                                    background: 'linear-gradient(135deg, #4f46e5 0%, #4338ca 100%)',
                                    boxShadow: '4px 4px 10px rgba(0, 0, 0, 0.4), inset 2px 2px 4px rgba(255, 255, 255, 0.25)',
                                    transform: 'translateY(-1px)',
                                },
                                '&:active': {
                                    boxShadow: '2px 2px 4px rgba(0, 0, 0, 0.3), inset 3px 3px 6px rgba(0, 0, 0, 0.2)',
                                    transform: 'translateY(0)',
                                },
                                transition: 'all 0.2s ease',
                            }}
                        >
                            Add Holiday
                        </Button>
                    </Box>

                    <TableContainer
                        component={Paper}
                        elevation={0}
                        sx={{
                            background: 'rgba(255, 255, 255, 0.02)',
                            backdropFilter: 'blur(20px)',
                            WebkitBackdropFilter: 'blur(20px)',
                            border: '1px solid rgba(255, 255, 255, 0.08)',
                            borderRadius: '16px',
                            overflow: 'hidden',
                            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.25)',
                        }}
                    >
                        <Table>
                            <TableHead
                                sx={{
                                    '& .MuiTableCell-root': {
                                        backgroundColor: 'rgba(255, 255, 255, 0.03)',
                                        borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
                                        color: '#94a3b8',
                                        fontWeight: 600,
                                        fontSize: '0.75rem',
                                        textTransform: 'uppercase',
                                        letterSpacing: '0.05em',
                                        py: 1.75,
                                    },
                                }}
                            >
                                <TableRow>
                                    <TableCell>Holiday Name</TableCell>
                                    <TableCell>Date</TableCell>
                                    <TableCell>Type</TableCell>
                                    <TableCell>Optional</TableCell>
                                    <TableCell align="center">Actions</TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {holidays.map((holiday) => (
                                    <TableRow
                                        key={holiday.id}
                                        sx={{
                                            '&:hover': {
                                                backgroundColor: 'rgba(255, 255, 255, 0.03)',
                                            },
                                            '& .MuiTableCell-root': {
                                                borderBottom: '1px solid rgba(255, 255, 255, 0.04)',
                                                color: '#f1f5f9',
                                                py: 1.5,
                                            },
                                        }}
                                    >
                                        <TableCell sx={{ fontWeight: 500 }}>{holiday.name}</TableCell>
                                        <TableCell>{holiday.date?.toLocaleDateString()}</TableCell>
                                        <TableCell>
                                            <Chip
                                                label={holiday.type}
                                                size="small"
                                                sx={{
                                                    backgroundColor: 'rgba(99, 102, 241, 0.15)',
                                                    color: '#a5b4fc',
                                                    border: '1px solid rgba(99, 102, 241, 0.25)',
                                                    fontWeight: 500,
                                                    textTransform: 'capitalize',
                                                }}
                                            />
                                        </TableCell>
                                        <TableCell>{holiday.isOptional ? 'Yes' : 'No'}</TableCell>
                                        <TableCell align="center">
                                            <Box sx={{ display: 'flex', gap: 1, justifyContent: 'center' }}>
                                                <IconButton
                                                    size="small"
                                                    sx={{
                                                        color: '#a5b4fc',
                                                        backgroundColor: 'rgba(99, 102, 241, 0.08)',
                                                        borderRadius: '8px',
                                                        p: 0.75,
                                                        '&:hover': {
                                                            backgroundColor: 'rgba(99, 102, 241, 0.18)',
                                                        },
                                                    }}
                                                >
                                                    <Edit sx={{ fontSize: 18 }} />
                                                </IconButton>
                                                <IconButton
                                                    size="small"
                                                    sx={{
                                                        color: '#f87171',
                                                        backgroundColor: 'rgba(239, 68, 68, 0.08)',
                                                        borderRadius: '8px',
                                                        p: 0.75,
                                                        '&:hover': {
                                                            backgroundColor: 'rgba(239, 68, 68, 0.18)',
                                                        },
                                                    }}
                                                >
                                                    <Delete sx={{ fontSize: 18 }} />
                                                </IconButton>
                                            </Box>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </TableContainer>
                </TabPanel>
            )}

            {/* View Leave Details Dialog */}
            <Dialog
                open={showViewDialog}
                onClose={() => setShowViewDialog(false)}
                maxWidth="sm"
                fullWidth
                PaperProps={{
                    sx: {
                        background: 'rgba(15, 23, 42, 0.95)',
                        backdropFilter: 'blur(40px)',
                        WebkitBackdropFilter: 'blur(40px)',
                        border: '1px solid rgba(255, 255, 255, 0.1)',
                        borderRadius: '20px',
                        boxShadow: '0 25px 60px rgba(0, 0, 0, 0.5)',
                        color: '#f1f5f9',
                    },
                }}
            >
                <DialogTitle sx={{ color: '#f1f5f9', fontWeight: 600, borderBottom: '1px solid rgba(255, 255, 255, 0.08)', pb: 2 }}>
                    Leave Application Details
                </DialogTitle>
                <DialogContent sx={{ pt: 3 }}>
                    {selectedApplication && (
                        <Box sx={{ mt: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
                            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                                <Typography variant="body2" sx={{ color: '#94a3b8' }}>Employee:</Typography>
                                <Typography variant="body2" sx={{ color: '#f1f5f9', fontWeight: 600 }}>
                                    {getEmployeeName(selectedApplication.employeeId)}
                                </Typography>
                            </Box>
                            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                                <Typography variant="body2" sx={{ color: '#94a3b8' }}>Leave Type:</Typography>
                                <Typography variant="body2" sx={{ color: '#f1f5f9', fontWeight: 500 }}>
                                    {getLeaveTypeName(selectedApplication.leaveTypeId)}
                                </Typography>
                            </Box>
                            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                                <Typography variant="body2" sx={{ color: '#94a3b8' }}>Start Date:</Typography>
                                <Typography variant="body2" sx={{ color: '#f1f5f9', fontWeight: 500 }}>
                                    {selectedApplication.startDate?.toLocaleDateString()}
                                </Typography>
                            </Box>
                            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                                <Typography variant="body2" sx={{ color: '#94a3b8' }}>End Date:</Typography>
                                <Typography variant="body2" sx={{ color: '#f1f5f9', fontWeight: 500 }}>
                                    {selectedApplication.endDate?.toLocaleDateString()}
                                </Typography>
                            </Box>
                            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                                <Typography variant="body2" sx={{ color: '#94a3b8' }}>Total Days:</Typography>
                                <Typography variant="body2" sx={{ color: '#f1f5f9', fontWeight: 600 }}>
                                    {selectedApplication.totalDays}
                                </Typography>
                            </Box>
                            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                                <Typography variant="body2" sx={{ color: '#94a3b8' }}>Reason:</Typography>
                                <Typography variant="body2" sx={{ color: '#f1f5f9', maxWidth: '60%', textAlign: 'right' }}>
                                    {selectedApplication.reason || 'N/A'}
                                </Typography>
                            </Box>
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <Typography variant="body2" sx={{ color: '#94a3b8' }}>Status:</Typography>
                                <Chip 
                                    label={selectedApplication.status} 
                                    size="small"
                                    sx={{
                                        fontWeight: 600,
                                        fontSize: '0.75rem',
                                        textTransform: 'capitalize',
                                        ...getStatusChipProps(selectedApplication.status),
                                    }}
                                />
                            </Box>
                            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                                <Typography variant="body2" sx={{ color: '#94a3b8' }}>Applied On:</Typography>
                                <Typography variant="body2" sx={{ color: '#f1f5f9' }}>
                                    {selectedApplication.appliedAt?.toLocaleDateString()}
                                </Typography>
                            </Box>
                            {selectedApplication.approvedAt && (
                                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <Typography variant="body2" sx={{ color: '#94a3b8' }}>Approved/Rejected On:</Typography>
                                    <Typography variant="body2" sx={{ color: '#f1f5f9' }}>
                                        {selectedApplication.approvedAt?.toLocaleDateString()}
                                    </Typography>
                                </Box>
                            )}
                            {selectedApplication.rejectionReason && (
                                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <Typography variant="body2" sx={{ color: '#f87171' }}>Rejection Reason:</Typography>
                                    <Typography variant="body2" sx={{ color: '#f87171' }}>
                                        {selectedApplication.rejectionReason}
                                    </Typography>
                                </Box>
                            )}
                            {selectedApplication.isHalfDay && (
                                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <Typography variant="body2" sx={{ color: '#94a3b8' }}>Half Day:</Typography>
                                    <Typography variant="body2" sx={{ color: '#f1f5f9' }}>
                                        {selectedApplication.halfDayType === 'first-half' ? 'First Half' : 'Second Half'}
                                    </Typography>
                                </Box>
                            )}
                        </Box>
                    )}
                </DialogContent>
                <DialogActions sx={{ p: 2.5, borderTop: '1px solid rgba(255, 255, 255, 0.08)' }}>
                    <Button
                        onClick={() => setShowViewDialog(false)}
                        sx={{
                            color: '#94a3b8',
                            borderRadius: '10px',
                            px: 2.5,
                            textTransform: 'none',
                            '&:hover': {
                                color: '#f1f5f9',
                                backgroundColor: 'rgba(255, 255, 255, 0.05)',
                            },
                        }}
                    >
                        Close
                    </Button>
                </DialogActions>
            </Dialog>

            {/* Apply Leave Dialog */}
            <Dialog
                open={showApplicationDialog}
                onClose={() => setShowApplicationDialog(false)}
                maxWidth="sm"
                fullWidth
                PaperProps={{
                    sx: {
                        background: 'rgba(15, 23, 42, 0.95)',
                        backdropFilter: 'blur(40px)',
                        WebkitBackdropFilter: 'blur(40px)',
                        border: '1px solid rgba(255, 255, 255, 0.1)',
                        borderRadius: '20px',
                        boxShadow: '0 25px 60px rgba(0, 0, 0, 0.5)',
                        color: '#f1f5f9',
                    },
                }}
            >
                <DialogTitle sx={{ color: '#f1f5f9', fontWeight: 600, borderBottom: '1px solid rgba(255, 255, 255, 0.08)', pb: 2 }}>
                    Apply for Leave
                </DialogTitle>
                <DialogContent sx={{ pt: 3 }}>
                    <FormControl
                        fullWidth
                        sx={{
                            mt: 2,
                            mb: 2.5,
                            '& .MuiOutlinedInput-root': {
                                backgroundColor: 'rgba(255, 255, 255, 0.03)',
                                backdropFilter: 'blur(10px)',
                                borderRadius: '12px',
                                color: '#f1f5f9',
                                '& fieldset': {
                                    borderColor: 'rgba(255, 255, 255, 0.1)',
                                },
                                '&:hover fieldset': {
                                    borderColor: 'rgba(99, 102, 241, 0.35)',
                                },
                                '&.Mui-focused fieldset': {
                                    borderColor: '#6366f1',
                                    boxShadow: '0 0 0 3px rgba(99, 102, 241, 0.15)',
                                },
                            },
                            '& .MuiInputLabel-root': {
                                color: '#94a3b8',
                                '&.Mui-focused': { color: '#818cf8' },
                            },
                            '& .MuiSelect-icon': { color: '#94a3b8' },
                        }}
                    >
                        <InputLabel>Leave Type</InputLabel>
                        <Select
                            value={applicationForm.leaveTypeId}
                            onChange={(e) => setApplicationForm({ ...applicationForm, leaveTypeId: e.target.value })}
                            label="Leave Type"
                            MenuProps={{
                                PaperProps: {
                                    sx: {
                                        backgroundColor: 'rgba(15, 23, 42, 0.95)',
                                        backdropFilter: 'blur(24px)',
                                        border: '1px solid rgba(255, 255, 255, 0.1)',
                                        borderRadius: '12px',
                                        '& .MuiMenuItem-root': {
                                            color: '#f1f5f9',
                                            '&:hover': {
                                                backgroundColor: 'rgba(99, 102, 241, 0.12)',
                                            },
                                            '&.Mui-selected': {
                                                backgroundColor: 'rgba(99, 102, 241, 0.2)',
                                            },
                                        },
                                    },
                                },
                            }}
                        >
                            {leaveTypes.map((type) => (
                                <MenuItem key={type.id} value={type.id}>
                                    {type.name}
                                </MenuItem>
                            ))}
                        </Select>
                    </FormControl>

                    {applicationForm.leaveTypeId === 'other' && (
                        <TextField
                            fullWidth
                            label="Custom Leave Type"
                            value={customLeaveType}
                            onChange={(e) => setCustomLeaveType(e.target.value)}
                            sx={{
                                mb: 2.5,
                                '& .MuiOutlinedInput-root': {
                                    backgroundColor: 'rgba(255, 255, 255, 0.03)',
                                    borderRadius: '12px',
                                    color: '#f1f5f9',
                                    '& fieldset': { borderColor: 'rgba(255, 255, 255, 0.1)' },
                                    '&:hover fieldset': { borderColor: 'rgba(99, 102, 241, 0.35)' },
                                    '&.Mui-focused fieldset': { borderColor: '#6366f1' },
                                },
                                '& .MuiInputLabel-root': {
                                    color: '#94a3b8',
                                    '&.Mui-focused': { color: '#818cf8' },
                                },
                            }}
                        />
                    )}

                    <TextField
                        fullWidth
                        type="date"
                        label="Start Date"
                        value={applicationForm.startDate}
                        onChange={(e) => setApplicationForm({ ...applicationForm, startDate: e.target.value, endDate: '' })}
                        sx={{
                            mb: 2.5,
                            '& .MuiOutlinedInput-root': {
                                backgroundColor: 'rgba(255, 255, 255, 0.03)',
                                borderRadius: '12px',
                                color: '#f1f5f9',
                                '& fieldset': { borderColor: 'rgba(255, 255, 255, 0.1)' },
                                '&:hover fieldset': { borderColor: 'rgba(99, 102, 241, 0.35)' },
                                '&.Mui-focused fieldset': { borderColor: '#6366f1' },
                            },
                            '& .MuiInputLabel-root': {
                                color: '#94a3b8',
                                '&.Mui-focused': { color: '#818cf8' },
                            },
                        }}
                        InputLabelProps={{ shrink: true }}
                        inputProps={{
                            min: new Date().toISOString().split('T')[0]
                        }}
                    />

                    <TextField
                        fullWidth
                        type="date"
                        label="End Date"
                        value={applicationForm.endDate}
                        onChange={(e) => setApplicationForm({ ...applicationForm, endDate: e.target.value })}
                        sx={{
                            mb: 2.5,
                            '& .MuiOutlinedInput-root': {
                                backgroundColor: 'rgba(255, 255, 255, 0.03)',
                                borderRadius: '12px',
                                color: '#f1f5f9',
                                '& fieldset': { borderColor: 'rgba(255, 255, 255, 0.1)' },
                                '&:hover fieldset': { borderColor: 'rgba(99, 102, 241, 0.35)' },
                                '&.Mui-focused fieldset': { borderColor: '#6366f1' },
                            },
                            '& .MuiInputLabel-root': {
                                color: '#94a3b8',
                                '&.Mui-focused': { color: '#818cf8' },
                            },
                            '& .MuiFormHelperText-root': { color: '#94a3b8' },
                        }}
                        InputLabelProps={{ shrink: true }}
                        disabled={!applicationForm.startDate}
                        inputProps={{
                            min: applicationForm.startDate ? new Date(new Date(applicationForm.startDate).getTime() + 24 * 60 * 60 * 1000).toISOString().split('T')[0] : undefined
                        }}
                        helperText={!applicationForm.startDate ? "Please select start date first" : ""}
                    />

                    <TextField
                        fullWidth
                        multiline
                        rows={3}
                        label="Reason"
                        value={applicationForm.reason}
                        onChange={(e) => setApplicationForm({ ...applicationForm, reason: e.target.value })}
                        sx={{
                            mb: 2.5,
                            '& .MuiOutlinedInput-root': {
                                backgroundColor: 'rgba(255, 255, 255, 0.03)',
                                borderRadius: '12px',
                                color: '#f1f5f9',
                                '& fieldset': { borderColor: 'rgba(255, 255, 255, 0.1)' },
                                '&:hover fieldset': { borderColor: 'rgba(99, 102, 241, 0.35)' },
                                '&.Mui-focused fieldset': { borderColor: '#6366f1' },
                            },
                            '& .MuiInputLabel-root': {
                                color: '#94a3b8',
                                '&.Mui-focused': { color: '#818cf8' },
                            },
                        }}
                    />

                    {leaveBalanceError && (
                        <Alert
                            severity="error"
                            sx={{
                                mb: 2,
                                borderRadius: '12px',
                                background: 'rgba(239, 68, 68, 0.1)',
                                border: '1px solid rgba(239, 68, 68, 0.25)',
                                color: '#fca5a5',
                            }}
                        >
                            {leaveBalanceError}
                        </Alert>
                    )}
                </DialogContent>
                <DialogActions sx={{ p: 2.5, borderTop: '1px solid rgba(255, 255, 255, 0.08)' }}>
                    <Button
                        onClick={() => {
                            setShowApplicationDialog(false);
                            setLeaveBalanceError('');
                        }}
                        sx={{
                            color: '#94a3b8',
                            borderRadius: '10px',
                            px: 2,
                            textTransform: 'none',
                            '&:hover': {
                                color: '#f1f5f9',
                                backgroundColor: 'rgba(255, 255, 255, 0.05)',
                            },
                        }}
                    >
                        Cancel
                    </Button>
                    <Button
                        onClick={handleApplyLeave}
                        variant="contained"
                        sx={{
                            borderRadius: '10px',
                            background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)',
                            color: '#ffffff',
                            fontWeight: 600,
                            px: 2.5,
                            py: 0.75,
                            textTransform: 'none',
                            boxShadow: '0 4px 14px rgba(99, 102, 241, 0.35)',
                            '&:hover': {
                                background: 'linear-gradient(135deg, #4f46e5 0%, #4338ca 100%)',
                            },
                        }}
                    >
                        Apply
                    </Button>
                </DialogActions>
            </Dialog>

            {/* Add Leave Type Dialog */}
            <Dialog
                open={showLeaveTypeDialog}
                onClose={() => setShowLeaveTypeDialog(false)}
                maxWidth="sm"
                fullWidth
                PaperProps={{
                    sx: {
                        background: 'rgba(15, 23, 42, 0.95)',
                        backdropFilter: 'blur(40px)',
                        WebkitBackdropFilter: 'blur(40px)',
                        border: '1px solid rgba(255, 255, 255, 0.1)',
                        borderRadius: '20px',
                        boxShadow: '0 25px 60px rgba(0, 0, 0, 0.5)',
                        color: '#f1f5f9',
                    },
                }}
            >
                <DialogTitle sx={{ color: '#f1f5f9', fontWeight: 600, borderBottom: '1px solid rgba(255, 255, 255, 0.08)', pb: 2 }}>
                    Add Leave Type
                </DialogTitle>
                <DialogContent sx={{ pt: 3 }}>
                    <TextField
                        fullWidth
                        label="Leave Type Name"
                        value={leaveTypeForm.name}
                        onChange={(e) => setLeaveTypeForm({ ...leaveTypeForm, name: e.target.value })}
                        sx={{
                            mt: 2,
                            mb: 2.5,
                            '& .MuiOutlinedInput-root': {
                                backgroundColor: 'rgba(255, 255, 255, 0.03)',
                                borderRadius: '12px',
                                color: '#f1f5f9',
                                '& fieldset': { borderColor: 'rgba(255, 255, 255, 0.1)' },
                                '&:hover fieldset': { borderColor: 'rgba(99, 102, 241, 0.35)' },
                                '&.Mui-focused fieldset': { borderColor: '#6366f1' },
                            },
                            '& .MuiInputLabel-root': {
                                color: '#94a3b8',
                                '&.Mui-focused': { color: '#818cf8' },
                            },
                        }}
                    />

                    <TextField
                        fullWidth
                        label="Code"
                        value={leaveTypeForm.code}
                        onChange={(e) => setLeaveTypeForm({ ...leaveTypeForm, code: e.target.value })}
                        sx={{
                            mb: 2.5,
                            '& .MuiOutlinedInput-root': {
                                backgroundColor: 'rgba(255, 255, 255, 0.03)',
                                borderRadius: '12px',
                                color: '#f1f5f9',
                                '& fieldset': { borderColor: 'rgba(255, 255, 255, 0.1)' },
                                '&:hover fieldset': { borderColor: 'rgba(99, 102, 241, 0.35)' },
                                '&.Mui-focused fieldset': { borderColor: '#6366f1' },
                            },
                            '& .MuiInputLabel-root': {
                                color: '#94a3b8',
                                '&.Mui-focused': { color: '#818cf8' },
                            },
                        }}
                    />

                    <TextField
                        fullWidth
                        type="number"
                        label="Max Days Per Year"
                        value={leaveTypeForm.maxDaysPerYear}
                        onChange={(e) => setLeaveTypeForm({ ...leaveTypeForm, maxDaysPerYear: parseInt(e.target.value) })}
                        sx={{
                            mb: 2.5,
                            '& .MuiOutlinedInput-root': {
                                backgroundColor: 'rgba(255, 255, 255, 0.03)',
                                borderRadius: '12px',
                                color: '#f1f5f9',
                                '& fieldset': { borderColor: 'rgba(255, 255, 255, 0.1)' },
                                '&:hover fieldset': { borderColor: 'rgba(99, 102, 241, 0.35)' },
                                '&.Mui-focused fieldset': { borderColor: '#6366f1' },
                            },
                            '& .MuiInputLabel-root': {
                                color: '#94a3b8',
                                '&.Mui-focused': { color: '#818cf8' },
                            },
                        }}
                    />

                    <TextField
                        fullWidth
                        type="color"
                        label="Color"
                        value={leaveTypeForm.color}
                        onChange={(e) => setLeaveTypeForm({ ...leaveTypeForm, color: e.target.value })}
                        sx={{
                            mb: 2.5,
                            '& .MuiOutlinedInput-root': {
                                backgroundColor: 'rgba(255, 255, 255, 0.03)',
                                borderRadius: '12px',
                                color: '#f1f5f9',
                                '& fieldset': { borderColor: 'rgba(255, 255, 255, 0.1)' },
                                '&:hover fieldset': { borderColor: 'rgba(99, 102, 241, 0.35)' },
                                '&.Mui-focused fieldset': { borderColor: '#6366f1' },
                            },
                            '& .MuiInputLabel-root': {
                                color: '#94a3b8',
                                '&.Mui-focused': { color: '#818cf8' },
                            },
                        }}
                    />
                </DialogContent>
                <DialogActions sx={{ p: 2.5, borderTop: '1px solid rgba(255, 255, 255, 0.08)' }}>
                    <Button
                        onClick={() => setShowLeaveTypeDialog(false)}
                        sx={{
                            color: '#94a3b8',
                            borderRadius: '10px',
                            px: 2,
                            textTransform: 'none',
                            '&:hover': {
                                color: '#f1f5f9',
                                backgroundColor: 'rgba(255, 255, 255, 0.05)',
                            },
                        }}
                    >
                        Cancel
                    </Button>
                    <Button
                        onClick={handleCreateLeaveType}
                        variant="contained"
                        sx={{
                            borderRadius: '10px',
                            background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)',
                            color: '#ffffff',
                            fontWeight: 600,
                            px: 2.5,
                            py: 0.75,
                            textTransform: 'none',
                            boxShadow: '0 4px 14px rgba(99, 102, 241, 0.35)',
                            '&:hover': {
                                background: 'linear-gradient(135deg, #4f46e5 0%, #4338ca 100%)',
                            },
                        }}
                    >
                        Create
                    </Button>
                </DialogActions>
            </Dialog>

            {/* Add Holiday Dialog */}
            <Dialog
                open={showHolidayDialog}
                onClose={() => setShowHolidayDialog(false)}
                maxWidth="sm"
                fullWidth
                PaperProps={{
                    sx: {
                        background: 'rgba(15, 23, 42, 0.95)',
                        backdropFilter: 'blur(40px)',
                        WebkitBackdropFilter: 'blur(40px)',
                        border: '1px solid rgba(255, 255, 255, 0.1)',
                        borderRadius: '20px',
                        boxShadow: '0 25px 60px rgba(0, 0, 0, 0.5)',
                        color: '#f1f5f9',
                    },
                }}
            >
                <DialogTitle sx={{ color: '#f1f5f9', fontWeight: 600, borderBottom: '1px solid rgba(255, 255, 255, 0.08)', pb: 2 }}>
                    Add Holiday
                </DialogTitle>
                <DialogContent sx={{ pt: 3 }}>
                    <TextField
                        fullWidth
                        label="Holiday Name"
                        value={holidayForm.name}
                        onChange={(e) => setHolidayForm({ ...holidayForm, name: e.target.value })}
                        sx={{
                            mt: 2,
                            mb: 2.5,
                            '& .MuiOutlinedInput-root': {
                                backgroundColor: 'rgba(255, 255, 255, 0.03)',
                                borderRadius: '12px',
                                color: '#f1f5f9',
                                '& fieldset': { borderColor: 'rgba(255, 255, 255, 0.1)' },
                                '&:hover fieldset': { borderColor: 'rgba(99, 102, 241, 0.35)' },
                                '&.Mui-focused fieldset': { borderColor: '#6366f1' },
                            },
                            '& .MuiInputLabel-root': {
                                color: '#94a3b8',
                                '&.Mui-focused': { color: '#818cf8' },
                            },
                        }}
                    />

                    <TextField
                        fullWidth
                        type="date"
                        label="Date"
                        value={holidayForm.date}
                        onChange={(e) => setHolidayForm({ ...holidayForm, date: e.target.value })}
                        sx={{
                            mb: 2.5,
                            '& .MuiOutlinedInput-root': {
                                backgroundColor: 'rgba(255, 255, 255, 0.03)',
                                borderRadius: '12px',
                                color: '#f1f5f9',
                                '& fieldset': { borderColor: 'rgba(255, 255, 255, 0.1)' },
                                '&:hover fieldset': { borderColor: 'rgba(99, 102, 241, 0.35)' },
                                '&.Mui-focused fieldset': { borderColor: '#6366f1' },
                            },
                            '& .MuiInputLabel-root': {
                                color: '#94a3b8',
                                '&.Mui-focused': { color: '#818cf8' },
                            },
                        }}
                        InputLabelProps={{ shrink: true }}
                    />

                    <FormControl
                        fullWidth
                        sx={{
                            mb: 2.5,
                            '& .MuiOutlinedInput-root': {
                                backgroundColor: 'rgba(255, 255, 255, 0.03)',
                                borderRadius: '12px',
                                color: '#f1f5f9',
                                '& fieldset': { borderColor: 'rgba(255, 255, 255, 0.1)' },
                                '&:hover fieldset': { borderColor: 'rgba(99, 102, 241, 0.35)' },
                                '&.Mui-focused fieldset': { borderColor: '#6366f1' },
                            },
                            '& .MuiInputLabel-root': {
                                color: '#94a3b8',
                                '&.Mui-focused': { color: '#818cf8' },
                            },
                            '& .MuiSelect-icon': { color: '#94a3b8' },
                        }}
                    >
                        <InputLabel>Type</InputLabel>
                        <Select
                            value={holidayForm.type}
                            onChange={(e) => setHolidayForm({ ...holidayForm, type: e.target.value as any })}
                            label="Type"
                            MenuProps={{
                                PaperProps: {
                                    sx: {
                                        backgroundColor: 'rgba(15, 23, 42, 0.95)',
                                        backdropFilter: 'blur(24px)',
                                        border: '1px solid rgba(255, 255, 255, 0.1)',
                                        borderRadius: '12px',
                                        '& .MuiMenuItem-root': {
                                            color: '#f1f5f9',
                                            '&:hover': {
                                                backgroundColor: 'rgba(99, 102, 241, 0.12)',
                                            },
                                            '&.Mui-selected': {
                                                backgroundColor: 'rgba(99, 102, 241, 0.2)',
                                            },
                                        },
                                    },
                                },
                            }}
                        >
                            <MenuItem value="national">National</MenuItem>
                            <MenuItem value="regional">Regional</MenuItem>
                            <MenuItem value="company">Company</MenuItem>
                        </Select>
                    </FormControl>

                    <TextField
                        fullWidth
                        multiline
                        rows={2}
                        label="Description"
                        value={holidayForm.description}
                        onChange={(e) => setHolidayForm({ ...holidayForm, description: e.target.value })}
                        sx={{
                            mb: 2.5,
                            '& .MuiOutlinedInput-root': {
                                backgroundColor: 'rgba(255, 255, 255, 0.03)',
                                borderRadius: '12px',
                                color: '#f1f5f9',
                                '& fieldset': { borderColor: 'rgba(255, 255, 255, 0.1)' },
                                '&:hover fieldset': { borderColor: 'rgba(99, 102, 241, 0.35)' },
                                '&.Mui-focused fieldset': { borderColor: '#6366f1' },
                            },
                            '& .MuiInputLabel-root': {
                                color: '#94a3b8',
                                '&.Mui-focused': { color: '#818cf8' },
                            },
                        }}
                    />
                </DialogContent>
                <DialogActions sx={{ p: 2.5, borderTop: '1px solid rgba(255, 255, 255, 0.08)' }}>
                    <Button
                        onClick={() => setShowHolidayDialog(false)}
                        sx={{
                            color: '#94a3b8',
                            borderRadius: '10px',
                            px: 2,
                            textTransform: 'none',
                            '&:hover': {
                                color: '#f1f5f9',
                                backgroundColor: 'rgba(255, 255, 255, 0.05)',
                            },
                        }}
                    >
                        Cancel
                    </Button>
                    <Button
                        onClick={handleCreateHoliday}
                        variant="contained"
                        sx={{
                            borderRadius: '10px',
                            background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)',
                            color: '#ffffff',
                            fontWeight: 600,
                            px: 2.5,
                            py: 0.75,
                            textTransform: 'none',
                            boxShadow: '0 4px 14px rgba(99, 102, 241, 0.35)',
                            '&:hover': {
                                background: 'linear-gradient(135deg, #4f46e5 0%, #4338ca 100%)',
                            },
                        }}
                    >
                        Create
                    </Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
}