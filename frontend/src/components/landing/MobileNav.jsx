// components/landing/MobileNav.jsx

import React from 'react';
import { Link } from 'react-router-dom';

const MobileNav = () => {
  return (
    <nav className="mobile-bottom-nav">
      <a href="#" className="nav-item active">
        <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
          <polyline points="9 22 9 12 15 12 15 22" />
        </svg>
        <span className="nav-label">Home</span>
      </a>
      <a href="#features" className="nav-item">
        <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
        </svg>
        <span className="nav-label">Features</span>
      </a>
      <a 
        href="#pricing" 
        className="nav-item"
        onClick={(e) => {
          e.preventDefault();
          const journeySection = document.querySelector('.user-journeys');
          if (journeySection) {
            const offset = 60;
            const targetPosition = journeySection.getBoundingClientRect().top + window.pageYOffset - offset;
            window.scrollTo({
              top: targetPosition,
              behavior: 'smooth'
            });
          }
        }}
      >
        <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
        </svg>
        <span className="nav-label">Pricing</span>
      </a>
      <Link to="/register" className="nav-item">
        <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
          <circle cx="8.5" cy="7" r="4" />
          <line x1="20" y1="8" x2="20" y2="14" />
          <line x1="23" y1="11" x2="17" y2="11" />
        </svg>
        <span className="nav-label">Sign Up</span>
      </Link>
    </nav>
  );
};

export default MobileNav;