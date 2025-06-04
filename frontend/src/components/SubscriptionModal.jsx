import React, { useState } from 'react';
import { Elements, CardElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { loadStripe } from '@stripe/stripe-js';
import { Modal } from './Modal';
import { useApi } from '../hooks';
import { useApp, useNotifications } from '../contexts';

const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY || '');

const SubscriptionForm = ({ onSuccess, processing, setProcessing }) => {
  const api = useApi();
  const stripe = useStripe();
  const elements = useElements();
  const { addNotification } = useNotifications();

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!stripe || !elements) return;
    setProcessing(true);
    try {
      await api.simulateSubscription();
      onSuccess();
    } catch (err) {
      addNotification({
        type: 'error',
        title: 'Subscription Failed',
        message: err.message || 'Failed to activate subscription',
      });
    } finally {
      setProcessing(false);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <div className="card-element-container">
        <CardElement
          options={{
            style: {
              base: {
                fontSize: '16px',
                color: '#424770',
                '::placeholder': { color: '#aab7c4' },
              },
            },
          }}
        />
      </div>
      <button type="submit" disabled={processing || !stripe} className="btn btn-primary btn-block">
        {processing ? (
          <>
            <span className="spinner-small" />
            Processing...
          </>
        ) : (
          'Start Subscription - $299/month'
        )}
      </button>
      <div className="subscription-terms">
        <p>By subscribing, you agree to our terms of service. Cancel anytime.</p>
      </div>
    </form>
  );
};

const SubscriptionModal = ({ isOpen, onClose, onSuccess }) => {
  const [processing, setProcessing] = useState(false);
  const { user } = useApp();
  if (!isOpen) return null;
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Funder Subscription" size="medium">
      <div className="subscription-plans">
        <div className="plan-card featured">
          <h3>Professional Funder</h3>
          <div className="plan-price">
            <span className="currency">$</span>
            <span className="amount">299</span>
            <span className="period">/month</span>
          </div>
          <ul className="plan-features">
            <li>✓ Unlimited project access</li>
            <li>✓ Advanced search filters</li>
            <li>✓ Direct messaging with developers</li>
            <li>✓ Document downloads</li>
            <li>✓ Portfolio analytics</li>
            <li>✓ Priority support</li>
            <li>✓ Early access to new listings</li>
          </ul>
          <Elements stripe={stripePromise}>
            <SubscriptionForm onSuccess={onSuccess} processing={processing} setProcessing={setProcessing} user={user} />
          </Elements>
          <div className="payment-security">
            <span>🔒</span>
            <p>Cancel anytime. Secured by Stripe.</p>
          </div>
        </div>
      </div>
    </Modal>
  );
};

export default SubscriptionModal;
