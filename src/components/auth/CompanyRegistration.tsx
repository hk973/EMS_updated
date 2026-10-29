'use client';

import React, { useState } from 'react';
import {
  Box,
  Paper,
  TextField,
  Button,
  Typography,
  Alert,
  CircularProgress,
  Container,
  Link,
  InputAdornment,
  IconButton,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Grid,
  Card,
  CardContent,
  Divider,
} from '@mui/material';
import { Visibility, VisibilityOff, Business, ContentCopy, CheckCircle, LocationOn, AdminPanelSettings } from '@mui/icons-material';
import { useForm, Controller } from 'react-hook-form';
import { yupResolver } from '@hookform/resolvers/yup';
import * as yup from 'yup';
import { createUserWithEmailAndPassword, updateProfile } from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import { useRouter } from 'next/navigation';

const schema = yup.object({
  companyName: yup.string().required('Company name is required').min(2, 'Company name must be at least 2 characters'),
  companyEmail: yup.string().email('Invalid email format').required('Company email is required'),
  industryType: yup.string().required('Industry type is required'),
  password: yup.string().min(8, 'Password must be at least 8 characters').required('Password is required'),
  confirmPassword: yup.string().oneOf([yup.ref('password')], 'Passwords must match').required('Please confirm your password'),
  adminName: yup.string().required('Admin name is required').min(2, 'Admin name must be at least 2 characters'),
  adminMobile: yup.string().required('Admin mobile number is required').matches(/^[0-9+\-\s()]+$/, 'Invalid phone number format'),
  street: yup.string().required('Street address is required'),
  city: yup.string().required('City is required'),
  state: yup.string().required('State is required'),
  pinCode: yup.string().required('Pin code is required').matches(/^[0-9]{6}$/, 'Pin code must be 6 digits'),
  buildingBlock: yup.string().optional(),
}).required();

interface CompanyRegistrationFormData {
  companyName: string;
  companyEmail: string;
  industryType: string;
  password: string;
  confirmPassword: string;
  adminName: string;
  adminMobile: string;
  street: string;
  city: string;
  state: string;
  pinCode: string;
  buildingBlock?: string;
}

const industryTypes = [
  'Technology',
  'Healthcare',
  'Finance',
  'Education',
  'Manufacturing',
  'Retail',
  'Real Estate',
  'Transportation',
  'Food & Beverage',
  'Entertainment',
  'Consulting',
  'Non-Profit',
  'Other',
];

const glassInputSx = {
  '& .MuiOutlinedInput-root': {
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    backdropFilter: 'blur(10px)',
    borderRadius: '12px',
    color: '#f1f5f9',
    transition: 'all 0.2s ease',
    '& fieldset': {
      borderColor: 'rgba(255, 255, 255, 0.1)',
    },
    '&:hover fieldset': {
      borderColor: 'rgba(99, 102, 241, 0.3)',
    },
    '&.Mui-focused fieldset': {
      borderColor: '#6366f1',
      boxShadow: '0 0 0 3px rgba(99, 102, 241, 0.1)',
    },
    '& .MuiInputBase-input': {
      color: '#f1f5f9',
    },
  },
  '& .MuiInputLabel-root': {
    color: '#94a3b8',
    '&.Mui-focused': {
      color: '#a5b4fc',
    },
  },
  '& .MuiFormHelperText-root': {
    color: '#ef4444',
  },
};

