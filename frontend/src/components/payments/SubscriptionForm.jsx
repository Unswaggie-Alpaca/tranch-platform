import React from 'react';
import { CardElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { useApi } from '../../hooks/useApi';
import { useNotifications } from '../../hooks/useNotifications';

const SubscriptionForm = ({ onSuccess, processing, setProcessing, user }) => {
  const api = useApi();
  const stripe = useStripe();
  const elements = useElements();
  const { addNotification } = useNotifications();

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!stripe || !elements) return;
    
    setProcessing(true);

    try {
      // For demo/testing, simulate subscription
      const response = await api.simulateSubscription();
      
      onSuccess();
    } catch (err) {
      addNotification({
        type: 'error',
        title: 'Subscription Failed',
        message: err.message || 'Failed to activate subscription'
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
                '::placeholder': {
                  color: '#aab7c4',
                },
              },
            },
          }}
        />
      </div>
      
      <button 
        type="submit" 
        disabled={processing || !stripe}
        className="btn btn-primary btn-block"
      >
        {processing ? (
          <>
            <span className="spinner-small"></span>
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

export default SubscriptionForm;