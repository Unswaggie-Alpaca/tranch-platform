// hooks/useApi.js
import { useAuth } from '@clerk/clerk-react';
import { createApiClient } from '../services/api/apiClient';

const useApi = () => {
  const { getToken } = useAuth();
  return createApiClient(getToken);
};

export default useApi;