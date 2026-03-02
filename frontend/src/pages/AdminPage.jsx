/**
 * AdminPage — панель управления для мамы.
 * Разделы: Заказы | Статистика | Клиенты | Фото-запросы | Рассылка
 */
import { useEffect, useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useTelegram } from '../hooks/useTelegram'
import {
    fetchOrders, deleteOrder, updateOrderStatus,
    fetchStats, fetchUsers, fetchPhotoRequests, sendBroadcast,
    fetchReminders, remindSleeping, fulfillPhotoRequest, rejectPhotoRequest,
    syncPrices, fetchUserOrders,
} from '../utils/api'
import './AdminPage.css'

const MAMA_ID = 5513112898
const _extraIds = (import.meta.env.VITE_ADMIN_IDS || '')
    .split(',').map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n))
const ADMIN_IDS = new Set([MAMA_ID, ..._extraIds])
const IS_DEV = import.meta.env.DEV

const STATUS_LABEL = {
    new:      { text: 'Новый',      cls: 'status-new' },
    accepted: { text: 'Принят',     cls: 'status-accepted' },
    cooking:  { text: 'Готовится',  cls: 'status-cooking' },
    delivery: { text: 'В доставке', cls: 'status-delivery' },
    ready:    { text: 'Готов',      cls: 'status-ready' },
    closed:   { text: 'Закрыт',     cls: 'status-closed' },
}

