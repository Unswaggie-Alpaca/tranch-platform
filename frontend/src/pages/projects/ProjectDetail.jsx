// components/projects/ProjectDetail.jsx
import React, { useState, useEffect } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import { useApi, useApp, useNotifications } from '../../hooks';
import { LoadingSpinner, ErrorMessage, Tabs, EmptyState, StatusBadge } from '../../components/common';
import { PaymentModal, DocumentPreviewModal } from '../../components/payments';
import { formatCurrency, formatDate, formatDateTime } from '../../utils/formatters';

const ProjectDetail = () => {
  const api = useApi();
  const { id } = useParams();
  const { user } = useApp();
  const navigate = useNavigate();
  const { addNotification } = useNotifications();
  const [project, setProject] = useState(null);
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('overview');
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [previewDocument, setPreviewDocument] = useState(null);

  useEffect(() => {
    fetchProjectDetails();
  }, [id]);

  const fetchProjectDetails = async () => {
    try {
      const [projectData, docsData] = await Promise.all([
        api.getProject(id),
        api.getProjectDocuments(id)
      ]);
      setProject(projectData);
      setDocuments(docsData);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handlePaymentSuccess = async () => {
    setShowPaymentModal(false);
    addNotification({
      type: 'success',
      title: 'Payment Successful',
      message: 'Your project is now published and visible to funders.'
    });
    await fetchProjectDetails();
  };

  const handleDocumentPreview = async (doc) => {
    if (doc.mime_type?.includes('pdf')) {
      setPreviewDocument(doc);
    } else {
      try {
        const blob = await api.downloadDocument(doc.file_path);
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = doc.file_name;
        a.click();
        window.URL.revokeObjectURL(url);
      } catch (err) {
        addNotification({
          type: 'error',
          title: 'Download Failed',
          message: 'Unable to download document'
        });
      }
    }
  };

  if (loading) return <LoadingSpinner />;
  if (error) return <ErrorMessage message={error} onClose={() => navigate(-1)} />;
  if (!project) return <div>Project not found</div>;

  const tabs = [
    { id: 'overview', label: 'Overview' },
    { id: 'financials', label: 'Financials' },
    { id: 'documents', label: `Documents (${documents.length})` },
    { id: 'timeline', label: 'Timeline & Milestones' }
  ];

  return (
    <div className="project-detail-page">
      {/* Breadcrumb Navigation */}
      <div className="breadcrumb">
        <Link to="/my-projects" className="breadcrumb-link">My Projects</Link>
        <svg className="breadcrumb-arrow" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
        </svg>
        <span className="breadcrumb-current">{project.title}</span>
      </div>

      {/* Project Header */}
      <div className="project-header">
        <div className="header-content">
          <div className="header-top">
            <h1 className="project-title">{project.title}</h1>
            <div className="header-actions">
              {user.role === 'borrower' && project.payment_status === 'unpaid' && (
                <>
                  <button 
                    onClick={() => navigate(`/project/${project.id}/edit`)}
                    className="btn btn-outline"
                  >
                    Edit Project
                  </button>
                  <button 
                    onClick={() => setShowPaymentModal(true)}
                    disabled={!project.documents_complete}
                    className="btn btn-primary"
                    title={!project.documents_complete ? 'Upload all required documents first' : ''}
                  >
                    Pay to Publish ($499)
                  </button>
                </>
              )}
            </div>
          </div>
          
          <div className="header-info">
            <div className="info-item">
              <svg className="info-icon" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
              </svg>
              <span>{project.location}</span>
            </div>
            <StatusBadge status={project.payment_status === 'paid' ? 'Published' : 'Draft'} />
            {project.documents_complete && <StatusBadge status="Docs Complete" />}
          </div>
        </div>

        {/* Quick Stats Bar */}
        <div className="quick-stats">
          <div className="stat">
            <label>Loan Amount</label>
            <span className="stat-value">{formatCurrency(project.loan_amount)}</span>
          </div>
          <div className="stat-divider"></div>
          <div className="stat">
            <label>Interest Rate</label>
            <span className="stat-value">{project.interest_rate || 'TBD'}%</span>
          </div>
          <div className="stat-divider"></div>
          <div className="stat">
            <label>Loan Term</label>
            <span className="stat-value">{project.loan_term || 'TBD'} months</span>
          </div>
          <div className="stat-divider"></div>
          <div className="stat">
            <label>LVR</label>
            <span className="stat-value">{project.lvr ? `${project.lvr.toFixed(1)}%` : 'N/A'}</span>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="tabs-container">
        <Tabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab} />
      </div>

      {/* Tab Content */}
      <div className="tab-content">
        {activeTab === 'overview' && (
          <div className="overview-grid">
            {/* Project Summary Card */}
            <div className="content-card">
              <h3>Project Summary</h3>
              <p className="project-description">
                {project.description || 'No description provided.'}
              </p>
              
              <div className="detail-grid">
                <div className="detail-item">
                  <label>Property Type</label>
                  <span>{project.property_type}</span>
                </div>
                <div className="detail-item">
                  <label>Development Stage</label>
                  <span>{project.development_stage}</span>
                </div>
                <div className="detail-item">
                  <label>Project Size</label>
                  <span>{project.project_size_sqm ? `${formatNumber(project.project_size_sqm)} sqm` : 'N/A'}</span>
                </div>
                <div className="detail-item">
                  <label>Number of Units</label>
                  <span>{project.number_of_units ? formatNumber(project.number_of_units) : 'N/A'}</span>
                </div>
                <div className="detail-item">
                  <label>Levels</label>
                  <span>{project.number_of_levels || 'N/A'}</span>
                </div>
                <div className="detail-item">
                  <label>Car Spaces</label>
                  <span>{project.car_spaces || 'N/A'}</span>
                </div>
              </div>
            </div>

            {/* Planning & Compliance Card */}
            <div className="content-card">
              <h3>Planning & Compliance</h3>
              <div className="detail-grid">
                <div className="detail-item">
                  <label>Zoning</label>
                  <span>{project.zoning || 'N/A'}</span>
                </div>
                <div className="detail-item">
                  <label>Planning Status</label>
                  <span>{project.planning_permit_status || 'Not Started'}</span>
                </div>
                <div className="detail-item">
                  <label>Expected Start</label>
                  <span>{project.expected_start_date ? formatDate(project.expected_start_date) : 'TBD'}</span>
                </div>
                <div className="detail-item">
                  <label>Expected Completion</label>
                  <span>{project.expected_completion_date ? formatDate(project.expected_completion_date) : 'TBD'}</span>
                </div>
              </div>
            </div>

            {/* Risk Assessment Card */}
            {(project.market_risk_rating || project.construction_risk_rating || project.location_risk_rating) && (
              <div className="content-card">
                <h3>Risk Assessment</h3>
                <div className="risk-grid">
                  <div className="risk-item">
                    <label>Market Risk</label>
                    <div className={`risk-badge risk-${project.market_risk_rating}`}>
                      {project.market_risk_rating?.toUpperCase()}
                    </div>
                  </div>
                  <div className="risk-item">
                    <label>Construction Risk</label>
                    <div className={`risk-badge risk-${project.construction_risk_rating}`}>
                      {project.construction_risk_rating?.toUpperCase()}
                    </div>
                  </div>
                  <div className="risk-item">
                    <label>Location Risk</label>
                    <div className={`risk-badge risk-${project.location_risk_rating}`}>
                      {project.location_risk_rating?.toUpperCase()}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'financials' && (
          <div className="financials-grid">
            {/* Loan Structure Card */}
            <div className="content-card">
              <h3>Loan Structure</h3>
              <div className="financial-detail">
                <label>Loan Amount Required</label>
                <span className="value primary">{formatCurrency(project.loan_amount)}</span>
              </div>
              <div className="financial-detail">
                <label>Interest Rate</label>
                <span className="value">{project.interest_rate || 'TBD'}% per annum</span>
              </div>
              <div className="financial-detail">
                <label>Loan Term</label>
                <span className="value">{project.loan_term || 'TBD'} months</span>
              </div>
              <div className="financial-detail">
                <label>Monthly Interest</label>
                <span className="value">
                  {project.interest_rate && project.loan_amount 
                    ? formatCurrency((project.loan_amount * project.interest_rate / 100) / 12)
                    : 'TBD'}
                </span>
              </div>
            </div>

            {/* Project Economics Card */}
            <div className="content-card">
              <h3>Project Economics</h3>
              <div className="financial-detail">
                <label>Total Project Cost</label>
                <span className="value">{formatCurrency(project.total_project_cost || 0)}</span>
              </div>
              <div className="financial-detail">
                <label>Land Value</label>
                <span className="value">{formatCurrency(project.land_value || 0)}</span>
              </div>
              <div className="financial-detail">
                <label>Construction Cost</label>
                <span className="value">{formatCurrency(project.construction_cost || 0)}</span>
              </div>
              <div className="financial-detail">
                <label>Equity Contribution</label>
                <span className="value">{formatCurrency(project.equity_contribution || 0)}</span>
              </div>
            </div>

            {/* Key Metrics Card */}
            <div className="content-card">
              <h3>Key Metrics</h3>
              <div className="metrics-grid">
                <div className="metric">
                  <label>LVR</label>
                  <span className="metric-value">{project.lvr ? `${project.lvr.toFixed(1)}%` : 'N/A'}</span>
                  <div className="metric-bar">
                    <div 
                      className="metric-fill"
                      style={{ width: `${Math.min(project.lvr || 0, 100)}%` }}
                    ></div>
                  </div>
                </div>
                <div className="metric">
                  <label>Profit Margin</label>
                  <span className="metric-value">
                    {project.expected_profit && project.total_project_cost
                      ? `${((project.expected_profit / project.total_project_cost) * 100).toFixed(1)}%`
                      : 'N/A'}
                  </span>
                </div>
                <div className="metric">
                  <label>Expected GDC</label>
                  <span className="metric-value">{formatCurrency(project.expected_gdc || 0)}</span>
                </div>
                <div className="metric">
                  <label>Expected Profit</label>
                  <span className="metric-value">{formatCurrency(project.expected_profit || 0)}</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'documents' && (
          <div className="documents-section">
            {documents.length === 0 ? (
              <EmptyState 
                icon={
                  <svg className="empty-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                }
                title="No documents uploaded"
                message="Upload documents to complete your project listing"
                action={
                  user.role === 'borrower' && project.payment_status === 'unpaid' && (
                    <button 
                      onClick={() => navigate(`/project/${project.id}/edit`)}
                      className="btn btn-primary"
                    >
                      Upload Documents
                    </button>
                  )
                }
              />
            ) : (
              <div className="documents-grid">
                {documents.map(doc => (
                  <div key={doc.id} className="document-card">
                    <div className="doc-icon">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                      </svg>
                    </div>
                    <div className="doc-info">
                      <h4>{doc.file_name}</h4>
                      <p>{doc.document_type.replace(/_/g, ' ')}</p>
                      <p className="doc-meta">
                        {formatDate(doc.uploaded_at)}
                      </p>
                    </div>
                    <button 
                      onClick={() => handleDocumentPreview(doc)}
                      className="btn btn-sm btn-outline"
                    >
                      View
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'timeline' && (
          <div className="timeline-section">
            <div className="timeline">
              <div className="timeline-item completed">
                <div className="timeline-marker"></div>
                <div className="timeline-content">
                  <h4>Project Created</h4>
                  <p>{formatDateTime(project.created_at)}</p>
                </div>
              </div>
              
              {project.payment_status === 'paid' && (
                <div className="timeline-item completed">
                  <div className="timeline-marker"></div>
                  <div className="timeline-content">
                    <h4>Project Published</h4>
                    <p>Visible to all verified funders</p>
                    <p className="timeline-date">{formatDateTime(project.updated_at)}</p>
                  </div>
                </div>
              )}
              
              {documents.length > 0 && (
                <div className="timeline-item completed">
                  <div className="timeline-marker"></div>
                  <div className="timeline-content">
                    <h4>Documents Uploaded</h4>
                    <p>{documents.length} documents added</p>
                    <p className="timeline-date">{formatDateTime(documents[0].uploaded_at)}</p>
                  </div>
                </div>
              )}
              
              <div className="timeline-item future">
                <div className="timeline-marker"></div>
                <div className="timeline-content">
                  <h4>Expected Construction Start</h4>
                  <p>{project.expected_start_date ? formatDate(project.expected_start_date) : 'TBD'}</p>
                </div>
              </div>
              
              <div className="timeline-item future">
                <div className="timeline-marker"></div>
                <div className="timeline-content">
                  <h4>Expected Completion</h4>
                  <p>{project.expected_completion_date ? formatDate(project.expected_completion_date) : 'TBD'}</p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      <PaymentModal 
        isOpen={showPaymentModal}
        onClose={() => setShowPaymentModal(false)}
        project={project}
        onSuccess={handlePaymentSuccess}
      />

      {previewDocument && (
        <DocumentPreviewModal 
          document={previewDocument}
          onClose={() => setPreviewDocument(null)}
        />
      )}
    </div>
  );
};

export default ProjectDetail;