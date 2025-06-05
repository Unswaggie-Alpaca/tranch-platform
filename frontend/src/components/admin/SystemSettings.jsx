import React from 'react';

const SystemSettings = ({ settings, onUpdateSetting }) => {
  const getSettingDescription = (key) => {
    switch (key) {
      case 'project_listing_fee':
        return 'Fee charged to list a project (in cents)';
      case 'monthly_subscription_fee':
        return 'Monthly subscription for funders (in cents)';
      case 'max_file_upload_size':
        return 'Maximum file upload size (in bytes)';
      case 'ai_chat_enabled':
        return 'Enable/disable AI chat feature';
      default:
        return '';
    }
  };

  return (
    <div className="system-settings">
      <h3>System Settings</h3>
      <div className="settings-list">
        {settings.map(setting => (
          <div key={setting.id} className="setting-item">
            <div className="setting-info">
              <label>{setting.setting_key.replace(/_/g, ' ').toUpperCase()}</label>
              <p className="setting-description">
                {getSettingDescription(setting.setting_key)}
              </p>
            </div>
            <div className="setting-control">
              {setting.setting_key === 'ai_chat_enabled' ? (
                <select
                  value={setting.setting_value}
                  onChange={(e) => onUpdateSetting(setting.setting_key, e.target.value)}
                  className="form-select"
                >
                  <option value="true">Enabled</option>
                  <option value="false">Disabled</option>
                </select>
              ) : (
                <input
                  type="number"
                  value={setting.setting_value}
                  onChange={(e) => onUpdateSetting(setting.setting_key, e.target.value)}
                  className="form-input"
                />
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default SystemSettings;