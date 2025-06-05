// App.jsx - Main Application Component

import React from 'react';
import { 
  BrowserRouter as Router, 
  Routes, 
  Route, 
  Navigate 
} from 'react-router-dom';
import { 
  ClerkProvider, 
  SignedIn, 
  SignedOut 
} from '@clerk/clerk-react';
import { Elements } from '@stripe/react-stripe-js';
import { loadStripe } from '@stripe/stripe-js';

// Contexts
import { AppProvider, NotificationProvider } from './contexts';

// Layouts
import { AppLayout, ProtectedRoute } from './components/layout';

// Auth Pages
import { ClerkAuthWrapper, Onboarding } from './pages/auth';

// Main Pages
import { Dashboard } from './pages/dashboard';
import { LandingPage } from './pages/landing';
import { UserProfile } from './pages/profile';
import { SettingsPage } from './pages/settings';
import { AdminPanel } from './pages/admin';
import { Portfolio } from './pages/portfolio';
import { MessagesPage } from './pages/messages';

// Project Pages
import { 
  MyProjects, 
  ProjectsPage, 
  ProjectDetail, 
  CreateProject, 
  EditProject 
} from './pages/projects';

// Legal Pages
import { PrivacyPolicy, TermsOfService, CookiePolicy } from './pages/legal';

// Deal Room
import { DealRoom } from './components/deal';

// AI Chat
import { BrokerAI } from './pages/ai';

// Floating AI Assistant
import { BrokerAIFloating } from './components/ai';

// Configuration
import { CLERK_PUBLISHABLE_KEY, STRIPE_PUBLISHABLE_KEY } from './services/config';

// Initialize Stripe
const stripePromise = loadStripe(STRIPE_PUBLISHABLE_KEY);

// Import main styles
import './App.css';

function App() {
  return (
    <ClerkProvider 
      publishableKey={CLERK_PUBLISHABLE_KEY}
      appearance={{
        variables: {
          colorPrimary: '#667eea',
          colorText: '#1e293b',
          colorBackground: '#ffffff',
          colorInputBackground: '#ffffff',
          colorInputText: '#1e293b',
          fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif',
          borderRadius: '0.5rem'
        },
        elements: {
          formButtonPrimary: {
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            '&:hover': {
              transform: 'translateY(-2px)',
              boxShadow: '0 6px 20px rgba(99, 102, 241, 0.35)'
            }
          },
          card: {
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
            borderRadius: '1rem'
          }
        }
      }}
    >
      <Elements stripe={stripePromise}>
        <NotificationProvider>
          <AppProvider>
            <Router>
              <Routes>
                {/* Public Routes */}
                <Route path="/" element={<LandingPage />} />
                <Route path="/login" element={<ClerkAuthWrapper mode="sign-in" />} />
                <Route path="/register" element={<ClerkAuthWrapper mode="sign-up" />} />
                <Route path="/privacy" element={<PrivacyPolicy />} />
                <Route path="/terms" element={<TermsOfService />} />
                <Route path="/cookies" element={<CookiePolicy />} />
                
                {/* Onboarding */}
                <Route 
                  path="/onboarding" 
                  element={
                    <SignedIn>
                      <Onboarding />
                    </SignedIn>
                  } 
                />
                
                {/* Protected App Routes */}
                <Route
                  path="/*"
                  element={
                    <SignedIn>
                      <AppRoutes />
                    </SignedIn>
                  }
                />
                
                {/* Fallback for signed out users */}
                <Route
                  path="*"
                  element={
                    <SignedOut>
                      <Navigate to="/login" replace />
                    </SignedOut>
                  }
                />
              </Routes>
            </Router>
          </AppProvider>
        </NotificationProvider>
      </Elements>
    </ClerkProvider>
  );
}

// Separate component for app routes with layout
function AppRoutes() {
  return (
    <AppLayout>
      <Routes>
        {/* Dashboard - accessible by all authenticated users */}
        <Route path="/dashboard" element={
          <ProtectedRoute>
            <Dashboard />
          </ProtectedRoute>
        } />
        
        {/* Borrower Routes */}
        <Route path="/create-project" element={
          <ProtectedRoute roles={['borrower']}>
            <CreateProject />
          </ProtectedRoute>
        } />
        <Route path="/my-projects" element={
          <ProtectedRoute roles={['borrower']}>
            <MyProjects />
          </ProtectedRoute>
        } />
        <Route path="/project/:id/edit" element={
          <ProtectedRoute roles={['borrower']}>
            <EditProject />
          </ProtectedRoute>
        } />
        
        {/* Funder Routes */}
        <Route path="/projects" element={
          <ProtectedRoute roles={['funder']}>
            <ProjectsPage />
          </ProtectedRoute>
        } />
        <Route path="/portfolio" element={
          <ProtectedRoute roles={['funder']}>
            <Portfolio />
          </ProtectedRoute>
        } />
        
        {/* Shared Routes */}
        <Route path="/project/:id" element={
          <ProtectedRoute roles={['borrower', 'funder', 'admin']}>
            <ProjectDetail />
          </ProtectedRoute>
        } />
        <Route path="/messages" element={
          <ProtectedRoute roles={['borrower', 'funder']}>
            <MessagesPage />
          </ProtectedRoute>
        } />
        <Route path="/broker-ai" element={
          <ProtectedRoute>
            <BrokerAI />
          </ProtectedRoute>
        } />
        <Route path="/project/:projectId/deal/:dealId" element={
          <ProtectedRoute roles={['borrower', 'funder']}>
            <DealRoom />
          </ProtectedRoute>
        } />
        
        {/* User Routes */}
        <Route path="/profile" element={
          <ProtectedRoute>
            <UserProfile />
          </ProtectedRoute>
        } />
        <Route path="/settings" element={
          <ProtectedRoute>
            <SettingsPage />
          </ProtectedRoute>
        } />
        
        {/* Admin Routes */}
        <Route path="/admin" element={
          <ProtectedRoute roles={['admin']}>
            <AdminPanel />
          </ProtectedRoute>
        } />
        
        {/* Catch all - redirect to dashboard */}
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
      
      {/* Floating BrokerAI Assistant */}
      <BrokerAIFloating />
    </AppLayout>
  );
}

export default App;