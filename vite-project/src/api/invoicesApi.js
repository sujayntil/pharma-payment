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

