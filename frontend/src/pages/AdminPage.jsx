/**
 * AdminPage — панель управления для мамы.
 * Разделы: Заказы | Статистика | Клиенты | Админы | Напоминалки | Рассылка
 */
import { useEffect, useState, useRef, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useTelegram } from '../hooks/useTelegram'
import {
    fetchOrders, deleteOrder, updateOrderStatus,
    fetchStats, fetchUsers, sendBroadcast,
    fetchReminders, remindSleeping,
    syncPrices, fetchUserOrders,
    fetchAdmins, addAdmin, removeAdmin, searchUsers,
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
    { key: 'admins',    label: '👑 Админы' },
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

const PAGE_SIZE = 15

function Pagination({ page, totalPages, onPageChange }) {
    if (totalPages <= 1) return null

    const pages = []
    for (let i = 1; i <= totalPages; i++) {
        // Показываем: первую, последнюю, текущую ±1
        if (i === 1 || i === totalPages || (i >= page - 1 && i <= page + 1)) {
            pages.push(i)
        } else if (pages[pages.length - 1] !== '...') {
            pages.push('...')
        }
    }

    return (
        <div className="pagination">
            <button
                className="pagination-btn"
                disabled={page === 1}
                onClick={() => onPageChange(page - 1)}
            >
                ‹
            </button>
            {pages.map((p, i) =>
                p === '...' ? (
                    <span key={`dots-${i}`} className="pagination-dots">…</span>
                ) : (
                    <button
                        key={p}
                        className={`pagination-btn ${p === page ? 'active' : ''}`}
                        onClick={() => onPageChange(p)}
                    >
                        {p}
                    </button>
                )
            )}
            <button
                className="pagination-btn"
                disabled={page === totalPages}
                onClick={() => onPageChange(page + 1)}
            >
                ›
            </button>
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
    const username = customer.username || order.user?.username || null
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
                    <span className="order-client-name">{clientName}</span>
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
                            <span>
                                {clientName}
                                {username && (
                                    <>
                                        {' '}
                                        <a href={`https://t.me/${username}`}
                                           target="_blank" rel="noopener noreferrer"
                                           className="order-tg-link">@{username}</a>
                                    </>
                                )}
                            </span>
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
                                const isKg = item.unit === 'кг'
                                return (
                                    <div key={i} className="order-item-row">
                                        <span className="order-item-name">{item.name}</span>
                                        <span className="order-item-qty">
                                            {isKg && item.weight ? (
                                                <><span className="order-item-weight">{item.weight} кг</span> × {qty} шт</>
                                            ) : (
                                                <>{qty} <span className={isKg ? 'order-item-weight' : ''}>{item.unit || 'шт'}</span></>
                                            )}
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
    const [usersPage, setUsersPage] = useState(1)
    const [ordersLoading, setOrdersLoading] = useState(null)

    const load = () => {
        setLoading(true)
        setError(null)
        fetchUsers()
            .then(d => {
                const sorted = (d.users || []).sort((a, b) => {
                    const nameA = (a.first_name || a.username || '').toLowerCase()
                    const nameB = (b.first_name || b.username || '').toLowerCase()
                    return nameA.localeCompare(nameB, 'ru')
                })
                setUsers(sorted)
            })
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

    const usersTotalPages = Math.max(1, Math.ceil(users.length / PAGE_SIZE))
    const safeUsersPage = Math.min(usersPage, usersTotalPages)
    const pagedUsers = users.slice((safeUsersPage - 1) * PAGE_SIZE, safeUsersPage * PAGE_SIZE)

    return (
        <div className="users-section">
            <p className="section-count">Клиентов: <b>{users.length}</b></p>
            {pagedUsers.map(u => {
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
                                        orders.map((order, orderIdx) => {
                                            const isOrderExp = expandedOrder === order.order_id
                                            const st = STATUS_LABEL[order.status] || { text: order.status, cls: '' }
                                            const total = order.totals?.grand_total ?? order.total ?? 0
                                            const isLastOrder = orderIdx === orders.length - 1

                                            /* Собираем строки деталей для определения последнего */
                                            const detailRows = []
                                            ;(order.items || []).forEach((it, i) => {
                                                detailRows.push({ type: 'item', it, i })
                                            })
                                            if (order.schedule?.date)
                                                detailRows.push({ type: 'date', value: order.schedule.date })
                                            if (order.delivery?.address)
                                                detailRows.push({ type: 'addr', value: order.delivery.address })
                                            if (order.payment?.method)
                                                detailRows.push({ type: 'pay', value: order.payment.method })

                                            return (
                                                <div
                                                    key={order.order_id}
                                                    className={`tree-order-node${isLastOrder ? ' tree-order-node--last' : ''}`}
                                                >
                                                    <div
                                                        className="tree-order-header"
                                                        onClick={() => setExpandedOrder(isOrderExp ? null : order.order_id)}
                                                    >
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
                                                                {detailRows.map((row, ri) => {
                                                                    const isLast = ri === detailRows.length - 1
                                                                    const cls = `tree-detail-row${isLast ? ' tree-detail-row--last' : ''}`
                                                                    if (row.type === 'item') return (
                                                                        <div key={`item-${row.i}`} className={`tree-item-row${isLast ? ' tree-detail-row--last' : ''}`}>
                                                                            <span>{row.it.name}</span>
                                                                            <span className="tree-item-qty">
                                                                                {row.it.quantity || 1} {row.it.unit || 'шт'}
                                                                                {row.it.total ? ` = ${row.it.total.toLocaleString('ru')} ₽` : ''}
                                                                            </span>
                                                                        </div>
                                                                    )
                                                                    if (row.type === 'date') return (
                                                                        <div key="date" className={cls}>📅 {row.value}</div>
                                                                    )
                                                                    if (row.type === 'addr') return (
                                                                        <div key="addr" className={cls}>📍 {row.value}</div>
                                                                    )
                                                                    if (row.type === 'pay') return (
                                                                        <div key="pay" className={cls}>💳 {row.value === 'cash' ? 'Наличные' : 'Перевод'}</div>
                                                                    )
                                                                    return null
                                                                })}
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
            <Pagination
                page={safeUsersPage}
                totalPages={usersTotalPages}
                onPageChange={setUsersPage}
            />
        </div>
    )
}

// ──────────────────────────────────────────
// Секция: Администраторы
// ──────────────────────────────────────────

function AdminsSection() {
    const [admins, setAdmins] = useState([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState(null)
    const [query, setQuery] = useState('')
    const [results, setResults] = useState([])
    const [searching, setSearching] = useState(false)
    const [adding, setAdding] = useState(null)
    const [removing, setRemoving] = useState(null)
    const searchTimer = useRef(null)

    const load = () => {
        setLoading(true)
        setError(null)
        fetchAdmins()
            .then(d => setAdmins(d.admins || []))
            .catch(e => setError(e.message))
            .finally(() => setLoading(false))
    }
    useEffect(load, [])

    const handleSearch = (val) => {
        setQuery(val)
        clearTimeout(searchTimer.current)
        if (!val.trim()) {
            setResults([])
            return
        }
        searchTimer.current = setTimeout(async () => {
            setSearching(true)
            try {
                const d = await searchUsers(val.trim())
                const adminIds = new Set(admins.map(a => a.user_id))
                setResults((d.users || []).filter(u => !adminIds.has(u.user_id)))
            } catch {
                setResults([])
            } finally {
                setSearching(false)
            }
        }, 400)
    }

    const handleAdd = async (user) => {
        setAdding(user.user_id)
        try {
            await addAdmin(user.user_id, user.username, user.first_name)
            setQuery('')
            setResults([])
            load()
        } catch (err) {
            alert(`Ошибка: ${err.message}`)
        } finally {
            setAdding(null)
        }
    }

    const handleRemove = async (userId) => {
        if (!window.confirm('Убрать этого администратора?')) return
        setRemoving(userId)
        try {
            await removeAdmin(userId)
            load()
        } catch (err) {
            alert(`Ошибка: ${err.message}`)
        } finally {
            setRemoving(null)
        }
    }

    const handleManualAdd = async () => {
        const val = query.trim()
        if (!val) return
        setAdding('manual')
        try {
            const isNumeric = /^\d+$/.test(val)
            if (isNumeric) {
                await addAdmin(parseInt(val, 10), '', '')
            } else {
                const username = val.replace(/^@/, '')
                await addAdmin(null, username, '')
            }
            setQuery('')
            setResults([])
            load()
        } catch (err) {
            alert(err.message)
        } finally {
            setAdding(null)
        }
    }

    if (loading) return <Spinner text="Загружаем админов..." />
    if (error) return <ErrorBox msg={error} onRetry={load} />

    return (
        <div className="admins-section">
            <p className="section-count">Администраторов: <b>{admins.length}</b></p>

            {/* Список текущих админов */}
            <div className="admins-list">
                {admins.map(a => (
                    <div key={a.user_id} className="admin-card glass-card">
                        <div className="admin-card-avatar">
                            {a.is_mama ? '👑' : '🛡️'}
                        </div>
                        <div className="admin-card-info">
                            <div className="admin-card-name">
                                {a.first_name || `ID ${a.user_id}`}
                                {a.username && (
                                    <span className="admin-card-username"> @{a.username}</span>
                                )}
                            </div>
                            <div className="admin-card-meta">
                                ID: {a.user_id}
                                {a.is_static && <span className="admin-badge-static"> .env</span>}
                                {a.is_mama && <span className="admin-badge-mama"> Владелец</span>}
                            </div>
                        </div>
                        {!a.is_static && !a.is_mama && (
                            <button
                                className="btn-remove-admin"
                                onClick={() => handleRemove(a.user_id)}
                                disabled={removing === a.user_id}
                                title="Убрать админа"
                            >
                                {removing === a.user_id ? '...' : '✕'}
                            </button>
                        )}
                    </div>
                ))}
            </div>

            {/* Добавить нового админа — единое поле */}
            <div className="section-subheader" style={{ marginTop: '1rem' }}>Добавить администратора</div>
            <div className="glass-card" style={{ padding: '0.75rem' }}>
                <div className="admin-add-row">
                    <input
                        className="form-input"
                        placeholder="Имя, @username или числовой ID"
                        value={query}
                        onChange={e => handleSearch(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && !results.length && handleManualAdd()}
                    />
                    {query.trim() && !searching && results.length === 0 && (
                        <button
                            className="btn btn-primary btn-sm"
                            onClick={handleManualAdd}
                            disabled={adding === 'manual'}
                        >
                            {adding === 'manual' ? '...' : 'Добавить'}
                        </button>
                    )}
                </div>
                {searching && <div className="admin-search-hint">Поиск...</div>}
                {results.length > 0 && (
                    <div className="admin-search-results">
                        {results.map(u => (
                            <div
                                key={u.user_id}
                                className="admin-search-item"
                                onClick={() => handleAdd(u)}
                            >
                                <div className="admin-search-item-name">
                                    {u.first_name} {u.last_name || ''}
                                    {u.username && <span className="admin-card-username"> @{u.username}</span>}
                                </div>
                                <button
                                    className="btn btn-success btn-sm"
                                    disabled={adding === u.user_id}
                                >
                                    {adding === u.user_id ? '...' : '+ Добавить'}
                                </button>
                            </div>
                        ))}
                    </div>
                )}
                {query.trim() && !searching && results.length === 0 && (
                    <div className="admin-search-hint">Не найден среди клиентов — добавьте по @username или ID</div>
                )}
            </div>
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
    const [ordersPage, setOrdersPage] = useState(1)
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

    const filtered = useMemo(() => orders.filter(o => {
        if (filter === 'active') return o.status !== 'closed'
        if (filter === 'closed') return o.status === 'closed'
        return true
    }), [orders, filter])
    const activeCount = orders.filter(o => o.status !== 'closed').length
    const ordersTotalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
    const safePage = Math.min(ordersPage, ordersTotalPages)
    const pagedOrders = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)

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
                                onClick={() => { setFilter(tab.key); setOrdersPage(1) }}
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
                        <>
                            <div className="orders-list">
                                <AnimatePresence>
                                    {pagedOrders.map(order => (
                                        <OrderCard
                                            key={order.order_id}
                                            order={order}
                                            onStatusChange={handleStatusChange}
                                            onDelete={handleDelete}
                                        />
                                    ))}
                                </AnimatePresence>
                            </div>
                            <Pagination
                                page={safePage}
                                totalPages={ordersTotalPages}
                                onPageChange={setOrdersPage}
                            />
                        </>
                    )}
                </>
            )}

            {section === 'stats'     && <StatsSection />}
            {section === 'users'     && <UsersSection />}
            {section === 'admins'    && <AdminsSection />}
            {section === 'reminders' && <RemindersSection />}
            {section === 'broadcast' && <BroadcastSection />}
        </div>
    )
}
