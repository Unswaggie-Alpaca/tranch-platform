// components/projects/ProjectCard.jsx
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApi, useApp, useNotifications } from '../../hooks';
import { StatusBadge } from '../../components/common';
import { PaymentModal } from '../../components/payments';
import { formatCurrency, formatDate } from '../../utils/formatters';

const ProjectCard = ({ project, userRole, onProjectUpdate }) => {
  const api = useApi();
  const { addNotification } = useNotifications();
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const [showMessageInput, setShowMessageInput] = useState(false);
  const [accessMessage, setAccessMessage] = useState('');
  const navigate = useNavigate();

  const handleRequestAccess = async () => {
    setRequesting(true);
    try {
      await api.requestAccess(project.id, accessMessage.trim() || null);
      addNotification({
        type: 'success',
        title: 'Access Request Sent',
        message: 'Your request has been sent to the developer.'
      });
      setShowMessageInput(false);
      setAccessMessage('');
      if (onProjectUpdate) onProjectUpdate();
    } catch (err) {
      addNotification({
        type: 'error',
        title: 'Request Failed',
        message: err.message
      });
    } finally {
      setRequesting(false);
    }
  };

  const handlePaymentSuccess = async () => {
    setShowPaymentModal(false);
    addNotification({
      type: 'success',
      title: 'Payment Successful',
      message: 'Your project is now published and visible to funders.'
    });
    
    if (onProjectUpdate) {
      await onProjectUpdate();
    }
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
            <StatusBadge status={project.payment_status === 'paid' ? 'Published' : 'Unpublished'} />
            {project.documents_complete && (
              <StatusBadge status="Docs Complete" />
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

      <div className="project-actions">
        {userRole === 'borrower' && (
          <>
            {project.payment_status === 'unpaid' && (
              <button 
                onClick={() => setShowPaymentModal(true)}
                disabled={!project.documents_complete}
                className="btn btn-primary"
                title={!project.documents_complete ? 'Upload all required documents first' : ''}
              >
                Pay to Publish ($499)
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
            {project.access_status === 'approved' && !project.deal_id && (
              <button 
                onClick={async () => {
                  try {
                    const response = await api.createDeal(project.id, project.access_request_id);
                    addNotification({
                      type: 'success',
                      title: 'Deal Room Created',
                      message: 'Successfully created deal room'
                    });
                    navigate(`/project/${project.id}/deal/${response.deal_id}`);
                  } catch (err) {
                    console.error('Deal creation error:', err);
                    addNotification({
                      type: 'error',
                      title: 'Failed to create deal room',
                      message: err.message || 'Could not create deal room'
                    });
                  }
                }}
                className="btn btn-primary"
              >
                Engage
              </button>
            )}

            {project.deal_id && (
              <button 
                onClick={() => navigate(`/project/${project.id}/deal/${project.deal_id}`)}
                className="btn btn-primary"
              >
                Deal Room
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
    </div>
  );
};

export default ProjectCard;