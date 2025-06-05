// pages/landing/LandingPage.jsx

import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Hero from '../../components/landing/Hero';
import Features from '../../components/landing/Features';
import HowItWorks from '../../components/landing/HowItWorks';
import Pricing from '../../components/landing/Pricing';
import Footer from '../../components/landing/Footer';
import MobileNav from '../../components/landing/MobileNav';

const LandingPage = () => {
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isNavVisible, setIsNavVisible] = useState(true);
  const [lastScrollY, setLastScrollY] = useState(0);

  // Add swipe-away functionality for mobile only
  useEffect(() => {
    const handleScroll = () => {
      if (window.innerWidth > 768) return; // Only on mobile
      
      const currentScrollY = window.scrollY;
      
      if (currentScrollY > lastScrollY && currentScrollY > 80) {
        // Scrolling down
        setIsNavVisible(false);
      } else {
        // Scrolling up
        setIsNavVisible(true);
      }
      
      setLastScrollY(currentScrollY);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    
    return () => {
      window.removeEventListener('scroll', handleScroll);
    };
  }, [lastScrollY]);

  // Handle swipe indicators and smooth scrolling
  useEffect(() => {
    // Handle swipe indicators
    const handleScroll = (wrapper, indicators) => {
      const scrollLeft = wrapper.scrollLeft;
      const cardWidth = wrapper.firstChild.offsetWidth + 16; // card width + gap
      const activeIndex = Math.round(scrollLeft / cardWidth);
      
      indicators.forEach((dot, index) => {
        dot.classList.toggle('active', index === activeIndex);
      });
    };

    const problemCards = document.querySelector('.problem-cards');
    const problemDots = document.querySelectorAll('.problem-cards-wrapper .dot');
    
    const solutionCards = document.querySelector('.solution-cards');
    const solutionDots = document.querySelectorAll('.solution-cards-wrapper .dot');
    
    if (problemCards && problemDots.length) {
      problemCards.addEventListener('scroll', () => handleScroll(problemCards, problemDots));
    }
    
    if (solutionCards && solutionDots.length) {
      solutionCards.addEventListener('scroll', () => handleScroll(solutionCards, solutionDots));
    }

    // Add journey cards swipe functionality
    const journeyContainer = document.querySelector('.user-journeys');
    const journeyCards = document.querySelectorAll('.journey-path');
    const indicators = document.querySelectorAll('.journey-indicators .indicator-dot');
    
    if (journeyContainer && journeyCards.length > 0) {
      // Set initial active card
      journeyCards[0]?.classList.add('active');
      
      const handleJourneyScroll = () => {
        const containerRect = journeyContainer.getBoundingClientRect();
        const containerCenter = containerRect.left + containerRect.width / 2;
        
        let closestCard = null;
        let closestDistance = Infinity;
        let activeIndex = 0;
        
        journeyCards.forEach((card, index) => {
          const cardRect = card.getBoundingClientRect();
          const cardCenter = cardRect.left + cardRect.width / 2;
          const distance = Math.abs(containerCenter - cardCenter);
          
          if (distance < closestDistance) {
            closestDistance = distance;
            closestCard = card;
            activeIndex = index;
          }
          
          card.classList.remove('active');
        });
        
        if (closestCard) {
          closestCard.classList.add('active');
        }
        
        // Update indicators
        indicators.forEach((dot, index) => {
          dot.classList.toggle('active', index === activeIndex);
        });
      };
      
      // Snap to card on scroll end
      let scrollTimeout;
      journeyContainer.addEventListener('scroll', () => {
        handleJourneyScroll();
        
        clearTimeout(scrollTimeout);
        scrollTimeout = setTimeout(() => {
          const activeCard = document.querySelector('.journey-path.active');
          if (activeCard) {
            activeCard.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
          }
        }, 150);
      });
      
      // Handle indicator clicks
      indicators.forEach((dot, index) => {
        dot.addEventListener('click', () => {
          journeyCards[index]?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
        });
      });
      
      // Initial positioning
      handleJourneyScroll();
    }
    
    // Smooth scroll for anchor links
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
      anchor.addEventListener('click', function (e) {
        e.preventDefault();
        const targetId = this.getAttribute('href');
        
        // Special handling for pricing - scroll to journey section
        if (targetId === '#pricing') {
          const journeySection = document.querySelector('.user-journeys');
          if (journeySection) {
            const offset = window.innerWidth <= 768 ? 60 : 80;
            const targetPosition = journeySection.getBoundingClientRect().top + window.pageYOffset - offset;
            
            window.scrollTo({
              top: targetPosition,
              behavior: 'smooth'
            });
            
            // Highlight pricing after scroll
            setTimeout(() => {
              const pricingElements = document.querySelectorAll('.price-note');
              pricingElements.forEach(el => {
                el.style.animation = 'pulse 2s ease-out';
              });
            }, 500);
          }
        } else {
          const target = document.querySelector(targetId);
          if (target) {
            const offset = window.innerWidth <= 768 ? 60 : 80;
            const targetPosition = target.getBoundingClientRect().top + window.pageYOffset - offset;
            
            window.scrollTo({
              top: targetPosition,
              behavior: 'smooth'
            });
          }
        }
        
        // Trigger haptic feedback on mobile
        if ('vibrate' in navigator) {
          navigator.vibrate(10);
        }
      });
    });
  }, []);

  return (
    <div className="landing-page">
      {/* Mobile Header with swipe-away */}
      <div className={`mobile-header ${isNavVisible ? '' : 'hidden'}`}>
        <div className="mobile-logo">Tranch</div>
        <button 
          className="mobile-menu-trigger"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        </button>
      </div>

      {/* Mobile Menu Dropdown */}
      {mobileMenuOpen && (
        <div className="landing-mobile-menu">
          <a href="#features" onClick={() => setMobileMenuOpen(false)}>Features</a>
          <a href="#how-it-works" onClick={() => setMobileMenuOpen(false)}>How it Works</a>
          <a href="#pricing" onClick={() => setMobileMenuOpen(false)}>Pricing</a>
          <Link to="/login" className="btn btn-outline" onClick={() => setMobileMenuOpen(false)}>Sign In</Link>
          <Link to="/register" className="btn btn-primary" onClick={() => setMobileMenuOpen(false)}>Get Started</Link>
        </div>
      )}

      {/* Mobile Bottom Navigation */}
      <MobileNav />

      {/* Mobile Floating Action Button */}
      <button className="mobile-fab">
        <span>+</span>
      </button>

      {/* Navigation */}
      <nav className="landing-nav">
        <div className="nav-container">
          <div className="nav-logo">
            <span className="logo-text">Tranch</span>
          </div>
          <div className="nav-links desktop-only">
            <a href="#features">Features</a>
            <a href="#how-it-works">How it Works</a>
            <a href="#pricing">Pricing</a>
            <Link to="/login" className="btn btn-outline">Sign In</Link>
            <Link to="/register" className="btn btn-primary">Get Started</Link>
          </div>
          <button 
            className="mobile-menu-btn"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          >
            <span></span>
            <span></span>
            <span></span>
          </button>
        </div>
        
        {mobileMenuOpen && (
          <div className="mobile-nav-menu">
            <a href="#features" onClick={() => setMobileMenuOpen(false)}>Features</a>
            <a href="#how-it-works" onClick={() => setMobileMenuOpen(false)}>How it Works</a>
            <a href="#pricing" onClick={() => setMobileMenuOpen(false)}>Pricing</a>
            <Link to="/login" className="btn btn-outline">Sign In</Link>
            <Link to="/register" className="btn btn-primary">Get Started</Link>
          </div>
        )}
      </nav>

      {/* Hero Section */}
      <Hero />

      {/* Features Section */}
      <Features />

      {/* How It Works Section */}
      <HowItWorks />

      {/* Pricing Section */}
      <Pricing />

      {/* CTA Section */}
      <section className="cta-section">
        <div className="container">
          <h2>Ready to Transform Your Property Finance?</h2>
          <p>Join Australia's fastest-growing property finance platform</p>
          <div className="cta-actions">
            <Link to="/register" className="btn btn-primary btn-lg">
              Get Started
            </Link>
            <a href="mailto:support@tranch.com.au" className="btn btn-outline btn-lg">
              Contact Sales
            </a>
          </div>
        </div>
      </section>

      {/* Footer */}
      <Footer />
    </div>
  );
};

export default LandingPage;