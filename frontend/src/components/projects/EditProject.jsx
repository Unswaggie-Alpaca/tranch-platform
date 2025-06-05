// components/projects/EditProject.jsx
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useApi, useNotifications } from '../../hooks';
import { LoadingSpinner, ErrorMessage, Tooltip, NumberInput, InfoMessage } from '../common';
import { PROPERTY_TYPES, DEVELOPMENT_STAGES, PLANNING_PERMIT_STATUS } from '../../utils/constants';

const EditProject = () => {
  const { id } = useParams();
  const api = useApi();
  const navigate = useNavigate();
  const { addNotification } = useNotifications();
  const [currentStep, setCurrentStep] = useState(1);
  const [project, setProject] = useState(null);
  const [documents, setDocuments] = useState([]);
  const [newDocuments, setNewDocuments] = useState([]);
  const [requiredDocs, setRequiredDocs] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingDocs, setUploadingDocs] = useState(false);
  const [error, setError] = useState('');
  const [validationErrors, setValidationErrors] = useState({});

  useEffect(() => {
    fetchData();
  }, [id]);

  const fetchData = async () => {
    try {
      const [projectData, docsData, requiredDocsData] = await Promise.all([
        api.getProject(id),
        api.getProjectDocuments(id),
        api.getRequiredDocuments()
      ]);
      setProject(projectData);
      setDocuments(docsData);
      setRequiredDocs(requiredDocsData);
    } catch (err) {
      setError('Failed to load project');
    } finally {
      setLoading(false);
    }
  };

  const handleNext = () => {
    const errors = validateStep(currentStep);
    if (Object.keys(errors).length === 0) {
      setCurrentStep(currentStep + 1);
      setValidationErrors({});
    } else {
      setValidationErrors(errors);
      setError('Please fix the errors before proceeding');
    }
  };

  const handlePrevious = () => {
    setCurrentStep(currentStep - 1);
    setError('');
    setValidationErrors({});
  };

  const validateStep = (step) => {
    const errors = {};
    
    switch (step) {
      case 1:
        if (!project.title) errors.title = 'Project title is required';
        if (!project.location) errors.location = 'Location is required';
        if (!project.suburb) errors.suburb = 'Suburb is required';
        if (!project.loan_amount) errors.loan_amount = 'Loan amount is required';
        break;
      case 2:
        if (!project.total_project_cost) errors.total_project_cost = 'Total project cost is required';
        if (!project.equity_contribution) errors.equity_contribution = 'Equity contribution is required';
        break;
    }
    
    return errors;
  };

  const handleSubmit = async () => {
    setSaving(true);
    setError('');

    try {
      // Update project data
      await api.updateProject(id, {
        title: project.title,
        description: project.description,
        location: project.location,
        suburb: project.suburb,
        loan_amount: parseInt(project.loan_amount),
        interest_rate: project.interest_rate ? parseFloat(project.interest_rate) : null,
        loan_term: project.loan_term ? parseInt(project.loan_term) : null,
        property_type: project.property_type,
        development_stage: project.development_stage,
        total_project_cost: project.total_project_cost ? parseInt(project.total_project_cost) : null,
        equity_contribution: project.equity_contribution ? parseInt(project.equity_contribution) : null,
        land_value: project.land_value ? parseInt(project.land_value) : null,
        construction_cost: project.construction_cost ? parseInt(project.construction_cost) : null,
        expected_gdc: project.expected_gdc ? parseInt(project.expected_gdc) : null,
        expected_profit: project.expected_profit ? parseInt(project.expected_profit) : null,
        project_size_sqm: project.project_size_sqm ? parseInt(project.project_size_sqm) : null,
        number_of_units: project.number_of_units ? parseInt(project.number_of_units) : null,
        number_of_levels: project.number_of_levels ? parseInt(project.number_of_levels) : null,
        car_spaces: project.car_spaces ? parseInt(project.car_spaces) : null,
        zoning: project.zoning,
        planning_permit_status: project.planning_permit_status,
        expected_start_date: project.expected_start_date,
        expected_completion_date: project.expected_completion_date,
        market_risk_rating: project.market_risk_rating,
        construction_risk_rating: project.construction_risk_rating,
        location_risk_rating: project.location_risk_rating
      });

      // Upload new documents if any
      if (newDocuments.length > 0) {
        await uploadDocuments();
      }

      addNotification({
        type: 'success',
        title: 'Project Updated',
        message: 'Your project has been updated successfully!'
      });
      
      navigate(`/project/${id}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const uploadDocuments = async () => {
    setUploadingDocs(true);
    try {
      const formData = new FormData();
      const documentTypes = [];
      
      newDocuments.forEach((doc) => {
        formData.append('documents', doc.file);
        documentTypes.push(doc.type);
      });
      
      formData.append('document_types', JSON.stringify(documentTypes));
      
      await api.uploadDocuments(id, formData);
    } catch (err) {
      console.error('Document upload error:', err);
    } finally {
      setUploadingDocs(false);
    }
  };

  const handleDocumentChange = (e, docType) => {
    const file = e.target.files[0];
    if (file) {
      if (file.size > 50 * 1024 * 1024) {
        addNotification({
          type: 'error',
          title: 'File Too Large',
          message: 'Maximum file size is 50MB'
        });
        return;
      }
      
      setNewDocuments(prev => [
        ...prev.filter(d => d.type !== docType),
        { type: docType, file: file, name: file.name }
      ]);
    }
  };

  const removeNewDocument = (docType) => {
    setNewDocuments(prev => prev.filter(d => d.type !== docType));
  };

  const handleDeleteDocument = async (docId) => {
    if (window.confirm('Are you sure you want to delete this document?')) {
      try {
        await api.deleteDocument(docId);
        setDocuments(documents.filter(d => d.id !== docId));
        addNotification({
          type: 'success',
          title: 'Document Deleted',
          message: 'Document has been removed successfully'
        });
      } catch (err) {
        addNotification({
          type: 'error',
          title: 'Delete Failed',
          message: 'Failed to delete document'
        });
      }
    }
  };

  const calculateLVR = () => {
    if (project?.loan_amount && project?.land_value) {
      return ((parseInt(project.loan_amount) / parseInt(project.land_value)) * 100).toFixed(1);
    }
    return null;
  };

  const calculateICR = () => {
    if (project?.expected_profit && project?.loan_amount && project?.interest_rate && project?.loan_term) {
      const annualInterest = (parseInt(project.loan_amount) * parseFloat(project.interest_rate)) / 100;
      const annualProfit = parseInt(project.expected_profit) / (parseInt(project.loan_term) / 12);
      return (annualProfit / annualInterest).toFixed(2);
    }
    return null;
  };

  if (loading) return <LoadingSpinner />;
  if (!project) return <div>Project not found</div>;

  const renderStepContent = () => {
    switch (currentStep) {
      case 1:
        return (
          <div className="form-section">
            <h3>Basic Project Information</h3>
            
            <div className="form-group">
              <label>Project Title *</label>
              <input
                type="text"
                value={project.title}
                onChange={(e) => setProject({ ...project, title: e.target.value })}
                required
                className={`form-input ${validationErrors.title ? 'error' : ''}`}
              />
              {validationErrors.title && (
                <span className="field-error">{validationErrors.title}</span>
              )}
            </div>

            <div className="form-group">
              <label>Project Description</label>
              <textarea
                value={project.description || ''}
                onChange={(e) => setProject({ ...project, description: e.target.value })}
                className="form-textarea"
                rows="6"
              />
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Full Address *</label>
                <input
                  type="text"
                  value={project.location}
                  onChange={(e) => setProject({ ...project, location: e.target.value })}
                  required
                  className={`form-input ${validationErrors.location ? 'error' : ''}`}
                />
                {validationErrors.location && (
                  <span className="field-error">{validationErrors.location}</span>
                )}
              </div>

              <div className="form-group">
                <label>Suburb *</label>
                <input
                  type="text"
                  value={project.suburb}
                  onChange={(e) => setProject({ ...project, suburb: e.target.value })}
                  required
                  className={`form-input ${validationErrors.suburb ? 'error' : ''}`}
                />
                {validationErrors.suburb && (
                  <span className="field-error">{validationErrors.suburb}</span>
                )}
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Property Type</label>
                <select
                  value={project.property_type || 'Residential'}
                  onChange={(e) => setProject({ ...project, property_type: e.target.value })}
                  className="form-select"
                >
                  {PROPERTY_TYPES.map(type => (
                    <option key={type} value={type}>{type}</option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label>Development Stage</label>
                <select
                  value={project.development_stage || 'Planning'}
                  onChange={(e) => setProject({ ...project, development_stage: e.target.value })}
                  className="form-select"
                >
                  {DEVELOPMENT_STAGES.map(stage => (
                    <option key={stage} value={stage}>{stage}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="form-group">
              <label>Loan Amount Required (AUD) *</label>
              <NumberInput
                value={project.loan_amount}
                onChange={(value) => setProject({ ...project, loan_amount: value })}
                prefix="$"
                min={100000}
                className={validationErrors.loan_amount ? 'error' : ''}
              />
              {validationErrors.loan_amount && (
                <span className="field-error">{validationErrors.loan_amount}</span>
              )}
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Target Interest Rate (%)</label>
                <NumberInput
                  value={project.interest_rate || ''}
                  onChange={(value) => setProject({ ...project, interest_rate: value })}
                  suffix="%"
                  step={0.1}
                  min={0}
                />
              </div>

              <div className="form-group">
                <label>Loan Term (months)</label>
                <NumberInput
                  value={project.loan_term || ''}
                  onChange={(value) => setProject({ ...project, loan_term: value })}
                  suffix="months"
                  min={1}
                />
              </div>
            </div>
          </div>
        );

      case 2:
        return (
          <div className="form-section">
            <h3>Financial Details</h3>
            
            <div className="form-row">
              <div className="form-group">
                <label>Total Project Cost (AUD) *</label>
                <NumberInput
                  value={project.total_project_cost || ''}
                  onChange={(value) => setProject({ ...project, total_project_cost: value })}
                  prefix="$"
                  min={1}
                  className={validationErrors.total_project_cost ? 'error' : ''}
                />
                {validationErrors.total_project_cost && (
                  <span className="field-error">{validationErrors.total_project_cost}</span>
                )}
              </div>

              <div className="form-group">
                <label>Equity Contribution (AUD) *</label>
                <NumberInput
                  value={project.equity_contribution || ''}
                  onChange={(value) => setProject({ ...project, equity_contribution: value })}
                  prefix="$"
                  min={0}
                  className={validationErrors.equity_contribution ? 'error' : ''}
                />
                {validationErrors.equity_contribution && (
                  <span className="field-error">{validationErrors.equity_contribution}</span>
                )}
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Land Value (AUD)</label>
                <NumberInput
                  value={project.land_value || ''}
                  onChange={(value) => setProject({ ...project, land_value: value })}
                  prefix="$"
                  min={0}
                />
              </div>

              <div className="form-group">
                <label>Construction Cost (AUD)</label>
                <NumberInput
                  value={project.construction_cost || ''}
                  onChange={(value) => setProject({ ...project, construction_cost: value })}
                  prefix="$"
                  min={0}
                />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Expected GDC (AUD)</label>
                <NumberInput
                  value={project.expected_gdc || ''}
                  onChange={(value) => setProject({ ...project, expected_gdc: value })}
                  prefix="$"
                  min={0}
                />
              </div>

              <div className="form-group">
                <label>Expected Profit (AUD)</label>
                <NumberInput
                  value={project.expected_profit || ''}
                  onChange={(value) => setProject({ ...project, expected_profit: value })}
                  prefix="$"
                  min={0}
                />
              </div>
            </div>

            <div className="financial-metrics">
              <h4>Key Financial Metrics</h4>
              <div className="metrics-grid">
                <div className="metric-item">
                  <label>LVR (Loan to Value Ratio)</label>
                  <div className="metric-value">{calculateLVR() || 'N/A'}%</div>
                </div>
                <div className="metric-item">
                  <label>ICR (Interest Coverage Ratio)</label>
                  <div className="metric-value">{calculateICR() || 'N/A'}</div>
                </div>
                <div className="metric-item">
                  <label>Debt/Equity Ratio</label>
                  <div className="metric-value">
                    {project.loan_amount && project.equity_contribution 
                      ? (parseInt(project.loan_amount) / parseInt(project.equity_contribution)).toFixed(2)
                      : 'N/A'}
                  </div>
                </div>
              </div>
            </div>
          </div>
        );

      case 3:
        return (
          <div className="form-section">
            <h3>Project Details</h3>
            
            <div className="form-row">
              <div className="form-group">
                <label>Project Size (sqm)</label>
                <NumberInput
                  value={project.project_size_sqm || ''}
                  onChange={(value) => setProject({ ...project, project_size_sqm: value })}
                  suffix="sqm"
                  min={0}
                />
              </div>

              <div className="form-group">
                <label>Number of Units</label>
                <NumberInput
                  value={project.number_of_units || ''}
                  onChange={(value) => setProject({ ...project, number_of_units: value })}
                  min={0}
                />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Number of Levels</label>
                <NumberInput
                  value={project.number_of_levels || ''}
                  onChange={(value) => setProject({ ...project, number_of_levels: value })}
                  min={0}
                />
              </div>

              <div className="form-group">
                <label>Car Spaces</label>
                <NumberInput
                  value={project.car_spaces || ''}
                  onChange={(value) => setProject({ ...project, car_spaces: value })}
                  min={0}
                />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Zoning</label>
                <input
                  type="text"
                  value={project.zoning || ''}
                  onChange={(e) => setProject({ ...project, zoning: e.target.value })}
                  className="form-input"
                  placeholder="e.g., R3 Medium Density"
                />
              </div>

              <div className="form-group">
                <label>Planning Permit Status</label>
                <select
                  value={project.planning_permit_status || 'Not Started'}
                  onChange={(e) => setProject({ ...project, planning_permit_status: e.target.value })}
                  className="form-select"
                >
                  {PLANNING_PERMIT_STATUS.map(status => (
                    <option key={status} value={status}>{status}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Expected Start Date</label>
                <input
                  type="date"
                  value={project.expected_start_date || ''}
                  onChange={(e) => setProject({ ...project, expected_start_date: e.target.value })}
                  className="form-input"
                />
              </div>

              <div className="form-group">
                <label>Expected Completion Date</label>
                <input
                  type="date"
                  value={project.expected_completion_date || ''}
                  onChange={(e) => setProject({ ...project, expected_completion_date: e.target.value })}
                  className="form-input"
                />
              </div>
            </div>

            <div className="form-section">
              <h4>Risk Assessment</h4>
              <div className="risk-assessment-grid">
                <div className="form-group">
                  <label>Market Risk</label>
                  <select
                    value={project.market_risk_rating || 'medium'}
                    onChange={(e) => setProject({ ...project, market_risk_rating: e.target.value })}
                    className="form-select"
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                  </select>
                </div>

                <div className="form-group">
                  <label>Construction Risk</label>
                  <select
                    value={project.construction_risk_rating || 'medium'}
                    onChange={(e) => setProject({ ...project, construction_risk_rating: e.target.value })}
                    className="form-select"
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                  </select>
                </div>

                <div className="form-group">
                  <label>Location Risk</label>
                  <select
                    value={project.location_risk_rating || 'medium'}
                    onChange={(e) => setProject({ ...project, location_risk_rating: e.target.value })}
                    className="form-select"
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                  </select>
                </div>
              </div>
            </div>
          </div>
        );

      case 4:
        return (
          <div className="form-section">
            <h3>Document Management</h3>
            <p className="section-description">
              Upload new documents or manage existing ones. Required documents are marked with an asterisk (*).
            </p>
            
            {/* Existing Documents */}
            {documents.length > 0 && (
              <div className="existing-documents">
                <h4>Existing Documents</h4>
                <div className="documents-grid">
                  {documents.map((doc) => (
                    <div key={doc.id} className="document-upload-item">
                      <div className="document-header">
                        <label>{doc.document_type.replace(/_/g, ' ')}</label>
                        <span className="uploaded-badge">✓ Uploaded</span>
                      </div>
                      <div className="uploaded-file">
                        <span className="file-name">{doc.file_name}</span>
                        <button
                          type="button"
                          onClick={() => handleDeleteDocument(doc.id)}
                          className="btn btn-sm btn-danger"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Upload New Documents */}
            <div className="new-documents">
              <h4>Upload New Documents</h4>
              <div className="documents-grid">
                {requiredDocs.required_documents?.map((docType) => {
                  const hasExisting = documents.some(d => d.document_type === docType);
                  const hasNew = newDocuments.some(d => d.type === docType);
                  
                  return (
                    <div key={docType} className="document-upload-item">
                      <div className="document-header">
                        <label htmlFor={`doc-${docType}`}>
                          {requiredDocs.descriptions?.[docType] || docType.replace(/_/g, ' ')} 
                          {!hasExisting && ' *'}
                        </label>
                        {(hasExisting || hasNew) && (
                          <span className="uploaded-badge">
                            {hasExisting ? '✓ Existing' : '✓ Ready to upload'}
                          </span>
                        )}
                      </div>
                      
                      <div className="document-actions">
                        <input
                          type="file"
                          id={`doc-${docType}`}
                          onChange={(e) => handleDocumentChange(e, docType)}
                          accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png"
                          style={{ display: 'none' }}
                        />
                        
                        {hasNew ? (
                          <div className="uploaded-file">
                            <span className="file-name">{newDocuments.find(d => d.type === docType).name}</span>
                            <button
                              type="button"
                              onClick={() => removeNewDocument(docType)}
                              className="btn btn-sm btn-danger"
                            >
                              Remove
                            </button>
                          </div>
                        ) : (
                          <label htmlFor={`doc-${docType}`} className="btn btn-outline upload-btn">
                            {hasExisting ? 'Replace File' : 'Choose File'}
                          </label>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="create-project">
      <div className="create-project-header">
        <h1>Edit Project</h1>
        <p>Update your project information and documents</p>
      </div>

      {/* Progress Steps */}
      <div className="progress-steps">
        <div className={`step ${currentStep >= 1 ? 'active' : ''} ${currentStep > 1 ? 'completed' : ''}`}>
          <div className="step-number">1</div>
          <div className="step-label">Basic Info</div>
        </div>
        <div className={`step ${currentStep >= 2 ? 'active' : ''} ${currentStep > 2 ? 'completed' : ''}`}>
          <div className="step-number">2</div>
          <div className="step-label">Financials</div>
        </div>
        <div className={`step ${currentStep >= 3 ? 'active' : ''} ${currentStep > 3 ? 'completed' : ''}`}>
          <div className="step-number">3</div>
          <div className="step-label">Details</div>
        </div>
        <div className={`step ${currentStep >= 4 ? 'active' : ''} ${currentStep > 4 ? 'completed' : ''}`}>
          <div className="step-number">4</div>
          <div className="step-label">Documents</div>
        </div>
      </div>

      {error && <ErrorMessage message={error} onClose={() => setError('')} />}

      <form className="project-form multi-step">
        {renderStepContent()}

        <div className="form-actions">
          {currentStep > 1 && (
            <button type="button" onClick={handlePrevious} className="btn btn-outline">
              Previous
            </button>
          )}
          
          {currentStep < 4 ? (
            <button type="button" onClick={handleNext} className="btn btn-primary">
              Next
            </button>
          ) : (
            <button 
              type="button" 
              onClick={handleSubmit} 
              disabled={saving || uploadingDocs}
              className="btn btn-primary"
            >
              {saving ? 'Saving Changes...' : 'Save All Changes'}
            </button>
          )}
        </div>
      </form>
    </div>
  );
};

export default EditProject;