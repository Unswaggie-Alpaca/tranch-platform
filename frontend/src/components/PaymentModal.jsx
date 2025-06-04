import React, { useState } from 'react';
import { Elements, CardElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { loadStripe } from '@stripe/stripe-js';
import { Modal } from './Modal';
import { formatCurrency } from '../utils';
import { useApi } from '../hooks';
import { useNotifications } from '../contexts';

const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY || '');

const PaymentForm = ({ amount, project, onSuccess, processing, setProcessing }) => {
  const api = useApi();
  const stripe = useStripe();
  const elements = useElements();
  const { addNotification } = useNotifications();

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!stripe || !elements) return;
    setProcessing(true);
    try {
      await api.simulatePaymentSuccess(project.id, 'pi_demo_' + Date.now());
      onSuccess();
    } catch (err) {
      addNotification({ type: 'error', title: 'Payment Failed', message: err.message });
    } finally {
      setProcessing(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="payment-form">
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
      <button type="submit" disabled={!stripe || processing} className="btn btn-primary btn-block">
        {processing ? (
          <>
            <span className="spinner-small" />
            Processing...
          </>
        ) : (
          `Pay ${formatCurrency(amount)}`
        )}
      </button>
    </form>
  );
};

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
