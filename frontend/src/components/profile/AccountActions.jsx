// components/profile/AccountActions.jsx

import React from 'react';

const AccountActions = ({ 
  onDownloadData, 
  onCancelSubscription, 
  onDeleteAccount,
  downloadingData,
  canCancelSubscription 
}) => {
  return (
    <div className="account-actions">
      <div className="action-group">
        <h4>Data Management</h4>
        <button 
          onClick={onDownloadData}
          disabled={downloadingData}
          className="btn btn-outline"
        >
          <svg className="btn-icon" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" />
          </svg>
          {downloadingData ? 'Downloading...' : 'Download My Data'}
        </button>
        <p className="action-description">
          Download all your data including projects, messages, and activity history
        </p>
      </div>
      
      {canCancelSubscription && (
        <div className="action-group">
          <h4>Subscription</h4>
          <button 
            onClick={onCancelSubscription}
            className="btn btn-outline"
          >
            <svg className="btn-icon" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M6 2a2 2 0 00-2 2v12a2 2 0 002 2h8a2 2 0 002-2V7.414A2 2 0 0015.414 6L12 2.586A2 2 0 0010.586 2H6zm5 6a1 1 0 10-2 0v3.586l-1.293-1.293a1 1 0 10-1.414 1.414l3 3a1 1 0 001.414 0l3-3a1 1 0 00-1.414-1.414L11 11.586V8z" clipRule="evenodd" />
            </svg>
            Cancel Subscription
          </button>
          <p className="action-description">
            You'll retain access until the end of your current billing period
          </p>
        </div>
      )}
      
      <div className="action-group danger">
        <h4>Danger Zone</h4>
        <button 
          onClick={onDeleteAccount}
          className="btn btn-danger"
        >
          <svg className="btn-icon" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
          </svg>
          Delete Account
        </button>
        <p className="action-description warning">
          This action cannot be undone. All your data will be permanently deleted.
        </p>
      </div>
    </div>
  );
};

export default AccountActions;