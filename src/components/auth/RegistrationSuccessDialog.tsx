'use client';

import React, { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography,
  TextField,
  IconButton,
  Alert,
  Paper,
} from '@mui/material';
import { CheckCircle, ContentCopy, Check, Info } from '@mui/icons-material';
import { copyToClipboard } from '@/lib/utils';

interface RegistrationSuccessDialogProps {
  open: boolean;
  onClose: () => void;
  userId: string;
  userRole: string;
  userName: string;
}

export default function RegistrationSuccessDialog({
  open,
  onClose,
  userId,
  userRole,
  userName,
}: RegistrationSuccessDialogProps) {
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState('');

  const handleCopyUserId = async () => {
    try {
      const success = await copyToClipboard(userId);
      if (success) {
        setCopied(true);
        setCopyError('');
        setTimeout(() => setCopied(false), 2000);
      } else {
        setCopyError('Failed to copy User ID');
      }
    } catch (error) {
      setCopyError('Failed to copy User ID');
    }
  };

  const handleClose = () => {
    setCopied(false);
    setCopyError('');
    onClose();
  };

  return (
    <Dialog 
      open={open} 
      onClose={handleClose} 
      maxWidth="sm" 
      fullWidth
      PaperProps={{
        sx: {
          backgroundColor: 'rgba(15, 23, 42, 0.95)',
          backdropFilter: 'blur(40px)',
          WebkitBackdropFilter: 'blur(40px)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          borderRadius: 4,
          boxShadow: '0 25px 60px rgba(0, 0, 0, 0.5)',
        }
      }}
    >
      <DialogTitle sx={{ 
        pb: 1.5,
        borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
        backgroundColor: 'transparent'
      }}>
        <Box display="flex" alignItems="center" gap={2}>
          <CheckCircle sx={{ color: '#10b981', fontSize: 28 }} />
          <Typography 
            variant="h5" 
            sx={{ 
              color: '#f1f5f9',
              fontWeight: 600,
              fontSize: '1.4rem'
            }}
          >
            Registration Successful!
          </Typography>
        </Box>
      </DialogTitle>
      
      <DialogContent sx={{ p: 3, backgroundColor: 'transparent' }}>
        {/* Main Success Box */}
        <Paper
          elevation={0}
          sx={{
            p: 3,
            mb: 3,
            background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.12) 0%, rgba(16, 185, 129, 0.04) 100%)',
            border: '1px solid rgba(16, 185, 129, 0.25)',
            borderRadius: 3,
            backdropFilter: 'blur(10px)',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.2)',
          }}
        >
          <Typography 
            variant="body1" 
            sx={{ 
              mb: 2,
              color: '#34d399',
              fontSize: '1rem',
              fontWeight: 500,
              lineHeight: 1.5
            }}
          >
            Welcome, <strong>{userName}</strong>! Your {userRole} account has been created successfully.
          </Typography>
          
          <Typography 
            variant="body1" 
            sx={{ 
              mb: 2,
              color: '#6ee7b7',
              fontSize: '0.95rem',
              fontWeight: 600
            }}
          >
            Your UserID is:
          </Typography>
          
          <Box display="flex" alignItems="center" gap={1.5} sx={{ mb: 2 }}>
            <TextField
              value={userId}
              fullWidth
              variant="outlined"
              size="medium"
              InputProps={{
                readOnly: true,
                sx: {
                  backgroundColor: 'rgba(255, 255, 255, 0.05)',
                  fontWeight: 'bold',
                  fontSize: '1.15rem',
                  letterSpacing: '0.05em',
                  color: '#34d399',
                  borderRadius: '12px',
                  '& .MuiOutlinedInput-notchedOutline': {
                    borderColor: 'rgba(16, 185, 129, 0.4)',
                    borderWidth: '1.5px',
                  },
                  '&:hover .MuiOutlinedInput-notchedOutline': {
                    borderColor: '#10b981',
                  },
                  '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
                    borderColor: '#10b981',
                  },
                },
              }}
            />
            <IconButton
              onClick={handleCopyUserId}
              sx={{ 
                minWidth: 48,
                height: 48,
                borderRadius: '12px',
                backgroundColor: copied ? 'rgba(16, 185, 129, 0.25)' : 'rgba(255, 255, 255, 0.05)',
                color: copied ? '#34d399' : '#94a3b8',
                border: '1px solid',
                borderColor: copied ? 'rgba(16, 185, 129, 0.5)' : 'rgba(255, 255, 255, 0.1)',
                backdropFilter: 'blur(10px)',
                '&:hover': {
                  backgroundColor: copied ? 'rgba(16, 185, 129, 0.35)' : 'rgba(99, 102, 241, 0.1)',
                  borderColor: copied ? '#10b981' : 'rgba(99, 102, 241, 0.3)',
                  color: copied ? '#6ee7b7' : '#e0e7ff',
                },
                transition: 'all 0.2s ease-in-out',
              }}
            >
              {copied ? <Check sx={{ fontSize: 20 }} /> : <ContentCopy sx={{ fontSize: 20 }} />}
            </IconButton>
          </Box>
          
          {copyError && (
            <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }}>
              {copyError}
            </Alert>
          )}
          
          <Typography 
            variant="body2" 
            sx={{ 
              color: '#a7f3d0',
              fontSize: '0.875rem',
              fontWeight: 500,
              lineHeight: 1.4
            }}
          >
            <strong>Please save this UserID for login.</strong> You can use this ID along with your password to access the system.
          </Typography>
        </Paper>

        {/* Important Alert Box */}
        <Alert 
          severity="info" 
          icon={<Info sx={{ color: '#60a5fa' }} />}
          sx={{ 
            mb: 3,
            borderRadius: 2.5,
          }}
        >
          <Typography variant="body2" sx={{ color: '#93c5fd', fontWeight: 500 }}>
            <strong>Important:</strong> Please note down your UserID and password in a secure location. 
            You will need these credentials to log in to the system.
          </Typography>
        </Alert>

        {/* Bottom Text */}
        <Typography 
          variant="body2" 
          sx={{ 
            color: '#94a3b8',
            fontSize: '0.9rem',
            lineHeight: 1.5,
            textAlign: 'center',
            mb: 2
          }}
        >
          You can now log in to the system using your UserID and password. 
          If you forget your credentials, please contact your system administrator.
        </Typography>
      </DialogContent>
      
      <DialogActions sx={{ 
        p: 3, 
        pt: 2,
        backgroundColor: 'transparent',
        borderTop: '1px solid rgba(255, 255, 255, 0.06)',
        justifyContent: 'flex-end'
      }}>
        <Button 
          onClick={handleClose} 
          variant="contained" 
          sx={{
            background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)',
            color: '#ffffff',
            px: 3.5,
            py: 1.25,
            borderRadius: '12px',
            fontWeight: 600,
            fontSize: '0.95rem',
            textTransform: 'none',
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
            transition: 'all 0.2s ease-in-out',
          }}
        >
          Continue to Login
        </Button>
      </DialogActions>
    </Dialog>
  );
} 