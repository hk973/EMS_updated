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
} from '@mui/material';
import { Visibility, VisibilityOff, PersonAdd } from '@mui/icons-material';
import { useForm, Controller } from 'react-hook-form';
import { yupResolver } from '@hookform/resolvers/yup';
import * as yup from 'yup';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { generateUserId } from '@/lib/utils';
import RegistrationSuccessDialog from './RegistrationSuccessDialog';

const schema = yup.object({
  displayName: yup.string().required('Full name is required'),
  email: yup.string().email('Invalid email').required('Email is required'),
  password: yup.string().min(6, 'Password must be at least 6 characters').required('Password is required'),
  confirmPassword: yup.string()
    .oneOf([yup.ref('password')], 'Passwords must match')
    .required('Confirm password is required'),
  role: yup.string().oneOf(['admin', 'manager'], 'Please select a valid role').required('Role is required'),
}).required();

interface RegisterFormData {
  displayName: string;
  email: string;
  password: string;
  confirmPassword: string;
  role: 'admin' | 'manager';
}

export default function RegisterPage() {
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState('');
  const [showSuccessDialog, setShowSuccessDialog] = useState(false);
  const [generatedUserId, setGeneratedUserId] = useState('');
  const [registeredUser, setRegisteredUser] = useState<{ name: string; role: string } | null>(null);
  const { register } = useAuth();
  const router = useRouter();

  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
    watch,
  } = useForm<RegisterFormData>({
    resolver: yupResolver(schema),
    defaultValues: {
      displayName: '',
      email: '',
      password: '',
      confirmPassword: '',
      role: 'manager',
    },
  });

  const watchedRole = watch('role');

  const onSubmit = async (data: RegisterFormData) => {
    try {
      setError('');
      
      // Generate User ID based on role
      const userId = generateUserId(data.role);
      setGeneratedUserId(userId);
      
      await register(userId, data.email, data.password, data.displayName, data.role);
      
      // Set registered user info for success dialog
      setRegisteredUser({
        name: data.displayName,
        role: data.role === 'admin' ? 'Administrator' : 'Manager'
      });
      
      // Show success dialog
      setShowSuccessDialog(true);
    } catch (error: any) {
      setError(error.message || 'Failed to register');
    }
  };

  const handleSuccessDialogClose = () => {
    setShowSuccessDialog(false);
    setGeneratedUserId('');
    setRegisteredUser(null);
    router.push('/login');
  };

  return (
    <Container component="main" maxWidth="sm">
      <Box
        sx={{
          paddingY: { xs: 4, sm: 8 },
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          minHeight: '100vh',
          justifyContent: 'center',
        }}
      >
        <Paper
          elevation={0}
          sx={{
            padding: { xs: 3, sm: 4.5 },
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
              alignItems: 'center',
              gap: 2.5,
              mb: 3.5,
            }}
          >
            <Box
              sx={{
                width: 56,
                height: 56,
                borderRadius: '16px',
                background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 8px 24px rgba(99, 102, 241, 0.35)',
              }}
            >
              <PersonAdd sx={{ color: '#ffffff', fontSize: 28 }} />
            </Box>
            <Box>
              <Typography
                component="h1"
                variant="h4"
                sx={{
                  fontWeight: 700,
                  fontSize: { xs: '1.5rem', sm: '1.75rem' },
                  letterSpacing: '-0.02em',
                  background: 'linear-gradient(135deg, #f1f5f9 0%, #cbd5e1 100%)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                }}
              >
                Create Account
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                Join the Employee Management System
              </Typography>
            </Box>
          </Box>

          {error && (
            <Alert 
              severity="error" 
              sx={{ 
                width: '100%', 
                mb: 3,
                borderRadius: 2.5,
              }}
            >
              {error}
            </Alert>
          )}

          <Box component="form" onSubmit={handleSubmit(onSubmit)} sx={{ width: '100%' }}>
            <Controller
              name="displayName"
              control={control}
              render={({ field }) => (
                <TextField
                  {...field}
                  margin="normal"
                  required
                  fullWidth
                  id="displayName"
                  label="Full Name"
                  autoComplete="name"
                  autoFocus
                  error={!!errors.displayName}
                  helperText={errors.displayName?.message}
                />
              )}
            />

            <Controller
              name="email"
              control={control}
              render={({ field }) => (
                <TextField
                  {...field}
                  margin="normal"
                  required
                  fullWidth
                  id="email"
                  label="Email Address"
                  autoComplete="email"
                  error={!!errors.email}
                  helperText={errors.email?.message}
                />
              )}
            />

            <Controller
              name="role"
              control={control}
              render={({ field }) => (
                <FormControl fullWidth margin="normal" error={!!errors.role}>
                  <InputLabel id="role-label">Role</InputLabel>
                  <Select
                    {...field}
                    labelId="role-label"
                    id="role"
                    label="Role"
                  >
                    <MenuItem value="admin">Admin</MenuItem>
                    <MenuItem value="manager">Manager</MenuItem>
                  </Select>
                  {errors.role && (
                    <Typography variant="caption" color="error" sx={{ mt: 0.5, ml: 1.75 }}>
                      {errors.role.message}
                    </Typography>
                  )}
                </FormControl>
              )}
            />

            <Controller
              name="password"
              control={control}
              render={({ field }) => (
                <TextField
                  {...field}
                  margin="normal"
                  required
                  fullWidth
                  label="Password"
                  type={showPassword ? 'text' : 'password'}
                  id="password"
                  autoComplete="new-password"
                  error={!!errors.password}
                  helperText={errors.password?.message}
                  InputProps={{
                    endAdornment: (
                      <InputAdornment position="end">
                        <IconButton
                          aria-label="toggle password visibility"
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
                />
              )}
            />

            <Controller
              name="confirmPassword"
              control={control}
              render={({ field }) => (
                <TextField
                  {...field}
                  margin="normal"
                  required
                  fullWidth
                  label="Confirm Password"
                  type={showConfirmPassword ? 'text' : 'password'}
                  id="confirmPassword"
                  autoComplete="new-password"
                  error={!!errors.confirmPassword}
                  helperText={errors.confirmPassword?.message}
                  InputProps={{
                    endAdornment: (
                      <InputAdornment position="end">
                        <IconButton
                          aria-label="toggle confirm password visibility"
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
                />
              )}
            />

            <Button
              type="submit"
              fullWidth
              variant="contained"
              sx={{ 
                mt: 3.5, 
                mb: 2.5,
                py: 1.4,
                borderRadius: '12px',
                fontSize: '0.95rem',
                fontWeight: 600,
                background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)',
                boxShadow: '6px 6px 16px rgba(0, 0, 0, 0.4), inset 2px 2px 4px rgba(255, 255, 255, 0.15)',
                '&:hover': {
                  background: 'linear-gradient(135deg, #4f46e5 0%, #4338ca 100%)',
                  boxShadow: '4px 4px 10px rgba(0, 0, 0, 0.45), inset 2px 2px 4px rgba(255, 255, 255, 0.2)',
                  transform: 'translateY(-1px)',
                },
                '&:active': {
                  boxShadow: '2px 2px 4px rgba(0, 0, 0, 0.3), inset 3px 3px 6px rgba(0, 0, 0, 0.2)',
                  transform: 'translateY(0)',
                },
                transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
              }}
              disabled={isSubmitting}
            >
              {isSubmitting ? <CircularProgress size={24} color="inherit" /> : 'Create Account'}
            </Button>

            <Box sx={{ textAlign: 'center', mt: 1 }}>
              <Link 
                href="/login" 
                variant="body2"
                sx={{
                  color: '#818cf8',
                  textDecoration: 'none',
                  fontWeight: 500,
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

      {/* Registration Success Dialog */}
      <RegistrationSuccessDialog
        open={showSuccessDialog}
        onClose={handleSuccessDialogClose}
        userId={generatedUserId}
        userRole={registeredUser?.role || ''}
        userName={registeredUser?.name || ''}
      />
    </Container>
  );
} 