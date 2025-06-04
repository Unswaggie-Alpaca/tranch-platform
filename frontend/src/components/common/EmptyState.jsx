import React from 'react';

const EmptyState = ({ icon = '📂', title, message, action }) => (
  <div className="empty-state">
    <div className="empty-icon">{icon}</div>
    <h3>{title}</h3>
    <p>{message}</p>
    {action && <div className="empty-action">{action}</div>}
  </div>
);

export default EmptyState;
