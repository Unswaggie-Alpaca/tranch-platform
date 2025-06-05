// services/config.js
import { loadStripe } from '@stripe/stripe-js';

// Clerk Configuration
export const CLERK_PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

if (!CLERK_PUBLISHABLE_KEY) {
  throw new Error('Missing Clerk Publishable Key');
}

// API Configuration
export const API_BASE_URL = import.meta.env.VITE_API_URL || (
  import.meta.env.PROD
    ? 'https://fundr-demo.onrender.com/api'
    : 'http://localhost:5000/api'
);

// Stripe Configuration
export const STRIPE_PUBLISHABLE_KEY = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY || 
  'pk_test_51RU7lrQupq5Lj3mgQLoOPZQnTHeOOC8HSXs9x4D0H9uURhmGi0tlRxvkiuTy9NEd9RlM3B51YBpvgMdwlbU6bvkQ00WUSGUnp8';

export const stripePromise = loadStripe(STRIPE_PUBLISHABLE_KEY);