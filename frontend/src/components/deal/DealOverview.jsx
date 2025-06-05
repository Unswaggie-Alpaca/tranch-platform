import React from 'react';
import { formatCurrency, formatDateTime } from '../../utils/formatters';

const DealOverview = ({ deal, project }) => {
  return (
    <div className="deal-overview">
      <div className="overview-grid">
        <div className="content-card">
          <h3>Project Summary</h3>
          <p>{project.description || 'No description provided.'}</p>
          
          <div className="detail-grid">
            <div className="detail-item">
              <label>Property Type</label>
              <span>{project.property_type}</span>
            </div>
            <div className="detail-item">
              <label>Development Stage</label>
              <span>{project.development_stage}</span>
            </div>
            <div className="detail-item">
              <label>Loan Amount</label>
              <span>{formatCurrency(project.loan_amount)}</span>
            </div>
            <div className="detail-item">
              <label>Location</label>
              <span>{project.suburb}</span>
            </div>
          </div>
        </div>
        
        <div className="content-card">
          <h3>Deal Status</h3>
          <div className="status-timeline">
            <div className="timeline-item active">
              <div className="timeline-marker"></div>
              <div className="timeline-content">
                <h4>Deal Room Created</h4>
                <p>{formatDateTime(deal.created_at)}</p>
              </div>
            </div>
            <div className="timeline-item">
              <div className="timeline-marker"></div>
              <div className="timeline-content">
                <h4>Due Diligence</h4>
                <p>In progress</p>
              </div>
            </div>
            <div className="timeline-item">
              <div className="timeline-marker"></div>
              <div className="timeline-content">
                <h4>Term Sheet</h4>
                <p>Pending</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DealOverview;