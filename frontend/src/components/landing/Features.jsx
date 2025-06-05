// components/landing/Features.jsx

import React from 'react';

const Features = () => {
  return (
    <section id="features" className="problem-solution-section">
      <div className="container">
        <div style={{ textAlign: 'center', width: '100%', marginBottom: '60px' }}>
          <h2 className="section-title" style={{ textAlign: 'center', width: '100%', margin: '0 auto 16px auto' }}>
            The Property Finance Problem
          </h2>
          <p className="section-subtitle" style={{ textAlign: 'center', width: '100%', margin: '0 auto', maxWidth: '800px' }}>
            Traditional funding takes months, lacks transparency, and wastes everyone's time
          </p>
        </div>
        
        {/* Problem Cards */}
        <div className="problem-cards-wrapper">
          <div className="problem-cards">
            <div className="problem-card">
              <div className="problem-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10"></circle>
                  <polyline points="12 6 12 12 16 14"></polyline>
                </svg>
              </div>
              <h3>Months of Delays</h3>
              <p>Developers spend 3-6 months chasing funders through outdated channels</p>
            </div>
            <div className="problem-card">
              <div className="problem-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="11" cy="11" r="8"></circle>
                  <path d="m21 21-4.35-4.35"></path>
                </svg>
              </div>
              <h3>Hidden Networks</h3>
              <p>Quality deals never reach the right funders due to closed networks</p>
            </div>
            <div className="problem-card">
              <div className="problem-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path>
                  <polyline points="22,6 12,13 2,6"></polyline>
                </svg>
              </div>
              <h3>Scattered Communication</h3>
              <p>Critical documents lost in email chains and missed opportunities</p>
            </div>
          </div>
          <div className="swipe-indicator">
            <span className="dot active"></span>
            <span className="dot"></span>
            <span className="dot"></span>
          </div>
        </div>

        {/* Transition */}
        <div className="solution-transition">
          <div className="transition-line"></div>
          <button 
            className="transition-text"
            onClick={() => {
              document.querySelector('.solution-overview').scrollIntoView({ 
                behavior: 'smooth',
                block: 'start'
              });
            }}
            style={{ cursor: 'pointer', border: 'none', background: 'none' }}
          >
            Enter Tranch
          </button>
          <div className="transition-line"></div>
        </div>

        {/* Solution Overview */}
        <div className="solution-overview">
          <h2 className="solution-title">The Intelligent Marketplace</h2>
          <p className="solution-subtitle">
            We've built the infrastructure that property finance has been waiting for
          </p>
          
          <div className="solution-cards-wrapper">
            <div className="solution-cards">
              <div className="solution-card">
                <div className="solution-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
                  </svg>
                </div>
                <h4>Instant Connections</h4>
                <p>Verified funders see your project within 24 hours of listing</p>
              </div>
              <div className="solution-card">
                <div className="solution-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 2L2 7l10 5 10-5-10-5z" />
                    <path d="M2 17l10 5 10-5M2 12l10 5 10-5" />
                  </svg>
                </div>
                <h4>Complete Transparency</h4>
                <p>Track every interaction, document, and decision in one place</p>
              </div>
              <div className="solution-card">
                <div className="solution-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 20h9"></path>
                    <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>
                    <path d="m15 5 3 3"></path>
                  </svg>
                </div>
                <h4>AI-Powered Intelligence</h4>
                <p>BrokerAI analyzes deals and provides instant feasibility insights</p>
              </div>
            </div>
            <div className="swipe-indicator">
              <span className="dot active"></span>
              <span className="dot"></span>
              <span className="dot"></span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default Features;