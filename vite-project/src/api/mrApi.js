import axiosClient from './axiosClient';

export const mrApi = {
  /**
   * Get MR personal dashboard metrics & recent invoices.
   */
  async getDashboard() {
    const response = await axiosClient.get('/mr/dashboard');
    return response.data;
  },

  /**
   * Get outstanding invoices for current MR.
   */
  async getOutstanding() {
    const response = await axiosClient.get('/mr/outstanding');
    return response.data;
  },
};

