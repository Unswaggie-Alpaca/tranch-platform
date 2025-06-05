import React from 'react';
import { CardElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { useApi } from '../../hooks/useApi';
import { useNotifications } from '../../hooks/useNotifications';
import { formatCurrency } from '../../utils/formatters';

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
      // For demo/testing, simulate payment
      const response = await api.simulatePaymentSuccess(
        project.id, 
        'pi_demo_' + Date.now()
      );
      
      onSuccess();
    } catch (err) {
      addNotification({
        type: 'error',
        title: 'Payment Failed',
        message: err.message
      });
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
        disabled={!stripe || processing}
        className="btn btn-primary btn-block"
      >
        {processing ? (
          <>
            <span className="spinner-small"></span>
            Processing...
          </>
        ) : (
          `Pay ${formatCurrency(amount)}`
        )}
      </button>
    </form>
  );
};

export default PaymentForm;