// components/settings/NotificationPreferences.jsx

import React, { useState, useEffect } from 'react';
import { useApi } from '../../hooks';
import { useNotifications } from '../../contexts';

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

export default NotificationPreferences;