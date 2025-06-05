// utils/constants.js

export const USER_ROLES = {
  BORROWER: 'borrower',
  FUNDER: 'funder',
  ADMIN: 'admin'
};

export const PROJECT_STATUS = {
  DRAFT: 'draft',
  PUBLISHED: 'published',
  FUNDED: 'funded',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled'
};

export const PAYMENT_STATUS = {
  UNPAID: 'unpaid',
  PAID: 'paid',
  FAILED: 'failed',
  REFUNDED: 'refunded'
};

export const ACCESS_REQUEST_STATUS = {
  PENDING: 'pending',
  APPROVED: 'approved',
  DECLINED: 'declined'
};

export const SUBSCRIPTION_STATUS = {
  ACTIVE: 'active',
  INACTIVE: 'inactive',
  CANCELLED: 'cancelled',
  PAST_DUE: 'past_due'
};

export const DOCUMENT_TYPES = {
  FEASIBILITY_STUDY: 'feasibility_study',
  DEVELOPMENT_APPLICATION: 'development_application',
  CONSTRUCTION_CONTRACT: 'construction_contract',
  FINANCIAL_MODEL: 'financial_model',
  VALUATION_REPORT: 'valuation_report',
  INSURANCE_CERTIFICATE: 'insurance_certificate',
  OTHER: 'other'
};

export const PROPERTY_TYPES = [
  'Residential',
  'Commercial',
  'Mixed Use',
  'Industrial',
  'Retail'
];

export const DEVELOPMENT_STAGES = [
  'Planning',
  'Pre-Construction',
  'Construction',
  'Near Completion'
];

export const COMPANY_TYPES = [
  'Private Credit Fund',
  'Investment Bank',
  'Family Office',
  'Hedge Fund',
  'Real Estate Fund',
  'High Net Worth Individual',
  'Other'
];

export const INVESTMENT_FOCUS = [
  'Residential Development',
  'Commercial Development',
  'Mixed-Use Development',
  'Industrial Development',
  'All Property Types'
];

export const RISK_RATINGS = {
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high'
};

export const PLANNING_PERMIT_STATUS = [
  'Not Started',
  'In Progress',
  'Submitted',
  'Approved',
  'Approved with Conditions'
];

export const FEES = {
  PROJECT_LISTING: 499, // $499 per project
  MONTHLY_SUBSCRIPTION: 299 // $299 per month
};