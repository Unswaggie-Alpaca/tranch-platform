// pages/profile/UserProfile.jsx

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../../contexts';
import { useApi } from '../../hooks';
import { useNotifications } from '../../contexts';
import { 
  LoadingSpinner,
  ErrorMessage,
  ConfirmationDialog
} from '../../components/common';
import { ProfileForm, AccountActions, SubscriptionStatus } from '../../components/profile';
import { formatDate, downloadCSV } from '../../utils/formatters';

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
    // Basic validation
    if (!profile.name || profile.name.trim() === '') {
      addNotification({
        type: 'error',
        title: 'Validation Error',
        message: 'Name is required'
      });
      return;
    }

    if (profile.role === 'funder') {
      if (!profile.company_name || profile.company_name.trim() === '') {
        addNotification({
          type: 'error',
          title: 'Validation Error',
          message: 'Company name is required'
        });
        return;
      }
    }

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
        <ProfileForm 
          profile={profile}
          editing={editing}
          onChange={setProfile}
        />

        {user.role === 'funder' && (
          <SubscriptionStatus user={user} profile={profile} />
        )}

        <div className="profile-section">
          <h3>Account Management</h3>
          <AccountActions 
            onDownloadData={handleDownloadData}
            onCancelSubscription={() => setShowCancelSubscriptionModal(true)}
            onDeleteAccount={() => setShowDeleteModal(true)}
            downloadingData={downloadingData}
            canCancelSubscription={user.role === 'funder' && user.subscription_status === 'active'}
          />
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

export default UserProfile;