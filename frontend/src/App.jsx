// App.jsx - Complete Tranch Application with Clerk Authentication
import React, { useState, useEffect, createContext, useContext, useRef } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, Link, useNavigate, useLocation } from 'react-router-dom';
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
  SignIn,    // NEW - was missing
  SignUp 
} from '@clerk/clerk-react';

// Clerk Publishable Key
const CLERK_PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY || 'pk_test_YOUR_KEY_HERE';

// API configuration
const API_BASE_URL = import.meta.env.PROD
  ? 'https://tranch-platform.onrender.com/api'
  : 'http://localhost:5000/api';

// Create API client function
const createApiClient = (getToken) => {
  const request = async (endpoint, options = {}) => {
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
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Something went wrong');
    }

    return data;
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
    
    // Document download with auth
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
    simulatePaymentSuccess: (projectId, paymentIntentId) => request('/payments/simulate-success', {
      method: 'POST',
      body: JSON.stringify({ 
        project_id: projectId, 
        payment_intent_id: paymentIntentId 
      }),
    }),
    createSubscription: (paymentMethodId) => request('/payments/create-subscription', {
      method: 'POST',
      body: JSON.stringify({ payment_method_id: paymentMethodId }),
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
    
    // Deal status endpoints
    updateDealStatus: (requestId, status) => request(`/access-requests/${requestId}/status`, {
      method: 'PUT',
      body: JSON.stringify({ status }),
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
  };
};

// Create a hook to use the API
const useApi = () => {
  const { getToken } = useAuth();
  return createApiClient(getToken);
};

// App Context for managing user data
const AppContext = createContext();

const useApp = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within AppProvider');
  }
  return context;
};

const AppProvider = ({ children }) => {
  const { user: clerkUser, isSignedIn, isLoaded } = useUser();
  const { getToken } = useAuth();  // Add this
  const [userData, setUserData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (isLoaded) {
      if (isSignedIn && clerkUser) {
        fetchUserData();
      } else {
        setUserData(null);
        setLoading(false);
      }
    }
  }, [isSignedIn, isLoaded, clerkUser]);

  const fetchUserData = async () => {
    try {
      const api = createApiClient(getToken);  // Create API instance here
      const data = await api.getCurrentUser();
      setUserData(data.user);
    } catch (err) {
      console.error('Failed to fetch user data:', err);
    } finally {
      setLoading(false);
    }
  };

  const refreshUser = async () => {
    await fetchUserData();
  };

  const value = {
    user: userData,
    loading,
    refreshUser,
    isAuthenticated: isSignedIn
  };

  return (
    <AppContext.Provider value={value}>
      {children}
    </AppContext.Provider>
  );
};

// Utility Functions
const formatCurrency = (amount) => {
  return new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency: 'AUD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
};

