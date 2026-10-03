import axiosClient from './axiosClient';

export const paymentsApi = {
  /**
   * Record a payment for an invoice.
   * @param {object} payload - { invoice_id, amount, mode, transaction_reference }
   */
  async createPayment(payload) {
    const response = await axiosClient.post('/payments', payload);
    return response.data;
  },
};

