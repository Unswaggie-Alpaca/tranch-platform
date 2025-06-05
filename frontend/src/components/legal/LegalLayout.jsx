// components/legal/LegalLayout.jsx

import React, { useEffect } from 'react';
import { Link } from 'react-router-dom';

const LegalLayout = ({ title, lastUpdated, children }) => {
  useEffect(() => {
    // Scroll to top when page loads
    window.scrollTo(0, 0);
  }, []);

  return (
    <div className="legal-page">
      <nav className="legal-nav">
        <div className="nav-container">
          <Link to="/" className="nav-logo">
            <span className="logo-text">Tranch</span>
          </Link>
          <div className="nav-links">
            <Link to="/privacy" className="nav-link">Privacy</Link>
            <Link to="/terms" className="nav-link">Terms</Link>
            <Link to="/cookies" className="nav-link">Cookies</Link>
            <Link to="/login" className="btn btn-outline">Sign In</Link>
          </div>
        </div>
      </nav>

      <div className="legal-content">
        <div className="container">
          <div className="legal-header">
            <h1>{title}</h1>
            <p className="last-updated">Last updated: {lastUpdated}</p>
          </div>
          
          <div className="legal-toc">
            <h3>Table of Contents</h3>
            <nav className="toc-nav">
              {React.Children.map(children, (child, index) => {
                if (child?.type === 'section' && child.props.children[0]?.type === 'h2') {
                  const heading = child.props.children[0].props.children;
                  const id = `section-${index + 1}`;
                  return (
                    <a href={`#${id}`} className="toc-link">
                      {heading}
                    </a>
                  );
                }
                return null;
              })}
            </nav>
          </div>
          
          <div className="legal-body">
            {React.Children.map(children, (child, index) => {
              if (child?.type === 'section') {
                return React.cloneElement(child, {
                  id: `section-${index + 1}`
                });
              }
              return child;
            })}
          </div>
          
          <div className="legal-footer">
            <p>
              Have questions about our {title.toLowerCase()}? 
              Contact us at <a href="mailto:legal@tranch.com.au">legal@tranch.com.au</a>
            </p>
            <Link to="/" className="btn btn-outline">
              Back to Home
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LegalLayout;