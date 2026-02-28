/**
 * AdminPage — панель управления заказами для мамы.
 * Доступна только пользователю с ID мамы (проверка на клиенте + сервере).
 */
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useTelegram } from '../hooks/useTelegram'
import { fetchOrders, closeOrder, deleteOrder } from '../utils/api'
import './AdminPage.css'

// Список ID администраторов.
// Мама всегда в списке. Дополнительные — через VITE_ADMIN_IDS=id1,id2 в frontend/.env
const MAMA_ID = 5513112898
const _extraIds = (import.meta.env.VITE_ADMIN_IDS || '')
    .split(',').map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n))
const ADMIN_IDS = new Set([MAMA_ID, ..._extraIds])

const STATUS_LABEL = {
    new: { text: 'Новый', cls: 'status-new' },
    delivery: { text: 'В доставке', cls: 'status-delivery' },
    ready: { text: 'Готов', cls: 'status-ready' },
    closed: { text: 'Закрыт', cls: 'status-closed' },
}

function OrderCard({ order, onClose, onDelete }) {
    const [expanded, setExpanded] = useState(false)
    const [loading, setLoading] = useState(false)

    const statusInfo = STATUS_LABEL[order.status] || { text: order.status, cls: '' }
    const isClosed = order.status === 'closed'

    const handleClose = async () => {
        setLoading(true)
        try { await onClose(order.order_id) } finally { setLoading(false) }
    }
    const handleDelete = async () => {
        if (!window.confirm(`Удалить заказ ${order.order_id}?`)) return
        setLoading(true)
        try { await onDelete(order.order_id) } finally { setLoading(false) }
    }

    // Форматируем итог
    const total = order.totals?.grand_total ?? order.total ?? '—'
    const totalStr = typeof total === 'number'
        ? `${total.toLocaleString('ru')} ₽`
        : total

    // Клиент
    const customer = order.customer || {}
    const clientName = customer.first_name || order.user?.first_name || '—'
    const phone = order.phone || customer.phone || '—'

    return (
        <motion.div
            className={`order-card glass-card ${isClosed ? 'order-card--closed' : ''}`}
            layout
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, height: 0, marginBottom: 0 }}
        >
            {/* Заголовок */}
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

            {/* Детали */}
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
                        {order.delivery && (
                            <div className="order-detail-row">
                                <span>🚗 Доставка:</span>
                                <span>{order.delivery.address || order.address || '—'}</span>
                            </div>
                        )}
                        {order.date && (
                            <div className="order-detail-row">
                                <span>📅 Дата:</span>
                                <span>{order.date}</span>
                            </div>
                        )}
                        {order.comment && (
                            <div className="order-detail-row">
                                <span>💬 Коммент:</span>
                                <span>{order.comment}</span>
                            </div>
                        )}

                        {/* Состав */}
                        <div className="order-items-list">
                            {(order.items || []).map((item, i) => (
                                <div key={i} className="order-item-row">
                                    <span>{item.name}</span>
                                    <span className="order-item-qty">
                                        {item.weight ? `${item.weight} кг` : `${item.quantity} шт`}
                                    </span>
                                </div>
                            ))}
                        </div>

                        {/* Кнопки */}
                        <div className="order-actions">
                            {!isClosed && (
                                <button
                                    className="btn btn-success btn-sm"
                                    onClick={handleClose}
                                    disabled={loading}
                                >
                                    ✅ Закрыть
                                </button>
                            )}
                            <button
                                className="btn btn-danger btn-sm"
                                onClick={handleDelete}
                                disabled={loading}
                            >
                                🗑 Удалить
                            </button>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.div>
    )
}

export default function AdminPage() {
    const { user } = useTelegram()
    const navigate = useNavigate()
    const [orders, setOrders] = useState([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState(null)
    const [filter, setFilter] = useState('active') // active | all | closed

    // Клиентская проверка: только мама
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

    const handleClose = async (id) => {
        await closeOrder(id)
        setOrders(prev => prev.map(o =>
            o.order_id === id ? { ...o, status: 'closed' } : o
        ))
    }
    const handleDelete = async (id) => {
        await deleteOrder(id)
        setOrders(prev => prev.filter(o => o.order_id !== id))
    }

    // Не мама — не показываем
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
                {!loading && (
                    <p className="admin-subtitle">
                        Активных заказов: <b>{activeCount}</b> / всего: <b>{orders.length}</b>
                    </p>
                )}
            </div>

            {/* Фильтр */}
            <div className="admin-tabs">
                {[
                    { key: 'active', label: 'Активные' },
                    { key: 'all', label: 'Все' },
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

            {/* Контент */}
            {loading && (
                <div className="catalog-loading">
                    <div className="loading-spinner" />
                    <p>Загружаем заказы...</p>
                </div>
            )}

            {error && (
                <div className="empty-state">
                    <span className="empty-state-emoji">⚠️</span>
                    <p className="empty-state-title">Ошибка: {error}</p>
                    <button className="btn btn-primary" onClick={loadOrders}>Повторить</button>
                </div>
            )}

            {!loading && !error && filtered.length === 0 && (
                <div className="empty-state">
                    <span className="empty-state-emoji">📭</span>
                    <p className="empty-state-title">Заказов нет</p>
                </div>
            )}

            {!loading && !error && (
                <div className="orders-list">
                    <AnimatePresence>
                        {filtered.map(order => (
                            <OrderCard
                                key={order.order_id}
                                order={order}
                                onClose={handleClose}
                                onDelete={handleDelete}
                            />
                        ))}
                    </AnimatePresence>
                </div>
            )}
        </div>
    )
}
