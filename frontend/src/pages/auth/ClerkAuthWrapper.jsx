// pages/auth/ClerkAuthWrapper.jsx
import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useClerk, SignIn, SignUp } from '@clerk/clerk-react';

const ClerkAuthWrapper = ({ mode }) => {
  const navigate = useNavigate();
  const { signOut, isSignedIn, isLoaded } = useClerk();
  const [signingOut, setSigningOut] = useState(false);
  
  useEffect(() => {
    // If user is trying to sign up but is already signed in, sign them out first
    if (mode === 'sign-up' && isSignedIn && isLoaded && !signingOut) {
      setSigningOut(true);
      signOut().then(() => {
        setSigningOut(false);
      });
    }
  }, [mode, isSignedIn, isLoaded, signOut, signingOut]);
  
  if (signingOut) {
    return (
      <div className="auth-container">
        <div className="auth-card">
          <div className="auth-header">
            <h1 className="auth-title">Signing out...</h1>
          </div>
        </div>
      </div>
    );
  }
  
  return (
    <div className="auth-container">
      <div className="auth-card">
        <div className="auth-header">
          <h1 className="auth-title">Welcome to Tranch</h1>
          <p className="auth-subtitle">
            {mode === 'sign-in' 
              ? 'Connect property developers with private credit'
              : 'Join Australia\'s premier property finance platform'
            }
          </p>
        </div>

        <div className="clerk-container">
          {mode === 'sign-in' ? (
            <SignIn 
              appearance={{
                elements: {
                  rootBox: "clerk-root",
                  card: "clerk-card",
                  formButtonPrimary: "cl-formButtonPrimary"
                },
                layout: {
                  socialButtonsPlacement: "bottom",
                  socialButtonsVariant: "iconButton"
                }
              }}
              afterSignInUrl="/dashboard"
            />
          ) : (
            <SignUp 
              appearance={{
                elements: {
                  rootBox: "clerk-root",
                  card: "clerk-card",
                  formButtonPrimary: "cl-formButtonPrimary"
                },
                layout: {
                  socialButtonsPlacement: "bottom",
                  socialButtonsVariant: "iconButton"
                }
              }}
              afterSignUpUrl="/onboarding"
            />
          )}
        </div>
        
        <div className="auth-footer">
          <p>
            By continuing, you agree to our{' '}
            <Link to="/terms" className="auth-link">Terms of Service</Link>
            {' '}and{' '}
            <Link to="/privacy" className="auth-link">Privacy Policy</Link>
          </p>
        </div>
      </div>
    </div>
  );
};

export default ClerkAuthWrapper;