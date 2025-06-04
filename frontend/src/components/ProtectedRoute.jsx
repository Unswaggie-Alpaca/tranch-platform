import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useApp } from '../contexts';
import { LoadingSpinner } from '../App';

export const ProtectedRoute = ({ children, roles = [] }) => {
  const { user, loading, isAuthenticated } = useApp();
  const location = useLocation();

  if (loading) {
    return <LoadingSpinner message="Loading..." />;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (!user || !user.role) {
    return <Navigate to="/onboarding" replace />;
  }

  if (roles.length > 0 && !roles.includes(user.role)) {
    return <Navigate to="/dashboard" replace />;
  }

  return children;
};

