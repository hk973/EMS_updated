'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Box, CircularProgress, Typography } from '@mui/material';

export default function ReportsPage() {
  const router = useRouter();

  useEffect(() => {
    // Reports section has been unified into the customized Admin BI Dashboard
    router.replace('/dashboard');
  }, [router]);

  return (
    <Box
      display="flex"
      flexDirection="column"
      justifyContent="center"
      alignItems="center"
      minHeight="100vh"
      gap={2}
    >
      <CircularProgress sx={{ color: '#6366f1' }} />
      <Typography sx={{ color: '#94a3b8', fontSize: '0.9rem' }}>
        Redirecting to Analytics Dashboard...
      </Typography>
    </Box>
  );
}
 