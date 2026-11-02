import axiosClient from './axiosClient';

export const notificationsApi = {
  async getPublicKey() {
    const { data } = await axiosClient.get('/notifications/vapid-public-key');
    return data.public_key;
  },
  async save(subscription) {
    await axiosClient.post('/notifications/subscriptions', subscription);
  },
  async remove(endpoint) {
    await axiosClient.delete('/notifications/subscriptions', { data: { endpoint } });
  },
};
