import React from 'react';

const ProposalSection = ({ deal, userRole, onShowQuoteWizard }) => {
  return (
    <div className="proposal-section">
      <div className="content-card">
        <h3>Funding Proposal</h3>
        <p>This section will contain the formal funding proposal and terms.</p>
        
        {userRole === 'funder' && (
          <div className="proposal-actions">
            <button onClick={onShowQuoteWizard} className="btn btn-primary">
              Submit Indicative Quote
            </button>
          </div>
        )}
        
        {userRole === 'borrower' && (
          <div className="proposal-status">
            <p>Waiting for funder to submit indicative terms...</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default ProposalSection;