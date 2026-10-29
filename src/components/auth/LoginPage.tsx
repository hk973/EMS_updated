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
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
} from '@mui/material';
import { Visibility, VisibilityOff, Login, Code } from '@mui/icons-material';
import { useForm, Controller } from 'react-hook-form';
import { yupResolver } from '@hookform/resolvers/yup';
import * as yup from 'yup';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';

const schema = yup.object({
  userId: yup.string().required('User ID is required'),
  password: yup.string().min(6, 'Password must be at least 6 characters').required('Password is required'),
}).required();

interface LoginFormData {
  userId: string;
  password: string;
}

const DEV_PASSWORD = 'Genzopia@9999';

export default function LoginPage() {
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [devDialogOpen, setDevDialogOpen] = useState(false);
  const [devPassword, setDevPassword] = useState('');
  const [devPasswordError, setDevPasswordError] = useState('');
  const [devUnlocked, setDevUnlocked] = useState(false);
  const { login } = useAuth();
  const router = useRouter();

  const handleDevModeSubmit = () => {
    if (devPassword === DEV_PASSWORD) {
      setDevUnlocked(true);
      setDevDialogOpen(false);
      setDevPassword('');
      setDevPasswordError('');
    } else {
      setDevPasswordError('Incorrect password');
    }
  };

  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormData>({
    resolver: yupResolver(schema),
    defaultValues: {
      userId: '',
      password: '',
    },
  });

  const onSubmit = async (data: LoginFormData) => {
    try {
      setError('');
      await login(data.userId, data.password);
      router.replace('/dashboard');
    } catch (error: any) {
      setError(error.message || 'Failed to login');
    }
  };

  return (
    <Container component="main" maxWidth="sm">
      {/* Developer Mode button - top right */}
      <Box sx={{ position: 'fixed', top: 16, right: 16, zIndex: 1000 }}>
        {devUnlocked ? (
          <Typography
            variant="caption"
            sx={{
              color: '#10b981',
              fontWeight: 600,
              border: '1px solid rgba(16, 185, 129, 0.3)',
              backgroundColor: 'rgba(16, 185, 129, 0.1)',
              backdropFilter: 'blur(10px)',
              borderRadius: 2,
              px: 1.5,
              py: 0.6,
              fontSize: '0.75rem',
            }}
          >
            🔓 Developer Mode
          </Typography>
        ) : (
          <Button
            size="small"
            startIcon={<Code sx={{ fontSize: 16 }} />}
            onClick={() => setDevDialogOpen(true)}
            sx={{
              color: '#94a3b8',
              fontSize: '0.75rem',
              textTransform: 'none',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              backgroundColor: 'rgba(255, 255, 255, 0.03)',
              backdropFilter: 'blur(10px)',
              borderRadius: 2,
              px: 1.5,
              py: 0.5,
              '&:hover': {
                borderColor: 'rgba(99, 102, 241, 0.3)',
                backgroundColor: 'rgba(99, 102, 241, 0.08)',
                color: '#e0e7ff',
              },
            }}
          >
            Developer Mode
          </Button>
        )}
      </Box>

      {/* Developer Mode password dialog */}
      <Dialog
        open={devDialogOpen}
        onClose={() => { setDevDialogOpen(false); setDevPassword(''); setDevPasswordError(''); }}
        PaperProps={{
          sx: {
            backgroundColor: 'rgba(15, 23, 42, 0.95)',
            backdropFilter: 'blur(30px)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            borderRadius: 3,
            boxShadow: '0 20px 50px rgba(0, 0, 0, 0.5)',
          },
        }}
      >
        <DialogTitle sx={{ color: '#f1f5f9', fontWeight: 600 }}>Developer Mode</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            type="password"
            label="Password"
            fullWidth
            value={devPassword}
            onChange={(e) => { setDevPassword(e.target.value); setDevPasswordError(''); }}
            onKeyDown={(e) => e.key === 'Enter' && handleDevModeSubmit()}
            error={!!devPasswordError}
            helperText={devPasswordError}
            sx={{ mt: 1.5 }}
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button
            onClick={() => { setDevDialogOpen(false); setDevPassword(''); setDevPasswordError(''); }}
            sx={{ color: '#94a3b8' }}
          >
            Cancel
          </Button>
          <Button
            onClick={handleDevModeSubmit}
            variant="contained"
            sx={{
              background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)',
              borderRadius: '10px',
            }}
          >
            Unlock
          </Button>
        </DialogActions>
      </Dialog>

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
              <Login sx={{ color: '#ffffff', fontSize: 28 }} />
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
                Welcome Back
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                Sign in to your EMS account
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
              name="userId"
              control={control}
              render={({ field }) => (
                <TextField
                  {...field}
                  margin="normal"
                  required
                  fullWidth
                  id="userId"
                  label="User ID"
                  autoComplete="username"
                  autoFocus
                  error={!!errors.userId}
                  helperText={errors.userId?.message || "Enter your Employee ID, Manager ID, or Admin ID"}
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
                  autoComplete="current-password"
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
                transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
              }}
              disabled={isSubmitting}
            >
              {isSubmitting ? <CircularProgress size={24} color="inherit" /> : 'Sign In'}
            </Button>

            <Box sx={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 1.25, mt: 1 }}>
              {devUnlocked && (
                <>
                  <Link
                    href="/register"
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
                    {"Don't have an account? Sign Up"}
                  </Link>
                  <Link
                    href="/company-registration"
                    variant="body2"
                    sx={{
                      color: '#34d399',
                      textDecoration: 'none',
                      fontWeight: 600,
                      fontSize: '0.95rem',
                      '&:hover': {
                        color: '#6ee7b7',
                        textDecoration: 'underline',
                      },
                    }}
                  >
                    {"🏢 Register Your Company"}
                  </Link>
                </>
              )}
              <Link
                href="/employee-setup"
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
                {"New Employee? Set your password"}
              </Link>
              <Link
                href="/manager-setup"
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
                {"New Manager? Set your password"}
              </Link>
            </Box>
          </Box>
        </Paper>
      </Box>
    </Container>
  );
}
