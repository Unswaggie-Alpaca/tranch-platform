// components/landing/HowItWorks.jsx

import React from 'react';
import { Link } from 'react-router-dom';

const HowItWorks = () => {
  return (
    <section id="how-it-works" className="how-it-works">
      <div className="container">
        <div className="section-header">
          <h2 className="section-title">How Tranch Streamlines Property Finance</h2>
          <p className="section-subtitle">
            The intelligent marketplace connecting property developers with private credit funders
          </p>
        </div>

        <div id="pricing" style={{ position: 'absolute', top: '-80px' }}></div>

        {/* Value Props */}
        <div className="value-props">
          <div className="value-prop">
            <div className="value-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
              </svg>
            </div>
            <h4>Rapid Execution</h4>
            <p>Connect with funders in days, not months</p>
          </div>
          <div className="value-prop">
            <div className="value-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10"></circle>
                <path d="M12 6v6l4 2"></path>
              </svg>
            </div>
            <h4>Real-Time Intelligence</h4>
            <p>BrokerAI analyzes deals and provides instant insights</p>
          </div>
          <div className="value-prop">
            <div className="value-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 2L2 7l10 5 10-5-10-5z"></path>
                <path d="M2 17l10 5 10-5"></path>
                <path d="M2 12l10 5 10-5"></path>
              </svg>
            </div>
            <h4>Complete Transparency</h4>
            <p>Track every interaction and document exchange</p>
          </div>
        </div>

        {/* Split Paths */}
        <div className="user-journeys">
          {/* Developer Journey */}
          <div className="journey-path developer-path">
            <div className="journey-header">
              <h3>For Property Developers</h3>
              <p>Access capital markets with unprecedented efficiency</p>
            </div>
            
            <div className="journey-steps">
              <div className="journey-step">
                <div className="step-number">01</div>
                <div className="step-content">
                  <h4>Upload Project Documentation</h4>
                  <p>Feasibility studies, development applications, financial models - all secured in our institutional-grade vault</p>
                </div>
              </div>
              
              <div className="journey-step">
                <div className="step-number">02</div>
                <div className="step-content">
                  <h4>Gain Market Exposure</h4>
                  <p>Your project becomes visible to our network of verified private credit funds and sophisticated investors</p>
                </div>
              </div>
              
              <div className="journey-step">
                <div className="step-number">03</div>
                <div className="step-content">
                  <h4>Manage Capital Raising</h4>
                  <p>Field inquiries, compare terms, and progress multiple funding conversations simultaneously</p>
                </div>
              </div>

              <div className="journey-feature">
                <div className="feature-highlight">
                  <h5>Powered by BrokerAI</h5>
                  <p>Get instant answers on LVR calculations, feasibility metrics, and market comparables</p>
                </div>
              </div>
            </div>
            
            <div className="journey-cta">
              <Link to="/register" className="btn btn-primary">
                List Your Project
              </Link>
              <span className="price-note">$499 per project listing</span>
            </div>
          </div>

          {/* Funder Journey */}
          <div className="journey-path funder-path">
            <div className="journey-header">
              <h3>For Private Credit Funds</h3>
              <p>Source and analyze deals with institutional-grade tools</p>
            </div>
            
            <div className="journey-steps">
              <div className="journey-step">
                <div className="step-number">01</div>
                <div className="step-content">
                  <h4>Access Curated Deal Flow</h4>
                  <p>Filter opportunities by geography, asset class, deal size, and risk parameters</p>
                </div>
              </div>
              
              <div className="journey-step">
                <div className="step-number">02</div>
                <div className="step-content">
                  <h4>Conduct Due Diligence</h4>
                  <p>Review comprehensive project documentation and financial analysis in our secure data room</p>
                </div>
              </div>
              
              <div className="journey-step">
                <div className="step-number">03</div>
                <div className="step-content">
                  <h4>Execute Efficiently</h4>
                  <p>Communicate terms, negotiate directly, and track deal progression through to close</p>
                </div>
              </div>

              <div className="journey-feature">
                <div className="feature-highlight">
                  <h5>BrokerAI Analytics</h5>
                  <p>Leverage AI to assess project viability, market conditions, and comparative returns</p>
                </div>
              </div>
            </div>
            
            <div className="journey-cta">
              <Link to="/register?role=funder" className="btn btn-primary">
                Access Deal Flow
              </Link>
              <span className="price-note">$299/month professional access</span>
            </div>
          </div>
        </div>

        {/* Journey indicators for mobile */}
        <div className="journey-indicators">
          <span className="indicator-dot active"></span>
          <span className="indicator-dot"></span>
        </div>

        {/* Platform Benefits */}
        <div className="platform-benefits">
          <h3>The Tranch Advantage</h3>
          <div className="benefits-grid">
            <div className="benefit">
              <h4>Institutional-Grade Security</h4>
              <p>Bank-level encryption and secure document management protect sensitive financial information</p>
            </div>
            <div className="benefit">
              <h4>Intelligent Deal Analysis</h4>
              <p>BrokerAI provides 24/7 expert guidance on deal structuring, market analysis, and financial metrics</p>
            </div>
            <div className="benefit">
              <h4>Verified Network</h4>
              <p>All participants undergo comprehensive verification ensuring quality connections</p>
            </div>
            <div className="benefit">
              <h4>Complete Audit Trail</h4>
              <p>Every interaction, document exchange, and communication is tracked for compliance</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default HowItWorks;