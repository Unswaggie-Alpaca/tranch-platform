import React, { useState, useRef, useEffect } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { useClerk } from "@clerk/clerk-react";
import { useApi } from "../hooks";
import { useApp, useNotifications } from "../contexts";
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
  const profileRef = useRef(null);
  const notificationRef = useRef(null);


  
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
export default Navigation;
