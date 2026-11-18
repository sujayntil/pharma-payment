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
  async getOutstanding(params = {}) {
    const response = await axiosClient.get('/mr/outstanding', { params });
    return response.data;
  },

  /**
   * This MR's customers with invoices unpaid for 40+ days.
   */
  async getOverdueAlerts() {
    const response = await axiosClient.get('/mr/overdue-alerts');
    return response.data;
  },

  /** Trophy counter and list: one trophy per cleared invoice month. */
  async getTrophies() {
    const response = await axiosClient.get('/mr/trophies');
    return response.data;
  },

  /** Cleared months not celebrated yet (Admin collected the last invoice, or the month just ended). Each comes once. */
  async claimMonthsCleared() {
    const response = await axiosClient.post('/mr/months-cleared/claim');
    return response.data?.months || [];
  },
};
