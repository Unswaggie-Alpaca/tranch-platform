import React from 'react';
import { formatNumber, formatCurrency } from '../../utils/formatters';

const StatsGrid = ({ stats }) => {
  if (!stats) return null;

  return (
    <div className="stats-grid">
      <div className="stat-card">
        <div className="stat-icon">👥</div>
        <div className="stat-content">
          <div className="stat-value">{formatNumber(stats.total_users)}</div>
          <div className="stat-label">Total Users</div>
        </div>
      </div>
      <div className="stat-card">
        <div className="stat-icon">📁</div>
        <div className="stat-content">
          <div className="stat-value">{formatNumber(stats.total_projects)}</div>
          <div className="stat-label">Total Projects</div>
        </div>
      </div>
      <div className="stat-card">
        <div className="stat-icon">✓</div>
        <div className="stat-content">
          <div className="stat-value">{formatNumber(stats.active_projects)}</div>
          <div className="stat-label">Published Projects</div>
        </div>
      </div>
      <div className="stat-card">
        <div className="stat-icon">⏳</div>
        <div className="stat-content">
          <div className="stat-value">{formatNumber(stats.pending_requests || 0)}</div>
          <div className="stat-label">Pending Requests</div>
        </div>
      </div>
      <div className="stat-card">
        <div className="stat-icon">💰</div>
        <div className="stat-content">
          <div className="stat-value">{formatCurrency(stats.total_revenue || 0)}</div>
          <div className="stat-label">Total Revenue</div>
        </div>
      </div>
      <div className="stat-card">
        <div className="stat-icon">📈</div>
        <div className="stat-content">
          <div className="stat-value">{stats.conversion_rate || '0'}%</div>
          <div className="stat-label">Conversion Rate</div>
        </div>
      </div>
    </div>
  );
};

export default StatsGrid;