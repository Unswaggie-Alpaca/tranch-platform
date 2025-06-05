import React, { useState } from 'react';
import { Modal } from '../common/Modal';
import { NumberInput } from '../common/NumberInput';

const QuoteWizard = ({ dealId, projectId, onClose, onSuccess }) => {
  const [quote, setQuote] = useState({
    loan_amount: '',
    interest_rate: '',
    loan_term: '',
    establishment_fee: '',
    conditions: ''
  });
  
  const handleSubmit = (e) => {
    e.preventDefault();
    // Simulate quote submission
    setTimeout(() => {
      onSuccess();
    }, 1000);
  };
  
  return (
    <Modal isOpen={true} onClose={onClose} title="Submit Indicative Quote" size="large">
      <form onSubmit={handleSubmit} className="quote-form">
        <div className="form-row">
          <div className="form-group">
            <label>Loan Amount (AUD)</label>
            <NumberInput
              value={quote.loan_amount}
              onChange={(value) => setQuote({ ...quote, loan_amount: value })}
              prefix="$"
              placeholder="5,000,000"
            />
          </div>
          <div className="form-group">
            <label>Interest Rate (%)</label>
            <NumberInput
              value={quote.interest_rate}
              onChange={(value) => setQuote({ ...quote, interest_rate: value })}
              suffix="%"
              placeholder="12.5"
              step={0.1}
            />
          </div>
        </div>
        
        <div className="form-row">
          <div className="form-group">
            <label>Loan Term (months)</label>
            <NumberInput
              value={quote.loan_term}
              onChange={(value) => setQuote({ ...quote, loan_term: value })}
              placeholder="24"
            />
          </div>
          <div className="form-group">
            <label>Establishment Fee (AUD)</label>
            <NumberInput
              value={quote.establishment_fee}
              onChange={(value) => setQuote({ ...quote, establishment_fee: value })}
              prefix="$"
              placeholder="50,000"
            />
          </div>
        </div>
        
        <div className="form-group">
          <label>Conditions & Notes</label>
          <textarea
            value={quote.conditions}
            onChange={(e) => setQuote({ ...quote, conditions: e.target.value })}
            className="form-textarea"
            placeholder="Any specific conditions or requirements..."
            rows="4"
          />
        </div>
        
        <div className="form-actions">
          <button type="button" onClick={onClose} className="btn btn-outline">
            Cancel
          </button>
          <button type="submit" className="btn btn-primary">
            Submit Quote
          </button>
        </div>
      </form>
    </Modal>
  );
};

export default QuoteWizard;