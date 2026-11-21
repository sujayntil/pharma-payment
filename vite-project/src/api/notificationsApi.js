import axiosClient from './axiosClient';

export const notificationsApi = {
  async getPublicKey() {
    const { data } = await axiosClient.get('/notifications/vapid-public-key');
    return data.public_key;
  },
  async save(subscription) {
    await axiosClient.post('/notifications/subscriptions', subscription);
  },
  /** Admin bell: newest collections and how many are new. */
  async recent(limit = 20) {
    const { data } = await axiosClient.get('/notifications/recent', { params: { limit } });
    return data;
  },
  /** Admin bell opened: everything so far is seen (on every device). */
  async markSeen() {
    await axiosClient.post('/notifications/seen');
  },
  /** MR bell: payments the office recorded or reversed on my invoices. */
  async mine(limit = 10) {
    const { data } = await axiosClient.get('/notifications/mine', { params: { limit } });
    return data;
  },
  async clearMine() {
    await axiosClient.post('/notifications/mine/clear');
  },
  async markMineSeen() {
    await axiosClient.post('/notifications/mine/seen');
  },
  /** Send a real test alert to my devices; returns what happened. */
  async test() {
    const { data } = await axiosClient.post('/notifications/test');
    return data;
  },
  async remove(endpoint) {
    await axiosClient.delete('/notifications/subscriptions', { data: { endpoint } });
  },
};
