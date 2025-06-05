// components/profile/SubscriptionStatus.jsx

import React from 'react';
import { Link } from 'react-router-dom';
import { StatusBadge } from '../common';
import { formatDate, formatCurrency } from '../../utils/formatters';

const SubscriptionStatus = ({ user, profile }) => {
  if (user.role !== 'funder') return null;

  const isActive = user.subscription_status === 'active';
  const isCancelled = user.subscription_status === 'cancelled';
  const isPending = user.subscription_status === 'pending_cancellation';

  return (
    <div className="subscription-status-card">
      <div className="subscription-header">
        <h3>Subscription Status</h3>
        <StatusBadge status={user.subscription_status || 'inactive'} />
      </div>

      <div className="subscription-details">
        {isActive ? (
          <>
            <div className="subscription-plan">
              <div className="plan-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                </svg>
              </div>
              <div className="plan-info">
                <h4>Professional Funder</h4>
                <p>{formatCurrency(299)}/month</p>
              </div>
            </div>

            <div className="subscription-features">
              <h5>Your Benefits:</h5>
              <ul>
                <li>✓ Unlimited project access</li>
                <li>✓ Advanced search filters</li>
                <li>✓ Direct messaging with developers</li>
                <li>✓ Document downloads</li>
                <li>✓ Portfolio analytics</li>
                <li>✓ Priority support</li>
              </ul>
            </div>

            {profile.subscription_end_date && (
              <div className="subscription-billing">
                <p>
                  <strong>Next billing date:</strong> {formatDate(profile.subscription_end_date)}
                </p>
              </div>
            )}

            {isPending && (
              <div className="subscription-warning">
                <svg className="warning-icon" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
                <p>Your subscription is set to cancel at the end of the current billing period</p>
              </div>
            )}
          </>
        ) : (
          <div className="subscription-inactive">
            <div className="inactive-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>
            
            <h4>No Active Subscription</h4>
            <p>Subscribe to unlock full access to all projects and features</p>
            
            <div className="subscription-cta">
              <Link to="/dashboard" className="btn btn-primary">
                Subscribe Now - {formatCurrency(299)}/month
              </Link>
            </div>

            <div className="subscription-benefits">
              <h5>What you'll get:</h5>
              <ul>
                <li>Access to all property development projects</li>
                <li>Direct communication with developers</li>
                <li>Download project documents and financials</li>
                <li>Advanced search and filtering tools</li>
                <li>Portfolio tracking and analytics</li>
                <li>Priority customer support</li>
              </ul>
            </div>
          </div>
        )}
      </div>

      {profile.verification_status && (
        <div className="verification-status">
          <h4>Verification Status</h4>
          <div className="verification-badge">
            {profile.approved ? (
              <>
                <svg className="verified-icon" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M6.267 3.455a3.066 3.066 0 001.745-.723 3.066 3.066 0 013.976 0 3.066 3.066 0 001.745.723 3.066 3.066 0 012.812 2.812c.051.643.304 1.254.723 1.745a3.066 3.066 0 010 3.976 3.066 3.066 0 00-.723 1.745 3.066 3.066 0 01-2.812 2.812 3.066 3.066 0 00-1.745.723 3.066 3.066 0 01-3.976 0 3.066 3.066 0 00-1.745-.723 3.066 3.066 0 01-2.812-2.812 3.066 3.066 0 00-.723-1.745 3.066 3.066 0 010-3.976 3.066 3.066 0 00.723-1.745 3.066 3.066 0 012.812-2.812zm7.44 5.252a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                <span>Verified Funder</span>
              </>
            ) : (
              <>
                <svg className="pending-icon" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
                </svg>
                <span>Verification Pending</span>
              </>
            )}
          </div>
          {!profile.approved && (
            <p className="verification-note">
              Your account is under review. You'll be notified once approved.
            </p>
          )}
        </div>
      )}
    </div>
  );
};

export default SubscriptionStatus;