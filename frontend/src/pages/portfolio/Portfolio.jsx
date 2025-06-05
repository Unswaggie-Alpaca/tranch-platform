import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useApi } from '../../hooks/useApi';
import { useNotifications } from '../../hooks/useNotifications';
import { LoadingSpinner } from '../../components/common/LoadingSpinner';
import { EmptyState } from '../../components/common/EmptyState';
import { StatusBadge } from '../../components/common/StatusBadge';
import { formatCurrency, formatDate, downloadCSV } from '../../utils/formatters';

const Portfolio = () => {
  const api = useApi();
  const { addNotification } = useNotifications();
  const [investments, setInvestments] = useState([]);
  const [stats, setStats] = useState({
    totalInvested: 0,
    activeDeals: 0,
    avgReturn: 0,
    totalReturns: 0
  });
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState('date');
  const [filterStatus, setFilterStatus] = useState('all');

  useEffect(() => {
    fetchPortfolio();
  }, []);

  const fetchPortfolio = async () => {
    try {
      // Fetch approved access requests (investments)
      const requests = await api.getAccessRequests();
      const investments = requests.filter(req => 
        req.status === 'approved' || 
        req.status === 'due_diligence' || 
        req.status === 'term_sheet' || 
        req.status === 'funded'
      );
      
      setInvestments(investments);
      
      // Calculate stats
      const totalInvested = investments
        .filter(inv => inv.status === 'funded')
        .reduce((sum, inv) => sum + (inv.loan_amount || 0), 0);
      
      const activeDeals = investments.filter(inv => 
        inv.status !== 'declined' && inv.status !== 'closed'
      ).length;
      
      setStats({
        totalInvested,
        activeDeals,
        avgReturn: 12.5, // Placeholder - would come from backend
        totalReturns: totalInvested * 0.125 // Placeholder
      });
    } catch (err) {
      console.error('Failed to fetch portfolio:', err);
      addNotification({
        type: 'error',
        title: 'Load Failed',
        message: 'Failed to load portfolio data'
      });
    } finally {
      setLoading(false);
    }
  };

  const filteredInvestments = investments
    .filter(inv => {
      if (filterStatus === 'all') return true;
      return inv.status === filterStatus;
    })
    .sort((a, b) => {
      switch (sortBy) {
        case 'amount':
          return b.loan_amount - a.loan_amount;
        case 'status':
          return a.status.localeCompare(b.status);
        case 'date':
        default:
          return new Date(b.approved_at || b.requested_at) - new Date(a.approved_at || a.requested_at);
      }
    });

  const exportPortfolio = () => {
    const data = filteredInvestments.map(inv => ({
      'Project': inv.project_title,
      'Location': inv.suburb,
      'Amount': inv.loan_amount,
      'Status': inv.status,
      'Date': formatDate(inv.approved_at || inv.requested_at)
    }));
    
    downloadCSV(data, `portfolio_${new Date().toISOString().split('T')[0]}.csv`);
    
    addNotification({
      type: 'success',
      title: 'Export Complete',
      message: 'Portfolio data exported successfully'
    });
  };

  if (loading) return <LoadingSpinner />;

  return (
    <div className="portfolio-page">
      <div className="page-header">
        <h1>Investment Portfolio</h1>
        <p>Track and manage your property development investments</p>
      </div>

      <div className="portfolio-stats">
        <div className="stat-card">
          <div className="stat-icon">💰</div>
          <div className="stat-content">
            <div className="stat-value">{formatCurrency(stats.totalInvested)}</div>
            <div className="stat-label">Total Invested</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon">📊</div>
          <div className="stat-content">
            <div className="stat-value">{stats.activeDeals}</div>
            <div className="stat-label">Active Deals</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon">📈</div>
          <div className="stat-content">
            <div className="stat-value">{stats.avgReturn}%</div>
            <div className="stat-label">Avg Return</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon">💵</div>
          <div className="stat-content">
            <div className="stat-value">{formatCurrency(stats.totalReturns)}</div>
            <div className="stat-label">Total Returns</div>
          </div>
        </div>
      </div>

      <div className="investments-section">
        <div className="section-header">
          <h2>Active Investments</h2>
          <div className="section-actions">
            <select 
              value={filterStatus} 
              onChange={(e) => setFilterStatus(e.target.value)}
              className="form-select"
            >
              <option value="all">All Status</option>
              <option value="approved">Exploring</option>
              <option value="due_diligence">Due Diligence</option>
              <option value="term_sheet">Term Sheet</option>
              <option value="funded">Funded</option>
            </select>
            <select 
              value={sortBy} 
              onChange={(e) => setSortBy(e.target.value)}
              className="form-select"
            >
              <option value="date">Sort by Date</option>
              <option value="amount">Sort by Amount</option>
              <option value="status">Sort by Status</option>
            </select>
            <button onClick={exportPortfolio} className="btn btn-outline">
              Export CSV
            </button>
          </div>
        </div>

        {filteredInvestments.length === 0 ? (
          <EmptyState 
            icon="📊"
            title="No investments yet"
            message="Browse available projects to start building your portfolio"
            action={
              <Link to="/projects" className="btn btn-primary">
                Browse Projects
              </Link>
            }
          />
        ) : (
          <div className="investments-grid">
            {filteredInvestments.map((investment) => (
              <div key={investment.id} className="investment-card">
                <div className="investment-header">
                  <h3>{investment.project_title}</h3>
                  <StatusBadge status={investment.status} />
                </div>
                <div className="investment-details">
                  <div className="detail-item">
                    <label>Investment Amount</label>
                    <span>{formatCurrency(investment.loan_amount)}</span>
                  </div>
                  <div className="detail-item">
                    <label>Location</label>
                    <span>{investment.suburb}</span>
                  </div>
                  <div className="detail-item">
                    <label>Start Date</label>
                    <span>{formatDate(investment.approved_at || investment.requested_at)}</span>
                  </div>
                  <div className="detail-item">
                    <label>Expected Return</label>
                    <span>12.5% p.a.</span>
                  </div>
                </div>
                <div className="investment-actions">
                  <Link to={`/project/${investment.project_id}`} className="btn btn-outline">
                    View Details
                  </Link>
                  <Link to="/messages" className="btn btn-primary">
                    Message
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default Portfolio;