// services/stripe.js
import { loadStripe } from '@stripe/stripe-js';
import { STRIPE_PUBLISHABLE_KEY } from './config';

export const stripePromise = loadStripe(STRIPE_PUBLISHABLE_KEY);

export default stripePromise;