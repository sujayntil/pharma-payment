import axiosClient from './axiosClient';

export const invoicesApi = {
  /**
   * Get all invoices (Admin view).
   * @param {object} params - { mr_id, status, date_from, date_to }
   */
  async getInvoices(params = {}) {
    const response = await axiosClient.get('/invoices', { params });
    return response.data;
  },

  /**
   * Admin: Excel file of every invoice matching the same filters as the list.
   * Returns the raw response (Blob) for saveDownload().
   */
  async exportInvoices(params = {}) {
    return axiosClient.get('/invoices/export', { params, responseType: 'blob' });
  },

  /**
   * Get current MR's invoices.
   * @param {object} params - { date_from, date_to }
   */
  async getMyInvoices(params = {}) {
    const response = await axiosClient.get('/invoices/mine', { params });
    return response.data;
  },

  /**
   * Get single invoice by ID.
   * @param {number|string} id
   */
  async getInvoiceById(id) {
    const response = await axiosClient.get(`/invoices/${id}`);
    return response.data;
  },

  /**
   * Collection history (payments and reversals) for one invoice.
   * @param {number|string} id
   */
  async getInvoicePayments(id) {
    const response = await axiosClient.get(`/invoices/${id}/payments`);
    return response.data;
  },

  /**
   * Full invoice timeline (created, collections, reversals), oldest first.
   * One endpoint for My Collections, MR Invoices and Admin Invoices.
   * @param {number|string} id
   */
  async getInvoiceHistory(id) {
    const response = await axiosClient.get(`/invoices/${id}/history`);
    return response.data;
  },

  /**
   * Send invoice image/PDF to Gemini AI for OCR & field extraction.
   * @param {File} file
   */
  async extractInvoice(file) {
    const formData = new FormData();
    formData.append('file', file);

    const response = await axiosClient.post('/invoices/extract', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  },

  /**
   * Create new invoice.
   * @param {object} invoiceData
   */
  async createInvoice(invoiceData) {
    const response = await axiosClient.post('/invoices', invoiceData);
    return response.data;
  },

  /**
   * Update existing invoice details.
   * @param {number|string} id
   * @param {object} invoiceData
   */
  async updateInvoice(id, invoiceData) {
    const response = await axiosClient.put(`/invoices/${id}`, invoiceData);
    return response.data;
  },

  /**
   * Delete invoice.
   * @param {number|string} id
   */
  async deleteInvoice(id) {
    const response = await axiosClient.delete(`/invoices/${id}`);
    return response.data;
  },
};