const formatDate = (dateString) => {
  return new Date(dateString).toLocaleDateString('en-AU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
};

const formatTime = (dateString) => {
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

// Deal status options
const DEAL_STATUSES = {
  pending: 'Pending Review',
  approved: 'Exploring',
  due_diligence: 'Due Diligence',
  term_sheet: 'Term Sheet',
  funded: 'Funded',
  declined: 'Declined',
  closed: 'Closed'
};

// Loading Spinner Component
const LoadingSpinner = () => (
  <div className="loading-spinner">
    <div className="spinner"></div>
  </div>
);

// Error Message Component
const ErrorMessage = ({ message, onClose }) => (
  <div className="error-message">
    <span>{message}</span>
    <button onClick={onClose} className="close-btn">&times;</button>
  </div>
);

// Success Message Component
const SuccessMessage = ({ message, onClose }) => (
  <div className="success-message">
    <span>{message}</span>
    <button onClick={onClose} className="close-btn">&times;</button>
  </div>
);

// Navigation Component with Mobile Menu
const Navigation = () => {
  const api = useApi();
  const { user } = useApp();
  const { signOut } = useClerk();
  const navigate = useNavigate();
  const location = useLocation();
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [accessRequests, setAccessRequests] = useState([]);
  const [unreadMessages, setUnreadMessages] = useState(0);

  useEffect(() => {
    if (user && user.role === 'borrower') {
      fetchAccessRequests();
    }
  }, [user]);

  const fetchAccessRequests = async () => {
    try {
      const data = await api.getAccessRequests();
      setAccessRequests(data.filter(req => req.status === 'pending'));
    } catch (err) {
      console.error('Failed to fetch access requests:', err);
    }
  };

  const handleLogout = async () => {
    await signOut();
    navigate('/');
  };

  if (!user) return null;

  const isActive = (path) => location.pathname === path;

  const navLinks = [
    { path: '/dashboard', label: 'Dashboard', roles: ['borrower', 'funder', 'admin'] },
    { path: '/messages', label: 'Messages', roles: ['borrower', 'funder'], badge: unreadMessages },
    { path: '/create-project', label: 'Create Project', roles: ['borrower'] },
    { path: '/my-projects', label: 'My Projects', roles: ['borrower'] },
    { path: '/portfolio', label: 'Portfolio', roles: ['funder'] },
    { path: '/ai-broker', label: 'BrokerAI', roles: ['borrower', 'funder'] },
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
              {link.badge > 0 && <span className="nav-badge">{link.badge}</span>}
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
          <div className="profile-dropdown-container">
            <button 
              className="profile-dropdown-toggle"
              onClick={() => setShowProfileMenu(!showProfileMenu)}
            >
              <div className="user-avatar">
                {user.name.charAt(0).toUpperCase()}
              </div>
              {user.role === 'borrower' && accessRequests.length > 0 && (
                <span className="notification-dot">{accessRequests.length}</span>
              )}
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
                
                {user.role === 'borrower' && accessRequests.length > 0 && (
                  <>
                    <div className="dropdown-section">
                      <div className="dropdown-section-title">Notifications</div>
                      {accessRequests.slice(0, 3).map(request => (
                        <Link 
                          key={request.id}
                          to="/messages"
                          className="dropdown-notification"
                          onClick={() => setShowProfileMenu(false)}
                        >
                          <strong>{request.funder_name}</strong>
                          <span>Requested access to {request.project_title}</span>
                        </Link>
                      ))}
                      {accessRequests.length > 3 && (
                        <Link 
                          to="/messages" 
                          className="dropdown-view-all"
                          onClick={() => setShowProfileMenu(false)}
                        >
                          View all {accessRequests.length} requests
                        </Link>
                      )}
                    </div>
                    <div className="dropdown-divider"></div>
                  </>
                )}
                
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
                  <span className="dropdown-icon">⚙️</span>
                  Settings
                </Link>
                
                <div className="dropdown-divider"></div>
                
                <button onClick={handleLogout} className="dropdown-item logout">
                  <span className="dropdown-icon">🚪</span>
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
              {link.badge > 0 && <span className="nav-badge">{link.badge}</span>}
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

// Protected Route Component
const ProtectedRoute = ({ children, roles = [] }) => {
  const { user, loading, isAuthenticated } = useApp();
  const location = useLocation();

  if (loading) {
    return <LoadingSpinner />;
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

// Clerk Auth Wrapper with custom styling
const ClerkAuthWrapper = ({ mode }) => {
  const navigate = useNavigate();
  const [showClerkUI, setShowClerkUI] = useState(false);

  // Custom styled container that matches your design
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

        {!showClerkUI ? (
          <>
            <button 
              onClick={() => setShowClerkUI(true)}
              className="auth-button"
            >
              {mode === 'sign-in' ? 'Sign In' : 'Create Account'}
            </button>
            
            <div className="auth-footer">
              <p>
                {mode === 'sign-in' 
                  ? "Don't have an account? "
                  : "Already have an account? "
                }
                <Link 
                  to={mode === 'sign-in' ? '/register' : '/login'} 
                  className="auth-link"
                >
                  {mode === 'sign-in' ? 'Sign up' : 'Sign in'}
                </Link>
              </p>
            </div>
          </>
        ) : (
          <div className="clerk-container">
            {mode === 'sign-in' ? (
              <SignIn 
                appearance={{
                  elements: {
                    rootBox: "clerk-root",
                    card: "clerk-card"
                  }
                }}
                afterSignInUrl="/onboarding"
              />
            ) : (
              <SignUp 
                appearance={{
                  elements: {
                    rootBox: "clerk-root",
                    card: "clerk-card"
                  }
                }}
                afterSignUpUrl="/onboarding"
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
};

// Onboarding Component
const Onboarding = () => {
  const { user: clerkUser } = useUser();
  const { refreshUser } = useApp();
  const navigate = useNavigate();
  const api = useApi();
  const [step, setStep] = useState('role'); // role, profile, complete
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

  const handleProfileSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      await api.completeProfile(formData);
      await refreshUser();
      setStep('complete');
    } catch (err) {
      setError(err.message);
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
              <div className="role-icon">🏗️</div>
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
                  <label htmlFor="company_name">Company Name *</label>
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
                  <label htmlFor="abn">ABN *</label>
                  <input
                    type="text"
                    id="abn"
                    value={formData.abn}
                    onChange={(e) => setFormData({ ...formData, abn: e.target.value })}
                    required
                    className="form-input"
                    placeholder="12 345 678 901"
                    pattern="[0-9\s]{11,14}"
                  />
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="company_type">Company Type *</label>
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
                  <label htmlFor="years_experience">Years Experience *</label>
                  <input
                    type="number"
                    id="years_experience"
                    value={formData.years_experience}
                    onChange={(e) => setFormData({ ...formData, years_experience: e.target.value })}
                    required
                    className="form-input"
                    placeholder="10"
                    min="0"
                  />
                </div>
              </div>
            </div>

            <div className="form-section">
              <h3>Investment Profile</h3>
              
              <div className="form-group">
                <label htmlFor="investment_focus">Investment Focus *</label>
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
                  <label htmlFor="typical_deal_size_min">Min Deal Size (AUD) *</label>
                  <input
                    type="number"
                    id="typical_deal_size_min"
                    value={formData.typical_deal_size_min}
                    onChange={(e) => setFormData({ ...formData, typical_deal_size_min: e.target.value })}
                    required
                    className="form-input"
                    placeholder="1000000"
                    min="1"
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="typical_deal_size_max">Max Deal Size (AUD) *</label>
                  <input
                    type="number"
                    id="typical_deal_size_max"
                    value={formData.typical_deal_size_max}
                    onChange={(e) => setFormData({ ...formData, typical_deal_size_max: e.target.value })}
                    required
                    className="form-input"
                    placeholder="50000000"
                    min="1"
                  />
                </div>
              </div>

              <div className="form-group">
                <label htmlFor="aum">Assets Under Management (AUD)</label>
                <input
                  type="number"
                  id="aum"
                  value={formData.aum}
                  onChange={(e) => setFormData({ ...formData, aum: e.target.value })}
                  className="form-input"
                  placeholder="100000000"
                  min="1"
                />
              </div>
            </div>

            <div className="form-section">
              <h3>Contact Information</h3>
              
              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="phone">Phone Number *</label>
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
                  <label htmlFor="linkedin">LinkedIn Profile</label>
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
                <label htmlFor="bio">Professional Bio</label>
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

// Document Preview Modal
const DocumentPreviewModal = ({ document, onClose }) => {
  const api = useApi();
  const [loading, setLoading] = useState(true);
  const [previewUrl, setPreviewUrl] = useState('');

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
      console.error('Download failed:', err);
    }
  };

  if (!document) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content document-preview" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{document.file_name}</h2>
          <div className="modal-actions">
            <button onClick={handleDownload} className="btn btn-sm btn-primary">
              Download
            </button>
            <button onClick={onClose} className="close-btn">&times;</button>
          </div>
        </div>
        
        <div className="modal-body">
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
        </div>
      </div>
    </div>
  );
};

// Enhanced Project Card Component
const ProjectCard = ({ project, userRole, onProjectUpdate, showActions = true }) => {
  const api = useApi();
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const [paying, setPaying] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');
  const [showMessageInput, setShowMessageInput] = useState(false);
  const [accessMessage, setAccessMessage] = useState('');
  const navigate = useNavigate();

  const handleRequestAccess = async () => {
    setRequesting(true);
    try {
      await api.requestAccess(project.id, accessMessage.trim() || null);
      setSuccess('Access request submitted successfully');
      setShowMessageInput(false);
      setAccessMessage('');
      if (onProjectUpdate) onProjectUpdate();
    } catch (err) {
      setError(err.message);
    } finally {
      setRequesting(false);
    }
  };

  const handlePayToPublish = async () => {
    setShowPaymentModal(true);
  };

  const handlePaymentSuccess = async () => {
    setShowPaymentModal(false);
    setSuccess('Payment successful! Your project is now published.');
    
    setTimeout(async () => {
      if (onProjectUpdate) {
        await onProjectUpdate();
      }
    }, 500);
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
      {success && <SuccessMessage message={success} onClose={() => setSuccess('')} />}
      {error && <ErrorMessage message={error} onClose={() => setError('')} />}
      
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
            <span className={`status-badge ${project.payment_status}`}>
              {project.payment_status === 'paid' ? '✓ Published' : '🔒 Unpublished'}
            </span>
            {project.documents_complete && (
              <span className="status-badge complete">📄 Docs Complete</span>
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

      {showActions && (
        <div className="project-actions">
          {userRole === 'borrower' && (
            <>
              {project.payment_status === 'unpaid' && (
                <button 
                  onClick={handlePayToPublish}
                  disabled={paying || !project.documents_complete}
                  className="btn btn-primary"
                  title={!project.documents_complete ? 'Upload all required documents first' : ''}
                >
                  {paying ? 'Processing Payment...' : 'Pay to Publish ($499 AUD)'}
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
      )}
    </div>
  );
};

// Subscription Modal Component for Funders
const SubscriptionModal = ({ isOpen, onClose, onSuccess }) => {
  const [error, setError] = useState('');
  const [processing, setProcessing] = useState(false);
  const { user } = useApp();

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Funder Subscription</h2>
          <button onClick={onClose} className="close-btn">&times;</button>
        </div>
        
        <div className="modal-body">
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

              {error && <ErrorMessage message={error} onClose={() => setError('')} />}

              <Elements stripe={stripePromise}>
                <SubscriptionForm 
                  onSuccess={onSuccess}
                  setError={setError}
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
        </div>
      </div>
    </div>
  );
};

// Subscription Form Component
const SubscriptionForm = ({ onSuccess, setError, processing, setProcessing, user }) => {
  const api = useApi();
  const stripe = useStripe();
  const elements = useElements();

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!stripe || !elements) return;
    
    setProcessing(true);
    setError('');

    try {
      const response = await api.request('/payments/simulate-subscription', {
        method: 'POST',
        body: JSON.stringify({})
      });
      
      onSuccess();
    } catch (err) {
      setError(err.message || 'Failed to activate subscription');
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
        {processing ? 'Processing...' : 'Start Subscription - $299/month'}
      </button>
      
      <div className="subscription-terms">
        <p>By subscribing, you agree to our terms of service. Cancel anytime.</p>
      </div>
    </form>
  );
};

// Dashboard Component with Deal Status
const Dashboard = () => {
  const api = useApi();
  const [showSubscriptionModal, setShowSubscriptionModal] = useState(false);
  const { user, refreshUser } = useApp();
  const [projects, setProjects] = useState([]);
  const [filteredProjects, setFilteredProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filters, setFilters] = useState({
    propertyType: '',
    minLoan: '',
    maxLoan: '',
    suburb: '',
    developmentStage: ''
  });
  const [stats, setStats] = useState(null);
  const [deals, setDeals] = useState({
    exploring: [],
    dueDiligence: [],
    termSheet: [],
    funded: []
  });

  useEffect(() => {
    fetchData();
  }, [user?.role]);

  useEffect(() => {
    applyFilters();
  }, [projects, filters]);

  const fetchData = async () => {
    try {
      const projectData = await api.getProjects();
      setProjects(projectData);
      
      if (user?.role === 'admin') {
        const statsData = await api.getAdminStats();
        setStats(statsData);
      }
      
      if (user?.role === 'funder') {
        const accessRequests = await api.getAccessRequests();
        categorizeDeals(accessRequests);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const categorizeDeals = (requests) => {
    const categorized = {
      exploring: [],
      dueDiligence: [],
      termSheet: [],
      funded: []
    };
    
    requests.forEach(req => {
      switch (req.status) {
        case 'approved':
          categorized.exploring.push(req);
          break;
        case 'due_diligence':
          categorized.dueDiligence.push(req);
          break;
        case 'term_sheet':
          categorized.termSheet.push(req);
          break;
        case 'funded':
          categorized.funded.push(req);
          break;
      }
    });
    
    setDeals(categorized);
  };

  const handleProjectUpdate = async () => {
    setLoading(true);
    await fetchData();
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

    setFilteredProjects(filtered);
  };

  if (loading || !user) return <LoadingSpinner />;

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
              <div className="stat-value">{stats.total_users}</div>
              <div className="stat-label">Total Users</div>
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-icon">📁</div>
            <div className="stat-content">
              <div className="stat-value">{stats.total_projects}</div>
              <div className="stat-label">Total Projects</div>
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-icon">✅</div>
            <div className="stat-content">
              <div className="stat-value">{stats.active_projects}</div>
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

      {user.role === 'funder' && user.approved && user.subscription_status === 'active' && (
        <div className="deal-pipeline">
          <h2>Deal Pipeline</h2>
          <div className="pipeline-stages">
            <div className="pipeline-stage">
              <h3>Exploring ({deals.exploring.length})</h3>
              <div className="stage-amount">{formatCurrency(deals.exploring.reduce((sum, d) => sum + d.loan_amount, 0))}</div>
            </div>
            <div className="pipeline-stage">
              <h3>Due Diligence ({deals.dueDiligence.length})</h3>
              <div className="stage-amount">{formatCurrency(deals.dueDiligence.reduce((sum, d) => sum + d.loan_amount, 0))}</div>
            </div>
            <div className="pipeline-stage">
              <h3>Term Sheet ({deals.termSheet.length})</h3>
              <div className="stage-amount">{formatCurrency(deals.termSheet.reduce((sum, d) => sum + d.loan_amount, 0))}</div>
            </div>
            <div className="pipeline-stage funded">
              <h3>Funded ({deals.funded.length})</h3>
              <div className="stage-amount">{formatCurrency(deals.funded.reduce((sum, d) => sum + d.loan_amount, 0))}</div>
            </div>
          </div>
        </div>
      )}

      {user.role === 'funder' && (
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
              <input
                type="number"
                value={filters.minLoan}
                onChange={(e) => setFilters({ ...filters, minLoan: e.target.value })}
                className="form-input"
                placeholder="Min amount"
              />
            </div>

            <div className="filter-group">
              <label>Max Loan Amount</label>
              <input
                type="number"
                value={filters.maxLoan}
                onChange={(e) => setFilters({ ...filters, maxLoan: e.target.value })}
                className="form-input"
                placeholder="Max amount"
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

            <button 
              onClick={() => setFilters({
                propertyType: '',
                minLoan: '',
                maxLoan: '',
                suburb: '',
                developmentStage: ''
              })}
              className="btn btn-outline"
            >
              Clear Filters
            </button>
          </div>
        </div>
      )}

      <div className="projects-section">
        <div className="section-header">
          <h2>
            {user.role === 'borrower' && 'Your Projects'}
            {user.role === 'funder' && `Available Projects (${filteredProjects.length})`}
            {user.role === 'admin' && 'All Projects'}
          </h2>
          {user.role === 'borrower' && (
            <Link to="/create-project" className="btn btn-primary">
              <span>➕</span> Create New Project
            </Link>
          )}
        </div>

        {filteredProjects.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">📂</div>
            <h3>No projects found</h3>
            <p>
              {user.role === 'borrower' && 'Create your first project to get started.'}
              {user.role === 'funder' && filters.propertyType || filters.minLoan || filters.maxLoan || filters.suburb || filters.developmentStage
                ? 'Try adjusting your filters to see more projects.'
                : 'No projects available at the moment.'}
            </p>
          </div>
        ) : (
          <div className="projects-grid">
            {filteredProjects.map((project) => (
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
          
          setTimeout(async () => {
            await refreshUser();
            await fetchData();
          }, 1000);
        }}
      />
    </div>
  );
};

// Landing Page with Updated Copy
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
          {/* Mobile menu button */}
          <button 
            className="mobile-menu-btn"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          >
            <span></span>
            <span></span>
            <span></span>
          </button>
        </div>
        
        {/* Mobile Menu */}
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
                <span className="stat-value">Live Soon</span>
                <span className="stat-label">Platform Launch</span>
              </div>
              <div className="stat">
                <span className="stat-value">$0 Fees</span>
                <span className="stat-label">Until First Deal</span>
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

      {/* How It Works */}
      <section id="how-it-works" className="how-it-works">
        <div className="container">
          <h2 className="section-title">Simple, Secure, Efficient</h2>
          
          <div className="process-timeline">
            <div className="process-step">
              <div className="step-number">1</div>
              <h3>Create Your Profile</h3>
              <p>Sign up as a developer or funder with verified credentials</p>
            </div>
            
            <div className="process-step">
              <div className="step-number">2</div>
              <h3>List or Browse</h3>
              <p>Developers list projects, funders browse opportunities</p>
            </div>
            
            <div className="process-step">
              <div className="step-number">3</div>
              <h3>Connect & Negotiate</h3>
              <p>Secure messaging and document sharing platform</p>
            </div>
            
            <div className="process-step">
              <div className="step-number">4</div>
              <h3>Close the Deal</h3>
              <p>Track progress from initial interest to funding</p>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section id="pricing" className="pricing-section">
        <div className="container">
          <h2 className="section-title">Transparent Pricing</h2>
          <p className="section-subtitle">Pay only when you succeed</p>
          
          <div className="pricing-grid">
            <div className="pricing-card">
              <h3>Developers</h3>
              <div className="price">
                <span className="currency">$</span>
                <span className="amount">499</span>
                <span className="period">per funded project</span>
              </div>
              <ul>
                <li>
                  <svg className="check-icon" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                  List unlimited projects
                </li>
                <li>
                  <svg className="check-icon" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                  Access to all funders
                </li>
                <li>
                  <svg className="check-icon" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                  Secure document portal
                </li>
                <li>
                  <svg className="check-icon" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                  BrokerAI assistance
                </li>
                <li>
                  <svg className="check-icon" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                  No upfront fees
                </li>
              </ul>
              <Link to="/register" className="btn btn-primary btn-block">
                Start Listing
              </Link>
            </div>
            
            <div className="pricing-card">
              <h3>Funders</h3>
              <div className="price">
                <span className="currency">$</span>
                <span className="amount">299</span>
                <span className="period">per month</span>
              </div>
              <ul>
                <li>
                  <svg className="check-icon" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                  Unlimited deal access
                </li>
                <li>
                  <svg className="check-icon" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                  Advanced filters
                </li>
                <li>
                  <svg className="check-icon" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                  Due diligence tools
                </li>
                <li>
                  <svg className="check-icon" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                  Portfolio analytics
                </li>
                <li>
                  <svg className="check-icon" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                  Cancel anytime
                </li>
              </ul>
              <Link to="/register?role=funder" className="btn btn-primary btn-block">
                Start Investing
              </Link>
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
              <a href="#">Privacy</a>
              <a href="#">Terms</a>
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

// Other existing components (unchanged but included for completeness)
const stripePromise = loadStripe('pk_test_51RU7lrQupq5Lj3mgQLoOPZQnTHeOOC8HSXs9x4D0H9uURhmGi0tlRxvkiuTy9NEd9RlM3B51YBpvgMdwlbU6bvkQ00WUSGUnp8');

// Payment Modal Component
const PaymentModal = ({ isOpen, onClose, project, onSuccess }) => {
  const [error, setError] = useState('');

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Publish Project</h2>
          <button onClick={onClose} className="close-btn">&times;</button>
        </div>
        
        <div className="modal-body">
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

          {error && <ErrorMessage message={error} onClose={() => setError('')} />}

          <Elements stripe={stripePromise}>
            <PaymentForm 
              amount={499}
              project={project}
              onSuccess={onSuccess}
              onError={setError}
            />
          </Elements>

          <div className="payment-security">
            <span>🔒</span>
            <p>Secured by Stripe. Your payment information is encrypted and secure.</p>
          </div>
        </div>
      </div>
    </div>
  );
};

// Payment Form Component
const PaymentForm = ({ amount, onSuccess, onError, project }) => {
  const api = useApi();
  const stripe = useStripe()
  const elements = useElements();
  const [processing, setProcessing] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!stripe || !elements) return;
    
    setProcessing(true);

    try {
      const response = await api.simulatePaymentSuccess(
        project.id, 
        'pi_demo_' + Date.now()
      );
      
      onSuccess();
    } catch (err) {
      onError(err.message);
    }

    setProcessing(false);
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
        className="btn btn-primary"
      >
        {processing ? 'Processing...' : `Pay ${formatCurrency(amount)}`}
      </button>
    </form>
  );
};

// All other existing components remain the same...
// (CreateProject, MyProjects, ProjectDetail, MessagesPage, BrokerAI, Portfolio, UserProfile, AdminPanel, EditProject)
// These are unchanged from your original code but would be included here

// Main App Component
const App = () => {
  return (
    <ClerkProvider publishableKey={CLERK_PUBLISHABLE_KEY}>
      <Router>
        <AppProvider>
          <div className="app">
            <SignedIn>
              <Navigation />
            </SignedIn>
            <main className="main-content">
              <Routes>
                {/* Public routes */}
                <Route path="/" element={<LandingPage />} />
                <Route path="/login" element={<ClerkAuthWrapper mode="sign-in" />} />
                <Route path="/register" element={<ClerkAuthWrapper mode="sign-up" />} />
                
                {/* Onboarding */}
                <Route path="/onboarding" element={
                  <SignedIn>
                    <Onboarding />
                  </SignedIn>
                } />
                
                {/* Protected routes */}
                <Route path="/dashboard" element={
                  <ProtectedRoute>
                    <Dashboard />
                  </ProtectedRoute>
                } />
                
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
                
                <Route path="/project/:id" element={
                  <ProtectedRoute>
                    <ProjectDetail />
                  </ProtectedRoute>
                } />
                
                <Route path="/project/:id/edit" element={
                  <ProtectedRoute roles={['borrower']}>
                    <EditProject />
                  </ProtectedRoute>
                } />
                
                <Route path="/messages" element={
                  <ProtectedRoute>
                    <MessagesPage />
                  </ProtectedRoute>
                } />
                
                <Route path="/ai-broker" element={
                  <ProtectedRoute>
                    <BrokerAI />
                  </ProtectedRoute>
                } />
                
                <Route path="/portfolio" element={
                  <ProtectedRoute roles={['funder']}>
                    <Portfolio />
                  </ProtectedRoute>
                } />
                
                <Route path="/profile" element={
                  <ProtectedRoute>
                    <UserProfile />
                  </ProtectedRoute>
                } />
                
                <Route path="/admin" element={
                  <ProtectedRoute roles={['admin']}>
                    <AdminPanel />
                  </ProtectedRoute>
                } />
                
                {/* Settings page (placeholder) */}
                <Route path="/settings" element={
                  <ProtectedRoute>
                    <div style={{ padding: '2rem', textAlign: 'center' }}>
                      <h1>Settings</h1>
                      <p>Settings page coming soon...</p>
                    </div>
                  </ProtectedRoute>
                } />
              </Routes>
            </main>
          </div>
        </AppProvider>
      </Router>
    </ClerkProvider>
  );
};

// CSS additions for mobile menu
const mobileMenuStyles = `
.mobile-menu-btn {
  display: none;
}

.mobile-nav-menu {
  display: none;
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  background: white;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
  padding: 1rem;
  flex-direction: column;
  gap: 0.5rem;
}

.mobile-nav-menu a,
.mobile-nav-menu .btn {
  display: block;
  width: 100%;
  text-align: center;
  padding: 0.75rem;
}

.mobile-menu {
  position: fixed;
  top: 72px;
  left: 0;
  right: 0;
  background: white;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
  z-index: 999;
  max-height: calc(100vh - 72px);
  overflow-y: auto;
}

.mobile-menu-link {
  display: block;
  padding: 1rem 1.5rem;
  color: var(--gray-700);
  text-decoration: none;
  border-bottom: 1px solid var(--gray-100);
  transition: background 0.2s;
}

.mobile-menu-link:hover {
  background: var(--gray-50);
}

.mobile-menu-link.active {
  background: var(--primary-50);
  color: var(--primary-700);
  font-weight: 600;
}

.mobile-menu-divider {
  height: 8px;
  background: var(--gray-100);
  margin: 0;
}

.desktop-only {
  display: flex;
}

@media (max-width: 768px) {
  .mobile-menu-btn {
    display: flex;
  }
  
  .desktop-only {
    display: none !important;
  }
  
  .mobile-nav-menu {
    display: flex;
  }
  
  .nav-menu {
    display: none;
  }
  
  .hero-container {
    grid-template-columns: 1fr;
    text-align: center;
  }
  
  .hero-visual {
    display: none;
  }
  
  .hero-actions {
    flex-direction: column;
    width: 100%;
  }
  
  .hero-actions .btn {
    width: 100%;
  }
}

/* Onboarding styles */
.onboarding-container {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 2rem;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
}

.onboarding-card {
  background: white;
  padding: 3rem;
  border-radius: 1rem;
  max-width: 600px;
  width: 100%;
  text-align: center;
}

.onboarding-card.wide {
  max-width: 800px;
}

.role-selection {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 2rem;
  margin-top: 3rem;
}

.role-card {
  background: white;
  border: 2px solid var(--gray-200);
  padding: 2rem;
  border-radius: 1rem;
  cursor: pointer;
  transition: all 0.3s;
}

.role-card:hover {
  border-color: var(--primary-500);
  transform: translateY(-4px);
  box-shadow: 0 10px 20px rgba(0, 0, 0, 0.1);
}

.role-icon {
  font-size: 3rem;
  margin-bottom: 1rem;
}

.onboarding-form {
  text-align: left;
  margin-top: 2rem;
}

.success-icon {
  width: 80px;
  height: 80px;
  background: var(--success);
  color: white;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 3rem;
  margin: 0 auto 2rem;
}

/* Document preview styles */
.document-preview {
  max-width: 90vw;
  max-height: 90vh;
  width: 1000px;
}

.document-iframe {
  width: 100%;
  height: 70vh;
  border: none;
  border-radius: 0.5rem;
}

.preview-unavailable {
  padding: 4rem 2rem;
  text-align: center;
}

.modal-actions {
  display: flex;
  gap: 1rem;
  align-items: center;
}

/* Deal pipeline styles */
.deal-pipeline {
  margin: 2rem 0;
}

.pipeline-stages {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 1rem;
  margin-top: 1rem;
}

.pipeline-stage {
  background: white;
  padding: 1.5rem;
  border-radius: 0.75rem;
  text-align: center;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.pipeline-stage h3 {
  font-size: 1rem;
  color: var(--gray-700);
  margin-bottom: 0.5rem;
}

.stage-amount {
  font-size: 1.5rem;
  font-weight: 700;
  color: var(--gray-900);
}

.pipeline-stage.funded {
  background: var(--gradient-primary);
  color: white;
}

.pipeline-stage.funded h3 {
  color: white;
}

.pipeline-stage.funded .stage-amount {
  color: white;
}

/* Clerk custom styles */
.clerk-root {
  width: 100%;
}

.clerk-card {
  background: transparent !important;
  box-shadow: none !important;
  padding: 0 !important;
}
`;

// Create Project Component with Full Features
const CreateProject = () => {
  const api = useApi();
  const [currentStep, setCurrentStep] = useState(1);
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
  const [success, setSuccess] = useState('');
  const [projectId, setProjectId] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    fetchRequiredDocuments();
  }, []);

  const fetchRequiredDocuments = async () => {
    try {
      const data = await api.getRequiredDocuments();
      setRequiredDocs(data);
    } catch (err) {
      console.error('Failed to fetch required documents:', err);
    }
  };

  const handleNext = () => {
    if (validateStep(currentStep)) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handlePrevious = () => {
    setCurrentStep(currentStep - 1);
  };

  const validateStep = (step) => {
    switch (step) {
      case 1:
        if (!formData.title || !formData.location || !formData.suburb || !formData.loan_amount) {
          setError('Please fill in all required fields');
          return false;
        }
        break;
      case 2:
        if (!formData.total_project_cost || !formData.equity_contribution) {
          setError('Please fill in total project cost and equity contribution');
          return false;
        }
        break;
      case 3:
        // Project details are optional
        break;
      case 4:
        // Documents will be uploaded after project creation
        break;
    }
    setError('');
    return true;
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
      
      // Upload documents if any
      if (documents.length > 0) {
        await uploadDocuments(response.project_id);
      }
      
      setSuccess('Project created successfully!');
      
      setTimeout(() => {
        navigate('/my-projects');
      }, 2000);
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
      
      documents.forEach((doc, index) => {
        formData.append('documents', doc.file);
        documentTypes.push(doc.type);
      });
      
      formData.append('document_types', JSON.stringify(documentTypes));
      
      await api.uploadDocuments(projectId, formData);
    } catch (err) {
      console.error('Document upload error:', err);
      // Don't throw - project is already created
    } finally {
      setUploadingDocs(false);
    }
  };

  const handleDocumentChange = (e, docType) => {
    const file = e.target.files[0];
    if (file) {
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
              <label htmlFor="title">Project Title *</label>
              <input
                type="text"
                id="title"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                required
                className="form-input"
                placeholder="e.g., Luxury Apartment Development - Sydney CBD"
              />
            </div>

            <div className="form-group">
              <label htmlFor="description">Project Description</label>
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
                <label htmlFor="location">Full Address *</label>
                <input
                  type="text"
                  id="location"
                  value={formData.location}
                  onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                  required
                  className="form-input"
                  placeholder="123 Collins St, Melbourne VIC 3000"
                />
              </div>

              <div className="form-group">
                <label htmlFor="suburb">Suburb *</label>
                <input
                  type="text"
                  id="suburb"
                  value={formData.suburb}
                  onChange={(e) => setFormData({ ...formData, suburb: e.target.value })}
                  required
                  className="form-input"
                  placeholder="Melbourne"
                />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label htmlFor="property_type">Property Type</label>
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
                <label htmlFor="development_stage">Development Stage</label>
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
              <label htmlFor="loan_amount">Loan Amount Required (AUD) *</label>
              <input
                type="number"
                id="loan_amount"
                value={formData.loan_amount}
                onChange={(e) => setFormData({ ...formData, loan_amount: e.target.value })}
                required
                className="form-input"
                placeholder="5000000"
                min="1"
              />
              {formData.loan_amount && (
                <div className="field-help">{formatCurrency(formData.loan_amount)}</div>
              )}
            </div>

            <div className="form-row">
              <div className="form-group">
                <label htmlFor="interest_rate">Target Interest Rate (%)</label>
                <input
                  type="number"
                  id="interest_rate"
                  value={formData.interest_rate}
                  onChange={(e) => setFormData({ ...formData, interest_rate: e.target.value })}
                  className="form-input"
                  placeholder="8.5"
                  step="0.1"
                  min="0"
                />
              </div>

              <div className="form-group">
                <label htmlFor="loan_term">Loan Term (months)</label>
                <input
                  type="number"
                  id="loan_term"
                  value={formData.loan_term}
                  onChange={(e) => setFormData({ ...formData, loan_term: e.target.value })}
                  className="form-input"
                  placeholder="24"
                  min="1"
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
                <label htmlFor="total_project_cost">Total Project Cost (AUD) *</label>
                <input
                  type="number"
                  id="total_project_cost"
                  value={formData.total_project_cost}
                  onChange={(e) => setFormData({ ...formData, total_project_cost: e.target.value })}
                  required
                  className="form-input"
                  placeholder="10000000"
                  min="1"
                />
                {formData.total_project_cost && (
                  <div className="field-help">{formatCurrency(formData.total_project_cost)}</div>
                )}
              </div>

              <div className="form-group">
                <label htmlFor="equity_contribution">Equity Contribution (AUD) *</label>
                <input
                  type="number"
                  id="equity_contribution"
                  value={formData.equity_contribution}
                  onChange={(e) => setFormData({ ...formData, equity_contribution: e.target.value })}
                  required
                  className="form-input"
                  placeholder="5000000"
                  min="0"
                />
                {formData.equity_contribution && (
                  <div className="field-help">{formatCurrency(formData.equity_contribution)}</div>
                )}
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label htmlFor="land_value">Land Value (AUD)</label>
                <input
                  type="number"
                  id="land_value"
                  value={formData.land_value}
                  onChange={(e) => setFormData({ ...formData, land_value: e.target.value })}
                  className="form-input"
                  placeholder="3000000"
                  min="0"
                />
                {formData.land_value && (
                  <div className="field-help">{formatCurrency(formData.land_value)}</div>
                )}
              </div>

              <div className="form-group">
                <label htmlFor="construction_cost">Construction Cost (AUD)</label>
                <input
                  type="number"
                  id="construction_cost"
                  value={formData.construction_cost}
                  onChange={(e) => setFormData({ ...formData, construction_cost: e.target.value })}
                  className="form-input"
                  placeholder="7000000"
                  min="0"
                />
                {formData.construction_cost && (
                  <div className="field-help">{formatCurrency(formData.construction_cost)}</div>
                )}
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label htmlFor="expected_gdc">Expected GDC (AUD)</label>
                <input
                  type="number"
                  id="expected_gdc"
                  value={formData.expected_gdc}
                  onChange={(e) => setFormData({ ...formData, expected_gdc: e.target.value })}
                  className="form-input"
                  placeholder="15000000"
                  min="0"
                />
                {formData.expected_gdc && (
                  <div className="field-help">{formatCurrency(formData.expected_gdc)}</div>
                )}
              </div>

              <div className="form-group">
                <label htmlFor="expected_profit">Expected Profit (AUD)</label>
                <input
                  type="number"
                  id="expected_profit"
                  value={formData.expected_profit}
                  onChange={(e) => setFormData({ ...formData, expected_profit: e.target.value })}
                  className="form-input"
                  placeholder="2000000"
                  min="0"
                />
                {formData.expected_profit && (
                  <div className="field-help">{formatCurrency(formData.expected_profit)}</div>
                )}
              </div>
            </div>

            {/* Financial Metrics */}
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
                    {formData.loan_amount && formData.equity_contribution 
                      ? (parseInt(formData.loan_amount) / parseInt(formData.equity_contribution)).toFixed(2)
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
                <label htmlFor="project_size_sqm">Project Size (sqm)</label>
                <input
                  type="number"
                  id="project_size_sqm"
                  value={formData.project_size_sqm}
                  onChange={(e) => setFormData({ ...formData, project_size_sqm: e.target.value })}
                  className="form-input"
                  placeholder="5000"
                  min="0"
                />
              </div>

              <div className="form-group">
                <label htmlFor="number_of_units">Number of Units</label>
                <input
                  type="number"
                  id="number_of_units"
                  value={formData.number_of_units}
                  onChange={(e) => setFormData({ ...formData, number_of_units: e.target.value })}
                  className="form-input"
                  placeholder="50"
                  min="0"
                />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label htmlFor="number_of_levels">Number of Levels</label>
                <input
                  type="number"
                  id="number_of_levels"
                  value={formData.number_of_levels}
                  onChange={(e) => setFormData({ ...formData, number_of_levels: e.target.value })}
                  className="form-input"
                  placeholder="10"
                  min="0"
                />
              </div>

              <div className="form-group">
                <label htmlFor="car_spaces">Car Spaces</label>
                <input
                  type="number"
                  id="car_spaces"
                  value={formData.car_spaces}
                  onChange={(e) => setFormData({ ...formData, car_spaces: e.target.value })}
                  className="form-input"
                  placeholder="75"
                  min="0"
                />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label htmlFor="zoning">Zoning</label>
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
                <label htmlFor="planning_permit_status">Planning Permit Status</label>
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
                <label htmlFor="expected_start_date">Expected Start Date</label>
                <input
                  type="date"
                  id="expected_start_date"
                  value={formData.expected_start_date}
                  onChange={(e) => setFormData({ ...formData, expected_start_date: e.target.value })}
                  className="form-input"
                />
              </div>

              <div className="form-group">
                <label htmlFor="expected_completion_date">Expected Completion Date</label>
                <input
                  type="date"
                  id="expected_completion_date"
                  value={formData.expected_completion_date}
                  onChange={(e) => setFormData({ ...formData, expected_completion_date: e.target.value })}
                  className="form-input"
                />
              </div>
            </div>

            <div className="form-section">
              <h4>Risk Assessment</h4>
              <div className="risk-assessment-grid">
                <div className="form-group">
                  <label htmlFor="market_risk_rating">Market Risk</label>
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
                  <label htmlFor="construction_risk_rating">Construction Risk</label>
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
                  <label htmlFor="location_risk_rating">Location Risk</label>
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
                  You can upload additional supporting documents here
                </div>
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
      {success && <SuccessMessage message={success} onClose={() => setSuccess('')} />}

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
              disabled={loading || uploadingDocs}
              className="btn btn-primary"
            >
              {loading ? 'Creating Project...' : 'Create Project'}
            </button>
          )}
        </div>
      </form>
    </div>
  );
};

// My Projects Page (Borrower)
const MyProjects = () => {
  const api = useApi();
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedProject, setSelectedProject] = useState(null);
  const navigate = useNavigate();

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

  if (loading) return <LoadingSpinner />;

  return (
    <div className="my-projects-page">
      <div className="page-header">
        <h1>My Projects</h1>
        <Link to="/create-project" className="btn btn-primary">
          <span>➕</span> Create New Project
        </Link>
      </div>

      {projects.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">📁</div>
          <h3>No projects yet</h3>
          <p>Create your first project to start connecting with funders.</p>
          <Link to="/create-project" className="btn btn-primary">
            Create Project
          </Link>
        </div>
      ) : (
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
              {projects.map(project => (
                <tr key={project.id}>
                  <td className="project-title-cell">
                    <strong>{project.title}</strong>
                  </td>
                  <td>{project.suburb}</td>
                  <td>{formatCurrency(project.loan_amount)}</td>
                  <td>
                    <span className={`status-badge ${project.payment_status}`}>
                      {project.payment_status === 'paid' ? 'Published' : 'Draft'}
                    </span>
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
      )}
    </div>
  );
};

// Project Detail Page
const ProjectDetail = () => {
  const api = useApi();
  const { id } = useParams();
  const { user } = useApp();
  const [project, setProject] = useState(null);
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('overview');

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

  if (loading) return <LoadingSpinner />;
  if (error) return <ErrorMessage message={error} onClose={() => window.history.back()} />;
  if (!project) return <div>Project not found</div>;

  return (
    <div className="project-detail">
      <div className="detail-header">
        <div className="header-content">
          <h1>{project.title}</h1>
          <div className="header-meta">
            <span className="location">📍 {project.location}</span>
            <span className={`status-badge ${project.payment_status}`}>
              {project.payment_status === 'paid' ? 'Published' : 'Draft'}
            </span>
          </div>
        </div>
        <div className="header-actions">
          {user.role === 'borrower' && project.payment_status === 'unpaid' && (
            <button className="btn btn-primary">
              Pay to Publish ($499)
            </button>
          )}
        </div>
      </div>

      <div className="detail-tabs">
        <button
          className={`tab ${activeTab === 'overview' ? 'active' : ''}`}
          onClick={() => setActiveTab('overview')}
        >
          Overview
        </button>
        <button
          className={`tab ${activeTab === 'financials' ? 'active' : ''}`}
          onClick={() => setActiveTab('financials')}
        >
          Financials
        </button>
        <button
          className={`tab ${activeTab === 'documents' ? 'active' : ''}`}
          onClick={() => setActiveTab('documents')}
        >
          Documents ({documents.length})
        </button>
        <button
          className={`tab ${activeTab === 'activity' ? 'active' : ''}`}
          onClick={() => setActiveTab('activity')}
        >
          Activity
        </button>
      </div>

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
                    <span>{project.project_size_sqm ? `${project.project_size_sqm} sqm` : 'N/A'}</span>
                  </div>
                  <div className="detail-item">
                    <label>Number of Units</label>
                    <span>{project.number_of_units || 'N/A'}</span>
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
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'documents' && (
          <div className="documents-section">
            <div className="documents-grid">
              {documents.length === 0 ? (
                <div className="empty-state">
                  <p>No documents uploaded yet.</p>
                </div>
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
                      <a 
                        href={`${API_BASE_URL.replace('/api', '')}/${doc.file_path}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn btn-sm btn-outline"
                      >
                        View
                      </a>
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
                  <p>{formatDate(project.created_at)}</p>
                </div>
              </div>
              {project.payment_status === 'paid' && (
                <div className="activity-item">
                  <div className="activity-icon">💳</div>
                  <div className="activity-content">
                    <h4>Project Published</h4>
                    <p>Payment received and project is now visible to funders</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// Messages Page Component
const MessagesPage = () => {
  const api = useApi();
  const { user } = useApp();
  const [conversations, setConversations] = useState([]);
  const [selectedConversation, setSelectedConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    fetchConversations();
  }, []);

  useEffect(() => {
    if (selectedConversation) {
      fetchMessages(selectedConversation.id);
    }
  }, [selectedConversation]);

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
    // Get the conversation to access the initial message
    const conversation = conversations.find(c => c.id === requestId);
    
    // Fetch messages from API
    const data = await api.getMessages(requestId);
    
    // If there's an initial message and it's not already in the messages, add it
    if (conversation?.initial_message && data.length === 0) {
      // Add the initial message as the first message
      const initialMsg = {
        id: 'initial-' + requestId,
        sender_role: 'funder',
        sender_name: conversation.funder_name,
        message: conversation.initial_message,
        sent_at: conversation.requested_at
      };
      setMessages([initialMsg, ...data]);
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
      console.error('Failed to send message:', err);
    } finally {
      setSending(false);
    }
  };

  const handleApproveAccess = async (requestId) => {
    try {
      await api.approveAccessRequest(requestId);
      fetchConversations();
    } catch (err) {
      console.error('Failed to approve access:', err);
    }
  };

  const handleDeclineAccess = async (requestId) => {
    try {
      await api.declineAccessRequest(requestId);
      fetchConversations();
    } catch (err) {
      console.error('Failed to decline access:', err);
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
                      <span className={`status-indicator ${conversation.status}`}>
                        {conversation.status}
                      </span>
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
                      {user.role === 'borrower' && selectedConversation.company_name}
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

// BrokerAI Chat Component
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
              <span>➕</span> New Chat
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

// Portfolio Page (Funder)
const Portfolio = () => {
  const api = useApi();
  const [investments, setInvestments] = useState([]);
  const [stats, setStats] = useState({
    totalInvested: 0,
    activeDeals: 0,
    avgReturn: 0,
    totalReturns: 0
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchPortfolio();
  }, []);

  const fetchPortfolio = async () => {
    try {
      // Fetch approved access requests (investments)
      const requests = await api.getAccessRequests();
      const approvedInvestments = requests.filter(req => req.status === 'approved');
      setInvestments(approvedInvestments);
      
      // Calculate stats
      const totalInvested = approvedInvestments.reduce((sum, inv) => sum + (inv.loan_amount || 0), 0);
      const activeDeals = approvedInvestments.length;
      
      setStats({
        totalInvested,
        activeDeals,
        avgReturn: 12.5, // Placeholder
        totalReturns: totalInvested * 0.125 // Placeholder
      });
    } catch (err) {
      console.error('Failed to fetch portfolio:', err);
    } finally {
      setLoading(false);
    }
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
        <h2>Active Investments</h2>
        {investments.length === 0 ? (
          <div className="empty-state">
            <p>No active investments yet. Browse available projects to get started.</p>
            <Link to="/dashboard" className="btn btn-primary">
              Browse Projects
            </Link>
          </div>
        ) : (
          <div className="investments-grid">
            {investments.map((investment) => (
              <div key={investment.id} className="investment-card">
                <div className="investment-header">
                  <h3>{investment.project_title}</h3>
                  <span className="status-badge active">Active</span>
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
                    <span>{formatDate(investment.approved_at)}</span>
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

// User Profile Page
const UserProfile = () => {
  const api = useApi();
  const { user, updateUser } = useApp();
  const [profile, setProfile] = useState(null);
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    fetchProfile();
  }, [user.id]);

  const fetchProfile = async () => {
    try {
      const data = await api.getUserProfile(user.id);
      setProfile(data);
    } catch (err) {
      setError('Failed to load profile');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setError('');
    
    try {
      await api.updateUserProfile(user.id, profile);
      updateUser(profile);
      setSuccess('Profile updated successfully');
      setEditing(false);
    } catch (err) {
      setError('Failed to update profile');
    } finally {
      setSaving(false);
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

      {error && <ErrorMessage message={error} onClose={() => setError('')} />}
      {success && <SuccessMessage message={success} onClose={() => setSuccess('')} />}

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
                    <input
                      type="number"
                      value={profile.typical_deal_size_min}
                      onChange={(e) => setProfile({ ...profile, typical_deal_size_min: e.target.value })}
                      className="form-input"
                      placeholder="Min"
                    />
                    <span>to</span>
                    <input
                      type="number"
                      value={profile.typical_deal_size_max}
                      onChange={(e) => setProfile({ ...profile, typical_deal_size_max: e.target.value })}
                      className="form-input"
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
      </div>
    </div>
  );
};

// Enhanced Admin Panel
const AdminPanel = () => {
  const api = useApi();
  const [activeTab, setActiveTab] = useState('overview');
  const [users, setUsers] = useState([]);
  const [stats, setStats] = useState(null);
  const [settings, setSettings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

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
      setError('Failed to fetch admin data');
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
    } catch (err) {
      setError('Failed to approve user');
    }
  };

  const handleUpdateSetting = async (key, value) => {
    try {
      await api.updateSystemSetting(key, value);
      setSettings(settings.map(setting => 
        setting.setting_key === key ? { ...setting, setting_value: value } : setting
      ));
    } catch (err) {
      setError('Failed to update setting');
    }
  };

  if (loading) return <LoadingSpinner />;

  return (
    <div className="admin-panel">
      <div className="admin-header">
        <h1>Admin Panel</h1>
        <p>Platform administration and management</p>
      </div>

      {error && <ErrorMessage message={error} onClose={() => setError('')} />}

      <div className="admin-tabs">
        <button
          className={`tab ${activeTab === 'overview' ? 'active' : ''}`}
          onClick={() => setActiveTab('overview')}
        >
          Overview
        </button>
        <button
          className={`tab ${activeTab === 'users' ? 'active' : ''}`}
          onClick={() => setActiveTab('users')}
        >
          Users
        </button>
        <button
          className={`tab ${activeTab === 'settings' ? 'active' : ''}`}
          onClick={() => setActiveTab('settings')}
        >
          Settings
        </button>
      </div>

      <div className="admin-content">
        {activeTab === 'overview' && stats && (
          <div className="overview-section">
            <div className="stats-grid">
              <div className="stat-card">
                <div className="stat-icon">👥</div>
                <div className="stat-content">
                  <div className="stat-value">{stats.total_users}</div>
                  <div className="stat-label">Total Users</div>
                </div>
              </div>
              <div className="stat-card">
                <div className="stat-icon">📁</div>
                <div className="stat-content">
                  <div className="stat-value">{stats.total_projects}</div>
                  <div className="stat-label">Total Projects</div>
                </div>
              </div>
              <div className="stat-card">
                <div className="stat-icon">✅</div>
                <div className="stat-content">
                  <div className="stat-value">{stats.active_projects}</div>
                  <div className="stat-label">Published Projects</div>
                </div>
              </div>
              <div className="stat-card">
                <div className="stat-icon">⏳</div>
                <div className="stat-content">
                  <div className="stat-value">{stats.pending_requests}</div>
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
    <th>Subscription</th> {/* Add this */}
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
        <span className={`status-badge ${user.approved ? 'approved' : 'pending'}`}>
          {user.approved ? 'Approved' : 'Pending'}
        </span>
      </td>
      // This is already in your code but make sure it's displaying correctly
<td>
  {user.role === 'funder' && (
    <span className={`status-badge ${user.subscription_status === 'active' ? 'paid' : 'unpaid'}`}>
      {user.subscription_status || 'inactive'}
    </span>
  )}
</td>
      <td>{formatDate(user.created_at)}</td>
      <td>
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
    </div>
  );
};

// Import necessary hooks at the top
import { useParams } from 'react-router-dom';

// Add this component before the App component
const EditProject = () => {
  const { id } = useParams();
  const api = useApi();
  const navigate = useNavigate();
  const [currentStep, setCurrentStep] = useState(1);
  const [project, setProject] = useState(null);
  const [documents, setDocuments] = useState([]);
  const [newDocuments, setNewDocuments] = useState([]);
  const [requiredDocs, setRequiredDocs] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingDocs, setUploadingDocs] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

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
    if (validateStep(currentStep)) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handlePrevious = () => {
    setCurrentStep(currentStep - 1);
  };

  const validateStep = (step) => {
    switch (step) {
      case 1:
        if (!project.title || !project.location || !project.suburb || !project.loan_amount) {
          setError('Please fill in all required fields');
          return false;
        }
        break;
      case 2:
        if (!project.total_project_cost || !project.equity_contribution) {
          setError('Please fill in total project cost and equity contribution');
          return false;
        }
        break;
    }
    setError('');
    return true;
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

      setSuccess('Project updated successfully!');
      setTimeout(() => navigate('/my-projects'), 2000);
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
        setSuccess('Document deleted successfully');
      } catch (err) {
        setError('Failed to delete document');
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
                className="form-input"
              />
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
                  className="form-input"
                />
              </div>

              <div className="form-group">
                <label>Suburb *</label>
                <input
                  type="text"
                  value={project.suburb}
                  onChange={(e) => setProject({ ...project, suburb: e.target.value })}
                  required
                  className="form-input"
                />
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
              <input
                type="number"
                value={project.loan_amount}
                onChange={(e) => setProject({ ...project, loan_amount: e.target.value })}
                required
                className="form-input"
                min="1"
              />
              {project.loan_amount && (
                <div className="field-help">{formatCurrency(project.loan_amount)}</div>
              )}
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Target Interest Rate (%)</label>
                <input
                  type="number"
                  value={project.interest_rate || ''}
                  onChange={(e) => setProject({ ...project, interest_rate: e.target.value })}
                  className="form-input"
                  step="0.1"
                  min="0"
                />
              </div>

              <div className="form-group">
                <label>Loan Term (months)</label>
                <input
                  type="number"
                  value={project.loan_term || ''}
                  onChange={(e) => setProject({ ...project, loan_term: e.target.value })}
                  className="form-input"
                  min="1"
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
                <input
                  type="number"
                  value={project.total_project_cost || ''}
                  onChange={(e) => setProject({ ...project, total_project_cost: e.target.value })}
                  required
                  className="form-input"
                  min="1"
                />
                {project.total_project_cost && (
                  <div className="field-help">{formatCurrency(project.total_project_cost)}</div>
                )}
              </div>

              <div className="form-group">
                <label>Equity Contribution (AUD) *</label>
                <input
                  type="number"
                  value={project.equity_contribution || ''}
                  onChange={(e) => setProject({ ...project, equity_contribution: e.target.value })}
                  required
                  className="form-input"
                  min="0"
                />
                {project.equity_contribution && (
                  <div className="field-help">{formatCurrency(project.equity_contribution)}</div>
                )}
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Land Value (AUD)</label>
                <input
                  type="number"
                  value={project.land_value || ''}
                  onChange={(e) => setProject({ ...project, land_value: e.target.value })}
                  className="form-input"
                  min="0"
                />
              </div>

              <div className="form-group">
                <label>Construction Cost (AUD)</label>
                <input
                  type="number"
                  value={project.construction_cost || ''}
                  onChange={(e) => setProject({ ...project, construction_cost: e.target.value })}
                  className="form-input"
                  min="0"
                />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Expected GDC (AUD)</label>
                <input
                  type="number"
                  value={project.expected_gdc || ''}
                  onChange={(e) => setProject({ ...project, expected_gdc: e.target.value })}
                  className="form-input"
                  min="0"
                />
              </div>

              <div className="form-group">
                <label>Expected Profit (AUD)</label>
                <input
                  type="number"
                  value={project.expected_profit || ''}
                  onChange={(e) => setProject({ ...project, expected_profit: e.target.value })}
                  className="form-input"
                  min="0"
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
                <input
                  type="number"
                  value={project.project_size_sqm || ''}
                  onChange={(e) => setProject({ ...project, project_size_sqm: e.target.value })}
                  className="form-input"
                  min="0"
                />
              </div>

              <div className="form-group">
                <label>Number of Units</label>
                <input
                  type="number"
                  value={project.number_of_units || ''}
                  onChange={(e) => setProject({ ...project, number_of_units: e.target.value })}
                  className="form-input"
                  min="0"
                />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Number of Levels</label>
                <input
                  type="number"
                  value={project.number_of_levels || ''}
                  onChange={(e) => setProject({ ...project, number_of_levels: e.target.value })}
                  className="form-input"
                  min="0"
                />
              </div>

              <div className="form-group">
                <label>Car Spaces</label>
                <input
                  type="number"
                  value={project.car_spaces || ''}
                  onChange={(e) => setProject({ ...project, car_spaces: e.target.value })}
                  className="form-input"
                  min="0"
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
          <div className="step-number">3</div>
          <div className="step-label">Details</div>
        </div>
        <div className={`step ${currentStep >= 4 ? 'active' : ''} ${currentStep > 4 ? 'completed' : ''}`}>
          <div className="step-number">4</div>
          <div className="step-label">Documents</div>
        </div>
      </div>

      {error && <ErrorMessage message={error} onClose={() => setError('')} />}
      {success && <SuccessMessage message={success} onClose={() => setSuccess('')} />}

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

// Export the App
export default App; 