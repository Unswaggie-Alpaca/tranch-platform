import React, { useState } from 'react';
import { loadStripe } from '@stripe/stripe-js';
import { Elements } from '@stripe/react-stripe-js';
import { useApp } from '../../hooks/useApp';
import { Modal } from '../common/Modal';
import SubscriptionForm from './SubscriptionForm';

const STRIPE_PUBLISHABLE_KEY = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY || 
  'pk_test_51RU7lrQupq5Lj3mgQLoOPZQnTHeOOC8HSXs9x4D0H9uURhmGi0tlRxvkiuTy9NEd9RlM3B51YBpvgMdwlbU6bvkQ00WUSGUnp8';

const stripePromise = loadStripe(STRIPE_PUBLISHABLE_KEY);

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
            <SubscriptionForm 
              onSuccess={onSuccess}
              processing={processing}
              setProcessing={setProcessing}
              user={user}
            />
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