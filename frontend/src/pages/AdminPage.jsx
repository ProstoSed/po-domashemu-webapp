/**
 * AdminPage — панель управления для мамы.
 * Разделы: Заказы | Статистика | Клиенты | Фото-запросы | Рассылка
 */
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useTelegram } from '../hooks/useTelegram'
import {
    fetchOrders, deleteOrder, updateOrderStatus,
    fetchStats, fetchUsers, fetchPhotoRequests, sendBroadcast,
} from '../utils/api'
import './AdminPage.css'

const MAMA_ID = 5513112898
const _extraIds = (import.meta.env.VITE_ADMIN_IDS || '')
    .split(',').map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n))
const ADMIN_IDS = new Set([MAMA_ID, ..._extraIds])

const STATUS_LABEL = {
    new:      { text: 'Новый',      cls: 'status-new' },
    accepted: { text: 'Принят',     cls: 'status-accepted' },
    cooking:  { text: 'Готовится',  cls: 'status-cooking' },
    delivery: { text: 'В доставке', cls: 'status-delivery' },
    ready:    { text: 'Готов',      cls: 'status-ready' },
    closed:   { text: 'Закрыт',     cls: 'status-closed' },
}

const SECTIONS = [
    { key: 'orders',    label: '📋 Заказы' },
    { key: 'stats',     label: '📊 Статистика' },
    { key: 'users',     label: '👥 Клиенты' },
    { key: 'photos',    label: '📷 Фото' },
    { key: 'broadcast', label: '📨 Рассылка' },
]

// ──────────────────────────────────────────
// Вспомогательные компоненты
// ──────────────────────────────────────────

function Spinner({ text }) {
    return (
        <div className="catalog-loading">
            <div className="loading-spinner" />
            <p>{text || 'Загрузка...'}</p>
        </div>
    )
}

function ErrorBox({ msg, onRetry }) {
    return (
        <div className="empty-state">
            <span className="empty-state-emoji">⚠️</span>
            <p className="empty-state-title">Ошибка</p>
            <p className="empty-state-text">{msg}</p>
            {onRetry && (
                <button className="btn btn-primary" onClick={onRetry}>Повторить</button>
            )}
        </div>
    )
}

function EmptyBox({ emoji = '📭', text }) {
    return (
        <div className="empty-state">
            <span className="empty-state-emoji">{emoji}</span>
            <p className="empty-state-title">{text}</p>
        </div>
    )
}

// ──────────────────────────────────────────
// Карточка заказа (с управлением статусами)
// ──────────────────────────────────────────

