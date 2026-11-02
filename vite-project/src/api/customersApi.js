import axiosClient from './axiosClient';

export const customersApi = {
  async getMyCustomers() {
    const response = await axiosClient.get('/mr/customers');
    return response.data;
  },
  /**
   * Get all customers.
   */
  async getCustomers() {
    const response = await axiosClient.get('/customers');
    return response.data;
  },

  /**
   * Get ledger breakdown for a specific customer.
   * @param {number|string} customerId
   */
  async getCustomerLedger(customerId) {
    const response = await axiosClient.get(`/customers/${customerId}/ledger`);
    return response.data;
  },
};

