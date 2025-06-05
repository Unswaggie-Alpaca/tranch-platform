// components/common/ErrorMessage.jsx
import React from 'react';

const ErrorMessage = ({ message, onClose }) => (
  <div className="error-message">
    <span>{message}</span>
    {onClose && <button onClick={onClose} className="close-btn">×</button>}
  </div>
);

export default ErrorMessage;