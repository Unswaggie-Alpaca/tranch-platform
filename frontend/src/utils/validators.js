// utils/validators.js

export const validateEmail = (email) => {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email);
};

export const validatePhone = (phone) => {
  const re = /^(\+61|0)[2-478][\d]{8}$/;
  return re.test(phone.replace(/\s/g, ''));
};

export const validateABN = (abn) => {
  const abnRegex = /^[0-9]{11}$/;
  return abnRegex.test(abn.replace(/\s/g, ''));
};