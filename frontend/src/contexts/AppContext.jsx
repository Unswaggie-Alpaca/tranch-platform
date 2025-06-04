import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { useUser, useAuth } from '@clerk/clerk-react';
import { createApiClient } from '../hooks/useApi';

export const AppContext = createContext();

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within AppProvider');
  }
  return context;
};

export const AppProvider = ({ children }) => {
  const { user: clerkUser, isSignedIn, isLoaded } = useUser();
  const { getToken } = useAuth();
  const [userData, setUserData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchUserData = useCallback(async () => {
    if (!isSignedIn || !clerkUser) {
      setUserData(null);
      setLoading(false);
      return;
    }

    try {
      const api = createApiClient(getToken);
      const data = await api.getCurrentUser();
      setUserData(data.user);
      setError(null);
    } catch (err) {
      console.error('Failed to fetch user data:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [isSignedIn, clerkUser, getToken]);

  useEffect(() => {
    if (isLoaded) {
      fetchUserData();
    }
  }, [isLoaded, fetchUserData]);

  const refreshUser = async () => {
    await fetchUserData();
  };

  const value = {
    user: userData,
    loading,
    error,
    refreshUser,
    isAuthenticated: isSignedIn
  };

  return (
    <AppContext.Provider value={value}>
      {children}
    </AppContext.Provider>
  );
};

