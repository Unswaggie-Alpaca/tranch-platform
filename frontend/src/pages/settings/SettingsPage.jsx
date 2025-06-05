// pages/settings/SettingsPage.jsx

import React, { useState, useEffect } from 'react';
import { useApp } from '../../contexts';
import { useApi } from '../../hooks';
import { useNotifications } from '../../contexts';

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

export default SettingsPage;