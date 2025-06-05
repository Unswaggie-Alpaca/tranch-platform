// components/common/LoadingSpinner.jsx
import React from 'react';

const LoadingSpinner = ({ size = 'default', message }) => (
  <div className={`loading-spinner ${size}`}>
    <div className="spinner"></div>
    {message && <p className="loading-message">{message}</p>}
  </div>
);

export default LoadingSpinner;