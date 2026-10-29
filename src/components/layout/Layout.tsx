'use client';

import React, { useState } from 'react';
import {
  Box,
  AppBar,
  Toolbar,
  Typography,
  IconButton,
  useTheme,
  useMediaQuery,
} from '@mui/material';
import { Menu } from '@mui/icons-material';
import Sidebar from './Sidebar';
import NotificationCenter from '@/components/notifications/NotificationCenter';

interface LayoutProps {
  children: React.ReactNode;
}

const drawerWidth = 260;

export default function Layout({ children }: LayoutProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));

  const handleDrawerToggle = () => {
    setMobileOpen(!mobileOpen);
  };

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh' }}>
      {/* App Bar */}
      <AppBar
        position="fixed"
        elevation={0}
        sx={{
          width: { md: `calc(100% - ${drawerWidth}px)` },
          ml: { md: `${drawerWidth}px` },
          zIndex: theme.zIndex.drawer + 1,
          backgroundColor: 'rgba(10, 10, 26, 0.75)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
          boxShadow: '0 4px 30px rgba(0, 0, 0, 0.2)',
        }}
      >
        <Toolbar sx={{ minHeight: '64px', px: { xs: 2, sm: 3 } }}>
          <IconButton
            color="inherit"
            aria-label="open drawer"
            edge="start"
            onClick={handleDrawerToggle}
            sx={{
              mr: 2,
              display: { md: 'none' },
              color: '#94a3b8',
              '&:hover': { color: '#f1f5f9' },
            }}
          >
            <Menu />
          </IconButton>
          <Box sx={{ flexGrow: 1, display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <Typography
              variant="h6"
              noWrap
              component="div"
              sx={{
                fontWeight: 700,
                fontSize: { xs: '0.95rem', sm: '1.1rem' },
                letterSpacing: '-0.01em',
                background: 'linear-gradient(135deg, #f1f5f9 0%, #cbd5e1 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
              }}
            >
              Employee Management System
            </Typography>
          </Box>

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <NotificationCenter />
          </Box>
        </Toolbar>
      </AppBar>

      {/* Sidebar */}
      <Sidebar open={mobileOpen} onClose={handleDrawerToggle} />

      {/* Main Content */}
      <Box
        component="main"
        sx={{
          flexGrow: 1,
          p: { xs: 2, sm: 3, md: 3.5 },
          width: { md: `calc(100% - ${drawerWidth}px)` },
          mt: '64px',
          minHeight: 'calc(100vh - 64px)',
          overflowX: 'hidden',
        }}
      >
        {children}
      </Box>
    </Box>
  );
}
