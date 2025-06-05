// components/layout/AppLayout.jsx
import React from 'react';
import { useLocation } from 'react-router-dom';
import Navigation from './Navigation';
import { BrokerAIFloating } from '../ai';
import { useApp } from '../../hooks';

const AppLayout = ({ children }) => {
  const { user } = useApp();
  const location = useLocation();
  
  // Pages where BrokerAI floating assistant should not appear
  const noBrokerAIPages = ['/', '/login', '/register', '/onboarding'];
  const showBrokerAI = user && !noBrokerAIPages.includes(location.pathname);

  return (
    <div className="app">
      <Navigation />
      <main className="main-content">
        {children}
      </main>
      
      {/* Floating BrokerAI Assistant */}
      {showBrokerAI && <BrokerAIFloating />}
    </div>
  );
};

export default AppLayout;