import axiosClient from './axiosClient';

export const auditApi = {
  /** Admin Audit log: everyone's actions, newest first (read-only). */
  async list(params = {}) {
    const response = await axiosClient.get('/admin/audit', { params });
    return response.data;
  },
};
