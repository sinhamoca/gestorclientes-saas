import axios from 'axios'

const API_URL = import.meta.env.VITE_API_URL || '/api/v1'

export const api = axios.create({ baseURL: API_URL, headers: { 'Content-Type': 'application/json' } })

api.interceptors.request.use((c) => {
  const t = localStorage.getItem('token')
  if (t) c.headers.Authorization = `Bearer ${t}`
  return c
})

api.interceptors.response.use((r) => r, (e) => {
  if (e.response?.status === 401) { localStorage.clear(); window.location.href = '/login' }
  return Promise.reject(e)
})

// ── Auth ──
export const authApi = {
  login: (email: string, password: string) => api.post('/auth/login', { email, password }),
  changePassword: (data: { currentPassword?: string; newPassword: string }) => api.put('/auth/change-password', data),
  me: () => api.get('/auth/me'),
}

// ── Super Admin ──
export const superAdminApi = {
  listAdmins: () => api.get('/super-admin/admins'),
  getAdmin: (id: string) => api.get(`/super-admin/admins/${id}`),
  createAdmin: (d: { name: string; email: string; password: string }) => api.post('/super-admin/admins', d),
  updateAdmin: (id: string, d: { name?: string; isActive?: boolean }) => api.put(`/super-admin/admins/${id}`, d),
  resetPassword: (id: string, newPassword: string) => api.post(`/super-admin/admins/${id}/reset-password`, { newPassword }),
}

// ── Admin ──
export const adminApi = {
  listUsers: () => api.get('/admin/users'),
  getUser: (id: string) => api.get(`/admin/users/${id}`),
  createUser: (d: { name: string; email: string; password: string }) => api.post('/admin/users', d),
  updateUser: (id: string, d: { name?: string; isActive?: boolean }) => api.put(`/admin/users/${id}`, d),
  resetPassword: (id: string, newPassword: string) => api.post(`/admin/users/${id}/reset-password`, { newPassword }),
}

// ── User ──
export const userApi = {
  getStats: (from?: string, to?: string) => api.get('/user/stats', { params: { from, to } }),
  getPayments: (p: Record<string, unknown>) => api.get('/user/payments', { params: p }),
  getPayment: (id: string) => api.get(`/user/payments/${id}`),
  getGateways: () => api.get('/user/gateways'),
  configGateway: (d: { gateway: string; credentials: Record<string, string>; isPrimary?: boolean }) => api.post('/user/gateways', d),
  toggleGateway: (id: string) => api.patch(`/user/gateways/${id}/toggle`),
  testGateway: (id: string) => api.post(`/user/gateways/${id}/test`),
  testPayment: (id: string) => api.post(`/user/gateways/${id}/test-payment`),
  getFees: () => api.get('/user/fees'),
  configFee: (d: { method: string; feeType: string; feeValue: number }) => api.post('/user/fees', d),
  getRouting: () => api.get('/user/routing'),
  saveRouting: (routes: { method: string; gatewayConfigId: string | null }[]) => api.put('/user/routing', { routes }),
  getApiKeys: () => api.get('/user/api-keys'),
  createApiKey: (label?: string) => api.post('/user/api-keys', { label }),
  toggleApiKey: (id: string) => api.patch(`/user/api-keys/${id}/toggle`),
  deleteApiKey: (id: string) => api.delete(`/user/api-keys/${id}`),
  getWebhooks: (page?: number) => api.get('/user/webhooks', { params: { page } }),
  getWebhookConfig: () => api.get('/user/webhook-config'),
  saveWebhookConfig: (d: { webhookCallbackUrl: string | null; webhookCallbackSecret?: string | null }) => api.put('/user/webhook-config', d),
}
