import axiosClient from './axiosClient';

/** Insights page (Admin, read-only figures + MR targets). */
export const insightsApi = {
  async summary(params) {
    const response = await axiosClient.get('/admin/insights', { params });
    return response.data;
  },
  async records(params) {
    const response = await axiosClient.get('/admin/insights/records', { params });
    return response.data;
  },
  async customer(customerId) {
    const response = await axiosClient.get(`/admin/insights/customers/${customerId}`);
    return response.data;
  },
  async targets(month) {
    const response = await axiosClient.get('/admin/insights/targets', { params: month ? { month } : {} });
    return response.data;
  },
  async saveTargets(month, targets) {
    const response = await axiosClient.put('/admin/insights/targets', { month, targets });
    return response.data;
  },
};
