// components/projects/CreateProject.jsx
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApi, useNotifications } from '../../hooks';
import { ErrorMessage, Tooltip, NumberInput, InfoMessage } from '../common';
import { PROPERTY_TYPES, DEVELOPMENT_STAGES, PLANNING_PERMIT_STATUS } from '../../utils/constants';

const CreateProject = () => {
  const api = useApi();
  const navigate = useNavigate();
  const { addNotification } = useNotifications();
  const [currentStep, setCurrentStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    // Basic Info
    title: '',
    description: '',
    location: '',
    suburb: '',
    property_type: 'Residential',
    development_stage: 'Planning',
    
    // Financial Details
    loan_amount: '',
    interest_rate: '',
    loan_term: '',
    total_project_cost: '',
    equity_contribution: '',
    land_value: '',
    construction_cost: '',
    expected_gdc: '',
    expected_profit: '',
    
    // Project Details
    project_size_sqm: '',
    number_of_units: '',
    number_of_levels: '',
    car_spaces: '',
    zoning: '',
    planning_permit_status: 'Not Started',
    
    // Timeline
    expected_start_date: '',
    expected_completion_date: '',
    
    // Risk Assessment
    market_risk_rating: 'medium',
    construction_risk_rating: 'medium',
    location_risk_rating: 'medium'
  });
  
  const [documents, setDocuments] = useState([]);
  const [requiredDocs, setRequiredDocs] = useState({});
  const [loading, setLoading] = useState(false);
  const [uploadingDocs, setUploadingDocs] = useState(false);
  const [error, setError] = useState('');
  const [projectId, setProjectId] = useState(null);
  const [validationErrors, setValidationErrors] = useState({});

  useEffect(() => {
    fetchRequiredDocuments();
    // Load draft if exists
    const draft = localStorage.getItem('project_draft');
    if (draft) {
      const parsedDraft = JSON.parse(draft);
      setFormData(parsedDraft);
      addNotification({
        type: 'info',
        title: 'Draft Loaded',
        message: 'Your previous draft has been loaded'
      });
    }
  }, []);

  // Auto-save draft
  useEffect(() => {
    const timer = setTimeout(() => {
      if (formData.title || formData.description) {
        localStorage.setItem('project_draft', JSON.stringify(formData));
      }
    }, 1000);
    
    return () => clearTimeout(timer);
  }, [formData]);

  const fetchRequiredDocuments = async () => {
    try {
      const data = await api.getRequiredDocuments();
      setRequiredDocs(data);
    } catch (err) {
      console.error('Failed to fetch required documents:', err);
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
        if (!formData.title) errors.title = 'Project title is required';
        if (!formData.location) errors.location = 'Location is required';
        if (!formData.suburb) errors.suburb = 'Suburb is required';
        if (!formData.loan_amount) errors.loan_amount = 'Loan amount is required';
        if (formData.loan_amount && formData.loan_amount < 100000) {
          errors.loan_amount = 'Minimum loan amount is $100,000';
        }
        if (formData.interest_rate && (formData.interest_rate < 0 || formData.interest_rate > 50)) {
          errors.interest_rate = 'Interest rate must be between 0% and 50%';
        }
        if (formData.loan_term && (formData.loan_term < 1 || formData.loan_term > 120)) {
          errors.loan_term = 'Loan term must be between 1 and 120 months';
        }
        break;
        
      case 2:
        if (!formData.total_project_cost) errors.total_project_cost = 'Total project cost is required';
        if (!formData.equity_contribution) errors.equity_contribution = 'Equity contribution is required';
        
        const totalCost = parseInt(formData.total_project_cost);
        const equity = parseInt(formData.equity_contribution);
        const loan = parseInt(formData.loan_amount);
        
        if (totalCost && equity && loan) {
          if (equity + loan > totalCost * 1.1) { // Allow 10% margin
            errors.equity_contribution = 'Equity + Loan exceeds total project cost';
          }
          if (equity < totalCost * 0.1) {
            errors.equity_contribution = 'Minimum 10% equity required';
          }
        }
        
        if (formData.land_value && formData.loan_amount) {
          const lvr = (formData.loan_amount / formData.land_value) * 100;
          if (lvr > 80) {
            errors.land_value = 'LVR exceeds 80% - adjust loan amount or land value';
          }
        }
        break;
        
      case 3:
        if (formData.expected_start_date && formData.expected_completion_date) {
          const start = new Date(formData.expected_start_date);
          const end = new Date(formData.expected_completion_date);
          if (end <= start) {
            errors.expected_completion_date = 'Completion date must be after start date';
          }
        }
        break;
    }
    
    return errors;
  };

  const handleSubmit = async () => {
    setLoading(true);
    setError('');

    try {
      // Create project
      const projectData = {
        ...formData,
        loan_amount: parseInt(formData.loan_amount),
        interest_rate: formData.interest_rate ? parseFloat(formData.interest_rate) : null,
        loan_term: formData.loan_term ? parseInt(formData.loan_term) : null,
        total_project_cost: formData.total_project_cost ? parseInt(formData.total_project_cost) : null,
        equity_contribution: formData.equity_contribution ? parseInt(formData.equity_contribution) : null,
        land_value: formData.land_value ? parseInt(formData.land_value) : null,
        construction_cost: formData.construction_cost ? parseInt(formData.construction_cost) : null,
        expected_gdc: formData.expected_gdc ? parseInt(formData.expected_gdc) : null,
        expected_profit: formData.expected_profit ? parseInt(formData.expected_profit) : null,
        project_size_sqm: formData.project_size_sqm ? parseInt(formData.project_size_sqm) : null,
        number_of_units: formData.number_of_units ? parseInt(formData.number_of_units) : null,
        number_of_levels: formData.number_of_levels ? parseInt(formData.number_of_levels) : null,
        car_spaces: formData.car_spaces ? parseInt(formData.car_spaces) : null,
      };

      const response = await api.createProject(projectData);
      setProjectId(response.project_id);
      
      // Clear draft
      localStorage.removeItem('project_draft');
      
      // Upload documents if any
      if (documents.length > 0) {
        await uploadDocuments(response.project_id);
      }
      
      addNotification({
        type: 'success',
        title: 'Project Created',
        message: 'Your project has been created successfully!'
      });
      
      navigate(`/project/${response.project_id}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const uploadDocuments = async (projectId) => {
    setUploadingDocs(true);
    try {
      const formData = new FormData();
      const documentTypes = [];
      
      documents.forEach((doc) => {
        formData.append('documents', doc.file);
        documentTypes.push(doc.type);
      });
      
      formData.append('document_types', JSON.stringify(documentTypes));
      
      await api.uploadDocuments(projectId, formData);
    } catch (err) {
      console.error('Document upload error:', err);
      addNotification({
        type: 'warning',
        title: 'Document Upload Issue',
        message: 'Some documents failed to upload. You can add them later.'
      });
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
      
      setDocuments(prev => [
        ...prev.filter(d => d.type !== docType),
        { type: docType, file: file, name: file.name }
      ]);
    }
  };

  const removeDocument = (docType) => {
    setDocuments(prev => prev.filter(d => d.type !== docType));
  };

  const calculateLVR = () => {
    if (formData.loan_amount && formData.land_value) {
      return ((parseInt(formData.loan_amount) / parseInt(formData.land_value)) * 100).toFixed(1);
    }
    return null;
  };

  const calculateICR = () => {
    if (formData.expected_profit && formData.loan_amount && formData.interest_rate && formData.loan_term) {
      const annualInterest = (parseInt(formData.loan_amount) * parseFloat(formData.interest_rate)) / 100;
      const annualProfit = parseInt(formData.expected_profit) / (parseInt(formData.loan_term) / 12);
      return (annualProfit / annualInterest).toFixed(2);
    }
    return null;
  };

  const renderStepContent = () => {
    switch (currentStep) {
      case 1:
        return (
          <div className="form-section">
            <h3>Basic Project Information</h3>
            
            <div className="form-group">
              <label htmlFor="title">
                Project Title *
                <Tooltip content="A clear, descriptive name for your development project">
                  <span className="help-icon">?</span>
                </Tooltip>
              </label>
              <input
                type="text"
                id="title"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                required
                className={`form-input ${validationErrors.title ? 'error' : ''}`}
                placeholder="e.g., Luxury Apartment Development - Sydney CBD"
              />
              {validationErrors.title && (
                <span className="field-error">{validationErrors.title}</span>
              )}
            </div>

            <div className="form-group">
              <label htmlFor="description">
                Project Description
                <Tooltip content="Provide details about the development, target market, and unique features">
                  <span className="help-icon">?</span>
                </Tooltip>
              </label>
              <textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                className="form-textarea"
                placeholder="Provide a detailed description of your development project..."
                rows="6"
              />
            </div>

            <div className="form-row">
              <div className="form-group">
                <label htmlFor="location">
                  Full Address *
                  <Tooltip content="Street address of the development site">
                    <span className="help-icon">?</span>
                  </Tooltip>
                </label>
                <input
                  type="text"
                  id="location"
                  value={formData.location}
                  onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                  required
                  className={`form-input ${validationErrors.location ? 'error' : ''}`}
                  placeholder="123 Collins St, Melbourne VIC 3000"
                />
                {validationErrors.location && (
                  <span className="field-error">{validationErrors.location}</span>
                )}
              </div>

              <div className="form-group">
                <label htmlFor="suburb">
                  Suburb *
                  <Tooltip content="Suburb where the project is located">
                    <span className="help-icon">?</span>
                  </Tooltip>
                </label>
                <input
                  type="text"
                  id="suburb"
                  value={formData.suburb}
                  onChange={(e) => setFormData({ ...formData, suburb: e.target.value })}
                  required
                  className={`form-input ${validationErrors.suburb ? 'error' : ''}`}
                  placeholder="Melbourne"
                />
                {validationErrors.suburb && (
                  <span className="field-error">{validationErrors.suburb}</span>
                )}
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label htmlFor="property_type">
                  Property Type
                  <Tooltip content="The type of development you're building">
                    <span className="help-icon">?</span>
                  </Tooltip>
                </label>
                <select
                  id="property_type"
                  value={formData.property_type}
                  onChange={(e) => setFormData({ ...formData, property_type: e.target.value })}
                  className="form-select"
                >
                  {PROPERTY_TYPES.map(type => (
                    <option key={type} value={type}>{type}</option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label htmlFor="development_stage">
                  Development Stage
                  <Tooltip content="Current stage of your development project">
                    <span className="help-icon">?</span>
                  </Tooltip>
                </label>
                <select
                  id="development_stage"
                  value={formData.development_stage}
                  onChange={(e) => setFormData({ ...formData, development_stage: e.target.value })}
                  className="form-select"
                >
                  {DEVELOPMENT_STAGES.map(stage => (
                    <option key={stage} value={stage}>{stage}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="loan_amount">
                Loan Amount Required (AUD) *
                <Tooltip content="Total funding amount you're seeking from lenders">
                  <span className="help-icon">?</span>
                </Tooltip>
              </label>
              <NumberInput
                id="loan_amount"
                value={formData.loan_amount}
                onChange={(value) => setFormData({ ...formData, loan_amount: value })}
                placeholder="5,000,000"
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
                <label htmlFor="interest_rate">
                  Target Interest Rate (%)
                  <Tooltip content="Expected annual interest rate (typically 8-15% for development finance)">
                    <span className="help-icon">?</span>
                  </Tooltip>
                </label>
                <NumberInput
                  id="interest_rate"
                  value={formData.interest_rate}
                  onChange={(value) => setFormData({ ...formData, interest_rate: value })}
                  placeholder="10.5"
                  suffix="%"
                  min={0}
                  max={50}
                  step={0.1}
                  className={validationErrors.interest_rate ? 'error' : ''}
                />
                {validationErrors.interest_rate && (
                  <span className="field-error">{validationErrors.interest_rate}</span>
                )}
              </div>

              <div className="form-group">
                <label htmlFor="loan_term">
                  Loan Term (months)
                  <Tooltip content="Duration of the loan in months (typically 12-36 months)">
                    <span className="help-icon">?</span>
                  </Tooltip>
                </label>
                <NumberInput
                  id="loan_term"
                  value={formData.loan_term}
                  onChange={(value) => setFormData({ ...formData, loan_term: value })}
                  placeholder="24"
                  suffix="months"
                  min={1}
                  max={120}
                  className={validationErrors.loan_term ? 'error' : ''}
                />
                {validationErrors.loan_term && (
                  <span className="field-error">{validationErrors.loan_term}</span>
                )}
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
                <label htmlFor="total_project_cost">
                  Total Project Cost (AUD) *
                  <Tooltip content="Total cost including land, construction, and all other expenses">
                    <span className="help-icon">?</span>
                  </Tooltip>
                </label>
                <NumberInput
                  id="total_project_cost"
                  value={formData.total_project_cost}
                  onChange={(value) => setFormData({ ...formData, total_project_cost: value })}
                  placeholder="10,000,000"
                  prefix="$"
                  min={1}
                  className={validationErrors.total_project_cost ? 'error' : ''}
                />
                {validationErrors.total_project_cost && (
                  <span className="field-error">{validationErrors.total_project_cost}</span>
                )}
              </div>

              <div className="form-group">
                <label htmlFor="equity_contribution">
                  Equity Contribution (AUD) *
                  <Tooltip content="Your cash contribution to the project (minimum 10-30% typically required)">
                    <span className="help-icon">?</span>
                  </Tooltip>
                </label>
                <NumberInput
                  id="equity_contribution"
                  value={formData.equity_contribution}
                  onChange={(value) => setFormData({ ...formData, equity_contribution: value })}
                  placeholder="3,000,000"
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
                <label htmlFor="land_value">
                  Land Value (AUD)
                  <Tooltip content="Current market value of the land/site">
                    <span className="help-icon">?</span>
                  </Tooltip>
                </label>
                <NumberInput
                  id="land_value"
                  value={formData.land_value}
                  onChange={(value) => setFormData({ ...formData, land_value: value })}
                  placeholder="3,000,000"
                  prefix="$"
                  min={0}
                  className={validationErrors.land_value ? 'error' : ''}
                />
                {validationErrors.land_value && (
                  <span className="field-error">{validationErrors.land_value}</span>
                )}
              </div>

              <div className="form-group">
                <label htmlFor="construction_cost">
                  Construction Cost (AUD)
                  <Tooltip content="Estimated cost for construction and development">
                    <span className="help-icon">?</span>
                  </Tooltip>
                </label>
                <NumberInput
                  id="construction_cost"
                  value={formData.construction_cost}
                  onChange={(value) => setFormData({ ...formData, construction_cost: value })}
                  placeholder="7,000,000"
                  prefix="$"
                  min={0}
                />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label htmlFor="expected_gdc">
                  Expected GDC (AUD)
                  <Tooltip content="Gross Development Cost - total project cost including all fees">
                    <span className="help-icon">?</span>
                  </Tooltip>
                </label>
                <NumberInput
                  id="expected_gdc"
                  value={formData.expected_gdc}
                  onChange={(value) => setFormData({ ...formData, expected_gdc: value })}
                  placeholder="11,000,000"
                  prefix="$"
                  min={0}
                />
              </div>

              <div className="form-group">
                <label htmlFor="expected_profit">
                  Expected Profit (AUD)
                  <Tooltip content="Projected profit after all costs (aim for 20%+ margin)">
                    <span className="help-icon">?</span>
                  </Tooltip>
                </label>
                <NumberInput
                  id="expected_profit"
                  value={formData.expected_profit}
                  onChange={(value) => setFormData({ ...formData, expected_profit: value })}
                  placeholder="2,500,000"
                  prefix="$"
                  min={0}
                />
              </div>
            </div>

            {/* Financial Metrics */}
            <div className="financial-metrics">
              <h4>Key Financial Metrics</h4>
              <div className="metrics-grid">
                <div className="metric-item">
                  <label>LVR (Loan to Value Ratio)</label>
                  <div className="metric-value">{calculateLVR() || 'N/A'}%</div>
                  <Tooltip content="Loan amount as percentage of land value. Most lenders require LVR under 80%">
                    <span className="help-icon">?</span>
                  </Tooltip>
                </div>
                <div className="metric-item">
                  <label>ICR (Interest Coverage Ratio)</label>
                  <div className="metric-value">{calculateICR() || 'N/A'}</div>
                  <Tooltip content="Ability to service interest from project profits. Should be above 1.5x">
                    <span className="help-icon">?</span>
                  </Tooltip>
                </div>
                <div className="metric-item">
                  <label>Debt/Equity Ratio</label>
                  <div className="metric-value">
                    {formData.loan_amount && formData.equity_contribution 
                      ? (parseInt(formData.loan_amount) / parseInt(formData.equity_contribution)).toFixed(2)
                      : 'N/A'}
                  </div>
                  <Tooltip content="Loan amount divided by equity. Lower ratios indicate less risk">
                    <span className="help-icon">?</span>
                  </Tooltip>
                </div>
                <div className="metric-item">
                  <label>Profit Margin</label>
                  <div className="metric-value">
                    {formData.expected_profit && formData.total_project_cost
                      ? ((parseInt(formData.expected_profit) / parseInt(formData.total_project_cost)) * 100).toFixed(1)
                      : 'N/A'}%
                  </div>
                  <Tooltip content="Profit as percentage of total cost. Aim for 20%+ for viable projects">
                    <span className="help-icon">?</span>
                  </Tooltip>
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
                <label htmlFor="project_size_sqm">
                  Project Size (sqm)
                  <Tooltip content="Total site area in square meters">
                    <span className="help-icon">?</span>
                  </Tooltip>
                </label>
                <NumberInput
                  id="project_size_sqm"
                  value={formData.project_size_sqm}
                  onChange={(value) => setFormData({ ...formData, project_size_sqm: value })}
                  placeholder="5,000"
                  suffix="sqm"
                  min={0}
                />
              </div>

              <div className="form-group">
                <label htmlFor="number_of_units">
                  Number of Units
                  <Tooltip content="Total number of apartments/units in the development">
                    <span className="help-icon">?</span>
                  </Tooltip>
                </label>
                <NumberInput
                  id="number_of_units"
                  value={formData.number_of_units}
                  onChange={(value) => setFormData({ ...formData, number_of_units: value })}
                  placeholder="50"
                  min={0}
                />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label htmlFor="number_of_levels">
                  Number of Levels
                  <Tooltip content="Total floors/levels in the development">
                    <span className="help-icon">?</span>
                  </Tooltip>
                </label>
                <NumberInput
                  id="number_of_levels"
                  value={formData.number_of_levels}
                  onChange={(value) => setFormData({ ...formData, number_of_levels: value })}
                  placeholder="10"
                  min={0}
                />
              </div>

              <div className="form-group">
                <label htmlFor="car_spaces">
                  Car Spaces
                  <Tooltip content="Total parking spaces in the development">
                    <span className="help-icon">?</span>
                  </Tooltip>
                </label>
                <NumberInput
                  id="car_spaces"
                  value={formData.car_spaces}
                  onChange={(value) => setFormData({ ...formData, car_spaces: value })}
                  placeholder="75"
                  min={0}
                />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label htmlFor="zoning">
                  Zoning
                  <Tooltip content="Current zoning designation for the site">
                    <span className="help-icon">?</span>
                  </Tooltip>
                </label>
                <input
                  type="text"
                  id="zoning"
                  value={formData.zoning}
                  onChange={(e) => setFormData({ ...formData, zoning: e.target.value })}
                  className="form-input"
                  placeholder="e.g., R3 Medium Density"
                />
              </div>

              <div className="form-group">
                <label htmlFor="planning_permit_status">
                  Planning Permit Status
                  <Tooltip content="Current status of planning/development approvals">
                    <span className="help-icon">?</span>
                  </Tooltip>
                </label>
                <select
                  id="planning_permit_status"
                  value={formData.planning_permit_status}
                  onChange={(e) => setFormData({ ...formData, planning_permit_status: e.target.value })}
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
                <label htmlFor="expected_start_date">
                  Expected Start Date
                  <Tooltip content="When you expect to commence construction">
                    <span className="help-icon">?</span>
                  </Tooltip>
                </label>
                <input
                  type="date"
                  id="expected_start_date"
                  value={formData.expected_start_date}
                  onChange={(e) => setFormData({ ...formData, expected_start_date: e.target.value })}
                  className={`form-input ${validationErrors.expected_start_date ? 'error' : ''}`}
                />
              </div>

              <div className="form-group">
                <label htmlFor="expected_completion_date">
                  Expected Completion Date
                  <Tooltip content="Anticipated project completion date">
                    <span className="help-icon">?</span>
                  </Tooltip>
                </label>
                <input
                  type="date"
                  id="expected_completion_date"
                  value={formData.expected_completion_date}
                  onChange={(e) => setFormData({ ...formData, expected_completion_date: e.target.value })}
                  className={`form-input ${validationErrors.expected_completion_date ? 'error' : ''}`}
                />
                {validationErrors.expected_completion_date && (
                  <span className="field-error">{validationErrors.expected_completion_date}</span>
                )}
              </div>
            </div>

            <div className="form-section">
              <h4>Risk Assessment</h4>
              <div className="risk-assessment-grid">
                <div className="form-group">
                  <label htmlFor="market_risk_rating">
                    Market Risk
                    <Tooltip content="Risk from market conditions, demand, and competition">
                      <span className="help-icon">?</span>
                    </Tooltip>
                  </label>
                  <select
                    id="market_risk_rating"
                    value={formData.market_risk_rating}
                    onChange={(e) => setFormData({ ...formData, market_risk_rating: e.target.value })}
                    className="form-select"
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                  </select>
                </div>

                <div className="form-group">
                  <label htmlFor="construction_risk_rating">
                    Construction Risk
                    <Tooltip content="Risk from construction complexity, builder experience, and site conditions">
                      <span className="help-icon">?</span>
                    </Tooltip>
                  </label>
                  <select
                    id="construction_risk_rating"
                    value={formData.construction_risk_rating}
                    onChange={(e) => setFormData({ ...formData, construction_risk_rating: e.target.value })}
                    className="form-select"
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                  </select>
                </div>

                <div className="form-group">
                  <label htmlFor="location_risk_rating">
                    Location Risk
                    <Tooltip content="Risk from location factors like infrastructure, amenities, and growth potential">
                      <span className="help-icon">?</span>
                    </Tooltip>
                  </label>
                  <select
                    id="location_risk_rating"
                    value={formData.location_risk_rating}
                    onChange={(e) => setFormData({ ...formData, location_risk_rating: e.target.value })}
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
            <h3>Document Upload</h3>
            <p className="section-description">
              Upload relevant documents to support your project. Required documents are marked with an asterisk (*).
            </p>
            
            <div className="documents-grid">
              {requiredDocs.required_documents?.map((docType) => (
                <div key={docType} className="document-upload-item">
                  <div className="document-header">
                    <label htmlFor={`doc-${docType}`}>
                      {requiredDocs.descriptions?.[docType] || docType.replace(/_/g, ' ')} *
                      <Tooltip content={`This document is required for project approval`}>
                        <span className="help-icon">?</span>
                      </Tooltip>
                    </label>
                    {documents.find(d => d.type === docType) && (
                      <span className="uploaded-badge">✓ Uploaded</span>
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
                    
                    {documents.find(d => d.type === docType) ? (
                      <div className="uploaded-file">
                        <span className="file-name">{documents.find(d => d.type === docType).name}</span>
                        <button
                          type="button"
                          onClick={() => removeDocument(docType)}
                          className="btn btn-sm btn-danger"
                        >
                          Remove
                        </button>
                      </div>
                    ) : (
                      <label htmlFor={`doc-${docType}`} className="btn btn-outline upload-btn">
                        Choose File
                      </label>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div className="optional-documents">
              <h4>Additional Documents (Optional)</h4>
              <div className="document-upload-item">
                <input
                  type="file"
                  multiple
                  onChange={(e) => {
                    const files = Array.from(e.target.files);
                    files.forEach((file, index) => {
                      handleDocumentChange({ target: { files: [file] } }, `other_${Date.now()}_${index}`);
                    });
                  }}
                  accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png"
                  className="form-input"
                />
                <div className="field-help">
                  You can upload additional supporting documents here (max 50MB per file)
                </div>
              </div>
            </div>

            <InfoMessage message="You can upload documents later if needed. Your project will be saved as a draft until all required documents are uploaded and payment is made." />
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="create-project">
      <div className="create-project-header">
        <h1>Create New Project</h1>
        <p>List your property development project for private credit funding</p>
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
          <div className="actions-left">
            <button 
              type="button" 
              onClick={() => {
                localStorage.setItem('project_draft', JSON.stringify(formData));
                addNotification({
                  type: 'success',
                  title: 'Draft Saved',
                  message: 'Your project has been saved as a draft'
                });
              }}
              className="btn btn-outline"
            >
              Save Draft
            </button>
          </div>

          <div className="actions-right">
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
                disabled={loading || uploadingDocs}
                className="btn btn-primary"
              >
                {loading ? 'Creating Project...' : 'Create Project'}
              </button>
            )}
          </div>
        </div>
      </form>
    </div>
  );
};

export default CreateProject;