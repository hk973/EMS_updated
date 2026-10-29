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
  InputAdornment,
  IconButton,
  Link,
} from '@mui/material';
import { Visibility, VisibilityOff, Person } from '@mui/icons-material';
import { useForm, Controller } from 'react-hook-form';
import { yupResolver } from '@hookform/resolvers/yup';
import * as yup from 'yup';
import { doc, getDoc, updateDoc, setDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { createUserWithEmailAndPassword, updateProfile } from 'firebase/auth';
import { db, auth } from '@/lib/firebase';
import { User } from '@/types';
import { useRouter } from 'next/navigation';

const schema = yup.object({
  managerId: yup.string().required('Manager ID is required'),
  password: yup.string().min(6, 'Password must be at least 6 characters').required('Password is required'),
  confirmPassword: yup.string()
    .oneOf([yup.ref('password')], 'Passwords must match')
    .required('Confirm password is required'),
}).required();

interface ManagerPasswordFormData {
  managerId: string;
  password: string;
  confirmPassword: string;
}

export default function ManagerPasswordSetup() {
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const router = useRouter();

  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
    reset,
  } = useForm<ManagerPasswordFormData>({
    resolver: yupResolver(schema),
    defaultValues: {
      managerId: '',
      password: '',
      confirmPassword: '',
    },
  });

  const onSubmit = async (data: ManagerPasswordFormData) => {
    try {
      setError('');
      setSuccess('');

      // Check if manager exists in the managers collection
      const managerQuery = query(collection(db, 'managers'), where('managerId', '==', data.managerId));
      const managerSnapshot = await getDocs(managerQuery);
      
      if (managerSnapshot.empty) {
        throw new Error('Manager ID not found. Please contact your administrator.');
      }

      const managerDoc = managerSnapshot.docs[0];
      const managerData = managerDoc.data();

      // Check if user account already exists
      const userQuery = query(collection(db, 'users'), where('managerId', '==', data.managerId));
      const userSnapshot = await getDocs(userQuery);
      
      if (!userSnapshot.empty) {
        throw new Error('Account already exists for this Manager ID. Please login instead.');
      }

      // Create Firebase auth account
      const userCredential = await createUserWithEmailAndPassword(
        auth, 
        managerData.email, 
        data.password
      );

      // Update Firebase profile
      await updateProfile(userCredential.user, { 
        displayName: managerData.fullName 
      });

      // Create user document in Firestore
      // Create user document in Firestore for manager
      const userData: User = {
        uid: userCredential.user.uid,
        userId: data.managerId, // Manager ID for login
        email: managerData.email,
        role: 'manager',
        companyId: managerData.companyId, // Link manager to their company
        displayName: managerData.fullName,
        status: 'active',
        createdAt: new Date(),
        lastLoginAt: new Date(),
      };

      await setDoc(doc(db, 'users', userCredential.user.uid), userData);
      
      console.log('Manager account created successfully:', {
        uid: userCredential.user.uid,
        userId: data.managerId,
        email: managerData.email,
        role: 'manager'
      });

      setSuccess('Password set successfully! You can now login with your Manager ID and password.');
      
      // Reset form
      reset();
      
      // Redirect to login after 2 seconds
      setTimeout(() => {
        router.push('/login');
      }, 2000);

    } catch (error: any) {
      setError(error.message || 'Failed to set password');
    }
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
              <Person sx={{ color: '#ffffff', fontSize: 28 }} />
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
                Confirm Manager
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                Set your password to activate your manager account
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

          {success && (
            <Alert 
              severity="success" 
              sx={{ 
                width: '100%', 
                mb: 3,
                borderRadius: 2.5,
              }}
            >
              {success}
            </Alert>
          )}

          <Box component="form" onSubmit={handleSubmit(onSubmit)} sx={{ width: '100%' }}>
            <Controller
              name="managerId"
              control={control}
              render={({ field }) => (
                <TextField
                  {...field}
                  margin="normal"
                  required
                  fullWidth
                  id="managerId"
                  label="Manager ID"
                  autoComplete="off"
                  autoFocus
                  error={!!errors.managerId}
                  helperText={errors.managerId?.message}
                />
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
                  label="Re-enter Password"
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
              {isSubmitting ? <CircularProgress size={24} color="inherit" /> : 'SET PASSWORD'}
            </Button>

            <Box sx={{ textAlign: 'center', mt: 1 }}>
              <Link 
                component="button"
                type="button"
                variant="body2" 
                sx={{
                  color: '#818cf8',
                  textDecoration: 'none',
                  fontWeight: 500,
                  cursor: 'pointer',
                  '&:hover': {
                    color: '#a5b4fc',
                    textDecoration: 'underline',
                  },
                }}
                onClick={() => router.push('/login')}
              >
                Already have an account? Sign In
              </Link>
            </Box>
          </Box>
        </Paper>
      </Box>
    </Container>
  );
} 