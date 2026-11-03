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

  async updateCustomer(customerId, data) {
    const response = await axiosClient.put(`/customers/${customerId}`, data);
    return response.data;
  },

  async deleteCustomer(customerId) {
    await axiosClient.delete(`/customers/${customerId}`);
  },
};

