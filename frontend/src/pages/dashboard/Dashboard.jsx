// pages/dashboard/Dashboard.jsx
import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useApi, useApp, useNotifications } from '../../hooks';
import { LoadingSpinner, ErrorMessage, EmptyState } from '../../components/common';
import { ProjectCard } from '../../components/projects';
import { SubscriptionModal } from '../../components/payments';
import { formatCurrency, formatNumber } from '../../utils/formatters';

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

export default Dashboard;