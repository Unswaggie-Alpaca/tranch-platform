// components/landing/Footer.jsx

import React from 'react';
import { Link } from 'react-router-dom';

const Footer = () => {
  return (
    <footer className="landing-footer">
      <div className="container">
        <div className="footer-content">
          <div className="footer-brand">
            <span className="logo-text">Tranch</span>
            <p>Connecting property developers with private credit</p>
          </div>
          <div className="footer-links">
            <h4>Platform</h4>
            <a href="#features">Features</a>
            <a href="#pricing">Pricing</a>
            <a href="#how-it-works">How it Works</a>
          </div>
          <div className="footer-links">
            <h4>Company</h4>
            <a href="#">About</a>
            <a href="#">Contact</a>
            <Link to="/privacy">Privacy Policy</Link>
            <Link to="/terms">Terms of Service</Link>
            <Link to="/cookies">Cookie Policy</Link>
          </div>
          <div className="footer-contact">
            <h4>Get in Touch</h4>
            <p>support@tranch.com.au</p>
            <p>1300 TRANCH</p>
          </div>
        </div>
        <div className="footer-bottom">
          <p>&copy; 2025 Tranch. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;