function OrderCard({ order, onStatusChange, onDelete }) {
    const [expanded, setExpanded] = useState(false)
    const [loading, setLoading] = useState(false)

    const status = order.status || 'new'
    const statusInfo = STATUS_LABEL[status] || { text: status, cls: '' }
    const isClosed = status === 'closed'

    const act = async (fn) => {
        setLoading(true)
        try { await fn() } finally { setLoading(false) }
    }

    const total = order.totals?.grand_total ?? order.total ?? '—'
    const totalStr = typeof total === 'number'
        ? `${total.toLocaleString('ru')} ₽` : total

    const customer = order.customer || {}
    const clientName = customer.first_name || order.user?.first_name || '—'
    const phone = order.phone || customer.phone || '—'
    const orderDate = order.schedule?.date || order.date || null

    return (
        <motion.div
            className={`order-card glass-card ${isClosed ? 'order-card--closed' : ''}`}
            layout
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, height: 0, marginBottom: 0 }}
        >
            {/* Заголовок карточки */}
            <div className="order-header" onClick={() => setExpanded(e => !e)}>
                <div className="order-header-left">
                    <span className="order-id">{order.order_id}</span>
                    <span className={`order-status ${statusInfo.cls}`}>{statusInfo.text}</span>
                </div>
                <div className="order-header-right">
                    <span className="order-total">{totalStr}</span>
                    <span className="order-chevron">{expanded ? '▲' : '▼'}</span>
                </div>
            </div>

            {/* Детали (раскрываются по клику) */}
            <AnimatePresence>
                {expanded && (
                    <motion.div
                        className="order-details"
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.25 }}
                    >
                        <div className="order-detail-row">
                            <span>👤 Клиент:</span>
                            <span>{clientName}</span>
                        </div>
                        <div className="order-detail-row">
                            <span>📞 Телефон:</span>
                            <a href={`tel:${phone}`} className="order-phone">{phone}</a>
                        </div>
                        {(order.delivery?.address || order.address) && (
                            <div className="order-detail-row">
                                <span>📍 Адрес:</span>
                                <span>{order.delivery?.address || order.address}</span>
                            </div>
                        )}
                        {orderDate && (
                            <div className="order-detail-row">
                                <span>📅 Дата:</span>
                                <span>{orderDate}</span>
                            </div>
                        )}
                        {order.payment?.method && (
                            <div className="order-detail-row">
                                <span>💳 Оплата:</span>
                                <span>{order.payment.method === 'cash' ? 'Наличные' : 'Перевод'}</span>
                            </div>
                        )}
                        {order.comment && (
                            <div className="order-detail-row">
                                <span>💬 Коммент:</span>
                                <span>{order.comment}</span>
                            </div>
                        )}

                        {/* Состав заказа */}
                        <div className="order-items-list">
                            {(order.items || []).map((item, i) => (
                                <div key={i} className="order-item-row">
                                    <span>{item.name}</span>
                                    <span className="order-item-qty">
                                        {item.quantity} {item.unit || 'шт'}
                                    </span>
                                </div>
                            ))}
                        </div>

                        {/* Кнопки действий */}
                        <div className="order-actions">
                            {status === 'new' && (
                                <button className="btn btn-success btn-sm"
                                    onClick={() => act(() => onStatusChange(order.order_id, 'accepted'))}
                                    disabled={loading}>
                                    ✅ Принять
                                </button>
                            )}
                            {status === 'accepted' && (
                                <button className="btn btn-primary btn-sm"
                                    onClick={() => act(() => onStatusChange(order.order_id, 'cooking'))}
                                    disabled={loading}>
                                    👩‍🍳 В готовку
                                </button>
                            )}
                            {status === 'cooking' && (<>
                                <button className="btn btn-success btn-sm"
                                    onClick={() => act(() => onStatusChange(order.order_id, 'ready'))}
                                    disabled={loading}>
                                    ✔️ Готов
                                </button>
                                <button className="btn btn-primary btn-sm"
                                    onClick={() => act(() => onStatusChange(order.order_id, 'delivery'))}
                                    disabled={loading}>
                                    🚗 Доставка
                                </button>
                            </>)}
                            {(status === 'ready' || status === 'delivery') && (
                                <button className="btn btn-success btn-sm"
                                    onClick={() => act(() => onStatusChange(order.order_id, 'closed'))}
                                    disabled={loading}>
                                    ✅ Закрыть
                                </button>
                            )}
                            <button
                                className="btn btn-danger btn-sm"
                                onClick={() => {
                                    if (window.confirm(`Удалить заказ ${order.order_id}?`))
                                        act(() => onDelete(order.order_id))
                                }}
                                disabled={loading}>
                                🗑
                            </button>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.div>
    )
}

// ──────────────────────────────────────────
// Секция: Статистика
// ──────────────────────────────────────────

