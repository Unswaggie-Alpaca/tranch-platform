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
const STRIPE_PUBLISHABLE_KEY = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY || 
  'pk_test_51RU7lrQupq5Lj3mgQLoOPZQnTHeOOC8HSXs9x4D0H9uURhmGi0tlRxvkiuTy9NEd9RlM3B51YBpvgMdwlbU6bvkQ00WUSGUnp8';

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
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Network error' }));
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }

      return await response.json();
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
    
    // Document download
    async downloadDocument(filePath) {
      const token = await getToken();
      const response = await fetch(`${API_BASE_URL.replace('/api', '')}/${filePath}`, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });
      
      if (!response.ok) throw new Error('Download failed');
      return response.blob();
    },

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
    
    // For development/testing
    simulatePaymentSuccess: (projectId, paymentIntentId) => request('/payments/simulate-success', {
      method: 'POST',
      body: JSON.stringify({ project_id: projectId, payment_intent_id: paymentIntentId }),
    }),
    simulateSubscription: () => request('/payments/simulate-subscription', {
      method: 'POST',
    }),

    // Access request endpoints
    requestAccess: (projectId, initialMessage) => request('/access-requests', {
      method: 'POST',
      body: JSON.stringify({ project_id: projectId, initial_message: initialMessage }),
    }),
    getAccessRequests: () => request('/access-requests'),
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

    // Notification preferences
    getNotificationPreferences: () => request('/notifications/preferences'),
    updateNotificationPreferences: (preferences) => request('/notifications/preferences', {
      method: 'PUT',
      body: JSON.stringify(preferences),
    }),

    // Data export
    exportUserData: () => request('/export/user-data'),
    exportProjects: () => request('/export/projects'),
    
    // Account management
    deleteAccount: (confirmation) => request('/account/delete', {
      method: 'DELETE',
      body: JSON.stringify({ confirmation }),
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

  const markAllAsRead = () => {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    setUnreadCount(0);
  };

  const value = {
    notifications,
    unreadCount,
    addNotification,
    removeNotification,
    markAsRead,
    markAllAsRead
  };

  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
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

// Tooltip
const Tooltip = ({ children, content, position = 'top' }) => {
  const [visible, setVisible] = useState(false);
  const tooltipRef = useRef(null);

  return (
    <div className="tooltip-wrapper">
      <div
        onMouseEnter={() => setVisible(true)}
        onMouseLeave={() => setVisible(false)}
        className="tooltip-trigger"
      >
        {children}
      </div>
      {visible && (
        <div ref={tooltipRef} className={`tooltip tooltip-${position}`}>
          {content}
        </div>
      )}
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
const EmptyState = ({ icon = '📂', title, message, action }) => (
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

// ===========================
// NAVIGATION COMPONENT
// ===========================

const Navigation = () => {
  const api = useApi();
  const { user } = useApp();
  const { notifications, unreadCount, markAllAsRead } = useNotifications();
  const { signOut } = useClerk();
  const navigate = useNavigate();
  const location = useLocation();
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);

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
    { path: '/messages', label: 'Messages', roles: ['borrower', 'funder'] },
    { path: '/portfolio', label: 'Portfolio', roles: ['funder'] },
    { path: '/admin', label: 'Admin', roles: ['admin'] },
  ];

  const filteredLinks = navLinks.filter(link => link.roles.includes(user.role));

  return (
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
        
        {/* Mobile Menu Button */}
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
          <div className="notification-area">
            <button 
              className={`notification-bell ${unreadCount > 0 ? 'has-notifications' : ''}`}
              onClick={() => setShowNotifications(!showNotifications)}
            >
              <span className="bell-icon">🔔</span>
              {unreadCount > 0 && (
                <span className="notification-count">{unreadCount}</span>
              )}
            </button>
            
            {showNotifications && (
              <div className="notification-dropdown">
                <div className="notification-header">
                  <h3>Notifications</h3>
                  <button onClick={() => {
                    markAllAsRead();
                    setShowNotifications(false);
                  }}>
                    Mark all read
                  </button>
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
                      >
                        <div className="notification-content">
                          <strong>{notification.title}</strong>
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
          <div className="profile-dropdown-container">
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
                  <span className="dropdown-icon">👤</span>
                  My Profile
                </Link>
                
                <Link 
                  to="/settings" 
                  className="dropdown-item"
                  onClick={() => setShowProfileMenu(false)}
                >
                  <span className="dropdown-icon">⚙</span>
                  Settings
                </Link>
                
                <div className="dropdown-divider"></div>
                
                <button onClick={handleLogout} className="dropdown-item logout">
                  <span className="dropdown-icon">→</span>
                  Logout
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
      
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
    </nav>
  );
};

// ===========================
// BROKER AI FLOATING ASSISTANT
// ===========================

const BrokerAIFloating = () => {
  const api = useApi();
  const { user } = useApp();
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(true);
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

  if (!user || isMinimized) {
    return (
      <button 
        className="broker-ai-floating-button"
        onClick={() => {
          setIsMinimized(false);
          setIsOpen(true);
        }}
      >
        <span className="ai-icon">💬</span>
      </button>
    );
  }

  return (
    <div className={`broker-ai-floating ${isOpen ? 'open' : ''}`}>
      <div className="broker-ai-header">
        <h3>BrokerAI Assistant</h3>
        <div className="broker-ai-controls">
          <button onClick={() => setIsOpen(false)}>_</button>
          <button onClick={() => setIsMinimized(true)}>×</button>
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
              {msg.sender === 'ai' ? (
                <ReactMarkdown>{msg.message}</ReactMarkdown>
              ) : (
                <p>{msg.message}</p>
              )}
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
          onKeyPress={(e) => e.key === 'Enter' && handleSend()}
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
      
      if (role === 'borrower') {
        await refreshUser();
        navigate('/dashboard');
      } else {
        setFormData({ ...formData, role });
        setStep('profile');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const validateProfile = () => {
    const errors = [];
    
    if (!formData.company_name) errors.push('Company name is required');
    if (!formData.company_type) errors.push('Company type is required');
    if (!formData.investment_focus) errors.push('Investment focus is required');
    if (!formData.typical_deal_size_min) errors.push('Minimum deal size is required');
    if (!formData.typical_deal_size_max) errors.push('Maximum deal size is required');
    if (!formData.years_experience) errors.push('Years of experience is required');
    if (!formData.phone) errors.push('Phone number is required');
    if (!formData.abn) errors.push('ABN is required');
    
    if (!validatePhone(formData.phone)) errors.push('Invalid phone number format');
    if (!validateABN(formData.abn)) errors.push('Invalid ABN format');
    
    if (parseInt(formData.typical_deal_size_min) >= parseInt(formData.typical_deal_size_max)) {
      errors.push('Maximum deal size must be greater than minimum');
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
      await api.completeProfile({
        ...formData,
        typical_deal_size_min: parseInt(formData.typical_deal_size_min),
        typical_deal_size_max: parseInt(formData.typical_deal_size_max),
        years_experience: parseInt(formData.years_experience),
        aum: formData.aum ? parseInt(formData.aum) : null
      });
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
              <div className="role-icon">🏗</div>
              <h3>I'm a Developer</h3>
              <p>I need funding for property development projects</p>
            </button>
            
            <button 
              className="role-card"
              onClick={() => handleRoleSelection('funder')}
              disabled={loading}
            >
              <div className="role-icon">💰</div>
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

              <div className="form-row">
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
                    <option value="Private Credit Fund">Private Credit Fund</option>
                    <option value="Investment Bank">Investment Bank</option>
                    <option value="Family Office">Family Office</option>
                    <option value="Hedge Fund">Hedge Fund</option>
                    <option value="Real Estate Fund">Real Estate Fund</option>
                    <option value="High Net Worth Individual">High Net Worth Individual</option>
                    <option value="Other">Other</option>
                  </select>
                </div>

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
              </div>
            </div>

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
  const [projects, setProjects] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showSubscriptionModal, setShowSubscriptionModal] = useState(false);

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

  if (loading) return <LoadingSpinner />;

  return (
    <div className="dashboard">
      <div className="dashboard-header">
        <div className="header-content">
          <div className="header-text">
            <h1>Dashboard</h1>
            <p className="dashboard-subtitle">
              {user.role === 'borrower' && 'Manage your property development projects'}
              {user.role === 'funder' && 'Discover investment opportunities'}
              {user.role === 'admin' && 'Platform administration'}
            </p>
          </div>
        </div>
      </div>

      {error && <ErrorMessage message={error} onClose={() => setError('')} />}

      {user.role === 'funder' && !user.approved && (
        <div className="warning-message">
          <h3>Account Pending Approval</h3>
          <p>Your account is currently under review. You'll be able to access projects once approved by our team.</p>
        </div>
      )}

      {user.role === 'funder' && user.approved && user.subscription_status !== 'active' && (
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
            <div className="stat-icon">💰</div>
            <div className="stat-content">
              <div className="stat-value">{formatCurrency(stats.total_revenue || 0)}</div>
              <div className="stat-label">Total Revenue</div>
            </div>
          </div>
        </div>
      )}

      <div className="projects-section">
        <div className="section-header">
          <h2>
            {user.role === 'borrower' && 'Your Projects'}
            {user.role === 'funder' && `Available Projects (${projects.length})`}
            {user.role === 'admin' && 'All Projects'}
          </h2>
          {user.role === 'borrower' && (
            <Link to="/create-project" className="btn btn-primary">
              <span>+</span> Create New Project
            </Link>
          )}
        </div>

        {projects.length === 0 ? (
          <EmptyState 
            icon="📂"
            title="No projects found"
            message={
              user.role === 'borrower' 
                ? 'Create your first project to get started.'
                : 'No projects available at the moment.'
            }
            action={
              user.role === 'borrower' && (
                <Link to="/create-project" className="btn btn-primary">
                  Create Project
                </Link>
              )
            }
          />
        ) : (
          <div className="projects-grid">
            {projects.map((project) => (
              <ProjectCard 
                key={project.id} 
                project={project} 
                userRole={user.role}
                onProjectUpdate={handleProjectUpdate}
              />
            ))}
          </div>
        )}
      </div>

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
        message: err.message
      });
    } finally {
      setRequesting(false);
    }
  };

  const handlePaymentSuccess = async () => {
    setShowPaymentModal(false);
    addNotification({
      type: 'success',
      title: 'Payment Successful',
      message: 'Your project is now published and visible to funders.'
    });
    
    if (onProjectUpdate) {
      await onProjectUpdate();
    }
  };

  const getRiskRatingColor = (rating) => {
    switch (rating?.toLowerCase()) {
      case 'low': return 'var(--green-600)';
      case 'medium': return 'var(--yellow-600)';
      case 'high': return 'var(--red-600)';
      default: return 'var(--gray-600)';
    }
  };

  return (
    <div className="project-card enhanced">
      <PaymentModal 
        isOpen={showPaymentModal}
        onClose={() => setShowPaymentModal(false)}
        project={project}
        onSuccess={handlePaymentSuccess}
      />
    
      <div className="project-header">
        <div className="header-content">
          <h3 className="project-title">{project.title}</h3>
          <div className="project-badges">
            <StatusBadge status={project.payment_status === 'paid' ? 'Published' : 'Unpublished'} />
            {project.documents_complete && (
              <StatusBadge status="Docs Complete" />
            )}
          </div>
        </div>
        <div className="project-meta">
          <span className="project-location">📍 {project.suburb}</span>
          <span className="project-date">📅 {formatDate(project.created_at)}</span>
        </div>
      </div>

      <div className="project-financial">
        <div className="financial-item primary">
          <label>Loan Amount</label>
          <span className="value">{formatCurrency(project.loan_amount)}</span>
        </div>
        {project.interest_rate && (
          <div className="financial-item">
            <label>Interest Rate</label>
            <span className="value">{project.interest_rate}%</span>
          </div>
        )}
        {project.loan_term && (
          <div className="financial-item">
            <label>Loan Term</label>
            <span className="value">{project.loan_term} months</span>
          </div>
        )}
        {project.lvr && (
          <div className="financial-item">
            <label>LVR</label>
            <span className="value">{project.lvr.toFixed(1)}%</span>
          </div>
        )}
      </div>

      <div className="project-details">
        <div className="detail-grid">
          <div className="detail-item">
            <span className="label">Property Type</span>
            <span className="value">{project.property_type || 'Not specified'}</span>
          </div>
          <div className="detail-item">
            <span className="label">Development Stage</span>
            <span className="value">{project.development_stage || 'Planning'}</span>
          </div>
          {project.total_project_cost && (
            <div className="detail-item">
              <span className="label">Total Project Cost</span>
              <span className="value">{formatCurrency(project.total_project_cost)}</span>
            </div>
          )}
          {project.expected_profit && (
            <div className="detail-item">
              <span className="label">Expected Profit</span>
              <span className="value">{formatCurrency(project.expected_profit)}</span>
            </div>
          )}
        </div>
      </div>

      {(project.market_risk_rating || project.construction_risk_rating || project.location_risk_rating) && (
        <div className="project-risks">
          <h4>Risk Assessment</h4>
          <div className="risk-grid">
            {project.market_risk_rating && (
              <div className="risk-item">
                <span className="risk-label">Market Risk</span>
                <span className="risk-value" style={{ color: getRiskRatingColor(project.market_risk_rating) }}>
                  {project.market_risk_rating.toUpperCase()}
                </span>
              </div>
            )}
            {project.construction_risk_rating && (
              <div className="risk-item">
                <span className="risk-label">Construction Risk</span>
                <span className="risk-value" style={{ color: getRiskRatingColor(project.construction_risk_rating) }}>
                  {project.construction_risk_rating.toUpperCase()}
                </span>
              </div>
            )}
            {project.location_risk_rating && (
              <div className="risk-item">
                <span className="risk-label">Location Risk</span>
                <span className="risk-value" style={{ color: getRiskRatingColor(project.location_risk_rating) }}>
                  {project.location_risk_rating.toUpperCase()}
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {project.description && (
        <div className="project-description">
          <p>{project.description}</p>
        </div>
      )}

      <div className="project-actions">
        {userRole === 'borrower' && (
          <>
            {project.payment_status === 'unpaid' && (
              <button 
                onClick={() => setShowPaymentModal(true)}
                disabled={!project.documents_complete}
                className="btn btn-primary"
                title={!project.documents_complete ? 'Upload all required documents first' : ''}
              >
                Pay to Publish ($499)
              </button>
            )}
            <button 
              onClick={() => navigate(`/project/${project.id}`)}
              className="btn btn-outline"
            >
              View Details
            </button>
          </>
        )}

        {userRole === 'funder' && project.payment_status === 'paid' && (
          <>
            {project.access_status !== 'approved' && !showMessageInput && (
              <button 
                onClick={() => setShowMessageInput(true)}
                disabled={project.access_status === 'pending'}
                className="btn btn-primary"
              >
                {project.access_status === 'pending' ? '⏳ Request Pending' : '🔓 Request Full Access'}
              </button>
            )}
            {project.access_status === 'approved' && (
              <button 
                onClick={() => navigate(`/project/${project.id}`)}
                className="btn btn-primary"
              >
                View Full Details
              </button>
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
  );
};

// ===========================
// PROJECTS PAGE (FOR FUNDERS)
// ===========================

const ProjectsPage = () => {
  const api = useApi();
  const { user } = useApp();
  const [projects, setProjects] = useState([]);
  const [filteredProjects, setFilteredProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filters, setFilters] = useState({
    propertyType: '',
    minLoan: '',
    maxLoan: '',
    suburb: '',
    developmentStage: '',
    sortBy: 'created_at'
  });

  const debouncedFilters = useDebounce(filters, 300);

  useEffect(() => {
    fetchProjects();
  }, []);

  useEffect(() => {
    applyFilters();
  }, [projects, debouncedFilters]);

  const fetchProjects = async () => {
    try {
      const data = await api.getProjects();
      setProjects(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
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

    // Sorting
    filtered.sort((a, b) => {
      switch (filters.sortBy) {
        case 'loan_amount_asc':
          return a.loan_amount - b.loan_amount;
        case 'loan_amount_desc':
          return b.loan_amount - a.loan_amount;
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
      sortBy: 'created_at'
    });
  };

  if (loading) return <LoadingSpinner />;

  if (!user.approved) {
    return (
      <div className="projects-page">
        <div className="warning-message">
          <h3>Account Pending Approval</h3>
          <p>Your account is currently under review. You'll be able to access projects once approved.</p>
        </div>
      </div>
    );
  }

  if (user.subscription_status !== 'active') {
    return (
      <div className="projects-page">
        <div className="subscription-required">
          <h2>Subscription Required</h2>
          <p>You need an active subscription to browse projects.</p>
          <Link to="/dashboard" className="btn btn-primary">
            Subscribe Now
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="projects-page">
      <div className="page-header">
        <h1>Investment Opportunities</h1>
        <p>Browse and filter active property development projects</p>
      </div>

      {error && <ErrorMessage message={error} onClose={() => setError('')} />}

      <div className="filters-section">
        <h3>Filter Projects</h3>
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
            <label>Min Loan Amount</label>
            <NumberInput
              value={filters.minLoan}
              onChange={(value) => setFilters({ ...filters, minLoan: value })}
              placeholder="Min amount"
              prefix="$"
            />
          </div>

          <div className="filter-group">
            <label>Max Loan Amount</label>
            <NumberInput
              value={filters.maxLoan}
              onChange={(value) => setFilters({ ...filters, maxLoan: value })}
              placeholder="Max amount"
              prefix="$"
            />
          </div>

          <div className="filter-group">
            <label>Suburb</label>
            <input
              type="text"
              value={filters.suburb}
              onChange={(e) => setFilters({ ...filters, suburb: e.target.value })}
              className="form-input"
              placeholder="Search suburb"
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
            <label>Sort By</label>
            <select
              value={filters.sortBy}
              onChange={(e) => setFilters({ ...filters, sortBy: e.target.value })}
              className="form-select"
            >
              <option value="created_at">Newest First</option>
              <option value="loan_amount_desc">Loan Amount (High to Low)</option>
              <option value="loan_amount_asc">Loan Amount (Low to High)</option>
            </select>
          </div>

          <button onClick={clearFilters} className="btn btn-outline">
            Clear Filters
          </button>
        </div>

        <div className="filter-summary">
          Showing {filteredProjects.length} of {projects.length} projects
        </div>
      </div>

      {filteredProjects.length === 0 ? (
        <EmptyState 
          icon="🔍"
          title="No projects match your criteria"
          message="Try adjusting your filters to see more projects"
          action={
            <button onClick={clearFilters} className="btn btn-primary">
              Clear Filters
            </button>
          }
        />
      ) : (
        <div className="projects-grid">
          {filteredProjects.map((project) => (
            <ProjectCard 
              key={project.id} 
              project={project} 
              userRole={user.role}
              onProjectUpdate={fetchProjects}
            />
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
  const [currentStep, setCurrentStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    // Basic Info
    title: '',
    description: '',
    location: '',
    suburb: '',
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
        
        if (formData.land_value && formData.loan_amount) {
          const lvr = (formData.loan_amount / formData.land_value) * 100;
          if (lvr > 80) {
            errors.land_value = 'LVR exceeds 80% - adjust loan amount or land value';
          }
        }
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
      
      addNotification({
        type: 'success',
        title: 'Project Created',
        message: 'Your project has been created successfully!'
      });
      
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
                  <Tooltip content="Street address of the development site">
                    <span className="help-icon">?</span>
                  </Tooltip>
                </label>
                <input
                  type="text"
                  id="location"
                  value={formData.location}
                  onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                  required
                  className={`form-input ${validationErrors.location ? 'error' : ''}`}
                  placeholder="123 Collins St, Melbourne VIC 3000"
                />
                {validationErrors.location && (
                  <span className="field-error">{validationErrors.location}</span>
                )}
              </div>

              <div className="form-group">
                <label htmlFor="suburb">
                  Suburb *
                  <Tooltip content="Suburb where the project is located">
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
                  placeholder="Melbourne"
                />
                {validationErrors.suburb && (
                  <span className="field-error">{validationErrors.suburb}</span>
                )}
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
                <label htmlFor="expected_gdc">
                  Expected GDC (AUD)
                  <Tooltip content="Gross Development Cost - total project cost including all fees">
                    <span className="help-icon">?</span>
                  </Tooltip>
                </label>
                <NumberInput
                  id="expected_gdc"
                  value={formData.expected_gdc}
                  onChange={(value) => setFormData({ ...formData, expected_gdc: value })}
                  placeholder="11,000,000"
                  prefix="$"
                  min={0}
                />
              </div>

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
                  <Tooltip content="Loan amount as percentage of land value. Most lenders require LVR under 80%">
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
                  Project Size (sqm)
                  <Tooltip content="Total site area in square meters">
                    <span className="help-icon">?</span>
                  </Tooltip>
                </label>
                <NumberInput
                  id="project_size_sqm"
                  value={formData.project_size_sqm}
                  onChange={(value) => setFormData({ ...formData, project_size_sqm: value })}
                  placeholder="5,000"
                  suffix="sqm"
                  min={0}
                />
              </div>

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
            </div>

            <div className="form-row">
              <div className="form-group">
                <label htmlFor="number_of_levels">
                  Number of Levels
                  <Tooltip content="Total floors/levels in the development">
                    <span className="help-icon">?</span>
                  </Tooltip>
                </label>
                <NumberInput
                  id="number_of_levels"
                  value={formData.number_of_levels}
                  onChange={(value) => setFormData({ ...formData, number_of_levels: value })}
                  placeholder="10"
                  min={0}
                />
              </div>

              <div className="form-group">
                <label htmlFor="car_spaces">
                  Car Spaces
                  <Tooltip content="Total parking spaces in the development">
                    <span className="help-icon">?</span>
                  </Tooltip>
                </label>
                <NumberInput
                  id="car_spaces"
                  value={formData.car_spaces}
                  onChange={(value) => setFormData({ ...formData, car_spaces: value })}
                  placeholder="75"
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
                addNotification({
                  type: 'success',
                  title: 'Draft Saved',
                  message: 'Your project has been saved as a draft'
                });
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
              className="form-select sort-select"
            >
              <option value="created_at">Newest First</option>
              <option value="loan_amount">Loan Amount</option>
              <option value="title">Title A-Z</option>
            </select>
          </div>

          <div className="projects-table">
            <table>
              <thead>
                <tr>
                  <th>Project Title</th>
                  <th>Location</th>
                  <th>Loan Amount</th>
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
                      {project.documents_complete && (
                        <span className="docs-badge">📄 Docs Complete</span>
                      )}
                    </td>
                    <td>{project.suburb}</td>
                    <td>{formatCurrency(project.loan_amount)}</td>
                    <td>
                      <StatusBadge status={project.payment_status === 'paid' ? 'Published' : 'Draft'} />
                    </td>
                    <td>{formatDate(project.created_at)}</td>
                    <td className="actions-cell">
                      <button
                        onClick={() => navigate(`/project/${project.id}`)}
                        className="btn btn-sm btn-outline"
                      >
                        View
                      </button>
                      {project.payment_status === 'unpaid' && (
                        <button
                          onClick={() => navigate(`/project/${project.id}/edit`)}
                          className="btn btn-sm btn-primary"
                        >
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
  const { addNotification } = useNotifications();
  const [project, setProject] = useState(null);
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('overview');
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [previewDocument, setPreviewDocument] = useState(null);

  useEffect(() => {
    fetchProjectDetails();
  }, [id]);

  const fetchProjectDetails = async () => {
    try {
      const [projectData, docsData] = await Promise.all([
        api.getProject(id),
        api.getProjectDocuments(id)
      ]);
      setProject(projectData);
      setDocuments(docsData);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handlePaymentSuccess = async () => {
    setShowPaymentModal(false);
    addNotification({
      type: 'success',
      title: 'Payment Successful',
      message: 'Your project is now published and visible to funders.'
    });
    await fetchProjectDetails();
  };

  const handleDocumentPreview = async (doc) => {
    if (doc.mime_type?.includes('pdf')) {
      setPreviewDocument(doc);
    } else {
      // Direct download for non-PDF files
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

  if (loading) return <LoadingSpinner />;
  if (error) return <ErrorMessage message={error} onClose={() => navigate(-1)} />;
  if (!project) return <div>Project not found</div>;

  const tabs = [
    { id: 'overview', label: 'Overview' },
    { id: 'financials', label: 'Financials' },
    { id: 'documents', label: `Documents (${documents.length})` },
    { id: 'activity', label: 'Activity' }
  ];

  return (
    <div className="project-detail">
      <div className="detail-header">
        <div className="header-content">
          <h1>{project.title}</h1>
          <div className="header-meta">
            <span className="location">📍 {project.location}</span>
            <StatusBadge status={project.payment_status === 'paid' ? 'Published' : 'Draft'} />
            {project.documents_complete && <StatusBadge status="Docs Complete" />}
          </div>
        </div>
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
                Pay to PublishPay to Publish ($499)
              </button>
            </>
          )}
        </div>
      </div>

      <Tabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab} />

      <div className="detail-content">
        {activeTab === 'overview' && (
          <div className="overview-section">
            <div className="info-grid">
              <div className="info-card">
                <h3>Project Overview</h3>
                <p>{project.description || 'No description provided.'}</p>
              </div>

              <div className="info-card">
                <h3>Key Details</h3>
                <div className="detail-list">
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
                    <label>Planning Status</label>
                    <span>{project.planning_permit_status || 'Not Started'}</span>
                  </div>
                  <div className="detail-item">
                    <label>Zoning</label>
                    <span>{project.zoning || 'N/A'}</span>
                  </div>
                </div>
              </div>

              <div className="info-card">
                <h3>Timeline</h3>
                <div className="timeline">
                  <div className="timeline-item">
                    <label>Expected Start</label>
                    <span>{project.expected_start_date ? formatDate(project.expected_start_date) : 'TBD'}</span>
                  </div>
                  <div className="timeline-item">
                    <label>Expected Completion</label>
                    <span>{project.expected_completion_date ? formatDate(project.expected_completion_date) : 'TBD'}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'financials' && (
          <div className="financials-section">
            <div className="financial-cards">
              <div className="financial-card primary">
                <h3>Loan Details</h3>
                <div className="amount">{formatCurrency(project.loan_amount)}</div>
                <div className="details">
                  <div>Interest Rate: {project.interest_rate || 'TBD'}%</div>
                  <div>Term: {project.loan_term || 'TBD'} months</div>
                  <div>Monthly Payment: {project.interest_rate && project.loan_amount 
                    ? formatCurrency((project.loan_amount * project.interest_rate / 100) / 12)
                    : 'TBD'}</div>
                </div>
              </div>

              <div className="financial-card">
                <h3>Project Costs</h3>
                <div className="cost-breakdown">
                  <div className="cost-item">
                    <label>Total Project Cost</label>
                    <span>{formatCurrency(project.total_project_cost || 0)}</span>
                  </div>
                  <div className="cost-item">
                    <label>Land Value</label>
                    <span>{formatCurrency(project.land_value || 0)}</span>
                  </div>
                  <div className="cost-item">
                    <label>Construction Cost</label>
                    <span>{formatCurrency(project.construction_cost || 0)}</span>
                  </div>
                  <div className="cost-item">
                    <label>Equity Contribution</label>
                    <span>{formatCurrency(project.equity_contribution || 0)}</span>
                  </div>
                </div>
              </div>

              <div className="financial-card">
                <h3>Financial Metrics</h3>
                <div className="metrics">
                  <div className="metric">
                    <label>LVR</label>
                    <span className="value">{project.lvr ? `${project.lvr.toFixed(1)}%` : 'N/A'}</span>
                  </div>
                  <div className="metric">
                    <label>ICR</label>
                    <span className="value">{project.icr ? project.icr.toFixed(2) : 'N/A'}</span>
                  </div>
                  <div className="metric">
                    <label>Expected Profit</label>
                    <span className="value">{formatCurrency(project.expected_profit || 0)}</span>
                  </div>
                  <div className="metric">
                    <label>Profit Margin</label>
                    <span className="value">
                      {project.expected_profit && project.total_project_cost
                        ? `${((project.expected_profit / project.total_project_cost) * 100).toFixed(1)}%`
                        : 'N/A'}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'documents' && (
          <div className="documents-section">
            <div className="documents-grid">
              {documents.length === 0 ? (
                <EmptyState 
                  icon="📄"
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
                documents.map(doc => (
                  <div key={doc.id} className="document-card">
                    <div className="doc-icon">📄</div>
                    <div className="doc-info">
                      <h4>{doc.file_name}</h4>
                      <p>{doc.document_type.replace(/_/g, ' ')}</p>
                      <p className="doc-meta">
                        Uploaded {formatDate(doc.uploaded_at)}
                      </p>
                    </div>
                    <div className="doc-actions">
                      <button 
                        onClick={() => handleDocumentPreview(doc)}
                        className="btn btn-sm btn-outline"
                      >
                        View
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {activeTab === 'activity' && (
          <div className="activity-section">
            <div className="activity-timeline">
              <div className="activity-item">
                <div className="activity-icon">🎉</div>
                <div className="activity-content">
                  <h4>Project Created</h4>
                  <p>Project was created by {user.name}</p>
                  <p className="activity-time">{formatDateTime(project.created_at)}</p>
                </div>
              </div>
              {project.payment_status === 'paid' && (
                <div className="activity-item">
                  <div className="activity-icon">✓</div>
                  <div className="activity-content">
                    <h4>Project Published</h4>
                    <p>Payment received and project is now visible to funders</p>
                    <p className="activity-time">{formatDateTime(project.updated_at)}</p>
                  </div>
                </div>
              )}
              {documents.length > 0 && (
                <div className="activity-item">
                  <div className="activity-icon">📄</div>
                  <div className="activity-content">
                    <h4>Documents Uploaded</h4>
                    <p>{documents.length} documents uploaded</p>
                    <p className="activity-time">{formatDateTime(documents[0].uploaded_at)}</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <PaymentModal 
        isOpen={showPaymentModal}
        onClose={() => setShowPaymentModal(false)}
        project={project}
        onSuccess={handlePaymentSuccess}
      />

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
  const api = useApi();
  const navigate = useNavigate();
  const { addNotification } = useNotifications();
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

      addNotification({
        type: 'success',
        title: 'Project Updated',
        message: 'Your project has been updated successfully!'
      });
      
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
              {saving ? 'Saving Changes...' : 'Save All Changes'}
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
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const fetchConversations = async () => {
    try {
      const data = await api.getAccessRequests();
      setConversations(data);
      if (data.length > 0 && !selectedConversation) {
        setSelectedConversation(data[0]);
      }
    } catch (err) {
      console.error('Failed to fetch conversations:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchMessages = async (requestId) => {
    try {
      const conversation = conversations.find(c => c.id === requestId);
      const data = await api.getMessages(requestId);
      
      // If there's an initial message and no other messages, add it
      if (conversation?.initial_message && data.length === 0) {
        const initialMsg = {
          id: 'initial-' + requestId,
          sender_role: 'funder',
          sender_name: conversation.funder_name,
          message: conversation.initial_message,
          sent_at: conversation.requested_at
        };
        setMessages([initialMsg]);
      } else {
        setMessages(data);
      }
    } catch (err) {
      console.error('Failed to fetch messages:', err);
    }
  };

  const handleSendMessage = async () => {
    if (!newMessage.trim() || !selectedConversation) return;
    
    setSending(true);
    try {
      await api.sendMessage(selectedConversation.id, newMessage.trim());
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
      addNotification({
        type: 'success',
        title: 'Access Approved',
        message: 'Funder now has access to full project details'
      });
      fetchConversations();
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
      addNotification({
        type: 'info',
        title: 'Access Declined',
        message: 'Access request has been declined'
      });
      fetchConversations();
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
        <div className="conversations-sidebar">
          <div className="sidebar-header">
            <h3>Conversations</h3>
            <span className="conversation-count">{conversations.length}</span>
          </div>
          
          <div className="conversations-list">
            {conversations.length === 0 ? (
              <div className="no-conversations">
                <p>No conversations yet</p>
              </div>
            ) : (
              conversations.map((conversation) => (
                <div
                  key={conversation.id}
                  className={`conversation-item ${selectedConversation?.id === conversation.id ? 'active' : ''}`}
                  onClick={() => setSelectedConversation(conversation)}
                >
                  <div className="conversation-avatar">
                    {user.role === 'borrower' 
                      ? conversation.funder_name.charAt(0).toUpperCase()
                      : conversation.project_title.charAt(0).toUpperCase()
                    }
                  </div>
                  
                  <div className="conversation-info">
                    <div className="conversation-header">
                      <div className="conversation-name">
                        {user.role === 'borrower' 
                          ? conversation.funder_name 
                          : conversation.project_title
                        }
                      </div>
                      <div className="conversation-time">
                        {formatTime(conversation.requested_at)}
                      </div>
                    </div>
                    
                    <div className="conversation-preview">
                      {conversation.initial_message || 'Access request'}
                    </div>
                    
                    <div className="conversation-meta">
                      <StatusBadge status={conversation.status} />
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Chat Area */}
        <div className="chat-area">
          {selectedConversation ? (
            <>
              {/* Chat Header */}
              <div className="chat-header">
                <div className="chat-participant">
                  <div className="participant-info">
                    <div className="participant-name">
                      {user.role === 'borrower' 
                        ? selectedConversation.funder_name 
                        : selectedConversation.project_title
                      }
                    </div>
                    <div className="participant-details">
                      {user.role === 'borrower' && selectedConversation.company_name && (
                        <span>{selectedConversation.company_name} • {selectedConversation.company_type}</span>
                      )}
                      {user.role === 'funder' && (
                        <span>Loan Amount: {formatCurrency(selectedConversation.loan_amount)}</span>
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
                        className={`message-bubble ${message.sender_role === user.role ? 'own' : 'other'}`}
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
            <div className="no-conversation-selected">
              <div className="no-conversation-icon">💼</div>
              <h3>Select a conversation</h3>
              <p>Choose a conversation from the sidebar to start messaging.</p>
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
                <div className="welcome-icon">🤖</div>
                <h3>Welcome to BrokerAI</h3>
                <p>I'm here to help you with property development finance questions.</p>
                <button onClick={createNewSession} className="btn btn-primary">
                  Start New Chat
                </button>
              </div>
            ) : messages.length === 0 ? (
              <div className="starter-message">
                <div className="ai-avatar">🤖</div>
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
            icon="📊"
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
  const [notifications, setNotifications] = useState({
    email_messages: true,
    email_access_requests: true,
    email_project_updates: true,
    email_newsletter: false
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchNotificationPreferences();
  }, []);

  const fetchNotificationPreferences = async () => {
    try {
      const prefs = await api.getNotificationPreferences();
      setNotifications(prefs);
    } catch (err) {
      console.error('Failed to fetch notification preferences:', err);
    }
  };

  const handleSaveNotifications = async () => {
    setSaving(true);
    try {
      await api.updateNotificationPreferences(notifications);
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
      </div>

      <div className="settings-content">
        <div className="settings-section">
          <h3>Email Notifications</h3>
          <div className="settings-list">
            <div className="setting-item">
              <div className="setting-info">
                <label>New Messages</label>
                <p className="setting-description">
                  Receive email notifications when you get new messages
                </p>
              </div>
              <div className="setting-control">
                <label className="switch">
                  <input
                    type="checkbox"
                    checked={notifications.email_messages}
                    onChange={(e) => setNotifications({ ...notifications, email_messages: e.target.checked })}
                  />
                  <span className="slider"></span>
                </label>
              </div>
            </div>

            {user.role === 'borrower' && (
              <div className="setting-item">
                <div className="setting-info">
                  <label>Access Requests</label>
                  <p className="setting-description">
                    Get notified when funders request access to your projects
                  </p>
                </div>
                <div className="setting-control">
                  <label className="switch">
                    <input
                      type="checkbox"
                      checked={notifications.email_access_requests}
                      onChange={(e) => setNotifications({ ...notifications, email_access_requests: e.target.checked })}
                    />
                    <span className="slider"></span>
                  </label>
                </div>
              </div>
            )}

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
                    checked={notifications.email_project_updates}
                    onChange={(e) => setNotifications({ ...notifications, email_project_updates: e.target.checked })}
                  />
                  <span className="slider"></span>
                </label>
              </div>
            </div>

            <div className="setting-item">
              <div className="setting-info">
                <label>Newsletter</label>
                <p className="setting-description">
                  Receive our monthly newsletter with market insights
                </p>
              </div>
              <div className="setting-control">
                <label className="switch">
                  <input
                    type="checkbox"
                    checked={notifications.email_newsletter}
                    onChange={(e) => setNotifications({ ...notifications, email_newsletter: e.target.checked })}
                  />
                  <span className="slider"></span>
                </label>
              </div>
            </div>
          </div>

          <button 
            onClick={handleSaveNotifications}
            disabled={saving}
            className="btn btn-primary"
          >
            {saving ? 'Saving...' : 'Save Preferences'}
          </button>
        </div>
      </div>
    </div>
  );
};

// ===========================
// ADMIN PANEL
// ===========================

const AdminPanel = () => {
  const api = useApi();
  const { addNotification } = useNotifications();
  const [activeTab, setActiveTab] = useState('overview');
  const [users, setUsers] = useState([]);
  const [stats, setStats] = useState(null);
  const [settings, setSettings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedUser, setSelectedUser] = useState(null);
  const [showUserModal, setShowUserModal] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

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

  const handleApproveUser = async (userId) => {
    try {
      await api.approveUser(userId);
      setUsers(users.map(user => 
        user.id === userId ? { ...user, approved: true, verification_status: 'verified' } : user
      ));
      addNotification({
        type: 'success',
        title: 'User Approved',
        message: 'User has been approved successfully'
      });
    } catch (err) {
      addNotification({
        type: 'error',
        title: 'Approval Failed',
        message: 'Failed to approve user'
      });
    }
  };

  const handleUpdateSetting = async (key, value) => {
    try {
      await api.updateSystemSetting(key, value);
      setSettings(settings.map(setting => 
        setting.setting_key === key ? { ...setting, setting_value: value } : setting
      ));
      addNotification({
        type: 'success',
        title: 'Setting Updated',
        message: 'System setting has been updated'
      });
    } catch (err) {
      addNotification({
        type: 'error',
        title: 'Update Failed',
        message: 'Failed to update setting'
      });
    }
  };

  const viewUserDetails = (user) => {
    setSelectedUser(user);
    setShowUserModal(true);
  };

  if (loading) return <LoadingSpinner />;

  const tabs = [
    { id: 'overview', label: 'Overview' },
    { id: 'users', label: `Users (${users.length})` },
    { id: 'funders', label: 'Funders' },
    { id: 'analytics', label: 'Analytics' },
    { id: 'settings', label: 'Settings' }
  ];

  return (
    <div className="admin-panel">
      <div className="admin-header">
        <h1>Admin Panel</h1>
        <p>Platform administration and management</p>
      </div>

      <Tabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab} />

      <div className="admin-content">
        {activeTab === 'overview' && stats && (
          <div className="overview-section">
            <div className="stats-grid">
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
                  <div className="stat-label">Published Projects</div>
                </div>
              </div>
              <div className="stat-card">
                <div className="stat-icon">⏳</div>
                <div className="stat-content">
                  <div className="stat-value">{formatNumber(stats.pending_requests)}</div>
                  <div className="stat-label">Pending Requests</div>
                </div>
              </div>
              <div className="stat-card">
                <div className="stat-icon">💰</div>
                <div className="stat-content">
                  <div className="stat-value">{formatCurrency(stats.total_revenue || 0)}</div>
                  <div className="stat-label">Total Revenue</div>
                </div>
              </div>
              <div className="stat-card">
                <div className="stat-icon">📈</div>
                <div className="stat-content">
                  <div className="stat-value">{stats.conversion_rate || '0'}%</div>
                  <div className="stat-label">Conversion Rate</div>
                </div>
              </div>
            </div>

            <div className="activity-feed">
              <h3>Recent Activity</h3>
              <div className="activity-list">
                <div className="activity-item">
                  <span className="activity-icon">🆕</span>
                  <div className="activity-content">
                    <p>New user registration: John Smith (Funder)</p>
                    <span className="activity-time">2 hours ago</span>
                  </div>
                </div>
                <div className="activity-item">
                  <span className="activity-icon">📁</span>
                  <div className="activity-content">
                    <p>New project listed: Sydney CBD Development</p>
                    <span className="activity-time">4 hours ago</span>
                  </div>
                </div>
                <div className="activity-item">
                  <span className="activity-icon">✓</span>
                  <div className="activity-content">
                    <p>Project published: Melbourne Apartments</p>
                    <span className="activity-time">Yesterday</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'users' && (
          <div className="users-section">
            <div className="users-table">
              <table>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Role</th>
                    <th>Company</th>
                    <th>Status</th>
                    <th>Subscription</th>
                    <th>Joined</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map(user => (
                    <tr key={user.id}>
                      <td>{user.name}</td>
                      <td>{user.email}</td>
                      <td>
                        <span className="role-badge">{user.role}</span>
                      </td>
                      <td>{user.company_name || '-'}</td>
                      <td>
                        <StatusBadge status={user.approved ? 'Approved' : 'Pending'} />
                      </td>
                      <td>
                        {user.role === 'funder' && (
                          <StatusBadge status={user.subscription_status || 'inactive'} />
                        )}
                      </td>
                      <td>{formatDate(user.created_at)}</td>
                      <td className="actions-cell">
                        <button
                          onClick={() => viewUserDetails(user)}
                          className="btn btn-sm btn-outline"
                        >
                          View
                        </button>
                        {!user.approved && user.role !== 'admin' && (
                          <button
                            onClick={() => handleApproveUser(user.id)}
                            className="btn btn-sm btn-primary"
                          >
                            Approve
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'funders' && (
          <div className="funders-section">
            <h3>Funder Verification Queue</h3>
            <div className="funders-grid">
              {users.filter(u => u.role === 'funder' && !u.approved).map(funder => (
                <div key={funder.id} className="funder-card">
                  <div className="funder-header">
                    <h4>{funder.name}</h4>
                    <StatusBadge status="Pending Verification" />
                  </div>
                  <div className="funder-details">
                    <div className="detail-item">
                      <label>Company</label>
                      <span>{funder.company_name}</span>
                    </div>
                    <div className="detail-item">
                      <label>Type</label>
                      <span>{funder.company_type}</span>
                    </div>
                    <div className="detail-item">
                      <label>Focus</label>
                      <span>{funder.investment_focus}</span>
                    </div>
                    <div className="detail-item">
                      <label>Deal Range</label>
                      <span>{formatCurrency(funder.typical_deal_size_min)} - {formatCurrency(funder.typical_deal_size_max)}</span>
                    </div>
                    <div className="detail-item">
                      <label>Experience</label>
                      <span>{funder.years_experience} years</span>
                    </div>
                    <div className="detail-item">
                      <label>ABN</label>
                      <span>{funder.abn}</span>
                    </div>
                    <div className="detail-item">
                      <label>Phone</label>
                      <span>{funder.phone}</span>
                    </div>
                    {funder.linkedin && (
                      <div className="detail-item">
                        <label>LinkedIn</label>
                        <a href={funder.linkedin} target="_blank" rel="noopener noreferrer">
                          View Profile
                        </a>
                      </div>
                    )}
                  </div>
                  {funder.bio && (
                    <div className="funder-bio">
                      <label>Bio</label>
                      <p>{funder.bio}</p>
                    </div>
                  )}
                  <div className="funder-actions">
                    <button
                      onClick={() => handleApproveUser(funder.id)}
                      className="btn btn-primary"
                    >
                      Approve & Notify
                    </button>
                    <button className="btn btn-outline">
                      Request More Info
                    </button>
                  </div>
                </div>
              ))}
              
              {users.filter(u => u.role === 'funder' && !u.approved).length === 0 && (
                <EmptyState 
                  icon="✓"
                  title="All funders verified"
                  message="No pending funder verifications"
                />
              )}
            </div>
          </div>
        )}

        {activeTab === 'analytics' && (
          <div className="analytics-section">
            <h3>Platform Analytics</h3>
            <div className="analytics-grid">
              <div className="analytics-card">
                <h4>User Growth</h4>
                <div className="chart-placeholder">
                  <p>User growth chart would go here</p>
                </div>
              </div>
              <div className="analytics-card">
                <h4>Project Funding Rate</h4>
                <div className="chart-placeholder">
                  <p>Funding rate chart would go here</p>
                </div>
              </div>
              <div className="analytics-card">
                <h4>Revenue Trends</h4>
                <div className="chart-placeholder">
                  <p>Revenue trends chart would go here</p>
                </div>
              </div>
              <div className="analytics-card">
                <h4>User Activity</h4>
                <div className="chart-placeholder">
                  <p>Activity heatmap would go here</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'settings' && (
          <div className="settings-section">
            <h3>System Settings</h3>
            <div className="settings-list">
              {settings.map(setting => (
                <div key={setting.id} className="setting-item">
                  <div className="setting-info">
                    <label>{setting.setting_key.replace(/_/g, ' ').toUpperCase()}</label>
                    <p className="setting-description">
                      {setting.setting_key === 'project_listing_fee' && 'Fee charged to list a project (in cents)'}
                      {setting.setting_key === 'monthly_subscription_fee' && 'Monthly subscription for funders (in cents)'}
                      {setting.setting_key === 'max_file_upload_size' && 'Maximum file upload size (in bytes)'}
                      {setting.setting_key === 'ai_chat_enabled' && 'Enable/disable AI chat feature'}
                    </p>
                  </div>
                  <div className="setting-control">
                    {setting.setting_key === 'ai_chat_enabled' ? (
                      <select
                        value={setting.setting_value}
                        onChange={(e) => handleUpdateSetting(setting.setting_key, e.target.value)}
                        className="form-select"
                      >
                        <option value="true">Enabled</option>
                        <option value="false">Disabled</option>
                      </select>
                    ) : (
                      <input
                        type="number"
                        value={setting.setting_value}
                        onChange={(e) => handleUpdateSetting(setting.setting_key, e.target.value)}
                        className="form-input"
                      />
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {showUserModal && selectedUser && (
        <Modal 
          isOpen={showUserModal} 
          onClose={() => setShowUserModal(false)}
          title="User Details"
          size="large"
        >
          <div className="user-details-modal">
            <div className="user-info-section">
              <h3>Basic Information</h3>
              <div className="info-grid">
                <div className="info-item">
                  <label>Name</label>
                  <span>{selectedUser.name}</span>
                </div>
                <div className="info-item">
                  <label>Email</label>
                  <span>{selectedUser.email}</span>
                </div>
                <div className="info-item">
                  <label>Role</label>
                  <span>{selectedUser.role}</span>
                </div>
                <div className="info-item">
                  <label>Status</label>
                  <StatusBadge status={selectedUser.approved ? 'Approved' : 'Pending'} />
                </div>
              </div>
            </div>
            
            {selectedUser.role === 'funder' && (
              <div className="user-info-section">
                <h3>Company Details</h3>
                <div className="info-grid">
                  <div className="info-item">
                    <label>Company</label>
                    <span>{selectedUser.company_name}</span>
                  </div>
                  <div className="info-item">
                    <label>Type</label>
                    <span>{selectedUser.company_type}</span>
                  </div>
                  <div className="info-item">
                    <label>Investment Focus</label>
                    <span>{selectedUser.investment_focus}</span>
                  </div>
                  <div className="info-item">
                    <label>Deal Range</label>
                    <span>{formatCurrency(selectedUser.typical_deal_size_min)} - {formatCurrency(selectedUser.typical_deal_size_max)}</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
};

// ===========================
// PAYMENT MODAL
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
          project={project}
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
const PaymentForm = ({ amount, project, onSuccess, processing, setProcessing }) => {
  const api = useApi();
  const stripe = useStripe();
  const elements = useElements();
  const { addNotification } = useNotifications();

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!stripe || !elements) return;
    
    setProcessing(true);

    try {
      // For demo/testing, simulate payment
      const response = await api.simulatePaymentSuccess(
        project.id, 
        'pi_demo_' + Date.now()
      );
      
      onSuccess();
    } catch (err) {
      addNotification({
        type: 'error',
        title: 'Payment Failed',
        message: err.message
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
                  color: '#aab7c4',
                },
              },
            },
          }}
        />
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

// Subscription Form Component
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
      // For demo/testing, simulate subscription
      const response = await api.simulateSubscription();
      
      onSuccess();
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

// ===========================
// LANDING PAGE
// ===========================

const LandingPage = () => {
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  
  return (
    <div className="landing-page">
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
                <span className="stat-value">$100M+</span>
                <span className="stat-label">Projects Listed</span>
              </div>
              <div className="stat">
                <span className="stat-value">50+</span>
                <span className="stat-label">Active Funders</span>
              </div>
              <div className="stat">
                <span className="stat-value">24-48hrs</span>
                <span className="stat-label">Approval Time</span>
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

      {/* Features Section */}
      <section id="features" className="features-section">
        <div className="container">
          <h2 className="section-title">Built for Modern Property Finance</h2>
          <p className="section-subtitle">
            Everything you need to connect, transact, and succeed
          </p>
          
          <div className="features-grid">
            <div className="feature-card">
              <div className="feature-icon-wrapper">
                <svg className="feature-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
                  <polyline points="9 22 9 12 15 12 15 22"></polyline>
                </svg>
              </div>
              <h3>For Developers</h3>
              <ul>
                <li>List projects in minutes</li>
                <li>Access verified funders</li>
                <li>Secure document sharing</li>
                <li>Real-time messaging</li>
                <li>Track deal progress</li>
              </ul>
            </div>
            
            <div className="feature-card">
              <div className="feature-icon-wrapper">
                <svg className="feature-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="12" y1="2" x2="12" y2="22"></line>
                  <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path>
                </svg>
              </div>
              <h3>For Funders</h3>
              <ul>
                <li>Curated deal flow</li>
                <li>Comprehensive due diligence</li>
                <li>Risk assessment tools</li>
                <li>Portfolio management</li>
                <li>Deal pipeline tracking</li>
              </ul>
            </div>
            
            <div className="feature-card featured">
              <div className="feature-icon-wrapper">
                <svg className="feature-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path>
                  <circle cx="12" cy="12" r="10"></circle>
                </svg>
              </div>
              <h3>BrokerAI Assistant</h3>
              <ul>
                <li>24/7 expert guidance</li>
                <li>LVR & feasibility analysis</li>
                <li>Market insights</li>
                <li>Compliance support</li>
                <li>Deal structuring help</li>
              </ul>
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
              Get Started Free
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
              <p>1300 TRANCH</p>
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
          <Router>
            <Routes>
              {/* Public Routes */}
              <Route path="/" element={<LandingPage />} />
              <Route path="/login" element={<ClerkAuthWrapper mode="sign-in" />} />
              <Route path="/register" element={<ClerkAuthWrapper mode="sign-up" />} />
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
            <ProtectedRoute roles={['borrower', 'funder']}>
              <MessagesPage />
            </ProtectedRoute>
          } />
          <Route path="/broker-ai" element={
            <ProtectedRoute>
              <BrokerAI />
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