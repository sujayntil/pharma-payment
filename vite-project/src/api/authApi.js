import axiosClient from './axiosClient';

export const authApi = {
  /**
   * Ends this session on the server, so the token stops working now and not
   * only when it expires. The token is passed in because it is removed from
   * storage straight after. Failing (offline, already expired) is harmless.
   * @param {string} token
   */
  async logout(token) {
    if (!token) return;
    await axiosClient.post('/auth/logout', null, { headers: { Authorization: `Bearer ${token}` } });
  },

  /** Renews a kept session for another 30 days. */
  async refresh() {
    const response = await axiosClient.post('/auth/refresh');
    return response.data;
  },

  async getCurrentUser() {
    const response = await axiosClient.get('/auth/me');
    return response.data;
  },

  /**
   * Log in with employee code (as username) and password.
   * @param {string} employeeCode
   * @param {string} password
   * @returns {Promise<{access_token: string, token_type: string, role: string, name: string, user_id: number}>}
   */
  async login(employeeCode, password, remember = true) {
    const params = new URLSearchParams();
    params.append('username', employeeCode.trim());
    params.append('password', password);
    // "Keep me signed in": a 30-day session renewed while used; off = 12 hours.
    params.append('remember', remember ? 'true' : 'false');

    const response = await axiosClient.post('/auth/login', params, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    });
    return response.data;
  },
};

