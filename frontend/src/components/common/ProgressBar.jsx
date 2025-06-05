// components/common/ProgressBar.jsx
import React from 'react';

const ProgressBar = ({ value, max = 100, label, showPercentage = true }) => {
  const percentage = Math.min(100, Math.max(0, (value / max) * 100));
  
  return (
    <div className="progress-bar-container">
      {label && <div className="progress-label">{label}</div>}
      <div className="progress-bar">
        <div className="progress-fill" style={{ width: `${percentage}%` }}>
          {showPercentage && percentage > 10 && (
            <span className="progress-text">{Math.round(percentage)}%</span>
          )}
        </div>
      </div>
      {showPercentage && percentage <= 10 && (
        <span className="progress-text-outside">{Math.round(percentage)}%</span>
      )}
    </div>
  );
};

export default ProgressBar;