function StatsSection() {
    const [stats, setStats] = useState(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState(null)

    const load = () => {
        setLoading(true)
        setError(null)
        fetchStats()
            .then(setStats)
            .catch(e => setError(e.message))
            .finally(() => setLoading(false))
    }
    useEffect(load, [])

    if (loading) return <Spinner text="Загружаем статистику..." />
    if (error) return <ErrorBox msg={error} onRetry={load} />

    const {
        total_orders = 0, total_revenue = 0, avg_check = 0,
        users_count = 0, status_counts = {}, top_items = [],
    } = stats

    return (
        <div className="stats-section">
            <div className="stats-grid">
                <div className="stat-card glass-card">
                    <div className="stat-icon">📦</div>
                    <div className="stat-value">{total_orders}</div>
                    <div className="stat-label">заказов</div>
                </div>
                <div className="stat-card glass-card">
                    <div className="stat-icon">💰</div>
                    <div className="stat-value">{total_revenue.toLocaleString('ru')} ₽</div>
                    <div className="stat-label">выручка</div>
                </div>
                <div className="stat-card glass-card">
                    <div className="stat-icon">🧾</div>
                    <div className="stat-value">{avg_check.toLocaleString('ru')} ₽</div>
                    <div className="stat-label">средний чек</div>
                </div>
                <div className="stat-card glass-card">
                    <div className="stat-icon">👥</div>
                    <div className="stat-value">{users_count}</div>
                    <div className="stat-label">клиентов</div>
                </div>
            </div>

            {/* Заказы по статусам */}
            {Object.keys(status_counts).length > 0 && (
                <div className="stats-row glass-card">
                    <div className="stats-row-title">По статусам</div>
                    {Object.entries(STATUS_LABEL).map(([key, info]) =>
                        (status_counts[key] || 0) > 0 ? (
                            <div key={key} className="stats-status-row">
                                <span className={`order-status ${info.cls}`}>{info.text}</span>
                                <span className="stats-count">{status_counts[key]}</span>
                            </div>
                        ) : null
                    )}
                </div>
            )}

            {/* Топ товаров */}
            {top_items.length > 0 && (
                <div className="stats-row glass-card">
                    <div className="stats-row-title">🏆 Топ товаров</div>
                    {top_items.map((item, i) => (
                        <div key={i} className="stats-item-row">
                            <span className="stats-item-rank">#{i + 1}</span>
                            <span className="stats-item-name">{item.name}</span>
                            <span className="stats-count">{item.count} шт</span>
                        </div>
                    ))}
                </div>
            )}
        </div>
    )
}

// ──────────────────────────────────────────
// Секция: Клиенты
// ──────────────────────────────────────────

function UsersSection() {
    const [users, setUsers] = useState([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState(null)

    const load = () => {
        setLoading(true)
        setError(null)
        fetchUsers()
            .then(d => setUsers(d.users || []))
            .catch(e => setError(e.message))
            .finally(() => setLoading(false))
    }
    useEffect(load, [])

    if (loading) return <Spinner text="Загружаем клиентов..." />
    if (error) return <ErrorBox msg={error} onRetry={load} />
    if (users.length === 0) return <EmptyBox emoji="👥" text="Клиентов пока нет" />

    return (
        <div className="users-section">
            <p className="section-count">Клиентов: <b>{users.length}</b></p>
            {users.map(u => (
                <div key={u.user_id} className="user-card glass-card">
                    <div className="user-avatar">
                        {(u.first_name || '?')[0].toUpperCase()}
                    </div>
                    <div className="user-info">
                        <div className="user-name">
                            {u.first_name} {u.last_name || ''}
                            {u.username && (
                                <span className="user-username"> @{u.username}</span>
                            )}
                        </div>
                        <div className="user-meta">
                            <span>📦 {u.orders_count || 0} заказов</span>
                            {u.phone && <span> · 📞 {u.phone}</span>}
                        </div>
                        {u.last_seen && (
                            <div className="user-last-seen">
                                🕐 {u.last_seen.slice(0, 10)}
                            </div>
                        )}
                    </div>
                </div>
            ))}
        </div>
    )
}

// ──────────────────────────────────────────
// Секция: Запросы на фото
// ──────────────────────────────────────────

const PHOTO_STATUS = {
    open:      { text: 'Ожидает',  cls: 'status-new' },
    fulfilled: { text: 'Выполнен', cls: 'status-closed' },
    rejected:  { text: 'Отклонён', cls: 'status-delivery' },
}

function PhotoRequestsSection() {
    const [requests, setRequests] = useState([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState(null)

    const load = () => {
        setLoading(true)
        setError(null)
        fetchPhotoRequests()
            .then(d => setRequests(d.requests || []))
            .catch(e => setError(e.message))
            .finally(() => setLoading(false))
    }
    useEffect(load, [])

    if (loading) return <Spinner text="Загружаем запросы..." />
    if (error) return <ErrorBox msg={error} onRetry={load} />
    if (requests.length === 0) return <EmptyBox emoji="📷" text="Запросов на фото нет" />

    const open = requests.filter(r => r.status === 'open')
    const done = requests.filter(r => r.status !== 'open')

    const RequestCard = ({ r }) => {
        const ps = PHOTO_STATUS[r.status] || { text: r.status, cls: '' }
        return (
            <div className="photo-card glass-card">
                <div className="photo-card-header">
                    <span className="order-id">{r.req_id}</span>
                    <span className={`order-status ${ps.cls}`}>{ps.text}</span>
                </div>
                <div className="photo-card-item">📷 {r.item_name}</div>
                <div className="photo-card-user">
                    👤 {r.first_name}{r.username ? ` (@${r.username})` : ''}
                </div>
                <div className="photo-card-date">
                    🕐 {(r.created_at || '').slice(0, 10)}
                </div>
            </div>
        )
    }

    return (
        <div className="photos-section">
            <p className="section-count">
                Запросов: <b>{requests.length}</b> · открытых: <b>{open.length}</b>
            </p>
            {open.length > 0 && (
                <>
                    <div className="section-subheader">Ожидают ответа</div>
                    {open.map(r => <RequestCard key={r.req_id} r={r} />)}
                </>
            )}
            {done.length > 0 && (
                <>
                    <div className="section-subheader">Выполненные</div>
                    {done.map(r => <RequestCard key={r.req_id} r={r} />)}
                </>
            )}
        </div>
    )
}

// ──────────────────────────────────────────
// Секция: Рассылка
// ──────────────────────────────────────────

function BroadcastSection() {
    const [text, setText] = useState('')
    const [sending, setSending] = useState(false)
    const [result, setResult] = useState(null)

    const handleSend = async () => {
        if (!text.trim()) {
            alert('Напишите текст сообщения')
            return
        }
        const preview = text.length > 80 ? text.slice(0, 80) + '…' : text
        if (!window.confirm(`Отправить сообщение всем клиентам?\n\n«${preview}»`)) return

        setSending(true)
        setResult(null)
        try {
            const r = await sendBroadcast(text.trim())
            setResult({ ok: true, ...r })
        } catch (e) {
            setResult({ ok: false, error: e.message })
        } finally {
            setSending(false)
        }
    }

    return (
        <div className="broadcast-section">
            <div className="glass-card broadcast-card">
                <p className="broadcast-hint">
                    💡 Сообщение придёт всем клиентам в Telegram.<br />
                    Поддерживается HTML: <code>&lt;b&gt;жирный&lt;/b&gt;</code>,{' '}
                    <code>&lt;i&gt;курсив&lt;/i&gt;</code>
                </p>
                <textarea
                    className="form-input form-textarea"
                    placeholder="Текст рассылки..."
                    value={text}
                    onChange={e => setText(e.target.value)}
                    rows={5}
                />
                <button
                    className="btn btn-primary btn-block"
                    style={{ marginTop: '0.75rem' }}
                    onClick={handleSend}
                    disabled={sending || !text.trim()}
                >
                    {sending ? '⏳ Отправляем...' : '📨 Отправить рассылку'}
                </button>
                {result && (
                    <div className={`broadcast-result ${result.ok ? 'broadcast-result--ok' : 'broadcast-result--err'}`}>
                        {result.ok
                            ? `✅ Отправлено: ${result.sent}, не доставлено: ${result.failed}`
                            : `❌ Ошибка: ${result.error}`}
                    </div>
                )}
            </div>
        </div>
    )
}

// ──────────────────────────────────────────
// Главная страница AdminPage
// ──────────────────────────────────────────

export default function AdminPage() {
    const { user } = useTelegram()
    const navigate = useNavigate()
    const [section, setSection] = useState('orders')
    const [orders, setOrders] = useState([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState(null)
    const [filter, setFilter] = useState('active')

    const isMama = !user || ADMIN_IDS.has(user.id)

    useEffect(() => {
        if (!isMama) return
        loadOrders()
    }, [isMama])

    async function loadOrders() {
        setLoading(true)
        setError(null)
        try {
            const data = await fetchOrders()
            setOrders(data.orders || [])
        } catch (err) {
            setError(err.message)
        } finally {
            setLoading(false)
        }
    }

    const handleStatusChange = async (id, status) => {
        await updateOrderStatus(id, status)
        setOrders(prev => prev.map(o =>
            o.order_id === id ? { ...o, status } : o
        ))
    }

    const handleDelete = async (id) => {
        await deleteOrder(id)
        setOrders(prev => prev.filter(o => o.order_id !== id))
    }

    // Не мама — заглушка
    if (user && !ADMIN_IDS.has(user.id)) {
        return (
            <div className="empty-state">
                <span className="empty-state-emoji">🔒</span>
                <p className="empty-state-title">Нет доступа</p>
                <button className="btn btn-primary" onClick={() => navigate('/')}>На главную</button>
            </div>
        )
    }

    const filtered = orders.filter(o => {
        if (filter === 'active') return o.status !== 'closed'
        if (filter === 'closed') return o.status === 'closed'
        return true
    })
    const activeCount = orders.filter(o => o.status !== 'closed').length

    return (
        <div className="admin-page">
            <motion.button
                className="back-button"
                onClick={() => navigate('/')}
                whileTap={{ scale: 0.95 }}
            >
                ← Назад
            </motion.button>

            <div className="admin-header">
                <h2 className="admin-title">🥧 Панель управления</h2>
                {section === 'orders' && !loading && (
                    <p className="admin-subtitle">
                        Активных: <b>{activeCount}</b> / всего: <b>{orders.length}</b>
                    </p>
                )}
            </div>

            {/* Навигация по разделам */}
            <div className="admin-sections">
                {SECTIONS.map(s => (
                    <button
                        key={s.key}
                        className={`admin-section-btn ${section === s.key ? 'active' : ''}`}
                        onClick={() => setSection(s.key)}
                    >
                        {s.label}
                    </button>
                ))}
            </div>

            {/* Раздел: Заказы */}
            {section === 'orders' && (
                <>
                    <div className="admin-tabs">
                        {[
                            { key: 'active', label: 'Активные' },
                            { key: 'all',    label: 'Все' },
                            { key: 'closed', label: 'Закрытые' },
                        ].map(tab => (
                            <button
                                key={tab.key}
                                className={`admin-tab ${filter === tab.key ? 'active' : ''}`}
                                onClick={() => setFilter(tab.key)}
                            >
                                {tab.label}
                            </button>
                        ))}
                        <button className="admin-tab admin-tab-refresh" onClick={loadOrders}>
                            ↻
                        </button>
                    </div>

                    {loading && <Spinner text="Загружаем заказы..." />}
                    {error && <ErrorBox msg={error} onRetry={loadOrders} />}
                    {!loading && !error && filtered.length === 0 && (
                        <EmptyBox text="Заказов нет" />
                    )}
                    {!loading && !error && (
                        <div className="orders-list">
                            <AnimatePresence>
                                {filtered.map(order => (
                                    <OrderCard
                                        key={order.order_id}
                                        order={order}
                                        onStatusChange={handleStatusChange}
                                        onDelete={handleDelete}
                                    />
                                ))}
                            </AnimatePresence>
                        </div>
                    )}
                </>
            )}

            {section === 'stats'     && <StatsSection />}
            {section === 'users'     && <UsersSection />}
            {section === 'photos'    && <PhotoRequestsSection />}
            {section === 'broadcast' && <BroadcastSection />}
        </div>
    )
}
