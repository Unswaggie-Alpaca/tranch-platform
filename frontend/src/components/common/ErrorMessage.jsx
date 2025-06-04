import React from 'react';

const ErrorMessage = ({ message, onClose }) => (
  <div className="error-message">
    <span>{message}</span>
    {onClose && (
      <button onClick={onClose} className="close-btn">
        &times;
      </button>
    )}
  </div>
);

export default ErrorMessage;
