'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import Layout from '@/components/layout/Layout';
import RouteGuard from '@/components/auth/RouteGuard';
import SalaryStructures from '@/components/salary/SalaryStructures';
import { Box, CircularProgress, Tabs, Tab, Paper } from '@mui/material';
import dynamic from 'next/dynamic';

const SalaryTemplateBuilder = dynamic(
  () => import('@/components/salary/SalaryTemplateBuilder'),
  {
    ssr: false,
    loading: () => (
      <Box display="flex" justifyContent="center" pt={8}>
        <CircularProgress />
      </Box>
    ),
  }
);

export default function SalaryPage() {
  const { currentUser, loading } = useAuth();
  const router = useRouter();
  const [tab, setTab] = useState(0);

  useEffect(() => {
    if (!loading && !currentUser) {
      router.push('/login');
    }
  }, [currentUser, loading, router]);

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="100vh">
        <CircularProgress />
      </Box>
    );
  }

  if (!currentUser) return null;

  return (
    <RouteGuard allowedRoles={['admin']}>
      <Layout>
        <Box>
          {/* Top-level tab switcher */}
          <Paper
            elevation={0}
            sx={{
              mb: 3,
              backgroundColor: 'rgba(255, 255, 255, 0.03)',
              backdropFilter: 'blur(20px)',
              WebkitBackdropFilter: 'blur(20px)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: '16px',
              p: 0.75,
            }}
          >
            <Tabs
              value={tab}
              onChange={(_, v) => setTab(v)}
              sx={{
                '& .MuiTab-root': {
                  color: '#94a3b8',
                  fontWeight: 600,
                  fontSize: '0.875rem',
                  borderRadius: '12px',
                  minHeight: 44,
                  py: 1,
                  px: 2.5,
                  transition: 'all 0.2s ease',
                  '&:hover': {
                    color: '#f1f5f9',
                    backgroundColor: 'rgba(255, 255, 255, 0.04)',
                  },
                },
                '& .Mui-selected': {
                  color: '#f1f5f9 !important',
                  backgroundColor: 'rgba(99, 102, 241, 0.15)',
                },
                '& .MuiTabs-indicator': {
                  backgroundColor: '#6366f1',
                  height: 3,
                  borderRadius: '3px 3px 0 0',
                },
              }}
            >
              <Tab label="Salary Calculations" />
              <Tab label="Salary Templates" />
            </Tabs>
          </Paper>

          {tab === 0 && <SalaryStructures />}
          {tab === 1 && <SalaryTemplateBuilder />}
        </Box>
      </Layout>
    </RouteGuard>
  );
}
