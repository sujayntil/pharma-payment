import axiosClient from './axiosClient';

export const adminApi = {
  /**
   * Get Admin dashboard metrics.
   * @param {object} params - { date_from, date_to }
   */
  async getDashboard(params = {}) {
    const response = await axiosClient.get('/admin/dashboard', { params });
    return response.data;
  },

  /**
   * Get MR collection performance table.
   * @param {object} params - { date_from, date_to }
   */
  async getMrPerformance(params = {}) {
    const response = await axiosClient.get('/admin/mr-performance', { params });
    return response.data;
  },

  /**
   * Get large outstanding alerts.
   * @param {number} threshold - default 50000
   */
  async getOutstandingAlerts(threshold = 50000) {
    const response = await axiosClient.get('/admin/outstanding-alerts', {
      params: { threshold },
    });
    return response.data;
  },

  /**
   * Get list of users (Admin and MRs).
   */
  async getUsers() {
    const response = await axiosClient.get('/admin/users');
    return response.data;
  },

  /**
   * Create new user.
   * @param {object} userData - { name, employee_code, role, phone, password }
   */
  async createUser(userData) {
    const response = await axiosClient.post('/admin/users', userData);
    return response.data;
  },

  /**
   * Update user details.
   * @param {number|string} userId
   * @param {object} userData - { name, phone, role, password }
   */
  async updateUser(userId, userData) {
    const response = await axiosClient.put(`/admin/users/${userId}`, userData);
    return response.data;
  },

  /**
   * Delete user.
   * @param {number|string} userId
   */
  async deleteUser(userId) {
    const response = await axiosClient.delete(`/admin/users/${userId}`);
    return response.data;
  },
};

