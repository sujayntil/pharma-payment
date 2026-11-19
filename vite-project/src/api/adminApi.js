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

  /**
   * Excel file of every ledger entry matching the same filters as the list.
   * Returns the raw response (Blob) for saveDownload().
   */
  /** Dashboard: Summary + one sheet per customer type (follows date and type filters). */
  async exportByCustomerType(params = {}) {
    return axiosClient.get('/admin/dashboard/export-by-type', { params, responseType: 'blob' });
  },
  async exportCollections(params = {}) {
    return axiosClient.get('/admin/collections/export', { params, responseType: 'blob' });
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

  /**
   * Mark an invoice PAID or UNPAID. Both write a payments-ledger entry
   * (settlement or reversal) so collection totals stay correct.
   * @param {object} extra - { mode, transaction_reference } for PAID, { reason } for UNPAID
   */
  async overrideCollectionStatus(invoiceId, status, extra = {}) {
    const response = await axiosClient.put(`/admin/invoices/${invoiceId}/collection-status`, { status, ...extra });
    return response.data;
  },

  /**
   * Admin-only. Reverse one collection with a mandatory reason. Adds a linked
   * reversal entry; the original payment is never deleted.
   * @param {number} paymentId
   * @param {{ reason: string, amount?: number }} payload
   */
  /** Admin only: change how a collection was paid (mode + reference). */
  async changePaymentMode(paymentId, payload) {
    const response = await axiosClient.patch(`/admin/payments/${paymentId}/mode`, payload);
    return response.data;
  },
  async reversePayment(paymentId, payload) {
    const response = await axiosClient.post(`/admin/payments/${paymentId}/reverse`, payload);
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
  /** Empty MRs' "Updates from office" bells: one MR, or all (no id). */
  async clearMrBells(userId) {
    const response = await axiosClient.post('/admin/users/clear-bells', null, { params: userId ? { user_id: userId } : {} });
    return response.data;
  },
  async deleteUser(userId) {
    const response = await axiosClient.delete(`/admin/users/${userId}`);
    return response.data;
  },

  /** Deleted items (invoices, customers, users, undone collections). */
  async getDeletions(params = {}) {
    const response = await axiosClient.get('/admin/deletions', { params });
    return response.data;
  },
  async getDeletionsSummary(params = {}) {
    const response = await axiosClient.get('/admin/deletions/summary', { params });
    return response.data;
  },
  async getDeletion(id) {
    const response = await axiosClient.get(`/admin/deletions/${id}`);
    return response.data;
  },
  async restoreDeletion(id) {
    const response = await axiosClient.post(`/admin/deletions/${id}/restore`);
    return response.data;
  },
  async exportDeletions(params = {}) {
    return axiosClient.get('/admin/deletions/export', { params, responseType: 'blob' });
  },
};

