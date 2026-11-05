import axiosClient from './axiosClient';

export const adminApi = {
  /**
   * Get Admin dashboard metrics.
   * @param {object} params - { date_from, date_to }
   */
  async getDashboard(params = {}) {
    const response = await axiosClient.get('/admin/dashboard', { params });
    return response.data;
  },

  /**
   * Get MR collection performance table.
   * @param {object} params - { date_from, date_to }
   */
  async getMrPerformance(params = {}) {
    const response = await axiosClient.get('/admin/mr-performance', { params });
    return response.data;
  },

  /**
   * Get large outstanding alerts.
   * @param {number} threshold - default 50000
   */
  async getOutstandingAlerts(threshold = 50000, params = {}) {
    const response = await axiosClient.get('/admin/outstanding-alerts', {
      params: { threshold, ...params },
    });
    return response.data;
  },

  async getOverdueAlerts() {
    const response = await axiosClient.get('/admin/overdue-alerts');
    return response.data;
  },

  async getCollections(params = {}) {
    const response = await axiosClient.get('/admin/collections', { params });
    return response.data;
  },

  async getRecentPayments(limit = 20) {
    const response = await axiosClient.get('/admin/recent-payments', { params: { limit } });
    return response.data;
  },

  async importInvoices(file) {
    const form = new FormData();
    form.append('file', file);
    const response = await axiosClient.post('/admin/import-invoices', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  },

  async mapCustomer(customerId, mrId) {
    const response = await axiosClient.put(`/admin/customers/${customerId}/mr`, { mr_id: mrId || null });
    return response.data;
  },

  async createManualInvoice(data) {
    const response = await axiosClient.post('/admin/manual-invoices', data);
    return response.data;
  },

  async overrideCollectionStatus(invoiceId, status) {
    const response = await axiosClient.put(`/admin/invoices/${invoiceId}/collection-status`, { status });
    return response.data;
  },

  /**
   * Get list of users (Admin and MRs).
   */
  async getUsers() {
    const response = await axiosClient.get('/admin/users');
    return response.data;
  },

  /**
   * Create new user.
   * @param {object} userData - { name, employee_code, role, phone, password }
   */
  async createUser(userData) {
    const response = await axiosClient.post('/admin/users', userData);
    return response.data;
  },

  /**
   * Update user details.
   * @param {number|string} userId
   * @param {object} userData - { name, phone, role, password }
   */
  async updateUser(userId, userData) {
    const response = await axiosClient.put(`/admin/users/${userId}`, userData);
    return response.data;
  },

  /**
   * Delete user.
   * @param {number|string} userId
   */
  async deleteUser(userId) {
    const response = await axiosClient.delete(`/admin/users/${userId}`);
    return response.data;
  },
};