export default function CompanyRegistration() {
  // Suppress MUI controlled/uncontrolled Select warnings
  React.useEffect(() => {
    const originalError = console.error;
    console.error = (...args) => {
      if (args[0] && typeof args[0] === 'string' && args[0].includes('MUI: A component is changing the uncontrolled value state of Select to be controlled')) {
        return;
      }
      originalError.apply(console, args);
    };
    return () => {
      console.error = originalError;
    };
  }, []);

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [generatedAdminId, setGeneratedAdminId] = useState('');
  const [registrationComplete, setRegistrationComplete] = useState(false);
  const router = useRouter();

  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
    watch,
  } = useForm<CompanyRegistrationFormData>({
    resolver: yupResolver(schema) as any,
    defaultValues: {
      companyName: '',
      companyEmail: '',
      industryType: '',
      password: '',
      confirmPassword: '',
      adminName: '',
      adminMobile: '',
      street: '',
      city: '',
      state: '',
      pinCode: '',
      buildingBlock: '',
    },
  });

  const generateAdminId = () => {
    const timestamp = Date.now().toString().slice(-6);
    const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    return `ADM${timestamp}${random}`;
  };

  const onSubmit = async (data: CompanyRegistrationFormData) => {
    try {
      setError('');
      setSuccess('');

      // Create Firebase auth user
      const userCredential = await createUserWithEmailAndPassword(
        auth,
        data.companyEmail,
        data.password
      );

      const user = userCredential.user;
      const adminId = generateAdminId();

      // Update user profile
      await updateProfile(user, {
        displayName: data.adminName,
      });

      // Create company document with the required structure
      const companyData = {
        companyName: data.companyName,
        email: data.companyEmail, // admin email
        userId: adminId, // auto generated adminID to login
        managers: [], // under this admin (empty array initially)
        address: {
          city: data.city,
          street: data.street,
          pinCode: data.pinCode,
          state: data.state,
          buildingBlock: data.buildingBlock || '',
        },
        adminName: data.adminName,
        adminMobile: data.adminMobile,
        uid: user.uid, // auto generated by firebase
        createdAt: new Date(),
        role: 'admin',
        industryType: data.industryType,
      };

      await setDoc(doc(db, 'companies', user.uid), companyData);

      // Create admin user document for authentication
      const adminUserData = {
        uid: user.uid,
        userId: adminId, // This is what they'll use to login
        displayName: data.adminName,
        email: data.companyEmail,
        role: 'admin',
        companyId: user.uid,
        createdAt: new Date(),
        lastLoginAt: new Date(),
        status: 'active',
      };

      await setDoc(doc(db, 'users', user.uid), adminUserData);

      setGeneratedAdminId(adminId);
      setRegistrationComplete(true);
      setSuccess(`Company registered successfully! Please save your Admin ID for login.`);

    } catch (error: any) {
      console.error('Registration error:', error);
      if (error.code === 'auth/email-already-in-use') {
        setError('This email is already registered. Please use a different email or try logging in.');
      } else if (error.code === 'auth/weak-password') {
        setError('Password is too weak. Please choose a stronger password.');
      } else {
        setError(error.message || 'Failed to register company. Please try again.');
      }
    }
  };

  const handleCopyAdminId = () => {
    navigator.clipboard.writeText(generatedAdminId);
  };

  // Show success screen with Admin ID
  if (registrationComplete && generatedAdminId) {
    return (
      <Container component="main" maxWidth="md">
        <Box
          sx={{
            py: { xs: 4, sm: 8 },
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            minHeight: '80vh',
            justifyContent: 'center',
          }}
        >
          <Paper
            elevation={0}
            sx={{
              padding: { xs: 3.5, sm: 5, md: 6 },
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              width: '100%',
              backgroundColor: 'rgba(255, 255, 255, 0.03)',
              backdropFilter: 'blur(24px)',
              WebkitBackdropFilter: 'blur(24px)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: 4,
              boxShadow: '0 20px 50px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.1)',
            }}
          >
            <Box
              sx={{
                width: 90,
                height: 90,
                borderRadius: '24px',
                background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                mb: 3,
                boxShadow: '0 12px 32px rgba(16, 185, 129, 0.35)',
              }}
            >
              <CheckCircle sx={{ color: '#ffffff', fontSize: 52 }} />
            </Box>

            <Typography
              variant="h3"
              sx={{
                color: '#f1f5f9',
                fontWeight: 800,
                fontSize: { xs: '1.75rem', sm: '2.25rem' },
                letterSpacing: '-0.02em',
                mb: 1.5,
                textAlign: 'center',
                background: 'linear-gradient(135deg, #f1f5f9 0%, #cbd5e1 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
              }}
            >
              Registration Successful!
            </Typography>

            <Typography
              variant="body1"
              sx={{
                color: '#94a3b8',
                mb: 4,
                textAlign: 'center',
                fontSize: '1.05rem',
              }}
            >
              Your company has been registered successfully
            </Typography>

            <Divider sx={{ width: '100%', mb: 4, borderColor: 'rgba(255, 255, 255, 0.08)' }} />

            <Card
              sx={{
                width: '100%',
                mb: 4,
                backgroundColor: 'rgba(16, 185, 129, 0.06)',
                backdropFilter: 'blur(20px)',
                border: '1px solid rgba(16, 185, 129, 0.25)',
                borderRadius: 3,
                boxShadow: '0 8px 32px rgba(0, 0, 0, 0.25)',
              }}
            >
              <CardContent sx={{ textAlign: 'center', py: 4 }}>
                <Typography
                  variant="h6"
                  sx={{
                    color: '#f1f5f9',
                    mb: 1,
                    fontWeight: 600,
                  }}
                >
                  Your Admin ID
                </Typography>
                <Typography
                  variant="body2"
                  sx={{
                    color: '#94a3b8',
                    mb: 3,
                  }}
                >
                  Please save this ID. You'll need it to log in to your account.
                </Typography>
                <Box
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 2,
                    backgroundColor: 'rgba(0, 0, 0, 0.35)',
                    padding: 2.5,
                    borderRadius: '12px',
                    border: '1px solid rgba(255, 255, 255, 0.08)',
                    backdropFilter: 'blur(10px)',
                  }}
                >
                  <Typography
                    variant="h4"
                    sx={{
                      color: '#10b981',
                      fontWeight: 700,
                      letterSpacing: '2px',
                      fontFamily: 'monospace',
                      fontSize: { xs: '1.5rem', sm: '2rem' },
                    }}
                  >
                    {generatedAdminId}
                  </Typography>
                  <IconButton
                    onClick={handleCopyAdminId}
                    sx={{
                      color: '#10b981',
                      backgroundColor: 'rgba(16, 185, 129, 0.1)',
                      '&:hover': {
                        backgroundColor: 'rgba(16, 185, 129, 0.2)',
                        transform: 'scale(1.05)',
                      },
                      transition: 'all 0.2s ease',
                    }}
                    title="Copy Admin ID"
                  >
                    <ContentCopy />
                  </IconButton>
                </Box>
              </CardContent>
            </Card>

            <Alert
              severity="warning"
              sx={{
                width: '100%',
                mb: 4,
                borderRadius: 3,
                border: '1px solid rgba(245, 158, 11, 0.3)',
                backgroundColor: 'rgba(245, 158, 11, 0.08)',
                backdropFilter: 'blur(10px)',
                color: '#f1f5f9',
                '& .MuiAlert-icon': {
                  color: '#f59e0b',
                },
              }}
            >
              <Typography variant="body1" sx={{ fontWeight: 600 }}>
                Important: Save this Admin ID!
              </Typography>
              <Typography variant="body2" sx={{ mt: 0.5, color: '#94a3b8' }}>
                You will need this ID along with your email and password to log in. Store it in a safe place.
              </Typography>
            </Alert>

            <Button
              fullWidth
              variant="contained"
              onClick={() => router.replace('/login')}
              sx={{
                py: 1.8,
                borderRadius: '12px',
                fontSize: '1rem',
                fontWeight: 600,
                background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                boxShadow: '6px 6px 16px rgba(0, 0, 0, 0.35), inset 2px 2px 4px rgba(255, 255, 255, 0.15)',
                textTransform: 'none',
                letterSpacing: '0.3px',
                '&:hover': {
                  background: 'linear-gradient(135deg, #059669 0%, #047857 100%)',
                  boxShadow: '4px 4px 10px rgba(0, 0, 0, 0.4), inset 2px 2px 4px rgba(255, 255, 255, 0.2)',
                  transform: 'translateY(-1px)',
                },
                '&:active': {
                  boxShadow: '2px 2px 4px rgba(0, 0, 0, 0.3), inset 3px 3px 6px rgba(0, 0, 0, 0.2)',
                  transform: 'translateY(0)',
                },
                transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
              }}
            >
              Proceed to Login
            </Button>
          </Paper>
        </Box>
      </Container>
    );
  }

  return (
    <Container component="main" maxWidth="lg">
      <Box
        sx={{
          py: { xs: 4, sm: 6 },
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          minHeight: '100vh',
        }}
      >
        <Paper
          elevation={0}
          sx={{
            padding: { xs: 3, sm: 5, md: 6 },
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            width: '100%',
            backgroundColor: 'rgba(255, 255, 255, 0.03)',
            backdropFilter: 'blur(24px)',
            WebkitBackdropFilter: 'blur(24px)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: 4,
            boxShadow: '0 20px 50px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.1)',
          }}
        >
          <Box
            sx={{
              display: 'flex',
              flexDirection: { xs: 'column', sm: 'row' },
              alignItems: 'center',
              gap: 3,
              mb: 5,
              textAlign: { xs: 'center', sm: 'left' },
            }}
          >
            <Box
              sx={{
                width: 72,
                height: 72,
                borderRadius: '20px',
                background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 10px 25px rgba(99, 102, 241, 0.35)',
              }}
            >
              <Business sx={{ color: '#ffffff', fontSize: 36 }} />
            </Box>
            <Box>
              <Typography
                component="h1"
                variant="h3"
                sx={{
                  fontWeight: 800,
                  fontSize: { xs: '1.75rem', sm: '2.25rem' },
                  letterSpacing: '-0.02em',
                  background: 'linear-gradient(135deg, #f1f5f9 0%, #cbd5e1 100%)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  mb: 0.5,
                }}
              >
                Register Your Company
              </Typography>
              <Typography
                variant="body1"
                sx={{
                  color: '#94a3b8',
                  fontWeight: 400,
                }}
              >
                Set up your company account and start managing your team
              </Typography>
            </Box>
          </Box>

          {error && (
            <Alert
              severity="error"
              sx={{
                width: '100%',
                mb: 4,
                borderRadius: 2.5,
                border: '1px solid rgba(239, 68, 68, 0.3)',
                backgroundColor: 'rgba(239, 68, 68, 0.08)',
                backdropFilter: 'blur(10px)',
                color: '#f1f5f9',
                '& .MuiAlert-icon': {
                  color: '#ef4444',
                },
              }}
            >
              {error}
            </Alert>
          )}

          {success && (
            <Alert
              severity="success"
              sx={{
                width: '100%',
                mb: 4,
                borderRadius: 2.5,
                border: '1px solid rgba(16, 185, 129, 0.3)',
                backgroundColor: 'rgba(16, 185, 129, 0.08)',
                backdropFilter: 'blur(10px)',
                color: '#f1f5f9',
                '& .MuiAlert-icon': {
                  color: '#10b981',
                },
              }}
            >
              {success}
            </Alert>
          )}

          <Box component="form" onSubmit={handleSubmit(onSubmit as any)} sx={{ width: '100%' }}>
            <Grid container spacing={4}>
              {/* Company Information */}
              {/* @ts-ignore */}
              <Grid item xs={12}>
                <Box sx={{
                  mb: 3,
                  pb: 2,
                  borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
                  position: 'relative',
                  '&::after': {
                    content: '""',
                    position: 'absolute',
                    bottom: -1,
                    left: 0,
                    width: '60px',
                    height: '2px',
                    background: 'linear-gradient(90deg, #6366f1, #8b5cf6)',
                    borderRadius: '2px',
                  }
                }}>
                  <Typography
                    variant="h5"
                    sx={{
                      color: '#f1f5f9',
                      fontWeight: 700,
                      letterSpacing: '-0.01em',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 1.25,
                      fontSize: { xs: '1.25rem', sm: '1.4rem' },
                    }}
                  >
                    <Business sx={{ color: '#6366f1', fontSize: 26 }} />
                    Company Information
                  </Typography>
                  <Typography variant="body2" sx={{ color: '#94a3b8', mt: 0.5 }}>
                    Provide your company details to set up your account
                  </Typography>
                </Box>
              </Grid>

              {/* @ts-ignore */}
              <Grid item xs={12} md={6}>
                <Controller
                  name="companyName"
                  control={control}
                  render={({ field }) => (
                    <TextField
                      {...field}
                      required
                      fullWidth
                      label="Company Name"
                      error={!!errors.companyName}
                      helperText={errors.companyName?.message}
                      sx={glassInputSx}
                    />
                  )}
                />
              </Grid>

              {/* @ts-ignore */}
              <Grid item xs={12} md={6}>
                <Controller
                  name="companyEmail"
                  control={control}
                  render={({ field }) => (
                    <TextField
                      {...field}
                      required
                      fullWidth
                      label="Company Email (Admin)"
                      type="email"
                      error={!!errors.companyEmail}
                      helperText={errors.companyEmail?.message}
                      sx={glassInputSx}
                    />
                  )}
                />
              </Grid>

              {/* @ts-ignore */}
              <Grid item xs={12} md={6}>
                <Controller
                  name="industryType"
                  control={control}
                  render={({ field }) => (
                    <FormControl fullWidth error={!!errors.industryType}>
                      <InputLabel sx={{ color: '#94a3b8', '&.Mui-focused': { color: '#a5b4fc' } }}>Industry Type *</InputLabel>
                      <Select
                        {...field}
                        label="Industry Type *"
                        sx={{
                          backgroundColor: 'rgba(255, 255, 255, 0.03)',
                          backdropFilter: 'blur(10px)',
                          borderRadius: '12px',
                          color: '#f1f5f9',
                          transition: 'all 0.2s ease',
                          '& .MuiOutlinedInput-notchedOutline': {
                            borderColor: 'rgba(255, 255, 255, 0.1)',
                          },
                          '&:hover .MuiOutlinedInput-notchedOutline': {
                            borderColor: 'rgba(99, 102, 241, 0.3)',
                          },
                          '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
                            borderColor: '#6366f1',
                            boxShadow: '0 0 0 3px rgba(99, 102, 241, 0.1)',
                          },
                          '& .MuiSelect-select': {
                            color: '#f1f5f9',
                          },
                          '& .MuiSvgIcon-root': {
                            color: '#94a3b8',
                          },
                        }}
                        MenuProps={{
                          PaperProps: {
                            sx: {
                              backgroundColor: 'rgba(15, 23, 42, 0.95)',
                              backdropFilter: 'blur(20px)',
                              border: '1px solid rgba(255, 255, 255, 0.08)',
                              borderRadius: 3,
                              boxShadow: '0 16px 36px rgba(0, 0, 0, 0.5)',
                              color: '#f1f5f9',
                              '& .MuiMenuItem-root': {
                                color: '#f1f5f9',
                                '&:hover': {
                                  backgroundColor: 'rgba(99, 102, 241, 0.12)',
                                },
                                '&.Mui-selected': {
                                  backgroundColor: 'rgba(99, 102, 241, 0.2)',
                                  color: '#a5b4fc',
                                  fontWeight: 600,
                                  '&:hover': {
                                    backgroundColor: 'rgba(99, 102, 241, 0.28)',
                                  },
                                },
                              },
                            },
                          },
                        }}
                      >
                        <MenuItem value="">
                          <em>Select an industry</em>
                        </MenuItem>
                        {industryTypes.map((industry) => (
                          <MenuItem key={industry} value={industry}>
                            {industry}
                          </MenuItem>
                        ))}
                      </Select>
                      {errors.industryType && (
                        <Typography variant="caption" sx={{ color: '#ef4444', mt: 0.5, ml: 1.75 }}>
                          {errors.industryType.message}
                        </Typography>
                      )}
                    </FormControl>
                  )}
                />
              </Grid>

              {/* Company Address Section */}
              {/* @ts-ignore */}
              <Grid item xs={12}>
                <Box sx={{
                  mt: 2,
                  mb: 3,
                  pb: 2,
                  borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
                  position: 'relative',
                  '&::after': {
                    content: '""',
                    position: 'absolute',
                    bottom: -1,
                    left: 0,
                    width: '60px',
                    height: '2px',
                    background: 'linear-gradient(90deg, #6366f1, #8b5cf6)',
                    borderRadius: '2px',
                  }
                }}>
                  <Typography
                    variant="h5"
                    sx={{
                      color: '#f1f5f9',
                      fontWeight: 700,
                      letterSpacing: '-0.01em',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 1.25,
                      fontSize: { xs: '1.25rem', sm: '1.4rem' },
                    }}
                  >
                    <LocationOn sx={{ color: '#6366f1', fontSize: 26 }} />
                    Company Address
                  </Typography>
                  <Typography variant="body2" sx={{ color: '#94a3b8', mt: 0.5 }}>
                    Provide your company's physical address
                  </Typography>
                </Box>
              </Grid>

              {/* @ts-ignore */}
              <Grid item xs={12}>
                <Controller
                  name="street"
                  control={control}
                  render={({ field }) => (
                    <TextField
                      {...field}
                      required
                      fullWidth
                      label="Street Address"
                      error={!!errors.street}
                      helperText={errors.street?.message}
                      sx={glassInputSx}
                    />
                  )}
                />
              </Grid>

              {/* @ts-ignore */}
              <Grid item xs={12} md={6}>
                <Controller
                  name="buildingBlock"
                  control={control}
                  render={({ field }) => (
                    <TextField
                      {...field}
                      fullWidth
                      label="Building/Block No. (Optional)"
                      error={!!errors.buildingBlock}
                      helperText={errors.buildingBlock?.message}
                      sx={glassInputSx}
                    />
                  )}
                />
              </Grid>

              {/* @ts-ignore */}
              <Grid item xs={12} md={6}>
                <Controller
                  name="city"
                  control={control}
                  render={({ field }) => (
                    <TextField
                      {...field}
                      required
                      fullWidth
                      label="City"
                      error={!!errors.city}
                      helperText={errors.city?.message}
                      sx={glassInputSx}
                    />
                  )}
                />
              </Grid>

              {/* @ts-ignore */}
              <Grid item xs={12} md={6}>
                <Controller
                  name="state"
                  control={control}
                  render={({ field }) => (
                    <TextField
                      {...field}
                      required
                      fullWidth
                      label="State"
                      error={!!errors.state}
                      helperText={errors.state?.message}
                      sx={glassInputSx}
                    />
                  )}
                />
              </Grid>

              {/* @ts-ignore */}
              <Grid item xs={12} md={6}>
                <Controller
                  name="pinCode"
                  control={control}
                  render={({ field }) => (
                    <TextField
                      {...field}
                      required
                      fullWidth
                      label="Pin Code"
                      error={!!errors.pinCode}
                      helperText={errors.pinCode?.message}
                      sx={glassInputSx}
                    />
                  )}
                />
              </Grid>

              {/* Admin Account */}
              {/* @ts-ignore */}
              <Grid item xs={12}>
                <Box sx={{
                  mt: 2,
                  mb: 3,
                  pb: 2,
                  borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
                  position: 'relative',
                  '&::after': {
                    content: '""',
                    position: 'absolute',
                    bottom: -1,
                    left: 0,
                    width: '60px',
                    height: '2px',
                    background: 'linear-gradient(90deg, #6366f1, #8b5cf6)',
                    borderRadius: '2px',
                  }
                }}>
                  <Typography
                    variant="h5"
                    sx={{
                      color: '#f1f5f9',
                      fontWeight: 700,
                      letterSpacing: '-0.01em',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 1.25,
                      fontSize: { xs: '1.25rem', sm: '1.4rem' },
                    }}
                  >
                    <AdminPanelSettings sx={{ color: '#6366f1', fontSize: 26 }} />
                    Admin Account Setup
                  </Typography>
                  <Typography variant="body2" sx={{ color: '#94a3b8', mt: 0.5 }}>
                    Create your admin account to manage your company
                  </Typography>
                </Box>
              </Grid>

              {/* @ts-ignore */}
              <Grid item xs={12} md={6}>
                <Controller
                  name="adminName"
                  control={control}
                  render={({ field }) => (
                    <TextField
                      {...field}
                      required
                      fullWidth
                      label="Admin Name"
                      error={!!errors.adminName}
                      helperText={errors.adminName?.message}
                      sx={glassInputSx}
                    />
                  )}
                />
              </Grid>

              {/* @ts-ignore */}
              <Grid item xs={12} md={6}>
                <Controller
                  name="adminMobile"
                  control={control}
                  render={({ field }) => (
                    <TextField
                      {...field}
                      required
                      fullWidth
                      label="Admin Mobile Number"
                      error={!!errors.adminMobile}
                      helperText={errors.adminMobile?.message}
                      sx={glassInputSx}
                    />
                  )}
                />
              </Grid>

              {/* @ts-ignore */}
              <Grid item xs={12} md={6}>
                <Controller
                  name="password"
                  control={control}
                  render={({ field }) => (
                    <TextField
                      {...field}
                      required
                      fullWidth
                      label="Password"
                      type={showPassword ? 'text' : 'password'}
                      error={!!errors.password}
                      helperText={errors.password?.message}
                      InputProps={{
                        endAdornment: (
                          <InputAdornment position="end">
                            <IconButton
                              onClick={() => setShowPassword(!showPassword)}
                              edge="end"
                              sx={{
                                color: '#94a3b8',
                                '&:hover': {
                                  backgroundColor: 'rgba(99, 102, 241, 0.1)',
                                  color: '#e0e7ff',
                                },
                              }}
                            >
                              {showPassword ? <VisibilityOff /> : <Visibility />}
                            </IconButton>
                          </InputAdornment>
                        ),
                      }}
                      sx={glassInputSx}
                    />
                  )}
                />
              </Grid>

              {/* @ts-ignore */}
              <Grid item xs={12} md={6}>
                <Controller
                  name="confirmPassword"
                  control={control}
                  render={({ field }) => (
                    <TextField
                      {...field}
                      required
                      fullWidth
                      label="Confirm Password"
                      type={showConfirmPassword ? 'text' : 'password'}
                      error={!!errors.confirmPassword}
                      helperText={errors.confirmPassword?.message}
                      InputProps={{
                        endAdornment: (
                          <InputAdornment position="end">
                            <IconButton
                              onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                              edge="end"
                              sx={{
                                color: '#94a3b8',
                                '&:hover': {
                                  backgroundColor: 'rgba(99, 102, 241, 0.1)',
                                  color: '#e0e7ff',
                                },
                              }}
                            >
                              {showConfirmPassword ? <VisibilityOff /> : <Visibility />}
                            </IconButton>
                          </InputAdornment>
                        ),
                      }}
                      sx={glassInputSx}
                    />
                  )}
                />
              </Grid>
            </Grid>

            <Button
              type="submit"
              fullWidth
              variant="contained"
              sx={{
                mt: 6,
                mb: 4,
                py: 1.8,
                borderRadius: '12px',
                fontSize: '1.05rem',
                fontWeight: 600,
                background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)',
                boxShadow: '6px 6px 16px rgba(0, 0, 0, 0.4), inset 2px 2px 4px rgba(255, 255, 255, 0.15)',
                textTransform: 'none',
                letterSpacing: '0.3px',
                '&:hover': {
                  background: 'linear-gradient(135deg, #4f46e5 0%, #4338ca 100%)',
                  boxShadow: '4px 4px 10px rgba(0, 0, 0, 0.45), inset 2px 2px 4px rgba(255, 255, 255, 0.2)',
                  transform: 'translateY(-1px)',
                },
                '&:active': {
                  boxShadow: '2px 2px 4px rgba(0, 0, 0, 0.3), inset 3px 3px 6px rgba(0, 0, 0, 0.2)',
                  transform: 'translateY(0)',
                },
                '&:disabled': {
                  background: 'rgba(255, 255, 255, 0.08)',
                  color: '#64748b',
                  boxShadow: 'none',
                  transform: 'none',
                },
                transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
              }}
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                  <CircularProgress size={20} color="inherit" />
                  <Typography sx={{ fontWeight: 600 }}>Registering Company...</Typography>
                </Box>
              ) : (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                  <Business sx={{ fontSize: 22 }} />
                  <Typography sx={{ fontWeight: 600 }}>Register Company</Typography>
                </Box>
              )}
            </Button>

            <Box sx={{ textAlign: 'center', mt: 1 }}>
              <Link
                href="/login"
                variant="body2"
                sx={{
                  color: '#818cf8',
                  textDecoration: 'none',
                  fontWeight: 500,
                  fontSize: '0.95rem',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 0.5,
                  transition: 'all 0.2s ease',
                  '&:hover': {
                    color: '#a5b4fc',
                    textDecoration: 'underline',
                  },
                }}
              >
                {"Already have an account? Sign In"}
              </Link>
            </Box>
          </Box>
        </Paper>
      </Box>
    </Container>
  );
}
