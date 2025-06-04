import React, { useState, useEffect } from "react";
import { useUser } from "@clerk/clerk-react";
import { Link, useNavigate } from "react-router-dom";
import { useApp } from "../contexts";
import { useApi } from "../hooks";
import { NumberInput } from "../components";
import { Tooltip } from "../App";
import { validatePhone, validateABN } from "../utils";

const Onboarding = () => {
  const { user: clerkUser } = useUser();
  const { refreshUser } = useApp();
  const navigate = useNavigate();
  const api = useApi();
  const [step, setStep] = useState('role');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [formData, setFormData] = useState({
    role: '',
    // Funder profile fields
    company_name: '',
    company_type: '',
    investment_focus: '',
    typical_deal_size_min: '',
    typical_deal_size_max: '',
    years_experience: '',
    aum: '',
    phone: '',
    linkedin: '',
    bio: '',
    abn: ''
  });

  const handleRoleSelection = async (role) => {
    setLoading(true);
    setError('');
    
    try {
      await api.setUserRole(role);
      
      if (role === 'borrower') {
        await refreshUser();
        navigate('/dashboard');
      } else {
        setFormData({ ...formData, role });
        setStep('profile');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const validateProfile = () => {
    const errors = [];
    
    if (!formData.company_name) errors.push('Company name is required');
    if (!formData.company_type) errors.push('Company type is required');
    if (!formData.investment_focus) errors.push('Investment focus is required');
    if (!formData.typical_deal_size_min) errors.push('Minimum deal size is required');
    if (!formData.typical_deal_size_max) errors.push('Maximum deal size is required');
    if (!formData.years_experience) errors.push('Years of experience is required');
    if (!formData.phone) errors.push('Phone number is required');
    if (!formData.abn) errors.push('ABN is required');
    
    if (!validatePhone(formData.phone)) errors.push('Invalid phone number format');
    if (!validateABN(formData.abn)) errors.push('Invalid ABN format');
    
    if (parseInt(formData.typical_deal_size_min) >= parseInt(formData.typical_deal_size_max)) {
      errors.push('Maximum deal size must be greater than minimum');
    }
    
    return errors;
  };

  const handleProfileSubmit = async (e) => {
    e.preventDefault();
    
    const errors = validateProfile();
    if (errors.length > 0) {
      setError(errors.join(', '));
      return;
    }
    
    setLoading(true);
    setError('');

    try {
      await api.completeProfile({
        ...formData,
        typical_deal_size_min: parseInt(formData.typical_deal_size_min),
        typical_deal_size_max: parseInt(formData.typical_deal_size_max),
        years_experience: parseInt(formData.years_experience),
        aum: formData.aum ? parseInt(formData.aum) : null
      });
      await refreshUser();
      setStep('complete');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (step === 'role') {
    return (
      <div className="onboarding-container">
        <div className="onboarding-card">
          <h1>Welcome to Tranch</h1>
          <p>Let's get you set up. Are you a property developer or an investor?</p>
          
          {error && <ErrorMessage message={error} onClose={() => setError('')} />}
          
          <div className="role-selection">
            <button 
              className="role-card"
              onClick={() => handleRoleSelection('borrower')}
              disabled={loading}
            >
              <div className="role-icon">🏗</div>
              <h3>I'm a Developer</h3>
              <p>I need funding for property development projects</p>
            </button>
            
            <button 
              className="role-card"
              onClick={() => handleRoleSelection('funder')}
              disabled={loading}
            >
              <div className="role-icon">💰</div>
              <h3>I'm an Investor</h3>
              <p>I want to invest in property development projects</p>
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (step === 'profile') {
    return (
      <div className="onboarding-container">
        <div className="onboarding-card wide">
          <h1>Complete Your Investor Profile</h1>
          <p>This information helps developers understand your investment criteria</p>
          
          {error && <ErrorMessage message={error} onClose={() => setError('')} />}
          
          <form onSubmit={handleProfileSubmit} className="onboarding-form">
            <div className="form-section">
              <h3>Company Information</h3>
              
              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="company_name">
                    Company Name *
                    <Tooltip content="Your registered business name">
                      <span className="help-icon">?</span>
                    </Tooltip>
                  </label>
                  <input
                    type="text"
                    id="company_name"
                    value={formData.company_name}
                    onChange={(e) => setFormData({ ...formData, company_name: e.target.value })}
                    required
                    className="form-input"
                    placeholder="ABC Capital Partners"
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="abn">
                    ABN *
                    <Tooltip content="11-digit Australian Business Number">
                      <span className="help-icon">?</span>
                    </Tooltip>
                  </label>
                  <input
                    type="text"
                    id="abn"
                    value={formData.abn}
                    onChange={(e) => setFormData({ ...formData, abn: e.target.value })}
                    required
                    className="form-input"
                    placeholder="12 345 678 901"
                    maxLength="14"
                  />
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="company_type">
                    Company Type *
                    <Tooltip content="Select the category that best describes your organization">
                      <span className="help-icon">?</span>
                    </Tooltip>
                  </label>
                  <select
                    id="company_type"
                    value={formData.company_type}
                    onChange={(e) => setFormData({ ...formData, company_type: e.target.value })}
                    className="form-select"
                    required
                  >
                    <option value="">Select company type</option>
                    <option value="Private Credit Fund">Private Credit Fund</option>
                    <option value="Investment Bank">Investment Bank</option>
                    <option value="Family Office">Family Office</option>
                    <option value="Hedge Fund">Hedge Fund</option>
                    <option value="Real Estate Fund">Real Estate Fund</option>
                    <option value="High Net Worth Individual">High Net Worth Individual</option>
                    <option value="Other">Other</option>
                  </select>
                </div>

                <div className="form-group">
                  <label htmlFor="years_experience">
                    Years Experience *
                    <Tooltip content="Years of experience in property investment">
                      <span className="help-icon">?</span>
                    </Tooltip>
                  </label>
                  <NumberInput
                    id="years_experience"
                    value={formData.years_experience}
                    onChange={(value) => setFormData({ ...formData, years_experience: value })}
                    placeholder="10"
                    min={0}
                    max={100}
                  />
                </div>
              </div>
            </div>

            <div className="form-section">
              <h3>Investment Profile</h3>
              
              <div className="form-group">
                <label htmlFor="investment_focus">
                  Investment Focus *
                  <Tooltip content="Primary property types you invest in">
                    <span className="help-icon">?</span>
                  </Tooltip>
                </label>
                <select
                  id="investment_focus"
                  value={formData.investment_focus}
                  onChange={(e) => setFormData({ ...formData, investment_focus: e.target.value })}
                  className="form-select"
                  required
                >
                  <option value="">Select investment focus</option>
                  <option value="Residential Development">Residential Development</option>
                  <option value="Commercial Development">Commercial Development</option>
                  <option value="Mixed-Use Development">Mixed-Use Development</option>
                  <option value="Industrial Development">Industrial Development</option>
                  <option value="All Property Types">All Property Types</option>
                </select>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="typical_deal_size_min">
                    Min Deal Size (AUD) *
                    <Tooltip content="Minimum investment amount per deal">
                      <span className="help-icon">?</span>
                    </Tooltip>
                  </label>
                  <NumberInput
                    id="typical_deal_size_min"
                    value={formData.typical_deal_size_min}
                    onChange={(value) => setFormData({ ...formData, typical_deal_size_min: value })}
                    placeholder="1,000,000"
                    prefix="$"
                    min={1}
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="typical_deal_size_max">
                    Max Deal Size (AUD) *
                    <Tooltip content="Maximum investment amount per deal">
                      <span className="help-icon">?</span>
                    </Tooltip>
                  </label>
                  <NumberInput
                    id="typical_deal_size_max"
                    value={formData.typical_deal_size_max}
                    onChange={(value) => setFormData({ ...formData, typical_deal_size_max: value })}
                    placeholder="50,000,000"
                    prefix="$"
                    min={1}
                  />
                </div>
              </div>

              <div className="form-group">
                <label htmlFor="aum">
                  Assets Under Management (AUD)
                  <Tooltip content="Total assets your organization manages (optional)">
                    <span className="help-icon">?</span>
                  </Tooltip>
                </label>
                <NumberInput
                  id="aum"
                  value={formData.aum}
                  onChange={(value) => setFormData({ ...formData, aum: value })}
                  placeholder="100,000,000"
                  prefix="$"
                  min={0}
                />
              </div>
            </div>

            <div className="form-section">
              <h3>Contact Information</h3>
              
              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="phone">
                    Phone Number *
                    <Tooltip content="Australian mobile or landline">
                      <span className="help-icon">?</span>
                    </Tooltip>
                  </label>
                  <input
                    type="tel"
                    id="phone"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    required
                    className="form-input"
                    placeholder="+61 400 000 000"
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="linkedin">
                    LinkedIn Profile
                    <Tooltip content="Your professional LinkedIn URL (optional)">
                      <span className="help-icon">?</span>
                    </Tooltip>
                  </label>
                  <input
                    type="url"
                    id="linkedin"
                    value={formData.linkedin}
                    onChange={(e) => setFormData({ ...formData, linkedin: e.target.value })}
                    className="form-input"
                    placeholder="https://linkedin.com/in/yourprofile"
                  />
                </div>
              </div>

              <div className="form-group">
                <label htmlFor="bio">
                  Professional Bio
                  <Tooltip content="Brief description of your investment philosophy and experience">
                    <span className="help-icon">?</span>
                  </Tooltip>
                </label>
                <textarea
                  id="bio"
                  value={formData.bio}
                  onChange={(e) => setFormData({ ...formData, bio: e.target.value })}
                  className="form-textarea"
                  placeholder="Brief professional background and investment philosophy..."
                  rows="4"
                  maxLength="500"
                />
                <div className="character-count">{formData.bio.length}/500</div>
              </div>
            </div>

            <button type="submit" disabled={loading} className="btn btn-primary btn-block">
              {loading ? 'Submitting...' : 'Complete Profile'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  if (step === 'complete') {
    return (
      <div className="onboarding-container">
        <div className="onboarding-card">
          <div className="success-icon">✓</div>
          <h1>Profile Submitted!</h1>
          <p>Your profile is under review. We'll notify you once approved (usually within 24 hours).</p>
          <button onClick={() => navigate('/dashboard')} className="btn btn-primary">
            Go to Dashboard
          </button>
        </div>
      </div>
    );
  }
};

// ===========================
// DASHBOARD
// ===========================


export default Onboarding;
