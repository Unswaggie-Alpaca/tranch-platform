import React, { useState } from 'react';
import { Elements } from '@stripe/react-stripe-js';
import { loadStripe } from '@stripe/stripe-js';
import { Modal } from '../common/Modal';
import PaymentForm from './PaymentForm';
import { formatCurrency } from '../../utils/formatters';

const STRIPE_PUBLISHABLE_KEY = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY || 
  'pk_test_51RU7lrQupq5Lj3mgQLoOPZQnTHeOOC8HSXs9x4D0H9uURhmGi0tlRxvkiuTy9NEd9RlM3B51YBpvgMdwlbU6bvkQ00WUSGUnp8';

const stripePromise = loadStripe(STRIPE_PUBLISHABLE_KEY);

const PaymentModal = ({ isOpen, onClose, project, onSuccess }) => {
  const [processing, setProcessing] = useState(false);
  
  if (!isOpen) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Publish Project" size="medium">
      <div className="payment-summary">
        <h3>{project.title}</h3>
        <p className="payment-description">
          Publishing your project will make it visible to all verified funders on the platform.
        </p>
        <div className="payment-amount">
          <span>Publishing Fee:</span>
          <strong>{formatCurrency(499)}</strong>
        </div>
      </div>

      <Elements stripe={stripePromise}>
        <PaymentForm 
          amount={499}
          project={project}
          onSuccess={onSuccess}
          processing={processing}
          setProcessing={setProcessing}
        />
      </Elements>

      <div className="payment-security">
        <span>🔒</span>
        <p>Secured by Stripe. Your payment information is encrypted and secure.</p>
      </div>
    </Modal>
  );
};

export default PaymentModal;