import axiosClient from './axiosClient';

export const authApi = {
  /**
   * Log in with employee code (as username) and password.
   * @param {string} employeeCode
   * @param {string} password
   * @returns {Promise<{access_token: string, token_type: string, role: string, name: string, user_id: number}>}
   */
  async login(employeeCode, password) {
    const params = new URLSearchParams();
    params.append('username', employeeCode.trim());
    params.append('password', password);

    const response = await axiosClient.post('/auth/login', params, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    });
    return response.data;
  },
};

