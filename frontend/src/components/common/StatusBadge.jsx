import React from 'react';

const StatusBadge = ({ status }) => {
  const getStatusClass = () => {
    switch ((status || '').toLowerCase()) {
      case 'active':
      case 'approved':
      case 'paid':
      case 'complete':
      case 'success':
        return 'success';
      case 'pending':
      case 'processing':
      case 'draft':
        return 'warning';
      case 'declined':
      case 'failed':
      case 'unpaid':
      case 'cancelled':
        return 'error';
      default:
        return 'default';
    }
  };

  return <span className={`status-badge status-${getStatusClass()}`}>{status}</span>;
};

export default StatusBadge;
