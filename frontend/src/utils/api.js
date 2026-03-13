/**
 * api.js — обёртка для fetch-запросов к backend API.
 * Автоматически добавляет Telegram initData для admin-запросов.
 */

const API_BASE = import.meta.env.VITE_API_URL || ''

/**
 * Получить Telegram initData (для авторизации как админ)
 */
function getInitData() {
    return window.Telegram?.WebApp?.initData || ''
}

/**
 * Базовый fetch с обработкой ошибок и retry при сетевых сбоях
 */
async function apiFetch(path, options = {}, retries = 3) {
    try {
        const res = await fetch(`${API_BASE}${path}`, options)
        if (!res.ok) {
            const body = await res.json().catch(() => ({}))
            throw new Error(body.detail || `HTTP ${res.status}`)
        }
        return res.json()
    } catch (err) {
        if (retries > 0 && (err.name === 'TypeError' || err.message === 'Failed to fetch')) {
            const delay = (4 - retries) * 1000  // 1с, 2с, 3с
            await new Promise(r => setTimeout(r, delay))
            return apiFetch(path, options, retries - 1)
        }
        throw err
    }
}

// ── Публичные ──────────────────────────────

export async function geocodeAddress(address) {
    return apiFetch('/api/geocode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address }),
    })
}

export async function fetchPrices() {
    // Цены берём из статичного public/prices.json
    // Работает везде: локально (Vite отдаёт public/) и на GitHub Pages
    const res = await fetch(`${import.meta.env.BASE_URL}prices.json`)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return res.json()
}

export async function submitOrder(orderData) {
    return apiFetch('/api/orders', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-init-data': getInitData(),
        },
        body: JSON.stringify(orderData),
    })
}

export async function checkAdmin() {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 5000)
    try {
        return await apiFetch('/api/check-admin', {
            headers: { 'x-init-data': getInitData() },
            signal: controller.signal,
        }, 0)
    } finally {
        clearTimeout(timer)
    }
}

// ── Админ (требуют initData мамы) ──────────

function adminHeaders() {
    return {
        'Content-Type': 'application/json',
        'x-init-data': getInitData(),
    }
}

export async function fetchOrders() {
    return apiFetch('/api/admin/orders', { headers: adminHeaders() })
}

export async function closeOrder(orderId) {
    return apiFetch(`/api/admin/orders/${orderId}/close`, {
        method: 'POST',
        headers: adminHeaders(),
    })
}

export async function deleteOrder(orderId) {
    return apiFetch(`/api/admin/orders/${orderId}`, {
        method: 'DELETE',
        headers: adminHeaders(),
    })
}

export async function updateOrderStatus(orderId, status) {
    return apiFetch(`/api/admin/orders/${orderId}/status`, {
        method: 'PATCH',
        headers: adminHeaders(),
        body: JSON.stringify({ status }),
    })
}

export async function fetchStats() {
    return apiFetch('/api/admin/stats', { headers: adminHeaders() })
}

export async function fetchUsers() {
    return apiFetch('/api/admin/users', { headers: adminHeaders() })
}

export async function fetchPhotoRequests() {
    return apiFetch('/api/admin/photo-requests', { headers: adminHeaders() })
}

export async function sendBroadcast(text) {
    return apiFetch('/api/admin/broadcast', {
        method: 'POST',
        headers: adminHeaders(),
        body: JSON.stringify({ text }),
    })
}

export async function fetchReminders() {
    return apiFetch('/api/admin/reminders', { headers: adminHeaders() })
}

export async function remindSleeping(text) {
    return apiFetch('/api/admin/remind-sleeping', {
        method: 'POST',
        headers: adminHeaders(),
        body: JSON.stringify({ text }),
    })
}

export async function fulfillPhotoRequest(reqId, file) {
    const form = new FormData()
    form.append('file', file)
    // Content-Type не указываем — браузер сам ставит с boundary
    return apiFetch(`/api/admin/photo-requests/${reqId}/fulfill`, {
        method: 'POST',
        headers: { 'x-init-data': getInitData() },
        body: form,
    })
}

export async function rejectPhotoRequest(reqId) {
    return apiFetch(`/api/admin/photo-requests/${reqId}/reject`, {
        method: 'POST',
        headers: adminHeaders(),
    })
}

export async function syncPrices() {
    return apiFetch('/api/admin/sync-prices', {
        method: 'POST',
        headers: adminHeaders(),
    })
}

export async function fetchUserOrders(userId) {
    return apiFetch(`/api/admin/users/${userId}/orders`, {
        headers: adminHeaders(),
    })
}

export async function fetchAdmins() {
    return apiFetch('/api/admin/admins', { headers: adminHeaders() })
}

export async function addAdmin(userId, username, firstName) {
    return apiFetch('/api/admin/admins', {
        method: 'POST',
        headers: adminHeaders(),
        body: JSON.stringify({ user_id: userId, username, first_name: firstName }),
    })
}

export async function removeAdmin(userId) {
    return apiFetch(`/api/admin/admins/${userId}`, {
        method: 'DELETE',
        headers: adminHeaders(),
    })
}

export async function searchUsers(query) {
    return apiFetch(`/api/admin/users-search?q=${encodeURIComponent(query)}`, {
        headers: adminHeaders(),
    })
}

// ── Клиент (требуют initData пользователя) ──

function userHeaders() {
    return {
        'Content-Type': 'application/json',
        'x-init-data': getInitData(),
    }
}

export async function fetchMyOrders() {
    return apiFetch('/api/orders/my', { headers: userHeaders() })
}

export async function fetchMyPhotoRequests() {
    return apiFetch('/api/photo-requests/my', { headers: userHeaders() })
}

export async function createPhotoRequest(itemKey, itemId, itemName) {
    return apiFetch('/api/photo-requests', {
        method: 'POST',
        headers: userHeaders(),
        body: JSON.stringify({ item_key: itemKey, item_id: itemId, item_name: itemName }),
    })
}

export async function fetchMyReferral() {
    return apiFetch('/api/referral/my', { headers: userHeaders() })
}

export async function askAssistant(message) {
    return apiFetch('/api/assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message }),
    }, 0) // без retry (запрос долгий + 503 не нужно повторять)
}
