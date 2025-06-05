import React, { useState, useEffect } from 'react';
import { useApi } from '../../hooks/useApi';
import { useNotifications } from '../../hooks/useNotifications';
import { LoadingSpinner } from '../../components/common/LoadingSpinner';
import { Tabs } from '../../components/common/Tabs';
import { Modal } from '../../components/common/Modal';
import { StatusBadge } from '../../components/common/StatusBadge';
import { EmptyState } from '../../components/common/EmptyState';
import { formatNumber, formatCurrency, formatDate } from '../../utils/formatters';

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

export default AdminPanel;