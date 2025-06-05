import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useApi } from '../../hooks/useApi';
import { LoadingSpinner } from '../../components/common/LoadingSpinner';
import { EmptyState } from '../../components/common/EmptyState';
import { StatusBadge } from '../../components/common/StatusBadge';
import { formatCurrency, formatDate } from '../../utils/formatters';

const MyProjects = () => {
  const api = useApi();
  const navigate = useNavigate();
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [sortBy, setSortBy] = useState('created_at');

  useEffect(() => {
    fetchProjects();
  }, []);

  const fetchProjects = async () => {
    try {
      const data = await api.getProjects();
      setProjects(data);
    } catch (err) {
      console.error('Failed to fetch projects:', err);
    } finally {
      setLoading(false);
    }
  };

  const filteredProjects = projects.filter(project => {
    switch (filter) {
      case 'published':
        return project.payment_status === 'paid';
      case 'draft':
        return project.payment_status === 'unpaid';
      default:
        return true;
    }
  }).sort((a, b) => {
    switch (sortBy) {
      case 'loan_amount':
        return b.loan_amount - a.loan_amount;
      case 'title':
        return a.title.localeCompare(b.title);
      default:
        return new Date(b.created_at) - new Date(a.created_at);
    }
  });

  // Mobile Project Card Component
  const MobileProjectCard = ({ project }) => (
    <div className="mobile-project-card">
      <div className="mobile-card-header">
        <h3 className="mobile-project-title">{project.title}</h3>
        <div className="mobile-project-status">
          <span className={`mobile-status-badge ${project.payment_status === 'paid' ? 'status-published' : 'status-draft'}`}>
            {project.payment_status === 'paid' ? 'Published' : 'Draft'}
          </span>
          {project.documents_complete && (
            <div className="mobile-docs-status complete">
              <svg viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
            </div>
          )}
        </div>
      </div>
      
      <div className="mobile-card-content">
        <div className="mobile-detail-item full-width">
          <span className="mobile-detail-label">Location</span>
          <span className="mobile-detail-value">{project.suburb}</span>
        </div>
        
        <div className="mobile-detail-item">
          <span className="mobile-detail-label">Loan Amount</span>
          <span className="mobile-detail-value amount">{formatCurrency(project.loan_amount)}</span>
        </div>
        
        <div className="mobile-detail-item">
          <span className="mobile-detail-label">Created</span>
          <span className="mobile-detail-value">{formatDate(project.created_at)}</span>
        </div>
      </div>
      
      <div className="mobile-card-actions">
        <button
          onClick={() => navigate(`/project/${project.id}`)}
          className="btn btn-outline"
        >
          <svg className="btn-icon" viewBox="0 0 20 20" fill="currentColor">
            <path d="M10 12a2 2 0 100-4 2 2 0 000 4z" />
            <path fillRule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clipRule="evenodd" />
          </svg>
          View
        </button>
        {project.payment_status === 'unpaid' && (
          <button
            onClick={() => navigate(`/project/${project.id}/edit`)}
            className="btn btn-primary"
          >
            <svg className="btn-icon" viewBox="0 0 20 20" fill="currentColor">
              <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
            </svg>
            Edit
          </button>
        )}
      </div>
    </div>
  );

  if (loading) return <LoadingSpinner />;

  return (
    <div className="my-projects-page">
      <div className="page-header">
        <h1>My Projects</h1>
        <Link to="/create-project" className="btn btn-primary">
          <span>+</span> Create New Project
        </Link>
      </div>

      {projects.length === 0 ? (
        <EmptyState 
          icon="📁"
          title="No projects yet"
          message="Create your first project to start connecting with funders."
          action={
            <Link to="/create-project" className="btn btn-primary">
              Create Project
            </Link>
          }
        />
      ) : (
        <>
          {/* Show warning if there are drafts */}
          {projects.some(p => p.payment_status === 'unpaid') && (
            <div className="draft-warning">
              <span className="draft-warning-icon">⚠️</span>
              <div className="draft-warning-content">
                <h4>Complete Your Draft Projects</h4>
                <p>Upload all required documents before publishing. Projects cannot be published without complete documentation.</p>
              </div>
            </div>
          )}

          <div className="projects-controls">
            <div className="filter-tabs">
              <button 
                className={`filter-tab ${filter === 'all' ? 'active' : ''}`}
                onClick={() => setFilter('all')}
              >
                All ({projects.length})
              </button>
              <button 
                className={`filter-tab ${filter === 'published' ? 'active' : ''}`}
                onClick={() => setFilter('published')}
              >
                Published ({projects.filter(p => p.payment_status === 'paid').length})
              </button>
              <button 
                className={`filter-tab ${filter === 'draft' ? 'active' : ''}`}
                onClick={() => setFilter('draft')}
              >
                Drafts ({projects.filter(p => p.payment_status === 'unpaid').length})
              </button>
            </div>
            
            <select 
              value={sortBy} 
              onChange={(e) => setSortBy(e.target.value)}
              className="sort-select"
            >
              <option value="created_at">Newest First</option>
              <option value="loan_amount">Loan Amount</option>
              <option value="title">Title A-Z</option>
            </select>
          </div>

          {/* Mobile Cards Layout */}
          <div className="mobile-projects-grid">
            {filteredProjects.map(project => (
              <MobileProjectCard key={project.id} project={project} />
            ))}
          </div>

          {/* Desktop Table Layout */}
          <div className="projects-table">
            <table>
              <thead>
                <tr>
                  <th>Project Title</th>
                  <th>Location</th>
                  <th>Loan Amount</th>
                  <th>Documents</th>
                  <th>Status</th>
                  <th>Created</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredProjects.map(project => (
                  <tr key={project.id}>
                    <td className="project-title-cell">
                      <strong>{project.title}</strong>
                    </td>
                    <td>{project.suburb}</td>
                    <td>{formatCurrency(project.loan_amount)}</td>
                    <td>
                      {project.documents_complete ? (
                        <span className="docs-status complete">
                          <svg viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                          </svg>
                        </span>
                      ) : (
                        <span className="docs-status incomplete">
                          <svg viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                          </svg>
                        </span>
                      )}
                    </td>
                    <td>
                      <StatusBadge status={project.payment_status === 'paid' ? 'Published' : 'Draft'} />
                    </td>
                    <td>{formatDate(project.created_at)}</td>
                    <td className="actions-cell">
                      <button
                        onClick={() => navigate(`/project/${project.id}`)}
                        className="btn btn-sm btn-outline"
                      >
                        <svg className="btn-icon" viewBox="0 0 20 20" fill="currentColor">
                          <path d="M10 12a2 2 0 100-4 2 2 0 000 4z" />
                          <path fillRule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clipRule="evenodd" />
                        </svg>
                        View
                      </button>
                      {project.payment_status === 'unpaid' && (
                        <button
                          onClick={() => navigate(`/project/${project.id}/edit`)}
                          className="btn btn-sm btn-primary"
                        >
                          <svg className="btn-icon" viewBox="0 0 20 20" fill="currentColor">
                            <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
                          </svg>
                          Edit
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
};

export default MyProjects;