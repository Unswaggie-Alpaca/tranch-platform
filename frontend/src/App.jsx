// App.jsx - Production-Ready Tranch Platform
import React, { useState, useEffect, createContext, useContext, useRef, useCallback } from 'react';
import { 
  BrowserRouter as Router, 
  Routes, 
  Route, 
  Navigate, 
  Link, 
  useNavigate, 
  useLocation,
  useParams 
} from 'react-router-dom';
import './App.css';
import ReactMarkdown from 'react-markdown';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, CardElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { 
  ClerkProvider, 
  SignedIn, 
  SignedOut, 
  useUser, 
  useClerk,
  useAuth,
  SignIn,
  SignUp 
} from '@clerk/clerk-react';

// ===========================
// CONFIGURATION
// ===========================

// Clerk Configuration
const CLERK_PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

if (!CLERK_PUBLISHABLE_KEY) {
  throw new Error('Missing Clerk Publishable Key');
}

// API Configuration
const API_BASE_URL = import.meta.env.VITE_API_URL || (
  import.meta.env.PROD
    ? 'https://fundr-demo.onrender.com/api'
    : 'http://localhost:5000/api'
);

// Stripe Configuration
const STRIPE_PUBLISHABLE_KEY = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY;

if (!STRIPE_PUBLISHABLE_KEY) {
  throw new Error('Missing Stripe Publishable Key');
}

const stripePromise = loadStripe(STRIPE_PUBLISHABLE_KEY);

// ===========================
// API CLIENT
// ===========================

const createApiClient = (getToken) => {
  const request = async (endpoint, options = {}) => {
    try {
      const token = await getToken();
      
      const config = {
        headers: {
          'Content-Type': 'application/json',
          ...(token && { Authorization: `Bearer ${token}` }),
          ...options.headers,
        },
        ...options,
      };

      // Don't set Content-Type for FormData
      if (options.body instanceof FormData) {
        delete config.headers['Content-Type'];
      }

      const response = await fetch(`${API_BASE_URL}${endpoint}`, config);
      
      // Handle non-OK responses
      if (!response.ok) {
        let errorMessage = `HTTP ${response.status}`;
        const contentType = response.headers.get('content-type');
        
        if (contentType && contentType.includes('application/json')) {
          try {
            const errorData = await response.json();
            errorMessage = errorData.error || errorMessage;
          } catch (e) {
            errorMessage = response.statusText || errorMessage;
          }
        } else {
          try {
            const textError = await response.text();
            if (textError && textError.length < 200) {
              errorMessage = textError;
            }
          } catch (e) {
            // Ignore text parsing errors
          }
        }
        
        throw new Error(errorMessage);
      }

      // Handle empty responses
      if (response.status === 204 || response.headers.get('content-length') === '0') {
        return {};
      }

      // Try to parse JSON
      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        try {
          return await response.json();
        } catch (e) {
          console.warn('Failed to parse JSON response');
          return {};
        }
      } else {
        const text = await response.text();
        console.warn('Non-JSON response received:', text);
        return { data: text };
      }
    } catch (error) {
      console.error('API Error:', error);
      throw error;
    }
  };

  return {
    request,

    // Auth endpoints
    getCurrentUser: () => request('/auth/me'),
    setUserRole: (role) => request('/auth/set-role', {
      method: 'POST',
      body: JSON.stringify({ role }),
    }),
    completeProfile: (profileData) => request('/auth/complete-profile', {
      method: 'POST',
      body: JSON.stringify(profileData),
    }),

    // User profile endpoints
    getUserProfile: (userId) => request(`/users/${userId}/profile`),
    updateUserProfile: (userId, profileData) => request(`/users/${userId}/profile`, {
      method: 'PUT',
      body: JSON.stringify(profileData),
    }),

    // Project endpoints
    getProjects: () => request('/projects'),
    createProject: (projectData) => request('/projects', {
      method: 'POST',
      body: JSON.stringify(projectData),
    }),
    getProject: (id) => request(`/projects/${id}`),
    updateProject: (id, projectData) => request(`/projects/${id}`, {
      method: 'PUT',
      body: JSON.stringify(projectData),
    }),
    resubmitProject: (id) => request(`/projects/${id}/resubmit`, {
      method: 'POST',
    }),

    // Document endpoints
    uploadDocuments: (projectId, formData) => request(`/projects/${projectId}/documents`, {
      method: 'POST',
      body: formData,
    }),
    getProjectDocuments: (projectId) => request(`/projects/${projectId}/documents`),
    deleteDocument: (documentId) => request(`/documents/${documentId}`, {
      method: 'DELETE',
    }),
    getRequiredDocuments: () => request('/required-documents'),
    
// In createApiClient, add this method:
updateProjectStatus: (projectId, data) => request(`/admin/update-project-status/${projectId}`, {
  method: 'POST',
  body: JSON.stringify(data),
}),

    // Document download
    async downloadDocument(filePath) {
      const token = await getToken();
      const filename = filePath.split('/').pop();
      // Use the base URL without /api, as uploads is served from root
      const baseUrl = API_BASE_URL.replace('/api', '');
      const response = await fetch(`${baseUrl}/uploads/${filename}`, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });
      
      if (!response.ok) {
        console.error('Download failed:', response.status, response.statusText);
        throw new Error('Download failed');
      }
      return response.blob();
    },

    // Deal endpoints
    getDeal: (dealId) => request(`/deals/${dealId}`),
    createDeal: (projectId, accessRequestId) => request('/deals', {
      method: 'POST',
      body: JSON.stringify({ project_id: projectId, access_request_id: accessRequestId }),
    }),
    completeDeal: (dealId) => request(`/deals/${dealId}/complete`, {
      method: 'PUT',
    }),

    // Deal documents
    getDealDocuments: (dealId) => request(`/deals/${dealId}/documents`),
    uploadDealDocuments: (dealId, formData) => request(`/deals/${dealId}/documents`, {
      method: 'POST',
      body: formData,
    }),
    downloadDealDocument: async (dealId, documentId) => {
      const token = await getToken();
      const response = await fetch(`${API_BASE_URL}/deals/${dealId}/documents/${documentId}`, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });
      
      if (!response.ok) throw new Error('Download failed');
      return response.blob();
    },
    viewDealDocument: async (dealId, documentId) => {
      const token = await getToken();
      const response = await fetch(`${API_BASE_URL}/deals/${dealId}/documents/${documentId}/view`, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });
      
      if (!response.ok) throw new Error('View failed');
      return response.blob();
    },

    // Document requests
    getDocumentRequests: (dealId) => request(`/deals/${dealId}/document-requests`),
    createDocumentRequest: (dealId, requestData) => request(`/deals/${dealId}/document-requests`, {
      method: 'POST',
      body: JSON.stringify(requestData),
    }),
    fulfillDocumentRequest: (requestId) => request(`/document-requests/${requestId}/fulfill`, {
      method: 'PUT',
    }),

    // Deal comments
    getDealComments: (dealId) => request(`/deals/${dealId}/comments`),
    createDealComment: (dealId, commentData) => request(`/deals/${dealId}/comments`, {
      method: 'POST',
      body: JSON.stringify(commentData),
    }),

    getProjectDeals: (projectId) => request(`/projects/${projectId}/deals`),
    getProjectDocumentsForDeal: (projectId) => request(`/projects/${projectId}/documents/deal`),

    // Proposals
    getDealProposal: (dealId) => request(`/deals/${dealId}/proposal`),
    createProposal: (dealId, proposalData) => request(`/deals/${dealId}/proposals`, {
      method: 'POST',
      body: JSON.stringify(proposalData),
    }),
    respondToProposal: (proposalId, response) => request(`/proposals/${proposalId}/respond`, {
      method: 'PUT',
      body: JSON.stringify(response),
    }),

    // Notifications
    createNotification: (dealId, notificationData) => request(`/deals/${dealId}/notifications`, {
      method: 'POST',
      body: JSON.stringify(notificationData),
    }),
    getNotifications: () => request('/notifications'),
    markNotificationRead: (notificationId) => request(`/notifications/${notificationId}/read`, {
      method: 'PUT',
    }),

    // Payment endpoints
    createProjectPayment: (projectId) => request('/payments/create-project-payment', {
      method: 'POST',
      body: JSON.stringify({ project_id: projectId }),
    }),
    createSubscription: (paymentMethodId) => request('/payments/create-subscription', {
      method: 'POST',
      body: JSON.stringify({ payment_method_id: paymentMethodId }),
    }),
    cancelSubscription: () => request('/payments/cancel-subscription', {
      method: 'POST',
    }),

    // Access request endpoints
    requestAccess: (projectId, initialMessage) => request('/access-requests', {
      method: 'POST',
      body: JSON.stringify({ project_id: projectId, initial_message: initialMessage }),
    }),
    getAccessRequests: () => request('/access-requests'),
    
    // Admin messaging
    sendAdminMessage: (userId, message) => request('/admin/messages/send', {
      method: 'POST',
      body: JSON.stringify({ user_id: userId, message })
    }),
    getAdminConversations: () => request('/admin/messages'),
    getAdminMessages: (userId) => request(`/admin/messages/${userId}`),
    getUserAdminMessages: () => request('/messages/admin'),
    replyToAdmin: (message) => request('/messages/admin/reply', {
      method: 'POST',
      body: JSON.stringify({ message })
    }),
    approveAccessRequest: (requestId) => request(`/access-requests/${requestId}/approve`, {
      method: 'PUT',
    }),
    declineAccessRequest: (requestId) => request(`/access-requests/${requestId}/decline`, {
      method: 'PUT',
    }),

    // Messaging endpoints
    getMessages: (requestId) => request(`/access-requests/${requestId}/messages`),
    sendMessage: (requestId, message) => request(`/access-requests/${requestId}/messages`, {
      method: 'POST',
      body: JSON.stringify({ message, message_type: 'text' }),
    }),
    markMessageAsRead: (messageId) => request(`/messages/${messageId}/read`, {
      method: 'PUT',
    }),

    // AI Chat endpoints
    createAIChatSession: (projectId, sessionTitle) => request('/ai-chat/sessions', {
      method: 'POST',
      body: JSON.stringify({ project_id: projectId, session_title: sessionTitle }),
    }),
    getAIChatSessions: () => request('/ai-chat/sessions'),
    getAIChatMessages: (sessionId) => request(`/ai-chat/sessions/${sessionId}/messages`),
    sendAIChatMessage: (sessionId, message) => request(`/ai-chat/sessions/${sessionId}/messages`, {
      method: 'POST',
      body: JSON.stringify({ message }),
    }),

    // Admin endpoints
    getUsers: () => request('/admin/users'),
    approveUser: (userId) => request(`/admin/users/${userId}/approve`, {
      method: 'PUT',
    }),
    getAdminStats: () => request('/admin/stats'),
    getSystemSettings: () => request('/admin/system-settings'),
    updateSystemSetting: (key, value) => request(`/admin/system-settings/${key}`, {
      method: 'PUT',
      body: JSON.stringify({ value }),
    }),
revertToDraft: (projectId, reason) => request(`/admin/revert-to-draft/${projectId}`, {
  method: 'POST',
  body: JSON.stringify({ reason }),
}),
    // Notification preferences
    getNotificationPreferences: () => request('/notifications/preferences'),
    updateNotificationPreferences: (preferences) => request('/notifications/preferences', {
      method: 'PUT',
      body: JSON.stringify(preferences),
    }),

    // Email notification endpoints
    sendEmailNotification: (type, recipientId, data) => request('/notifications/email', {
      method: 'POST',
      body: JSON.stringify({ type, recipient_id: recipientId, data }),
    }),

    // Contact info endpoints
    getContactInfo: (userId) => request(`/users/${userId}/contact`),
    shareContactInfo: (userId, targetUserId) => request('/users/share-contact', {
      method: 'POST',
      body: JSON.stringify({ user_id: userId, target_user_id: targetUserId }),
    }),

    // Admin God Mode - ENHANCED
    getUnpaidProjects: () => request('/admin/unpaid-projects'),
    forceApproveFunder: (userId, reason) => request(`/admin/force-approve-funder/${userId}`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    }),
    forcePublishProject: (projectId, reason, stripePaymentVerified = false) => request(`/admin/force-publish-project/${projectId}`, {
      method: 'POST',
      body: JSON.stringify({ reason, stripePaymentVerified }),
    }),
    rejectProject: (projectId, reason) => request(`/admin/reject-project/${projectId}`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    }),
    forceCompleteDeal: (dealId, reason) => request(`/admin/force-complete-deal/${dealId}`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    }),
    deleteProject: (projectId, reason) => request(`/admin/delete-project/${projectId}`, {
      method: 'DELETE',
      body: JSON.stringify({ reason }),
    }),
    getAllPayments: () => request('/admin/all-payments'),
    viewAsUser: (userId) => request(`/admin/view-as-user/${userId}`),
    sendSystemMessage: (userId, message) => request('/admin/send-system-message', {
      method: 'POST',
      body: JSON.stringify({ user_id: userId, message }),
    }),
    exportAllData: () => request('/admin/export-all-data'),
    checkStripePayment: (projectId) => request(`/admin/check-stripe-payment/${projectId}`, {
      method: 'POST',
    }),
    syncStripePayment: (projectId) => request(`/admin/sync-stripe-payment/${projectId}`, {
      method: 'POST',
    }),
    getOverrideHistory: () => request('/admin/override-history'),getOverrideHistory: () => request('/admin/override-history'),
    
    // Universal project status control
    updateProjectStatus: (projectId, data) => request(`/admin/update-project-status/${projectId}`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

    // New admin project management endpoints
    getAdminProjects: (params) => {
      const queryString = params ? '?' + new URLSearchParams(params).toString() : '';
      return request(`/admin/projects${queryString}`);
    },
    approveProject: (projectId) => request(`/admin/approve-project/${projectId}`, {
      method: 'POST',
    }),
    denyProject: (projectId, reason) => request(`/admin/deny-project/${projectId}`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    }),
    markPaymentFailed: (projectId) => request(`/admin/payment-failed/${projectId}`, {
      method: 'POST',
    }),
    
    // Universal project status control
    updateProjectStatus: (projectId, data) => request(`/admin/update-project-status/${projectId}`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
    
    // Subscription management endpoints
    approveSubscription: (userId) => request(`/admin/approve-subscription/${userId}`, {
      method: 'POST',
    }),
    denySubscription: (userId, reason) => request(`/admin/deny-subscription/${userId}`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    }),
    markSubscriptionFailed: (userId) => request(`/admin/subscription-failed/${userId}`, {
      method: 'POST',
    }),
  };
};


// ===========================
// CONTEXTS
// ===========================

// App Context
const AppContext = createContext();

const useApp = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within AppProvider');
  }
  return context;
};

// Notification Context
const NotificationContext = createContext();

const useNotifications = () => {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotifications must be used within NotificationProvider');
  }
  return context;
};

// ===========================
// PROVIDERS
// ===========================

const AppProvider = ({ children }) => {
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
      // Don't clear userData on error - keep cached version
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

const NotificationProvider = ({ children }) => {
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [lastFetch, setLastFetch] = useState(0);
  const api = useApi();
  const { isLoaded, isSignedIn } = useAuth();

  // Fetch notifications from API with rate limiting
  const fetchNotifications = useCallback(async () => {
    if (!isLoaded || !isSignedIn) return;
    
    // Prevent fetching more than once every 30 seconds
    const now = Date.now();
    if (now - lastFetch < 30000) {
      return;
    }
    setLastFetch(now);
    
    try {
      const notifications = await api.getNotifications();
      const notifs = notifications.map(n => ({
        ...n,
        timestamp: new Date(n.created_at),
        title: getNotificationTitle(n.type),
        read: n.read === 1
      }));
      setNotifications(notifs);
      setUnreadCount(notifs.filter(n => !n.read).length);
    } catch (error) {
      // Only log non-rate-limit errors
      if (!error.message || !error.message.includes('Too many requests')) {
        console.error('Failed to fetch notifications:', error);
      }
    }
  }, [api, isLoaded, isSignedIn, lastFetch]);

  // Fetch notifications on mount and periodically
  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;
    
    // Initial fetch
    fetchNotifications();
    
    // Set up interval - use 60 seconds to be safe
    const interval = setInterval(fetchNotifications, 60000);
    return () => clearInterval(interval);
  }, [isLoaded, isSignedIn]); // Remove fetchNotifications from deps

  // Helper function to get notification title based on type
  const getNotificationTitle = (type) => {
    const titles = {
      'project_approved': 'Project Approved',
      'access_request': 'New Access Request',
      'access_granted': 'Access Granted',
      'deal_engagement': 'New Deal Engagement',
      'proposal_received': 'New Proposal',
      'proposal_response': 'Proposal Update',
      'account_approved': 'Account Approved'
    };
    return titles[type] || 'Notification';
  };

  const addNotification = (notification) => {
    const id = Date.now();
    const newNotification = {
      id,
      ...notification,
      timestamp: new Date(),
      read: false
    };
    
    setNotifications(prev => [newNotification, ...prev]);
    setUnreadCount(prev => prev + 1);
    
    // Auto-remove after 5 seconds if it's a toast
    if (notification.type === 'toast') {
      setTimeout(() => {
        removeNotification(id);
      }, 5000);
    }
  };

  const removeNotification = (id) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  };

  const markAsRead = (id) => {
    setNotifications(prev => 
      prev.map(n => n.id === id ? { ...n, read: true } : n)
    );
    setUnreadCount(prev => Math.max(0, prev - 1));
  };

   const markAllAsRead = async () => {
    // Mark all as read in the backend
    const unreadNotifications = notifications.filter(n => !n.read);
    
    // Use Promise.all to mark all notifications as read concurrently
    try {
      await Promise.all(
        unreadNotifications.map(n => 
          api.markNotificationRead(n.id)
        )
      );
      
      // Update local state after successful API calls
      setNotifications(prev => prev.map(n => ({ ...n, read: true })));
      setUnreadCount(0);
    } catch (error) {
      console.error('Failed to mark all notifications as read:', error);
    }
  };

  const value = {
    notifications,
    unreadCount,
    addNotification,
    removeNotification,
    markAsRead,
    markAllAsRead,
    fetchNotifications
  };

  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  );
};

// ===========================
// TOAST CONTEXT
// ===========================

const ToastContext = createContext();

const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within ToastProvider');
  }
  return context;
};

const ToastProvider = ({ children }) => {
  const [toasts, setToasts] = useState([]);

  const showToast = (message, type = 'success', duration = 4000) => {
    const id = Date.now();
    const newToast = { id, message, type };
    
    setToasts(prev => [...prev, newToast]);
    
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, duration);
  };

  const removeToast = (id) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  };

  return (
    <ToastContext.Provider value={{ showToast, removeToast }}>
      {children}
      <div className="toast-container">
        {toasts.map(toast => (
          <div key={toast.id} className={`toast-notification toast-${toast.type}`}>
            <span className="toast-message">{toast.message}</span>
            <button 
              onClick={() => removeToast(toast.id)} 
              className="toast-close"
              aria-label="Close"
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
};

// ===========================
// HOOKS
// ===========================

const useApi = () => {
  const { getToken } = useAuth();
  return createApiClient(getToken);
};

const useDebounce = (value, delay) => {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
};

// ===========================
// UTILITY FUNCTIONS
// ===========================

const formatCurrency = (amount) => {
  if (!amount && amount !== 0) return '-';
  return new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency: 'AUD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
};

const formatNumber = (num) => {
  if (!num && num !== 0) return '-';
  return new Intl.NumberFormat('en-AU').format(num);
};

const formatDate = (dateString) => {
  if (!dateString) return '-';
  return new Date(dateString).toLocaleDateString('en-AU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
};

const formatDateTime = (dateString) => {
  if (!dateString) return '-';
  return new Date(dateString).toLocaleString('en-AU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
};

const formatTime = (dateString) => {
  if (!dateString) return '-';
  
  const date = new Date(dateString);
  
  // Check if date is invalid
  if (isNaN(date.getTime())) {
    console.warn('Invalid date string:', dateString);
    return '-';
  }
  
  const now = new Date();
  const diffInHours = (now - date) / (1000 * 60 * 60);
  
  if (diffInHours < 24) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } else if (diffInHours < 24 * 7) {
    return date.toLocaleDateString([], { weekday: 'short' });
  } else {
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  }
};

const downloadCSV = (data, filename) => {
  const csv = convertToCSV(data);
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  window.URL.revokeObjectURL(url);
};

const convertToCSV = (data) => {
  if (!data || data.length === 0) return '';
  
  const headers = Object.keys(data[0]);
  const csvHeaders = headers.join(',');
  
  const csvRows = data.map(row => {
    return headers.map(header => {
      const value = row[header];
      // Escape quotes and wrap in quotes if contains comma
      const escaped = String(value || '').replace(/"/g, '""');
      return escaped.includes(',') ? `"${escaped}"` : escaped;
    }).join(',');
  });
  
  return [csvHeaders, ...csvRows].join('\n');
};

const validateEmail = (email) => {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email);
};

const validatePhone = (phone) => {
  const re = /^(\+61|0)[2-478][\d]{8}$/;
  return re.test(phone.replace(/\s/g, ''));
};

const validateABN = (abn) => {
  const abnRegex = /^[0-9]{11}$/;
  return abnRegex.test(abn.replace(/\s/g, ''));
};

// ===========================
// COMPONENTS
// ===========================

// Loading Spinner
const LoadingSpinner = ({ size = 'default', message }) => (
  <div className={`loading-spinner ${size}`}>
    <div className="spinner"></div>
    {message && <p className="loading-message">{message}</p>}
  </div>
);

// Error Message
const ErrorMessage = ({ message, onClose }) => (
  <div className="error-message">
    <span>{message}</span>
    {onClose && <button onClick={onClose} className="close-btn">×</button>}
  </div>
);

// Success Message
const SuccessMessage = ({ message, onClose }) => (
  <div className="success-message">
    <span>{message}</span>
    {onClose && <button onClick={onClose} className="close-btn">×</button>}
  </div>
);

// Info Message
const InfoMessage = ({ message, onClose }) => (
  <div className="info-message">
    <span>{message}</span>
    {onClose && <button onClick={onClose} className="close-btn">×</button>}
  </div>
);



// Toast Notification
const Toast = ({ message, type = 'info', onClose }) => {
  useEffect(() => {
    const timer = setTimeout(() => {
      onClose();
    }, 5000);
    return () => clearTimeout(timer);
  }, [onClose]);

  return (
    <div className={`toast toast-${type}`}>
      <span>{message}</span>
      <button onClick={onClose} className="toast-close">×</button>
    </div>
  );
};

// Enhanced Tooltip Component
const Tooltip = ({ children, content, position = 'top' }) => {
  return (
    <div className="tooltip-wrapper">
      {children}
      <div className={`tooltip tooltip-${position}`}>
        {content}
      </div>
    </div>
  );
};

// Modal
const Modal = ({ isOpen, onClose, title, children, size = 'medium' }) => {
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className={`modal-content modal-${size}`} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{title}</h2>
          <button onClick={onClose} className="close-btn">×</button>
        </div>
        <div className="modal-body">
          {children}
        </div>
      </div>
    </div>
  );
};

// Confirmation Dialog
const ConfirmationDialog = ({ isOpen, onClose, onConfirm, title, message, confirmText = 'Confirm', cancelText = 'Cancel', danger = false }) => {
  const [inputValue, setInputValue] = useState('');
  const requiresInput = message.includes('type "DELETE"');
  
  const handleConfirm = () => {
    if (requiresInput && inputValue !== 'DELETE') {
      return;
    }
    onConfirm();
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} size="small">
      <div className="confirmation-dialog">
        <p>{message}</p>
        {requiresInput && (
          <input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder="Type DELETE to confirm"
            className="form-input"
          />
        )}
        <div className="dialog-actions">
          <button onClick={onClose} className="btn btn-outline">
            {cancelText}
          </button>
          <button 
            onClick={handleConfirm} 
            className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`}
            disabled={requiresInput && inputValue !== 'DELETE'}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </Modal>
  );
};

// Number Input with Format
const NumberInput = ({ value, onChange, placeholder, prefix = '', suffix = '', min, max, step = 1, disabled = false }) => {
  const inputRef = useRef(null);
  const [displayValue, setDisplayValue] = useState('');
  const [isFocused, setIsFocused] = useState(false);

  useEffect(() => {
    if (!isFocused && value) {
      setDisplayValue(formatNumber(value));
    } else if (!isFocused) {
      setDisplayValue('');
    }
  }, [value, isFocused]);

  const handleFocus = () => {
    setIsFocused(true);
    setDisplayValue(value || '');
    // Prevent scroll
    if (inputRef.current) {
      inputRef.current.addEventListener('wheel', preventDefault, { passive: false });
    }
  };

  const handleBlur = () => {
    setIsFocused(false);
    if (inputRef.current) {
      inputRef.current.removeEventListener('wheel', preventDefault);
    }
  };

  const preventDefault = (e) => {
    e.preventDefault();
  };

  const handleChange = (e) => {
    const rawValue = e.target.value.replace(/[^0-9.-]/g, '');
    setDisplayValue(rawValue);
    
    const numValue = parseFloat(rawValue) || 0;
    if (onChange) {
      onChange(numValue);
    }
  };

  return (
    <div className="number-input-wrapper">
      {prefix && <span className="input-prefix">{prefix}</span>}
      <input
        ref={inputRef}
        type="text"
        value={displayValue}
        onChange={handleChange}
        onFocus={handleFocus}
        onBlur={handleBlur}
        placeholder={placeholder}
        className="form-input number-input"
        disabled={disabled}
      />
      {suffix && <span className="input-suffix">{suffix}</span>}
    </div>
  );
};

// Progress Bar
const ProgressBar = ({ value, max = 100, label, showPercentage = true }) => {
  const percentage = Math.min(100, Math.max(0, (value / max) * 100));
  
  return (
    <div className="progress-bar-container">
      {label && <div className="progress-label">{label}</div>}
      <div className="progress-bar">
        <div className="progress-fill" style={{ width: `${percentage}%` }}>
          {showPercentage && percentage > 10 && (
            <span className="progress-text">{Math.round(percentage)}%</span>
          )}
        </div>
      </div>
      {showPercentage && percentage <= 10 && (
        <span className="progress-text-outside">{Math.round(percentage)}%</span>
      )}
    </div>
  );
};

// Tab Component
const Tabs = ({ tabs, activeTab, onChange }) => (
  <div className="tabs">
    {tabs.map((tab) => (
      <button
        key={tab.id}
        className={`tab ${activeTab === tab.id ? 'active' : ''}`}
        onClick={() => onChange(tab.id)}
        disabled={tab.disabled}
      >
        {tab.label}
        {tab.badge && <span className="tab-badge">{tab.badge}</span>}
      </button>
    ))}
  </div>
);

// Empty State
const EmptyState = ({ icon = '', title, message, action }) => (
  <div className="empty-state">
    <div className="empty-icon">{icon}</div>
    <h3>{title}</h3>
    <p>{message}</p>
    {action && (
      <div className="empty-action">
        {action}
      </div>
    )}
  </div>
);

// Status Badge
const StatusBadge = ({ status, type = 'default' }) => {
  const getStatusClass = () => {
    switch (status?.toLowerCase()) {
      case 'active':
      case 'approved':
      case 'paid':
      case 'complete':
      case 'success':
        return 'success';
      case 'pending':
      case 'processing':
      case 'draft':
        return 'warning';
      case 'declined':
      case 'failed':
      case 'unpaid':
      case 'cancelled':
        return 'error';
      default:
        return 'default';
    }
  };

  return (
    <span className={`status-badge status-${getStatusClass()}`}>
      {status}
    </span>
  );
};

// Add this component to your App.jsx file after the StatusBadge component

const FileUpload = ({ onUpload, accept, maxSize, multiple = false, disabled = false, children }) => {
  const fileInputRef = useRef(null);
  const { addNotification } = useNotifications();
  
  const handleClick = () => {
    if (!disabled && fileInputRef.current) {
      fileInputRef.current.click();
    }
  };
  
  const handleChange = (e) => {
    const files = Array.from(e.target.files);
    
    // Validate file sizes
    const oversizedFiles = files.filter(file => file.size > maxSize);
    if (oversizedFiles.length > 0) {
      addNotification({
        type: 'error',
        title: 'File Too Large',
        message: `Maximum file size is ${Math.round(maxSize / 1024 / 1024)}MB`
      });
      return;
    }
    
    // Call the upload handler
    if (files.length > 0 && onUpload) {
      onUpload(files);
    }
    
    // Reset input
    e.target.value = '';
  };
  
  return (
    <div className="file-upload-wrapper" onClick={handleClick}>
      <input
        ref={fileInputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        onChange={handleChange}
        disabled={disabled}
        className="file-upload-input"
      />
      {children}
    </div>
  );
};

// ===========================
// PAYMENT MODAL - Place this AFTER your utility functions but BEFORE Dashboard component
// ===========================
const PaymentModal = ({ isOpen, onClose, project, onSuccess }) => {
  const [processing, setProcessing] = useState(false);
  
  if (!isOpen) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Publish Project" size="medium">
      <div className="payment-summary">
        <h3>{project.title}</h3>
        <p className="payment-description">
          Publishing your project will make it visible to all verified funders on the platform.
        </p>
        <div className="payment-amount">
          <span>Publishing Fee:</span>
          <strong>{formatCurrency(499)}</strong>
        </div>
      </div>

      <Elements stripe={stripePromise}>
        <PaymentForm 
          amount={499}
          projectId={project.id}
          onSuccess={onSuccess}
          processing={processing}
          setProcessing={setProcessing}
        />
      </Elements>

      <div className="payment-security">
        <span>🔒</span>
        <p>Secured by Stripe. Your payment information is encrypted and secure.</p>
      </div>
    </Modal>
  );
};

// Payment Form Component
// In PaymentForm component, update the payment success handling:
const PaymentForm = ({ amount, projectId, onSuccess, processing, setProcessing }) => {
  const api = useApi();
  const stripe = useStripe();
  const elements = useElements();
  const { addNotification } = useNotifications();
  const [cardError, setCardError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!stripe || !elements) {
      console.error('Stripe not loaded');
      return;
    }

    setProcessing(true);
    setCardError('');

    try {
      // 1. Create payment intent on server using the api client
      const data = await api.createProjectPayment(projectId);

      // 2. Check if payment is already completed
      if (data.status === 'payment_pending') {
        addNotification({
          type: 'info',
          title: 'Payment Already Processed',
          message: data.message
        });
        onSuccess();
        return;
      }

      // 3. Get the card element
      const cardElement = elements.getElement(CardElement);
      if (!cardElement) {
        throw new Error('Card element not found');
      }

      // 4. Confirm the payment
      
      const result = await stripe.confirmCardPayment(data.client_secret, {
        payment_method: {
          card: cardElement,
          billing_details: {
            // You can add billing details here if needed
          }
        }
      });

      if (result.error) {
        // Show error to customer
        console.error('Payment confirmation error:', result.error);
        setCardError(result.error.message);
        throw new Error(result.error.message);
      }

      // 5. Payment succeeded!
      console.log('Payment confirmed:', result.paymentIntent);
      
      addNotification({
        type: 'success',
        title: 'Payment Successful',
        message: 'Your payment has been received. Your project is now under admin review.'
      });
      
      onSuccess();

    } catch (err) {
      console.error('Payment error:', err);
      addNotification({
        type: 'error',
        title: 'Payment Failed',
        message: err.message || 'An error occurred during payment'
      });
    } finally {
      setProcessing(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="payment-form">
      <div className="card-element-container">
        <CardElement 
          options={{
            style: {
              base: {
                fontSize: '16px',
                color: '#424770',
                '::placeholder': { 
                  color: '#aab7c4' 
                }
              },
              invalid: {
                color: '#9e2146',
              }
            },
            hidePostalCode: true
          }}
          onChange={(event) => {
            if (event.error) {
              setCardError(event.error.message);
            } else {
              setCardError('');
            }
          }}
        />
        {cardError && (
          <div className="card-error">
            {cardError}
          </div>
        )}
      </div>
      
      <button
        type="submit"
        disabled={!stripe || processing}
        className="btn btn-primary btn-block"
      >
        {processing ? (
          <>
            <span className="spinner-small"></span>
            Processing...
          </>
        ) : (
          `Pay ${formatCurrency(amount)}`
        )}
      </button>
    </form>
  );
};

// ===========================
// DEAL ROOM SELECTOR MODAL
// ===========================

const DealRoomSelector = ({ isOpen, onClose, project, deals }) => {
  const navigate = useNavigate();
  const { user } = useApp();
  const [loadingDeals, setLoadingDeals] = useState(false);
  const [dealsList, setDealsList] = useState(deals || []);
  const api = useApi();

  useEffect(() => {
    if (isOpen && !deals) {
      fetchDeals();
    } else if (deals) {
      setDealsList(deals);
    }
  }, [isOpen, deals]);

  const fetchDeals = async () => {
    setLoadingDeals(true);
    try {
      const response = await api.getProjectDeals(project.id);
      setDealsList(response);
    } catch (err) {
      console.error('Failed to fetch deals:', err);
    } finally {
      setLoadingDeals(false);
    }
  };

  const handleDealSelect = (dealId) => {
    navigate(`/project/${project.id}/deal/${dealId}`);
    onClose();
  };

  const getStatusBadge = (deal) => {
    if (deal.last_proposal_status === 'pending') {
      return <span className="badge badge-warning">Pending Quote</span>;
    }
    if (deal.last_proposal_status === 'accepted') {
      return <span className="badge badge-success">Quote Accepted</span>;
    }
    if (deal.unread_count > 0) {
      return <span className="badge badge-info">{deal.unread_count} New</span>;
    }
    return null;
  };

  const formatLastActivity = (date) => {
    if (!date) return 'No activity';
    const d = new Date(date);
    const now = new Date();
    const diffMs = now - d;
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    return d.toLocaleDateString();
  };

  return (
    <Modal 
      isOpen={isOpen} 
      onClose={onClose} 
      title={`Select Deal Room - ${project.title}`}
      size="medium"
    >
      <div className="deal-selector-modal">
        <p className="modal-subtitle">
          You have {dealsList.length} active deal room{dealsList.length !== 1 ? 's' : ''} for this project.
          Select one to continue:
        </p>

        {loadingDeals ? (
          <div className="loading-spinner">Loading deal rooms...</div>
        ) : (
          <div className="deal-selector-list">
            {dealsList.map(deal => (
              <div 
                key={deal.id} 
                className="deal-selector-item"
                onClick={() => handleDealSelect(deal.id)}
              >
                <div className="deal-selector-header">
                  <div className="deal-selector-info">
                    <h4 className="deal-selector-name">{deal.funder_name}</h4>
                    <p className="deal-selector-email">{deal.funder_email}</p>
                  </div>
                  {deal.proposal_status === 'accepted' && (
                    <span className="badge badge-success">Quote Accepted</span>
                  )}
                </div>
                
                <div className="deal-selector-details">
                  <div className="deal-selector-stat">
                    <span className="stat-label">Created:</span>
                    <span className="stat-value">{formatLastActivity(deal.created_at)}</span>
                  </div>
                  <div className="deal-selector-stat">
                    <span className="stat-label">Deal ID:</span>
                    <span className="stat-value">#{deal.id}</span>
                  </div>
                </div>

                <div className="deal-selector-actions">
                  <button className="btn btn-primary btn-sm">
                    Enter Deal Room
                    <svg className="icon-arrow-right" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M12.293 5.293a1 1 0 011.414 0l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-2.293-2.293a1 1 0 010-1.414z" clipRule="evenodd" />
                    </svg>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {!loadingDeals && dealsList.length === 0 && (
          <div className="empty-state">
            <p>No active deal rooms found for this project.</p>
          </div>
        )}
      </div>
    </Modal>
  );
};

// ===========================
// LANDING PAGE BOTTOM NAVIGATION
// ===========================

const LandingBottomNav = () => {
  const navigate = useNavigate();
  const location = useLocation();
  
  const isActive = (path) => location.pathname === path;
  
  return (
    <nav className="mobile-bottom-nav landing-bottom-nav">
      <Link 
        to="/" 
        className={`mobile-bottom-nav-item ${isActive('/') ? 'active' : ''}`}
      >
        <svg className="mobile-bottom-nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
          <polyline points="9 22 9 12 15 12 15 22" />
        </svg>
        <span className="mobile-bottom-nav-label">Home</span>
      </Link>
      
      <Link 
        to="/login" 
        className={`mobile-bottom-nav-item ${isActive('/login') ? 'active' : ''}`}
      >
        <svg className="mobile-bottom-nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
          <polyline points="10 17 15 12 10 7" />
          <line x1="15" y1="12" x2="3" y2="12" />
        </svg>
        <span className="mobile-bottom-nav-label">Sign In</span>
      </Link>
      
      <Link 
        to="/register" 
        className={`mobile-bottom-nav-item ${isActive('/register') ? 'active' : ''}`}
      >
        <svg className="mobile-bottom-nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
          <circle cx="8.5" cy="7" r="4" />
          <line x1="20" y1="8" x2="20" y2="14" />
          <line x1="23" y1="11" x2="17" y2="11" />
        </svg>
        <span className="mobile-bottom-nav-label">Sign Up</span>
      </Link>
      
      <button 
        className="mobile-bottom-nav-item"
        onClick={() => navigate('/register')}
      >
        <svg className="mobile-bottom-nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="3" y="11" width="18" height="10" rx="2" ry="2" />
          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
        </svg>
        <span className="mobile-bottom-nav-label">Get Started</span>
      </button>
    </nav>
  );
};

// ===========================
// NAVIGATION COMPONENT
// ===========================

const Navigation = () => {
  const api = useApi();
  const { user } = useApp();
  const { notifications, unreadCount, markAllAsRead, markAsRead, fetchNotifications } = useNotifications();
  const { signOut } = useClerk();
  const navigate = useNavigate();
  const location = useLocation();
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showMobileSlideMenu, setShowMobileSlideMenu] = useState(false);
  const profileRef = useRef(null);
  const notificationRef = useRef(null);

  // Get notification icon based on type
  const getNotificationIcon = (type) => {
    const icons = {
      'project_approved': '✓',
      'access_request': '🔔',
      'access_granted': '🔓',
      'deal_engagement': '🤝',
      'proposal_received': '📨',
      'proposal_response': '📬',
      'account_approved': '✅'
    };
    return (
      <span className="notification-icon" style={{ marginRight: '0.5rem' }}>
        {icons[type] || '📌'}
      </span>
    );
  };

  // Handle notification clicks
  const handleNotificationClick = (notification) => {
    // Mark notification as read locally and in backend
    if (!notification.read) {
      markAsRead(notification.id);
      api.put(`/notifications/${notification.id}/read`)
        .catch(err => console.error('Failed to mark notification as read:', err));
    }
    
    // Navigate based on notification type
    switch (notification.type) {
      case 'project_approved':
        navigate(`/projects/${notification.related_id}`);
        break;
      case 'access_request':
        navigate('/access-requests');
        break;
      case 'access_granted':
        navigate(`/projects/${notification.related_id}`);
        break;
      case 'deal_engagement':
        navigate(`/deals/${notification.related_id}`);
        break;
      case 'proposal_received':
        navigate(`/deals/${notification.related_id}`);
        break;
      case 'proposal_response':
        navigate(`/deals/${notification.related_id}`);
        break;
      case 'account_approved':
        navigate('/projects');
        break;
      default:
        console.log('Unknown notification type:', notification.type);
    }
    
    // Close notification dropdown
    setShowNotifications(false);
  };

  
   useEffect(() => {
    const handleClickOutside = (event) => {
      if (profileRef.current && !profileRef.current.contains(event.target)) {
        setShowProfileMenu(false);
      }
      if (notificationRef.current && !notificationRef.current.contains(event.target)) {
        setShowNotifications(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const handleLogout = async () => {
    await signOut();
    navigate('/');
  };

  if (!user) return null;

  const isActive = (path) => location.pathname === path;

  const navLinks = [
    { path: '/dashboard', label: 'Dashboard', roles: ['borrower', 'funder', 'admin'] },
    { path: '/projects', label: 'Projects', roles: ['funder'] },
    { path: '/my-projects', label: 'My Projects', roles: ['borrower'] },
    { path: '/messages', label: 'Messages', roles: ['borrower', 'funder', 'admin'] },
    { path: '/portfolio', label: 'Portfolio', roles: ['funder'] },
    { path: '/admin', label: 'Admin', roles: ['admin'] },
  ];

  const filteredLinks = navLinks.filter(link => link.roles.includes(user.role));

  return (
    <>
    <nav className="navbar">
      <div className="nav-container">
        <Link to="/dashboard" className="nav-logo">
          <span className="logo-text">Tranch</span>
        </Link>
        
        {/* Desktop Navigation */}
        <div className="nav-menu desktop-only">
          {filteredLinks.map(link => (
            <Link 
              key={link.path}
              to={link.path} 
              className={`nav-link ${isActive(link.path) ? 'active' : ''}`}
            >
              {link.label}
            </Link>
          ))}
        </div>


        
   {/* Mobile Menu Button - Add this check */}
<button 
  className="mobile-menu-btn"
  onClick={() => setShowMobileMenu(!showMobileMenu)}
>
  <span></span>
  <span></span>
  <span></span>
</button>
        
        {/* User Section */}
        <div className="nav-user-section">
          {/* Notifications */}
          <div className="notification-area" ref={notificationRef}>
            <button 
              className={`notification-bell ${unreadCount > 0 ? 'has-notifications' : ''}`}
              onClick={() => setShowNotifications(!showNotifications)}
            >
              <span className="bell-icon">
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
    <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    <circle cx="12" cy="3" r="1" fill="currentColor" />
  </svg>
</span>
              {unreadCount > 0 && (
                <span className="notification-count">{unreadCount}</span>
              )}
            </button>
            
            {showNotifications && (
              <div className="notification-dropdown">
                <div className="notification-header">
                  <h3>Notifications</h3>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button 
                      onClick={() => fetchNotifications()}
                      title="Refresh notifications"
                      style={{ 
                        fontSize: '1.25rem',
                        padding: '0.25rem',
                        background: 'rgba(255, 255, 255, 0.2)',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        color: 'white'
                      }}
                    >
                      ↻
                    </button>
                    <button 
                      onClick={() => {
                        markAllAsRead();
                        setShowNotifications(false);
                      }}
                      style={{
                        width: 'auto',
                        height: 'auto',
                        padding: '0.375rem 0.75rem',
                        fontSize: '0.875rem',
                        whiteSpace: 'nowrap'
                      }}
                    >
                      Mark all read
                    </button>
                  </div>
                </div>
                
                <div className="notification-list">
                  {notifications.length === 0 ? (
                    <div className="empty-notifications">
                      <p>No notifications</p>
                    </div>
                  ) : (
                    notifications.slice(0, 10).map(notification => (
                      <div 
                        key={notification.id}
                        className={`notification-item ${notification.read ? 'read' : 'unread'}`}
                        onClick={() => handleNotificationClick(notification)}
                        style={{ cursor: 'pointer' }}
                        data-type={notification.type}
                      >
                        <div className="notification-content">
                          <strong>
                            {getNotificationIcon(notification.type)}
                            {notification.title}
                          </strong>
                          <p>{notification.message}</p>
                          <span className="notification-time">
                            {formatTime(notification.timestamp)}
                          </span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
          
          {/* Profile Dropdown */}
          <div className="profile-dropdown-container" ref={profileRef}>
            <button 
              className="profile-dropdown-toggle"
              onClick={() => setShowProfileMenu(!showProfileMenu)}
            >
              <div className="user-avatar">
                {user.name?.charAt(0)?.toUpperCase() || 'U'}
              </div>
            </button>
            
            {showProfileMenu && (
              <div className="profile-dropdown-menu">
                <div className="dropdown-header">
                  <div className="dropdown-user-info">
                    <div className="dropdown-user-name">{user.name}</div>
                    <div className="dropdown-user-role">{user.role}</div>
                  </div>
                </div>
                
                <div className="dropdown-divider"></div>
                
                <Link 
                  to="/profile" 
                  className="dropdown-item"
                  onClick={() => setShowProfileMenu(false)}
                >
                  <span className="dropdown-icon"></span>
                  My Profile
                </Link>
                
                <Link 
                  to="/settings" 
                  className="dropdown-item"
                  onClick={() => setShowProfileMenu(false)}
                >
                  <span className="dropdown-icon"></span>
                  Settings
                </Link>
                
                <div className="dropdown-divider"></div>
                
                <button onClick={handleLogout} className="dropdown-item logout">
                  <span className="dropdown-icon"></span>
                  Logout
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </nav>
      
      {/* Mobile Menu */}
      {showMobileMenu && (
        <div className="mobile-menu">
          {filteredLinks.map(link => (
            <Link 
              key={link.path}
              to={link.path} 
              className={`mobile-menu-link ${isActive(link.path) ? 'active' : ''}`}
              onClick={() => setShowMobileMenu(false)}
            >
              {link.label}
            </Link>
          ))}
          <div className="mobile-menu-divider"></div>
          <Link 
            to="/profile" 
            className="mobile-menu-link"
            onClick={() => setShowMobileMenu(false)}
          >
            My Profile
          </Link>
          <Link 
            to="/settings" 
            className="mobile-menu-link"
            onClick={() => setShowMobileMenu(false)}
          >
            Settings
          </Link>
          <button onClick={handleLogout} className="mobile-menu-link logout">
            Logout
          </button>
        </div>
      )}

    {/* Mobile Bottom Navigation */}
    <nav className="mobile-bottom-nav">
      <Link 
        to="/dashboard" 
        className={`mobile-bottom-nav-item ${isActive('/dashboard') ? 'active' : ''}`}
      >
        <svg className="mobile-bottom-nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
          <polyline points="9 22 9 12 15 12 15 22" />
        </svg>
        <span className="mobile-bottom-nav-label">Home</span>
      </Link>
      
      {user.role === 'funder' && (
        <Link 
          to="/projects" 
          className={`mobile-bottom-nav-item ${isActive('/projects') ? 'active' : ''}`}
        >
          <svg className="mobile-bottom-nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
          </svg>
          <span className="mobile-bottom-nav-label">Projects</span>
        </Link>
      )}
      
      {user.role === 'borrower' && (
        <Link 
          to="/my-projects" 
          className={`mobile-bottom-nav-item ${isActive('/my-projects') ? 'active' : ''}`}
        >
          <svg className="mobile-bottom-nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
          </svg>
          <span className="mobile-bottom-nav-label">My Projects</span>
        </Link>
      )}
      
      <Link 
        to="/messages" 
        className={`mobile-bottom-nav-item ${isActive('/messages') ? 'active' : ''}`}
      >
        <svg className="mobile-bottom-nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
        <span className="mobile-bottom-nav-label">Messages</span>
      </Link>
      
      <button 
        className="mobile-bottom-nav-item"
        onClick={() => setShowMobileSlideMenu(true)}
      >
        <svg className="mobile-bottom-nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <line x1="3" y1="12" x2="21" y2="12" />
          <line x1="3" y1="6" x2="21" y2="6" />
          <line x1="3" y1="18" x2="21" y2="18" />
        </svg>
        <span className="mobile-bottom-nav-label">More</span>
      </button>
    </nav>

    {/* Mobile Slide Menu */}
    <div className={`mobile-menu-overlay ${showMobileSlideMenu ? 'open' : ''}`} 
         onClick={() => setShowMobileSlideMenu(false)} />
    
    <div className={`mobile-slide-menu ${showMobileSlideMenu ? 'open' : ''}`}>
      <div className="mobile-slide-menu-header">
        <div className="mobile-slide-menu-user">
          <div className="mobile-slide-menu-avatar">
            {user.name?.charAt(0)?.toUpperCase() || 'U'}
          </div>
          <div>
            <div className="mobile-slide-menu-name">{user.name}</div>
            <div className="mobile-slide-menu-role">{user.role}</div>
          </div>
        </div>
      </div>
      
      <nav className="mobile-slide-menu-nav">
        {filteredLinks.map(link => (
          <Link 
            key={link.path}
            to={link.path} 
            className={`mobile-slide-menu-link ${isActive(link.path) ? 'active' : ''}`}
            onClick={() => setShowMobileSlideMenu(false)}
          >
            {link.label}
          </Link>
        ))}
        
        <div className="mobile-slide-menu-divider" />
        
        <Link 
          to="/broker-ai" 
          className="mobile-slide-menu-link"
          onClick={() => setShowMobileSlideMenu(false)}
        >
          BrokerAI Assistant
        </Link>
        
        <Link 
          to="/profile" 
          className="mobile-slide-menu-link"
          onClick={() => setShowMobileSlideMenu(false)}
        >
          My Profile
        </Link>
        
        <Link 
          to="/settings" 
          className="mobile-slide-menu-link"
          onClick={() => setShowMobileSlideMenu(false)}
        >
          Settings
        </Link>
        
        <div className="mobile-slide-menu-divider" />
        
        <button 
          onClick={handleLogout} 
          className="mobile-slide-menu-link"
          style={{ width: '100%', textAlign: 'left', background: 'none', border: 'none' }}
        >
          Logout
        </button>
      </nav>
    </div>
    </>
  );
};

// ===========================
// BROKER AI FLOATING ASSISTANT
// ===========================

const BrokerAIFloating = () => {
  const api = useApi();
  const { user } = useApp();
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [sessionId, setSessionId] = useState(null);
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    if (isOpen && !sessionId) {
      createSession();
    }
  }, [isOpen]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const createSession = async () => {
    try {
      const response = await api.createAIChatSession(null, 'Quick Chat');
      setSessionId(response.session_id);
    } catch (err) {
      console.error('Failed to create chat session:', err);
    }
  };

  const handleSend = async () => {
    if (!input.trim() || !sessionId || loading) return;

    const userMessage = input.trim();
    setInput('');
    setLoading(true);

    // Add user message
    setMessages(prev => [...prev, {
      id: Date.now(),
      sender: 'user',
      message: userMessage
    }]);

    try {
      const response = await api.sendAIChatMessage(sessionId, userMessage);
      
      // Add AI response
      setMessages(prev => [...prev, {
        id: response.ai_message_id,
        sender: 'ai',
        message: response.ai_response
      }]);
    } catch (err) {
      console.error('Failed to send message:', err);
      setMessages(prev => [...prev, {
        id: Date.now(),
        sender: 'ai',
        message: 'I apologize, but I encountered an error. Please try again.'
      }]);
    } finally {
      setLoading(false);
    }
  };

  if (!user) return null;

  if (!isOpen) {
    return (
      <button 
        className="broker-ai-floating-button"
        onClick={() => setIsOpen(true)}
      >
        <span className="ai-icon">
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M12 2L2 7l10 5 10-5-10-5z" />
    <path d="M2 17l10 5 10-5M2 12l10 5 10-5" />
    <circle cx="12" cy="12" r="3" fill="currentColor" opacity="0.3" />
  </svg>
</span>
      </button>
    );
  }

  return (
    <div className={`broker-ai-floating ${isOpen ? 'open' : ''}`}>
      <div className="broker-ai-header">
        <h3>BrokerAI Assistant</h3>
        <div className="broker-ai-controls">
          <button onClick={() => setIsOpen(false)} title="Minimize">_</button>
        </div>
      </div>
      
      <div className="broker-ai-messages">
        {messages.length === 0 ? (
          <div className="ai-welcome">
            <p>Hi! I'm your property finance assistant. How can I help you today?</p>
          </div>
        ) : (
          messages.map(msg => (
            <div key={msg.id} className={`ai-message ${msg.sender}`}>
              <div className="ai-message-header">
                <span className="message-sender">
                  {msg.sender === 'user' ? 'You' : 'AI Assistant'}
                </span>
                <span className="message-time">
                  {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
              <div className="message-text">
                {msg.sender === 'ai' ? (
                  <ReactMarkdown>{msg.message}</ReactMarkdown>
                ) : (
                  <p>{msg.message}</p>
                )}
              </div>
            </div>
          ))
        )}
        {loading && (
          <div className="ai-message ai">
            <div className="typing-indicator">
              <span></span>
              <span></span>
              <span></span>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>
      
      <div className="broker-ai-input">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSend()}
          placeholder="Ask me anything..."
          disabled={loading}
        />
        <button onClick={handleSend} disabled={loading || !input.trim()}>
          Send
        </button>
      </div>
    </div>
  );
};

// ===========================
// PROTECTED ROUTE
// ===========================

const ProtectedRoute = ({ children, roles = [] }) => {
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

// ===========================
// AUTH PAGES
// ===========================

const ClerkAuthWrapper = ({ mode }) => {
  const navigate = useNavigate();
  const { signOut, isSignedIn, isLoaded } = useClerk();
  const [signingOut, setSigningOut] = useState(false);
  
  useEffect(() => {
    // If user is trying to sign up but is already signed in, sign them out first
    if (mode === 'sign-up' && isSignedIn && isLoaded && !signingOut) {
      setSigningOut(true);
      signOut().then(() => {
        setSigningOut(false);
      });
    }
  }, [mode, isSignedIn, isLoaded, signOut, signingOut]);
  
  if (signingOut) {
    return (
      <div className="auth-container">
        <div className="auth-card">
          <div className="auth-header">
            <h1 className="auth-title">Signing out...</h1>
          </div>
        </div>
      </div>
    );
  }
  
  return (
    <div className="auth-container">
      <div className="auth-card">
        <div className="auth-header">
          <h1 className="auth-title">Welcome to Tranch</h1>
          <p className="auth-subtitle">
            {mode === 'sign-in' 
              ? 'Connect property developers with private credit'
              : 'Join Australia\'s premier property finance platform'
            }
          </p>
        </div>

        <div className="clerk-container">
          {mode === 'sign-in' ? (
            <SignIn 
              appearance={{
                elements: {
                  rootBox: "clerk-root",
                  card: "clerk-card",
                  formButtonPrimary: "cl-formButtonPrimary"
                },
                layout: {
                  socialButtonsPlacement: "bottom",
                  socialButtonsVariant: "iconButton"
                }
              }}
              afterSignInUrl="/dashboard"
            />
          ) : (
            <SignUp 
              appearance={{
                elements: {
                  rootBox: "clerk-root",
                  card: "clerk-card",
                  formButtonPrimary: "cl-formButtonPrimary"
                },
                layout: {
                  socialButtonsPlacement: "bottom",
                  socialButtonsVariant: "iconButton"
                }
              }}
              afterSignUpUrl="/onboarding"
            />
          )}
        </div>
        
        <div className="auth-footer">
          <p>
            By continuing, you agree to our{' '}
            <Link to="/terms" className="auth-link">Terms of Service</Link>
            {' '}and{' '}
            <Link to="/privacy" className="auth-link">Privacy Policy</Link>
          </p>
        </div>
      </div>
    </div>
  );
};

// ===========================
// ONBOARDING
// ===========================

const Onboarding = () => {
  const { user: clerkUser } = useUser();
  const { refreshUser } = useApp();
  const navigate = useNavigate();
  const api = useApi();
  const [step, setStep] = useState('role');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [formData, setFormData] = useState({
    role: '',
    // Funder profile fields
    company_name: '',
    company_type: '',
    investment_focus: '',
    typical_deal_size_min: '',
    typical_deal_size_max: '',
    years_experience: '',
    aum: '',
    phone: '',
    linkedin: '',
    bio: '',
    abn: ''
  });

  const handleRoleSelection = async (role) => {
    setLoading(true);
    setError('');
    
    try {
      await api.setUserRole(role);
      
      // All users complete profile - no bypass for borrowers
      setFormData({ ...formData, role });
      setStep('profile');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const validateProfile = () => {
    const errors = [];
    
    // Common fields for both roles
    if (!formData.company_name) errors.push('Company name is required');
    if (!formData.phone) errors.push('Phone number is required');
    if (!formData.abn) errors.push('ABN is required');
    
    if (!validatePhone(formData.phone)) errors.push('Invalid phone number format');
    if (!validateABN(formData.abn)) errors.push('Invalid ABN format');
    
    // Role-specific validation
    if (formData.role === 'funder') {
      if (!formData.company_type) errors.push('Company type is required');
      if (!formData.investment_focus) errors.push('Investment focus is required');
      if (!formData.typical_deal_size_min) errors.push('Minimum deal size is required');
      if (!formData.typical_deal_size_max) errors.push('Maximum deal size is required');
      if (!formData.years_experience) errors.push('Years of experience is required');
      
      if (parseInt(formData.typical_deal_size_min) >= parseInt(formData.typical_deal_size_max)) {
        errors.push('Maximum deal size must be greater than minimum');
      }
    } else if (formData.role === 'borrower') {
      // Add borrower-specific validation if needed
      if (!formData.company_type) errors.push('Company type is required');
    }
    
    return errors;
  };

  const handleProfileSubmit = async (e) => {
    e.preventDefault();
    
    const errors = validateProfile();
    if (errors.length > 0) {
      setError(errors.join(', '));
      return;
    }
    
    setLoading(true);
    setError('');

    try {
      const profileData = {
        ...formData,
        aum: formData.aum ? parseInt(formData.aum) : null
      };
      
      // Only include funder-specific fields if user is a funder
      if (formData.role === 'funder') {
        profileData.typical_deal_size_min = parseInt(formData.typical_deal_size_min);
        profileData.typical_deal_size_max = parseInt(formData.typical_deal_size_max);
        profileData.years_experience = parseInt(formData.years_experience);
      }
      
      await api.completeProfile(profileData);
      await refreshUser();
      setStep('complete');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (step === 'role') {
    return (
      <div className="onboarding-container">
        <div className="onboarding-card">
          <h1>Welcome to Tranch</h1>
          <p>Let's get you set up. Are you a property developer or an investor?</p>
          
          {error && <ErrorMessage message={error} onClose={() => setError('')} />}
          
          <div className="role-selection">
            <button 
              className="role-card"
              onClick={() => handleRoleSelection('borrower')}
              disabled={loading}
            >
              <div className="role-icon"></div>
              <h3>I'm a Developer</h3>
              <p>I need funding for property development projects</p>
            </button>
            
            <button 
              className="role-card"
              onClick={() => handleRoleSelection('funder')}
              disabled={loading}
            >
              <div className="role-icon"></div>
              <h3>I'm an Investor</h3>
              <p>I want to invest in property development projects</p>
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (step === 'profile') {
    return (
      <div className="onboarding-container">
        <div className="onboarding-card wide">
          <h1>Complete Your Investor Profile</h1>
          <p>This information helps developers understand your investment criteria</p>
          
          {error && <ErrorMessage message={error} onClose={() => setError('')} />}
          
          <form onSubmit={handleProfileSubmit} className="onboarding-form">
            <div className="form-section">
              <h3>Company Information</h3>
              
              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="company_name">
                    Company Name *
                    <Tooltip content="Your registered business name">
                      <span className="help-icon">?</span>
                    </Tooltip>
                  </label>
                  <input
                    type="text"
                    id="company_name"
                    value={formData.company_name}
                    onChange={(e) => setFormData({ ...formData, company_name: e.target.value })}
                    required
                    className="form-input"
                    placeholder="ABC Capital Partners"
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="abn">
                    ABN *
                    <Tooltip content="11-digit Australian Business Number">
                      <span className="help-icon">?</span>
                    </Tooltip>
                  </label>
                  <input
                    type="text"
                    id="abn"
                    value={formData.abn}
                    onChange={(e) => setFormData({ ...formData, abn: e.target.value })}
                    required
                    className="form-input"
                    placeholder="12 345 678 901"
                    maxLength="14"
                  />
                </div>
              </div>

              <div className="form-group">
                <label htmlFor="company_type">
                  Company Type *
                  <Tooltip content="Select the category that best describes your organization">
                    <span className="help-icon">?</span>
                  </Tooltip>
                </label>
                <select
                  id="company_type"
                  value={formData.company_type}
                  onChange={(e) => setFormData({ ...formData, company_type: e.target.value })}
                  className="form-select"
                  required
                >
                  <option value="">Select company type</option>
                  {formData.role === 'funder' ? (
                    <>
                      <option value="Private Credit Fund">Private Credit Fund</option>
                      <option value="Investment Bank">Investment Bank</option>
                      <option value="Family Office">Family Office</option>
                      <option value="Hedge Fund">Hedge Fund</option>
                      <option value="Real Estate Fund">Real Estate Fund</option>
                      <option value="High Net Worth Individual">High Net Worth Individual</option>
                      <option value="Other">Other</option>
                    </>
                  ) : (
                    <>
                      <option value="Developer">Property Developer</option>
                      <option value="Builder">Builder</option>
                      <option value="Investor">Property Investor</option>
                      <option value="Real Estate Agency">Real Estate Agency</option>
                      <option value="Construction Company">Construction Company</option>
                      <option value="Other">Other</option>
                    </>
                  )}
                </select>
              </div>

              {formData.role === 'funder' && (
                <div className="form-group">
                  <label htmlFor="years_experience">
                    Years Experience *
                    <Tooltip content="Years of experience in property investment">
                      <span className="help-icon">?</span>
                    </Tooltip>
                  </label>
                  <NumberInput
                    id="years_experience"
                    value={formData.years_experience}
                    onChange={(value) => setFormData({ ...formData, years_experience: value })}
                    placeholder="10"
                    min={0}
                    max={100}
                  />
                </div>
              )}
            </div>

            {formData.role === 'funder' && (
              <div className="form-section">
                <h3>Investment Profile</h3>
                
                <div className="form-group">
                  <label htmlFor="investment_focus">
                    Investment Focus *
                    <Tooltip content="Primary property types you invest in">
                      <span className="help-icon">?</span>
                    </Tooltip>
                  </label>
                  <select
                    id="investment_focus"
                    value={formData.investment_focus}
                    onChange={(e) => setFormData({ ...formData, investment_focus: e.target.value })}
                    className="form-select"
                    required
                  >
                    <option value="">Select investment focus</option>
                    <option value="Residential Development">Residential Development</option>
                    <option value="Commercial Development">Commercial Development</option>
                    <option value="Mixed-Use Development">Mixed-Use Development</option>
                    <option value="Industrial Development">Industrial Development</option>
                    <option value="All Property Types">All Property Types</option>
                  </select>
                </div>

              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="typical_deal_size_min">
                    Min Deal Size (AUD) *
                    <Tooltip content="Minimum investment amount per deal">
                      <span className="help-icon">?</span>
                    </Tooltip>
                  </label>
                  <NumberInput
                    id="typical_deal_size_min"
                    value={formData.typical_deal_size_min}
                    onChange={(value) => setFormData({ ...formData, typical_deal_size_min: value })}
                    placeholder="1,000,000"
                    prefix="$"
                    min={1}
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="typical_deal_size_max">
                    Max Deal Size (AUD) *
                    <Tooltip content="Maximum investment amount per deal">
                      <span className="help-icon">?</span>
                    </Tooltip>
                  </label>
                  <NumberInput
                    id="typical_deal_size_max"
                    value={formData.typical_deal_size_max}
                    onChange={(value) => setFormData({ ...formData, typical_deal_size_max: value })}
                    placeholder="50,000,000"
                    prefix="$"
                    min={1}
                  />
                </div>
              </div>

              <div className="form-group">
                <label htmlFor="aum">
                  Assets Under Management (AUD)
                  <Tooltip content="Total assets your organization manages (optional)">
                    <span className="help-icon">?</span>
                  </Tooltip>
                </label>
                <NumberInput
                  id="aum"
                  value={formData.aum}
                  onChange={(value) => setFormData({ ...formData, aum: value })}
                  placeholder="100,000,000"
                  prefix="$"
                  min={0}
                />
              </div>
              </div>
            )}

            <div className="form-section">
              <h3>Contact Information</h3>
              
              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="phone">
                    Phone Number *
                    <Tooltip content="Australian mobile or landline">
                      <span className="help-icon">?</span>
                    </Tooltip>
                  </label>
                  <input
                    type="tel"
                    id="phone"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    required
                    className="form-input"
                    placeholder="+61 400 000 000"
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="linkedin">
                    LinkedIn Profile
                    <Tooltip content="Your professional LinkedIn URL (optional)">
                      <span className="help-icon">?</span>
                    </Tooltip>
                  </label>
                  <input
                    type="url"
                    id="linkedin"
                    value={formData.linkedin}
                    onChange={(e) => setFormData({ ...formData, linkedin: e.target.value })}
                    className="form-input"
                    placeholder="https://linkedin.com/in/yourprofile"
                  />
                </div>
              </div>

              <div className="form-group">
                <label htmlFor="bio">
                  Professional Bio
                  <Tooltip content="Brief description of your investment philosophy and experience">
                    <span className="help-icon">?</span>
                  </Tooltip>
                </label>
                <textarea
                  id="bio"
                  value={formData.bio}
                  onChange={(e) => setFormData({ ...formData, bio: e.target.value })}
                  className="form-textarea"
                  placeholder="Brief professional background and investment philosophy..."
                  rows="4"
                  maxLength="500"
                />
                <div className="character-count">{formData.bio.length}/500</div>
              </div>
            </div>

            <button type="submit" disabled={loading} className="btn btn-primary btn-block">
              {loading ? 'Submitting...' : 'Complete Profile'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  if (step === 'complete') {
    return (
      <div className="onboarding-container">
        <div className="onboarding-card">
          <div className="success-icon">✓</div>
          <h1>Profile Submitted!</h1>
          <p>Your profile is under review. We'll notify you once approved (usually within 24 hours).</p>
          <button onClick={() => navigate('/dashboard')} className="btn btn-primary">
            Go to Dashboard
          </button>
        </div>
      </div>
    );
  }
};

// ===========================
// DASHBOARD
// ===========================

const Dashboard = () => {
  const api = useApi();
  const { user, refreshUser } = useApp();
  const { addNotification } = useNotifications();
  const navigate = useNavigate();
  const [projects, setProjects] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showSubscriptionModal, setShowSubscriptionModal] = useState(false);
  const [activeFilter, setActiveFilter] = useState('all');

  useEffect(() => {
    fetchData();
  }, [user?.role]);

  const fetchData = async () => {
    try {
      const projectData = await api.getProjects();
      setProjects(projectData);
      
      if (user?.role === 'admin') {
        const statsData = await api.getAdminStats();
        setStats(statsData);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleProjectUpdate = async () => {
    await fetchData();
  };

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
  };

  const calculateBorrowerStats = () => {
    const liveProjects = projects.filter(p => p.payment_status === 'paid');
    const draftProjects = projects.filter(p => p.payment_status === 'unpaid');
    const totalFunding = liveProjects.reduce((sum, p) => sum + (p.loan_amount || 0), 0);
    
    return {
      activeProjects: liveProjects.length,
      totalFunding: totalFunding,
      drafts: draftProjects.length
    };
  };

  const getFilteredProjects = () => {
    if (activeFilter === 'live') {
      return projects.filter(p => p.payment_status === 'paid');
    } else if (activeFilter === 'drafts') {
      return projects.filter(p => p.payment_status === 'unpaid');
    }
    return projects;
  };

  if (loading) return <LoadingSpinner />;

  const borrowerStats = user.role === 'borrower' ? calculateBorrowerStats() : null;
  const filteredProjects = getFilteredProjects();

  return (
    <div className="dashboard-clean">
      {/* Header */}
      <div className="dashboard-header-clean">
        <div className="header-content-clean">
          <h1 className="greeting">{getGreeting()},</h1>
          <h1 className="username">{user.name || user.email}</h1>
          <p className="tagline">
            {user.role === 'borrower' && "Let's get your developments funded."}
            {user.role === 'funder' && "Discover investment opportunities."}
            {user.role === 'admin' && "Platform administration."}
          </p>
        </div>
        {user.role === 'borrower' && (
          <Link to="/create-project" className="new-project-button">
            New Project
            <svg viewBox="0 0 20 20" fill="currentColor" className="arrow-icon">
              <path fillRule="evenodd" d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </Link>
        )}
      </div>

      {error && <ErrorMessage message={error} onClose={() => setError('')} />}

      {/* Borrower Dashboard */}
      {user.role === 'borrower' && borrowerStats && (
        <>
          {/* Stats Cards */}
          <div className="stats-grid-clean">
            <div className="stat-card-clean">
              <div className="stat-header-clean">
                <span className="stat-label">ACTIVE PROJECTS</span>
                <div className="stat-indicator green"></div>
              </div>
              <div className="stat-value">{borrowerStats.activeProjects}</div>
              <a 
                href="#" 
                onClick={(e) => { 
                  e.preventDefault(); 
                  setActiveFilter('live'); 
                }} 
                className="stat-link"
              >
                Live on platform
              </a>
            </div>

            <div className="stat-card-clean featured">
              <div className="stat-header-clean">
                <span className="stat-label">TOTAL FUNDING SOUGHT</span>
                <span className="dollar-sign">$</span>
              </div>
              <div className="stat-value">
                {formatNumber(borrowerStats.totalFunding)}
              </div>
              <div className="stat-subtitle">Across {borrowerStats.activeProjects} projects</div>
            </div>

            <div className="stat-card-clean">
              <div className="stat-header-clean">
                <span className="stat-label">DRAFTS</span>
                <div className="stat-badge">{borrowerStats.drafts}</div>
              </div>
              <div className="stat-value">{borrowerStats.drafts}</div>
              <a 
                href="#" 
                onClick={(e) => { 
                  e.preventDefault(); 
                  setActiveFilter('drafts'); 
                }} 
                className="stat-link"
              >
                Complete drafts
              </a>
            </div>
          </div>

          {/* Portfolio Section */}
          <div className="portfolio-section-clean">
            <div className="portfolio-header-clean">
              <h2>Your Portfolio</h2>
              <div className="filter-pills">
                <button 
                  className={`filter-pill ${activeFilter === 'all' ? 'active' : ''}`}
                  onClick={() => setActiveFilter('all')}
                >
                  All
                </button>
                <button 
                  className={`filter-pill ${activeFilter === 'live' ? 'active' : ''}`}
                  onClick={() => setActiveFilter('live')}
                >
                  Live
                </button>
                <button 
                  className={`filter-pill ${activeFilter === 'drafts' ? 'active' : ''}`}
                  onClick={() => setActiveFilter('drafts')}
                >
                  Drafts
                </button>
              </div>
            </div>

            {filteredProjects.length === 0 ? (
              <EmptyState 
                icon=""
                title={activeFilter === 'drafts' ? 'No draft projects' : 'No projects yet'}
                message={
                  activeFilter === 'drafts' 
                    ? 'All your projects are published.'
                    : 'Create your first project to get started.'
                }
                action={
                  activeFilter !== 'drafts' && (
                    <Link to="/create-project" className="btn btn-primary">
                      Create Project
                    </Link>
                  )
                }
              />
            ) : (
              <div className="projects-grid-clean">
                {filteredProjects.map((project) => (
                  <ProjectCardClean 
                    key={project.id} 
                    project={project}
                    onProjectUpdate={handleProjectUpdate}
                  />
                ))}
              </div>
            )}
          </div>
        </>
      )}

 {/* Funder Dashboard */}
{user.role === 'funder' && (
  <>
    {!user.approved && (
      <div className="warning-message">
        <h3>Account Pending Approval</h3>
        <p>Your account is currently under review. You'll be able to access projects once approved by our team.</p>
      </div>
    )}

    {user.approved && user.subscription_status === 'pending' && (
      <div className="subscription-banner pending">
        <div className="banner-content">
          <h3>Subscription Payment Processing</h3>
          <p>Your subscription payment is being processed. This usually takes just a few moments.</p>
        </div>
        <button 
          disabled
          className="btn btn-primary disabled"
        >
          <span className="spinner-small"></span>
          Processing Payment...
        </button>
      </div>
    )}

    {user.approved && user.subscription_status !== 'active' && user.subscription_status !== 'pending' && (
      <div className="subscription-banner">
        <div className="banner-content">
          <h3>Activate Your Subscription</h3>
          <p>Subscribe to unlock full access to all projects and features</p>
        </div>
        <button 
          onClick={() => setShowSubscriptionModal(true)}
          className="btn btn-primary"
        >
          Subscribe Now - $299/month
        </button>
      </div>
    )}

    {user.approved && user.subscription_status === 'active' && (
      <>
        {/* Quick Stats */}
        <div className="stats-grid-clean">
          <div className="stat-card-clean">
            <div className="stat-header-clean">
              <span className="stat-label">ACTIVE DEALS</span>
              <div className="stat-indicator green"></div>
            </div>
            <div className="stat-value">
              {projects.filter(p => p.deal_id).length}
            </div>
            <Link to="/portfolio" className="stat-link">
              View Portfolio
            </Link>
          </div>

          <div className="stat-card-clean featured">
            <div className="stat-header-clean">
              <span className="stat-label">IN DUE DILIGENCE</span>
              <span className="dollar-sign">📊</span>
            </div>
            <div className="stat-value">
              {projects.filter(p => p.access_status === 'approved' && !p.deal_id).length}
            </div>
            <div className="stat-subtitle">Projects under review</div>
          </div>

          <div className="stat-card-clean">
            <div className="stat-header-clean">
              <span className="stat-label">PENDING REQUESTS</span>
              <div className="stat-badge">{projects.filter(p => p.access_status === 'pending').length}</div>
            </div>
            <div className="stat-value">
              {projects.filter(p => p.access_status === 'pending').length}
            </div>
            <Link to="/messages" className="stat-link">
              View Messages
            </Link>
          </div>
        </div>

        {/* Active Deals Section */}
        <div className="portfolio-section-clean">
          <div className="portfolio-header-clean">
            <h2>Your Active Deals</h2>
            <div className="filter-pills">
              <span className="filter-pill active">All</span>
            </div>
          </div>

          {projects.filter(p => p.access_status === 'approved' || p.deal_id).length === 0 ? (
            <EmptyState 
              icon="📂"
              title="No active deals yet"
              message="Browse the marketplace to find investment opportunities"
              action={
                <Link to="/projects" className="btn btn-primary">
                  Browse Marketplace
                </Link>
              }
            />
          ) : (
            <div className="projects-grid-clean">
              {projects.filter(p => p.access_status === 'approved' || p.deal_id).map((project) => (
                <FunderProjectCard 
                  key={project.id} 
                  project={project}
                  onProjectUpdate={handleProjectUpdate}
                />
              ))}
            </div>
          )}
        </div>

        {/* Recommended Projects Section */}
<div className="portfolio-section-clean">
  <div className="portfolio-header-clean">
    <h2>Recommended for You</h2>
    <Link to="/projects" className="btn btn-outline">
      View All in Marketplace →
    </Link>
  </div>

  {projects.filter(p => p.payment_status === 'paid' && !p.access_status && !p.deal_id).length === 0 ? (
    <EmptyState 
      icon="🔍"
      title="No recommendations available"
      message="Check the marketplace for new opportunities"
    />
  ) : (
    <div className="projects-grid-clean">
      {projects.filter(p => p.payment_status === 'paid' && !p.access_status && !p.deal_id)
        .slice(0, 3)
        .map((project) => (
          <FunderProjectCard 
            key={project.id} 
            project={project}
            onProjectUpdate={handleProjectUpdate}
          />
      ))}
    </div>
  )}
</div>
      </>
    )}
  </>
)}

      {/* Admin Dashboard */}
      {user.role === 'admin' && stats && (
        <div className="admin-stats">
          <div className="stat-card">
            <div className="stat-icon">👥</div>
            <div className="stat-content">
              <div className="stat-value">{formatNumber(stats.total_users)}</div>
              <div className="stat-label">Total Users</div>
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-icon">📁</div>
            <div className="stat-content">
              <div className="stat-value">{formatNumber(stats.total_projects)}</div>
              <div className="stat-label">Total Projects</div>
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-icon">✓</div>
            <div className="stat-content">
              <div className="stat-value">{formatNumber(stats.active_projects)}</div>
              <div className="stat-label">Active Projects</div>
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-icon">

            </div>
            <div className="stat-content">
              <div className="stat-value">{formatCurrency(stats.total_revenue || 0)}</div>
              <div className="stat-label">Total Revenue</div>
            </div>
          </div>
        </div>
      )}

      <SubscriptionModal 
        isOpen={showSubscriptionModal}
        onClose={() => setShowSubscriptionModal(false)}
        onSuccess={async () => {
          setShowSubscriptionModal(false);
          await refreshUser();
          await fetchData();
          addNotification({
            type: 'success',
            title: 'Subscription Active',
            message: 'Your subscription is now active. You have full access to all projects.'
          });
        }}
      />
    </div>
  );
};

// Clean Project Card Component
const ProjectCardClean = ({ project, onProjectUpdate }) => {
  const api = useApi();
  const navigate = useNavigate();
  const { addNotification } = useNotifications();
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showDealSelector, setShowDealSelector] = useState(false);
  const [deals, setDeals] = useState([]);

  useEffect(() => {
    if (project.deal_count > 0 && project.payment_status === 'paid') {
      fetchDeals();
    }
  }, [project.id, project.deal_count]);

  const fetchDeals = async () => {
    try {
      const dealsList = await api.getProjectDeals(project.id);
      setDeals(dealsList);
    } catch (err) {
      console.error('Failed to fetch deals:', err);
    }
  };

  return (
    <>
      <div className="project-card-clean">
        {/* Status Badge */}
        <div className="card-header-clean">
          <span className={`status-badge-clean ${project.payment_status === 'paid' ? 'live' : project.payment_status === 'payment_pending' ? 'pending' : 'draft'}`}>
            {project.payment_status === 'paid' ? 'LIVE' : project.payment_status === 'payment_pending' ? 'UNDER REVIEW' : 'DRAFT'}
          </span>
          {project.deal_count > 0 && (
            <span className="deal-count">{project.deal_count} active deal{project.deal_count > 1 ? 's' : ''}</span>
          )}
        </div>

        {/* Project Info */}
        <h3 className="project-title-clean">{project.title}</h3>
        
        <div className="location-row-clean">
          <svg viewBox="0 0 16 16" fill="none" className="location-icon-clean">
            <path d="M8 8.5a1.5 1.5 0 100-3 1.5 1.5 0 000 3z" fill="currentColor"/>
            <path fillRule="evenodd" clipRule="evenodd" d="M8 14s4-4.15 4-7a4 4 0 10-8 0c0 2.85 4 7 4 7z" fill="currentColor"/>
          </svg>
          <span>{project.suburb || 'Location TBD'}</span>
        </div>

        <div className="project-info-grid">
          <div className="info-block">
            <span className="info-label">SEEKING</span>
            <span className="info-value">{formatCurrency(project.loan_amount)}</span>
          </div>
          <div className="info-block">
            <span className="info-label">TYPE</span>
            <span className="info-value">{project.property_type}</span>
          </div>
        </div>

      
        {/* Actions */}
        <div className="card-actions-clean">
          {project.payment_status === 'paid' ? (
            <>
              <button 
                onClick={() => navigate(`/project/${project.id}`)}
                className="btn-text-clean"
              >
                View Details
              </button>
              {project.deal_count > 0 && (
                <button 
                  onClick={() => {
                    if (project.deal_count === 1 && deals.length > 0) {
                      navigate(`/project/${project.id}/deal/${deals[0].id}`);
                    } else if (project.deal_count > 1) {
                      setShowDealSelector(true);
                    }
                  }}
                  className="btn-primary-clean"
                >
                  Deal Room{project.deal_count > 1 ? 's' : ''}
                </button>
              )}
            </>
          ) : project.payment_status === 'payment_pending' ? (
            <>
              <button 
                onClick={() => navigate(`/project/${project.id}`)}
                className="btn-text-clean"
              >
                View Details
              </button>
              <button 
                disabled
                className="btn-outline-clean disabled"
              >
                Under Admin Review
              </button>
            </>
          ) : (
            <>
              <button 
                onClick={() => navigate(`/project/${project.id}`)}
                className="btn-text-clean"
              >
                View Details
              </button>
              <button 
                onClick={() => setShowPaymentModal(true)}
                className="btn-outline-clean"
                disabled={!project.documents_complete}
                title={!project.documents_complete ? 'Upload all required documents first' : ''}
              >
                Publish ($499)
              </button>
            </>
          )}
        </div>
      </div>

      {showPaymentModal && (
        <PaymentModal 
          isOpen={showPaymentModal}
          onClose={() => setShowPaymentModal(false)}
          project={project}
          onSuccess={() => {
            setShowPaymentModal(false);
            if (onProjectUpdate) onProjectUpdate();
          }}
        />
      )}
      
      {showDealSelector && (
        <DealRoomSelector
          isOpen={showDealSelector}
          onClose={() => setShowDealSelector(false)}
          project={project}
          deals={deals}
        />
      )}
    </>
  );
};

// Borrower Project Card Component
const BorrowerProjectCard = ({ project, onProjectUpdate }) => {
  const api = useApi();
  const navigate = useNavigate();
  const { addNotification } = useNotifications();
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showDealSelector, setShowDealSelector] = useState(false);
  const [deals, setDeals] = useState([]);
  const [showDeals, setShowDeals] = useState(false);
  const [loadingDeals, setLoadingDeals] = useState(false);

  useEffect(() => {
    if (project.deal_count > 0 && project.payment_status === 'paid') {
      fetchDeals();
    }
  }, [project.id, project.deal_count]);

  const fetchDeals = async () => {
    setLoadingDeals(true);
    try {
      const dealsList = await api.getProjectDeals(project.id);
      setDeals(dealsList);
    } catch (err) {
      console.error('Failed to fetch deals:', err);
    } finally {
      setLoadingDeals(false);
    }
  };

  const getStatusBadge = () => {
    if (project.payment_status === 'paid' && project.visible) {
      return <span className="status-badge-v2 live">LIVE</span>;
    } else if (project.payment_status === 'payment_pending') {
      return <span className="status-badge-v2 pending">UNDER REVIEW</span>;
    } else if (project.payment_status === 'paid' && !project.visible) {
      return <span className="status-badge-v2 rejected">REJECTED</span>;
    }
    return <span className="status-badge-v2 draft">DRAFT</span>;
  };

  const getPropertyTypeIcon = () => {
    switch (project.property_type) {
      case 'Commercial':
        return '';
      case 'Residential':
        return '';
      case 'Mixed Use':
        return '';
      case 'Industrial':
        return '';
      default:
        return '';
    }
  };

  return (
    <>
      <div className="project-card-v2">
        <div className="card-header">
          {getStatusBadge()}
          {project.deal_count > 0 && (
            <span className="deal-indicator">{project.deal_count} active deal{project.deal_count > 1 ? 's' : ''}</span>
          )}
        </div>

        <div className="card-body">
          <h3 className="project-name">{project.title}</h3>
          
          <div className="location-row">
            <svg className="location-icon" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
            </svg>
            <span>{project.suburb || 'Location not specified'}</span>
          </div>

          <div className="project-details">
            <div className="detail-row">
              <span className="detail-label">SEEKING</span>
              <span className="detail-value">{formatCurrency(project.loan_amount)}</span>
            </div>
            <div className="detail-row">
              <span className="detail-label">TYPE</span>
              <span className="detail-value">
                <span className="type-icon">{getPropertyTypeIcon()}</span>
                {project.property_type}
              </span>
            </div>
          </div>

          {project.last_rejection_reason && (project.payment_status === 'unpaid' || (project.payment_status === 'paid' && !project.visible)) && (
            <div className="rejection-notice">
              <div className="rejection-header">
                <svg className="rejection-icon" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
                <span className="rejection-label">Admin Feedback</span>
              </div>
              <div className="rejection-reason">
                {project.last_rejection_reason}
              </div>
              {project.rejection_date && (
                <div className="rejection-date">
                  Received: {new Date(project.rejection_date).toLocaleDateString()}
                </div>
              )}
              {project.payment_status === 'paid' && (
                <div className="rejection-note">
                  Note: You have already paid for this project. Please address the feedback and submit for re-review.
                </div>
              )}
            </div>
          )}
        </div>

        <div className="card-footer">
          {project.payment_status === 'paid' && project.visible ? (
            <>
              <button 
                onClick={() => navigate(`/project/${project.id}`)}
                className="btn btn-outline"
              >
                View Details
              </button>
              {project.deal_count > 0 && (
                <button 
                  onClick={() => {
                    if (project.deal_count === 1 && deals.length > 0) {
                      navigate(`/project/${project.id}/deal/${deals[0].id}`);
                    } else if (project.deal_count > 1) {
                      setShowDealSelector(true);
                    }
                  }}
                  className="btn-primary-small"
                >
                  Deal Room{project.deal_count > 1 ? 's' : ''}
                </button>
              )}
            </>
          ) : project.payment_status === 'payment_pending' ? (
            <>
              <button 
                onClick={() => navigate(`/project/${project.id}`)}
                className="btn btn-outline"
              >
                View Details
              </button>
              <button 
                disabled
                className="btn-primary-small disabled"
              >
                Under Admin Review
              </button>
            </>
          ) : project.payment_status === 'paid' && !project.visible && project.submission_status === 'rejected' ? (
              <>
                <button 
                  onClick={() => navigate(`/project/${project.id}/edit`)}
                  className="btn btn-outline"
                >
                  Edit Project
                </button>
                <button 
                  onClick={async () => {
                    try {
                      await api.resubmitProject(project.id);
                      
                      addNotification({
                        type: 'success',
                        title: 'Resubmitted for Review',
                        message: 'Your project has been resubmitted and will be reviewed by our team.'
                      });
                      
                      if (onProjectUpdate) onProjectUpdate();
                    } catch (err) {
                      addNotification({
                        type: 'error',
                        title: 'Resubmission Failed',
                        message: err.message || 'Failed to resubmit project'
                      });
                    }
                  }}
                  className="btn btn-primary-small"
                >
                  Submit for Re-review
                </button>
              </>
          ) : project.payment_status === 'paid' && project.submission_status === 'pending_review' ? (
            <>
              <button 
                onClick={() => navigate(`/project/${project.id}`)}
                className="btn btn-outline"
              >
                View Details
              </button>
              <button 
                disabled
                className="btn-primary-small disabled"
              >
                Under Admin Review
              </button>
            </>
          ) : (
            <>
              <button 
                onClick={() => navigate(`/project/${project.id}`)}
                className="btn btn-outline"
              >
                View Details
              </button>
              <button 
                onClick={() => setShowPaymentModal(true)}
                className="btn-primary-small"
                disabled={!project.documents_complete}
                title={!project.documents_complete ? 'Upload all required documents first' : ''}
              >
                Publish
              </button>
            </>
          )}
        </div>
      </div>
          
      {showPaymentModal && (
        <PaymentModal 
          isOpen={showPaymentModal}
          onClose={() => setShowPaymentModal(false)}
          project={project}
          onSuccess={() => {
            setShowPaymentModal(false);
            if (onProjectUpdate) onProjectUpdate();
          }}
        />
      )}
      
      {showDealSelector && (
        <DealRoomSelector
          isOpen={showDealSelector}
          onClose={() => setShowDealSelector(false)}
          project={project}
          deals={deals}
        />
      )}
    </>
    );
};

// Funder Project Card Component

const FunderProjectCard = ({ project, onProjectUpdate }) => {
  const api = useApi();
  const navigate = useNavigate();
  const { addNotification } = useNotifications();
  const [showPreview, setShowPreview] = useState(false);
  const [showAccessForm, setShowAccessForm] = useState(false);
  const [accessMessage, setAccessMessage] = useState('');
  const [requesting, setRequesting] = useState(false);

  const handleRequestAccess = async () => {
    setRequesting(true);
    try {
      await api.requestAccess(project.id, accessMessage.trim() || null);
      
      await api.sendEmailNotification('access_request_received', project.borrower_id, {
        project_title: project.title,
        funder_name: 'A verified funder'
      });
      
      addNotification({
        type: 'success',
        title: 'Access Request Sent',
        message: 'Your request has been sent to the developer.'
      });
      
      setShowAccessForm(false);
      setAccessMessage('');
      if (onProjectUpdate) onProjectUpdate();
    } catch (err) {
      addNotification({
        type: 'error',
        title: 'Request Failed',
        message: err.message || 'Failed to send access request'
      });
    } finally {
      setRequesting(false);
    }
  };

  const handleEngage = async () => {
    try {
      const response = await api.createDeal(project.id, project.access_request_id);
      
      // Navigate immediately to the deal room
      navigate(`/deals/${response.deal_id}`);
      
      addNotification({
        type: 'success',
        title: 'Deal Room Created',
        message: 'Successfully created deal room'
      });
    } catch (err) {
      addNotification({
        type: 'error',
        title: 'Failed to create deal room',
        message: err.message || 'Could not create deal room'
      });
    }
  };

  return (
    <>
      <div className="project-card-clean">
        {/* Status Badge */}
        <div className="card-header-clean">
          <span className="status-badge-clean opportunity">OPPORTUNITY</span>
        </div>

        {/* Project Info */}
        <h3 className="project-title-clean">{project.title || 'Untitled Project'}</h3>
        
        <div className="location-row-clean">
          <svg viewBox="0 0 16 16" fill="none" className="location-icon-clean">
            <path d="M8 8.5a1.5 1.5 0 100-3 1.5 1.5 0 000 3z" fill="currentColor"/>
            <path fillRule="evenodd" clipRule="evenodd" d="M8 14s4-4.15 4-7a4 4 0 10-8 0c0 2.85 4 7 4 7z" fill="currentColor"/>
          </svg>
          <span>{project.suburb || 'Location TBD'}</span>
        </div>

        <div className="project-info-grid">
          <div className="info-block">
            <span className="info-label">LOAN AMOUNT</span>
            <span className="info-value">{formatCurrency(project.loan_amount)}</span>
          </div>
          <div className="info-block">
            <span className="info-label">TYPE</span>
            <span className="info-value">{project.property_type || 'Not specified'}</span>
          </div>
        </div>

        {/* Actions */}
        <div className="card-actions-clean">
          {project.access_status === 'approved' && !project.deal_id ? (
            <>
              <button 
                onClick={() => navigate(`/project/${project.id}`)}
                className="btn-text-clean"
              >
                View Details
              </button>
              <button 
                onClick={handleEngage}
                className="btn-primary-clean"
              >
                Engage
              </button>
            </>
          ) : project.access_status === 'approved' && project.deal_id ? (
            <>
              <button 
                onClick={() => navigate(`/project/${project.id}`)}
                className="btn-text-clean"
              >
                View Details
              </button>
              <button 
                onClick={() => navigate(`/project/${project.id}/deal/${project.deal_id}`)}
                className="btn-primary-clean"
              >
                Deal Room
              </button>
            </>
          ) : project.access_status === 'pending' ? (
            <button 
              disabled
              className="btn-primary-clean full-width disabled"
            >
              ⏳ Request Pending
            </button>
          ) : !showAccessForm ? (
            <>
              <button 
                onClick={() => setShowPreview(true)}
                className="btn-text-clean"
              >
                View Preview
              </button>
              <button 
                onClick={() => setShowAccessForm(true)}
                className="btn-primary-clean"
              >
                Request Access
              </button>
            </>
          ) : (
            <div className="access-form-inline">
              <textarea
                value={accessMessage}
                onChange={(e) => setAccessMessage(e.target.value)}
                placeholder="Introduce yourself (optional)..."
                className="access-message-input"
                rows="2"
              />
              <div className="access-form-actions">
                <button 
                  onClick={() => {
                    setShowAccessForm(false);
                    setAccessMessage('');
                  }}
                  className="btn-text-clean"
                >
                  Cancel
                </button>
                <button 
                  onClick={handleRequestAccess}
                  disabled={requesting}
                  className="btn-primary-clean"
                >
                  {requesting ? 'Sending...' : 'Send'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <ProjectPreviewModal
        project={project}
        isOpen={showPreview}
        onClose={() => setShowPreview(false)}
        onRequestAccess={onProjectUpdate}
      />
    </>
  );
};



// ===========================
// PROJECT CARD COMPONENT
// ===========================

const ProjectCard = ({ project, userRole, onProjectUpdate }) => {
  const api = useApi();
  const { addNotification } = useNotifications();
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const [showMessageInput, setShowMessageInput] = useState(false);
  const [accessMessage, setAccessMessage] = useState('');
  const navigate = useNavigate();
  
  // State for handling multiple deal rooms
  const [deals, setDeals] = useState([]);
  const [showDeals, setShowDeals] = useState(false);
  const [loadingDeals, setLoadingDeals] = useState(false);
  
  // Fetch deals if borrower and project has deals
  useEffect(() => {
    if (userRole === 'borrower' && project.deal_count > 0 && project.payment_status === 'paid') {
      fetchDeals();
    }
  }, [project.id, userRole, project.deal_count]);
  
  const fetchDeals = async () => {
    setLoadingDeals(true);
    try {
      const dealsList = await api.getProjectDeals(project.id);
      setDeals(dealsList);
    } catch (err) {
      console.error('Failed to fetch deals:', err);
    } finally {
      setLoadingDeals(false);
    }
  };

  const handleRequestAccess = async () => {
    setRequesting(true);
    try {
      await api.requestAccess(project.id, accessMessage.trim() || null);
      addNotification({
        type: 'success',
        title: 'Access Request Sent',
        message: 'Your request has been sent to the developer.'
      });
      setShowMessageInput(false);
      setAccessMessage('');
      if (onProjectUpdate) onProjectUpdate();
    } catch (err) {
      addNotification({
        type: 'error',
        title: 'Request Failed',
        message: err.message || 'Failed to send access request'
      });
    } finally {
      setRequesting(false);
    }
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-AU', {
      style: 'currency',
      currency: 'AUD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount);
  };

  const StatusBadge = ({ status }) => {
    const getStatusClass = (status) => {
      switch (status) {
        case 'paid': return 'status-published';
        case 'unpaid': return 'status-draft';
        case 'approved': return 'status-approved';
        case 'pending': return 'status-pending';
        default: return 'status-draft';
      }
    };

    const getStatusText = (status) => {
      switch (status) {
        case 'paid': return 'Published';
        case 'unpaid': return 'Draft';
        case 'approved': return 'Access Granted';
        case 'pending': return 'Access Pending';
        default: return status;
      }
    };

    return (
      <span className={`status-badge ${getStatusClass(status)}`}>
        {getStatusText(status)}
      </span>
    );
  };

  return (
    <>
      <div className="project-card">
        <div className="project-card-header">
          <h3 className="project-title">{project.title}</h3>
          <StatusBadge status={userRole === 'borrower' ? project.payment_status : project.access_status || 'none'} />
        </div>
        
        <div className="project-info">
          <div className="info-item">
            <span className="label">Location:</span>
            <span className="value">{project.suburb || 'Not specified'}</span>
          </div>
          <div className="info-item">
            <span className="label">Loan Amount:</span>
            <span className="value">{formatCurrency(project.loan_amount)}</span>
          </div>
          <div className="info-item">
            <span className="label">Property Type:</span>
            <span className="value">{project.property_type || 'Not specified'}</span>
          </div>
          {userRole === 'funder' && project.access_status === 'approved' && (
            <div className="info-item">
              <span className="label">Borrower:</span>
              <span className="value">{project.borrower_name}</span>
            </div>
          )}
          {userRole === 'borrower' && project.deal_count > 0 && (
            <div className="info-item">
              <span className="label">Active Deals:</span>
              <span className="value">{project.deal_count}</span>
            </div>
          )}
        </div>
        
        <div className="project-actions">
          {userRole === 'borrower' && (
            <>
              {project.payment_status !== 'paid' ? (
                <>
                  <Link to={`/project/${project.id}`} className="btn btn-outline">
                    View Details
                  </Link>
                  <button 
                    onClick={() => setShowPaymentModal(true)}
                    className="btn btn-primary"
                    disabled={!project.documents_complete}
                    title={!project.documents_complete ? 'Upload all required documents first' : ''}
                  >
                    Pay to Publish ($499)
                  </button>
                </>
              ) : (
                <>
                  <Link to={`/project/${project.id}`} className="btn btn-outline">
                    View Details
                  </Link>
                  {/* Only show deal rooms if there are actual deals */}
                  {project.deal_count > 1 ? (
                    <div className="deal-dropdown">
                      <button 
                        onClick={() => setShowDeals(!showDeals)}
                        className="btn btn-primary"
                      >
                        Deal Rooms ({project.deal_count}) ▼
                      </button>
                      {showDeals && (
                        <div className="deal-dropdown-menu">
                          {loadingDeals ? (
                            <div className="deal-dropdown-item">Loading...</div>
                          ) : (
                            deals.map(deal => (
                              <button
                                key={deal.id}
                                onClick={() => {
                                  setShowDeals(false);
                                  navigate(`/project/${project.id}/deal/${deal.id}`);
                                }}
                                className="deal-dropdown-item"
                              >
                                <span>{deal.funder_name}</span>
                                {deal.proposal_status === 'accepted' && 
                                  <span className="deal-status-badge accepted">Accepted</span>
                                }
                              </button>
                            ))
                          )}
                        </div>
                      )}
                    </div>
                  ) : project.deal_count === 1 && deals.length > 0 ? (
                    <button 
                      onClick={() => navigate(`/project/${project.id}/deal/${deals[0].id}`)}
                      className="btn btn-primary"
                    >
                      Deal Room
                    </button>
                  ) : null}
                </>
              )}
            </>
          )}

          {userRole === 'funder' && project.payment_status === 'paid' && (
            <>
              {/* Not approved yet - show request access */}
              {project.access_status !== 'approved' && !showMessageInput && (
                <button 
                  onClick={() => setShowMessageInput(true)}
                  disabled={project.access_status === 'pending'}
                  className="btn btn-primary"
                >
                  {project.access_status === 'pending' ? '⏳ Request Pending' : '🔓 Request Full Access'}
                </button>
              )}
              
              {/* Approved but no deal - show view details and engage */}
              {project.access_status === 'approved' && !project.deal_id && (
                <>
                  <button 
                    onClick={() => navigate(`/project/${project.id}`)}
                    className="btn btn-outline"
                  >
                    View Full Details
                  </button>
                  <button 
                    onClick={async () => {
                      try {
                        const response = await api.createDeal(project.id, project.access_request_id);
                        addNotification({
                          type: 'success',
                          title: 'Deal Room Created',
                          message: 'Successfully created deal room'
                        });
                        navigate(`/project/${project.id}/deal/${response.deal_id}`);
                      } catch (err) {
                        console.error('Deal creation error:', err);
                        addNotification({
                          type: 'error',
                          title: 'Failed to create deal room',
                          message: err.message || 'Could not create deal room'
                        });
                      }
                    }}
                    className="btn btn-primary"
                  >
                    Engage
                  </button>
                </>
              )}
              
              {/* Has a deal - show view details and deal room */}
              {project.access_status === 'approved' && project.deal_id && (
                <>
                  <button 
                    onClick={() => navigate(`/project/${project.id}`)}
                    className="btn btn-outline"
                  >
                    View Full Details
                  </button>
                  <button 
                    onClick={() => navigate(`/project/${project.id}/deal/${project.deal_id}`)}
                    className="btn btn-primary"
                  >
                    Deal Room
                  </button>
                </>
              )}
            </>
          )}

          {userRole === 'admin' && (
            <button 
              onClick={() => navigate(`/project/${project.id}`)}
              className="btn btn-outline"
            >
              Admin View
            </button>
          )}

          {userRole === 'funder' && showMessageInput && (
            <div className="access-request-form">
              <div className="message-input-container">
                <label>Message to developer (optional):</label>
                <textarea
                  value={accessMessage}
                  onChange={(e) => setAccessMessage(e.target.value)}
                  placeholder="Introduce yourself and explain your interest in this project..."
                  className="message-textarea"
                  rows="3"
                  maxLength="500"
                />
                <div className="character-count">{accessMessage.length}/500</div>
              </div>
              <div className="message-actions">
                <button 
                  onClick={() => {
                    setShowMessageInput(false);
                    setAccessMessage('');
                  }}
                  className="btn btn-sm btn-outline"
                >
                  Cancel
                </button>
                <button 
                  onClick={handleRequestAccess}
                  disabled={requesting}
                  className="btn btn-sm btn-primary"
                >
                  {requesting ? 'Sending...' : 'Send Request'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {showPaymentModal && (
        <PaymentModal 
          projectId={project.id}
          onClose={() => setShowPaymentModal(false)}
          onSuccess={() => {
            setShowPaymentModal(false);
            if (onProjectUpdate) onProjectUpdate();
          }}
        />
      )}
    </>
  );
};

// ===========================
// PROJECTS PAGE (FOR FUNDERS)
// ===========================

const ProjectsPage = () => {
  const api = useApi();
  const { user } = useApp();
  const { addNotification } = useNotifications();
  const [projects, setProjects] = useState([]);
  const [filteredProjects, setFilteredProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [viewMode, setViewMode] = useState('grid'); // grid or map
  const [savedSearches, setSavedSearches] = useState([]);
  const [showSaveSearchModal, setShowSaveSearchModal] = useState(false);
  const [filters, setFilters] = useState({
    propertyType: '',
    minLoan: '',
    maxLoan: '',
    suburb: '',
    developmentStage: '',
    sortBy: 'created_at',
    riskProfile: '',
    minReturn: '',
    dealSize: ''
  });

  const debouncedFilters = useDebounce(filters, 300);

  useEffect(() => {
    fetchProjects();
    loadSavedSearches();
  }, []);

  useEffect(() => {
    applyFilters();
  }, [projects, debouncedFilters]);

  const fetchProjects = async () => {
    try {
      const data = await api.getProjects();
      // Only show published projects that user doesn't already have access to
      const marketplaceProjects = data.filter(p => 
        p.payment_status === 'paid' && 
        (!p.access_status || p.access_status === 'declined')
      );
      setProjects(marketplaceProjects);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const loadSavedSearches = () => {
    const saved = localStorage.getItem('saved_searches');
    if (saved) {
      setSavedSearches(JSON.parse(saved));
    }
  };

  const saveCurrentSearch = (name) => {
    const newSearch = {
      id: Date.now(),
      name,
      filters: { ...filters },
      created_at: new Date()
    };
    const updated = [...savedSearches, newSearch];
    setSavedSearches(updated);
    localStorage.setItem('saved_searches', JSON.stringify(updated));
    setShowSaveSearchModal(false);
    addNotification({
      type: 'success',
      title: 'Search Saved',
      message: 'Your search criteria has been saved'
    });
  };

  const applySavedSearch = (search) => {
    setFilters(search.filters);
  };

  const applyFilters = () => {
    let filtered = [...projects];

    if (filters.propertyType) {
      filtered = filtered.filter(p => p.property_type === filters.propertyType);
    }
    
    if (filters.minLoan) {
      filtered = filtered.filter(p => p.loan_amount >= parseInt(filters.minLoan));
    }
    
    if (filters.maxLoan) {
      filtered = filtered.filter(p => p.loan_amount <= parseInt(filters.maxLoan));
    }
    
    if (filters.suburb) {
      filtered = filtered.filter(p => 
        p.suburb?.toLowerCase().includes(filters.suburb.toLowerCase())
      );
    }
    
    if (filters.developmentStage) {
      filtered = filtered.filter(p => p.development_stage === filters.developmentStage);
    }

    if (filters.riskProfile) {
      filtered = filtered.filter(p => {
        const avgRisk = (p.market_risk_rating + p.construction_risk_rating + p.location_risk_rating) / 3;
        if (filters.riskProfile === 'low') return avgRisk <= 1.5;
        if (filters.riskProfile === 'medium') return avgRisk > 1.5 && avgRisk <= 2.5;
        if (filters.riskProfile === 'high') return avgRisk > 2.5;
        return true;
      });
    }

    // Sorting
    filtered.sort((a, b) => {
      switch (filters.sortBy) {
        case 'loan_amount_asc':
          return a.loan_amount - b.loan_amount;
        case 'loan_amount_desc':
          return b.loan_amount - a.loan_amount;
        case 'return_potential':
          return (b.expected_profit / b.total_project_cost || 0) - (a.expected_profit / a.total_project_cost || 0);
        case 'created_at':
        default:
          return new Date(b.created_at) - new Date(a.created_at);
      }
    });

    setFilteredProjects(filtered);
  };

  const clearFilters = () => {
    setFilters({
      propertyType: '',
      minLoan: '',
      maxLoan: '',
      suburb: '',
      developmentStage: '',
      sortBy: 'created_at',
      riskProfile: '',
      minReturn: '',
      dealSize: ''
    });
  };

  const exportResults = () => {
    const data = filteredProjects.map(p => ({
      'Project': p.title,
      'Location': p.suburb,
      'Loan Amount': p.loan_amount,
      'Property Type': p.property_type,
      'Stage': p.development_stage,
      'LVR': p.lvr ? `${p.lvr}%` : 'N/A',
      'Created': formatDate(p.created_at)
    }));
    
    downloadCSV(data, `marketplace_export_${new Date().toISOString().split('T')[0]}.csv`);
    
    addNotification({
      type: 'success',
      title: 'Export Complete',
      message: 'Marketplace data exported successfully'
    });
  };

  if (loading) return <LoadingSpinner />;

  if (!user.approved) {
    return (
      <div className="marketplace-page">
        <div className="warning-message">
          <h3>Account Pending Approval</h3>
          <p>Your account is currently under review. You'll be able to access the marketplace once approved.</p>
        </div>
      </div>
    );
  }

  if (user.subscription_status !== 'active') {
    return (
      <div className="marketplace-page">
        <div className="subscription-required">
          <h2>Subscription Required</h2>
          <p>You need an active subscription to access the marketplace.</p>
          <Link to="/dashboard" className="btn btn-primary">
            Subscribe Now
          </Link>
        </div>
      </div>
    );
  }

 return (
  <div className="projects-page">
    {/* Clean styled header like Dashboard */}
    <div className="dashboard-header-clean">
      <div className="header-content-clean">
        <h1 className="greeting">Investment Marketplace</h1>
        <h1 className="username">Discover Opportunities</h1>
        <p className="tagline">
          Browse curated property development projects with AI-powered insights
        </p>
      </div>
      <button onClick={exportResults} className="btn btn-outline">
        Export Results
      </button>
    </div>

    {error && <ErrorMessage message={error} onClose={() => setError('')} />}

    {/* Market Insights Section */}
    <div className="stats-grid-clean" style={{ marginBottom: '40px' }}>
      <div className="stat-card-clean">
        <div className="stat-header-clean">
          <span className="stat-label">TOTAL CAPITAL SEEKING</span>
        </div>
        <div className="stat-value">
          {formatCurrency(projects.reduce((sum, p) => sum + p.loan_amount, 0))}
        </div>
        <div className="stat-subtitle">Across all projects</div>
      </div>
      
      <div className="stat-card-clean">
        <div className="stat-header-clean">
          <span className="stat-label">ACTIVE OPPORTUNITIES</span>
        </div>
        <div className="stat-value">{projects.length}</div>
        <div className="stat-subtitle">Available projects</div>
      </div>
      
      <div className="stat-card-clean">
        <div className="stat-header-clean">
          <span className="stat-label">TRENDING ASSET CLASS</span>
        </div>
        <div className="stat-value">
          {projects.filter(p => p.property_type === 'Residential').length > 
           projects.filter(p => p.property_type === 'Commercial').length 
            ? 'Residential' 
            : 'Commercial'}
        </div>
        <div className="stat-subtitle">Most active sector</div>
      </div>
      
      <div className="stat-card-clean">
        <div className="stat-header-clean">
          <span className="stat-label">AVG EXPECTED RETURN</span>
        </div>
        <div className="stat-value">
          {projects.length > 0 
            ? Math.round(projects.reduce((sum, p) => sum + ((p.expected_profit / p.total_project_cost * 100) || 0), 0) / projects.length) + '%'
            : 'N/A'}
        </div>
        <div className="stat-subtitle">Across all projects</div>
      </div>
    </div>

    {/* Filters Section - using same styling as dashboard */}
    <div className="portfolio-section-clean">
      <div className="portfolio-header-clean">
        <h2>Filter Projects</h2>
        <div className="filter-actions">
          {savedSearches.length > 0 && (
            <select 
              onChange={(e) => {
                const search = savedSearches.find(s => s.id === parseInt(e.target.value));
                if (search) applySavedSearch(search);
              }}
              className="form-select"
              style={{ marginRight: '12px' }}
            >
              <option value="">Load Saved Search...</option>
              {savedSearches.map(search => (
                <option key={search.id} value={search.id}>{search.name}</option>
              ))}
            </select>
          )}
          <button 
            onClick={() => setShowSaveSearchModal(true)} 
            className="btn btn-outline"
            style={{ marginRight: '12px' }}
          >
            Save Search
          </button>
          <button onClick={clearFilters} className="btn btn-outline">
            Clear All
          </button>
        </div>
      </div>
      
      <div className="filters-grid">
        <div className="filter-group">
          <label>Property Type</label>
          <select
            value={filters.propertyType}
            onChange={(e) => setFilters({ ...filters, propertyType: e.target.value })}
            className="form-select"
          >
            <option value="">All Types</option>
            <option value="Residential">Residential</option>
            <option value="Commercial">Commercial</option>
            <option value="Mixed Use">Mixed Use</option>
            <option value="Industrial">Industrial</option>
            <option value="Retail">Retail</option>
          </select>
        </div>

        <div className="filter-group">
          <label>Deal Size Range</label>
          <div className="range-inputs">
            <NumberInput
              value={filters.minLoan}
              onChange={(value) => setFilters({ ...filters, minLoan: value })}
              placeholder="Min"
              prefix="$"
            />
            <span style={{ margin: '0 8px' }}>to</span>
            <NumberInput
              value={filters.maxLoan}
              onChange={(value) => setFilters({ ...filters, maxLoan: value })}
              placeholder="Max"
              prefix="$"
            />
          </div>
        </div>

        <div className="filter-group">
          <label>Location</label>
          <input
            type="text"
            value={filters.suburb}
            onChange={(e) => setFilters({ ...filters, suburb: e.target.value })}
            className="form-input"
            placeholder="Search suburb or city"
          />
        </div>

        <div className="filter-group">
          <label>Development Stage</label>
          <select
            value={filters.developmentStage}
            onChange={(e) => setFilters({ ...filters, developmentStage: e.target.value })}
            className="form-select"
          >
            <option value="">All Stages</option>
            <option value="Planning">Planning</option>
            <option value="Pre-Construction">Pre-Construction</option>
            <option value="Construction">Construction</option>
            <option value="Near Completion">Near Completion</option>
          </select>
        </div>

        <div className="filter-group">
          <label>Risk Profile</label>
          <select
            value={filters.riskProfile}
            onChange={(e) => setFilters({ ...filters, riskProfile: e.target.value })}
            className="form-select"
          >
            <option value="">All Risk Levels</option>
            <option value="low">Low Risk</option>
            <option value="medium">Medium Risk</option>
            <option value="high">High Risk</option>
          </select>
        </div>

        <div className="filter-group">
          <label>Sort By</label>
          <select
            value={filters.sortBy}
            onChange={(e) => setFilters({ ...filters, sortBy: e.target.value })}
            className="form-select"
          >
            <option value="created_at">Newest First</option>
            <option value="loan_amount_desc">Loan Amount (High to Low)</option>
            <option value="loan_amount_asc">Loan Amount (Low to High)</option>
            <option value="return_potential">Return Potential</option>
          </select>
        </div>
      </div>

      <div className="filter-summary" style={{ marginTop: '16px', color: '#64748b' }}>
        <span>Showing {filteredProjects.length} of {projects.length} opportunities</span>
        {Object.values(filters).filter(v => v && v !== 'created_at').length > 0 && (
          <button 
            onClick={clearFilters} 
            className="clear-filters-link"
            style={{ marginLeft: '12px', color: '#667eea', background: 'none', border: 'none', cursor: 'pointer' }}
          >
            Clear filters
          </button>
        )}
      </div>
    </div>

    {/* Projects Display - using portfolio section styling */}
    <div className="portfolio-section-clean">
      {filteredProjects.length === 0 ? (
        <EmptyState 
          icon="🔍"
          title="No projects match your criteria"
          message="Try adjusting your filters to see more opportunities"
          action={
            <button onClick={clearFilters} className="btn btn-primary">
              Clear Filters
            </button>
          }
        />
      ) : (
        <div className="projects-grid-clean">
          {filteredProjects.map((project) => (
            <FunderProjectCard 
              key={project.id} 
              project={project} 
              onProjectUpdate={fetchProjects}
            />
          ))}
        </div>
      )}
    </div>

    {/* Save Search Modal */}
    <Modal 
      isOpen={showSaveSearchModal} 
      onClose={() => setShowSaveSearchModal(false)}
      title="Save Search"
      size="small"
    >
      <div className="save-search-form">
        <input
          type="text"
          placeholder="Name your search..."
          className="form-input"
          onKeyPress={(e) => {
            if (e.key === 'Enter' && e.target.value) {
              saveCurrentSearch(e.target.value);
            }
          }}
        />
        <button 
          onClick={(e) => {
            const input = e.target.previousSibling;
            if (input.value) {
              saveCurrentSearch(input.value);
            }
          }}
          className="btn btn-primary"
          style={{ marginTop: '12px' }}
        >
          Save Search
        </button>
      </div>
    </Modal>
  </div>
);
};



const AddressAutocomplete = ({ api, value, onChange, onSelect }) => {
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [loading, setLoading] = useState(false);
  const suggestionsRef = useRef(null);
  const searchTimeout = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (suggestionsRef.current && !suggestionsRef.current.contains(event.target)) {
        setShowSuggestions(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const searchAddresses = async (query) => {
    if (query.length < 3) {
      setSuggestions([]);
      return;
    }

    setLoading(true);
    try {
      const response = await api.request('/geocode/autocomplete', {
        method: 'POST',
        body: JSON.stringify({ input: query })
      });
      
      if (response.predictions) {
        setSuggestions(response.predictions);
        setShowSuggestions(true);
      }
    } catch (err) {
      console.error('Address search failed:', err);
      setSuggestions([]);
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (e) => {
    const newValue = e.target.value;
    onChange(newValue);
    
    // Debounce the search
    if (searchTimeout.current) {
      clearTimeout(searchTimeout.current);
    }
    
    searchTimeout.current = setTimeout(() => {
      searchAddresses(newValue);
    }, 300);
  };

  const handleSelectSuggestion = (suggestion) => {
    // Parse the address to extract components
    const parts = suggestion.description.split(',').map(part => part.trim());
    let suburb = '';
    let city = '';
    let state = '';
    let postcode = '';
    
    // Australian address format from OpenStreetMap typically:
    // "Street Number, Street Name, Suburb, City/Region, State [Postcode]"
    // Example: "10, Marne Road, Albion, Greater Brisbane, Queensland"
    
    if (parts.length >= 3) {
      // Skip first 1-2 parts (street number and street name)
      // Parts[0] = Street number (if separate) or full street
      // Parts[1] = Street name (if street number was separate) or suburb
      // Parts[2] = Suburb (usually) or city
      // Parts[3] = City/Region (usually)
      // Parts[4] = State (usually)
      
      // Determine where street ends and suburb begins
      let startIndex = 1; // Default: assume first part is full street
      
      // If first part is just a number, then street is parts 0+1
      if (parts[0] && /^\d+[a-zA-Z]?$/.test(parts[0])) {
        startIndex = 2; // Street is parts[0] + parts[1]
      }
      
      // Extract components based on remaining parts
      const remainingParts = parts.slice(startIndex);
      
      if (remainingParts.length >= 1) {
        suburb = remainingParts[0]; // First part after street
      }
      
      if (remainingParts.length >= 2) {
        city = remainingParts[1]; // Second part after street
      }
      
      // Look for state in remaining parts
      for (let i = 2; i < remainingParts.length; i++) {
        const part = remainingParts[i];
        
        // Check for state names (full or abbreviated)
        const stateMap = {
          'Queensland': 'QLD',
          'New South Wales': 'NSW',
          'Victoria': 'VIC',
          'South Australia': 'SA',
          'Western Australia': 'WA',
          'Tasmania': 'TAS',
          'Northern Territory': 'NT',
          'Australian Capital Territory': 'ACT',
          'QLD': 'QLD',
          'NSW': 'NSW',
          'VIC': 'VIC',
          'SA': 'SA',
          'WA': 'WA',
          'TAS': 'TAS',
          'NT': 'NT',
          'ACT': 'ACT'
        };
        
        // Check if this part contains a state
        for (const [stateName, stateCode] of Object.entries(stateMap)) {
          if (part.toLowerCase().includes(stateName.toLowerCase())) {
            state = stateCode;
            
            // Check if postcode is in the same part
            const postcodeMatch = part.match(/\b(\d{4})\b/);
            if (postcodeMatch) {
              postcode = postcodeMatch[1];
            }
            break;
          }
        }
        
        // If no state found, check if this part is just a postcode
        if (!state && /^\d{4}$/.test(part)) {
          postcode = part;
        }
      }
    }
    
    // For the example "10, Marne Road, Albion, Greater Brisbane, Queensland"
    // This should extract: suburb="Albion", city="Greater Brisbane", state="QLD"
    
    // If we don't have a postcode, try to fetch it using place details
    if (!postcode && suggestion.place_id) {
      api.request('/geocode/place-details', {
        method: 'POST',
        body: JSON.stringify({ place_id: suggestion.place_id })
      }).then(details => {
        onSelect({
          location: suggestion.description,
          suburb: suburb || details.suburb,
          city: city || details.city,
          state: state || details.state,
          postcode: details.postcode || postcode,
          place_id: suggestion.place_id
        });
      }).catch(err => {
        console.error('Failed to fetch place details:', err);
        // Fallback to what we already parsed
        onSelect({
          location: suggestion.description,
          suburb: suburb,
          city: city,
          state: state,
          postcode: postcode,
          place_id: suggestion.place_id
        });
      });
    } else {
      onSelect({
        location: suggestion.description,
        suburb: suburb,
        city: city,
        state: state,
        postcode: postcode,
        place_id: suggestion.place_id
      });
    }
    
    setShowSuggestions(false);
    setSuggestions([]);
  };

  return (
    <div className="address-autocomplete" ref={suggestionsRef}>
      <input
        type="text"
        value={value}
        onChange={handleInputChange}
        className="form-input"
        placeholder="Start typing address..."
        onFocus={() => value.length >= 3 && suggestions.length > 0 && setShowSuggestions(true)}
      />
      
      {loading && (
        <div className="address-loading">
          <span className="spinner-small"></span> Searching...
        </div>
      )}
      
      {showSuggestions && suggestions.length > 0 && (
        <div className="address-suggestions">
          {suggestions.map((suggestion) => (
            <div
              key={suggestion.place_id}
              className="suggestion-item"
              onClick={() => handleSelectSuggestion(suggestion)}
            >
              <svg className="suggestion-icon" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
              </svg>
              <span>{suggestion.description}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// ===========================
// CREATE PROJECT WIZARD
// ===========================

const CreateProject = () => {
  const api = useApi();
  const navigate = useNavigate();
  const { addNotification } = useNotifications();
  const { showToast } = useToast();
  const [currentStep, setCurrentStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    // Basic Info
    title: '',
    description: '',
    location: '',
    suburb: '',
    city: '',
    state: '',
    postcode: '',
    property_type: 'Residential',
    development_stage: 'Planning',
    
    // Financial Details
    loan_amount: '',
    interest_rate: '',
    loan_term: '',
    total_project_cost: '',
    equity_contribution: '',
    land_value: '',
    construction_cost: '',
    expected_gdc: '',
    expected_profit: '',
    
    // Project Details
    project_size_sqm: '',
    number_of_units: '',
    number_of_levels: '',
    car_spaces: '',
    zoning: '',
    planning_permit_status: 'Not Started',
    
    // Timeline
    expected_start_date: '',
    expected_completion_date: '',
    
    // Risk Assessment
    market_risk_rating: 'medium',
    construction_risk_rating: 'medium',
    location_risk_rating: 'medium'
  });
  
  const [documents, setDocuments] = useState([]);
  const [requiredDocs, setRequiredDocs] = useState({});
  const [loading, setLoading] = useState(false);
  const [uploadingDocs, setUploadingDocs] = useState(false);
  const [error, setError] = useState('');
  const [projectId, setProjectId] = useState(null);
  const [validationErrors, setValidationErrors] = useState({});

  useEffect(() => {
    fetchRequiredDocuments();
    // Load draft if exists
    const draft = localStorage.getItem('project_draft');
    if (draft) {
      const parsedDraft = JSON.parse(draft);
      setFormData(parsedDraft);
      addNotification({
        type: 'info',
        title: 'Draft Loaded',
        message: 'Your previous draft has been loaded'
      });
    }
  }, []);

  // Auto-save draft
  useEffect(() => {
    const timer = setTimeout(() => {
      if (formData.title || formData.description) {
        localStorage.setItem('project_draft', JSON.stringify(formData));
      }
    }, 1000);
    
    return () => clearTimeout(timer);
  }, [formData]);

  const fetchRequiredDocuments = async () => {
    try {
      const data = await api.getRequiredDocuments();
      setRequiredDocs(data);
    } catch (err) {
      console.error('Failed to fetch required documents:', err);
    }
  };

  const handleNext = () => {
    const errors = validateStep(currentStep);
    if (Object.keys(errors).length === 0) {
      setCurrentStep(currentStep + 1);
      setValidationErrors({});
    } else {
      setValidationErrors(errors);
      setError('Please fix the errors before proceeding');
    }
  };

  const handlePrevious = () => {
    setCurrentStep(currentStep - 1);
    setError('');
    setValidationErrors({});
  };

  const validateStep = (step) => {
    const errors = {};
    
    switch (step) {
      case 1:
        if (!formData.title) errors.title = 'Project title is required';
        if (!formData.location) errors.location = 'Location is required';
        if (!formData.suburb) errors.suburb = 'Suburb is required';
        if (!formData.loan_amount) errors.loan_amount = 'Loan amount is required';
        if (formData.loan_amount && formData.loan_amount < 100000) {
          errors.loan_amount = 'Minimum loan amount is $100,000';
        }
        if (formData.interest_rate && (formData.interest_rate < 0 || formData.interest_rate > 50)) {
          errors.interest_rate = 'Interest rate must be between 0% and 50%';
        }
        if (formData.loan_term && (formData.loan_term < 1 || formData.loan_term > 120)) {
          errors.loan_term = 'Loan term must be between 1 and 120 months';
        }
        break;
        
      case 2:
        if (!formData.total_project_cost) errors.total_project_cost = 'Total project cost is required';
        if (!formData.equity_contribution) errors.equity_contribution = 'Equity contribution is required';
        
        const totalCost = parseInt(formData.total_project_cost);
        const equity = parseInt(formData.equity_contribution);
        const loan = parseInt(formData.loan_amount);
        
        if (totalCost && equity && loan) {
          if (equity + loan > totalCost * 1.1) { // Allow 10% margin
            errors.equity_contribution = 'Equity + Loan exceeds total project cost';
          }
          if (equity < totalCost * 0.1) {
            errors.equity_contribution = 'Minimum 10% equity required';
          }
        }
        
        // LVR calculation for display only - no limit enforced
        // Let lenders decide what LVR they're comfortable with
        break;
        
      case 3:
        if (formData.expected_start_date && formData.expected_completion_date) {
          const start = new Date(formData.expected_start_date);
          const end = new Date(formData.expected_completion_date);
          if (end <= start) {
            errors.expected_completion_date = 'Completion date must be after start date';
          }
        }
        break;
    }
    
    return errors;
  };

  const handleSubmit = async () => {
    setLoading(true);
    setError('');

    try {
      // Create project
      const projectData = {
        ...formData,
        loan_amount: parseInt(formData.loan_amount),
        interest_rate: formData.interest_rate ? parseFloat(formData.interest_rate) : null,
        loan_term: formData.loan_term ? parseInt(formData.loan_term) : null,
        total_project_cost: formData.total_project_cost ? parseInt(formData.total_project_cost) : null,
        equity_contribution: formData.equity_contribution ? parseInt(formData.equity_contribution) : null,
        land_value: formData.land_value ? parseInt(formData.land_value) : null,
        construction_cost: formData.construction_cost ? parseInt(formData.construction_cost) : null,
        expected_gdc: formData.expected_gdc ? parseInt(formData.expected_gdc) : null,
        expected_profit: formData.expected_profit ? parseInt(formData.expected_profit) : null,
        project_size_sqm: formData.project_size_sqm ? parseInt(formData.project_size_sqm) : null,
        number_of_units: formData.number_of_units ? parseInt(formData.number_of_units) : null,
        number_of_levels: formData.number_of_levels ? parseInt(formData.number_of_levels) : null,
        car_spaces: formData.car_spaces ? parseInt(formData.car_spaces) : null,
      };

      const response = await api.createProject(projectData);
      setProjectId(response.project_id);
      
      // Clear draft
      localStorage.removeItem('project_draft');
      
      // Upload documents if any
      if (documents.length > 0) {
        await uploadDocuments(response.project_id);
      }
      
      showToast('Your project has been created successfully!', 'success');
      
      navigate(`/project/${response.project_id}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const uploadDocuments = async (projectId) => {
    setUploadingDocs(true);
    try {
      const formData = new FormData();
      const documentTypes = [];
      
      documents.forEach((doc) => {
        formData.append('documents', doc.file);
        documentTypes.push(doc.type);
      });
      
      formData.append('document_types', JSON.stringify(documentTypes));
      
      await api.uploadDocuments(projectId, formData);
    } catch (err) {
      console.error('Document upload error:', err);
      addNotification({
        type: 'warning',
        title: 'Document Upload Issue',
        message: 'Some documents failed to upload. You can add them later.'
      });
    } finally {
      setUploadingDocs(false);
    }
  };

  const handleDocumentChange = (e, docType) => {
    const file = e.target.files[0];
    if (file) {
      if (file.size > 50 * 1024 * 1024) {
        addNotification({
          type: 'error',
          title: 'File Too Large',
          message: 'Maximum file size is 50MB'
        });
        return;
      }
      
      setDocuments(prev => [
        ...prev.filter(d => d.type !== docType),
        { type: docType, file: file, name: file.name }
      ]);
    }
  };

  const removeDocument = (docType) => {
    setDocuments(prev => prev.filter(d => d.type !== docType));
  };

  const calculateLVR = () => {
    if (formData.loan_amount && formData.land_value) {
      return ((parseInt(formData.loan_amount) / parseInt(formData.land_value)) * 100).toFixed(1);
    }
    return null;
  };

  const calculateICR = () => {
    if (formData.expected_profit && formData.loan_amount && formData.interest_rate && formData.loan_term) {
      const annualInterest = (parseInt(formData.loan_amount) * parseFloat(formData.interest_rate)) / 100;
      const annualProfit = parseInt(formData.expected_profit) / (parseInt(formData.loan_term) / 12);
      return (annualProfit / annualInterest).toFixed(2);
    }
    return null;
  };

  const renderStepContent = () => {
    switch (currentStep) {
      case 1:
        return (
          <div className="form-section">
            <h3>Basic Project Information</h3>
            
            <div className="form-group">
              <label htmlFor="title">
                Project Title *
                <Tooltip content="A clear, descriptive name for your development project">
                  <span className="help-icon">?</span>
                </Tooltip>
              </label>
              <input
                type="text"
                id="title"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                required
                className={`form-input ${validationErrors.title ? 'error' : ''}`}
                placeholder="e.g., Luxury Apartment Development - Sydney CBD"
              />
              {validationErrors.title && (
                <span className="field-error">{validationErrors.title}</span>
              )}
            </div>

            <div className="form-group">
              <label htmlFor="description">
                Project Description
                <Tooltip content="Provide details about the development, target market, and unique features">
                  <span className="help-icon">?</span>
                </Tooltip>
              </label>
              <textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                className="form-textarea"
                placeholder="Provide a detailed description of your development project..."
                rows="6"
              />
            </div>

            <div className="form-row">
  <div className="form-group">
    <label htmlFor="location">
      Full Address *
      <Tooltip content="Start typing to search for addresses">
        <span className="help-icon">?</span>
      </Tooltip>
    </label>
    <AddressAutocomplete
      api={api}
      value={formData.location}
      onChange={(value) => setFormData({ ...formData, location: value })}
      onSelect={(addressData) => setFormData({ 
        ...formData, 
        location: addressData.location,
        suburb: addressData.suburb,
        city: addressData.city,
        state: addressData.state,
        postcode: addressData.postcode
      })}
    />
    {validationErrors.location && (
      <span className="field-error">{validationErrors.location}</span>
    )}
  </div>

  <div className="form-row">
    <div className="form-group">
      <label htmlFor="suburb">
        Suburb *
        <Tooltip content="Auto-filled from address selection">
          <span className="help-icon">?</span>
        </Tooltip>
      </label>
      <input
        type="text"
        id="suburb"
        value={formData.suburb}
        onChange={(e) => setFormData({ ...formData, suburb: e.target.value })}
        required
        className={`form-input ${validationErrors.suburb ? 'error' : ''}`}
        placeholder="Auto-filled from address"
      />
      {validationErrors.suburb && (
        <span className="field-error">{validationErrors.suburb}</span>
      )}
    </div>
    
    <div className="form-group">
      <label htmlFor="city">
        City/Region
        <Tooltip content="Auto-filled from address selection">
          <span className="help-icon">?</span>
        </Tooltip>
      </label>
      <input
        type="text"
        id="city"
        value={formData.city}
        onChange={(e) => setFormData({ ...formData, city: e.target.value })}
        className={`form-input ${validationErrors.city ? 'error' : ''}`}
        placeholder="e.g. Greater Brisbane"
      />
      {validationErrors.city && (
        <span className="field-error">{validationErrors.city}</span>
      )}
    </div>
  </div>
  
  <div className="form-row">
    <div className="form-group">
      <label htmlFor="state">
        State *
        <Tooltip content="Auto-filled from address selection">
          <span className="help-icon">?</span>
        </Tooltip>
      </label>
      <select
        id="state"
        value={formData.state}
        onChange={(e) => setFormData({ ...formData, state: e.target.value })}
        required
        className={`form-input ${validationErrors.state ? 'error' : ''}`}
      >
        <option value="">Select State</option>
        <option value="NSW">NSW</option>
        <option value="VIC">VIC</option>
        <option value="QLD">QLD</option>
        <option value="WA">WA</option>
        <option value="SA">SA</option>
        <option value="TAS">TAS</option>
        <option value="ACT">ACT</option>
        <option value="NT">NT</option>
      </select>
      {validationErrors.state && (
        <span className="field-error">{validationErrors.state}</span>
      )}
    </div>
    
    <div className="form-group">
      <label htmlFor="postcode">
        Postcode *
        <Tooltip content="Auto-filled from address selection">
          <span className="help-icon">?</span>
        </Tooltip>
      </label>
      <input
        type="text"
        id="postcode"
        value={formData.postcode}
        onChange={(e) => setFormData({ ...formData, postcode: e.target.value })}
        required
        pattern="[0-9]{4}"
        maxLength="4"
        className={`form-input ${validationErrors.postcode ? 'error' : ''}`}
        placeholder="e.g. 2000"
      />
      {validationErrors.postcode && (
        <span className="field-error">{validationErrors.postcode}</span>
      )}
    </div>
  </div>
</div>

            <div className="form-row">
              <div className="form-group">
                <label htmlFor="property_type">
                  Property Type
                  <Tooltip content="The type of development you're building">
                    <span className="help-icon">?</span>
                  </Tooltip>
                </label>
                <select
                  id="property_type"
                  value={formData.property_type}
                  onChange={(e) => setFormData({ ...formData, property_type: e.target.value })}
                  className="form-select"
                >
                  <option value="Residential">Residential</option>
                  <option value="Commercial">Commercial</option>
                  <option value="Mixed Use">Mixed Use</option>
                  <option value="Industrial">Industrial</option>
                  <option value="Retail">Retail</option>
                </select>
              </div>

              <div className="form-group">
                <label htmlFor="development_stage">
                  Development Stage
                  <Tooltip content="Current stage of your development project">
                    <span className="help-icon">?</span>
                  </Tooltip>
                </label>
                <select
                  id="development_stage"
                  value={formData.development_stage}
                  onChange={(e) => setFormData({ ...formData, development_stage: e.target.value })}
                  className="form-select"
                >
                  <option value="Planning">Planning</option>
                  <option value="Pre-Construction">Pre-Construction</option>
                  <option value="Construction">Construction</option>
                  <option value="Near Completion">Near Completion</option>
                </select>
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="loan_amount">
                Loan Amount Required (AUD) *
                <Tooltip content="Total funding amount you're seeking from lenders">
                  <span className="help-icon">?</span>
                </Tooltip>
              </label>
              <NumberInput
                id="loan_amount"
                value={formData.loan_amount}
                onChange={(value) => setFormData({ ...formData, loan_amount: value })}
                placeholder="5,000,000"
                prefix="$"
                min={100000}
                className={validationErrors.loan_amount ? 'error' : ''}
              />
              {validationErrors.loan_amount && (
                <span className="field-error">{validationErrors.loan_amount}</span>
              )}
            </div>

            <div className="form-row">
              <div className="form-group">
                <label htmlFor="interest_rate">
                  Target Interest Rate (%)
                  <Tooltip content="Expected annual interest rate (typically 8-15% for development finance)">
                    <span className="help-icon">?</span>
                  </Tooltip>
                </label>
                <NumberInput
                  id="interest_rate"
                  value={formData.interest_rate}
                  onChange={(value) => setFormData({ ...formData, interest_rate: value })}
                  placeholder="10.5"
                  suffix="%"
                  min={0}
                  max={50}
                  step={0.1}
                  className={validationErrors.interest_rate ? 'error' : ''}
                />
                {validationErrors.interest_rate && (
                  <span className="field-error">{validationErrors.interest_rate}</span>
                )}
              </div>

              <div className="form-group">
                <label htmlFor="loan_term">
                  Loan Term (months)
                  <Tooltip content="Duration of the loan in months (typically 12-36 months)">
                    <span className="help-icon">?</span>
                  </Tooltip>
                </label>
                <NumberInput
                  id="loan_term"
                  value={formData.loan_term}
                  onChange={(value) => setFormData({ ...formData, loan_term: value })}
                  placeholder="24"
                  suffix="months"
                  min={1}
                  max={120}
                  className={validationErrors.loan_term ? 'error' : ''}
                />
                {validationErrors.loan_term && (
                  <span className="field-error">{validationErrors.loan_term}</span>
                )}
              </div>
            </div>
          </div>
        );

      case 2:
        return (
          <div className="form-section">
            <h3>Financial Details</h3>
            
            <div className="form-row">
              <div className="form-group">
                <label htmlFor="total_project_cost">
                  Total Project Cost (AUD) *
                  <Tooltip content="Total cost including land, construction, and all other expenses">
                    <span className="help-icon">?</span>
                  </Tooltip>
                </label>
                <NumberInput
                  id="total_project_cost"
                  value={formData.total_project_cost}
                  onChange={(value) => setFormData({ ...formData, total_project_cost: value })}
                  placeholder="10,000,000"
                  prefix="$"
                  min={1}
                  className={validationErrors.total_project_cost ? 'error' : ''}
                />
                {validationErrors.total_project_cost && (
                  <span className="field-error">{validationErrors.total_project_cost}</span>
                )}
              </div>

              <div className="form-group">
                <label htmlFor="equity_contribution">
                  Equity Contribution (AUD) *
                  <Tooltip content="Your cash contribution to the project (minimum 10-30% typically required)">
                    <span className="help-icon">?</span>
                  </Tooltip>
                </label>
                <NumberInput
                  id="equity_contribution"
                  value={formData.equity_contribution}
                  onChange={(value) => setFormData({ ...formData, equity_contribution: value })}
                  placeholder="3,000,000"
                  prefix="$"
                  min={0}
                  className={validationErrors.equity_contribution ? 'error' : ''}
                />
                {validationErrors.equity_contribution && (
                  <span className="field-error">{validationErrors.equity_contribution}</span>
                )}
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label htmlFor="land_value">
                  Land Value (AUD)
                  <Tooltip content="Current market value of the land/site">
                    <span className="help-icon">?</span>
                  </Tooltip>
                </label>
                <NumberInput
                  id="land_value"
                  value={formData.land_value}
                  onChange={(value) => setFormData({ ...formData, land_value: value })}
                  placeholder="3,000,000"
                  prefix="$"
                  min={0}
                  className={validationErrors.land_value ? 'error' : ''}
                />
                {validationErrors.land_value && (
                  <span className="field-error">{validationErrors.land_value}</span>
                )}
              </div>

              <div className="form-group">
                <label htmlFor="construction_cost">
                  Construction Cost (AUD)
                  <Tooltip content="Estimated cost for construction and development">
                    <span className="help-icon">?</span>
                  </Tooltip>
                </label>
                <NumberInput
                  id="construction_cost"
                  value={formData.construction_cost}
                  onChange={(value) => setFormData({ ...formData, construction_cost: value })}
                  placeholder="7,000,000"
                  prefix="$"
                  min={0}
                />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label htmlFor="expected_profit">
                  Expected Profit (AUD)
                  <Tooltip content="Projected profit after all costs (aim for 20%+ margin)">
                    <span className="help-icon">?</span>
                  </Tooltip>
                </label>
                <NumberInput
                  id="expected_profit"
                  value={formData.expected_profit}
                  onChange={(value) => setFormData({ ...formData, expected_profit: value })}
                  placeholder="2,500,000"
                  prefix="$"
                  min={0}
                />
              </div>
            </div>

            {/* Financial Metrics */}
            <div className="financial-metrics">
              <h4>Key Financial Metrics</h4>
              <div className="metrics-grid">
                <div className="metric-item">
                  <label>LVR (Loan to Value Ratio)</label>
                  <div className="metric-value">{calculateLVR() || 'N/A'}%</div>
                  <Tooltip content="Loan amount as percentage of land value. Each lender has their own LVR requirements">
                    <span className="help-icon">?</span>
                  </Tooltip>
                </div>
                <div className="metric-item">
                  <label>ICR (Interest Coverage Ratio)</label>
                  <div className="metric-value">{calculateICR() || 'N/A'}</div>
                  <Tooltip content="Ability to service interest from project profits. Should be above 1.5x">
                    <span className="help-icon">?</span>
                  </Tooltip>
                </div>
                <div className="metric-item">
                  <label>Debt/Equity Ratio</label>
                  <div className="metric-value">
                    {formData.loan_amount && formData.equity_contribution 
                      ? (parseInt(formData.loan_amount) / parseInt(formData.equity_contribution)).toFixed(2)
                      : 'N/A'}
                  </div>
                  <Tooltip content="Loan amount divided by equity. Lower ratios indicate less risk">
                    <span className="help-icon">?</span>
                  </Tooltip>
                </div>
                <div className="metric-item">
                  <label>Profit Margin</label>
                  <div className="metric-value">
                    {formData.expected_profit && formData.total_project_cost
                      ? ((parseInt(formData.expected_profit) / parseInt(formData.total_project_cost)) * 100).toFixed(1)
                      : 'N/A'}%
                  </div>
                  <Tooltip content="Profit as percentage of total cost. Aim for 20%+ for viable projects">
                    <span className="help-icon">?</span>
                  </Tooltip>
                </div>
              </div>
            </div>
          </div>
        );

      case 3:
        return (
          <div className="form-section">
            <h3>Project Details</h3>
            
            <div className="form-row">
              <div className="form-group">
                <label htmlFor="project_size_sqm">
                  {formData.property_type === 'Industrial' ? 'Warehouse Size' : 'Project Size'} (sqm)
                  <Tooltip content={
                    formData.property_type === 'Industrial' 
                      ? "Total warehouse/industrial space in square meters"
                      : formData.property_type === 'Commercial'
                      ? "Total leasable area in square meters"
                      : "Total site area in square meters"
                  }>
                    <span className="help-icon">?</span>
                  </Tooltip>
                </label>
                <NumberInput
                  id="project_size_sqm"
                  value={formData.project_size_sqm}
                  onChange={(value) => setFormData({ ...formData, project_size_sqm: value })}
                  placeholder={formData.property_type === 'Industrial' ? "10,000" : "5,000"}
                  suffix="sqm"
                  min={0}
                />
              </div>

              {formData.property_type === 'Residential' || formData.property_type === 'Mixed Use' ? (
                <div className="form-group">
                  <label htmlFor="number_of_units">
                    Number of Units
                    <Tooltip content="Total number of apartments/units in the development">
                      <span className="help-icon">?</span>
                    </Tooltip>
                  </label>
                  <NumberInput
                    id="number_of_units"
                    value={formData.number_of_units}
                    onChange={(value) => setFormData({ ...formData, number_of_units: value })}
                    placeholder="50"
                    min={0}
                  />
                </div>
              ) : formData.property_type === 'Commercial' ? (
                <div className="form-group">
                  <label htmlFor="number_of_units">
                    Number of Tenancies
                    <Tooltip content="Expected number of commercial tenants">
                      <span className="help-icon">?</span>
                    </Tooltip>
                  </label>
                  <NumberInput
                    id="number_of_units"
                    value={formData.number_of_units}
                    onChange={(value) => setFormData({ ...formData, number_of_units: value })}
                    placeholder="10"
                    min={0}
                  />
                </div>
              ) : formData.property_type === 'Industrial' ? (
                <div className="form-group">
                  <label htmlFor="number_of_units">
                    Loading Docks
                    <Tooltip content="Number of loading docks/bays">
                      <span className="help-icon">?</span>
                    </Tooltip>
                  </label>
                  <NumberInput
                    id="number_of_units"
                    value={formData.number_of_units}
                    onChange={(value) => setFormData({ ...formData, number_of_units: value })}
                    placeholder="5"
                    min={0}
                  />
                </div>
              ) : null}
            </div>

            <div className="form-row">
              {formData.property_type !== 'Industrial' && (
                <div className="form-group">
                  <label htmlFor="number_of_levels">
                    Number of Levels
                    <Tooltip content={
                      formData.property_type === 'Commercial' 
                        ? "Total floors in the commercial building"
                        : "Total floors/levels in the development"
                    }>
                      <span className="help-icon">?</span>
                    </Tooltip>
                  </label>
                  <NumberInput
                    id="number_of_levels"
                    value={formData.number_of_levels}
                    onChange={(value) => setFormData({ ...formData, number_of_levels: value })}
                    placeholder={formData.property_type === 'Commercial' ? "5" : "10"}
                    min={0}
                  />
                </div>
              )}

              <div className="form-group">
                <label htmlFor="car_spaces">
                  {formData.property_type === 'Industrial' ? 'Truck Parking Bays' : 'Car Spaces'}
                  <Tooltip content={
                    formData.property_type === 'Industrial'
                      ? "Number of truck/heavy vehicle parking bays"
                      : formData.property_type === 'Commercial'
                      ? "Total parking spaces for tenants and visitors"
                      : "Total parking spaces in the development"
                  }>
                    <span className="help-icon">?</span>
                  </Tooltip>
                </label>
                <NumberInput
                  id="car_spaces"
                  value={formData.car_spaces}
                  onChange={(value) => setFormData({ ...formData, car_spaces: value })}
                  placeholder={formData.property_type === 'Industrial' ? "20" : "75"}
                  min={0}
                />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label htmlFor="zoning">
                  Zoning
                  <Tooltip content="Current zoning designation for the site">
                    <span className="help-icon">?</span>
                  </Tooltip>
                </label>
                <input
                  type="text"
                  id="zoning"
                  value={formData.zoning}
                  onChange={(e) => setFormData({ ...formData, zoning: e.target.value })}
                  className="form-input"
                  placeholder="e.g., R3 Medium Density"
                />
              </div>

              <div className="form-group">
                <label htmlFor="planning_permit_status">
                  Planning Permit Status
                  <Tooltip content="Current status of planning/development approvals">
                    <span className="help-icon">?</span>
                  </Tooltip>
                </label>
                <select
                  id="planning_permit_status"
                  value={formData.planning_permit_status}
                  onChange={(e) => setFormData({ ...formData, planning_permit_status: e.target.value })}
                  className="form-select"
                >
                  <option value="Not Started">Not Started</option>
                  <option value="In Progress">In Progress</option>
                  <option value="Submitted">Submitted</option>
                  <option value="Approved">Approved</option>
                  <option value="Approved with Conditions">Approved with Conditions</option>
                </select>
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label htmlFor="expected_start_date">
                  Expected Start Date
                  <Tooltip content="When you expect to commence construction">
                    <span className="help-icon">?</span>
                  </Tooltip>
                </label>
                <input
                  type="date"
                  id="expected_start_date"
                  value={formData.expected_start_date}
                  onChange={(e) => setFormData({ ...formData, expected_start_date: e.target.value })}
                  className={`form-input ${validationErrors.expected_start_date ? 'error' : ''}`}
                />
              </div>

              <div className="form-group">
                <label htmlFor="expected_completion_date">
                  Expected Completion Date
                  <Tooltip content="Anticipated project completion date">
                    <span className="help-icon">?</span>
                  </Tooltip>
                </label>
                <input
                  type="date"
                  id="expected_completion_date"
                  value={formData.expected_completion_date}
                  onChange={(e) => setFormData({ ...formData, expected_completion_date: e.target.value })}
                  className={`form-input ${validationErrors.expected_completion_date ? 'error' : ''}`}
                />
                {validationErrors.expected_completion_date && (
                  <span className="field-error">{validationErrors.expected_completion_date}</span>
                )}
              </div>
            </div>

            <div className="form-section">
              <h4>Risk Assessment</h4>
              <div className="risk-assessment-grid">
                <div className="form-group">
                  <label htmlFor="market_risk_rating">
                    Market Risk
                    <Tooltip content="Risk from market conditions, demand, and competition">
                      <span className="help-icon">?</span>
                    </Tooltip>
                  </label>
                  <select
                    id="market_risk_rating"
                    value={formData.market_risk_rating}
                    onChange={(e) => setFormData({ ...formData, market_risk_rating: e.target.value })}
                    className="form-select"
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                  </select>
                </div>

                <div className="form-group">
                  <label htmlFor="construction_risk_rating">
                    Construction Risk
                    <Tooltip content="Risk from construction complexity, builder experience, and site conditions">
                      <span className="help-icon">?</span>
                    </Tooltip>
                  </label>
                  <select
                    id="construction_risk_rating"
                    value={formData.construction_risk_rating}
                    onChange={(e) => setFormData({ ...formData, construction_risk_rating: e.target.value })}
                    className="form-select"
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                  </select>
                </div>

                <div className="form-group">
                  <label htmlFor="location_risk_rating">
                    Location Risk
                    <Tooltip content="Risk from location factors like infrastructure, amenities, and growth potential">
                      <span className="help-icon">?</span>
                    </Tooltip>
                  </label>
                  <select
                    id="location_risk_rating"
                    value={formData.location_risk_rating}
                    onChange={(e) => setFormData({ ...formData, location_risk_rating: e.target.value })}
                    className="form-select"
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                  </select>
                </div>
              </div>
            </div>
          </div>
        );

      case 4:
        return (
          <div className="form-section">
            <h3>Document Upload</h3>
            <p className="section-description">
              Upload relevant documents to support your project. Required documents are marked with an asterisk (*).
            </p>
            
            <div className="documents-grid">
              {requiredDocs.required_documents?.map((docType) => (
                <div key={docType} className="document-upload-item">
                  <div className="document-header">
                    <label htmlFor={`doc-${docType}`}>
                      {requiredDocs.descriptions?.[docType] || docType.replace(/_/g, ' ')} *
                      <Tooltip content={`This document is required for project approval`}>
                        <span className="help-icon">?</span>
                      </Tooltip>
                    </label>
                    {documents.find(d => d.type === docType) && (
                      <span className="uploaded-badge">✓ Uploaded</span>
                    )}
                  </div>
                  
                  <div className="document-actions">
                    <input
                      type="file"
                      id={`doc-${docType}`}
                      onChange={(e) => handleDocumentChange(e, docType)}
                      accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png"
                      style={{ display: 'none' }}
                    />
                    
                    {documents.find(d => d.type === docType) ? (
                      <div className="uploaded-file">
                        <span className="file-name">{documents.find(d => d.type === docType).name}</span>
                        <button
                          type="button"
                          onClick={() => removeDocument(docType)}
                          className="btn btn-sm btn-danger"
                        >
                          Remove
                        </button>
                      </div>
                    ) : (
                      <label htmlFor={`doc-${docType}`} className="btn btn-outline upload-btn">
                        Choose File
                      </label>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div className="optional-documents">
              <h4>Additional Documents (Optional)</h4>
              <div className="document-upload-item">
                <input
                  type="file"
                  multiple
                  onChange={(e) => {
                    const files = Array.from(e.target.files);
                    files.forEach((file, index) => {
                      handleDocumentChange({ target: { files: [file] } }, `other_${Date.now()}_${index}`);
                    });
                  }}
                  accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png"
                  className="form-input"
                />
                <div className="field-help">
                  You can upload additional supporting documents here (max 50MB per file)
                </div>
              </div>
            </div>

            <InfoMessage message="You can upload documents later if needed. Your project will be saved as a draft until all required documents are uploaded and payment is made." />
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="create-project">
      <div className="create-project-header">
        <h1>Create New Project</h1>
        <p>List your property development project for private credit funding</p>
      </div>

      {/* Progress Steps */}
      <div className="progress-steps">
        <div className={`step ${currentStep >= 1 ? 'active' : ''} ${currentStep > 1 ? 'completed' : ''}`}>
          <div className="step-number">1</div>
          <div className="step-label">Basic Info</div>
        </div>
        <div className={`step ${currentStep >= 2 ? 'active' : ''} ${currentStep > 2 ? 'completed' : ''}`}>
          <div className="step-number">2</div>
          <div className="step-label">Financials</div>
        </div>
        <div className={`step ${currentStep >= 3 ? 'active' : ''} ${currentStep > 3 ? 'completed' : ''}`}>
          <div className="step-number">3</div>
          <div className="step-label">Details</div>
        </div>
        <div className={`step ${currentStep >= 4 ? 'active' : ''} ${currentStep > 4 ? 'completed' : ''}`}>
          <div className="step-number">4</div>
          <div className="step-label">Documents</div>
        </div>
      </div>

      {error && <ErrorMessage message={error} onClose={() => setError('')} />}

      <form className="project-form multi-step">
        {renderStepContent()}

        <div className="form-actions">
          <div className="actions-left">
            <button 
              type="button" 
              onClick={() => {
                localStorage.setItem('project_draft', JSON.stringify(formData));
                showToast('Your project has been saved as a draft', 'success');
              }}
              className="btn btn-outline"
            >
              Save Draft
            </button>
          </div>

          <div className="actions-right">
            {currentStep > 1 && (
              <button type="button" onClick={handlePrevious} className="btn btn-outline">
                Previous
              </button>
            )}
            
            {currentStep < 4 ? (
              <button type="button" onClick={handleNext} className="btn btn-primary">
                Next
              </button>
            ) : (
              <button 
                type="button" 
                onClick={handleSubmit} 
                disabled={loading || uploadingDocs}
                className="btn btn-primary"
              >
                {loading ? 'Creating Project...' : 'Create Project'}
              </button>
            )}
          </div>
        </div>
      </form>
    </div>
  );
};

// ===========================
// MY PROJECTS PAGE
// ===========================

// Enhanced My Projects Component with Mobile-First Design

const MyProjects = () => {
  const api = useApi();
  const navigate = useNavigate();
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [sortBy, setSortBy] = useState('created_at');

  useEffect(() => {
    fetchProjects();
  }, []);

  const fetchProjects = async () => {
    try {
      const data = await api.getProjects();
      setProjects(data);
    } catch (err) {
      console.error('Failed to fetch projects:', err);
    } finally {
      setLoading(false);
    }
  };

  const filteredProjects = projects.filter(project => {
    switch (filter) {
      case 'published':
        return project.payment_status === 'paid';
      case 'draft':
        return project.payment_status === 'unpaid';
      default:
        return true;
    }
  }).sort((a, b) => {
    switch (sortBy) {
      case 'loan_amount':
        return b.loan_amount - a.loan_amount;
      case 'title':
        return a.title.localeCompare(b.title);
      default:
        return new Date(b.created_at) - new Date(a.created_at);
    }
  });

  // Mobile Project Card Component
  const MobileProjectCard = ({ project }) => (
    <div className="mobile-project-card">
      <div className="mobile-card-header">
        <h3 className="mobile-project-title">{project.title}</h3>
        <div className="mobile-project-status">
          <span className={`mobile-status-badge ${project.payment_status === 'paid' ? 'status-published' : 'status-draft'}`}>
            {project.payment_status === 'paid' ? 'Published' : 'Draft'}
          </span>
          {project.documents_complete && (
            <div className="mobile-docs-status complete">
              <svg viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
            </div>
          )}
        </div>
      </div>
      
      <div className="mobile-card-content">
        <div className="mobile-detail-item full-width">
          <span className="mobile-detail-label">Location</span>
          <span className="mobile-detail-value">{project.suburb}</span>
        </div>
        
        <div className="mobile-detail-item">
          <span className="mobile-detail-label">Loan Amount</span>
          <span className="mobile-detail-value amount">{formatCurrency(project.loan_amount)}</span>
        </div>
        
        <div className="mobile-detail-item">
          <span className="mobile-detail-label">Created</span>
          <span className="mobile-detail-value">{formatDate(project.created_at)}</span>
        </div>
      </div>
      
      <div className="mobile-card-actions">
        <button
          onClick={() => navigate(`/project/${project.id}`)}
          className="btn btn-outline"
        >
          <svg className="btn-icon" viewBox="0 0 20 20" fill="currentColor">
            <path d="M10 12a2 2 0 100-4 2 2 0 000 4z" />
            <path fillRule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clipRule="evenodd" />
          </svg>
          View
        </button>
        {project.payment_status === 'unpaid' && (
          <button
            onClick={() => navigate(`/project/${project.id}/edit`)}
            className="btn btn-primary"
          >
            <svg className="btn-icon" viewBox="0 0 20 20" fill="currentColor">
              <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
            </svg>
            Edit
          </button>
        )}
      </div>
    </div>
  );

  if (loading) return <LoadingSpinner />;

  return (
    <div className="my-projects-page">
      <div className="page-header">
        <h1>My Projects</h1>
        <Link to="/create-project" className="btn btn-primary">
          <span>+</span> Create New Project
        </Link>
      </div>

      {projects.length === 0 ? (
        <EmptyState 
          icon="📁"
          title="No projects yet"
          message="Create your first project to start connecting with funders."
          action={
            <Link to="/create-project" className="btn btn-primary">
              Create Project
            </Link>
          }
        />
      ) : (
        <>
          {/* Show warning if there are drafts */}
          {projects.some(p => p.payment_status === 'unpaid') && (
            <div className="draft-warning">
              <span className="draft-warning-icon">⚠️</span>
              <div className="draft-warning-content">
                <h4>Complete Your Draft Projects</h4>
                <p>Upload all required documents before publishing. Projects cannot be published without complete documentation.</p>
              </div>
            </div>
          )}

          <div className="projects-controls">
            <div className="filter-tabs">
              <button 
                className={`filter-tab ${filter === 'all' ? 'active' : ''}`}
                onClick={() => setFilter('all')}
              >
                All ({projects.length})
              </button>
              <button 
                className={`filter-tab ${filter === 'published' ? 'active' : ''}`}
                onClick={() => setFilter('published')}
              >
                Published ({projects.filter(p => p.payment_status === 'paid').length})
              </button>
              <button 
                className={`filter-tab ${filter === 'draft' ? 'active' : ''}`}
                onClick={() => setFilter('draft')}
              >
                Drafts ({projects.filter(p => p.payment_status === 'unpaid').length})
              </button>
            </div>
            
            <select 
              value={sortBy} 
              onChange={(e) => setSortBy(e.target.value)}
              className="sort-select"
            >
              <option value="created_at">Newest First</option>
              <option value="loan_amount">Loan Amount</option>
              <option value="title">Title A-Z</option>
            </select>
          </div>

          {/* Mobile Cards Layout */}
          <div className="mobile-projects-grid">
            {filteredProjects.map(project => (
              <MobileProjectCard key={project.id} project={project} />
            ))}
          </div>

          {/* Desktop Table Layout */}
          <div className="projects-table">
            <table>
              <thead>
                <tr>
                  <th>Project Title</th>
                  <th>Location</th>
                  <th>Loan Amount</th>
                  <th>Documents</th>
                  <th>Status</th>
                  <th>Created</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredProjects.map(project => (
                  <tr key={project.id}>
                    <td className="project-title-cell">
                      <strong>{project.title}</strong>
                    </td>
                    <td>{project.suburb}</td>
                    <td>{formatCurrency(project.loan_amount)}</td>
                    <td>
                      {project.documents_complete ? (
                        <span className="docs-status complete">
                          <svg viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                          </svg>
                        </span>
                      ) : (
                        <span className="docs-status incomplete">
                          <svg viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                          </svg>
                        </span>
                      )}
                    </td>
                    <td>
                      <StatusBadge status={project.payment_status === 'paid' ? 'Published' : 'Draft'} />
                    </td>
                    <td>{formatDate(project.created_at)}</td>
                    <td className="actions-cell">
                      <button
                        onClick={() => navigate(`/project/${project.id}`)}
                        className="btn btn-sm btn-outline"
                      >
                        <svg className="btn-icon" viewBox="0 0 20 20" fill="currentColor">
                          <path d="M10 12a2 2 0 100-4 2 2 0 000 4z" />
                          <path fillRule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clipRule="evenodd" />
                        </svg>
                        View
                      </button>
                      {project.payment_status === 'unpaid' && (
                        <button
                          onClick={() => navigate(`/project/${project.id}/edit`)}
                          className="btn btn-sm btn-primary"
                        >
                          <svg className="btn-icon" viewBox="0 0 20 20" fill="currentColor">
                            <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
                          </svg>
                          Edit
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
};


// ===========================
// PROJECT DETAIL PAGE
// ===========================

const ProjectDetail = () => {
  const api = useApi();
  const { id } = useParams();
  const { user } = useApp();
  const navigate = useNavigate();
  const location = useLocation();
  const { addNotification } = useNotifications();
  const [project, setProject] = useState(null);
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('overview');
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [previewDocument, setPreviewDocument] = useState(null);
  
  // Check if this is an admin review
  const searchParams = new URLSearchParams(location.search);
  const isAdminReview = searchParams.get('admin_review') === 'true';

  useEffect(() => {
    let mounted = true;
    
    const fetchProjectDetails = async () => {
      if (!id) return;
      
      console.log('Fetching project details for ID:', id);
      setLoading(true);
      setError('');
      
      try {
        console.log('Calling API for project:', id);
        const projectData = await api.getProject(id);
        console.log('Project data received:', projectData);
        
        if (!mounted) return;
        
        if (!projectData) {
          throw new Error('Project not found');
        }
        
        setProject(projectData);
        
        // Only fetch documents if we have a valid project
        try {
          console.log('Fetching documents for project:', id);
          const docsData = await api.getProjectDocuments(id);
          console.log('Documents received:', docsData);
          if (mounted) {
            setDocuments(docsData || []);
          }
        } catch (docErr) {
          console.error('Failed to fetch documents:', docErr);
          if (mounted) {
            setDocuments([]);
          }
        }
        
      } catch (err) {
        console.error('Failed to fetch project details:', err);
        if (mounted) {
          setError(err.message || 'Failed to load project');
          setProject(null);
          setDocuments([]);
        }
      } finally {
        if (mounted) {
          console.log('Setting loading to false in ProjectDetail');
          setLoading(false);
        }
      }
    };

    fetchProjectDetails();
    
    return () => {
      mounted = false;
    };
  }, [id]); // REMOVED api from dependencies

  const handlePaymentSuccess = async () => {
    setShowPaymentModal(false);
    // Message is already shown by PaymentModal component
    
    // Re-fetch project details to show updated status
    setLoading(true);
    try {
      const projectData = await api.getProject(id);
      if (projectData) {
        setProject(projectData);
        try {
          const docsData = await api.getProjectDocuments(id);
          setDocuments(docsData || []);
        } catch (docErr) {
          console.error('Failed to fetch documents:', docErr);
          setDocuments([]);
        }
      }
    } catch (err) {
      console.error('Failed to refresh project:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleDocumentPreview = async (doc) => {
    if (doc.mime_type?.includes('pdf')) {
      setPreviewDocument(doc);
    } else {
      try {
        const blob = await api.downloadDocument(doc.file_path);
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = doc.file_name;
        a.click();
        window.URL.revokeObjectURL(url);
      } catch (err) {
        addNotification({
          type: 'error',
          title: 'Download Failed',
          message: 'Unable to download document'
        });
      }
    }
  };

  // EARLY RETURNS - before defining tabs
  if (loading) return <LoadingSpinner />;
  if (error) return <ErrorMessage message={error} onClose={() => navigate(-1)} />;
  if (!project) return <div>Project not found</div>;


  
if (user.role === 'funder' && project.payment_status === 'paid') {
  // Check if funder has access
  if (!project.access_status || project.access_status === 'pending' || project.access_status === 'declined') {
    return (
      <div className="project-detail-page">
        <div className="access-denied" style={{
          textAlign: 'center',
          padding: '60px 20px',
          maxWidth: '600px',
          margin: '0 auto'
        }}>
          <h2>Access Required</h2>
          <p style={{ marginBottom: '30px', color: '#6b7280' }}>
            You need to request access from the developer to view this project's full details.
          </p>
          <Link to="/projects" className="btn btn-primary">
            Back to Projects
          </Link>
        </div>
      </div>
    );
  }
}

// NOW define tabs - after we know documents is loaded
const tabs = [
  { id: 'overview', label: 'Overview' },
  { id: 'financials', label: 'Financials' },
  { id: 'documents', label: `Documents (${documents?.length || 0})` },
  { id: 'timeline', label: 'Timeline & Milestones' }
];

  // Rest of component remains the same...
  return (
    <div className="project-detail-page">
      {/* Breadcrumb Navigation */}
      <div className="breadcrumb">
        <Link to="/my-projects" className="breadcrumb-link">My Projects</Link>
        <svg className="breadcrumb-arrow" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
        </svg>
        <span className="breadcrumb-current">{project.title}</span>
      </div>

     {/* Project Header */}
     <div className="project-header">
       <div className="header-content">
         <div className="header-top">
           <h1 className="project-title">{project.title}</h1>
           <div className="header-actions">
             {user.role === 'borrower' && project.payment_status === 'unpaid' && (
               <>
                 <button 
                   onClick={() => navigate(`/project/${project.id}/edit`)}
                   className="btn btn-outline"
                 >
                   Edit Project
                 </button>
                 <button 
                   onClick={() => setShowPaymentModal(true)}
                   disabled={!project.documents_complete}
                   className="btn btn-primary"
                   title={!project.documents_complete ? 'Upload all required documents first' : ''}
                 >
                   Pay to Publish ($499)
                 </button>
               </>
             )}
             {user.role === 'borrower' && project.payment_status === 'payment_pending' && (
               <button 
                 disabled
                 className="btn btn-primary disabled"
               >
                 Under Admin Review
               </button>
             )}
             {user.role === 'borrower' && project.payment_status === 'paid' && !project.visible && (
               <>
                 <button 
                   onClick={() => navigate(`/project/${project.id}/edit`)}
                   className="btn btn-outline"
                 >
                   Edit Project
                 </button>
                 <button 
                   onClick={() => {
                     addNotification({
                       type: 'info',
                       title: 'Submit for Re-review',
                       message: 'Please address the admin feedback and save your changes to submit for re-review.'
                     });
                     navigate(`/project/${project.id}/edit?resubmit=true`);
                   }}
                   className="btn btn-primary"
                 >
                   Submit for Re-review
                 </button>
               </>
             )}
             {user.role === 'admin' && isAdminReview && (
               <button 
                 onClick={() => {
                   window.close();
                   // Fallback if window.close doesn't work
                   navigate('/admin');
                 }}
                 className="btn btn-outline"
               >
                 ← Return to Admin Panel
               </button>
             )}
           </div>
         </div>
         
         <div className="header-info">
           <div className="info-item">
             <svg className="info-icon" viewBox="0 0 20 20" fill="currentColor">
               <path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
             </svg>
             <span>{project.location}</span>
           </div>
           <StatusBadge status={
             project.payment_status === 'paid' && project.visible ? 'Published' : 
             project.payment_status === 'payment_pending' ? 'Under Review' :
             project.payment_status === 'paid' && !project.visible ? 'Rejected' :
             'Draft'
           } />
           {project.documents_complete && <StatusBadge status="Docs Complete" />}
         </div>
       </div>

       {/* Quick Stats Bar */}
       <div className="quick-stats">
         <div className="stat">
           <label>Loan Amount</label>
           <span className="stat-value">{formatCurrency(project.loan_amount)}</span>
         </div>
         <div className="stat-divider"></div>
         <div className="stat">
           <label>Interest Rate</label>
           <span className="stat-value">{project.interest_rate || 'TBD'}%</span>
         </div>
         <div className="stat-divider"></div>
         <div className="stat">
           <label>Loan Term</label>
           <span className="stat-value">{project.loan_term || 'TBD'} months</span>
         </div>
         <div className="stat-divider"></div>
         <div className="stat">
           <label>LVR</label>
           <span className="stat-value">{project.lvr ? `${project.lvr.toFixed(1)}%` : 'N/A'}</span>
         </div>
       </div>
     </div>

     {/* Rejection Feedback Notice */}
     {console.log('Project rejection debug:', {
       last_rejection_reason: project.last_rejection_reason,
       payment_status: project.payment_status,
       visible: project.visible,
       submission_status: project.submission_status
     })}
     {project.last_rejection_reason && (project.payment_status === 'unpaid' || (project.payment_status === 'paid' && !project.visible)) && (
       <div className="rejection-notice" style={{ margin: '20px 0' }}>
         <div className="rejection-header">
           <svg className="rejection-icon" viewBox="0 0 20 20" fill="currentColor">
             <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
           </svg>
           <span className="rejection-label">Admin Feedback</span>
         </div>
         <div className="rejection-reason">
           {project.last_rejection_reason}
         </div>
         {project.rejection_date && (
           <div className="rejection-date">
             Received: {new Date(project.rejection_date).toLocaleDateString()}
           </div>
         )}
         {project.payment_status === 'paid' && (
           <div className="rejection-note">
             Note: You have already paid for this project. Please address the feedback and submit for re-review.
           </div>
         )}
       </div>
     )}

     {/* Tabs */}
     <div className="tabs-container">
       <Tabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab} />
     </div>

     {/* Tab Content */}
     <div className="tab-content">
       {activeTab === 'overview' && (
         <div className="overview-grid">
           {/* Project Summary Card */}
           <div className="content-card">
             <h3>Project Summary</h3>
             <p className="project-description">
               {project.description || 'No description provided.'}
             </p>
             
             <div className="detail-grid">
               <div className="detail-item">
                 <label>Property Type</label>
                 <span>{project.property_type}</span>
               </div>
               <div className="detail-item">
                 <label>Development Stage</label>
                 <span>{project.development_stage}</span>
               </div>
               <div className="detail-item">
                 <label>Project Size</label>
                 <span>{project.project_size_sqm ? `${formatNumber(project.project_size_sqm)} sqm` : 'N/A'}</span>
               </div>
               <div className="detail-item">
                 <label>
                   {project.property_type === 'Commercial' ? 'Number of Tenancies' : 
                    project.property_type === 'Industrial' ? 'Loading Docks' : 
                    'Number of Units'}
                 </label>
                 <span>{project.number_of_units ? formatNumber(project.number_of_units) : 'N/A'}</span>
               </div>
               {project.property_type !== 'Industrial' && (
                 <div className="detail-item">
                   <label>Levels</label>
                   <span>{project.number_of_levels || 'N/A'}</span>
                 </div>
               )}
               <div className="detail-item">
                 <label>{project.property_type === 'Industrial' ? 'Truck Parking Bays' : 'Car Spaces'}</label>
                 <span>{project.car_spaces || 'N/A'}</span>
               </div>
             </div>
           </div>

           {/* Planning & Compliance Card */}
           <div className="content-card">
             <h3>Planning & Compliance</h3>
             <div className="detail-grid">
               <div className="detail-item">
                 <label>Zoning</label>
                 <span>{project.zoning || 'N/A'}</span>
               </div>
               <div className="detail-item">
                 <label>Planning Status</label>
                 <span>{project.planning_permit_status || 'Not Started'}</span>
               </div>
               <div className="detail-item">
                 <label>Expected Start</label>
                 <span>{project.expected_start_date ? formatDate(project.expected_start_date) : 'TBD'}</span>
               </div>
               <div className="detail-item">
                 <label>Expected Completion</label>
                 <span>{project.expected_completion_date ? formatDate(project.expected_completion_date) : 'TBD'}</span>
               </div>
             </div>
           </div>

           {/* Risk Assessment Card */}
           {(project.market_risk_rating || project.construction_risk_rating || project.location_risk_rating) && (
             <div className="content-card">
               <h3>Risk Assessment</h3>
               <div className="risk-grid">
                 <div className="risk-item">
                   <label>Market Risk</label>
                   <div className={`risk-badge risk-${project.market_risk_rating}`}>
                     {project.market_risk_rating?.toUpperCase()}
                   </div>
                 </div>
                 <div className="risk-item">
                   <label>Construction Risk</label>
                   <div className={`risk-badge risk-${project.construction_risk_rating}`}>
                     {project.construction_risk_rating?.toUpperCase()}
                   </div>
                 </div>
                 <div className="risk-item">
                   <label>Location Risk</label>
                   <div className={`risk-badge risk-${project.location_risk_rating}`}>
                     {project.location_risk_rating?.toUpperCase()}
                   </div>
                 </div>
               </div>
             </div>
           )}
         </div>
       )}

       {activeTab === 'financials' && (
         <div className="financials-grid">
           {/* Loan Structure Card */}
           <div className="content-card">
             <h3>Loan Structure</h3>
             <div className="financial-detail">
               <label>Loan Amount Required</label>
               <span className="value primary">{formatCurrency(project.loan_amount)}</span>
             </div>
             <div className="financial-detail">
               <label>Interest Rate</label>
               <span className="value">{project.interest_rate || 'TBD'}% per annum</span>
             </div>
             <div className="financial-detail">
               <label>Loan Term</label>
               <span className="value">{project.loan_term || 'TBD'} months</span>
             </div>
             <div className="financial-detail">
               <label>Monthly Interest</label>
               <span className="value">
                 {project.interest_rate && project.loan_amount 
                   ? formatCurrency((project.loan_amount * project.interest_rate / 100) / 12)
                   : 'TBD'}
               </span>
             </div>
           </div>

           {/* Project Economics Card */}
           <div className="content-card">
             <h3>Project Economics</h3>
             <div className="financial-detail">
               <label>Total Project Cost</label>
               <span className="value">{formatCurrency(project.total_project_cost || 0)}</span>
             </div>
             <div className="financial-detail">
               <label>Land Value</label>
               <span className="value">{formatCurrency(project.land_value || 0)}</span>
             </div>
             <div className="financial-detail">
               <label>Construction Cost</label>
               <span className="value">{formatCurrency(project.construction_cost || 0)}</span>
             </div>
             <div className="financial-detail">
               <label>Equity Contribution</label>
               <span className="value">{formatCurrency(project.equity_contribution || 0)}</span>
             </div>
           </div>

           {/* Key Metrics Card */}
           <div className="content-card">
             <h3>Key Metrics</h3>
             <div className="metrics-grid">
               <div className="metric">
                 <label>LVR</label>
                 <span className="metric-value">{project.lvr ? `${project.lvr.toFixed(1)}%` : 'N/A'}</span>
                 <div className="metric-bar">
                   <div 
                     className="metric-fill"
                     style={{ width: `${Math.min(project.lvr || 0, 100)}%` }}
                   ></div>
                 </div>
               </div>
               <div className="metric">
                 <label>Profit Margin</label>
                 <span className="metric-value">
                   {project.expected_profit && project.total_project_cost
                     ? `${((project.expected_profit / project.total_project_cost) * 100).toFixed(1)}%`
                     : 'N/A'}
                 </span>
               </div>
               <div className="metric">
                 <label>Expected GDC</label>
                 <span className="metric-value">{formatCurrency(project.expected_gdc || 0)}</span>
               </div>
               <div className="metric">
                 <label>Expected Profit</label>
                 <span className="metric-value">{formatCurrency(project.expected_profit || 0)}</span>
               </div>
             </div>
           </div>
         </div>
       )}

       {activeTab === 'documents' && (
         <div className="documents-section">
           {documents.length === 0 ? (
             <EmptyState 
               icon={
                 <svg className="empty-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                   <path d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                 </svg>
               }
               title="No documents uploaded"
               message="Upload documents to complete your project listing"
               action={
                 user.role === 'borrower' && project.payment_status === 'unpaid' && (
                   <button 
                     onClick={() => navigate(`/project/${project.id}/edit`)}
                     className="btn btn-primary"
                   >
                     Upload Documents
                   </button>
                 )
               }
             />
           ) : (
             <div className="documents-grid">
               {documents.map(doc => (
                 <div key={doc.id} className="document-card">
                   <div className="doc-icon">
                     <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                       <path d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                     </svg>
                   </div>
                   <div className="doc-info">
                     <h4>{doc.file_name}</h4>
                     <p>{doc.document_type.replace(/_/g, ' ')}</p>
                     <p className="doc-meta">
                       {formatDate(doc.uploaded_at)}
                     </p>
                   </div>
                   <button 
                     onClick={() => handleDocumentPreview(doc)}
                     className="btn btn-sm btn-outline"
                   >
                     View
                   </button>
                 </div>
               ))}
             </div>
           )}
         </div>
       )}

       {activeTab === 'timeline' && (
         <div className="timeline-section">
           <div className="timeline">
             <div className="timeline-item completed">
               <div className="timeline-marker"></div>
               <div className="timeline-content">
                 <h4>Project Created</h4>
                 <p>{formatDateTime(project.created_at)}</p>
               </div>
             </div>
             
             {project.payment_status === 'paid' && (
               <div className="timeline-item completed">
                 <div className="timeline-marker"></div>
                 <div className="timeline-content">
                   <h4>Project Published</h4>
                   <p>Visible to all verified funders</p>
                   <p className="timeline-date">{formatDateTime(project.updated_at)}</p>
                 </div>
               </div>
             )}
             
             {documents.length > 0 && (
               <div className="timeline-item completed">
                 <div className="timeline-marker"></div>
                 <div className="timeline-content">
                   <h4>Documents Uploaded</h4>
                   <p>{documents.length} documents added</p>
                   <p className="timeline-date">{formatDateTime(documents[0].uploaded_at)}</p>
                 </div>
               </div>
             )}
             
             <div className="timeline-item future">
               <div className="timeline-marker"></div>
               <div className="timeline-content">
                 <h4>Expected Construction Start</h4>
                 <p>{project.expected_start_date ? formatDate(project.expected_start_date) : 'TBD'}</p>
               </div>
             </div>
             
             <div className="timeline-item future">
               <div className="timeline-marker"></div>
               <div className="timeline-content">
                 <h4>Expected Completion</h4>
                 <p>{project.expected_completion_date ? formatDate(project.expected_completion_date) : 'TBD'}</p>
               </div>
             </div>
           </div>
         </div>
       )}
     </div>

     <Elements stripe={stripePromise}>
       <PaymentModal 
         isOpen={showPaymentModal}
         onClose={() => setShowPaymentModal(false)}
         project={project}
         onSuccess={handlePaymentSuccess}
       />
     </Elements>

     {previewDocument && (
       <DocumentPreviewModal 
         document={previewDocument}
         onClose={() => setPreviewDocument(null)}
       />
     )}
   </div>
 );
};

// ===========================
// EDIT PROJECT PAGE
// ===========================

const EditProject = () => {
  const { id } = useParams();
  const location = useLocation();
  const api = useApi();
  const navigate = useNavigate();
  const { addNotification } = useNotifications();
  const { showToast } = useToast();
  const [currentStep, setCurrentStep] = useState(1);
  const [project, setProject] = useState(null);
  const [documents, setDocuments] = useState([]);
  const [newDocuments, setNewDocuments] = useState([]);
  const [requiredDocs, setRequiredDocs] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingDocs, setUploadingDocs] = useState(false);
  const [error, setError] = useState('');
  const [validationErrors, setValidationErrors] = useState({});
  
  // Check if we're in resubmit flow
  const searchParams = new URLSearchParams(location.search);
  const isResubmitFlow = searchParams.get('resubmit') === 'true';

  useEffect(() => {
    fetchData();
  }, [id]);

  const fetchData = async () => {
    try {
      const [projectData, docsData, requiredDocsData] = await Promise.all([
        api.getProject(id),
        api.getProjectDocuments(id),
        api.getRequiredDocuments()
      ]);
      setProject(projectData);
      setDocuments(docsData);
      setRequiredDocs(requiredDocsData);
    } catch (err) {
      setError('Failed to load project');
    } finally {
      setLoading(false);
    }
  };

  const handleNext = () => {
    const errors = validateStep(currentStep);
    if (Object.keys(errors).length === 0) {
      setCurrentStep(currentStep + 1);
      setValidationErrors({});
    } else {
      setValidationErrors(errors);
      setError('Please fix the errors before proceeding');
    }
  };

  const handlePrevious = () => {
    setCurrentStep(currentStep - 1);
    setError('');
    setValidationErrors({});
  };

  const validateStep = (step) => {
    const errors = {};
    
    switch (step) {
      case 1:
        if (!project.title) errors.title = 'Project title is required';
        if (!project.location) errors.location = 'Location is required';
        if (!project.suburb) errors.suburb = 'Suburb is required';
        if (!project.loan_amount) errors.loan_amount = 'Loan amount is required';
        break;
      case 2:
        if (!project.total_project_cost) errors.total_project_cost = 'Total project cost is required';
        if (!project.equity_contribution) errors.equity_contribution = 'Equity contribution is required';
        break;
    }
    
    return errors;
  };

  const handleSubmit = async () => {
    setSaving(true);
    setError('');

    try {
      // Update project data
      await api.updateProject(id, {
        title: project.title,
        description: project.description,
        location: project.location,
        suburb: project.suburb,
        loan_amount: parseInt(project.loan_amount),
        interest_rate: project.interest_rate ? parseFloat(project.interest_rate) : null,
        loan_term: project.loan_term ? parseInt(project.loan_term) : null,
        property_type: project.property_type,
        development_stage: project.development_stage,
        total_project_cost: project.total_project_cost ? parseInt(project.total_project_cost) : null,
        equity_contribution: project.equity_contribution ? parseInt(project.equity_contribution) : null,
        land_value: project.land_value ? parseInt(project.land_value) : null,
        construction_cost: project.construction_cost ? parseInt(project.construction_cost) : null,
        expected_gdc: project.expected_gdc ? parseInt(project.expected_gdc) : null,
        expected_profit: project.expected_profit ? parseInt(project.expected_profit) : null,
        project_size_sqm: project.project_size_sqm ? parseInt(project.project_size_sqm) : null,
        number_of_units: project.number_of_units ? parseInt(project.number_of_units) : null,
        number_of_levels: project.number_of_levels ? parseInt(project.number_of_levels) : null,
        car_spaces: project.car_spaces ? parseInt(project.car_spaces) : null,
        zoning: project.zoning,
        planning_permit_status: project.planning_permit_status,
        expected_start_date: project.expected_start_date,
        expected_completion_date: project.expected_completion_date,
        market_risk_rating: project.market_risk_rating,
        construction_risk_rating: project.construction_risk_rating,
        location_risk_rating: project.location_risk_rating
      });

      // Upload new documents if any
      if (newDocuments.length > 0) {
        await uploadDocuments();
      }

      // If this is a resubmit flow and project is rejected, call resubmit API
      if (isResubmitFlow && project.submission_status === 'rejected') {
        await api.resubmitProject(id);
        
        showToast('Your project has been updated and resubmitted for admin review.', 'success');
      } else {
        showToast('Your project has been updated successfully!', 'success');
      }
      
      navigate(`/project/${id}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const uploadDocuments = async () => {
    setUploadingDocs(true);
    try {
      const formData = new FormData();
      const documentTypes = [];
      
      newDocuments.forEach((doc) => {
        formData.append('documents', doc.file);
        documentTypes.push(doc.type);
      });
      
      formData.append('document_types', JSON.stringify(documentTypes));
      
      await api.uploadDocuments(id, formData);
    } catch (err) {
      console.error('Document upload error:', err);
    } finally {
      setUploadingDocs(false);
    }
  };

  const handleDocumentChange = (e, docType) => {
    const file = e.target.files[0];
    if (file) {
      if (file.size > 50 * 1024 * 1024) {
        addNotification({
          type: 'error',
          title: 'File Too Large',
          message: 'Maximum file size is 50MB'
        });
        return;
      }
      
      setNewDocuments(prev => [
        ...prev.filter(d => d.type !== docType),
        { type: docType, file: file, name: file.name }
      ]);
    }
  };

  const removeNewDocument = (docType) => {
    setNewDocuments(prev => prev.filter(d => d.type !== docType));
  };

  const handleDeleteDocument = async (docId) => {
    if (window.confirm('Are you sure you want to delete this document?')) {
      try {
        await api.deleteDocument(docId);
        setDocuments(documents.filter(d => d.id !== docId));
        addNotification({
          type: 'success',
          title: 'Document Deleted',
          message: 'Document has been removed successfully'
        });
      } catch (err) {
        addNotification({
          type: 'error',
          title: 'Delete Failed',
          message: 'Failed to delete document'
        });
      }
    }
  };

  const calculateLVR = () => {
    if (project?.loan_amount && project?.land_value) {
      return ((parseInt(project.loan_amount) / parseInt(project.land_value)) * 100).toFixed(1);
    }
    return null;
  };

  const calculateICR = () => {
    if (project?.expected_profit && project?.loan_amount && project?.interest_rate && project?.loan_term) {
      const annualInterest = (parseInt(project.loan_amount) * parseFloat(project.interest_rate)) / 100;
      const annualProfit = parseInt(project.expected_profit) / (parseInt(project.loan_term) / 12);
      return (annualProfit / annualInterest).toFixed(2);
    }
    return null;
  };

  if (loading) return <LoadingSpinner />;
  if (!project) return <div>Project not found</div>;

  const renderStepContent = () => {
    switch (currentStep) {
      case 1:
        return (
          <div className="form-section">
            <h3>Basic Project Information</h3>
            
            <div className="form-group">
              <label>Project Title *</label>
              <input
                type="text"
                value={project.title}
                onChange={(e) => setProject({ ...project, title: e.target.value })}
                required
                className={`form-input ${validationErrors.title ? 'error' : ''}`}
              />
              {validationErrors.title && (
                <span className="field-error">{validationErrors.title}</span>
              )}
            </div>

            <div className="form-group">
              <label>Project Description</label>
              <textarea
                value={project.description || ''}
                onChange={(e) => setProject({ ...project, description: e.target.value })}
                className="form-textarea"
                rows="6"
              />
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Full Address *</label>
                <input
                  type="text"
                  value={project.location}
                  onChange={(e) => setProject({ ...project, location: e.target.value })}
                  required
                  className={`form-input ${validationErrors.location ? 'error' : ''}`}
                />
                {validationErrors.location && (
                  <span className="field-error">{validationErrors.location}</span>
                )}
              </div>

              <div className="form-group">
                <label>Suburb *</label>
                <input
                  type="text"
                  value={project.suburb}
                  onChange={(e) => setProject({ ...project, suburb: e.target.value })}
                  required
                  className={`form-input ${validationErrors.suburb ? 'error' : ''}`}
                />
                {validationErrors.suburb && (
                  <span className="field-error">{validationErrors.suburb}</span>
                )}
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Property Type</label>
                <select
                  value={project.property_type || 'Residential'}
                  onChange={(e) => setProject({ ...project, property_type: e.target.value })}
                  className="form-select"
                >
                  <option value="Residential">Residential</option>
                  <option value="Commercial">Commercial</option>
                  <option value="Mixed Use">Mixed Use</option>
                  <option value="Industrial">Industrial</option>
                  <option value="Retail">Retail</option>
                </select>
              </div>

              <div className="form-group">
                <label>Development Stage</label>
                <select
                  value={project.development_stage || 'Planning'}
                  onChange={(e) => setProject({ ...project, development_stage: e.target.value })}
                  className="form-select"
                >
                  <option value="Planning">Planning</option>
                  <option value="Pre-Construction">Pre-Construction</option>
                  <option value="Construction">Construction</option>
                  <option value="Near Completion">Near Completion</option>
                </select>
              </div>
            </div>

            <div className="form-group">
              <label>Loan Amount Required (AUD) *</label>
              <NumberInput
                value={project.loan_amount}
                onChange={(value) => setProject({ ...project, loan_amount: value })}
                prefix="$"
                min={100000}
                className={validationErrors.loan_amount ? 'error' : ''}
              />
              {validationErrors.loan_amount && (
                <span className="field-error">{validationErrors.loan_amount}</span>
              )}
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Target Interest Rate (%)</label>
                <NumberInput
                  value={project.interest_rate || ''}
                  onChange={(value) => setProject({ ...project, interest_rate: value })}
                  suffix="%"
                  step={0.1}
                  min={0}
                />
              </div>

              <div className="form-group">
                <label>Loan Term (months)</label>
                <NumberInput
                  value={project.loan_term || ''}
                  onChange={(value) => setProject({ ...project, loan_term: value })}
                  suffix="months"
                  min={1}
                />
              </div>
            </div>
          </div>
        );

      case 2:
        return (
          <div className="form-section">
            <h3>Financial Details</h3>
            
            <div className="form-row">
              <div className="form-group">
                <label>Total Project Cost (AUD) *</label>
                <NumberInput
                  value={project.total_project_cost || ''}
                  onChange={(value) => setProject({ ...project, total_project_cost: value })}
                  prefix="$"
                  min={1}
                  className={validationErrors.total_project_cost ? 'error' : ''}
                />
                {validationErrors.total_project_cost && (
                  <span className="field-error">{validationErrors.total_project_cost}</span>
                )}
              </div>

              <div className="form-group">
                <label>Equity Contribution (AUD) *</label>
                <NumberInput
                  value={project.equity_contribution || ''}
                  onChange={(value) => setProject({ ...project, equity_contribution: value })}
                  prefix="$"
                  min={0}
                  className={validationErrors.equity_contribution ? 'error' : ''}
                />
                {validationErrors.equity_contribution && (
                  <span className="field-error">{validationErrors.equity_contribution}</span>
                )}
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Land Value (AUD)</label>
                <NumberInput
                  value={project.land_value || ''}
                  onChange={(value) => setProject({ ...project, land_value: value })}
                  prefix="$"
                  min={0}
                />
              </div>

              <div className="form-group">
                <label>Construction Cost (AUD)</label>
                <NumberInput
                  value={project.construction_cost || ''}
                  onChange={(value) => setProject({ ...project, construction_cost: value })}
                  prefix="$"
                  min={0}
                />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Expected GDC (AUD)</label>
                <NumberInput
                  value={project.expected_gdc || ''}
                  onChange={(value) => setProject({ ...project, expected_gdc: value })}
                  prefix="$"
                  min={0}
                />
              </div>

              <div className="form-group">
                <label>Expected Profit (AUD)</label>
                <NumberInput
                  value={project.expected_profit || ''}
                  onChange={(value) => setProject({ ...project, expected_profit: value })}
                  prefix="$"
                  min={0}
                />
              </div>
            </div>

            <div className="financial-metrics">
              <h4>Key Financial Metrics</h4>
              <div className="metrics-grid">
                <div className="metric-item">
                  <label>LVR (Loan to Value Ratio)</label>
                  <div className="metric-value">{calculateLVR() || 'N/A'}%</div>
                </div>
                <div className="metric-item">
                  <label>ICR (Interest Coverage Ratio)</label>
                  <div className="metric-value">{calculateICR() || 'N/A'}</div>
                </div>
                <div className="metric-item">
                  <label>Debt/Equity Ratio</label>
                  <div className="metric-value">
                    {project.loan_amount && project.equity_contribution 
                      ? (parseInt(project.loan_amount) / parseInt(project.equity_contribution)).toFixed(2)
                      : 'N/A'}
                  </div>
                </div>
              </div>
            </div>
          </div>
        );

      case 3:
        return (
          <div className="form-section">
            <h3>Project Details</h3>
            
            <div className="form-row">
              <div className="form-group">
                <label>Project Size (sqm)</label>
                <NumberInput
                  value={project.project_size_sqm || ''}
                  onChange={(value) => setProject({ ...project, project_size_sqm: value })}
                  suffix="sqm"
                  min={0}
                />
              </div>

              <div className="form-group">
                <label>Number of Units</label>
                <NumberInput
                  value={project.number_of_units || ''}
                  onChange={(value) => setProject({ ...project, number_of_units: value })}
                  min={0}
                />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Number of Levels</label>
                <NumberInput
                  value={project.number_of_levels || ''}
                  onChange={(value) => setProject({ ...project, number_of_levels: value })}
                  min={0}
                />
              </div>

              <div className="form-group">
                <label>Car Spaces</label>
                <NumberInput
                  value={project.car_spaces || ''}
                  onChange={(value) => setProject({ ...project, car_spaces: value })}
                  min={0}
                />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Zoning</label>
                <input
                  type="text"
                  value={project.zoning || ''}
                  onChange={(e) => setProject({ ...project, zoning: e.target.value })}
                  className="form-input"
                  placeholder="e.g., R3 Medium Density"
                />
              </div>

              <div className="form-group">
                <label>Planning Permit Status</label>
                <select
                  value={project.planning_permit_status || 'Not Started'}
                  onChange={(e) => setProject({ ...project, planning_permit_status: e.target.value })}
                  className="form-select"
                >
                  <option value="Not Started">Not Started</option>
                  <option value="In Progress">In Progress</option>
                  <option value="Submitted">Submitted</option>
                  <option value="Approved">Approved</option>
                  <option value="Approved with Conditions">Approved with Conditions</option>
                </select>
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Expected Start Date</label>
                <input
                  type="date"
                  value={project.expected_start_date || ''}
                  onChange={(e) => setProject({ ...project, expected_start_date: e.target.value })}
                  className="form-input"
                />
              </div>

              <div className="form-group">
                <label>Expected Completion Date</label>
                <input
                  type="date"
                  value={project.expected_completion_date || ''}
                  onChange={(e) => setProject({ ...project, expected_completion_date: e.target.value })}
                  className="form-input"
                />
              </div>
            </div>

            <div className="form-section">
              <h4>Risk Assessment</h4>
              <div className="risk-assessment-grid">
                <div className="form-group">
                  <label>Market Risk</label>
                  <select
                    value={project.market_risk_rating || 'medium'}
                    onChange={(e) => setProject({ ...project, market_risk_rating: e.target.value })}
                    className="form-select"
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                  </select>
                </div>

                <div className="form-group">
                  <label>Construction Risk</label>
                  <select
                    value={project.construction_risk_rating || 'medium'}
                    onChange={(e) => setProject({ ...project, construction_risk_rating: e.target.value })}
                    className="form-select"
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                  </select>
                </div>

                <div className="form-group">
                  <label>Location Risk</label>
                  <select
                    value={project.location_risk_rating || 'medium'}
                    onChange={(e) => setProject({ ...project, location_risk_rating: e.target.value })}
                    className="form-select"
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                  </select>
                </div>
              </div>
            </div>
          </div>
        );

      case 4:
        return (
          <div className="form-section">
            <h3>Document Management</h3>
            <p className="section-description">
              Upload new documents or manage existing ones. Required documents are marked with an asterisk (*).
            </p>
            
            {/* Existing Documents */}
            {documents.length > 0 && (
              <div className="existing-documents">
                <h4>Existing Documents</h4>
                <div className="documents-grid">
                  {documents.map((doc) => (
                    <div key={doc.id} className="document-upload-item">
                      <div className="document-header">
                        <label>{doc.document_type.replace(/_/g, ' ')}</label>
                        <span className="uploaded-badge">✓ Uploaded</span>
                      </div>
                      <div className="uploaded-file">
                        <span className="file-name">{doc.file_name}</span>
                        <button
                          type="button"
                          onClick={() => handleDeleteDocument(doc.id)}
                          className="btn btn-sm btn-danger"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Upload New Documents */}
            <div className="new-documents">
              <h4>Upload New Documents</h4>
              <div className="documents-grid">
                {requiredDocs.required_documents?.map((docType) => {
                  const hasExisting = documents.some(d => d.document_type === docType);
                  const hasNew = newDocuments.some(d => d.type === docType);
                  
                  return (
                    <div key={docType} className="document-upload-item">
                      <div className="document-header">
                        <label htmlFor={`doc-${docType}`}>
                          {requiredDocs.descriptions?.[docType] || docType.replace(/_/g, ' ')} 
                          {!hasExisting && ' *'}
                        </label>
                        {(hasExisting || hasNew) && (
                          <span className="uploaded-badge">
                            {hasExisting ? '✓ Existing' : '✓ Ready to upload'}
                          </span>
                        )}
                      </div>
                      
                      <div className="document-actions">
                        <input
                          type="file"
                          id={`doc-${docType}`}
                          onChange={(e) => handleDocumentChange(e, docType)}
                          accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png"
                          style={{ display: 'none' }}
                        />
                        
                        {hasNew ? (
                          <div className="uploaded-file">
                            <span className="file-name">{newDocuments.find(d => d.type === docType).name}</span>
                            <button
                              type="button"
                              onClick={() => removeNewDocument(docType)}
                              className="btn btn-sm btn-danger"
                            >
                              Remove
                            </button>
                          </div>
                        ) : (
                          <label htmlFor={`doc-${docType}`} className="btn btn-outline upload-btn">
                            {hasExisting ? 'Replace File' : 'Choose File'}
                          </label>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="create-project">
      <div className="create-project-header">
        <h1>Edit Project</h1>
        <p>Update your project information and documents</p>
      </div>

      {/* Progress Steps */}
      <div className="progress-steps">
        <div className={`step ${currentStep >= 1 ? 'active' : ''} ${currentStep > 1 ? 'completed' : ''}`}>
          <div className="step-number">1</div>
          <div className="step-label">Basic Info</div>
        </div>
        <div className={`step ${currentStep >= 2 ? 'active' : ''} ${currentStep > 2 ? 'completed' : ''}`}>
          <div className="step-number">2</div>
          <div className="step-label">Financials</div>
        </div>
        <div className={`step ${currentStep >= 3 ? 'active' : ''} ${currentStep > 3 ? 'completed' : ''}`}>
          <div className="step-number">4</div>
          <div className="step-label">Details</div>
        </div>
        <div className={`step ${currentStep >= 4 ? 'active' : ''} ${currentStep > 4 ? 'completed' : ''}`}>
          <div className="step-number">4</div>
          <div className="step-label">Documents</div>
        </div>
      </div>

      {error && <ErrorMessage message={error} onClose={() => setError('')} />}

      <form className="project-form multi-step">
        {renderStepContent()}

        <div className="form-actions">
          {currentStep > 1 && (
            <button type="button" onClick={handlePrevious} className="btn btn-outline">
              Previous
            </button>
          )}
          
          {currentStep < 4 ? (
            <button type="button" onClick={handleNext} className="btn btn-primary">
              Next
            </button>
          ) : (
            <button 
              type="button" 
              onClick={handleSubmit} 
              disabled={saving || uploadingDocs}
              className="btn btn-primary"
            >
              {saving ? 'Saving Changes...' : (isResubmitFlow && project?.submission_status === 'rejected' ? 'Save and Submit for Re-review' : 'Save All Changes')}
            </button>
          )}
        </div>
      </form>
    </div>
  );
};

// ===========================
// MESSAGES PAGE
// ===========================

const MessagesPage = () => {
  const api = useApi();
  const { user } = useApp();
  const { addNotification } = useNotifications();
  const [conversations, setConversations] = useState([]);
  const [selectedConversation, setSelectedConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    fetchConversations();
  }, []);

  useEffect(() => {
    if (selectedConversation) {
      fetchMessages(selectedConversation.id);
    }
  }, [selectedConversation]);

  useEffect(() => {
    // Only scroll to bottom when new messages are added, not on initial load
    if (messages.length > 0) {
      const timeout = setTimeout(() => {
        scrollToBottom();
      }, 100);
      return () => clearTimeout(timeout);
    }
  }, [messages.length]);

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth <= 768);
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  };

  const fetchConversations = async () => {
    try {
      let conversations = [];
      
      if (user.role === 'admin') {
        // Admin sees all conversations with users
        const adminConvos = await api.getAdminConversations();
        conversations = adminConvos.map(conv => ({
          id: `admin-${conv.user_id}`,
          user_id: conv.user_id,
          user_name: conv.user_name,
          user_email: conv.user_email,
          user_role: conv.user_role,
          last_message: conv.last_message,
          last_message_time: conv.last_message_time,
          unread_count: conv.unread_count,
          type: 'admin_message'
        }));
      } else {
        // Regular users see access requests + admin messages
        const accessRequests = await api.getAccessRequests();
        conversations = accessRequests;
        
        // Check for admin messages
        const adminMessages = await api.getUserAdminMessages();
        if (adminMessages.length > 0) {
          // Add admin conversation at the top
          const lastAdminMsg = adminMessages[adminMessages.length - 1];
          conversations.unshift({
            id: 'admin-conversation',
            admin_name: lastAdminMsg.admin_name || 'Admin',
            last_message: lastAdminMsg.message,
            last_message_time: lastAdminMsg.sent_at,
            unread_count: adminMessages.filter(m => m.sender_role === 'admin' && !m.read_at).length,
            type: 'admin_message'
          });
        }
      }
      
      setConversations(conversations);
      if (conversations.length > 0 && !selectedConversation) {
        setSelectedConversation(conversations[0]);
      }
    } catch (err) {
      console.error('Failed to fetch conversations:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchMessages = async (conversationId) => {
    try {
      const conversation = conversations.find(c => c.id === conversationId);
      
      if (conversation?.type === 'admin_message') {
        // Fetch admin messages
        if (user.role === 'admin') {
          const userId = conversation.user_id || conversationId.replace('admin-', '');
          const data = await api.getAdminMessages(userId);
          setMessages(data);
        } else {
          const data = await api.getUserAdminMessages();
          setMessages(data);
        }
      } else {
        // Regular access request messages
        const data = await api.getMessages(conversationId);
        
        // If there's an initial message and no other messages, add it
        if (conversation?.initial_message && data.length === 0) {
          const initialMsg = {
            id: 'initial-' + conversationId,
            sender_role: 'funder',
            sender_name: conversation.funder_name,
            message: conversation.initial_message,
            sent_at: conversation.requested_at
          };
          setMessages([initialMsg]);
        } else {
          setMessages(data);
        }
      }
    } catch (err) {
      console.error('Failed to fetch messages:', err);
    }
  };

  const handleSendMessage = async () => {
    if (!newMessage.trim() || !selectedConversation) return;
    
    setSending(true);
    try {
      if (selectedConversation.type === 'admin_message') {
        // Send admin message
        if (user.role === 'admin') {
          const userId = selectedConversation.user_id || selectedConversation.id.replace('admin-', '');
          await api.sendAdminMessage(userId, newMessage.trim());
        } else {
          // User replying to admin
          await api.replyToAdmin(newMessage.trim());
        }
      } else {
        // Regular access request message
        await api.sendMessage(selectedConversation.id, newMessage.trim());
      }
      
      setNewMessage('');
      // Refresh messages
      fetchMessages(selectedConversation.id);
    } catch (err) {
      addNotification({
        type: 'error',
        title: 'Send Failed',
        message: 'Failed to send message'
      });
    } finally {
      setSending(false);
    }
  };

  const handleApproveAccess = async (requestId) => {
    try {
      await api.approveAccessRequest(requestId);
      
      // Update the conversation status locally
      setConversations(prev => prev.map(conv => 
        conv.id === requestId ? { ...conv, status: 'approved' } : conv
      ));
      
      // Update selected conversation if it's the current one
      if (selectedConversation?.id === requestId) {
        setSelectedConversation(prev => ({ ...prev, status: 'approved' }));
      }
      
      addNotification({
        type: 'success',
        title: 'Access Approved',
        message: 'Funder now has access to full project details'
      });
    } catch (err) {
      addNotification({
        type: 'error',
        title: 'Approval Failed',
        message: err.message
      });
    }
  };

  const handleDeclineAccess = async (requestId) => {
    try {
      await api.declineAccessRequest(requestId);
      
      // Update the conversation status locally
      setConversations(prev => prev.map(conv => 
        conv.id === requestId ? { ...conv, status: 'declined' } : conv
      ));
      
      // Update selected conversation if it's the current one
      if (selectedConversation?.id === requestId) {
        setSelectedConversation(prev => ({ ...prev, status: 'declined' }));
      }
      
      addNotification({
        type: 'info',
        title: 'Access Declined',
        message: 'Access request has been declined'
      });
    } catch (err) {
      addNotification({
        type: 'error',
        title: 'Decline Failed',
        message: err.message
      });
    }
  };

  if (loading) return <LoadingSpinner />;

  return (
    <div className="messages-page">
      <div className="messages-container">
        {/* Conversations Sidebar */}
        <div className={`conversations-sidebar ${isMobile && selectedConversation ? 'mobile-hidden' : ''}`}>
          <div className="sidebar-header">
            <h3>Conversations</h3>
            <span className="conversation-count">{conversations.length}</span>
          </div>
          
          <div className="conversations-list">
            {conversations.length === 0 ? (
              // Replace the existing no-conversations div with this:
<div className="no-conversations">
  <div className="empty-message-icon">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  </div>
  <h3>No conversations yet</h3>
  <p>Messages from {user.role === 'borrower' ? 'funders' : 'developers'} will appear here</p>
</div>
            ) : (
              conversations.map((conversation) => (
                <div
                  key={conversation.id}
                  className={`conversation-item ${selectedConversation?.id === conversation.id ? 'active' : ''}`}
                  onClick={() => setSelectedConversation(conversation)}
                >
                  <div className="conversation-avatar">
                    {conversation.type === 'admin_message' 
                      ? (user.role === 'admin' ? conversation.user_name?.charAt(0).toUpperCase() : 'A')
                      : (user.role === 'borrower' 
                          ? conversation.funder_name?.charAt(0).toUpperCase()
                          : conversation.project_title?.charAt(0).toUpperCase()
                        )
                    }
                  </div>
                  
                  <div className="conversation-info">
                    <div className="conversation-header">
                      <div className="conversation-name">
                        {conversation.type === 'admin_message'
                          ? (user.role === 'admin' ? conversation.user_name : 'Admin Support')
                          : (user.role === 'borrower' 
                              ? conversation.funder_name 
                              : conversation.project_title
                            )
                        }
                      </div>
                      <div className="conversation-time">
                        {formatTime(conversation.last_message_time || conversation.requested_at)}
                      </div>
                    </div>
                    
                    <div className="conversation-preview">
                      {conversation.last_message || conversation.initial_message || 'Access request'}
                    </div>
                    
                    <div className="conversation-meta">
                      {conversation.type === 'admin_message' ? (
                        conversation.unread_count > 0 && (
                          <span className="unread-badge">{conversation.unread_count}</span>
                        )
                      ) : (
                        <StatusBadge status={conversation.status} />
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Chat Area */}
        <div className={`chat-area ${isMobile && selectedConversation ? 'mobile-active' : ''}`}>
          {selectedConversation ? (
            <>
              {/* Chat Header */}
              <div className="chat-header">
                {isMobile && (
                  <button 
                    className="mobile-back-button"
                    onClick={() => setSelectedConversation(null)}
                  >
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M19 12H5M5 12l7 7m-7-7l7-7" />
                    </svg>
                  </button>
                )}
                <div className="chat-participant">
                  <div className="participant-info">
                    <div className="participant-name">
                      {selectedConversation.type === 'admin_message'
                        ? (user.role === 'admin' ? selectedConversation.user_name : 'Admin Support')
                        : (user.role === 'borrower' 
                            ? selectedConversation.funder_name 
                            : selectedConversation.project_title
                          )
                      }
                    </div>
                    <div className="participant-details">
                      {selectedConversation.type === 'admin_message' ? (
                        user.role === 'admin' ? (
                          <span>{selectedConversation.user_email} • {selectedConversation.user_role}</span>
                        ) : (
                          <span>Platform Administrator</span>
                        )
                      ) : (
                        <>
                          {user.role === 'borrower' && selectedConversation.company_name && (
                            <span>{selectedConversation.company_name} • {selectedConversation.company_type}</span>
                          )}
                          {user.role === 'funder' && (
                            <span>Loan Amount: {formatCurrency(selectedConversation.loan_amount)}</span>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {user.role === 'borrower' && selectedConversation.status === 'pending' && (
                  <div className="chat-actions">
                    <button 
                      onClick={() => handleApproveAccess(selectedConversation.id)}
                      className="btn btn-sm btn-primary"
                    >
                      Approve Access
                    </button>
                    <button 
                      onClick={() => handleDeclineAccess(selectedConversation.id)}
                      className="btn btn-sm btn-outline"
                    >
                      Decline
                    </button>
                  </div>
                )}
              </div>

              {/* Messages Area */}
              <div className="messages-area">
                {messages.length === 0 ? (
                  <div className="no-messages">
                    <div className="no-messages-icon">💬</div>
                    <h3>Start the conversation</h3>
                    <p>Send a message to begin discussing this {user.role === 'borrower' ? 'investment opportunity' : 'project'}.</p>
                  </div>
                ) : (
                  <div className="messages-list">
                    {messages.map((message) => (
                      <div
                        key={message.id}
                        className={`message-bubble ${(
                          (selectedConversation.type === 'admin_message' && 
                           ((user.role === 'admin' && message.sender_role === 'admin') ||
                            (user.role !== 'admin' && message.sender_role === 'user'))) ||
                          (selectedConversation.type !== 'admin_message' && message.sender_role === user.role)
                        ) ? 'own' : 'other'}`}
                      >
                        <div className="message-header">
                          <span className="sender-name">{message.sender_name}</span>
                          <span className="message-time">{formatTime(message.sent_at)}</span>
                        </div>
                        <div className="message-content">
                          {message.message}
                        </div>
                      </div>
                    ))}
                    <div ref={messagesEndRef} />
                  </div>
                )}
              </div>

              {/* Message Input */}
              <div className="message-input-area">
                <div className="input-container">
                  <textarea
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    placeholder="Type your message..."
                    className="message-input"
                    rows="3"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleSendMessage();
                      }
                    }}
                  />
                  <div className="input-actions">
                    <span className="char-count">{newMessage.length}/1000</span>
                    <button
                      onClick={handleSendMessage}
                      disabled={sending || !newMessage.trim()}
                      className="btn btn-primary btn-sm"
                    >
                      {sending ? 'Sending...' : 'Send'}
                    </button>
                  </div>
                </div>
              </div>
            </>
          ) : (
            // Replace the no-conversation-selected div content:
<div className="no-conversation-selected">
  <div className="empty-chat-icon">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M8 12h8M12 8v8M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z" />
    </svg>
  </div>
  <h3>Select a conversation</h3>
  <p>Choose a conversation from the sidebar to start messaging</p>
</div>
          )}
        </div>
      </div>
    </div>
  );
};

// ===========================
// BROKER AI PAGE
// ===========================

const BrokerAI = () => {
  const api = useApi();
  const { user } = useApp();
  const [sessions, setSessions] = useState([]);
  const [activeSession, setActiveSession] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [thinking, setThinking] = useState(false);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    fetchSessions();
  }, []);

  useEffect(() => {
    if (activeSession) {
      fetchMessages(activeSession.id);
    }
  }, [activeSession]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const fetchSessions = async () => {
    try {
      const data = await api.getAIChatSessions();
      setSessions(data);
      if (data.length > 0 && !activeSession) {
        setActiveSession(data[0]);
      }
    } catch (err) {
      console.error('Failed to fetch sessions:', err);
    }
  };

  const fetchMessages = async (sessionId) => {
    try {
      const data = await api.getAIChatMessages(sessionId);
      setMessages(data);
    } catch (err) {
      console.error('Failed to fetch messages:', err);
    }
  };

  const createNewSession = async () => {
    try {
      const response = await api.createAIChatSession(null, `Chat ${new Date().toLocaleDateString()}`);
      await fetchSessions();
      setActiveSession({ id: response.session_id, session_title: `Chat ${new Date().toLocaleDateString()}` });
      setMessages([]);
    } catch (err) {
      console.error('Failed to create session:', err);
    }
  };

  const handleSendMessage = async () => {
    if (!input.trim() || !activeSession) return;

    const userMessage = input.trim();
    setInput('');
    setThinking(true);

    // Add user message to UI immediately
    const tempUserMessage = {
      id: Date.now(),
      sender: 'user',
      message: userMessage,
      timestamp: new Date().toISOString()
    };
    setMessages([...messages, tempUserMessage]);

    try {
      const response = await api.sendAIChatMessage(activeSession.id, userMessage);
      
      // Add AI response
      const aiMessage = {
        id: response.ai_message_id,
        sender: 'ai',
        message: response.ai_response,
        timestamp: new Date().toISOString()
      };
      setMessages(prev => [...prev, aiMessage]);
    } catch (err) {
      console.error('Failed to send message:', err);
      // Add error message
      setMessages(prev => [...prev, {
        id: Date.now(),
        sender: 'ai',
        message: 'I apologize, but I encountered an error. Please try again.',
        timestamp: new Date().toISOString()
      }]);
    } finally {
      setThinking(false);
    }
  };

  const suggestedQuestions = user.role === 'borrower' ? [
    "What's the typical LVR for a residential development in Brisbane?",
    "How do I calculate if my project is financially viable?",
    "What documents do lenders typically require?",
    "Can you explain mezzanine finance in simple terms?"
  ] : [
    "What should I look for in a development feasibility study?",
    "How do I assess construction risk for a project?",
    "What are typical returns for development finance?",
    "Can you explain the key metrics I should focus on?"
  ];

  return (
    <div className="broker-ai-page">
      <div className="ai-container">
        {/* Sessions Sidebar */}
        <div className="ai-sidebar">
          <div className="sidebar-header">
            <h3>Chat History</h3>
            <button onClick={createNewSession} className="btn btn-sm btn-primary">
              <span>+</span> New Chat
            </button>
          </div>
          
          <div className="sessions-list">
            {sessions.length === 0 ? (
              <div className="no-sessions">
                <p>No chat history</p>
              </div>
            ) : (
              sessions.map((session) => (
                <div
                  key={session.id}
                  className={`session-item ${activeSession?.id === session.id ? 'active' : ''}`}
                  onClick={() => setActiveSession(session)}
                >
                  <div className="session-title">{session.session_title}</div>
                  <div className="session-date">{formatDate(session.created_at)}</div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Chat Area */}
        <div className="ai-chat-area">
          <div className="chat-header">
            <div className="header-content">
              <h2>BrokerAI Assistant</h2>
              <p>Your intelligent property finance advisor</p>
            </div>
            <div className="ai-status">
              <span className="status-indicator active"></span>
              <span>Online</span>
            </div>
          </div>

          <div className="ai-messages-area">
            {!activeSession ? (
              <div className="welcome-message">
                <div className="welcome-icon">
  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <path d="M9 9h6M9 12h6M9 15h3" />
    <circle cx="12" cy="12" r="8" fill="currentColor" opacity="0.1" />
    <path d="M12 2v4M12 18v4M2 12h4M18 12h4" stroke="currentColor" strokeWidth="1" opacity="0.5" />
  </svg>
</div>
                <h3>Welcome to BrokerAI</h3>
                <p>I'm here to help you with property development finance questions.</p>
                <button onClick={createNewSession} className="btn btn-primary">
                  Start New Chat
                </button>
              </div>
            ) : messages.length === 0 ? (
              <div className="starter-message">
                <div className="ai-avatar"></div>
                <div className="starter-content">
                  <p>Hello! I'm BrokerAI, your property finance assistant. How can I help you today?</p>
                  <div className="suggested-questions">
                    <p>You might want to ask about:</p>
                    <div className="questions-grid">
                      {suggestedQuestions.map((question, index) => (
                        <button
                          key={index}
                          onClick={() => {
                            setInput(question);
                            handleSendMessage();
                          }}
                          className="suggested-question"
                        >
                          {question}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="messages-list">
                {messages.map((message) => (
                  <div key={message.id} className={`ai-message ${message.sender}`}>
                    <div className="message-avatar">
                      {message.sender === 'user' ? '👤' : '🤖'}
                    </div>
                    <div className="message-content">
                      <div className="message-text">
                        {message.sender === 'ai' ? (
                          <ReactMarkdown
                            components={{
                              p: ({ children }) => <p style={{ marginBottom: '0.75rem' }}>{children}</p>,
                              ul: ({ children }) => <ul style={{ marginLeft: '1.5rem', marginBottom: '0.75rem' }}>{children}</ul>,
                              li: ({ children }) => <li style={{ marginBottom: '0.25rem' }}>{children}</li>,
                              strong: ({ children }) => <strong style={{ color: '#667eea', fontWeight: '600' }}>{children}</strong>,
                            }}
                          >
                            {message.message}
                          </ReactMarkdown>
                        ) : (
                          message.message
                        )}
                      </div>
                      <div className="message-time">{formatTime(message.timestamp)}</div>
                    </div>
                  </div>
                ))}
                {thinking && (
                  <div className="ai-message ai">
                    <div className="message-avatar">🤖</div>
                    <div className="message-content">
                      <div className="thinking-indicator">
                        <span></span>
                        <span></span>
                        <span></span>
                      </div>
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>
            )}
          </div>

          {activeSession && (
            <div className="ai-input-area">
              <div className="input-container">
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Ask me about property development finance..."
                  className="ai-input"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      handleSendMessage();
                    }
                  }}
                />
                <button
                  onClick={handleSendMessage}
                  disabled={!input.trim() || thinking}
                  className="btn btn-primary"
                >
                  Send
                </button>
              </div>
              <div className="input-disclaimer">
                BrokerAI provides general information only. Always consult professionals for specific advice.
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// ===========================
// DEAL ROOM COMPONENTS - REPLACE THE ENTIRE DealRoom SECTION IN App.jsx
// ===========================

// Fixed DealRoom Component with better error handling
const DealRoom = () => {
  const { projectId, dealId } = useParams();
  const { user } = useApp();
  const api = useApi();
  const { addNotification } = useNotifications();
  const navigate = useNavigate();
  
  const [loading, setLoading] = useState(true);
  const [deal, setDeal] = useState(null);
  const [project, setProject] = useState(null);
  const [activeTab, setActiveTab] = useState('overview');
  const [showQuoteWizard, setShowQuoteWizard] = useState(false);
  const [proposal, setProposal] = useState(null);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [projectDocuments, setProjectDocuments] = useState([]);
  const [showContactModal, setShowContactModal] = useState(false);
  
  useEffect(() => {
    fetchDealData();
  }, [dealId]);
  
  const fetchDealData = async () => {
    try {
      // First, try to get the essential data
      const dealData = await api.getDeal(dealId);
      const projectData = await api.getProject(projectId);
      
      setDeal(dealData);
      setProject(projectData);
      
      // Then try to get optional data, but don't fail if these don't work
      try {
        const proposalData = await api.getDealProposal(dealId);
        // Check if proposal data is empty object or has actual data
        if (proposalData && Object.keys(proposalData).length > 0) {
          setProposal(proposalData);
        } else {
          setProposal(null);
        }
      } catch (err) {
        console.log('No proposal yet:', err);
        setProposal(null);
      }
      
      // Try to get project documents, but don't fail the whole page if it doesn't work
      try {
        const projectDocs = await api.getProjectDocumentsForDeal(projectId);
        setProjectDocuments(projectDocs || []);
      } catch (err) {
        console.error('Could not load project documents:', err);
        setProjectDocuments([]);
        // Don't navigate away - just log the error
      }
      
    } catch (err) {
      console.error('Failed to load deal data:', err);
      addNotification({
        type: 'error',
        title: 'Load Failed',
        message: 'Failed to load deal room data'
      });
      // Only navigate away if we couldn't load the essential data
      navigate(`/project/${projectId}`);
    } finally {
      setLoading(false);
    }
  };
  
  const handleDealComplete = async () => {
    try {
      await api.completeDeal(dealId);
      addNotification({
        type: 'success',
        title: 'Deal Completed',
        message: 'Congratulations on closing this deal! The project has been removed from the live market.'
      });
      
      setTimeout(() => {
        addNotification({
          type: 'info',
          title: 'Next Steps',
          message: 'Please exchange contact information to continue the deal outside the platform. You can continue using the data room for document storage.'
        });
      }, 2000);
      
      navigate('/dashboard');
    } catch (err) {
      addNotification({
        type: 'error',
        title: 'Error',
        message: 'Failed to complete deal'
      });
    }
    setShowConfirmDialog(false);
  };
  
  const tabs = [
    { id: 'overview', label: 'Overview' },
    { id: 'documents', label: 'Documents' },
    { id: 'comments', label: 'Comments' },
    { id: 'proposal', label: 'Proposal' }
  ];
  
  if (loading) return <LoadingSpinner />;
  
  if (!deal || !project) {
    return (
      <div className="deal-room">
        <div className="error-message">
          <h3>Deal room not found</h3>
          <p>This deal room may not exist or you don't have access to it.</p>
          <button onClick={() => navigate('/dashboard')} className="btn btn-primary">
            Return to Dashboard
          </button>
        </div>
      </div>
    );
  }
  
  return (
    <div className="deal-room">
      <div className="deal-header">
        <div className="deal-breadcrumb">
          <Link to="/projects">Projects</Link>
          <span>/</span>
          <Link to={`/project/${projectId}`}>{project.title}</Link>
          <span>/</span>
          <span>Deal Room</span>
        </div>
        
        <div className="deal-title-section">
          <h1>{project.title} - Deal Room</h1>
          <div className="deal-status">
            <StatusBadge status={deal.status === 'accepted' ? 'Offer Accepted' : deal.status} />
          </div>
        </div>
        
        <div className="deal-participants">
          <div className="participant">
            <span className="label">Developer:</span>
            <span className="name">{deal.borrower_name}</span>
          </div>
          <div className="participant">
            <span className="label">Funder:</span>
            <span className="name">{deal.funder_name}</span>
          </div>
        </div>
        
<button 
  onClick={() => setShowContactModal(true)}
  className="btn btn-outline"
>
  Share Contact Info
</button>

        {deal.status === 'accepted' && (
          <div className="deal-completion-banner">
            <div className="completion-icon">✓</div>
            <div className="completion-content">
              <h3>Deal Accepted!</h3>
              <p>Congratulations on reaching an agreement. Ready to finalize?</p>
            </div>
            <button onClick={() => setShowConfirmDialog(true)} className="btn btn-primary">
              Complete Deal
            </button>
          </div>
        )}
      </div>
      
      <Tabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab} />
      
      <div className="deal-content">
        {activeTab === 'overview' && <DealOverview deal={deal} project={project} />}
        {activeTab === 'documents' && (
          <DealDocumentManager 
            dealId={dealId}
            projectId={projectId}
            projectDocuments={projectDocuments}
            userRole={user.role}
            onUpdate={fetchDealData}
          />
        )}
        {activeTab === 'comments' && (
          <DealComments 
            dealId={dealId}
            userRole={user.role}
          />
        )}
        {activeTab === 'proposal' && (
          <ProposalSection 
            deal={deal}
            proposal={proposal}
            userRole={user.role}
            onShowQuoteWizard={() => setShowQuoteWizard(true)}
            onUpdate={fetchDealData}
          />
        )}
      </div>
      
      {showQuoteWizard && (
        <QuoteWizard
          dealId={dealId}
          projectId={projectId}
          onClose={() => setShowQuoteWizard(false)}
          onSuccess={() => {
            setShowQuoteWizard(false);
            fetchDealData();
            addNotification({
              type: 'success',
              title: 'Quote Submitted',
              message: 'Your indicative quote has been sent to the developer'
            });
          }}
        />
      )}
      
      <ConfirmationDialog
        isOpen={showConfirmDialog}
        onClose={() => setShowConfirmDialog(false)}
        onConfirm={handleDealComplete}
        title="Complete Deal"
        message="Are you sure you want to mark this deal as complete? This will remove it from the live market."
        confirmText="Complete Deal"
      />

      <ContactInfoModal
  user={user}
  targetUser={{
    id: user.role === 'borrower' ? deal.funder_id : deal.borrower_id,
    name: user.role === 'borrower' ? deal.funder_name : deal.borrower_name,
    email: user.role === 'borrower' ? deal.funder_email : deal.borrower_email
  }}
  dealId={dealId}
  isOpen={showContactModal}
  onClose={() => setShowContactModal(false)}
/>
    </div>
  );
};

const DealOverview = ({ deal, project }) => {
  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-AU', {
      style: 'currency',
      currency: 'AUD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount);
  };

  const formatNumber = (num) => {
    if (!num) return 'N/A';
    return new Intl.NumberFormat('en-AU').format(num);
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'TBD';
    return new Date(dateString).toLocaleDateString('en-AU', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });
  };

  return (
    <div className="deal-overview">
      <div className="overview-grid">
        {/* Project Summary Card */}
        <div className="content-card">
          <h3>Project Summary</h3>
          <p className="project-description">
            {project.description || 'No description provided.'}
          </p>
          
          <div className="detail-grid">
            <div className="detail-item">
              <label>Property Type</label>
              <span>{project.property_type}</span>
            </div>
            <div className="detail-item">
              <label>Development Stage</label>
              <span>{project.development_stage}</span>
            </div>
            <div className="detail-item">
              <label>Project Size</label>
              <span>{project.project_size_sqm ? `${formatNumber(project.project_size_sqm)} sqm` : 'N/A'}</span>
            </div>
            <div className="detail-item">
              <label>Number of Units</label>
              <span>{project.number_of_units ? formatNumber(project.number_of_units) : 'N/A'}</span>
            </div>
            <div className="detail-item">
              <label>Levels</label>
              <span>{project.number_of_levels || 'N/A'}</span>
            </div>
            <div className="detail-item">
              <label>Car Spaces</label>
              <span>{project.car_spaces || 'N/A'}</span>
            </div>
          </div>
        </div>

        {/* Financial Structure Card */}
        <div className="content-card">
          <h3>Financial Structure</h3>
          <div className="financial-grid">
            <div className="financial-detail">
              <label>Loan Amount Required</label>
              <span className="value primary">{formatCurrency(project.loan_amount)}</span>
            </div>
            <div className="financial-detail">
              <label>Interest Rate</label>
              <span className="value">{project.interest_rate || 'TBD'}% per annum</span>
            </div>
            <div className="financial-detail">
              <label>Loan Term</label>
              <span className="value">{project.loan_term || 'TBD'} months</span>
            </div>
            <div className="financial-detail">
              <label>Total Project Cost</label>
              <span className="value">{project.total_project_cost ? formatCurrency(project.total_project_cost) : 'N/A'}</span>
            </div>
            <div className="financial-detail">
              <label>Equity Contribution</label>
              <span className="value">{project.equity_contribution ? formatCurrency(project.equity_contribution) : 'N/A'}</span>
            </div>
            <div className="financial-detail">
              <label>LVR</label>
              <span className="value">{project.lvr ? `${project.lvr.toFixed(1)}%` : 'N/A'}</span>
            </div>
          </div>
        </div>

        {/* Development Costs Card */}
        <div className="content-card">
          <h3>Development Economics</h3>
          <div className="detail-grid">
            <div className="detail-item">
              <label>Land Value</label>
              <span>{project.land_value ? formatCurrency(project.land_value) : 'N/A'}</span>
            </div>
            <div className="detail-item">
              <label>Construction Cost</label>
              <span>{project.construction_cost ? formatCurrency(project.construction_cost) : 'N/A'}</span>
            </div>
            <div className="detail-item">
              <label>Expected GDC</label>
              <span>{project.expected_gdc ? formatCurrency(project.expected_gdc) : 'N/A'}</span>
            </div>
            <div className="detail-item">
              <label>Expected Profit</label>
              <span>{project.expected_profit ? formatCurrency(project.expected_profit) : 'N/A'}</span>
            </div>
            <div className="detail-item">
              <label>Profit Margin</label>
              <span>
                {project.expected_profit && project.expected_gdc 
                  ? `${((project.expected_profit / project.expected_gdc) * 100).toFixed(1)}%` 
                  : 'N/A'}
              </span>
            </div>
            <div className="detail-item">
              <label>ICR</label>
              <span>{project.icr ? project.icr.toFixed(2) : 'N/A'}</span>
            </div>
          </div>
        </div>

        {/* Planning & Compliance Card */}
        <div className="content-card">
          <h3>Planning & Timeline</h3>
          <div className="detail-grid">
            <div className="detail-item">
              <label>Zoning</label>
              <span>{project.zoning || 'N/A'}</span>
            </div>
            <div className="detail-item">
              <label>Planning Status</label>
              <span>{project.planning_permit_status || 'Not Started'}</span>
            </div>
            <div className="detail-item">
              <label>Expected Start</label>
              <span>{formatDate(project.expected_start_date)}</span>
            </div>
            <div className="detail-item">
              <label>Expected Completion</label>
              <span>{formatDate(project.expected_completion_date)}</span>
            </div>
          </div>
        </div>

        {/* Risk Assessment Card */}
        {(project.market_risk_rating || project.construction_risk_rating || project.location_risk_rating) && (
          <div className="content-card">
            <h3>Risk Assessment</h3>
            <div className="risk-grid">
              <div className="risk-item">
                <label>Market Risk</label>
                <div className={`risk-badge risk-${project.market_risk_rating}`}>
                  {project.market_risk_rating?.toUpperCase()}
                </div>
              </div>
              <div className="risk-item">
                <label>Construction Risk</label>
                <div className={`risk-badge risk-${project.construction_risk_rating}`}>
                  {project.construction_risk_rating?.toUpperCase()}
                </div>
              </div>
              <div className="risk-item">
                <label>Location Risk</label>
                <div className={`risk-badge risk-${project.location_risk_rating}`}>
                  {project.location_risk_rating?.toUpperCase()}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Deal Timeline Card */}
        <div className="content-card">
          <h3>Deal Progress</h3>
          <div className="status-timeline">
            <div className="timeline-item active">
              <div className="timeline-marker"></div>
              <div className="timeline-content">
                <h4>Deal Room Created</h4>
                <p>{formatDate(deal.created_at)}</p>
              </div>
            </div>
            <div className="timeline-item">
              <div className="timeline-marker"></div>
              <div className="timeline-content">
                <h4>Due Diligence</h4>
                <p>In progress</p>
              </div>
            </div>
            <div className="timeline-item">
              <div className="timeline-marker"></div>
              <div className="timeline-content">
                <h4>Term Sheet</h4>
                <p>Pending</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const DealDocumentManager = ({ dealId, projectId, projectDocuments = [], userRole, onUpdate }) => {
  const [dealDocuments, setDealDocuments] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [previewDocument, setPreviewDocument] = useState(null);
  const [showRequestModal, setShowRequestModal] = useState(false);
  const [documentRequests, setDocumentRequests] = useState([]);
  const api = useApi();
  const { addNotification } = useNotifications();
  const { user } = useApp();
  
  useEffect(() => {
    fetchDealDocuments();
    fetchDocumentRequests();
  }, [dealId]);
  
  const fetchDealDocuments = async () => {
    try {
      const docs = await api.getDealDocuments(dealId);
      setDealDocuments(docs || []);
    } catch (err) {
      console.error('Failed to fetch deal documents:', err);
    }
  };
  
  const fetchDocumentRequests = async () => {
    try {
      const requests = await api.getDocumentRequests(dealId);
      setDocumentRequests(requests || []);
    } catch (err) {
      console.error('Failed to fetch document requests:', err);
    }
  };
  
  const handleUploadDealDocument = async (files) => {
    setUploading(true);
    const formData = new FormData();
    
    for (let file of files) {
      formData.append('documents', file);
    }
    
    try {
      await api.uploadDealDocuments(dealId, formData);
      
      addNotification({
        type: 'success',
        title: 'Upload Complete',
        message: 'Documents uploaded to deal room'
      });
      
      await fetchDealDocuments(); // Refresh deal documents
    } catch (err) {
      console.error('Upload error:', err);
      addNotification({
        type: 'error',
        title: 'Upload Failed',
        message: err.message || 'Failed to upload documents'
      });
    } finally {
      setUploading(false);
    }
  };
  
  const handleDownload = async (document) => {
    try {
      const blob = await api.downloadDocument(document.file_path);
      const url = window.URL.createObjectURL(blob);
      const a = window.document.createElement('a');
      a.href = url;
      a.download = document.file_name;
      window.document.body.appendChild(a);
      a.click();
      window.document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      addNotification({
        type: 'error',
        title: 'Download Failed',
        message: 'Failed to download document'
      });
    }
  };
  
  const handleDealDocumentView = async (document) => {
    if (document.mime_type?.includes('pdf')) {
      setPreviewDocument({ ...document, isDealDocument: true });
    } else {
      // For non-PDF files, download them
      try {
        const blob = await api.downloadDealDocument(dealId, document.id);
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = document.file_name;
        a.click();
        window.URL.revokeObjectURL(url);
      } catch (err) {
        addNotification({
          type: 'error',
          title: 'Download Failed',
          message: 'Unable to download document'
        });
      }
    }
  };
  
  const handleProjectDocumentView = async (document) => {
    if (document.mime_type?.includes('pdf')) {
      setPreviewDocument({ ...document, isDealDocument: false });
    } else {
      // For non-PDF files, download them
      await handleDownload(document);
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return '';
    return new Date(dateString).toLocaleDateString('en-AU', { 
      year: 'numeric', 
      month: 'short', 
      day: 'numeric' 
    });
  };
  
  return (
    <div className="deal-documents">
      {/* Project Documents Section - Read Only */}
      <div className="document-section">
        <div className="section-header">
          <h4>Project Documents <span className="document-count">{projectDocuments.length}</span></h4>
          <span className="section-subtitle">Original project documentation</span>
        </div>
        
        <div className="document-list">
          {projectDocuments.length > 0 ? (
            projectDocuments.map(doc => (
              <div key={`project-${doc.id}`} className="document-item">
                <div className="document-info">
                  <div className="document-icon">📄</div>
                  <div className="document-details">
                    <h5>{doc.file_name}</h5>
                    <div className="document-meta">
                      {doc.document_type ? `${doc.document_type.replace(/_/g, ' ')} • ` : ''}
                      Project Document • {formatDate(doc.uploaded_at)}
                    </div>
                  </div>
                </div>
                <div className="document-actions">
                  <button 
                    onClick={() => handleProjectDocumentView(doc)} 
                    className="btn btn-sm btn-outline"
                  >
                    View
                  </button>
                  <button 
                    onClick={() => handleDownload(doc)} 
                    className="btn btn-sm btn-outline"
                  >
                    Download
                  </button>
                </div>
              </div>
            ))
          ) : (
            <div className="empty-state">
              <p>No project documents available</p>
            </div>
          )}
        </div>
      </div>

      {/* Deal-Specific Documents Section */}
      <div className="document-section">
        <div className="section-header">
          <h4>Deal Documents <span className="document-count">{dealDocuments.length}</span></h4>
          <span className="section-subtitle">Documents specific to this deal</span>
          <div className="section-actions">
            <button 
              onClick={() => setShowRequestModal(true)}
              className="btn btn-sm btn-outline"
            >
              Request Document
            </button>
            <FileUpload
              onUpload={handleUploadDealDocument}
              accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg"
              maxSize={10 * 1024 * 1024}
              multiple={true}
              disabled={uploading}
            >
              <button className="btn btn-sm btn-primary" disabled={uploading}>
                {uploading ? 'Uploading...' : 'Upload to Deal'}
              </button>
            </FileUpload>
          </div>
        </div>
        
        <div className="document-list">
          {dealDocuments.length > 0 ? (
            dealDocuments.map(doc => (
              <div key={`deal-${doc.id}`} className="document-item">
                <div className="document-info">
                  <div className="document-icon">📄</div>
                  <div className="document-details">
                    <h5>{doc.file_name}</h5>
                    <div className="document-meta">
                      Uploaded by {doc.uploader_name} • {formatDate(doc.uploaded_at)}
                    </div>
                  </div>
                </div>
                <div className="document-actions">
                  <button 
                    onClick={() => handleDealDocumentView(doc)} 
                    className="btn btn-sm btn-outline"
                  >
                    View
                  </button>
                  <button 
                    onClick={() => api.downloadDealDocument(dealId, doc.id).then(blob => {
                      const url = window.URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = doc.file_name;
                      a.click();
                      window.URL.revokeObjectURL(url);
                    }).catch(() => {
                      addNotification({
                        type: 'error',
                        title: 'Download Failed',
                        message: 'Unable to download document'
                      });
                    })} 
                    className="btn btn-sm btn-outline"
                  >
                    Download
                  </button>
                </div>
              </div>
            ))
          ) : (
            <div className="empty-state">
              <p>No deal-specific documents uploaded yet</p>
            </div>
          )}
        </div>
      </div>
      
      {/* Document Requests Section */}
      {documentRequests.length > 0 && (
        <div className="document-section">
          <div className="section-header">
            <h4>Document Requests <span className="document-count">{documentRequests.filter(r => r.status === 'pending').length}</span></h4>
            <span className="section-subtitle">Pending document requests</span>
          </div>
          
          <div className="document-list">
            {documentRequests.map(request => (
              <div key={`request-${request.id}`} className="document-item request-item">
                <div className="document-info">
                  <div className="document-icon">📋</div>
                  <div className="document-details">
                    <h5>{request.document_name}</h5>
                    <div className="document-meta">
                      Requested by {request.requester_name} • {formatDate(request.requested_at)}
                      {request.description && <p className="request-description">{request.description}</p>}
                    </div>
                  </div>
                </div>
                <div className="document-actions">
                  <span className={`status-badge ${request.status}`}>
                    {request.status === 'pending' ? 'Pending' : 'Fulfilled'}
                  </span>
                  {request.status === 'pending' && request.requester_id !== user?.id && (
                    <FileUpload
                      onUpload={async (files) => {
                        // Mark this specific request as the one being fulfilled
                        const formData = new FormData();
                        for (let file of files) {
                          formData.append('documents', file);
                        }
                        formData.append('request_id', request.id);
                        
                        setUploading(true);
                        try {
                          await api.uploadDealDocuments(dealId, formData);
                          await api.fulfillDocumentRequest(request.id);
                          
                          addNotification({
                            type: 'success',
                            title: 'Request Fulfilled',
                            message: 'Document uploaded and request marked as fulfilled'
                          });
                          
                          await fetchDealDocuments();
                          await fetchDocumentRequests();
                        } catch (err) {
                          addNotification({
                            type: 'error',
                            title: 'Upload Failed',
                            message: err.message || 'Failed to fulfill request'
                          });
                        } finally {
                          setUploading(false);
                        }
                      }}
                      accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg"
                      maxSize={10 * 1024 * 1024}
                      multiple={false}
                      disabled={uploading}
                    >
                      <button className="btn btn-sm btn-primary" disabled={uploading}>
                        Upload to Fulfill
                      </button>
                    </FileUpload>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      
      {/* Modals */}
      {showRequestModal && (
        <DocumentRequestModal 
          dealId={dealId}
          onClose={() => setShowRequestModal(false)}
          onSuccess={async () => {
            setShowRequestModal(false);
            await fetchDocumentRequests();
            addNotification({
              type: 'success',
              title: 'Request Sent',
              message: 'Document request has been sent'
            });
          }}
        />
      )}
      
      {previewDocument && (
        <DealDocumentPreviewModal 
          document={previewDocument}
          dealId={dealId}
          api={api}
          onClose={() => setPreviewDocument(null)}
        />
      )}
    </div>
  );
};

const DocumentRequestModal = ({ dealId, onClose, onSuccess }) => {
  const [formData, setFormData] = useState({
    document_name: '',
    description: ''
  });
  const [submitting, setSubmitting] = useState(false);
  const api = useApi();
  
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.document_name.trim()) return;
    
    setSubmitting(true);
    try {
      await api.createDocumentRequest(dealId, formData);
      onSuccess();
    } catch (err) {
      console.error('Failed to create request:', err);
    } finally {
      setSubmitting(false);
    }
  };
  
  return (
    <Modal isOpen={true} onClose={onClose} title="Request Document" size="medium">
      <form onSubmit={handleSubmit} className="document-request-form">
        <div className="form-group">
          <label>Document Name *</label>
          <input
            type="text"
            value={formData.document_name}
            onChange={(e) => setFormData(prev => ({ ...prev, document_name: e.target.value }))}
            placeholder="e.g., Insurance Certificate"
            required
          />
        </div>
        
        <div className="form-group">
          <label>Description</label>
          <textarea
            value={formData.description}
            onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
            placeholder="Please provide additional details about this document..."
            rows="3"
          />
        </div>
        
        <div className="modal-actions">
          <button type="button" onClick={onClose} className="btn btn-outline">
            Cancel
          </button>
          <button type="submit" disabled={submitting} className="btn btn-primary">
            {submitting ? 'Sending...' : 'Send Request'}
          </button>
        </div>
      </form>
    </Modal>
  );
};

const DealComments = ({ dealId, userRole }) => {
  const [comments, setComments] = useState([]);
  const [newComment, setNewComment] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const { user } = useApp();
  const api = useApi();
  
  useEffect(() => {
    fetchComments();
  }, [dealId]);
  
  const fetchComments = async () => {
    try {
      const data = await api.getDealComments(dealId);
      setComments(data);
    } catch (err) {
      console.error('Failed to fetch comments:', err);
    } finally {
      setLoading(false);
    }
  };
  
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!newComment.trim() || submitting) return;
    
    setSubmitting(true);
    try {
      await api.createDealComment(dealId, { comment: newComment });
      setNewComment('');
      fetchComments();
    } catch (err) {
      console.error('Failed to post comment:', err);
    } finally {
      setSubmitting(false);
    }
  };
  
  if (loading) return <LoadingSpinner />;
  
  return (
    <div className="deal-comments">
      <div className="comments-list">
        {comments.map(comment => (
          <div key={comment.id} className="comment-card">
            <div className="comment-avatar">
              {comment.user_name.charAt(0).toUpperCase()}
            </div>
            <div className="comment-content">
              <div className="comment-header">
                <span className="comment-author">{comment.user_name}</span>
                <span className="comment-time">{formatTime(comment.created_at)}</span>
              </div>
              <div className="comment-text">{comment.comment}</div>
            </div>
          </div>
        ))}
      </div>
      
      <form onSubmit={handleSubmit} className="comment-form">
        <textarea
          value={newComment}
          onChange={(e) => setNewComment(e.target.value)}
          placeholder="Add a comment..."
          className="comment-input"
          rows="3"
          disabled={submitting}
        />
        <button type="submit" disabled={!newComment.trim() || submitting} className="btn btn-primary">
          {submitting ? 'Posting...' : 'Post Comment'}
        </button>
      </form>
    </div>
  );
};

const ProposalSection = ({ deal, proposal, userRole, onShowQuoteWizard, onUpdate }) => {
  const api = useApi();
  const { addNotification } = useNotifications();
  const [responding, setResponding] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [confirmAction, setConfirmAction] = useState(null);
  const [showCounterWizard, setShowCounterWizard] = useState(false);
  const [showDeclineReason, setShowDeclineReason] = useState(false);
  const [declineReason, setDeclineReason] = useState('');
  
  const handleAccept = async () => {
    setResponding(true);
    try {
      await api.respondToProposal(proposal.id, { response: 'accept' });
      addNotification({
        type: 'success',
        title: 'Proposal Accepted',
        message: 'You have accepted the funding proposal'
      });
      onUpdate();
    } catch (err) {
      addNotification({
        type: 'error',
        title: 'Error',
        message: 'Failed to accept proposal'
      });
    } finally {
      setResponding(false);
      setShowConfirmDialog(false);
    }
  };
  
  const handleDecline = async () => {
    if (!declineReason.trim() && showDeclineReason) {
      addNotification({
        type: 'error',
        title: 'Reason Required',
        message: 'Please provide a reason for declining'
      });
      return;
    }
    
    setResponding(true);
    try {
      await api.respondToProposal(proposal.id, { 
        response: 'decline',
        reason: declineReason.trim() 
      });
      addNotification({
        type: 'info',
        title: 'Proposal Declined',
        message: 'You have declined the funding proposal'
      });
      onUpdate();
    } catch (err) {
      addNotification({
        type: 'error',
        title: 'Error',
        message: 'Failed to decline proposal'
      });
    } finally {
      setResponding(false);
      setShowConfirmDialog(false);
      setShowDeclineReason(false);
      setDeclineReason('');
    }
  };
  
  const handleCounter = () => {
    setShowCounterWizard(true);
  };
  
  const showConfirm = (action) => {
    setConfirmAction(action);
    setShowConfirmDialog(true);
  };
  
  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-AU', {
      style: 'currency',
      currency: 'AUD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount);
  };
  
  // No proposal yet - show create button for funders
  if (!proposal && userRole === 'funder') {
    return (
      <div className="proposal-section">
        <div className="content-card">
          <h3>Submit Indicative Quote</h3>
          <p>No proposal submitted yet. Click below to create your first indicative quote.</p>
          <button onClick={onShowQuoteWizard} className="btn btn-primary">
            Create Indicative Quote
          </button>
        </div>
      </div>
    );
  }
  
  // Proposal was declined - show re-apply button for funders
  if (proposal && proposal.status === 'declined' && userRole === 'funder') {
    return (
      <div className="proposal-section">
        <div className="content-card">
          <h3>Proposal Declined</h3>
          <div className="proposal-status declined">
            <div className="status-icon">✗</div>
            <p>Your previous proposal was declined by the developer.</p>
          </div>
          <p style={{ marginTop: '2rem' }}>You can submit a new proposal with revised terms.</p>
          <button onClick={onShowQuoteWizard} className="btn btn-primary">
            Submit New Proposal
          </button>
        </div>
      </div>
    );
  }
  
  // No proposal yet - show waiting message for borrowers
  if (!proposal) {
    return (
      <div className="proposal-section">
        <div className="content-card">
          <h3>Awaiting Proposal</h3>
          <p>No proposals have been submitted yet. The funder will submit an indicative quote for your review.</p>
        </div>
      </div>
    );
  }
  
  // Show the proposal details
  return (
    <div className="proposal-section">
      <div className="content-card">
        <h3>Indicative Quote</h3>
        <div className="proposal-header">
          <span>From: {proposal.funder_name}</span>
          <StatusBadge status={proposal.status || 'pending'} />
        </div>
        
        <div className="proposal-details">
          <div className="term-item">
            <label>Loan Amount</label>
            <div className="term-value">{formatCurrency(proposal.loan_amount)}</div>
          </div>
          <div className="term-item">
            <label>Interest Rate</label>
            <div className="term-value">{proposal.interest_rate}% p.a.</div>
          </div>
          <div className="term-item">
            <label>Loan Term</label>
            <div className="term-value">{proposal.loan_term} months</div>
          </div>
          <div className="term-item">
            <label>Establishment Fee</label>
            <div className="term-value">{formatCurrency(proposal.establishment_fee || 0)}</div>
          </div>
          {proposal.other_fees && (
            <div className="term-item">
              <label>Other Fees</label>
              <div className="term-value">{proposal.other_fees}</div>
            </div>
          )}
        </div>
        
        {proposal.conditions && (
          <div className="proposal-conditions">
            <h4>Conditions</h4>
            <p>{proposal.conditions}</p>
          </div>
        )}
        
        {proposal.status === 'pending' && userRole === 'borrower' && (
          <div className="proposal-actions">
            <button 
              onClick={() => showConfirm('decline')} 
              disabled={responding}
              className="btn btn-outline"
            >
              Decline
            </button>
            <button 
              onClick={handleCounter} 
              disabled={responding}
              className="btn btn-outline"
            >
              Counter
            </button>
            <button 
              onClick={() => showConfirm('accept')} 
              disabled={responding}
              className="btn btn-primary"
            >
              Accept
            </button>
          </div>
        )}
        
        {proposal.status === 'accepted' && (
          <div className="proposal-status accepted">
            <div className="status-icon">✓</div>
            <h3>Proposal Accepted</h3>
            <p>This funding proposal has been accepted.</p>
          </div>
        )}
        
        {proposal.status === 'declined' && userRole === 'borrower' && (
          <div className="proposal-status declined">
            <div className="status-icon">✗</div>
            <h3>Proposal Declined</h3>
            <p>You declined this funding proposal.</p>
          </div>
        )}
      </div>
      
      {showCounterWizard && (
        <CounterOfferWizard
          originalProposal={proposal}
          dealId={deal.id}
          onClose={() => setShowCounterWizard(false)}
          onSuccess={() => {
            setShowCounterWizard(false);
            onUpdate();
            addNotification({
              type: 'success',
              title: 'Counter Offer Sent',
              message: 'Your counter offer has been sent to the funder'
            });
          }}
        />
      )}
      
      <ConfirmationDialog
        isOpen={showConfirmDialog}
        onClose={() => setShowConfirmDialog(false)}
        onConfirm={confirmAction === 'accept' ? handleAccept : () => {
          setShowConfirmDialog(false);
          setShowDeclineReason(true);
        }}
        title={confirmAction === 'accept' ? 'Accept Proposal' : 'Decline Proposal'}
        message={confirmAction === 'accept' 
          ? 'Are you sure you want to accept this funding proposal?' 
          : 'Are you sure you want to decline this funding proposal?'}
        confirmText={confirmAction === 'accept' ? 'Accept' : 'Decline'}
        danger={confirmAction === 'decline'}
      />
      
      {showDeclineReason && (
        <Modal 
          isOpen={showDeclineReason} 
          onClose={() => {
            setShowDeclineReason(false);
            setDeclineReason('');
          }} 
          title="Decline Proposal"
          size="medium"
        >
          <div className="decline-reason-modal">
            <p>Please provide a reason for declining this proposal:</p>
            <textarea
              value={declineReason}
              onChange={(e) => setDeclineReason(e.target.value)}
              placeholder="Enter your reason for declining..."
              className="form-textarea"
              rows={4}
            />
            <div className="modal-actions">
              <button 
                onClick={() => {
                  setShowDeclineReason(false);
                  setDeclineReason('');
                }} 
                className="btn btn-outline"
              >
                Cancel
              </button>
              <button 
                onClick={handleDecline} 
                className="btn btn-danger"
                disabled={!declineReason.trim() || responding}
              >
                {responding ? 'Declining...' : 'Confirm Decline'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};

// Add this component to your App.jsx file after the ProposalSection component

const QuoteWizard = ({ dealId, projectId, onClose, onSuccess, existingProposal = null, mode = 'create' }) => {
  const [currentStep, setCurrentStep] = useState(1);
  const [formData, setFormData] = useState({
    loan_amount: existingProposal?.loan_amount || '',
    interest_rate: existingProposal?.interest_rate || '',
    loan_term: existingProposal?.loan_term || '',
    establishment_fee: existingProposal?.establishment_fee || '0',
    other_fees: existingProposal?.other_fees || '0',
    conditions: existingProposal?.conditions || '',
    valid_until: existingProposal?.valid_until || new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
  });
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState({});
  const api = useApi();
  const { addNotification } = useNotifications();
  
  const steps = [
    { id: 1, title: 'Loan Terms' },
    { id: 2, title: 'Fees & Charges' },
    { id: 3, title: 'Conditions' },
    { id: 4, title: 'Review' }
  ];
  
  const handleNext = () => {
    if (validateStep(currentStep)) {
      setCurrentStep(prev => prev + 1);
    }
  };
  
  const handlePrevious = () => {
    setCurrentStep(prev => prev - 1);
  };
  
  const validateStep = (step) => {
    const newErrors = {};
    
    switch (step) {
      case 1:
        if (!formData.loan_amount || parseFloat(formData.loan_amount) <= 0) {
          newErrors.loan_amount = 'Loan amount is required and must be greater than 0';
        }
        if (!formData.interest_rate || parseFloat(formData.interest_rate) <= 0) {
          newErrors.interest_rate = 'Interest rate is required and must be greater than 0';
        }
        if (!formData.loan_term || parseInt(formData.loan_term) <= 0) {
          newErrors.loan_term = 'Loan term is required and must be greater than 0';
        }
        break;
      case 2:
        if (formData.establishment_fee && parseFloat(formData.establishment_fee) < 0) {
          newErrors.establishment_fee = 'Establishment fee cannot be negative';
        }
        if (formData.other_fees && parseFloat(formData.other_fees) < 0) {
          newErrors.other_fees = 'Other fees cannot be negative';
        }
        break;
      case 3:
        // Conditions are optional
        break;
      case 4:
        // Review step - validate all
        if (!formData.loan_amount || parseFloat(formData.loan_amount) <= 0) {
          newErrors.loan_amount = 'Loan amount is required';
        }
        if (!formData.interest_rate || parseFloat(formData.interest_rate) <= 0) {
          newErrors.interest_rate = 'Interest rate is required';
        }
        if (!formData.loan_term || parseInt(formData.loan_term) <= 0) {
          newErrors.loan_term = 'Loan term is required';
        }
        break;
    }
    
    setErrors(newErrors);
    
    if (Object.keys(newErrors).length > 0) {
      addNotification({
        type: 'error',
        title: 'Validation Error',
        message: 'Please correct the errors before proceeding'
      });
      return false;
    }
    
    return true;
  };
  
  const handleSubmit = async () => {
    if (!validateStep(4)) return; // Validate all fields
    
    setSubmitting(true);
    try {
      // Format data for submission - match backend expectations
      const submissionData = {
        loan_amount: parseFloat(formData.loan_amount),
        interest_rate: parseFloat(formData.interest_rate),
        loan_term: parseInt(formData.loan_term),
        establishment_fee: parseFloat(formData.establishment_fee || 0),
        other_fees: formData.other_fees || '', // Backend expects string or null
        conditions: formData.conditions.trim()
        // Note: valid_until is set by backend, not sent from frontend
      };
      
      await api.createProposal(dealId, submissionData);
      onSuccess();
    } catch (err) {
      console.error('Failed to submit proposal:', err);
      addNotification({
        type: 'error',
        title: 'Submission Failed',
        message: err.message || 'Failed to submit indicative quote. Please try again.'
      });
    } finally {
      setSubmitting(false);
    }
  };
  
  const renderStepContent = () => {
    switch (currentStep) {
      case 1:
        return (
          <div className="wizard-step-content">
            <h3>Loan Terms</h3>
            <div className="form-group">
              <label>Loan Amount *</label>
              <input
                type="number"
                value={formData.loan_amount}
                onChange={(e) => {
                  setFormData(prev => ({ ...prev, loan_amount: e.target.value }));
                  if (errors.loan_amount) {
                    setErrors(prev => ({ ...prev, loan_amount: '' }));
                  }
                }}
                placeholder="Enter loan amount"
                className={errors.loan_amount ? 'error' : ''}
                required
              />
              {errors.loan_amount && <span className="error-message">{errors.loan_amount}</span>}
            </div>
            
            <div className="form-group">
              <label>Interest Rate (% p.a.) *</label>
              <input
                type="number"
                step="0.1"
                value={formData.interest_rate}
                onChange={(e) => setFormData(prev => ({ ...prev, interest_rate: e.target.value }))}
                placeholder="e.g., 12.5"
                required
              />
            </div>
            
            <div className="form-group">
              <label>Loan Term (months) *</label>
              <input
                type="number"
                value={formData.loan_term}
                onChange={(e) => setFormData(prev => ({ ...prev, loan_term: e.target.value }))}
                placeholder="e.g., 18"
                required
              />
            </div>
          </div>
        );
        
      case 2:
        return (
          <div className="wizard-step-content">
            <h3>Fees & Charges</h3>
            <div className="form-group">
              <label>Establishment Fee</label>
              <input
                type="number"
                value={formData.establishment_fee}
                onChange={(e) => setFormData(prev => ({ ...prev, establishment_fee: e.target.value }))}
                placeholder="Enter establishment fee"
              />
            </div>
            
            <div className="form-group">
              <label>Other Fees</label>
              <textarea
                value={formData.other_fees}
                onChange={(e) => setFormData(prev => ({ ...prev, other_fees: e.target.value }))}
                placeholder="List any other fees or charges"
                rows="3"
              />
            </div>
          </div>
        );
        
      case 3:
        return (
          <div className="wizard-step-content">
            <h3>Conditions</h3>
            <div className="form-group">
              <label>Special Conditions</label>
              <textarea
                value={formData.conditions}
                onChange={(e) => setFormData(prev => ({ ...prev, conditions: e.target.value }))}
                placeholder="Enter any special conditions or requirements for this loan"
                rows="5"
              />
            </div>
            
            <div className="form-group">
              <label>Quote Valid Until *</label>
              <input
                type="date"
                value={formData.valid_until}
                onChange={(e) => setFormData(prev => ({ ...prev, valid_until: e.target.value }))}
                min={new Date().toISOString().split('T')[0]}
                required
              />
              <small>This quote will expire on the selected date</small>
            </div>
          </div>
        );
        
      case 4:
        return (
          <div className="wizard-step-content">
            <h3>Review Your Quote</h3>
        <div className="quote-summary">
          <div className="summary-section">
            <h4>Loan Terms</h4>
            <div className="summary-item">
              <span>Loan Amount:</span>
              <strong>{formatCurrency(formData.loan_amount)}</strong>
            </div>
            <div className="summary-item">
              <span>Interest Rate:</span>
              <strong>{formData.interest_rate}% p.a.</strong>
            </div>
            <div className="summary-item">
              <span>Loan Term:</span>
              <strong>{formData.loan_term} months</strong>
            </div>
          </div>
          
          {(formData.establishment_fee || formData.other_fees) && (
            <div className="summary-section">
              <h4>Fees</h4>
              {formData.establishment_fee && (
                <div className="summary-item">
                  <span>Establishment Fee:</span>
                  <strong>{formatCurrency(formData.establishment_fee)}</strong>
                </div>
              )}
              {formData.other_fees && (
                <div className="summary-item">
                  <span>Other Fees:</span>
                  <strong>{formData.other_fees}</strong>
                </div>
              )}
            </div>
          )}
          
          {formData.conditions && (
            <div className="summary-section">
              <h4>Conditions</h4>
              <p>{formData.conditions}</p>
            </div>
          )}
        </div>
          </div>
        );
    }
  };
  
  return (
    <Modal isOpen={true} onClose={onClose} title="Submit Indicative Quote" size="large">
      <div className="quote-wizard">
        <div className="wizard-progress">
          {steps.map((step, index) => (
            <div 
              key={step.id} 
              className={`wizard-step ${currentStep === step.id ? 'active' : ''} ${currentStep > step.id ? 'completed' : ''}`}
            >
              <div className="wizard-step-number">
                {currentStep > step.id ? '✓' : step.id}
              </div>
              <span className="wizard-step-title">{step.title}</span>
            </div>
          ))}
        </div>
        
        <div className="wizard-content">
          {renderStepContent()}
        </div>
        
        <div className="wizard-actions">
          <button 
            onClick={handlePrevious} 
            disabled={currentStep === 1}
            className="btn btn-outline"
          >
            Previous
          </button>
          
          {currentStep < 4 ? (
            <button onClick={handleNext} className="btn btn-primary">
              Next
            </button>
          ) : (
            <button 
              onClick={handleSubmit} 
              disabled={submitting}
              className="btn btn-primary"
            >
              {submitting ? 'Submitting...' : 'Submit Quote'}
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
};

const CounterOfferWizard = ({ originalProposal, dealId, onClose, onSuccess }) => {
  const [formData, setFormData] = useState({
    loan_amount: originalProposal.loan_amount,
    interest_rate: originalProposal.interest_rate,
    loan_term: originalProposal.loan_term,
    establishment_fee: originalProposal.establishment_fee || '',
    other_fees: originalProposal.other_fees || '',
    conditions: originalProposal.conditions || '',
    counter_notes: ''
  });
  const [submitting, setSubmitting] = useState(false);
  const api = useApi();
  const { addNotification } = useNotifications();
  
  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      // For now, create a comment with the counter offer details
      const counterMessage = `COUNTER OFFER:\n
Loan Amount: $${formData.loan_amount.toLocaleString()}
Interest Rate: ${formData.interest_rate}%
Loan Term: ${formData.loan_term} months
Establishment Fee: $${formData.establishment_fee || 0}
${formData.other_fees ? `Other Fees: ${formData.other_fees}\n` : ''}
${formData.conditions ? `Conditions: ${formData.conditions}\n` : ''}
${formData.counter_notes ? `\nNotes: ${formData.counter_notes}` : ''}`;
      
      await api.createDealComment(dealId, { comment: counterMessage });
      onSuccess();
    } catch (err) {
      addNotification({
        type: 'error',
        title: 'Failed to send counter offer',
        message: err.message
      });
    } finally {
      setSubmitting(false);
    }
  };
  
  return (
    <Modal isOpen={true} onClose={onClose} title="Counter Offer" size="large">
      <div className="counter-offer-form">
        <div className="form-group">
          <label>Loan Amount</label>
          <input
            type="number"
            value={formData.loan_amount}
            onChange={(e) => setFormData({ ...formData, loan_amount: e.target.value })}
            className="form-control"
          />
        </div>
        
        <div className="form-row">
          <div className="form-group">
            <label>Interest Rate (%)</label>
            <input
              type="number"
              step="0.1"
              value={formData.interest_rate}
              onChange={(e) => setFormData({ ...formData, interest_rate: e.target.value })}
              className="form-control"
            />
          </div>
          
          <div className="form-group">
            <label>Loan Term (months)</label>
            <input
              type="number"
              value={formData.loan_term}
              onChange={(e) => setFormData({ ...formData, loan_term: e.target.value })}
              className="form-control"
            />
          </div>
        </div>
        
        <div className="form-group">
          <label>Counter Offer Notes</label>
          <textarea
            value={formData.counter_notes}
            onChange={(e) => setFormData({ ...formData, counter_notes: e.target.value })}
            placeholder="Explain your counter offer..."
            className="form-control"
            rows="4"
          />
        </div>
        
        <div className="modal-actions">
          <button onClick={onClose} className="btn btn-outline">
            Cancel
          </button>
          <button 
            onClick={handleSubmit} 
            disabled={submitting}
            className="btn btn-primary"
          >
            {submitting ? 'Sending...' : 'Send Counter Offer'}
          </button>
        </div>
      </div>
    </Modal>
  );
};

const ContactInfoModal = ({ user, targetUser, dealId, isOpen, onClose }) => {
  const [showInfo, setShowInfo] = useState(false);
  const [sharing, setSharing] = useState(false);
  const api = useApi();
  const { addNotification } = useNotifications();

  const handleShareContact = async () => {
    setSharing(true);
    try {
      await api.shareContactInfo(user.id, targetUser.id);
      setShowInfo(true);
      
      addNotification({
        type: 'success',
        title: 'Contact Shared',
        message: 'Your contact information has been shared'
      });
    } catch (err) {
      addNotification({
        type: 'error',
        title: 'Share Failed',
        message: 'Failed to share contact information'
      });
    } finally {
      setSharing(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Contact Information" size="medium">
      <div className="contact-info-modal">
        {!showInfo ? (
          <>
            <p>Share contact information to continue discussions outside the platform.</p>
            
            <div className="contact-preview">
              <h4>Your Contact Info</h4>
              <div className="contact-details">
                <div className="contact-item">
                  <label>Name:</label>
                  <span>{user.name}</span>
                </div>
                <div className="contact-item">
                  <label>Email:</label>
                  <span>{user.email}</span>
                </div>
                {user.phone && (
                  <div className="contact-item">
                    <label>Phone:</label>
                    <span>{user.phone}</span>
                  </div>
                )}
                {user.company_name && (
                  <div className="contact-item">
                    <label>Company:</label>
                    <span>{user.company_name}</span>
                  </div>
                )}
              </div>
            </div>
            
            <button 
              onClick={handleShareContact}
              disabled={sharing}
              className="btn btn-primary btn-block"
            >
              {sharing ? 'Sharing...' : 'Share My Contact Info'}
            </button>
          </>
        ) : (
          <div className="shared-contacts">
            <h4>Contact Information Shared</h4>
            
            <div className="contact-card">
              <h5>{targetUser.name}</h5>
              <div className="contact-details">
                <div className="contact-item">
                  <label>Email:</label>
                  <a href={`mailto:${targetUser.email}`}>{targetUser.email}</a>
                </div>
                {targetUser.phone && (
                  <div className="contact-item">
                    <label>Phone:</label>
                    <a href={`tel:${targetUser.phone}`}>{targetUser.phone}</a>
                  </div>
                )}
                {targetUser.company_name && (
                  <div className="contact-item">
                    <label>Company:</label>
                    <span>{targetUser.company_name}</span>
                  </div>
                )}
                {targetUser.linkedin && (
                  <div className="contact-item">
                    <label>LinkedIn:</label>
                    <a href={targetUser.linkedin} target="_blank" rel="noopener noreferrer">
                      View Profile
                    </a>
                  </div>
                )}
              </div>
            </div>
            
            <button onClick={onClose} className="btn btn-primary btn-block">
              Close
            </button>
          </div>
        )}
      </div>
    </Modal>
  );
};

// ===========================
// PORTFOLIO PAGE
// ===========================

const Portfolio = () => {
  const api = useApi();
  const { addNotification } = useNotifications();
  const [investments, setInvestments] = useState([]);
  const [stats, setStats] = useState({
    totalInvested: 0,
    activeDeals: 0,
    avgReturn: 0,
    totalReturns: 0
  });
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState('date');
  const [filterStatus, setFilterStatus] = useState('all');

  useEffect(() => {
    fetchPortfolio();
  }, []);

  const fetchPortfolio = async () => {
    try {
      // Fetch approved access requests (investments)
      const requests = await api.getAccessRequests();
      const investments = requests.filter(req => 
        req.status === 'approved' || 
        req.status === 'due_diligence' || 
        req.status === 'term_sheet' || 
        req.status === 'funded'
      );
      
      setInvestments(investments);
      
      // Calculate stats
      const totalInvested = investments
        .filter(inv => inv.status === 'funded')
        .reduce((sum, inv) => sum + (inv.loan_amount || 0), 0);
      
      const activeDeals = investments.filter(inv => 
        inv.status !== 'declined' && inv.status !== 'closed'
      ).length;
      
      setStats({
        totalInvested,
        activeDeals,
        avgReturn: 12.5, // Placeholder - would come from backend
        totalReturns: totalInvested * 0.125 // Placeholder
      });
    } catch (err) {
      console.error('Failed to fetch portfolio:', err);
      addNotification({
        type: 'error',
        title: 'Load Failed',
        message: 'Failed to load portfolio data'
      });
    } finally {
      setLoading(false);
    }
  };

  const filteredInvestments = investments
    .filter(inv => {
      if (filterStatus === 'all') return true;
      return inv.status === filterStatus;
    })
    .sort((a, b) => {
      switch (sortBy) {
        case 'amount':
          return b.loan_amount - a.loan_amount;
        case 'status':
          return a.status.localeCompare(b.status);
        case 'date':
        default:
          return new Date(b.approved_at || b.requested_at) - new Date(a.approved_at || a.requested_at);
      }
    });

  const exportPortfolio = () => {
    const data = filteredInvestments.map(inv => ({
      'Project': inv.project_title,
      'Location': inv.suburb,
      'Amount': inv.loan_amount,
      'Status': inv.status,
      'Date': formatDate(inv.approved_at || inv.requested_at)
    }));
    
    downloadCSV(data, `portfolio_${new Date().toISOString().split('T')[0]}.csv`);
    
    addNotification({
      type: 'success',
      title: 'Export Complete',
      message: 'Portfolio data exported successfully'
    });
  };

  if (loading) return <LoadingSpinner />;

  return (
    <div className="portfolio-page">
      <div className="page-header">
        <h1>Investment Portfolio</h1>
        <p>Track and manage your property development investments</p>
      </div>

      <div className="portfolio-stats">
        <div className="stat-card">
          <div className="stat-icon"></div>
          <div className="stat-content">
            <div className="stat-value">{formatCurrency(stats.totalInvested)}</div>
            <div className="stat-label">Total Invested</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon"></div>
          <div className="stat-content">
            <div className="stat-value">{stats.activeDeals}</div>
            <div className="stat-label">Active Deals</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon"></div>
          <div className="stat-content">
            <div className="stat-value">{stats.avgReturn}%</div>
            <div className="stat-label">Avg Return</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon"></div>
          <div className="stat-content">
            <div className="stat-value">{formatCurrency(stats.totalReturns)}</div>
            <div className="stat-label">Total Returns</div>
          </div>
        </div>
      </div>

      <div className="investments-section">
        <div className="section-header">
          <h2>Active Investments</h2>
          <div className="section-actions">
            <select 
              value={filterStatus} 
              onChange={(e) => setFilterStatus(e.target.value)}
              className="form-select"
            >
              <option value="all">All Status</option>
              <option value="approved">Exploring</option>
              <option value="due_diligence">Due Diligence</option>
              <option value="term_sheet">Term Sheet</option>
              <option value="funded">Funded</option>
            </select>
            <select 
              value={sortBy} 
              onChange={(e) => setSortBy(e.target.value)}
              className="form-select"
            >
              <option value="date">Sort by Date</option>
              <option value="amount">Sort by Amount</option>
              <option value="status">Sort by Status</option>
            </select>
            <button onClick={exportPortfolio} className="btn btn-outline">
              Export CSV
            </button>
          </div>
        </div>

        {filteredInvestments.length === 0 ? (
          <EmptyState 
            icon=""
            title="No investments yet"
            message="Browse available projects to start building your portfolio"
            action={
              <Link to="/projects" className="btn btn-primary">
                Browse Projects
              </Link>
            }
          />
        ) : (
          <div className="investments-grid">
            {filteredInvestments.map((investment) => (
              <div key={investment.id} className="investment-card">
                <div className="investment-header">
                  <h3>{investment.project_title}</h3>
                  <StatusBadge status={investment.status} />
                </div>
                <div className="investment-details">
                  <div className="detail-item">
                    <label>Investment Amount</label>
                    <span>{formatCurrency(investment.loan_amount)}</span>
                  </div>
                  <div className="detail-item">
                    <label>Location</label>
                    <span>{investment.suburb}</span>
                  </div>
                  <div className="detail-item">
                    <label>Start Date</label>
                    <span>{formatDate(investment.approved_at || investment.requested_at)}</span>
                  </div>
                  <div className="detail-item">
                    <label>Expected Return</label>
                    <span>12.5% p.a.</span>
                  </div>
                </div>
                <div className="investment-actions">
                  <Link to={`/project/${investment.project_id}`} className="btn btn-outline">
                    View Details
                  </Link>
                  <Link to="/messages" className="btn btn-primary">
                    Message
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

// ===========================
// USER PROFILE PAGE
// ===========================

const UserProfile = () => {
  const api = useApi();
  const { user, refreshUser } = useApp();
  const { addNotification } = useNotifications();
  const navigate = useNavigate();
  const [profile, setProfile] = useState(null);
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showCancelSubscriptionModal, setShowCancelSubscriptionModal] = useState(false);
  const [downloadingData, setDownloadingData] = useState(false);

  useEffect(() => {
    fetchProfile();
  }, [user.id]);

  const fetchProfile = async () => {
    try {
      const data = await api.getUserProfile(user.id);
      setProfile(data);
    } catch (err) {
      addNotification({
        type: 'error',
        title: 'Load Failed',
        message: 'Failed to load profile'
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    
    try {
      await api.updateUserProfile(user.id, profile);
      await refreshUser();
      addNotification({
        type: 'success',
        title: 'Profile Updated',
        message: 'Your profile has been updated successfully'
      });
      setEditing(false);
    } catch (err) {
      addNotification({
        type: 'error',
        title: 'Update Failed',
        message: 'Failed to update profile'
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDownloadData = async () => {
    setDownloadingData(true);
    
    try {
      // For borrowers, download projects
      if (user.role === 'borrower') {
        const projects = await api.getProjects();
        downloadCSV(projects, `my_projects_${new Date().toISOString().split('T')[0]}.csv`);
      } else {
        // For funders, download portfolio
        const requests = await api.getAccessRequests();
        const portfolio = requests.filter(r => r.status !== 'pending' && r.status !== 'declined');
        downloadCSV(portfolio, `my_portfolio_${new Date().toISOString().split('T')[0]}.csv`);
      }
      
      addNotification({
        type: 'success',
        title: 'Download Complete',
        message: 'Your data has been downloaded successfully'
      });
    } catch (err) {
      addNotification({
        type: 'error',
        title: 'Download Failed',
        message: 'Failed to download data'
      });
    } finally {
      setDownloadingData(false);
    }
  };

  const handleCancelSubscription = async () => {
    try {
      await api.cancelSubscription();
      await refreshUser();
      addNotification({
        type: 'info',
        title: 'Subscription Cancelled',
        message: 'Your subscription will remain active until the end of the billing period'
      });
      setShowCancelSubscriptionModal(false);
    } catch (err) {
      addNotification({
        type: 'error',
        title: 'Cancellation Failed',
        message: 'Failed to cancel subscription'
      });
    }
  };

  const handleDeleteAccount = async () => {
    try {
      await api.deleteAccount('DELETE');
      addNotification({
        type: 'info',
        title: 'Account Deleted',
        message: 'Your account has been deleted'
      });
      navigate('/');
    } catch (err) {
      addNotification({
        type: 'error',
        title: 'Delete Failed',
        message: 'Failed to delete account'
      });
    }
  };

  if (loading) return <LoadingSpinner />;

  return (
    <div className="profile-page">
      <div className="profile-header">
        <h1>My Profile</h1>
        <button
          onClick={() => editing ? handleSave() : setEditing(true)}
          disabled={saving}
          className="btn btn-primary"
        >
          {saving ? 'Saving...' : editing ? 'Save Changes' : 'Edit Profile'}
        </button>
      </div>

      <div className="profile-content">
        <div className="profile-section">
          <h3>Basic Information</h3>
          <div className="profile-fields">
            <div className="field-group">
              <label>Full Name</label>
              {editing ? (
                <input
                  type="text"
                  value={profile.name}
                  onChange={(e) => setProfile({ ...profile, name: e.target.value })}
                  className="form-input"
                />
              ) : (
                <p>{profile.name}</p>
              )}
            </div>
            
            <div className="field-group">
              <label>Email</label>
              <p>{profile.email}</p>
            </div>
            
            <div className="field-group">
              <label>Role</label>
              <p className="role-badge">{profile.role}</p>
            </div>
            
            <div className="field-group">
              <label>Member Since</label>
              <p>{formatDate(profile.created_at)}</p>
            </div>
          </div>
        </div>

        {profile.role === 'funder' && (
          <div className="profile-section">
            <h3>Company Information</h3>
            <div className="profile-fields">
              <div className="field-group">
                <label>Company Name</label>
                {editing ? (
                  <input
                    type="text"
                    value={profile.company_name}
                    onChange={(e) => setProfile({ ...profile, company_name: e.target.value })}
                    className="form-input"
                  />
                ) : (
                  <p>{profile.company_name}</p>
                )}
              </div>
              
              <div className="field-group">
                <label>Company Type</label>
                {editing ? (
                  <select
                    value={profile.company_type}
                    onChange={(e) => setProfile({ ...profile, company_type: e.target.value })}
                    className="form-select"
                  >
                    <option value="Private Credit Fund">Private Credit Fund</option>
                    <option value="Investment Bank">Investment Bank</option>
                    <option value="Family Office">Family Office</option>
                    <option value="Hedge Fund">Hedge Fund</option>
                    <option value="Real Estate Fund">Real Estate Fund</option>
                    <option value="High Net Worth Individual">High Net Worth Individual</option>
                    <option value="Other">Other</option>
                  </select>
                ) : (
                  <p>{profile.company_type}</p>
                )}
              </div>
              
              <div className="field-group">
                <label>Investment Focus</label>
                {editing ? (
                  <select
                    value={profile.investment_focus}
                    onChange={(e) => setProfile({ ...profile, investment_focus: e.target.value })}
                    className="form-select"
                  >
                    <option value="Residential Development">Residential Development</option>
                    <option value="Commercial Development">Commercial Development</option>
                    <option value="Mixed-Use Development">Mixed-Use Development</option>
                    <option value="Industrial Development">Industrial Development</option>
                    <option value="All Property Types">All Property Types</option>
                  </select>
                ) : (
                  <p>{profile.investment_focus}</p>
                )}
              </div>
              
              <div className="field-group">
                <label>Deal Size Range</label>
                {editing ? (
                  <div className="range-inputs">
                    <NumberInput
                      value={profile.typical_deal_size_min}
                      onChange={(value) => setProfile({ ...profile, typical_deal_size_min: value })}
                      prefix="$"
                      placeholder="Min"
                    />
                    <span>to</span>
                    <NumberInput
                      value={profile.typical_deal_size_max}
                      onChange={(value) => setProfile({ ...profile, typical_deal_size_max: value })}
                      prefix="$"
                      placeholder="Max"
                    />
                  </div>
                ) : (
                  <p>{formatCurrency(profile.typical_deal_size_min)} - {formatCurrency(profile.typical_deal_size_max)}</p>
                )}
              </div>
            </div>
          </div>
        )}

        <div className="profile-section">
          <h3>Account Management</h3>
          <div className="account-actions">
            <button 
              onClick={handleDownloadData}
              disabled={downloadingData}
              className="btn btn-outline"
            >
              {downloadingData ? 'Downloading...' : 'Download My Data'}
            </button>
            
            {user.role === 'funder' && user.subscription_status === 'active' && (
              <button 
                onClick={() => setShowCancelSubscriptionModal(true)}
                className="btn btn-outline"
              >
                Cancel Subscription
              </button>
            )}
            
            <button 
              onClick={() => setShowDeleteModal(true)}
              className="btn btn-danger"
            >
              Delete Account
            </button>
          </div>
        </div>
      </div>

      <ConfirmationDialog 
        isOpen={showCancelSubscriptionModal}
        onClose={() => setShowCancelSubscriptionModal(false)}
        onConfirm={handleCancelSubscription}
        title="Cancel Subscription"
        message="Are you sure you want to cancel your subscription? You will retain access until the end of your current billing period."
        confirmText="Cancel Subscription"
      />

      <ConfirmationDialog 
        isOpen={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        onConfirm={handleDeleteAccount}
        title="Delete Account"
        message='This action cannot be undone. All your data will be permanently deleted. Please type "DELETE" to confirm.'
        confirmText="Delete Account"
        danger={true}
      />
    </div>
  );
};

// ===========================
// SETTINGS PAGE
// ===========================

const SettingsPage = () => {
  const api = useApi();
  const { user } = useApp();
  const { addNotification } = useNotifications();
  const [emailPreferences, setEmailPreferences] = useState({
    // Common
    email_messages: true,
    email_project_updates: true,
    email_newsletter: false,
    
    // Borrower specific
    email_access_requests: true,
    email_deal_engagement: true,
    email_proposals: true,
    email_document_requests: true,
    email_project_published: true,
    email_project_rejected: true,
    
    // Funder specific
    email_access_approved: true,
    email_proposal_response: true,
    email_borrower_messages: true,
    email_account_approved: true,
    email_payment_success: true
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchNotificationPreferences();
  }, []);

  const fetchNotificationPreferences = async () => {
    try {
      const prefs = await api.getNotificationPreferences();
      setEmailPreferences(prefs);
    } catch (err) {
      console.error('Failed to fetch notification preferences:', err);
    }
  };

  const handleSaveNotifications = async () => {
    setSaving(true);
    try {
      await api.updateNotificationPreferences(emailPreferences);
      addNotification({
        type: 'success',
        title: 'Settings Saved',
        message: 'Your notification preferences have been updated'
      });
    } catch (err) {
      addNotification({
        type: 'error',
        title: 'Save Failed',
        message: 'Failed to update notification preferences'
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="settings-page">
      <div className="page-header">
        <h1>Settings</h1>
        <p>Manage your notification preferences and account settings</p>
      </div>

      <div className="settings-content">
        <div className="settings-section">
          <h3>Email Notifications</h3>
          <p className="section-description">
            Choose which email notifications you'd like to receive from Tranch
          </p>
          
          <div className="settings-list">
            {/* Common Notifications */}
            <div className="settings-group">
              <h4>General Notifications</h4>
              
              <div className="setting-item">
                <div className="setting-info">
                  <label>Messages</label>
                  <p className="setting-description">
                    Receive email notifications when you get new messages
                  </p>
                </div>
                <div className="setting-control">
                  <label className="switch">
                    <input
                      type="checkbox"
                      checked={emailPreferences.email_messages}
                      onChange={(e) => setEmailPreferences({ ...emailPreferences, email_messages: e.target.checked })}
                    />
                    <span className="slider"></span>
                  </label>
                </div>
              </div>

              <div className="setting-item">
                <div className="setting-info">
                  <label>Project Updates</label>
                  <p className="setting-description">
                    Updates about projects you're involved with
                  </p>
                </div>
                <div className="setting-control">
                  <label className="switch">
                    <input
                      type="checkbox"
                      checked={emailPreferences.email_project_updates}
                      onChange={(e) => setEmailPreferences({ ...emailPreferences, email_project_updates: e.target.checked })}
                    />
                    <span className="slider"></span>
                  </label>
                </div>
              </div>

              <div className="setting-item">
                <div className="setting-info">
                  <label>Newsletter</label>
                  <p className="setting-description">
                    Monthly newsletter with platform updates and market insights
                  </p>
                </div>
                <div className="setting-control">
                  <label className="switch">
                    <input
                      type="checkbox"
                      checked={emailPreferences.email_newsletter}
                      onChange={(e) => setEmailPreferences({ ...emailPreferences, email_newsletter: e.target.checked })}
                    />
                    <span className="slider"></span>
                  </label>
                </div>
              </div>
            </div>

            {/* Borrower Notifications */}
            {user.role === 'borrower' && (
              <div className="settings-group">
                <h4>Developer Notifications</h4>
                
                <div className="setting-item">
                  <div className="setting-info">
                    <label>Access Requests</label>
                    <p className="setting-description">
                      When funders request access to your projects
                    </p>
                  </div>
                  <div className="setting-control">
                    <label className="switch">
                      <input
                        type="checkbox"
                        checked={emailPreferences.email_access_requests}
                        onChange={(e) => setEmailPreferences({ ...emailPreferences, email_access_requests: e.target.checked })}
                      />
                      <span className="slider"></span>
                    </label>
                  </div>
                </div>

                <div className="setting-item">
                  <div className="setting-info">
                    <label>Deal Engagement</label>
                    <p className="setting-description">
                      When funders engage to create a deal room
                    </p>
                  </div>
                  <div className="setting-control">
                    <label className="switch">
                      <input
                        type="checkbox"
                        checked={emailPreferences.email_deal_engagement}
                        onChange={(e) => setEmailPreferences({ ...emailPreferences, email_deal_engagement: e.target.checked })}
                      />
                      <span className="slider"></span>
                    </label>
                  </div>
                </div>

                <div className="setting-item">
                  <div className="setting-info">
                    <label>Funding Proposals</label>
                    <p className="setting-description">
                      When funders submit proposals or request documents
                    </p>
                  </div>
                  <div className="setting-control">
                    <label className="switch">
                      <input
                        type="checkbox"
                        checked={emailPreferences.email_proposals}
                        onChange={(e) => setEmailPreferences({ ...emailPreferences, email_proposals: e.target.checked })}
                      />
                      <span className="slider"></span>
                    </label>
                  </div>
                </div>

                <div className="setting-item">
                  <div className="setting-info">
                    <label>Project Published</label>
                    <p className="setting-description">
                      When your project is published on the platform
                    </p>
                  </div>
                  <div className="setting-control">
                    <label className="switch">
                      <input
                        type="checkbox"
                        checked={emailPreferences.email_project_published}
                        onChange={(e) => setEmailPreferences({ ...emailPreferences, email_project_published: e.target.checked })}
                      />
                      <span className="slider"></span>
                    </label>
                  </div>
                </div>
              </div>
            )}

            {/* Funder Notifications */}
            {user.role === 'funder' && (
              <div className="settings-group">
                <h4>Investor Notifications</h4>
                
                <div className="setting-item">
                  <div className="setting-info">
                    <label>Access Approved</label>
                    <p className="setting-description">
                      When developers approve your access requests
                    </p>
                  </div>
                  <div className="setting-control">
                    <label className="switch">
                      <input
                        type="checkbox"
                        checked={emailPreferences.email_access_approved}
                        onChange={(e) => setEmailPreferences({ ...emailPreferences, email_access_approved: e.target.checked })}
                      />
                      <span className="slider"></span>
                    </label>
                  </div>
                </div>

                <div className="setting-item">
                  <div className="setting-info">
                    <label>Proposal Responses</label>
                    <p className="setting-description">
                      When developers accept, reject, or counter your proposals
                    </p>
                  </div>
                  <div className="setting-control">
                    <label className="switch">
                      <input
                        type="checkbox"
                        checked={emailPreferences.email_proposal_response}
                        onChange={(e) => setEmailPreferences({ ...emailPreferences, email_proposal_response: e.target.checked })}
                      />
                      <span className="slider"></span>
                    </label>
                  </div>
                </div>

                <div className="setting-item">
                  <div className="setting-info">
                    <label>Account Approved</label>
                    <p className="setting-description">
                      When your account is approved for platform access
                    </p>
                  </div>
                  <div className="setting-control">
                    <label className="switch">
                      <input
                        type="checkbox"
                        checked={emailPreferences.email_account_approved}
                        onChange={(e) => setEmailPreferences({ ...emailPreferences, email_account_approved: e.target.checked })}
                      />
                      <span className="slider"></span>
                    </label>
                  </div>
                </div>

                <div className="setting-item">
                  <div className="setting-info">
                    <label>Payment Success</label>
                    <p className="setting-description">
                      Confirmation when subscription payments are processed
                    </p>
                  </div>
                  <div className="setting-control">
                    <label className="switch">
                      <input
                        type="checkbox"
                        checked={emailPreferences.email_payment_success}
                        onChange={(e) => setEmailPreferences({ ...emailPreferences, email_payment_success: e.target.checked })}
                      />
                      <span className="slider"></span>
                    </label>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="settings-actions">
            <button 
              onClick={handleSaveNotifications}
              disabled={saving}
              className="btn btn-primary"
            >
              {saving ? 'Saving...' : 'Save Email Preferences'}
            </button>
          </div>
        </div>

        {/* Account Settings */}
        <div className="settings-section">
          <h3>Account Settings</h3>
          <div className="settings-list">
            <div className="setting-item">
              <div className="setting-info">
                <label>Change Password</label>
                <p className="setting-description">
                  Update your account password
                </p>
              </div>
              <Link to="/profile" className="btn btn-outline">
                Manage Account
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// ===========================
// MOBILE TABLE WRAPPER
// ===========================

const MobileTableWrapper = ({ children, data, renderCard, className = '' }) => {
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth <= 768);
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  if (isMobile && data && renderCard) {
    return (
      <div className={`mobile-cards ${className}`}>
        {data.map((item, index) => renderCard(item, index))}
      </div>
    );
  }

  return <div className={`desktop-table-view ${className}`}>{children}</div>;
};

// ===========================
// ADMIN PANEL
// ===========================

// First, define these components OUTSIDE of AdminPanel

// UnpaidProjectsManager Component
const UnpaidProjectsManager = ({ api, addNotification }) => {
  const [unpaidProjects, setUnpaidProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [selectedProject, setSelectedProject] = useState(null);
  const [rejectReason, setRejectReason] = useState('');

  useEffect(() => {
    fetchUnpaidProjects();
  }, []);

  const fetchUnpaidProjects = async () => {
    try {
      const response = await api.getUnpaidProjects();
      setUnpaidProjects(response || []);
    } catch (err) {
      console.error('Failed to fetch unpaid projects:', err);
      addNotification({
        type: 'error',
        title: 'Load Failed',
        message: 'Failed to fetch unpaid projects'
      });
    } finally {
      setLoading(false);
    }
  };

  const checkStripePayment = async (projectId) => {
    try {
      const result = await api.checkStripePayment(projectId);
      
      if (result.hasPayment && result.paymentStatus === 'succeeded') {
        addNotification({
          type: 'success',
          title: 'Payment Confirmed',
          message: `Stripe payment of ${formatCurrency(result.amount / 100)} confirmed`
        });
        
        if (confirm('Payment confirmed in Stripe. Sync and publish project?')) {
          await syncStripePayment(projectId);
        }
      } else {
        addNotification({
          type: 'warning',
          title: 'No Successful Payment',
          message: result.message || 'No successful payment found in Stripe'
        });
      }
    } catch (err) {
      addNotification({
        type: 'error',
        title: 'Check Failed',
        message: 'Failed to check Stripe payment status'
      });
    }
  };
const revertToDraft = async (project) => {
  const reason = prompt('Reason for reverting to draft:');
  if (!reason) return;

  try {
    await api.request(`/admin/revert-to-draft/${project.id}`, {
      method: 'POST',
      body: JSON.stringify({ reason })
    });
    
    addNotification({
      type: 'success',
      title: 'Project Reverted',
      message: `${project.title} has been reverted to draft status`
    });
    
    await fetchUnpaidProjects();
  } catch (err) {
    addNotification({
      type: 'error',
      title: 'Revert Failed',
      message: err.message || 'Failed to revert project'
    });
  }
};


  const syncStripePayment = async (projectId) => {
    try {
      const result = await api.syncStripePayment(projectId);
      
      if (result.projectUpdated) {
        addNotification({
          type: 'success',
          title: 'Project Published',
          message: 'Payment synced and project published successfully'
        });
        await fetchUnpaidProjects();
      } else {
        addNotification({
          type: 'warning',
          title: 'Sync Failed',
          message: result.message
        });
      }
    } catch (err) {
      addNotification({
        type: 'error',
        title: 'Sync Failed',
        message: 'Failed to sync payment'
      });
    }
  };

  const forcePublish = async (project) => {
    const reason = prompt('Reason for force publishing:');
    if (!reason) return;

    console.log('Force publishing project:', project.id, 'Reason:', reason);

    try {
      const response = await api.forcePublishProject(project.id, reason, false);
      console.log('Force publish response:', response);
      
      addNotification({
        type: 'success',
        title: 'Project Force Published',
        message: `${project.title} is now live`
      });
      
      // Send email notification to borrower
      await api.sendEmailNotification('project_published', project.borrower_id, {
        project_title: project.title,
        admin_action: true
      });
      
      await fetchUnpaidProjects();
    } catch (err) {
      console.error('Force publish error:', err);
      addNotification({
        type: 'error',
        title: 'Force Publish Failed',
        message: err.message || 'Failed to force publish project'
      });
    }
  };

  const handleReject = async () => {
    if (!rejectReason.trim()) {
      addNotification({
        type: 'error',
        title: 'Reason Required',
        message: 'Please provide a reason for rejection'
      });
      return;
    }

    try {
      await api.rejectProject(selectedProject.id, rejectReason);
      
      addNotification({
        type: 'success',
        title: 'Project Rejected',
        message: `${selectedProject.title} has been moved back to draft status`
      });
      
      // Send email notification to borrower
      await api.sendEmailNotification('project_rejected', selectedProject.borrower_id, {
        project_title: selectedProject.title,
        reason: rejectReason
      });
      
      setShowRejectModal(false);
      setRejectReason('');
      setSelectedProject(null);
      await fetchUnpaidProjects();
    } catch (err) {
      addNotification({
        type: 'error',
        title: 'Rejection Failed',
        message: err.message || 'Failed to reject project'
      });
    }
  };

  const pushBackToDraft = async (project) => {
    const reason = prompt('Reason for pushing back to draft (payment pending -> draft):');
    if (!reason) return;

    try {
      await api.request(`/admin/revert-to-draft/${project.id}`, {
        method: 'POST',
        body: JSON.stringify({ reason: `Payment pending to draft: ${reason}` })
      });
      
      addNotification({
        type: 'success',
        title: 'Project Pushed to Draft',
        message: 'Project has been pushed back to draft status (pre-payment state)'
      });
      
      await fetchUnpaidProjects();
    } catch (err) {
      addNotification({
        type: 'error',
        title: 'Action Failed',
        message: err.message || 'Failed to push project to draft'
      });
    }
  };

  const confirmPaymentAndPublish = async (project) => {
    const reason = prompt('Reason for confirming payment and publishing:');
    if (!reason) return;

    try {
      await api.request(`/admin/confirm-payment/${project.id}`, {
        method: 'POST',
        body: JSON.stringify({ 
          paymentIntentId: project.stripe_payment_intent_id,
          reason: reason 
        })
      });
      
      addNotification({
        type: 'success',
        title: 'Payment Confirmed & Published',
        message: 'Project payment has been confirmed and project is now published'
      });
      
      await fetchUnpaidProjects();
    } catch (err) {
      addNotification({
        type: 'error',
        title: 'Action Failed',
        message: err.message || 'Failed to confirm payment'
      });
    }
  };

  if (loading) return <div>Loading unpaid projects...</div>;

  return (
    <>
      <div className="unpaid-projects-list">
        {unpaidProjects.length === 0 ? (
          <p>No unpaid projects found</p>
        ) : (
          <div className="projects-table">
            <table>
              <thead>
                <tr>
                  <th>Project</th>
                  <th>Borrower</th>
                  <th>Amount</th>
                  <th>Created</th>
                  <th>Payment Info</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {unpaidProjects.map(project => (
                  <tr key={project.id}>
                    <td>
                      <strong>{project.title}</strong>
                      <br />
                      <small>{project.suburb}</small>
                    </td>
                    <td>
                      {project.borrower_name}
                      <br />
                      <small>{project.borrower_email}</small>
                    </td>
                    <td>{formatCurrency(project.loan_amount)}</td>
                    <td>{formatDate(project.created_at)}</td>
                    <td>
                      {project.stripe_payment_intent_id ? (
                        <>
                          <StatusBadge status={project.payment_status || 'pending'} />
                          <br />
                          <small>{project.payment_date ? formatDateTime(project.payment_date) : 'No date'}</small>
                        </>
                      ) : (
                        <span className="text-muted">No payment</span>
                      )}
                    </td>
                    <td>
                      <div className="action-buttons">
                        {project.payment_status === 'pending' && (
                          <>
                            <button
                              onClick={() => pushBackToDraft(project)}
                              className="btn btn-sm btn-warning"
                              title="Push back to draft (pre-payment state)"
                            >
                              → Draft
                            </button>
                            <button
                              onClick={() => confirmPaymentAndPublish(project)}
                              className="btn btn-sm btn-success"
                              title="Confirm payment and publish"
                            >
                              → Published
                            </button>
                          </>
                        )}
                        <button
                          onClick={() => checkStripePayment(project.id)}
                          className="btn btn-sm btn-info"
                          title="Check if payment exists in Stripe"
                        >
                          Check Stripe
                        </button>
                        <button
                          onClick={() => forcePublish(project)}
                          className="btn btn-sm btn-primary"
                          title="Force publish without payment verification"
                        >
                          Force Publish
                        </button>
                        <button
                          onClick={() => {
                            setSelectedProject(project);
                            setShowRejectModal(true);
                          }}
                          className="btn btn-sm btn-danger"
                          title="Reject and move back to draft"
                        >
                          Reject
                        </button>
                        <Link
                          to={`/project/${project.id}?admin_review=true`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="btn btn-sm btn-outline"
                          title="Review project details"
                        >
                          Review
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Reject Modal */}
      <Modal
        isOpen={showRejectModal}
        onClose={() => {
          setShowRejectModal(false);
          setRejectReason('');
          setSelectedProject(null);
        }}
        title="Reject Project"
        size="medium"
      >
        <div className="reject-modal">
          <p>
            Rejecting "<strong>{selectedProject?.title}</strong>" will move it back to draft status 
            and notify the borrower.
          </p>
          
          <div className="form-group">
            <label>Feedback for Borrower *</label>
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Please provide detailed feedback for the borrower. Be specific about what needs to be fixed or improved before resubmission.&#10;&#10;Examples:&#10;- Missing financial projections for Year 2&#10;- LVR calculation appears incorrect&#10;- Please upload the valuation report&#10;- Development timeline needs more detail"
              rows="6"
              className="form-textarea"
            />
            <small className="text-muted">This feedback will be sent to the borrower via email and shown in their dashboard.</small>
          </div>
          
          <div className="modal-actions">
            <button 
              onClick={() => {
                setShowRejectModal(false);
                setRejectReason('');
                setSelectedProject(null);
              }}
              className="btn btn-outline"
            >
              Cancel
            </button>
            <button 
              onClick={handleReject}
              disabled={!rejectReason.trim()}
              className="btn btn-danger"
            >
              Send Feedback & Return to Draft
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
};

// OverrideHistory Component
const OverrideHistory = ({ api }) => {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchHistory();
  }, []);

  const fetchHistory = async () => {
    try {
      const response = await api.getOverrideHistory();
      setHistory(response);
    } catch (err) {
      console.error('Failed to fetch override history:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <div>Loading history...</div>;

  return (
    <div className="override-history">
      <table>
        <thead>
          <tr>
            <th>Date</th>
            <th>Admin</th>
            <th>Action</th>
            <th>Target</th>
            <th>Reason</th>
          </tr>
        </thead>
        <tbody>
          {history.slice(0, 10).map(override => (
            <tr key={override.id}>
              <td>{formatDateTime(override.created_at)}</td>
              <td>{override.admin_name}</td>
              <td>{override.action_type.replace('_', ' ')}</td>
              <td>{override.target_type} #{override.target_id}</td>
              <td>{override.reason}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

// Admin Message Modal Component
const AdminMessageModal = ({ isOpen, onClose, user, onSend }) => {
  const api = useApi();
  const { addNotification } = useNotifications();
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  
  const handleSend = async () => {
    if (!message.trim()) {
      addNotification({
        type: 'error',
        title: 'Error',
        message: 'Please enter a message'
      });
      return;
    }
    
    setSending(true);
    try {
      await api.sendAdminMessage(user.id, message);
      addNotification({
        type: 'success',
        title: 'Message Sent',
        message: `Message sent to ${user.name}`
      });
      setMessage('');
      onClose();
      if (onSend) onSend();
    } catch (err) {
      addNotification({
        type: 'error',
        title: 'Send Failed',
        message: err.message
      });
    } finally {
      setSending(false);
    }
  };
  
  if (!isOpen || !user) return null;
  
  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`Message ${user.name}`}>
      <div className="admin-message-modal">
        <div className="user-info">
          <p><strong>Email:</strong> {user.email}</p>
          <p><strong>Role:</strong> {user.role}</p>
        </div>
        
        <div className="message-input">
          <label>Message</label>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Type your message here..."
            rows={6}
            className="form-control"
          />
        </div>
        
        <div className="modal-actions">
          <button 
            onClick={onClose} 
            className="btn btn-outline"
            disabled={sending}
          >
            Cancel
          </button>
          <button 
            onClick={handleSend} 
            className="btn btn-primary"
            disabled={sending || !message.trim()}
          >
            {sending ? 'Sending...' : 'Send Message'}
          </button>
        </div>
      </div>
    </Modal>
  );
};

// Now the corrected AdminPanel component
const AdminPanel = () => {
  const api = useApi();
  const { addNotification } = useNotifications();
  const [activeTab, setActiveTab] = useState('overview');
  const [users, setUsers] = useState([]);
  const [stats, setStats] = useState(null);
  const [settings, setSettings] = useState([]);
  const [payments, setPayments] = useState([]);
  const [projects, setProjects] = useState([]);
  const [pendingProjects, setPendingProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedUser, setSelectedUser] = useState(null);
  const [showUserModal, setShowUserModal] = useState(false);
  const [showOverrideModal, setShowOverrideModal] = useState(false);
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [selectedProject, setSelectedProject] = useState(null);
  const [overrideType, setOverrideType] = useState('');
  const [overrideTarget, setOverrideTarget] = useState(null);
  const [overrideReason, setOverrideReason] = useState('');
const [denialReason, setDenialReason] = useState('');
  const [paymentNotReceived, setPaymentNotReceived] = useState(false);
  const [showMessageModal, setShowMessageModal] = useState(false);

  const handleProjectStateChange = async (projectId, newStatus) => {
    const reason = prompt(`Reason for changing to ${newStatus}:`);
    if (!reason) return;

    try {
      const statusData = {
        status: newStatus,
        reason: reason,
        payment_status: newStatus === 'draft' ? 'unpaid' : 
                        newStatus === 'payment_pending' ? 'payment_pending' : 
                        'paid',
        visible: newStatus === 'published'
      };

      await api.updateProjectStatus(projectId, statusData);
      
      addNotification({
        type: 'success',
        title: 'Status Updated',
        message: `Project status changed to ${newStatus}`
      });
      
      fetchProjects();
    } catch (err) {
      addNotification({
        type: 'error',
        title: 'Update Failed',
        message: err.message
      });
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    if (activeTab === 'godmode') {
      fetchPayments();
    } else if (activeTab === 'projects') {
      fetchProjects();
    }
  }, [activeTab]);

  const fetchData = async () => {
    try {
      const [usersData, statsData, settingsData] = await Promise.all([
        api.getUsers(),
        api.getAdminStats(),
        api.getSystemSettings()
      ]);
      
      setUsers(usersData);
      setStats(statsData);
      setSettings(settingsData);
      
      // Fetch pending projects for the notification badge
      const projectsData = await api.getAdminProjects({ status: 'pending_review' });
      setPendingProjects(projectsData);
    } catch (err) {
      addNotification({
        type: 'error',
        title: 'Load Failed',
        message: 'Failed to fetch admin data'
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchPayments = async () => {
    try {
      const paymentsData = await api.getAllPayments();
      setPayments(paymentsData);
    } catch (err) {
      console.error('Failed to fetch payments:', err);
    }
  };

  const fetchProjects = async () => {
    try {
      const projectsData = await api.getAdminProjects();
      setProjects(projectsData);
    } catch (err) {
      console.error('Failed to fetch projects:', err);
    }
  };

  const handleOverride = (type, target) => {
    setOverrideType(type);
    setOverrideTarget(target);
    setShowOverrideModal(true);
  };

  const executeOverride = async () => {
    if (!overrideReason.trim()) {
      addNotification({
        type: 'error',
        title: 'Reason Required',
        message: 'You must provide a reason for this override'
      });
      return;
    }

    try {
      switch (overrideType) {
        case 'approve-funder':
          await api.forceApproveFunder(overrideTarget.id, overrideReason);
          addNotification({
            type: 'success',
            title: 'Funder Force Approved',
            message: `${overrideTarget.name} has been approved with active subscription`
          });
          break;
          
        case 'publish-project':
          await api.forcePublishProject(overrideTarget.id, overrideReason);
          addNotification({
            type: 'success',
            title: 'Project Force Published',
            message: 'Project is now live on the platform'
          });
          break;
          
        case 'approve-project':
          await api.approveProject(overrideTarget.id);
          addNotification({
            type: 'success',
            title: 'Project Approved',
            message: 'Project has been approved and published'
          });
          setPendingProjects(prev => prev.filter(p => p.id !== overrideTarget.id));
          fetchProjects();
          break;
          
        case 'deny-project':
          await api.denyProject(overrideTarget.id, overrideReason);
          addNotification({
            type: 'success',
            title: 'Project Denied',
            message: 'Project has been denied and borrower notified'
          });
          setPendingProjects(prev => prev.filter(p => p.id !== overrideTarget.id));
          fetchProjects();
          break;
          
        case 'payment-failed':
          await api.markPaymentFailed(overrideTarget.id);
          addNotification({
            type: 'success',
            title: 'Payment Failed',
            message: 'Project returned to draft due to payment failure'
          });
          setPendingProjects(prev => prev.filter(p => p.id !== overrideTarget.id));
          fetchProjects();
          break;
          
        case 'complete-deal':
          await api.forceCompleteDeal(overrideTarget.id, overrideReason);
          addNotification({
            type: 'success',
            title: 'Deal Force Completed',
            message: 'Deal has been marked as completed'
          });
          break;
      }
      
      setShowOverrideModal(false);
      setOverrideReason('');
      fetchData(); // Refresh data
    } catch (err) {
      addNotification({
        type: 'error',
        title: 'Override Failed',
        message: err.message
      });
    }
  };

  const exportPlatformData = async () => {
    try {
      const data = await api.exportAllData();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `tranch_platform_export_${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
      
      addNotification({
        type: 'success',
        title: 'Export Complete',
        message: 'Platform data exported successfully'
      });
    } catch (err) {
      addNotification({
        type: 'error',
        title: 'Export Failed',
        message: 'Failed to export platform data'
      });
    }
  };

  // Count pending subscriptions
  const pendingSubscriptions = users.filter(u => 
    u.role === 'funder' && u.subscription_status === 'payment_pending'
  );

  const tabs = [
    { id: 'overview', label: 'Overview' },
    { 
      id: 'projects', 
      label: `Projects${pendingProjects.length > 0 ? ` (${pendingProjects.length} pending)` : ''}`,
      notification: pendingProjects.length > 0
    },
    { id: 'users', label: `Users (${users.length})` },
    { 
      id: 'subscriptions', 
      label: `Subscriptions${pendingSubscriptions.length > 0 ? ` (${pendingSubscriptions.length} pending)` : ''}`,
      notification: pendingSubscriptions.length > 0
    },
    { id: 'funders', label: 'Funders' },
    { id: 'godmode', label: '🔴 God Mode' },
    { id: 'analytics', label: 'Analytics' },
    { id: 'settings', label: 'Settings' }
  ];

  if (loading) return <LoadingSpinner />;

  return (
    <div className="admin-panel">
      <div className="admin-header">
        <h1>Admin Panel</h1>
        <button onClick={exportPlatformData} className="btn btn-outline">
          Export All Data
        </button>
      </div>

      <Tabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab} />

      <div className="admin-content">
        {/* Overview Tab */}
        {activeTab === 'overview' && stats && (
          <div className="admin-overview">
            <div className="stats-grid">
              <div className="stat-card">
                <h3>Total Users</h3>
                <div className="stat-value">{stats.total_users}</div>
              </div>
              <div className="stat-card">
                <h3>Total Projects</h3>
                <div className="stat-value">{stats.total_projects}</div>
              </div>
              <div className="stat-card">
                <h3>Active Projects</h3>
                <div className="stat-value">{stats.active_projects}</div>
              </div>
              <div className="stat-card">
                <h3>Total Revenue</h3>
                <div className="stat-value">{formatCurrency(stats.total_revenue || 0)}</div>
              </div>
            </div>
          </div>
        )}

        {/* Projects Tab */}
        {activeTab === 'projects' && (
          <div className="admin-projects">
            <div className="projects-header">
              <h3>Project Management</h3>
              <div className="filter-buttons">
                <button 
                  onClick={() => fetchProjects()} 
                  className="btn btn-sm btn-outline"
                >
                  All Projects
                </button>
                <button 
                  onClick={async () => {
                    const data = await api.getAdminProjects({ status: 'pending_review' });
                    setProjects(data);
                  }} 
                  className="btn btn-sm btn-warning"
                >
                  Pending Review ({pendingProjects.length})
                </button>
                <button 
                  onClick={async () => {
                    const data = await api.getAdminProjects({ status: 'published' });
                    setProjects(data);
                  }} 
                  className="btn btn-sm btn-success"
                >
                  Published
                </button>
              </div>
            </div>

            {pendingProjects.length > 0 && (
              <div className="alert alert-warning" style={{ margin: '1rem 0' }}>
                <strong>⚠️ {pendingProjects.length} projects pending review!</strong>
                <p>These projects have completed payment and are waiting for admin approval.</p>
              </div>
            )}

            <MobileTableWrapper 
              data={projects}
              renderCard={(project) => (
                <div key={project.id} className={`admin-card ${project.payment_status === 'payment_pending' ? 'highlight-card' : ''}`}>
                  <div className="admin-card-header">
                    <div>
                      <h4 className="admin-card-title">{project.title}</h4>
                      <div className="admin-card-meta">
                        <span>{project.borrower_name}</span>
                        <span>{project.borrower_email}</span>
                      </div>
                    </div>
                    <StatusBadge 
                      status={
                        project.payment_status === 'payment_pending' ? 'Pending Review' :
                        project.visible ? 'Published' : 
                        project.submission_status === 'rejected' ? 'Rejected' : 'Draft'
                      } 
                    />
                  </div>
                  
                  <div className="admin-card-details">
                    <div className="admin-card-row">
                      <span>Loan Amount</span>
                      <span>{formatCurrency(project.loan_amount)}</span>
                    </div>
                    <div className="admin-card-row">
                      <span>Payment Status</span>
                      <StatusBadge status={project.payment_status} />
                    </div>
                    <div className="admin-card-row">
                      <span>Created</span>
                      <span>{formatDate(project.created_at)}</span>
                    </div>
                  </div>
                  
                  <div className="admin-card-actions">
                    <button 
                      onClick={() => window.open(`/project/${project.id}`, '_blank')}
                      className="btn btn-sm btn-outline"
                    >
                      View
                    </button>
                    {project.payment_status === 'payment_pending' && (
                      <>
                        <button 
                          onClick={async () => {
                            await api.approveProject(project.id);
                            fetchProjects();
                            addNotification({
                              type: 'success',
                              title: 'Project Approved',
                              message: 'Project has been published successfully'
                            });
                          }}
                          className="btn btn-sm btn-primary"
                        >
                          Approve
                        </button>
                        <button 
                          onClick={() => {
                            setSelectedProject(project);
                            setShowReviewModal(true);
                          }}
                          className="btn btn-sm btn-danger"
                        >
                          Reject
                        </button>
                      </>
                    )}
                  </div>
                </div>
              )}
            >
              <div className="projects-table">
                <table>
                  <thead>
                    <tr>
                      <th>Title</th>
                      <th>Borrower</th>
                      <th>Loan Amount</th>
                      <th>Status</th>
                      <th>Payment</th>
                      <th>Created</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {projects.map(project => (
                      <tr key={project.id} className={project.payment_status === 'payment_pending' ? 'highlight-row' : ''}>
                        <td>{project.title}</td>
                        <td>
                          <div>
                            <div>{project.borrower_name}</div>
                            <small>{project.borrower_email}</small>
                          </div>
                        </td>
                        <td>{formatCurrency(project.loan_amount)}</td>
                        <td>
                          <StatusBadge 
                            status={
                              project.payment_status === 'payment_pending' ? 'Pending Review' :
                              project.visible ? 'Published' : 
                              project.submission_status === 'rejected' ? 'Rejected' : 'Draft'
                            } 
                          />
                        </td>
                        <td>
                          <StatusBadge status={project.payment_status} />
                          {project.payment_intent_id && (
                            <div style={{ fontSize: '0.75rem', marginTop: '0.25rem' }}>
                              {project.payment_intent_id}
                            </div>
                        )}
                      </td>
                      <td>{formatDate(project.created_at)}</td>
                      <td>
                        <div className="action-buttons">
                          {project.payment_status === 'payment_pending' && (
                            <>
                              <button 
                                onClick={() => {
                                  setSelectedProject(project);
                                  setShowReviewModal(true);
                                }}
                                className="btn btn-sm btn-primary"
                              >
                                Review
                              </button>
                              <button 
                                onClick={() => handleOverride('approve-project', project)}
                                className="btn btn-sm btn-success"
                              >
                                Quick Approve
                              </button>
                            </>
                          )}
                          {project.payment_status === 'paid' && project.submission_status === 'rejected' && (
                            <button 
                              onClick={() => handleOverride('approve-project', project)}
                              className="btn btn-sm btn-warning"
                            >
                              Re-approve
                            </button>
                          )}
                          {project.payment_status === 'unpaid' && (
                            <button 
                              onClick={() => handleOverride('publish-project', project)}
                              className="btn btn-sm btn-danger"
                            >
                              Force Publish
                            </button>
                          )}
                          <a 
                            href={`/project/${project.id}`} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="btn btn-sm btn-outline"
                          >
                            View
                          </a>
                          
                          {/* Universal State Control */}
                          <select
                            onChange={(e) => {
                              if (e.target.value) {
                                handleProjectStateChange(project.id, e.target.value);
                                e.target.value = ''; // Reset dropdown
                              }
                            }}
                            className="btn btn-sm btn-outline"
                            defaultValue=""
                          >
                            <option value="">Change Status...</option>
                            <option value="draft">→ Draft (Unpaid)</option>
                            <option value="payment_pending">→ Payment Pending</option>
                            <option value="paid_unpublished">→ Paid (Not Published)</option>
                            <option value="published">→ Published (Live)</option>
                            <option value="rejected">→ Rejected</option>
                          </select>
                        </div>
                      </td>
                      
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </MobileTableWrapper>
          </div>
        )}

        {/* Users Tab */}
        {activeTab === 'users' && (
          <div className="admin-users">
            <div className="users-table">
              <table>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Role</th>
                    <th>Status</th>
                    <th>Joined</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map(user => (
                    <tr key={user.id}>
                      <td>{user.name}</td>
                      <td>{user.email}</td>
                      <td><StatusBadge status={user.role} /></td>
                      <td><StatusBadge status={user.approved ? 'Approved' : 'Pending'} /></td>
                      <td>{formatDate(user.created_at)}</td>
                      <td>
                        <button 
                          onClick={() => {
                            setSelectedUser(user);
                            setShowUserModal(true);
                          }}
                          className="btn btn-sm btn-outline"
                        >
                          View
                        </button>
                        {!user.approved && (
                          <button 
                            onClick={async () => {
                              try {
                                await api.approveUser(user.id);
                                addNotification({
                                  type: 'success',
                                  title: 'User Approved',
                                  message: `${user.name} has been approved`
                                });
                                fetchData();
                              } catch (err) {
                                addNotification({
                                  type: 'error',
                                  title: 'Approval Failed',
                                  message: err.message
                                });
                              }
                            }}
                            className="btn btn-sm btn-primary"
                          >
                            Approve
                          </button>
                        )}
                        <button 
                          onClick={() => {
                            setSelectedUser(user);
                            setShowMessageModal(true);
                          }}
                          className="btn btn-sm btn-secondary"
                          style={{ marginLeft: '8px' }}
                        >
                          Message
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Subscriptions Tab */}
        {activeTab === 'subscriptions' && (
          <div className="admin-subscriptions">
            <div className="subscriptions-header">
              <h3>Subscription Management</h3>
              <div className="filter-buttons">
                <button 
                  onClick={() => fetchData()} 
                  className="btn btn-sm btn-outline"
                >
                  All Subscriptions
                </button>
                <button 
                  onClick={() => {
                    // Filter to show only pending
                  }} 
                  className="btn btn-sm btn-warning"
                >
                  Pending Review ({pendingSubscriptions.length})
                </button>
              </div>
            </div>

            {pendingSubscriptions.length > 0 && (
              <div className="alert alert-warning" style={{ margin: '1rem 0' }}>
                <strong>⚠️ {pendingSubscriptions.length} subscriptions pending review!</strong>
                <p>These funders have completed payment and are waiting for admin approval.</p>
              </div>
            )}

            <div className="subscriptions-table">
              <table>
                <thead>
                  <tr>
                    <th>Funder</th>
                    <th>Company</th>
                    <th>Email</th>
                    <th>Status</th>
                    <th>Payment</th>
                    <th>Joined</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.filter(u => u.role === 'funder').map(funder => (
                    <tr key={funder.id} className={funder.subscription_status === 'payment_pending' ? 'highlight-row' : ''}>
                      <td>{funder.name}</td>
                      <td>{funder.company_name || 'Not specified'}</td>
                      <td>{funder.email}</td>
                      <td>
                        <StatusBadge 
                          status={
                            funder.subscription_status === 'active' && funder.approved ? 'Active' :
                            funder.subscription_status === 'payment_pending' ? 'Pending Review' :
                            'Inactive'
                          } 
                        />
                      </td>
                      <td>
                        <StatusBadge status={funder.subscription_status} />
                      </td>
                      <td>{formatDate(funder.created_at)}</td>
                      <td>
                        <div className="action-buttons">
                          {funder.subscription_status === 'payment_pending' && (
                            <>
                              <button 
                                onClick={async () => {
                                  try {
                                    await api.approveSubscription(funder.id);
                                    addNotification({
                                      type: 'success',
                                      title: 'Subscription Approved',
                                      message: 'Funder subscription activated'
                                    });
                                    fetchData();
                                  } catch (err) {
                                    addNotification({
                                      type: 'error',
                                      title: 'Approval Failed',
                                      message: err.message
                                    });
                                  }
                                }}
                                className="btn btn-sm btn-success"
                              >
                                Approve
                              </button>
                              <button 
                                onClick={() => {
                                  const reason = prompt('Reason for denial:');
                                  if (reason) {
                                    api.denySubscription(funder.id, reason).then(() => {
                                      addNotification({
                                        type: 'success',
                                        title: 'Subscription Denied',
                                        message: 'Funder has been notified'
                                      });
                                      fetchData();
                                    });
                                  }
                                }}
                                className="btn btn-sm btn-warning"
                              >
                                Deny
                              </button>
                              <button 
                                onClick={async () => {
                                  if (window.confirm('Mark this subscription payment as failed?')) {
                                    try {
                                      await api.markSubscriptionFailed(funder.id);
                                      addNotification({
                                        type: 'success',
                                        title: 'Marked as Failed',
                                        message: 'Subscription payment marked as failed'
                                      });
                                      fetchData();
                                    } catch (err) {
                                      addNotification({
                                        type: 'error',
                                        title: 'Failed',
                                        message: err.message
                                      });
                                    }
                                  }
                                }}
                                className="btn btn-sm btn-danger"
                              >
                                Payment Failed
                              </button>
                            </>
                          )}
                          <button 
                            onClick={() => {
                              setSelectedUser(funder);
                              setShowUserModal(true);
                            }}
                            className="btn btn-sm btn-outline"
                          >
                            View Details
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Funders Tab */}
        {activeTab === 'funders' && (
          <div className="admin-funders">
            <h3>Funder Management</h3>
            <div className="funders-list">
              {users.filter(u => u.role === 'funder').map(funder => (
                <div key={funder.id} className="funder-card">
                  <div className="funder-header">
                    <h4>{funder.name}</h4>
                    <StatusBadge status={funder.verification_status} />
                  </div>
                  <div className="funder-details">
                    <p><strong>Company:</strong> {funder.company_name || 'Not provided'}</p>
                    <p><strong>Type:</strong> {funder.company_type || 'Not specified'}</p>
                    <p><strong>Email:</strong> {funder.email}</p>
                    <p><strong>Subscription:</strong> <StatusBadge status={funder.subscription_status} /></p>
                  </div>
                  {!funder.approved && (
                    <button 
                      onClick={() => handleOverride('approve-funder', funder)}
                      className="btn btn-primary"
                    >
                      Approve Funder
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Analytics Tab */}
        {activeTab === 'analytics' && (
          <div className="admin-analytics">
            <h3>Platform Analytics</h3>
            <p>Analytics dashboard coming soon...</p>
          </div>
        )}

        {/* Settings Tab */}
        {activeTab === 'settings' && (
          <div className="admin-settings">
            <h3>System Settings</h3>
            <div className="settings-list">
              {settings.map(setting => (
                <div key={setting.id} className="setting-item">
                  <label>{setting.setting_key.replace(/_/g, ' ').toUpperCase()}</label>
                  <div className="setting-control">
                    <input
                      type="text"
                      value={setting.setting_value}
                      onChange={(e) => {
                        const updated = settings.map(s => 
                          s.id === setting.id ? { ...s, setting_value: e.target.value } : s
                        );
                        setSettings(updated);
                      }}
                      className="form-input"
                    />
                    <button
                      onClick={async () => {
                        try {
                          await api.updateSystemSetting(setting.setting_key, setting.setting_value);
                          addNotification({
                            type: 'success',
                            title: 'Setting Updated',
                            message: 'System setting updated successfully'
                          });
                        } catch (err) {
                          addNotification({
                            type: 'error',
                            title: 'Update Failed',
                            message: err.message
                          });
                        }
                      }}
                      className="btn btn-sm btn-primary"
                    >
                      Save
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        
        {/* God Mode Tab */}
        {activeTab === 'godmode' && (
          <div className="godmode-section">
            <div className="warning-banner">
              <h3>⚠️ God Mode Active</h3>
              <p>These actions bypass all system checks. Use with extreme caution.</p>
            </div>

            {/* Unpaid Projects Section - TOP PRIORITY */}
            <div className="godmode-card">
              <h3>🔴 Unpaid Projects (Force Publish)</h3>
              <UnpaidProjectsManager api={api} addNotification={addNotification} />
            </div>

            {/* Recent Payments Section */}
            <div className="godmode-card">
              <h3>Recent Payments & Potential Issues</h3>
              <div className="payments-table">
                <table>
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>User</th>
                      <th>Type</th>
                      <th>Amount</th>
                      <th>Status</th>
                      <th>Project</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payments.map(payment => (
                      <tr key={payment.id} className={payment.status === 'completed' ? '' : 'payment-issue'}>
                        <td>{formatDateTime(payment.created_at)}</td>
                        <td>{payment.user_name}</td>
                        <td>{payment.payment_type}</td>
                        <td>{formatCurrency(payment.amount / 100)}</td>
                        <td><StatusBadge status={payment.status} /></td>
                        <td>{payment.project_title || '-'}</td>
                        <td>
                          {payment.payment_type === 'project_listing' && payment.status !== 'completed' && (
                            <button 
                              onClick={() => handleOverride('sync-payment', { id: payment.project_id })}
                              className="btn btn-sm btn-warning"
                            >
                              Sync Stripe
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Stuck Funders Section */}
            <div className="godmode-card">
              <h3>Pending Funders - Force Approval</h3>
              <div className="funders-list">
                {users.filter(u => u.role === 'funder' && (!u.approved || u.subscription_status === 'pending' || u.subscription_status === 'inactive')).map(funder => (
                  <div key={funder.id} className="funder-override-card">
                    <div className="funder-info">
                      <h4>{funder.name}</h4>
                      <p>{funder.email} • {funder.company_name}</p>
                      <div className="status-row">
                        <StatusBadge status={funder.approved ? 'Approved' : 'Not Approved'} />
                        <StatusBadge status={`Sub: ${funder.subscription_status}`} />
                        {funder.subscription_status === 'pending' && (
                          <span className="pending-payment-badge">Payment Processing</span>
                        )}
                      </div>
                    </div>
                    <button 
                      onClick={() => handleOverride('approve-funder', funder)}
                      className="btn btn-danger"
                    >
                      Force Approve & Activate
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* Override History */}
            <div className="godmode-card">
              <h3>Recent Override History</h3>
              <OverrideHistory api={api} />
            </div>

            {/* Quick Actions */}
            <div className="godmode-card">
              <h3>Quick Admin Actions</h3>
              <div className="quick-actions">
                <button className="btn btn-danger" onClick={() => {
                  const userId = prompt('Enter User ID to send message to:');
                  if (userId) {
                    const message = prompt('Enter message:');
                    if (message) {
                      api.sendSystemMessage(userId, message).then(() => {
                        addNotification({
                          type: 'success',
                          title: 'Message Sent',
                          message: 'System message sent to user'
                        });
                      });
                    }
                  }
                }}>
                  Send System Message
                </button>
                
                <button className="btn btn-danger" onClick={() => {
                  const userId = prompt('Enter User ID to view as:');
                  if (userId) {
                    api.viewAsUser(userId).then(data => {
                      console.log('User Data:', data);
                      alert(`Check console for user data. User: ${data.user.name}`);
                    });
                  }
                }}>
                  View As User
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Override Confirmation Modal */}
      <Modal 
        isOpen={showOverrideModal} 
        onClose={() => setShowOverrideModal(false)}
        title="Admin Override Confirmation"
        size="medium"
      >
        <div className="override-modal">
          <div className="warning-message">
            <strong>⚠️ Warning:</strong> This action bypasses all system checks and validations.
          </div>
          
          <div className="override-details">
            <h4>Action: {overrideType.replace('-', ' ').toUpperCase()}</h4>
            {overrideTarget && (
              <p>Target: {overrideTarget.name || overrideTarget.title || `ID: ${overrideTarget.id}`}</p>
            )}
          </div>
          
          <div className="form-group">
            <label>Reason for Override (Required)*</label>
            <textarea
              value={overrideReason}
              onChange={(e) => setOverrideReason(e.target.value)}
              placeholder="Explain why this override is necessary..."
              rows="3"
              className="form-textarea"
            />
          </div>
          
          <div className="modal-actions">
            <button 
              onClick={() => setShowOverrideModal(false)} 
              className="btn btn-outline"
            >
              Cancel
            </button>
            <button 
              onClick={executeOverride}
              disabled={!overrideReason.trim()}
              className="btn btn-danger"
            >
              Execute Override
            </button>
          </div>
        </div>
      </Modal>

      {/* Project Review Modal */}
      <Modal 
        isOpen={showReviewModal} 
        onClose={() => {
          setShowReviewModal(false);
          setSelectedProject(null);
          setDenialReason('');
          setPaymentNotReceived(false);
        }}
        title="Review Project for Approval"
        size="large"
      >
        {selectedProject && (
          <div className="project-review-modal">
            <div className="review-section">
              <h3>Project Details</h3>
              <div className="project-details-grid">
                <div className="detail-item">
                  <label>Title:</label>
                  <span>{selectedProject.title}</span>
                </div>
                <div className="detail-item">
                  <label>Borrower:</label>
                  <span>{selectedProject.borrower_name} ({selectedProject.borrower_email})</span>
                </div>
                <div className="detail-item">
                  <label>Loan Amount:</label>
                  <span>{formatCurrency(selectedProject.loan_amount)}</span>
                </div>
                <div className="detail-item">
                  <label>Property Type:</label>
                  <span>{selectedProject.property_type}</span>
                </div>
                <div className="detail-item">
                  <label>Location:</label>
                  <span>{selectedProject.suburb}</span>
                </div>
                <div className="detail-item">
                  <label>Payment Intent ID:</label>
                  <span style={{ fontSize: '0.875rem' }}>{selectedProject.payment_intent_id || 'N/A'}</span>
                </div>
              </div>
            </div>

            <div className="review-section">
              <h3>Payment Verification</h3>
              <div className="alert alert-info">
                <p>Please verify the payment in Stripe dashboard before approving:</p>
                <a 
                  href={`https://dashboard.stripe.com/payments/${selectedProject.payment_intent_id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-sm btn-outline"
                  style={{ marginTop: '0.5rem' }}
                >
                  View in Stripe Dashboard →
                </a>
              </div>
            </div>

            <div className="review-section">
              <h3>Actions</h3>
              <div className="review-actions">
                <div className="action-group">
                  <button 
                    onClick={async () => {
                      try {
                        await api.approveProject(selectedProject.id);
                        addNotification({
                          type: 'success',
                          title: 'Project Approved',
                          message: 'Project has been approved and is now live'
                        });
                        setShowReviewModal(false);
                        setPendingProjects(prev => prev.filter(p => p.id !== selectedProject.id));
                        fetchProjects();
                      } catch (err) {
                        addNotification({
                          type: 'error',
                          title: 'Approval Failed',
                          message: err.message
                        });
                      }
                    }}
                    className="btn btn-success"
                  >
                    Approve & Publish
                  </button>
                  <a 
                    href={`/project/${selectedProject.id}`} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="btn btn-outline"
                  >
                    View Full Project
                  </a>
                </div>

                <div className="divider" style={{ margin: '2rem 0' }}></div>

                <div className="denial-section">
                  <h4>Deny Project</h4>
                  <p>If there are issues with the project, provide a reason for denial:</p>
                  <textarea
                    value={denialReason}
                    onChange={(e) => setDenialReason(e.target.value)}
                    placeholder="Explain what needs to be fixed..."
                    rows="3"
                    className="form-textarea"
                    style={{ marginBottom: '1rem' }}
                  />
                  
                  {/* Payment checkbox */}
                  <label className="checkbox-label" style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center' }}>
                    <input
                      type="checkbox"
                      checked={paymentNotReceived}
                      onChange={(e) => setPaymentNotReceived(e.target.checked)}
                      style={{ marginRight: '8px' }}
                    />
                    <span>Payment not received (return to unpaid draft)</span>
                  </label>
                  
                  <button
                    onClick={async () => {
                      if (!denialReason.trim()) {
                        addNotification({
                          type: 'error',
                          title: 'Reason Required',
                          message: 'Please provide a reason for denial'
                        });
                        return;
                      }
                      
                      try {
                        if (paymentNotReceived) {
                          // Return to unpaid draft
                          await api.updateProjectStatus(selectedProject.id, {
                            status: 'draft',
                            payment_status: 'unpaid',
                            visible: false,
                            reason: denialReason,
                            payment_not_received: true
                          });
                        } else {
                          // Keep as paid but not published
                          await api.updateProjectStatus(selectedProject.id, {
                            status: 'rejected',
                            payment_status: 'paid',
                            visible: false,
                            reason: denialReason,
                            submission_status: 'rejected'
                          });
                        }
                        
                        // Send email to borrower
                        await api.sendEmailNotification('project_rejected', selectedProject.borrower_id, {
                          project_title: selectedProject.title,
                          reason: denialReason,
                          payment_status: paymentNotReceived ? 'returned_to_draft' : 'paid_but_rejected'
                        });
                        
                        addNotification({
                          type: 'success',
                          title: 'Project Denied',
                          message: 'Borrower has been notified'
                        });
                        
                        setShowReviewModal(false);
                        setPendingProjects(prev => prev.filter(p => p.id !== selectedProject.id));
                        fetchProjects();
                      } catch (err) {
                        addNotification({
                          type: 'error',
                          title: 'Denial Failed',
                          message: err.message
                        });
                      }
                    }}
                    disabled={!denialReason.trim()}
                    className="btn btn-warning"
                  >
                    Deny with Reason
                  </button>
                </div>

                <div className="divider" style={{ margin: '2rem 0' }}></div>

                <div className="payment-failed-section">
                  <h4>Payment Failed</h4>
                  <p>If payment verification failed in Stripe:</p>
                  <button 
                    onClick={async () => {
                      if (window.confirm('Are you sure the payment failed? This will return the project to draft status.')) {
                        try {
                          await api.markPaymentFailed(selectedProject.id);
                          addNotification({
                            type: 'success',
                            title: 'Payment Marked as Failed',
                            message: 'Project returned to draft'
                          });
                          setShowReviewModal(false);
                          setPendingProjects(prev => prev.filter(p => p.id !== selectedProject.id));
                          fetchProjects();
                        } catch (err) {
                          addNotification({
                            type: 'error',
                            title: 'Failed to Mark Payment',
                            message: err.message
                          });
                        }
                      }
                    }}
                    className="btn btn-danger"
                  >
                    Mark Payment as Failed
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </Modal>
      
      {/* Admin Message Modal */}
      <AdminMessageModal 
        isOpen={showMessageModal}
        onClose={() => {
          setShowMessageModal(false);
          setSelectedUser(null);
        }}
        user={selectedUser}
        onSend={() => {
          addNotification({
            type: 'success',
            title: 'Message Sent',
            message: 'User will receive notification'
          });
        }}
      />
    </div>
  );
};

// ===========================
// SUBSCRIPTION MODAL
// ===========================

const SubscriptionModal = ({ isOpen, onClose, onSuccess }) => {
  const [processing, setProcessing] = useState(false);
  const { user } = useApp();

  if (!isOpen) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Funder Subscription" size="medium">
      <div className="subscription-plans">
        <div className="plan-card featured">
          <h3>Professional Funder</h3>
          <div className="plan-price">
            <span className="currency">$</span>
            <span className="amount">299</span>
            <span className="period">/month</span>
          </div>
          
          <ul className="plan-features">
            <li>✓ Unlimited project access</li>
            <li>✓ Advanced search filters</li>
            <li>✓ Direct messaging with developers</li>
            <li>✓ Document downloads</li>
            <li>✓ Portfolio analytics</li>
            <li>✓ Priority support</li>
            <li>✓ Early access to new listings</li>
          </ul>

          <Elements stripe={stripePromise}>
            <SubscriptionForm 
              onSuccess={onSuccess}
              processing={processing}
              setProcessing={setProcessing}
              user={user}
            />
          </Elements>

          <div className="payment-security">
            <span>🔒</span>
            <p>Cancel anytime. Secured by Stripe.</p>
          </div>
        </div>
      </div>
    </Modal>
  );
};

// ================================================
// CLIENT SIDE - Updated SubscriptionForm
// ================================================

const SubscriptionForm = ({ onSuccess, processing, setProcessing }) => {
  const api = useApi();
  const stripe = useStripe();
  const elements = useElements();
  const { addNotification } = useNotifications();

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!stripe || !elements) return;
    
    setProcessing(true);

    try {
      // Create payment method
      const { error, paymentMethod } = await stripe.createPaymentMethod({
        type: 'card',
        card: elements.getElement(CardElement),
      });

      if (error) throw new Error(error.message);

      // Create subscription
      const response = await api.createSubscription(paymentMethod.id);
      
      if (response.status === 'success') {
        // Payment already succeeded on server
        addNotification({
          type: 'success',
          title: 'Subscription Active',
          message: 'Your subscription has been activated successfully!'
        });
        onSuccess();
      } else if (response.status === 'requires_action' && response.client_secret) {
        // 3D Secure required
        const result = await stripe.confirmCardPayment(response.client_secret);
        
        if (result.error) {
          throw new Error(result.error.message);
        }
        
        addNotification({
          type: 'success',
          title: 'Subscription Active',
          message: 'Your subscription has been activated successfully!'
        });
        onSuccess();
      } else {
        throw new Error('Unexpected response from server');
      }
      
    } catch (err) {
      addNotification({
        type: 'error',
        title: 'Subscription Failed',
        message: err.message || 'Failed to activate subscription'
      });
    } finally {
      setProcessing(false);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <div className="card-element-container">
        <CardElement 
          options={{
            style: {
              base: {
                fontSize: '16px',
                color: '#424770',
                '::placeholder': {
                  color: '#aab7c4',
                },
              },
            },
          }}
        />
      </div>
      
      <button 
        type="submit" 
        disabled={processing || !stripe}
        className="btn btn-primary btn-block"
      >
        {processing ? (
          <>
            <span className="spinner-small"></span>
            Processing...
          </>
        ) : (
          'Start Subscription - $299/month'
        )}
      </button>
      
      <div className="subscription-terms">
        <p>By subscribing, you agree to our terms of service. Cancel anytime.</p>
      </div>
    </form>
  );
};
// ===========================
// DOCUMENT PREVIEW MODAL
// ===========================

const DocumentPreviewModal = ({ document, onClose }) => {
  const api = useApi();
  const [loading, setLoading] = useState(true);
  const [previewUrl, setPreviewUrl] = useState('');
  const { addNotification } = useNotifications();

  useEffect(() => {
    if (document && document.mime_type?.includes('pdf')) {
      loadDocument();
    }
  }, [document]);

  const loadDocument = async () => {
    try {
      const blob = await api.downloadDocument(document.file_path);
      const url = URL.createObjectURL(blob);
      setPreviewUrl(url);
    } catch (err) {
      console.error('Failed to load document:', err);
      addNotification({
        type: 'error',
        title: 'Preview Failed',
        message: 'Unable to preview document'
      });
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = async () => {
    try {
      const blob = await api.downloadDocument(document.file_path);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = document.file_name;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      addNotification({
        type: 'error',
        title: 'Download Failed',
        message: 'Unable to download document'
      });
    }
  };

  if (!document) return null;

  return (
    <Modal isOpen={true} onClose={onClose} title={document.file_name} size="large">
      {loading ? (
        <LoadingSpinner />
      ) : document.mime_type?.includes('pdf') ? (
        <iframe 
          src={previewUrl} 
          className="document-iframe"
          title={document.file_name}
        />
      ) : (
        <div className="preview-unavailable">
          <p>Preview not available for this file type</p>
          <button onClick={handleDownload} className="btn btn-primary">
            Download to View
          </button>
        </div>
      )}
      
      <div className="modal-actions">
        <button onClick={handleDownload} className="btn btn-primary">
          Download
        </button>
      </div>
    </Modal>
  );
};

const DealDocumentPreviewModal = ({ document, dealId, api, onClose }) => {
  const [loading, setLoading] = useState(true);
  const [previewUrl, setPreviewUrl] = useState('');
  const { addNotification } = useNotifications();

  useEffect(() => {
    if (document && document.mime_type?.includes('pdf')) {
      loadDocument();
    }
  }, [document]);

  const loadDocument = async () => {
    try {
      let blob;
      if (document.isDealDocument) {
        // Deal document - use the view endpoint
        blob = await api.viewDealDocument(dealId, document.id);
      } else {
        // Project document - use the regular download endpoint
        blob = await api.downloadDocument(document.file_path);
      }
      const url = URL.createObjectURL(blob);
      setPreviewUrl(url);
    } catch (err) {
      console.error('Failed to load document:', err);
      addNotification({
        type: 'error',
        title: 'Preview Failed',
        message: 'Unable to preview document'
      });
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = async () => {
    try {
      let blob;
      if (document.isDealDocument) {
        blob = await api.downloadDealDocument(dealId, document.id);
      } else {
        blob = await api.downloadDocument(document.file_path);
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = document.file_name;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      addNotification({
        type: 'error',
        title: 'Download Failed',
        message: 'Unable to download document'
      });
    }
  };

  if (!document) return null;

  return (
    <Modal isOpen={true} onClose={onClose} title={document.file_name} size="large">
      {loading ? (
        <LoadingSpinner />
      ) : document.mime_type?.includes('pdf') ? (
        <iframe 
          src={previewUrl} 
          className="document-iframe"
          title={document.file_name}
        />
      ) : (
        <div className="preview-unavailable">
          <p>Preview not available for this file type</p>
          <button onClick={handleDownload} className="btn btn-primary">
            Download to View
          </button>
        </div>
      )}
      
      <div className="modal-actions">
        <button onClick={handleDownload} className="btn btn-primary">
          Download
        </button>
      </div>
    </Modal>
  );
};

// Replace the entire ProjectPreviewModal component in App.jsx with this:

const ProjectPreviewModal = ({ project, isOpen, onClose, onRequestAccess }) => {
  const [showAccessForm, setShowAccessForm] = useState(false);
  const [accessMessage, setAccessMessage] = useState('');
  const [requesting, setRequesting] = useState(false);
  const api = useApi();
  const { addNotification } = useNotifications();

  if (!isOpen || !project) return null;

  const handleRequestAccess = async () => {
    setRequesting(true);
    try {
      await api.requestAccess(project.id, accessMessage.trim() || null);
      
      await api.sendEmailNotification('access_request_received', project.borrower_id, {
        project_title: project.title,
        funder_name: 'A verified funder'
      });
      
      addNotification({
        type: 'success',
        title: 'Access Request Sent',
        message: 'Your request has been sent to the developer.'
      });
      
      onClose();
      if (onRequestAccess) onRequestAccess();
    } catch (err) {
      addNotification({
        type: 'error',
        title: 'Request Failed',
        message: err.message || 'Failed to send access request'
      });
    } finally {
      setRequesting(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={project.title} size="large">
      <div className="project-preview-content">
        {/* Header Section */}
        <div className="preview-header-section">
          <div className="location-badge">
            <svg className="icon" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
            </svg>
            {project.suburb || 'Location not specified'}
          </div>
          <StatusBadge status={project.development_stage || 'Planning'} />
        </div>

        {/* Key Metrics Grid */}
        <div className="preview-metrics-section">
          <h3 className="section-title">Key Investment Metrics</h3>
          <div className="metrics-grid">
            <div className="metric-card">
              <label>Loan Amount</label>
              <div className="metric-value">{formatCurrency(project.loan_amount)}</div>
            </div>
            <div className="metric-card">
              <label>Property Type</label>
              <div className="metric-value">{project.property_type || 'Not specified'}</div>
            </div>
            <div className="metric-card">
              <label>Development Stage</label>
              <div className="metric-value">{project.development_stage || 'Planning'}</div>
            </div>
            <div className="metric-card">
              <label>Project Size</label>
              <div className="metric-value">
                {project.project_size_sqm ? `${formatNumber(project.project_size_sqm)} sqm` : 'Not specified'}
              </div>
            </div>
          </div>
        </div>

        {/* Locked Content Section */}
        <div className="preview-locked-section">
          <div className="locked-overlay">
            <div className="lock-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="5" y="11" width="14" height="10" rx="2" ry="2"></rect>
                <path d="M7 11V7a5 5 0 0110 0v4"></path>
              </svg>
            </div>
            <h3>Full Details Available After Access Approval</h3>
            <p className="locked-description">
              Request access to unlock comprehensive project information
            </p>
            <div className="locked-features">
              <div className="feature-item">
                <svg className="check-icon" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
                Complete financial projections & feasibility analysis
              </div>
              <div className="feature-item">
                <svg className="check-icon" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
                Detailed project documentation & plans
              </div>
              <div className="feature-item">
                <svg className="check-icon" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
                Developer profile & track record
              </div>
              <div className="feature-item">
                <svg className="check-icon" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
                Risk assessments & mitigation strategies
              </div>
              <div className="feature-item">
                <svg className="check-icon" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
                Direct messaging with developer
              </div>
            </div>
          </div>

          {/* Blurred background content */}
          <div className="blurred-content">
            <div className="blur-row">
              <span className="blur-label">Total Project Cost</span>
              <span className="blur-value">$██,███,███</span>
            </div>
            <div className="blur-row">
              <span className="blur-label">Expected ROI</span>
              <span className="blur-value">██.█%</span>
            </div>
            <div className="blur-row">
              <span className="blur-label">Construction Partner</span>
              <span className="blur-value">████████ Constructions</span>
            </div>
          </div>
        </div>

        {/* CTA Section */}
        <div className="preview-cta-section">
          {!showAccessForm ? (
            <button 
              onClick={() => setShowAccessForm(true)}
              className="btn btn-primary btn-lg btn-block"
            >
              Request Full Access
            </button>
          ) : (
            <div className="access-request-form">
              <h4>Send Access Request</h4>
              <p className="form-description">
                Introduce yourself and explain your interest in this project
              </p>
              <textarea
                value={accessMessage}
                onChange={(e) => setAccessMessage(e.target.value)}
                placeholder="Example: We are a private credit fund specializing in residential developments in Brisbane. This project aligns with our investment criteria..."
                className="form-textarea"
                rows="4"
              />
              <div className="form-actions">
                <button 
                  onClick={() => {
                    setShowAccessForm(false);
                    setAccessMessage('');
                  }}
                  className="btn btn-outline"
                >
                  Cancel
                </button>
                <button 
                  onClick={handleRequestAccess}
                  disabled={requesting}
                  className="btn btn-primary"
                >
                  {requesting ? 'Sending...' : 'Send Request'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
};

// Haptic feedback helper
const triggerHaptic = () => {
  if ('vibrate' in navigator) {
    navigator.vibrate(10);
  }
};

// ===========================
// LANDING PAGE
// ===========================

const LandingPage = () => {
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isNavVisible, setIsNavVisible] = useState(true);
  const [lastScrollY, setLastScrollY] = useState(0);

  // Add swipe-away functionality for mobile only
  useEffect(() => {
    const handleScroll = () => {
      if (window.innerWidth > 768) return; // Only on mobile
      
      const currentScrollY = window.scrollY;
      
      if (currentScrollY > lastScrollY && currentScrollY > 80) {
        // Scrolling down
        setIsNavVisible(false);
      } else {
        // Scrolling up
        setIsNavVisible(true);
      }
      
      setLastScrollY(currentScrollY);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    
    return () => {
      window.removeEventListener('scroll', handleScroll);
    };
  }, [lastScrollY]);

  // Add this inside the LandingPage component, before the return statement
  useEffect(() => {
    // Handle swipe indicators
    const handleScroll = (wrapper, indicators) => {
      const scrollLeft = wrapper.scrollLeft;
      const cardWidth = wrapper.firstChild.offsetWidth + 16; // card width + gap
      const activeIndex = Math.round(scrollLeft / cardWidth);
      
      indicators.forEach((dot, index) => {
        dot.classList.toggle('active', index === activeIndex);
      });
    };

    const problemCards = document.querySelector('.problem-cards');
    const problemDots = document.querySelectorAll('.problem-cards-wrapper .dot');
    
    const solutionCards = document.querySelector('.solution-cards');
    const solutionDots = document.querySelectorAll('.solution-cards-wrapper .dot');
    
    if (problemCards && problemDots.length) {
      problemCards.addEventListener('scroll', () => handleScroll(problemCards, problemDots));
    }
    
    if (solutionCards && solutionDots.length) {
      solutionCards.addEventListener('scroll', () => handleScroll(solutionCards, solutionDots));
    }

    // Add journey cards swipe functionality
    const journeyContainer = document.querySelector('.user-journeys');
    const journeyCards = document.querySelectorAll('.journey-path');
    const indicators = document.querySelectorAll('.journey-indicators .indicator-dot');
    
    if (journeyContainer && journeyCards.length > 0) {
      // Set initial active card
      journeyCards[0]?.classList.add('active');
      
      const handleJourneyScroll = () => {
        const containerRect = journeyContainer.getBoundingClientRect();
        const containerCenter = containerRect.left + containerRect.width / 2;
        
        let closestCard = null;
        let closestDistance = Infinity;
        let activeIndex = 0;
        
        journeyCards.forEach((card, index) => {
          const cardRect = card.getBoundingClientRect();
          const cardCenter = cardRect.left + cardRect.width / 2;
          const distance = Math.abs(containerCenter - cardCenter);
          
          if (distance < closestDistance) {
            closestDistance = distance;
            closestCard = card;
            activeIndex = index;
          }
          
          card.classList.remove('active');
        });
        
        if (closestCard) {
          closestCard.classList.add('active');
        }
        
        // Update indicators
        indicators.forEach((dot, index) => {
          dot.classList.toggle('active', index === activeIndex);
        });
      };
      
      // Snap to card on scroll end
      let scrollTimeout;
      journeyContainer.addEventListener('scroll', () => {
        handleJourneyScroll();
        
        clearTimeout(scrollTimeout);
        scrollTimeout = setTimeout(() => {
          const activeCard = document.querySelector('.journey-path.active');
          if (activeCard) {
            activeCard.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
          }
        }, 150);
      });
      
      // Handle indicator clicks
      indicators.forEach((dot, index) => {
        dot.addEventListener('click', () => {
          journeyCards[index]?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
        });
      });
      
      // Initial positioning
      handleJourneyScroll();
    }
    
    // Find this code in your useEffect and REPLACE it
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
      anchor.addEventListener('click', function (e) {
        e.preventDefault();
        const targetId = this.getAttribute('href');
        
        // Special handling for pricing - scroll to journey section
        if (targetId === '#pricing') {
          const journeySection = document.querySelector('.user-journeys');
          if (journeySection) {
            const offset = window.innerWidth <= 768 ? 60 : 80;
            const targetPosition = journeySection.getBoundingClientRect().top + window.pageYOffset - offset;
            
            window.scrollTo({
              top: targetPosition,
              behavior: 'smooth'
            });
            
            // Highlight pricing after scroll
            setTimeout(() => {
              const pricingElements = document.querySelectorAll('.price-note');
              pricingElements.forEach(el => {
                el.style.animation = 'pulse 2s ease-out';
              });
            }, 500);
          }
        } else {
          const target = document.querySelector(targetId);
          if (target) {
            const offset = window.innerWidth <= 768 ? 60 : 80;
            const targetPosition = target.getBoundingClientRect().top + window.pageYOffset - offset;
            
            window.scrollTo({
              top: targetPosition,
              behavior: 'smooth'
            });
          }
        }
        
        // Trigger haptic feedback on mobile
        if ('vibrate' in navigator) {
          navigator.vibrate(10);
        }
      });
    });
  }, []);

  return (
    <div className="landing-page">
      {/* Mobile Header with swipe-away */}
      <div className={`mobile-header ${isNavVisible ? '' : 'hidden'}`}>
        <div className="mobile-logo">Tranch</div>
        <button 
          className="mobile-menu-trigger"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        </button>
      </div>

      {/* Mobile Menu Dropdown */}
      {mobileMenuOpen && (
        <div className="landing-mobile-menu">
          <a href="#features" onClick={() => setMobileMenuOpen(false)}>Features</a>
          <a href="#how-it-works" onClick={() => setMobileMenuOpen(false)}>How it Works</a>
          <a href="#pricing" onClick={() => setMobileMenuOpen(false)}>Pricing</a>
          <Link to="/login" className="btn btn-outline" onClick={() => setMobileMenuOpen(false)}>Sign In</Link>
          <Link to="/register" className="btn btn-primary" onClick={() => setMobileMenuOpen(false)}>Get Started</Link>
        </div>
      )}

      {/* Mobile Bottom Navigation */}
      <nav className="mobile-bottom-nav">
        <a href="#" className="nav-item active">
          <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
            <polyline points="9 22 9 12 15 12 15 22" />
          </svg>
          <span className="nav-label">Home</span>
        </a>
        <a href="#features" className="nav-item">
          <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
          </svg>
          <span className="nav-label">Features</span>
        </a>
        <a 
          href="#pricing" 
          className="nav-item"
          onClick={(e) => {
            e.preventDefault();
            const journeySection = document.querySelector('.user-journeys');
            if (journeySection) {
              const offset = 60;
              const targetPosition = journeySection.getBoundingClientRect().top + window.pageYOffset - offset;
              window.scrollTo({
                top: targetPosition,
                behavior: 'smooth'
              });
            }
          }}
        >
          <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
          </svg>
          <span className="nav-label">Pricing</span>
        </a>
        <Link to="/register" className="nav-item">
          <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
            <circle cx="8.5" cy="7" r="4" />
            <line x1="20" y1="8" x2="20" y2="14" />
            <line x1="23" y1="11" x2="17" y2="11" />
          </svg>
          <span className="nav-label">Sign Up</span>
        </Link>
      </nav>

      {/* Mobile Floating Action Button */}
      <button className="mobile-fab">
        <span>+</span>
      </button>

      {/* Navigation */}
      <nav className="landing-nav">
        <div className="nav-container">
          <div className="nav-logo">
            <span className="logo-text">Tranch</span>
          </div>
          <div className="nav-links desktop-only">
            <a href="#features">Features</a>
            <a href="#how-it-works">How it Works</a>
            <a href="#pricing">Pricing</a>
            <Link to="/login" className="btn btn-outline">Sign In</Link>
            <Link to="/register" className="btn btn-primary">Get Started</Link>
          </div>
          <button 
            className="mobile-menu-btn"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          >
            <span></span>
            <span></span>
            <span></span>
          </button>
        </div>
        
        {mobileMenuOpen && (
          <div className="mobile-nav-menu">
            <a href="#features" onClick={() => setMobileMenuOpen(false)}>Features</a>
            <a href="#how-it-works" onClick={() => setMobileMenuOpen(false)}>How it Works</a>
            <a href="#pricing" onClick={() => setMobileMenuOpen(false)}>Pricing</a>
            <Link to="/login" className="btn btn-outline">Sign In</Link>
            <Link to="/register" className="btn btn-primary">Get Started</Link>
          </div>
        )}
      </nav>

      {/* Hero Section */}
      <section className="hero-section">
        <div className="hero-container">
          <div className="hero-content">
            <h1 className="hero-title">
              Connect Your Development<br />
              <span className="gradient-text">With The Right Capital</span>
            </h1>
            <p className="hero-subtitle">
              Tranch is Australia's premier marketplace connecting property developers 
              with private credit funders. Streamline your funding process with our 
              secure platform and intelligent matching system.
            </p>
            <div className="hero-actions">
              <Link to="/register" className="btn btn-primary btn-lg">
                Start Your Project
              </Link>
              <Link to="/register?role=funder" className="btn btn-outline btn-lg">
                Become a Funder
              </Link>
            </div>
            <div className="hero-stats">
              <div className="stat">
                <span className="stat-value">Pre-Qualified</span>
                <span className="stat-label">Funders Ready Now</span>
              </div>
              <div className="stat">
                <span className="stat-value">Your Terms</span>
                <span className="stat-label">Multiple Offers</span>
              </div>
              <div className="stat">
                <span className="stat-value">Deal Certainty</span>
                <span className="stat-label">Full Transparency</span>
              </div>
            </div>
          </div>
          <div className="hero-visual">
            <div className="floating-card card-1">
              <h4>Luxury Apartments</h4>
              <p>Brisbane CBD</p>
              <span className="amount">$5.2M</span>
            </div>
            <div className="floating-card card-2">
              <h4>Mixed Use Development</h4>
              <p>Gold Coast</p>
              <span className="amount">$8.7M</span>
            </div>
            <div className="floating-card card-3">
              <h4>Townhouse Project</h4>
              <p>Sunshine Coast</p>
              <span className="amount">$3.4M</span>
            </div>
          </div>
        </div>
      </section>

      {/* Problem & Solution Section */}
      <section id="features" className="problem-solution-section">
        <div className="container">
          <div style={{ textAlign: 'center', width: '100%', marginBottom: '60px' }}>
            <h2 className="section-title" style={{ textAlign: 'center', width: '100%', margin: '0 auto 16px auto' }}>
              The Property Finance Problem
            </h2>
            <p className="section-subtitle" style={{ textAlign: 'center', width: '100%', margin: '0 auto', maxWidth: '800px' }}>
              Traditional funding takes months, lacks transparency, and wastes everyone's time
            </p>
          </div>
          
          {/* Problem Cards */}
          <div className="problem-cards-wrapper">
            <div className="problem-cards">
              <div className="problem-card">
                <div className="problem-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10"></circle>
                    <polyline points="12 6 12 12 16 14"></polyline>
                  </svg>
                </div>
                <h3>Months of Delays</h3>
                <p>Developers spend 3-6 months chasing funders through outdated channels</p>
              </div>
              <div className="problem-card">
                <div className="problem-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="11" cy="11" r="8"></circle>
                    <path d="m21 21-4.35-4.35"></path>
                  </svg>
                </div>
                <h3>Hidden Networks</h3>
                <p>Quality deals never reach the right funders due to closed networks</p>
              </div>
              <div className="problem-card">
                <div className="problem-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path>
                    <polyline points="22,6 12,13 2,6"></polyline>
                  </svg>
                </div>
                <h3>Scattered Communication</h3>
                <p>Critical documents lost in email chains and missed opportunities</p>
              </div>
            </div>
            <div className="swipe-indicator">
              <span className="dot active"></span>
              <span className="dot"></span>
              <span className="dot"></span>
            </div>
          </div>

          {/* Transition */}
          <div className="solution-transition">
            <div className="transition-line"></div>
            <button 
              className="transition-text"
              onClick={() => {
                document.querySelector('.solution-overview').scrollIntoView({ 
                  behavior: 'smooth',
                  block: 'start'
                });
              }}
              style={{ cursor: 'pointer', border: 'none', background: 'none' }}
            >
              Enter Tranch
            </button>
            <div className="transition-line"></div>
          </div>

          {/* Solution Overview */}
          <div className="solution-overview">
            <h2 className="solution-title">The Intelligent Marketplace</h2>
            <p className="solution-subtitle">
              We've built the infrastructure that property finance has been waiting for
            </p>
            
            <div className="solution-cards-wrapper">
              <div className="solution-cards">
                <div className="solution-card">
                  <div className="solution-icon">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
                    </svg>
                  </div>
                  <h4>Instant Connections</h4>
                  <p>Verified funders see your project within 24 hours of listing</p>
                </div>
                <div className="solution-card">
                  <div className="solution-icon">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M12 2L2 7l10 5 10-5-10-5z" />
                      <path d="M2 17l10 5 10-5M2 12l10 5 10-5" />
                    </svg>
                  </div>
                  <h4>Complete Transparency</h4>
                  <p>Track every interaction, document, and decision in one place</p>
                </div>
                <div className="solution-card">
                  <div className="solution-icon">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M12 20h9"></path>
                      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>
                      <path d="m15 5 3 3"></path>
                    </svg>
                  </div>
                  <h4>AI-Powered Intelligence</h4>
                  <p>BrokerAI analyzes deals and provides instant feasibility insights</p>
                </div>
              </div>
              <div className="swipe-indicator">
                <span className="dot active"></span>
                <span className="dot"></span>
                <span className="dot"></span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works - Professional Redesign */}
      <section id="how-it-works" className="how-it-works">
        <div className="container">
          <div className="section-header">
            <h2 className="section-title">How Tranch Streamlines Property Finance</h2>
            <p className="section-subtitle">
              The intelligent marketplace connecting property developers with private credit funders
            </p>
          </div>

          <div id="pricing" style={{ position: 'absolute', top: '-80px' }}></div>

          {/* Value Props */}
          <div className="value-props">
            <div className="value-prop">
              <div className="value-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
                </svg>
              </div>
              <h4>Rapid Execution</h4>
              <p>Connect with funders in days, not months</p>
            </div>
            <div className="value-prop">
              <div className="value-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10"></circle>
                  <path d="M12 6v6l4 2"></path>
                </svg>
              </div>
              <h4>Real-Time Intelligence</h4>
              <p>BrokerAI analyzes deals and provides instant insights</p>
            </div>
            <div className="value-prop">
              <div className="value-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 2L2 7l10 5 10-5-10-5z"></path>
                  <path d="M2 17l10 5 10-5"></path>
                  <path d="M2 12l10 5 10-5"></path>
                </svg>
              </div>
              <h4>Complete Transparency</h4>
              <p>Track every interaction and document exchange</p>
            </div>
          </div>

          {/* Split Paths */}
          <div className="user-journeys">
            {/* Developer Journey */}
            <div className="journey-path developer-path">
              <div className="journey-header">
                <h3>For Property Developers</h3>
                <p>Access capital markets with unprecedented efficiency</p>
              </div>
              
              <div className="journey-steps">
                <div className="journey-step">
                  <div className="step-number">01</div>
                  <div className="step-content">
                    <h4>Upload Project Documentation</h4>
                    <p>Feasibility studies, development applications, financial models - all secured in our institutional-grade vault</p>
                  </div>
                </div>
                
                <div className="journey-step">
                  <div className="step-number">02</div>
                  <div className="step-content">
                    <h4>Gain Market Exposure</h4>
                    <p>Your project becomes visible to our network of verified private credit funds and sophisticated investors</p>
                  </div>
                </div>
                
                <div className="journey-step">
                  <div className="step-number">03</div>
                  <div className="step-content">
                    <h4>Manage Capital Raising</h4>
                    <p>Field inquiries, compare terms, and progress multiple funding conversations simultaneously</p>
                  </div>
                </div>

                <div className="journey-feature">
                  <div className="feature-highlight">
                    <h5>Powered by BrokerAI</h5>
                    <p>Get instant answers on LVR calculations, feasibility metrics, and market comparables</p>
                  </div>
                </div>
              </div>
              
              <div className="journey-cta">
                <Link to="/register" className="btn btn-primary">
                  List Your Project
                </Link>
                <span className="price-note">$499 per project listing</span>
              </div>
            </div>

            {/* Funder Journey */}
            <div className="journey-path funder-path">
              <div className="journey-header">
                <h3>For Private Credit Funds</h3>
                <p>Source and analyze deals with institutional-grade tools</p>
              </div>
              
              <div className="journey-steps">
                <div className="journey-step">
                  <div className="step-number">01</div>
                  <div className="step-content">
                    <h4>Access Curated Deal Flow</h4>
                    <p>Filter opportunities by geography, asset class, deal size, and risk parameters</p>
                  </div>
                </div>
                
                <div className="journey-step">
                  <div className="step-number">02</div>
                  <div className="step-content">
                    <h4>Conduct Due Diligence</h4>
                    <p>Review comprehensive project documentation and financial analysis in our secure data room</p>
                  </div>
                </div>
                
                <div className="journey-step">
                  <div className="step-number">03</div>
                  <div className="step-content">
                    <h4>Execute Efficiently</h4>
                    <p>Communicate terms, negotiate directly, and track deal progression through to close</p>
                  </div>
                </div>

                <div className="journey-feature">
                  <div className="feature-highlight">
                    <h5>BrokerAI Analytics</h5>
                    <p>Leverage AI to assess project viability, market conditions, and comparative returns</p>
                  </div>
                </div>
              </div>
              
              <div className="journey-cta">
                <Link to="/register?role=funder" className="btn btn-primary">
                  Access Deal Flow
                </Link>
                <span className="price-note">$299/month professional access</span>
              </div>
            </div>
          </div>

          {/* Journey indicators for mobile */}
          <div className="journey-indicators">
            <span className="indicator-dot active"></span>
            <span className="indicator-dot"></span>
          </div>

          {/* Platform Benefits */}
          <div className="platform-benefits">
            <h3>The Tranch Advantage</h3>
            <div className="benefits-grid">
              <div className="benefit">
                <h4>Institutional-Grade Security</h4>
                <p>Bank-level encryption and secure document management protect sensitive financial information</p>
              </div>
              <div className="benefit">
                <h4>Intelligent Deal Analysis</h4>
                <p>BrokerAI provides 24/7 expert guidance on deal structuring, market analysis, and financial metrics</p>
              </div>
              <div className="benefit">
                <h4>Verified Network</h4>
                <p>All participants undergo comprehensive verification ensuring quality connections</p>
              </div>
              <div className="benefit">
                <h4>Complete Audit Trail</h4>
                <p>Every interaction, document exchange, and communication is tracked for compliance</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="cta-section">
        <div className="container">
          <h2>Ready to Transform Your Property Finance?</h2>
          <p>Join Australia's fastest-growing property finance platform</p>
          <div className="cta-actions">
            <Link to="/register" className="btn btn-primary btn-lg">
              Get Started
            </Link>
            <a href="mailto:support@tranch.com.au" className="btn btn-outline btn-lg">
              Contact Sales
            </a>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="landing-footer">
        <div className="container">
          <div className="footer-content">
            <div className="footer-brand">
              <span className="logo-text">Tranch</span>
              <p>Connecting property developers with private credit</p>
            </div>
            <div className="footer-links">
              <h4>Platform</h4>
              <a href="#features">Features</a>
              <a href="#pricing">Pricing</a>
              <a href="#how-it-works">How it Works</a>
            </div>
            <div className="footer-links">
              <h4>Company</h4>
              <a href="#">About</a>
              <a href="#">Contact</a>
              <Link to="/privacy">Privacy Policy</Link>
              <Link to="/terms">Terms of Service</Link>
              <Link to="/cookies">Cookie Policy</Link>
            </div>
            <div className="footer-contact">
              <h4>Get in Touch</h4>
              <p>support@tranch.com.au</p>
              <p>0428 990 498</p>
            </div>
          </div>
          <div className="footer-bottom">
            <p>&copy; 2025 Tranch. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  );
};

// ===========================
// LEGAL PAGES
// ===========================

const PrivacyPolicy = () => (
  <div className="legal-page">
    <div className="container">
      <h1>Privacy Policy</h1>
      <p>Last updated: January 2025</p>
      
      <section>
        <h2>1. Information We Collect</h2>
        <p>We collect information you provide directly to us, such as when you create an account, list a project, or communicate with other users.</p>
      </section>
      
      <section>
        <h2>2. How We Use Your Information</h2>
        <p>We use the information we collect to provide, maintain, and improve our services, process transactions, and communicate with you.</p>
      </section>
      
      <section>
        <h2>3. Information Sharing</h2>
        <p>We do not sell, trade, or otherwise transfer your personal information to third parties without your consent, except as described in this policy.</p>
      </section>
      
      <section>
        <h2>4. Data Security</h2>
        <p>We implement appropriate technical and organizational measures to protect your personal information against unauthorized access, alteration, disclosure, or destruction.</p>
      </section>
      
      <section>
        <h2>5. Your Rights</h2>
        <p>You have the right to access, update, or delete your personal information. You can do this through your account settings or by contacting us.</p>
      </section>
      
      <section>
        <h2>6. Contact Us</h2>
        <p>If you have any questions about this Privacy Policy, please contact us at privacy@tranch.com.au</p>
      </section>
    </div>
  </div>
);

// ===========================
// LEGAL PAGES (continued)
// ===========================

const TermsOfService = () => (
  <div className="legal-page">
    <div className="container">
      <h1>Terms of Service</h1>
      <p>Last updated: January 2025</p>
      
      <section>
        <h2>1. Acceptance of Terms</h2>
        <p>By accessing and using Tranch, you accept and agree to be bound by the terms and provision of this agreement.</p>
      </section>
      
      <section>
        <h2>2. Use of Service</h2>
        <p>You may use our service only for lawful purposes and in accordance with these Terms. You agree not to use our service in any way that violates any applicable federal, state, local, or international law or regulation.</p>
      </section>
      
      <section>
        <h2>3. User Accounts</h2>
        <p>You are responsible for safeguarding the password and for all activities that occur under your account. You must notify us immediately upon becoming aware of any breach of security or unauthorized use of your account.</p>
      </section>
      
      <section>
        <h2>4. Fees and Payment</h2>
        <p>Some aspects of the Service are paid. You agree to pay all fees or charges to your account in accordance with the fees, charges, and billing terms in effect at the time.</p>
      </section>
      
      <section>
        <h2>5. Limitation of Liability</h2>
        <p>In no event shall Tranch, nor its directors, employees, partners, agents, suppliers, or affiliates, be liable for any indirect, incidental, special, consequential, or punitive damages.</p>
      </section>
      
      <section>
        <h2>6. Contact Us</h2>
        <p>If you have any questions about these Terms, please contact us at legal@tranch.com.au</p>
      </section>
    </div>
  </div>
);

const CookiePolicy = () => (
  <div className="legal-page">
    <div className="container">
      <h1>Cookie Policy</h1>
      <p>Last updated: January 2025</p>
      
      <section>
        <h2>1. What Are Cookies</h2>
        <p>Cookies are small pieces of text sent to your browser by a website you visit. They help that website remember information about your visit, which can both make it easier to visit the site again and make the site more useful to you.</p>
      </section>
      
      <section>
        <h2>2. How We Use Cookies</h2>
        <p>We use cookies for the following purposes:</p>
        <ul>
          <li>Authentication and security</li>
          <li>Preferences and settings</li>
          <li>Analytics and performance</li>
          <li>Marketing and advertising</li>
        </ul>
      </section>
      
      <section>
        <h2>3. Types of Cookies We Use</h2>
        <ul>
          <li><strong>Essential Cookies:</strong> Required for the website to function properly</li>
          <li><strong>Analytics Cookies:</strong> Help us understand how visitors use our website</li>
          <li><strong>Functional Cookies:</strong> Remember your preferences and settings</li>
          <li><strong>Marketing Cookies:</strong> Used to deliver relevant advertisements</li>
        </ul>
      </section>
      
      <section>
        <h2>4. Managing Cookies</h2>
        <p>Most browsers allow you to control cookies through their settings preferences. However, limiting cookies may impact your experience of the site.</p>
      </section>
      
      <section>
        <h2>5. Contact Us</h2>
        <p>If you have any questions about our Cookie Policy, please contact us at privacy@tranch.com.au</p>
      </section>
    </div>
  </div>
);

// ===========================
// NOTIFICATION PREFERENCES (in NotificationPreferences component)
// ===========================

const NotificationPreferences = () => {
  const api = useApi();
  const { addNotification } = useNotifications();
  const [preferences, setPreferences] = useState({
    email_messages: true,
    email_access_requests: true,
    email_project_updates: true,
    email_newsletter: false
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchPreferences();
  }, []);

  const fetchPreferences = async () => {
    try {
      const data = await api.getNotificationPreferences();
      setPreferences(data);
    } catch (err) {
      console.error('Failed to fetch preferences:', err);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.updateNotificationPreferences(preferences);
      addNotification({
        type: 'success',
        title: 'Preferences Updated',
        message: 'Your notification preferences have been saved'
      });
    } catch (err) {
      addNotification({
        type: 'error',
        title: 'Update Failed',
        message: 'Failed to update preferences'
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="notification-preferences">
      <h3>Email Notifications</h3>
      <div className="preference-list">
        <label className="preference-item">
          <input
            type="checkbox"
            checked={preferences.email_messages}
            onChange={(e) => setPreferences({ ...preferences, email_messages: e.target.checked })}
          />
          <span>New messages</span>
        </label>
        
        <label className="preference-item">
          <input
            type="checkbox"
            checked={preferences.email_access_requests}
            onChange={(e) => setPreferences({ ...preferences, email_access_requests: e.target.checked })}
          />
          <span>Access requests</span>
        </label>
        
        <label className="preference-item">
          <input
            type="checkbox"
            checked={preferences.email_project_updates}
            onChange={(e) => setPreferences({ ...preferences, email_project_updates: e.target.checked })}
          />
          <span>Project updates</span>
        </label>
        
        <label className="preference-item">
          <input
            type="checkbox"
            checked={preferences.email_newsletter}
            onChange={(e) => setPreferences({ ...preferences, email_newsletter: e.target.checked })}
          />
          <span>Monthly newsletter</span>
        </label>
      </div>
      
      <button 
        onClick={handleSave} 
        disabled={saving}
        className="btn btn-primary"
      >
        {saving ? 'Saving...' : 'Save Preferences'}
      </button>
    </div>
  );
};

// ===========================
// MAIN APP COMPONENT
// ===========================

function App() {
  return (
    <ClerkProvider 
      publishableKey={CLERK_PUBLISHABLE_KEY}
      appearance={{
        variables: {
          colorPrimary: '#667eea',
          colorText: '#1e293b',
          colorBackground: '#ffffff',
          colorInputBackground: '#ffffff',
          colorInputText: '#1e293b',
          fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif',
          borderRadius: '0.5rem'
        },
        elements: {
          formButtonPrimary: {
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            '&:hover': {
              transform: 'translateY(-2px)',
              boxShadow: '0 6px 20px rgba(99, 102, 241, 0.35)'
            }
          },
          card: {
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
            borderRadius: '1rem'
          }
        }
      }}
    >
      <NotificationProvider>
        <AppProvider>
          <ToastProvider>
            <Router>
            <Routes>
              {/* Public Routes */}
              <Route path="/" element={<><LandingPage /><LandingBottomNav /></>} />
              <Route path="/login" element={<><ClerkAuthWrapper mode="sign-in" /><LandingBottomNav /></>} />
              <Route path="/register" element={<><ClerkAuthWrapper mode="sign-up" /><LandingBottomNav /></>} />
              <Route path="/privacy" element={<PrivacyPolicy />} />
              <Route path="/terms" element={<TermsOfService />} />
              <Route path="/cookies" element={<CookiePolicy />} />
              
              {/* Onboarding */}
              <Route 
                path="/onboarding" 
                element={
                  <SignedIn>
                    <Onboarding />
                  </SignedIn>
                } 
              />
              
              {/* Protected App Routes */}
              <Route
                path="/*"
                element={
                  <SignedIn>
                    <AppLayout />
                  </SignedIn>
                }
              />
              
              {/* Fallback for signed out users */}
              <Route
                path="*"
                element={
                  <SignedOut>
                    <Navigate to="/login" replace />
                  </SignedOut>
                }
              />
            </Routes>
          </Router>
          </ToastProvider>
        </AppProvider>
      </NotificationProvider>
    </ClerkProvider>
  );
}

// App Layout Component
const AppLayout = () => {
  const { user } = useApp();
  const location = useLocation();
  

  // Pages where BrokerAI floating assistant should not appear
  const noBrokerAIPages = ['/', '/login', '/register', '/onboarding'];
  const showBrokerAI = user && !noBrokerAIPages.includes(location.pathname);

  return (
    <div className="app">
      <Navigation />
      <main className="main-content">
        <Routes>
          {/* Dashboard - accessible by all authenticated users */}
          <Route path="/dashboard" element={
            <ProtectedRoute>
              <Dashboard />
            </ProtectedRoute>
          } />
          
          {/* Borrower Routes */}
          <Route path="/create-project" element={
            <ProtectedRoute roles={['borrower']}>
              <CreateProject />
            </ProtectedRoute>
          } />
          <Route path="/my-projects" element={
            <ProtectedRoute roles={['borrower']}>
              <MyProjects />
            </ProtectedRoute>
          } />
          <Route path="/project/:id/edit" element={
            <ProtectedRoute roles={['borrower']}>
              <EditProject />
            </ProtectedRoute>
          } />
          
          {/* Funder Routes */}
          <Route path="/projects" element={
            <ProtectedRoute roles={['funder']}>
              <ProjectsPage />
            </ProtectedRoute>
          } />
          <Route path="/portfolio" element={
            <ProtectedRoute roles={['funder']}>
              <Portfolio />
            </ProtectedRoute>
          } />
          
          {/* Shared Routes */}
          <Route path="/project/:id" element={
            <ProtectedRoute roles={['borrower', 'funder', 'admin']}>
              <ProjectDetail />
            </ProtectedRoute>
          } />
          <Route path="/messages" element={
            <ProtectedRoute roles={['borrower', 'funder', 'admin']}>
              <MessagesPage />
            </ProtectedRoute>
          } />
          <Route path="/broker-ai" element={
            <ProtectedRoute>
              <BrokerAI />
            </ProtectedRoute>
          } />
          <Route path="/project/:projectId/deal/:dealId" element={
  <ProtectedRoute roles={['borrower', 'funder']}>
    <DealRoom />
  </ProtectedRoute>
} />
          
          {/* User Routes */}
          <Route path="/profile" element={
            <ProtectedRoute>
              <UserProfile />
            </ProtectedRoute>
          } />
          <Route path="/settings" element={
            <ProtectedRoute>
              <SettingsPage />
            </ProtectedRoute>
          } />
          
          {/* Admin Routes */}
          <Route path="/admin" element={
            <ProtectedRoute roles={['admin']}>
              <AdminPanel />
            </ProtectedRoute>
          } />
          
          {/* Catch all - redirect to dashboard */}
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </main>
      
      {/* Floating BrokerAI Assistant */}
      {showBrokerAI && <BrokerAIFloating />}
    </div>
  );
};

// Export the App component at the very end
export default App;