import React from 'react';

const SuccessMessage = ({ message, onClose }) => (
  <div className="success-message">
    <span>{message}</span>
    {onClose && (
      <button onClick={onClose} className="close-btn">
        &times;
      </button>
    )}
  </div>
);

export default SuccessMessage;
