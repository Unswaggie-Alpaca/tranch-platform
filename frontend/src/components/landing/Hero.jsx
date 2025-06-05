// components/landing/Hero.jsx

import React from 'react';
import { Link } from 'react-router-dom';

const Hero = () => {
  return (
    <section className="hero-section">
      <div className="hero-container">
        <div className="hero-content">
          <h1 className="hero-title">
            Connect Your Development<br />
            <span className="gradient-text">With The Right Capital</span>
          </h1>
          <p className="hero-subtitle">
            Tranch is Australia's premier marketplace connecting property developers 
            with private credit funders. Streamline your funding process with our 
            secure platform and intelligent matching system.
          </p>
          <div className="hero-actions">
            <Link to="/register" className="btn btn-primary btn-lg">
              Start Your Project
            </Link>
            <Link to="/register?role=funder" className="btn btn-outline btn-lg">
              Become a Funder
            </Link>
          </div>
          <div className="hero-stats">
            <div className="stat">
              <span className="stat-value">$100M+</span>
              <span className="stat-label">Projects Listed</span>
            </div>
            <div className="stat">
              <span className="stat-value">50+</span>
              <span className="stat-label">Active Funders</span>
            </div>
            <div className="stat">
              <span className="stat-value">24-48hrs</span>
              <span className="stat-label">Approval Time</span>
            </div>
          </div>
        </div>
        <div className="hero-visual">
          <div className="floating-card card-1">
            <h4>Luxury Apartments</h4>
            <p>Brisbane CBD</p>
            <span className="amount">$5.2M</span>
          </div>
          <div className="floating-card card-2">
            <h4>Mixed Use Development</h4>
            <p>Gold Coast</p>
            <span className="amount">$8.7M</span>
          </div>
          <div className="floating-card card-3">
            <h4>Townhouse Project</h4>
            <p>Sunshine Coast</p>
            <span className="amount">$3.4M</span>
          </div>
        </div>
      </div>
    </section>
  );
};

export default Hero;