import axiosClient from './axiosClient';

export const customersApi = {
  async getMyCustomers(params = {}) {
    const response = await axiosClient.get('/mr/customers', { params });
    return response.data;
  },
  /**
   * Get all customers.
   */
  async getCustomers(params = {}) {
    const response = await axiosClient.get('/customers', { params });
    return response.data;
  },

  /**
   * Get ledger breakdown for a specific customer.
   * @param {number|string} customerId
   */
  async getCustomerLedger(customerId, params = {}) {
    const response = await axiosClient.get(`/customers/${customerId}/ledger`, { params });
    return response.data;
  },

  /** The ledger as a PDF (same filters as the screen, no paging). */
  async getLedgerPdf(customerId, params = {}) {
    const response = await axiosClient.get(`/customers/${customerId}/ledger/pdf`, { params, responseType: 'blob' });
    return response.data;
  },

  /** Admin: add a customer (name, type, MR, numbers, address, GSTIN). */
  async createCustomer(data) {
    const response = await axiosClient.post('/customers', data);
    return response.data;
  },

  async updateCustomer(customerId, data) {
    const response = await axiosClient.put(`/customers/${customerId}`, data);
    return response.data;
  },

  /** MR: add / change / clear phone numbers of one of their own customers. */
  async updateMyCustomerContact(customerId, data) {
    const response = await axiosClient.put(`/mr/customers/${customerId}/contact`, data);
    return response.data;
  },

  async deleteCustomer(customerId) {
    await axiosClient.delete(`/customers/${customerId}`);
  },
};