const SECTIONS_ROW1 = [
    { key: 'orders',    label: '📋 Заказы' },
    { key: 'stats',     label: '📊 Статистика' },
    { key: 'users',     label: '👥 Клиенты' },
]
const SECTIONS_ROW2 = [
    { key: 'photos',    label: '📷 Фото' },
    { key: 'reminders', label: '⏰ Напоминалки' },
    { key: 'broadcast', label: '📨 Рассылка' },
]
const SECTIONS = [...SECTIONS_ROW1, ...SECTIONS_ROW2]

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
                        <div className="order-detail-row">
                            <span>{order.delivery?.type === 'delivery' ? '🚗 Доставка:' : '🏠 Получение:'}</span>
                            <span>{order.delivery?.type === 'delivery' ? 'Доставка' : 'Самовывоз'}</span>
                        </div>
                        {order.delivery?.address && (
                            <div className="order-detail-row">
                                <span>📍 Адрес:</span>
                                <span>{order.delivery.address}</span>
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
                            {(order.items || []).map((item, i) => {
                                const qty = item.quantity ?? 1
                                const ppu = item.price_per_unit ?? 0
                                const lineTotal = item.total ?? (ppu * qty)
                                return (
                                    <div key={i} className="order-item-row">
                                        <span className="order-item-name">{item.name}</span>
                                        <span className="order-item-qty">
                                            {qty} {item.unit || 'шт'}
                                            {ppu > 0 && ` × ${ppu.toLocaleString('ru')} ₽`}
                                            {lineTotal > 0 && ` = ${lineTotal.toLocaleString('ru')} ₽`}
                                        </span>
                                    </div>
                                )
                            })}
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
    const [expandedUser, setExpandedUser] = useState(null)
    const [expandedOrder, setExpandedOrder] = useState(null)
    const [userOrders, setUserOrders] = useState({})
    const [ordersLoading, setOrdersLoading] = useState(null)

    const load = () => {
        setLoading(true)
        setError(null)
        fetchUsers()
            .then(d => setUsers(d.users || []))
            .catch(e => setError(e.message))
            .finally(() => setLoading(false))
    }
    useEffect(load, [])

    const handleUserClick = async (userId) => {
        if (expandedUser === userId) {
            setExpandedUser(null)
            setExpandedOrder(null)
            return
        }
        setExpandedUser(userId)
        setExpandedOrder(null)
        if (!userOrders[userId]) {
            setOrdersLoading(userId)
            try {
                const data = await fetchUserOrders(userId)
                setUserOrders(prev => ({ ...prev, [userId]: data.orders || [] }))
            } catch {
                setUserOrders(prev => ({ ...prev, [userId]: [] }))
            } finally {
                setOrdersLoading(null)
            }
        }
    }

    if (loading) return <Spinner text="Загружаем клиентов..." />
    if (error) return <ErrorBox msg={error} onRetry={load} />
    if (users.length === 0) return <EmptyBox emoji="👥" text="Клиентов пока нет" />

    return (
        <div className="users-section">
            <p className="section-count">Клиентов: <b>{users.length}</b></p>
            {users.map(u => {
                const isExpanded = expandedUser === u.user_id
                const orders = userOrders[u.user_id] || []
                const isLoadingOrders = ordersLoading === u.user_id

                return (
                    <div key={u.user_id} className="user-tree-node">
                        <div
                            className={`user-card glass-card ${isExpanded ? 'user-card--expanded' : ''}`}
                            onClick={() => handleUserClick(u.user_id)}
                            style={{ cursor: 'pointer' }}
                        >
                            <div className="user-avatar">
                                {(u.first_name || '?')[0].toUpperCase()}
                            </div>
                            <div className="user-info">
                                <div className="user-name">
                                    {u.first_name} {u.last_name || ''}
                                    {u.username && (
                                        <a
                                            href={`https://t.me/${u.username}`}
                                            className="user-link"
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            onClick={e => e.stopPropagation()}
                                        >
                                            @{u.username}
                                        </a>
                                    )}
                                </div>
                                <div className="user-meta">
                                    <span>📦 {u.orders_count || 0} заказов</span>
                                    {u.phone && (
                                        <a
                                            href={`tel:${u.phone}`}
                                            className="user-phone-link"
                                            onClick={e => e.stopPropagation()}
                                        >
                                            📞 {u.phone}
                                        </a>
                                    )}
                                </div>
                                {u.last_seen && (
                                    <div className="user-last-seen">
                                        🕐 {u.last_seen.slice(0, 10)}
                                    </div>
                                )}
                            </div>
                            <span className="user-chevron">{isExpanded ? '▲' : '▼'}</span>
                        </div>

                        <AnimatePresence>
                            {isExpanded && (
                                <motion.div
                                    className="user-orders-tree"
                                    initial={{ height: 0, opacity: 0 }}
                                    animate={{ height: 'auto', opacity: 1 }}
                                    exit={{ height: 0, opacity: 0 }}
                                    transition={{ duration: 0.25 }}
                                >
                                    {isLoadingOrders ? (
                                        <div className="tree-loading">Загрузка заказов...</div>
                                    ) : orders.length === 0 ? (
                                        <div className="tree-empty">Заказов нет</div>
                                    ) : (
                                        orders.map(order => {
                                            const isOrderExp = expandedOrder === order.order_id
                                            const st = STATUS_LABEL[order.status] || { text: order.status, cls: '' }
                                            const total = order.totals?.grand_total ?? order.total ?? 0

                                            return (
                                                <div key={order.order_id} className="tree-order-node">
                                                    <div
                                                        className="tree-order-header"
                                                        onClick={() => setExpandedOrder(isOrderExp ? null : order.order_id)}
                                                    >
                                                        <span className="tree-line" />
                                                        <span className="tree-order-id">{order.order_id}</span>
                                                        <span className={`order-status ${st.cls}`}>{st.text}</span>
                                                        <span className="tree-order-total">
                                                            {typeof total === 'number' ? `${total.toLocaleString('ru')} ₽` : '—'}
                                                        </span>
                                                        <span className="tree-chevron">{isOrderExp ? '▲' : '▼'}</span>
                                                    </div>

                                                    <AnimatePresence>
                                                        {isOrderExp && (
                                                            <motion.div
                                                                className="tree-order-details"
                                                                initial={{ height: 0, opacity: 0 }}
                                                                animate={{ height: 'auto', opacity: 1 }}
                                                                exit={{ height: 0, opacity: 0 }}
                                                            >
                                                                {(order.items || []).map((it, i) => (
                                                                    <div key={i} className="tree-item-row">
                                                                        <span className="tree-line tree-line--deep" />
                                                                        <span>{it.name}</span>
                                                                        <span className="tree-item-qty">
                                                                            {it.quantity || 1} {it.unit || 'шт'}
                                                                            {it.total ? ` = ${it.total.toLocaleString('ru')} ₽` : ''}
                                                                        </span>
                                                                    </div>
                                                                ))}
                                                                {order.schedule?.date && (
                                                                    <div className="tree-detail-row">
                                                                        <span className="tree-line tree-line--deep" />
                                                                        📅 {order.schedule.date}
                                                                    </div>
                                                                )}
                                                                {order.delivery?.address && (
                                                                    <div className="tree-detail-row">
                                                                        <span className="tree-line tree-line--deep" />
                                                                        📍 {order.delivery.address}
                                                                    </div>
                                                                )}
                                                                {order.payment?.method && (
                                                                    <div className="tree-detail-row">
                                                                        <span className="tree-line tree-line--deep" />
                                                                        💳 {order.payment.method === 'cash' ? 'Наличные' : 'Перевод'}
                                                                    </div>
                                                                )}
                                                            </motion.div>
                                                        )}
                                                    </AnimatePresence>
                                                </div>
                                            )
                                        })
                                    )}
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>
                )
            })}
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
    const [acting, setActing] = useState({}) // reqId → 'fulfilling'|'rejecting'
    const fileInputRef = useRef(null)
    const pendingReqId = useRef(null)

    const load = () => {
        setLoading(true)
        setError(null)
        fetchPhotoRequests()
            .then(d => setRequests(d.requests || []))
            .catch(e => setError(e.message))
            .finally(() => setLoading(false))
    }
    useEffect(load, [])

    const handleFulfillClick = (reqId) => {
        pendingReqId.current = reqId
        fileInputRef.current?.click()
    }

    const handleFileChosen = async (e) => {
        const file = e.target.files?.[0]
        const reqId = pendingReqId.current
        e.target.value = ''
        if (!file || !reqId) return

        setActing(prev => ({ ...prev, [reqId]: 'fulfilling' }))
        try {
            await fulfillPhotoRequest(reqId, file)
            setRequests(prev => prev.map(r =>
                r.req_id === reqId ? { ...r, status: 'fulfilled' } : r
            ))
        } catch (err) {
            alert(`Ошибка: ${err.message}`)
        } finally {
            setActing(prev => ({ ...prev, [reqId]: null }))
        }
    }

    const handleReject = async (reqId) => {
        if (!window.confirm('Отклонить этот запрос? Пользователь получит уведомление.')) return
        setActing(prev => ({ ...prev, [reqId]: 'rejecting' }))
        try {
            await rejectPhotoRequest(reqId)
            setRequests(prev => prev.map(r =>
                r.req_id === reqId ? { ...r, status: 'rejected' } : r
            ))
        } catch (err) {
            alert(`Ошибка: ${err.message}`)
        } finally {
            setActing(prev => ({ ...prev, [reqId]: null }))
        }
    }

    if (loading) return <Spinner text="Загружаем запросы..." />
    if (error) return <ErrorBox msg={error} onRetry={load} />
    if (requests.length === 0) return <EmptyBox emoji="📷" text="Запросов на фото нет" />

    const open = requests.filter(r => r.status === 'open')
    const done = requests.filter(r => r.status !== 'open')

    const RequestCard = ({ r }) => {
        const ps = PHOTO_STATUS[r.status] || { text: r.status, cls: '' }
        const isOpen = r.status === 'open'
        const busy = acting[r.req_id]

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
                {isOpen && (
                    <div className="photo-card-actions">
                        <button
                            className="btn btn-success btn-sm"
                            onClick={() => handleFulfillClick(r.req_id)}
                            disabled={!!busy}
                        >
                            {busy === 'fulfilling' ? '⏳ Отправка...' : '📤 Отправить фото'}
                        </button>
                        <button
                            className="btn btn-danger btn-sm"
                            onClick={() => handleReject(r.req_id)}
                            disabled={!!busy}
                        >
                            {busy === 'rejecting' ? '⏳...' : '❌ Отклонить'}
                        </button>
                    </div>
                )}
            </div>
        )
    }

    return (
        <div className="photos-section">
            {/* Скрытый input для выбора файла */}
            <input
                type="file"
                accept="image/*"
                ref={fileInputRef}
                style={{ display: 'none' }}
                onChange={handleFileChosen}
            />

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
// Секция: Напоминалки
// ──────────────────────────────────────────

function RemindersSection() {
    const [data, setData] = useState(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState(null)
    const [remindText, setRemindText] = useState('')
    const [sending, setSending] = useState(false)
    const [result, setResult] = useState(null)
    const [holidaySending, setHolidaySending] = useState(null)
    const [holidayResult, setHolidayResult] = useState(null)

    const handleHolidayBroadcast = async (holiday) => {
        if (!window.confirm(`Отправить всем клиентам поздравление с "${holiday.theme}"?`)) return
        setHolidaySending(holiday.key)
        setHolidayResult(null)
        try {
            const r = await sendBroadcast(holiday.text)
            setHolidayResult({ key: holiday.key, ok: true, ...r })
        } catch (e) {
            setHolidayResult({ key: holiday.key, ok: false, error: e.message })
        } finally {
            setHolidaySending(null)
        }
    }

    const load = () => {
        setLoading(true)
        setError(null)
        fetchReminders()
            .then(setData)
            .catch(e => setError(e.message))
            .finally(() => setLoading(false))
    }
    useEffect(load, [])

    const handleRemind = async () => {
        if (!remindText.trim()) {
            alert('Напишите текст напоминания')
            return
        }
        const count = data?.sleeping_count || 0
        if (!window.confirm(`Отправить напоминание ${count} «спящим» клиентам?`)) return

        setSending(true)
        setResult(null)
        try {
            const r = await remindSleeping(remindText.trim())
            setResult({ ok: true, ...r })
        } catch (e) {
            setResult({ ok: false, error: e.message })
        } finally {
            setSending(false)
        }
    }

    if (loading) return <Spinner text="Загружаем напоминалки..." />
    if (error) return <ErrorBox msg={error} onRetry={load} />

    const { holidays = [], sleeping = [], sleeping_count = 0 } = data || {}

    return (
        <div className="reminders-section">
            {/* Ближайшие праздники */}
            <div className="glass-card reminders-card">
                <div className="reminders-card-title">🎉 Ближайшие праздники (14 дней)</div>
                {holidays.length === 0 ? (
                    <p className="reminders-empty">Праздников нет</p>
                ) : (
                    holidays.map(h => (
                        <div key={h.key} className="holiday-card glass-card">
                            <div className="holiday-row">
                                <div className="holiday-row-left">
                                    <span className="holiday-date">{h.date}</span>
                                    {h.days_left === 0 && (
                                        <span className="holiday-today-badge">Сегодня!</span>
                                    )}
                                    {h.days_left === 1 && (
                                        <span className="holiday-soon-badge">Завтра</span>
                                    )}
                                </div>
                                <div className="holiday-theme">{h.theme}</div>
                            </div>
                            {h.text && (
                                <p className="holiday-text">{h.text}</p>
                            )}
                            <button
                                className="btn btn-primary btn-sm"
                                onClick={() => handleHolidayBroadcast(h)}
                                disabled={holidaySending === h.key}
                            >
                                {holidaySending === h.key ? '⏳ Отправляем...' : '📬 Отправить всем'}
                            </button>
                            {holidayResult?.key === h.key && (
                                <div className={`broadcast-result ${holidayResult.ok ? 'broadcast-result--ok' : 'broadcast-result--err'}`}>
                                    {holidayResult.ok
                                        ? `✅ Отправлено: ${holidayResult.sent}, не доставлено: ${holidayResult.failed}`
                                        : `❌ ${holidayResult.error}`}
                                </div>
                            )}
                        </div>
                    ))
                )}
            </div>

            {/* Спящие клиенты */}
            <div className="glass-card reminders-card">
                <div className="reminders-card-title">
                    😴 Спящие клиенты
                    <span className="sleeping-badge">{sleeping_count}</span>
                </div>
                <p className="reminders-hint">
                    Не заказывали 30+ дней, но делали заказы раньше
                </p>
                {sleeping.length > 0 && (
                    <div className="sleeping-list">
                        {sleeping.slice(0, 5).map(u => (
                            <div key={u.user_id} className="sleeping-row">
                                <span className="sleeping-name">
                                    {u.first_name}{u.username ? ` @${u.username}` : ''}
                                </span>
                                <span className="sleeping-meta">
                                    📦 {u.orders_count} · 🕐 {u.last_seen}
                                </span>
                            </div>
                        ))}
                        {sleeping.length > 5 && (
                            <p className="sleeping-more">... и ещё {sleeping.length - 5}</p>
                        )}
                    </div>
                )}

                {sleeping_count > 0 && (
                    <>
                        <textarea
                            className="form-input form-textarea"
                            style={{ marginTop: '0.75rem' }}
                            placeholder="Текст напоминания..."
                            value={remindText}
                            onChange={e => setRemindText(e.target.value)}
                            rows={3}
                        />
                        <button
                            className="btn btn-primary btn-block"
                            style={{ marginTop: '0.5rem' }}
                            onClick={handleRemind}
                            disabled={sending || !remindText.trim()}
                        >
                            {sending
                                ? '⏳ Отправляем...'
                                : `📬 Напомнить ${sleeping_count} клиентам`}
                        </button>
                        {result && (
                            <div className={`broadcast-result ${result.ok ? 'broadcast-result--ok' : 'broadcast-result--err'}`}>
                                {result.ok
                                    ? `✅ Отправлено: ${result.sent}, не доставлено: ${result.failed}`
                                    : `❌ Ошибка: ${result.error}`}
                            </div>
                        )}
                    </>
                )}
            </div>
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
    const [syncing, setSyncing] = useState(false)
    const [syncResult, setSyncResult] = useState(null)

    const isMama = IS_DEV || !user || ADMIN_IDS.has(user.id)

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
    if (!IS_DEV && user && !ADMIN_IDS.has(user.id)) {
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
                <button
                    className="btn btn-outline btn-sm admin-sync-btn"
                    onClick={async () => {
                        if (!window.confirm('Синхронизировать цены из Google Таблицы?')) return
                        setSyncing(true); setSyncResult(null)
                        try {
                            const r = await syncPrices()
                            setSyncResult({ ok: r.ok, message: r.message })
                        } catch (e) {
                            setSyncResult({ ok: false, message: e.message })
                        } finally { setSyncing(false) }
                    }}
                    disabled={syncing}
                >
                    {syncing ? '⏳ Синхронизация...' : '🔄 Синхронизировать цены'}
                </button>
                {syncResult && (
                    <div className={`broadcast-result ${syncResult.ok ? 'broadcast-result--ok' : 'broadcast-result--err'}`}>
                        {syncResult.message}
                    </div>
                )}
            </div>

            {/* Навигация по разделам: два ряда */}
            <div className="admin-sections-wrap">
                <div className="admin-sections">
                    {SECTIONS_ROW1.map(s => (
                        <button
                            key={s.key}
                            className={`admin-section-btn ${section === s.key ? 'active' : ''}`}
                            onClick={() => setSection(s.key)}
                        >
                            {s.label}
                        </button>
                    ))}
                </div>
                <div className="admin-sections">
                    {SECTIONS_ROW2.map(s => (
                        <button
                            key={s.key}
                            className={`admin-section-btn ${section === s.key ? 'active' : ''}`}
                            onClick={() => setSection(s.key)}
                        >
                            {s.label}
                        </button>
                    ))}
                </div>
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
            {section === 'reminders' && <RemindersSection />}
            {section === 'broadcast' && <BroadcastSection />}
        </div>
    )
}
