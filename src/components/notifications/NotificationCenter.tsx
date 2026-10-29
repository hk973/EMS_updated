'use client';

import React, { useState, useEffect } from 'react';
import {
  Box,
  IconButton,
  Badge,
  Popover,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  Typography,
  Button,
  Divider,
  Chip,
  Avatar,
} from '@mui/material';
import {
  Notifications,
  NotificationsNone,
  Info,
  CheckCircle,
  Warning,
  Error,
  MarkEmailRead,
  Delete,
  Settings,
} from '@mui/icons-material';
import { collection, query, where, orderBy, onSnapshot, updateDoc, doc, deleteDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { Notification } from '@/types/notification';

export default function NotificationCenter() {
  const { currentUser } = useAuth();
  const [anchorEl, setAnchorEl] = useState<HTMLButtonElement | null>(null);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (!currentUser) return;

    const loadNotifications = async () => {
      try {
        const notificationsQuery = query(
          collection(db, 'notifications'),
          where('userId', '==', currentUser.uid)
        );

        const unsubscribe = onSnapshot(
          notificationsQuery, 
          (snapshot) => {
            const notificationsList = snapshot.docs.map(doc => ({
              id: doc.id,
              ...doc.data(),
              createdAt: doc.data().createdAt?.toDate() || new Date(),
              readAt: doc.data().readAt?.toDate(),
              expiresAt: doc.data().expiresAt?.toDate(),
            })) as Notification[];

            // Sort on client side to avoid needing composite index
            const sortedNotifications = notificationsList.sort((a, b) => 
              new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
            );

            setNotifications(sortedNotifications);
            setUnreadCount(sortedNotifications.filter(n => !n.isRead).length);
          },
          (error) => {
            console.error('Error loading notifications:', error);
            // Set empty state on error
            setNotifications([]);
            setUnreadCount(0);
          }
        );

        return unsubscribe;
      } catch (error) {
        console.error('Error setting up notifications listener:', error);
        setNotifications([]);
        setUnreadCount(0);
        return () => {}; // Return empty cleanup function
      }
    };

    let unsubscribe: (() => void) | undefined;
    
    loadNotifications().then((cleanup) => {
      unsubscribe = cleanup;
    });

    return () => {
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, [currentUser]);

  const handleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleClose = () => {
    setAnchorEl(null);
  };

  const markAsRead = async (notificationId: string) => {
    try {
      await updateDoc(doc(db, 'notifications', notificationId), {
        isRead: true,
        readAt: new Date(),
      });
    } catch (error) {
      console.error('Error marking notification as read:', error);
    }
  };

  const markAllAsRead = async () => {
    try {
      const unreadNotifications = notifications.filter(n => !n.isRead);
      const updates = unreadNotifications.map(notification =>
        updateDoc(doc(db, 'notifications', notification.id), {
          isRead: true,
          readAt: new Date(),
        })
      );
      await Promise.all(updates);
    } catch (error) {
      console.error('Error marking all notifications as read:', error);
    }
  };

  const deleteNotification = async (notificationId: string) => {
    try {
      await deleteDoc(doc(db, 'notifications', notificationId));
    } catch (error) {
      console.error('Error deleting notification:', error);
    }
  };

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'success': return <CheckCircle color="success" />;
      case 'warning': return <Warning color="warning" />;
      case 'error': return <Error color="error" />;
      default: return <Info color="info" />;
    }
  };

  const getCategoryColor = (category: string) => {
    switch (category) {
      case 'leave': return '#10b981';
      case 'payroll': return '#6366f1';
      case 'attendance': return '#f59e0b';
      case 'system': return '#8b5cf6';
      case 'announcement': return '#ef4444';
      default: return '#94a3b8';
    }
  };

  const formatTimeAgo = (date: Date) => {
    const now = new Date();
    const diffInMinutes = Math.floor((now.getTime() - date.getTime()) / (1000 * 60));
    
    if (diffInMinutes < 1) return 'Just now';
    if (diffInMinutes < 60) return `${diffInMinutes}m ago`;
    
    const diffInHours = Math.floor(diffInMinutes / 60);
    if (diffInHours < 24) return `${diffInHours}h ago`;
    
    const diffInDays = Math.floor(diffInHours / 24);
    if (diffInDays < 7) return `${diffInDays}d ago`;
    
    return date.toLocaleDateString();
  };

  const open = Boolean(anchorEl);

  return (
    <>
      <IconButton
        color="inherit"
        onClick={handleClick}
        sx={{ mr: 1 }}
      >
        <Badge badgeContent={unreadCount} color="error">
          {unreadCount > 0 ? <Notifications /> : <NotificationsNone />}
        </Badge>
      </IconButton>

      <Popover
        open={open}
        anchorEl={anchorEl}
        onClose={handleClose}
        anchorOrigin={{
          vertical: 'bottom',
          horizontal: 'right',
        }}
        transformOrigin={{
          vertical: 'top',
          horizontal: 'right',
        }}
        PaperProps={{
          sx: {
            width: 400,
            maxHeight: 500,
            overflow: 'hidden',
            backgroundColor: 'rgba(15, 23, 42, 0.95)',
            backdropFilter: 'blur(30px)',
            WebkitBackdropFilter: 'blur(30px)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            borderRadius: '16px',
            boxShadow: '0 20px 50px rgba(0, 0, 0, 0.5)',
          },
        }}
      >
        <Box sx={{ p: 2, borderBottom: 1, borderColor: 'divider' }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Typography variant="h6">Notifications</Typography>
            <Box>
              {unreadCount > 0 && (
                <Button
                  size="small"
                  startIcon={<MarkEmailRead />}
                  onClick={markAllAsRead}
                  sx={{ mr: 1 }}
                >
                  Mark all read
                </Button>
              )}
              <IconButton size="small">
                <Settings />
              </IconButton>
            </Box>
          </Box>
        </Box>

        <Box sx={{ maxHeight: 400, overflow: 'auto' }}>
          {notifications.length === 0 ? (
            <Box sx={{ p: 3, textAlign: 'center' }}>
              <Typography color="text.secondary">
                No notifications yet
              </Typography>
            </Box>
          ) : (
            <List sx={{ p: 0 }}>
              {notifications.slice(0, 10).map((notification, index) => (
                <React.Fragment key={notification.id}>
                  <ListItem
                    sx={{
                      backgroundColor: notification.isRead ? 'transparent' : 'action.hover',
                      cursor: 'pointer',
                      '&:hover': {
                        backgroundColor: 'action.selected',
                      },
                    }}
                    onClick={() => !notification.isRead && markAsRead(notification.id)}
                  >
                    <ListItemIcon>
                      {getNotificationIcon(notification.type)}
                    </ListItemIcon>
                    <ListItemText
                      primary={
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Typography
                            variant="subtitle2"
                            sx={{
                              fontWeight: notification.isRead ? 'normal' : 'bold',
                              flex: 1,
                            }}
                          >
                            {notification.title}
                          </Typography>
                          <Chip
                            label={notification.category}
                            size="small"
                            sx={{
                              backgroundColor: getCategoryColor(notification.category),
                              color: 'white',
                              fontSize: '0.7rem',
                              height: 20,
                            }}
                          />
                        </Box>
                      }
                      secondary={
                        <Box>
                          <Typography
                            variant="body2"
                            color="text.secondary"
                            sx={{
                              display: '-webkit-box',
                              WebkitLineClamp: 2,
                              WebkitBoxOrient: 'vertical',
                              overflow: 'hidden',
                              mb: 0.5,
                            }}
                          >
                            {notification.message}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {formatTimeAgo(notification.createdAt)}
                          </Typography>
                        </Box>
                      }
                    />
                    <IconButton
                      size="small"
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteNotification(notification.id);
                      }}
                      sx={{ ml: 1 }}
                    >
                      <Delete fontSize="small" />
                    </IconButton>
                  </ListItem>
                  {index < notifications.length - 1 && <Divider />}
                </React.Fragment>
              ))}
            </List>
          )}
        </Box>

        {notifications.length > 10 && (
          <Box sx={{ p: 2, borderTop: 1, borderColor: 'divider', textAlign: 'center' }}>
            <Button size="small">
              View all notifications
            </Button>
          </Box>
        )}
      </Popover>
    </>
  );
}