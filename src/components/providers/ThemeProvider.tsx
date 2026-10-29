'use client';

import { ThemeProvider as MuiThemeProvider, createTheme } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import { ReactNode } from 'react';

// Create theme outside component to prevent hydration mismatches
const theme = createTheme({
  palette: {
    mode: 'dark',
    primary: {
      main: '#6366f1',
      light: '#818cf8',
      dark: '#4f46e5',
      contrastText: '#ffffff',
    },
    secondary: {
      main: '#8b5cf6',
      light: '#a78bfa',
      dark: '#7c3aed',
      contrastText: '#ffffff',
    },
    background: {
      default: '#0a0a1a',
      paper: 'rgba(255, 255, 255, 0.03)',
    },
    text: {
      primary: '#f1f5f9',
      secondary: '#94a3b8',
      disabled: '#475569',
    },
    divider: 'rgba(255, 255, 255, 0.06)',
    success: {
      main: '#10b981',
      light: '#34d399',
      dark: '#059669',
    },
    warning: {
      main: '#f59e0b',
      light: '#fbbf24',
      dark: '#d97706',
    },
    error: {
      main: '#ef4444',
      light: '#f87171',
      dark: '#dc2626',
    },
    info: {
      main: '#3b82f6',
      light: '#60a5fa',
      dark: '#2563eb',
    },
  },
  typography: {
    fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    h1: {
      fontWeight: 700,
      fontSize: '2.25rem',
      lineHeight: 1.2,
      letterSpacing: '-0.025em',
    },
    h2: {
      fontWeight: 700,
      fontSize: '1.875rem',
      lineHeight: 1.3,
      letterSpacing: '-0.02em',
    },
    h3: {
      fontWeight: 600,
      fontSize: '1.5rem',
      lineHeight: 1.3,
      letterSpacing: '-0.015em',
    },
    h4: {
      fontWeight: 600,
      fontSize: '1.25rem',
      lineHeight: 1.4,
      letterSpacing: '-0.01em',
    },
    h5: {
      fontWeight: 600,
      fontSize: '1.125rem',
      lineHeight: 1.4,
    },
    h6: {
      fontWeight: 600,
      fontSize: '1rem',
      lineHeight: 1.4,
    },
    body1: {
      fontSize: '0.9375rem',
      lineHeight: 1.6,
      color: '#cbd5e1',
    },
    body2: {
      fontSize: '0.8125rem',
      lineHeight: 1.6,
      color: '#94a3b8',
    },
    caption: {
      fontSize: '0.75rem',
      lineHeight: 1.5,
      color: '#64748b',
    },
    button: {
      fontWeight: 600,
      textTransform: 'none' as const,
      letterSpacing: '0.01em',
    },
    overline: {
      fontSize: '0.6875rem',
      fontWeight: 600,
      letterSpacing: '0.08em',
      textTransform: 'uppercase' as const,
      color: '#64748b',
    },
  },
  shape: {
    borderRadius: 12,
  },
  transitions: {
    duration: {
      shortest: 150,
      shorter: 200,
      short: 250,
      standard: 300,
      complex: 375,
    },
    easing: {
      easeInOut: 'cubic-bezier(0.4, 0, 0.2, 1)',
      easeOut: 'cubic-bezier(0.0, 0, 0.2, 1)',
      easeIn: 'cubic-bezier(0.4, 0, 1, 1)',
    },
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          scrollbarColor: 'rgba(148, 163, 184, 0.2) transparent',
          '&::-webkit-scrollbar, & *::-webkit-scrollbar': {
            width: '6px',
            height: '6px',
          },
          '&::-webkit-scrollbar-thumb, & *::-webkit-scrollbar-thumb': {
            borderRadius: 3,
            backgroundColor: 'rgba(148, 163, 184, 0.2)',
            minHeight: 24,
          },
          '&::-webkit-scrollbar-thumb:hover, & *::-webkit-scrollbar-thumb:hover': {
            backgroundColor: 'rgba(148, 163, 184, 0.35)',
          },
          '&::-webkit-scrollbar-track, & *::-webkit-scrollbar-track': {
            borderRadius: 3,
            backgroundColor: 'transparent',
          },
        },
      },
    },
    MuiDrawer: {
      styleOverrides: {
        paper: {
          backgroundColor: 'rgba(15, 23, 42, 0.8)',
          backdropFilter: 'blur(24px)',
          WebkitBackdropFilter: 'blur(24px)',
          borderRight: '1px solid rgba(255, 255, 255, 0.06)',
          boxShadow: '4px 0 24px rgba(0, 0, 0, 0.3)',
        },
      },
    },
    MuiAppBar: {
      styleOverrides: {
        root: {
          backgroundColor: 'rgba(15, 23, 42, 0.6)',
          backdropFilter: 'blur(24px)',
          WebkitBackdropFilter: 'blur(24px)',
          borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
          boxShadow: '0 4px 24px rgba(0, 0, 0, 0.2)',
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          backgroundColor: 'rgba(255, 255, 255, 0.03)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: 16,
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.2)',
          transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
          '&:hover': {
            borderColor: 'rgba(255, 255, 255, 0.12)',
            boxShadow: '0 12px 40px rgba(0, 0, 0, 0.25)',
          },
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundColor: 'rgba(255, 255, 255, 0.03)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: 16,
          backgroundImage: 'none',
        },
      },
    },
    MuiTextField: {
      styleOverrides: {
        root: {
          '& .MuiOutlinedInput-root': {
            backgroundColor: 'rgba(255, 255, 255, 0.03)',
            backdropFilter: 'blur(10px)',
            borderRadius: '12px',
            transition: 'all 0.2s ease',
            '& fieldset': {
              borderColor: 'rgba(255, 255, 255, 0.1)',
              transition: 'all 0.2s ease',
            },
            '&:hover fieldset': {
              borderColor: 'rgba(99, 102, 241, 0.3)',
            },
            '&.Mui-focused fieldset': {
              borderColor: '#6366f1',
              boxShadow: '0 0 0 3px rgba(99, 102, 241, 0.1)',
            },
          },
          '& .MuiInputLabel-root': {
            color: '#64748b',
            '&.Mui-focused': {
              color: '#818cf8',
            },
          },
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: '12px',
          textTransform: 'none',
          fontWeight: 600,
          padding: '8px 20px',
          transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
          boxShadow: 'none',
          '&:hover': {
            boxShadow: 'none',
          },
        },
        contained: {
          boxShadow: '6px 6px 12px rgba(0, 0, 0, 0.35), inset 2px 2px 4px rgba(255, 255, 255, 0.1)',
          '&:hover': {
            boxShadow: '4px 4px 8px rgba(0, 0, 0, 0.4), inset 2px 2px 4px rgba(255, 255, 255, 0.15)',
            transform: 'translateY(-1px)',
          },
          '&:active': {
            boxShadow: '2px 2px 4px rgba(0, 0, 0, 0.3), inset 3px 3px 6px rgba(0, 0, 0, 0.2)',
            transform: 'translateY(0)',
          },
        },
        outlined: {
          borderColor: 'rgba(255, 255, 255, 0.12)',
          backdropFilter: 'blur(10px)',
          backgroundColor: 'rgba(255, 255, 255, 0.03)',
          '&:hover': {
            borderColor: 'rgba(99, 102, 241, 0.4)',
            backgroundColor: 'rgba(99, 102, 241, 0.08)',
            transform: 'translateY(-1px)',
          },
        },
        text: {
          '&:hover': {
            backgroundColor: 'rgba(99, 102, 241, 0.08)',
          },
        },
      },
    },
    MuiDialog: {
      styleOverrides: {
        paper: {
          backgroundColor: 'rgba(15, 23, 42, 0.95)',
          backdropFilter: 'blur(40px)',
          WebkitBackdropFilter: 'blur(40px)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          borderRadius: 20,
          boxShadow: '0 25px 60px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.05)',
        },
      },
    },
    MuiDialogTitle: {
      styleOverrides: {
        root: {
          borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
          padding: '20px 24px',
          fontSize: '1.125rem',
          fontWeight: 600,
        },
      },
    },
    MuiDialogContent: {
      styleOverrides: {
        root: {
          padding: '24px',
        },
      },
    },
    MuiDialogActions: {
      styleOverrides: {
        root: {
          borderTop: '1px solid rgba(255, 255, 255, 0.06)',
          padding: '16px 24px',
        },
      },
    },
    MuiAlert: {
      styleOverrides: {
        root: {
          borderRadius: 12,
          backdropFilter: 'blur(10px)',
          border: '1px solid',
        },
        standardSuccess: {
          backgroundColor: 'rgba(16, 185, 129, 0.1)',
          borderColor: 'rgba(16, 185, 129, 0.2)',
          color: '#34d399',
        },
        standardError: {
          backgroundColor: 'rgba(239, 68, 68, 0.1)',
          borderColor: 'rgba(239, 68, 68, 0.2)',
          color: '#f87171',
        },
        standardWarning: {
          backgroundColor: 'rgba(245, 158, 11, 0.1)',
          borderColor: 'rgba(245, 158, 11, 0.2)',
          color: '#fbbf24',
        },
        standardInfo: {
          backgroundColor: 'rgba(59, 130, 246, 0.1)',
          borderColor: 'rgba(59, 130, 246, 0.2)',
          color: '#60a5fa',
        },
      },
    },
    MuiTable: {
      styleOverrides: {
        root: {
          backgroundColor: 'transparent',
        },
      },
    },
    MuiTableContainer: {
      styleOverrides: {
        root: {
          backgroundColor: 'transparent',
          borderRadius: 16,
        },
      },
    },
    MuiTableHead: {
      styleOverrides: {
        root: {
          '& .MuiTableCell-root': {
            backgroundColor: 'rgba(255, 255, 255, 0.04)',
            borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
            color: '#94a3b8',
            fontWeight: 600,
            fontSize: '0.75rem',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            padding: '14px 16px',
          },
        },
      },
    },
    MuiTableCell: {
      styleOverrides: {
        root: {
          borderBottom: '1px solid rgba(255, 255, 255, 0.04)',
          padding: '12px 16px',
          color: '#cbd5e1',
        },
      },
    },
    MuiTableRow: {
      styleOverrides: {
        root: {
          transition: 'background-color 0.15s ease',
          '&:hover': {
            backgroundColor: 'rgba(255, 255, 255, 0.03) !important',
          },
        },
      },
    },
    MuiTablePagination: {
      styleOverrides: {
        root: {
          borderTop: '1px solid rgba(255, 255, 255, 0.06)',
          color: '#94a3b8',
        },
      },
    },
    MuiSelect: {
      styleOverrides: {
        root: {
          backgroundColor: 'rgba(255, 255, 255, 0.03)',
          backdropFilter: 'blur(10px)',
          borderRadius: '12px !important',
          '& .MuiOutlinedInput-notchedOutline': {
            borderColor: 'rgba(255, 255, 255, 0.1)',
          },
          '&:hover .MuiOutlinedInput-notchedOutline': {
            borderColor: 'rgba(99, 102, 241, 0.3)',
          },
          '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
            borderColor: '#6366f1',
          },
        },
      },
    },
    MuiMenu: {
      styleOverrides: {
        paper: {
          backgroundColor: 'rgba(15, 23, 42, 0.95) !important',
          backdropFilter: 'blur(40px)',
          WebkitBackdropFilter: 'blur(40px)',
          border: '1px solid rgba(255, 255, 255, 0.1) !important',
          borderRadius: '12px !important',
          boxShadow: '0 20px 50px rgba(0, 0, 0, 0.5) !important',
          marginTop: '4px',
        },
      },
    },
    MuiMenuItem: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          margin: '2px 6px',
          padding: '8px 12px',
          transition: 'all 0.15s ease',
          '&:hover': {
            backgroundColor: 'rgba(99, 102, 241, 0.1)',
          },
          '&.Mui-selected': {
            backgroundColor: 'rgba(99, 102, 241, 0.15)',
            '&:hover': {
              backgroundColor: 'rgba(99, 102, 241, 0.2)',
            },
          },
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          fontWeight: 500,
          backdropFilter: 'blur(10px)',
          border: '1px solid transparent',
        },
        colorPrimary: {
          backgroundColor: 'rgba(99, 102, 241, 0.15)',
          color: '#a5b4fc',
          borderColor: 'rgba(99, 102, 241, 0.2)',
        },
        colorSuccess: {
          backgroundColor: 'rgba(16, 185, 129, 0.15)',
          color: '#6ee7b7',
          borderColor: 'rgba(16, 185, 129, 0.2)',
        },
        colorWarning: {
          backgroundColor: 'rgba(245, 158, 11, 0.15)',
          color: '#fcd34d',
          borderColor: 'rgba(245, 158, 11, 0.2)',
        },
        colorError: {
          backgroundColor: 'rgba(239, 68, 68, 0.15)',
          color: '#fca5a5',
          borderColor: 'rgba(239, 68, 68, 0.2)',
        },
        colorInfo: {
          backgroundColor: 'rgba(59, 130, 246, 0.15)',
          color: '#93c5fd',
          borderColor: 'rgba(59, 130, 246, 0.2)',
        },
      },
    },
    MuiIconButton: {
      styleOverrides: {
        root: {
          borderRadius: 10,
          transition: 'all 0.2s ease',
          '&:hover': {
            backgroundColor: 'rgba(99, 102, 241, 0.1)',
            transform: 'scale(1.05)',
          },
        },
      },
    },
    MuiTabs: {
      styleOverrides: {
        root: {
          '& .MuiTab-root': {
            color: '#94a3b8',
            fontWeight: 500,
            fontSize: '0.875rem',
            textTransform: 'none',
            minHeight: 48,
            transition: 'all 0.2s ease',
            '&:hover': {
              color: '#c7d2fe',
              backgroundColor: 'rgba(99, 102, 241, 0.05)',
            },
          },
          '& .Mui-selected': {
            color: '#a5b4fc !important',
            fontWeight: 600,
          },
          '& .MuiTabs-indicator': {
            backgroundColor: '#6366f1',
            height: 3,
            borderRadius: '3px 3px 0 0',
          },
        },
      },
    },
    MuiTab: {
      styleOverrides: {
        root: {
          textTransform: 'none',
        },
      },
    },
    MuiDivider: {
      styleOverrides: {
        root: {
          borderColor: 'rgba(255, 255, 255, 0.06)',
        },
      },
    },
    MuiAvatar: {
      styleOverrides: {
        root: {
          backgroundColor: 'rgba(99, 102, 241, 0.2)',
          color: '#a5b4fc',
          fontWeight: 600,
          border: '2px solid rgba(99, 102, 241, 0.3)',
        },
      },
    },
    MuiTooltip: {
      styleOverrides: {
        tooltip: {
          backgroundColor: 'rgba(15, 23, 42, 0.95)',
          backdropFilter: 'blur(20px)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          borderRadius: 8,
          fontSize: '0.75rem',
          padding: '6px 12px',
          boxShadow: '0 8px 24px rgba(0, 0, 0, 0.3)',
        },
        arrow: {
          color: 'rgba(15, 23, 42, 0.95)',
        },
      },
    },
    MuiLinearProgress: {
      styleOverrides: {
        root: {
          backgroundColor: 'rgba(255, 255, 255, 0.06)',
          borderRadius: 4,
          height: 6,
        },
        bar: {
          borderRadius: 4,
        },
      },
    },
    MuiCheckbox: {
      styleOverrides: {
        root: {
          color: 'rgba(148, 163, 184, 0.4)',
          '&.Mui-checked': {
            color: '#6366f1',
          },
        },
      },
    },
    MuiSwitch: {
      styleOverrides: {
        root: {
          '& .MuiSwitch-switchBase.Mui-checked': {
            color: '#6366f1',
          },
          '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': {
            backgroundColor: '#6366f1',
          },
        },
      },
    },
    MuiAccordion: {
      styleOverrides: {
        root: {
          backgroundColor: 'rgba(255, 255, 255, 0.02)',
          backdropFilter: 'blur(20px)',
          border: '1px solid rgba(255, 255, 255, 0.06)',
          borderRadius: '12px !important',
          '&:before': {
            display: 'none',
          },
          '&.Mui-expanded': {
            margin: '8px 0',
            borderColor: 'rgba(99, 102, 241, 0.15)',
          },
        },
      },
    },
    MuiAccordionSummary: {
      styleOverrides: {
        root: {
          borderRadius: 12,
          '&:hover': {
            backgroundColor: 'rgba(255, 255, 255, 0.02)',
          },
        },
      },
    },
    MuiPopover: {
      styleOverrides: {
        paper: {
          backgroundColor: 'rgba(15, 23, 42, 0.95) !important',
          backdropFilter: 'blur(40px)',
          WebkitBackdropFilter: 'blur(40px)',
          border: '1px solid rgba(255, 255, 255, 0.1) !important',
          borderRadius: '16px !important',
          boxShadow: '0 20px 50px rgba(0, 0, 0, 0.5) !important',
        },
      },
    },
    MuiBadge: {
      styleOverrides: {
        badge: {
          fontWeight: 600,
          fontSize: '0.6875rem',
        },
      },
    },
    MuiStepper: {
      styleOverrides: {
        root: {
          '& .MuiStepIcon-root': {
            color: 'rgba(255, 255, 255, 0.1)',
            '&.Mui-active': {
              color: '#6366f1',
            },
            '&.Mui-completed': {
              color: '#10b981',
            },
          },
          '& .MuiStepConnector-line': {
            borderColor: 'rgba(255, 255, 255, 0.08)',
          },
        },
      },
    },
    MuiSnackbar: {
      styleOverrides: {
        root: {
          '& .MuiPaper-root': {
            backdropFilter: 'blur(20px)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
          },
        },
      },
    },
    MuiFormControlLabel: {
      styleOverrides: {
        label: {
          fontSize: '0.875rem',
          color: '#94a3b8',
        },
      },
    },
    MuiInputLabel: {
      styleOverrides: {
        root: {
          color: '#64748b',
          '&.Mui-focused': {
            color: '#818cf8',
          },
        },
      },
    },
    MuiCircularProgress: {
      styleOverrides: {
        root: {
          color: '#6366f1',
        },
      },
    },
    MuiAutocomplete: {
      styleOverrides: {
        paper: {
          backgroundColor: 'rgba(15, 23, 42, 0.95)',
          backdropFilter: 'blur(40px)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          borderRadius: 12,
          boxShadow: '0 20px 50px rgba(0, 0, 0, 0.5)',
        },
      },
    },
  },
});

interface ThemeProviderProps {
  children: ReactNode;
}

export default function ThemeProvider({ children }: ThemeProviderProps) {
  return (
    <MuiThemeProvider theme={theme}>
      <CssBaseline />
      {children}
    </MuiThemeProvider>
  );
}
