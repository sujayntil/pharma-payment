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
  /** Collect from customer: one amount over the ticked invoices, oldest first. */
  async createBatch(payload) {
    const response = await axiosClient.post('/payments/batch', payload);
    return response.data;
  },
  /** A customer's pending invoices, oldest first. */
  async pendingInvoices(customerId) {
    const response = await axiosClient.get('/payments/pending-invoices', { params: { customer_id: customerId } });
    return response.data;
  },
  /** Undo a collection you saved in the last 5 minutes (a split is undone together). */
  async undo(paymentId) {
    const response = await axiosClient.post(`/payments/${paymentId}/undo`);
    return response.data;
  },
};

