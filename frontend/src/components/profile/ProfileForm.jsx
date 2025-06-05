// components/profile/ProfileForm.jsx

import React from 'react';
import { NumberInput } from '../common';
import { formatCurrency } from '../../utils/formatters';

const ProfileForm = ({ profile, editing, onChange }) => {
  if (!profile) return null;

  return (
    <div className="profile-form">
      <div className="profile-section">
        <h3>Basic Information</h3>
        <div className="profile-fields">
          <div className="field-group">
            <label>Full Name</label>
            {editing ? (
              <input
                type="text"
                value={profile.name || ''}
                onChange={(e) => onChange({ ...profile, name: e.target.value })}
                className="form-input"
                placeholder="Enter your full name"
              />
            ) : (
              <p>{profile.name || 'Not provided'}</p>
            )}
          </div>
          
          <div className="field-group">
            <label>Email</label>
            <p>{profile.email}</p>
          </div>
          
          <div className="field-group">
            <label>Phone Number</label>
            {editing ? (
              <input
                type="tel"
                value={profile.phone || ''}
                onChange={(e) => onChange({ ...profile, phone: e.target.value })}
                className="form-input"
                placeholder="+61 400 000 000"
              />
            ) : (
              <p>{profile.phone || 'Not provided'}</p>
            )}
          </div>
          
          <div className="field-group">
            <label>Role</label>
            <p className="role-badge">{profile.role}</p>
          </div>
        </div>
      </div>

      {profile.role === 'funder' && (
        <>
          <div className="profile-section">
            <h3>Company Information</h3>
            <div className="profile-fields">
              <div className="field-group">
                <label>Company Name</label>
                {editing ? (
                  <input
                    type="text"
                    value={profile.company_name || ''}
                    onChange={(e) => onChange({ ...profile, company_name: e.target.value })}
                    className="form-input"
                    placeholder="Your company name"
                  />
                ) : (
                  <p>{profile.company_name || 'Not provided'}</p>
                )}
              </div>
              
              <div className="field-group">
                <label>ABN</label>
                {editing ? (
                  <input
                    type="text"
                    value={profile.abn || ''}
                    onChange={(e) => onChange({ ...profile, abn: e.target.value })}
                    className="form-input"
                    placeholder="12 345 678 901"
                    maxLength="14"
                  />
                ) : (
                  <p>{profile.abn || 'Not provided'}</p>
                )}
              </div>
              
              <div className="field-group">
                <label>Company Type</label>
                {editing ? (
                  <select
                    value={profile.company_type || ''}
                    onChange={(e) => onChange({ ...profile, company_type: e.target.value })}
                    className="form-select"
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
                ) : (
                  <p>{profile.company_type || 'Not provided'}</p>
                )}
              </div>
              
              <div className="field-group">
                <label>Years of Experience</label>
                {editing ? (
                  <NumberInput
                    value={profile.years_experience || ''}
                    onChange={(value) => onChange({ ...profile, years_experience: value })}
                    placeholder="10"
                    min={0}
                    max={100}
                  />
                ) : (
                  <p>{profile.years_experience ? `${profile.years_experience} years` : 'Not provided'}</p>
                )}
              </div>
            </div>
          </div>

          <div className="profile-section">
            <h3>Investment Profile</h3>
            <div className="profile-fields">
              <div className="field-group">
                <label>Investment Focus</label>
                {editing ? (
                  <select
                    value={profile.investment_focus || ''}
                    onChange={(e) => onChange({ ...profile, investment_focus: e.target.value })}
                    className="form-select"
                  >
                    <option value="">Select investment focus</option>
                    <option value="Residential Development">Residential Development</option>
                    <option value="Commercial Development">Commercial Development</option>
                    <option value="Mixed-Use Development">Mixed-Use Development</option>
                    <option value="Industrial Development">Industrial Development</option>
                    <option value="All Property Types">All Property Types</option>
                  </select>
                ) : (
                  <p>{profile.investment_focus || 'Not provided'}</p>
                )}
              </div>
              
              <div className="field-group">
                <label>Deal Size Range</label>
                {editing ? (
                  <div className="range-inputs">
                    <NumberInput
                      value={profile.typical_deal_size_min || ''}
                      onChange={(value) => onChange({ ...profile, typical_deal_size_min: value })}
                      prefix="$"
                      placeholder="Min"
                      min={0}
                    />
                    <span className="range-separator">to</span>
                    <NumberInput
                      value={profile.typical_deal_size_max || ''}
                      onChange={(value) => onChange({ ...profile, typical_deal_size_max: value })}
                      prefix="$"
                      placeholder="Max"
                      min={0}
                    />
                  </div>
                ) : (
                  <p>
                    {profile.typical_deal_size_min && profile.typical_deal_size_max
                      ? `${formatCurrency(profile.typical_deal_size_min)} - ${formatCurrency(profile.typical_deal_size_max)}`
                      : 'Not provided'}
                  </p>
                )}
              </div>
              
              <div className="field-group">
                <label>Assets Under Management</label>
                {editing ? (
                  <NumberInput
                    value={profile.aum || ''}
                    onChange={(value) => onChange({ ...profile, aum: value })}
                    prefix="$"
                    placeholder="100,000,000"
                    min={0}
                  />
                ) : (
                  <p>{profile.aum ? formatCurrency(profile.aum) : 'Not provided'}</p>
                )}
              </div>
              
              <div className="field-group">
                <label>LinkedIn Profile</label>
                {editing ? (
                  <input
                    type="url"
                    value={profile.linkedin || ''}
                    onChange={(e) => onChange({ ...profile, linkedin: e.target.value })}
                    className="form-input"
                    placeholder="https://linkedin.com/in/yourprofile"
                  />
                ) : (
                  profile.linkedin ? (
                    <a href={profile.linkedin} target="_blank" rel="noopener noreferrer" className="profile-link">
                      View LinkedIn Profile
                    </a>
                  ) : (
                    <p>Not provided</p>
                  )
                )}
              </div>
            </div>
          </div>

          <div className="profile-section">
            <h3>Professional Bio</h3>
            <div className="profile-fields">
              <div className="field-group full-width">
                {editing ? (
                  <>
                    <textarea
                      value={profile.bio || ''}
                      onChange={(e) => onChange({ ...profile, bio: e.target.value })}
                      className="form-textarea"
                      placeholder="Brief professional background and investment philosophy..."
                      rows="4"
                      maxLength="500"
                    />
                    <div className="character-count">{(profile.bio || '').length}/500</div>
                  </>
                ) : (
                  <p className="bio-text">{profile.bio || 'No bio provided'}</p>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default ProfileForm;