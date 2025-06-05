import React from 'react';
import { StatusBadge } from '../common/StatusBadge';
import { formatCurrency } from '../../utils/formatters';

const FunderVerificationCard = ({ funder, onApprove, onRequestInfo }) => {
  return (
    <div className="funder-card">
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
          onClick={() => onApprove(funder.id)}
          className="btn btn-primary"
        >
          Approve & Notify
        </button>
        <button 
          onClick={() => onRequestInfo(funder.id)}
          className="btn btn-outline"
        >
          Request More Info
        </button>
      </div>
    </div>
  );
};

export default FunderVerificationCard;