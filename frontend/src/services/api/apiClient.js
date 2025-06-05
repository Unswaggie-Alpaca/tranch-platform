// services/api/apiClient.js
import { API_BASE_URL } from '../config';

export const createApiClient = (getToken) => {
  const request = async (endpoint, options = {}) => {
    try {
      const token = await getToken();
      
      const config = {
        headers: {
          'Content-Type': 'application/json',
          ...(token && { Authorization: `Bearer ${token}` }),
          ...options.headers,
        },
        ...options,
      };

      // Don't set Content-Type for FormData
      if (options.body instanceof FormData) {
        delete config.headers['Content-Type'];
      }

      const response = await fetch(`${API_BASE_URL}${endpoint}`, config);
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Network error' }));
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error('API Error:', error);
      throw error;
    }
  };

  return {
    request,

    // Auth endpoints
    getCurrentUser: () => request('/auth/me'),
    setUserRole: (role) => request('/auth/set-role', {
      method: 'POST',
      body: JSON.stringify({ role }),
    }),
    completeProfile: (profileData) => request('/auth/complete-profile', {
      method: 'POST',
      body: JSON.stringify(profileData),
    }),

    // User profile endpoints
    getUserProfile: (userId) => request(`/users/${userId}/profile`),
    updateUserProfile: (userId, profileData) => request(`/users/${userId}/profile`, {
      method: 'PUT',
      body: JSON.stringify(profileData),
    }),

    // Project endpoints
    getProjects: () => request('/projects'),
    createProject: (projectData) => request('/projects', {
      method: 'POST',
      body: JSON.stringify(projectData),
    }),
    getProject: (id) => request(`/projects/${id}`),
    updateProject: (id, projectData) => request(`/projects/${id}`, {
      method: 'PUT',
      body: JSON.stringify(projectData),
    }),

    // Document endpoints
    uploadDocuments: (projectId, formData) => request(`/projects/${projectId}/documents`, {
      method: 'POST',
      body: formData,
    }),
    getProjectDocuments: (projectId) => request(`/projects/${projectId}/documents`),
    deleteDocument: (documentId) => request(`/documents/${documentId}`, {
      method: 'DELETE',
    }),
    getRequiredDocuments: () => request('/required-documents'),
    
    // Document download
    async downloadDocument(filePath) {
      const token = await getToken();
      // Extract just the filename from any path format
      const filename = filePath.split('/').pop();
      const response = await fetch(`${API_BASE_URL.replace('/api', '')}/uploads/${filename}`, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });
      
      if (!response.ok) throw new Error('Download failed');
      return response.blob();
    },

    // Deal endpoints
    getDeal: (dealId) => request(`/deals/${dealId}`),
    createDeal: (projectId, accessRequestId) => request('/deals', {
      method: 'POST',
      body: JSON.stringify({ project_id: projectId, access_request_id: accessRequestId }),
    }),
    getDealDocuments: (dealId) => request(`/deals/${dealId}/documents`),
    uploadDealDocuments: (dealId, formData) => request(`/deals/${dealId}/documents`, {
      method: 'POST',
      body: formData,
    }),
    getDocumentRequests: (dealId) => request(`/deals/${dealId}/document-requests`),
    createDocumentRequest: (dealId, requestData) => request(`/deals/${dealId}/document-requests`, {
      method: 'POST',
      body: JSON.stringify(requestData),
    }),
    downloadDealDocument: (dealId, documentId) => request(`/deals/${dealId}/documents/${documentId}`),

    // Payment endpoints
    createProjectPayment: (projectId) => request('/payments/create-project-payment', {
      method: 'POST',
      body: JSON.stringify({ project_id: projectId }),
    }),
    createSubscription: (paymentMethodId) => request('/payments/create-subscription', {
      method: 'POST',
      body: JSON.stringify({ payment_method_id: paymentMethodId }),
    }),
    cancelSubscription: () => request('/payments/cancel-subscription', {
      method: 'POST',
    }),
    
    // For development/testing
    simulatePaymentSuccess: (projectId, paymentIntentId) => request('/payments/simulate-success', {
      method: 'POST',
      body: JSON.stringify({ project_id: projectId, payment_intent_id: paymentIntentId }),
    }),
    simulateSubscription: () => request('/payments/simulate-subscription', {
      method: 'POST',
    }),

    // Access request endpoints
    requestAccess: (projectId, initialMessage) => request('/access-requests', {
      method: 'POST',
      body: JSON.stringify({ project_id: projectId, initial_message: initialMessage }),
    }),
    getAccessRequests: () => request('/access-requests'),
    approveAccessRequest: (requestId) => request(`/access-requests/${requestId}/approve`, {
      method: 'PUT',
    }),
    declineAccessRequest: (requestId) => request(`/access-requests/${requestId}/decline`, {
      method: 'PUT',
    }),

    // Messaging endpoints
    getMessages: (requestId) => request(`/access-requests/${requestId}/messages`),
    sendMessage: (requestId, message) => request(`/access-requests/${requestId}/messages`, {
      method: 'POST',
      body: JSON.stringify({ message, message_type: 'text' }),
    }),
    markMessageAsRead: (messageId) => request(`/messages/${messageId}/read`, {
      method: 'PUT',
    }),

    // AI Chat endpoints
    createAIChatSession: (projectId, sessionTitle) => request('/ai-chat/sessions', {
      method: 'POST',
      body: JSON.stringify({ project_id: projectId, session_title: sessionTitle }),
    }),
    getAIChatSessions: () => request('/ai-chat/sessions'),
    getAIChatMessages: (sessionId) => request(`/ai-chat/sessions/${sessionId}/messages`),
    sendAIChatMessage: (sessionId, message) => request(`/ai-chat/sessions/${sessionId}/messages`, {
      method: 'POST',
      body: JSON.stringify({ message }),
    }),

    // Admin endpoints
    getUsers: () => request('/admin/users'),
    approveUser: (userId) => request(`/admin/users/${userId}/approve`, {
      method: 'PUT',
    }),
    getAdminStats: () => request('/admin/stats'),
    getSystemSettings: () => request('/admin/system-settings'),
    updateSystemSetting: (key, value) => request(`/admin/system-settings/${key}`, {
      method: 'PUT',
      body: JSON.stringify({ value }),
    }),

    // Notification preferences
    getNotificationPreferences: () => request('/notifications/preferences'),
    updateNotificationPreferences: (preferences) => request('/notifications/preferences', {
      method: 'PUT',
      body: JSON.stringify(preferences),
    }),

    // Data export
    exportUserData: () => request('/export/user-data'),
    exportProjects: () => request('/export/projects'),
    
    // Account management
    deleteAccount: (confirmation) => request('/account/delete', {
      method: 'DELETE',
      body: JSON.stringify({ confirmation }),
    }),
  };
};