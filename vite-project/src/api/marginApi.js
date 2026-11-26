import axiosClient from './axiosClient';

/** Margin calculator (Admin only). */
export const marginApi = {
  async load() {
    const { data } = await axiosClient.get('/admin/margin');
    return data;
  },
  /** Real customers: name and type only. */
  async customers() {
    const { data } = await axiosClient.get('/admin/margin/customers');
    return data;
  },
  async addProduct() {
    const { data } = await axiosClient.post('/admin/margin/products', {});
    return data;
  },
  async updateProduct(id, changes) {
    const { data } = await axiosClient.patch(`/admin/margin/products/${id}`, changes);
    return data;
  },
  async deleteProduct(id) {
    await axiosClient.delete(`/admin/margin/products/${id}`);
  },
  async addScheme(productId, values = {}) {
    const { data } = await axiosClient.post(`/admin/margin/products/${productId}/schemes`, values);
    return data;
  },
  async updateScheme(id, changes) {
    const { data } = await axiosClient.patch(`/admin/margin/schemes/${id}`, changes);
    return data;
  },
  async deleteScheme(id) {
    await axiosClient.delete(`/admin/margin/schemes/${id}`);
  },
  /** schemeId null = not supplied. */
  async setLink(customerId, productId, schemeId) {
    await axiosClient.put('/admin/margin/links', { customer_id: customerId, product_id: productId, scheme_id: schemeId });
  },
};
