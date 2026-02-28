/**
 * MyOrdersPage — история заказов текущего пользователя.
 * Требует запущенного backend; при ошибке — graceful fallback.
 */
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useTelegram } from '../hooks/useTelegram'
import { fetchMyOrders } from '../utils/api'
import { formatPrice } from '../utils/formatPrice'
import './MyOrdersPage.css'

const STATUS_LABEL = {
    new:      { text: 'Новый',      cls: 'status-new' },
    accepted: { text: 'Принят',     cls: 'status-accepted' },
    cooking:  { text: 'Готовится',  cls: 'status-cooking' },
    delivery: { text: 'В доставке', cls: 'status-delivery' },
    ready:    { text: 'Готов',      cls: 'status-ready' },
    closed:   { text: 'Закрыт',     cls: 'status-closed' },
}

function OrderHistoryCard({ order }) {
    const [expanded, setExpanded] = useState(false)
    const status = order.status || 'new'
    const info = STATUS_LABEL[status] || { text: status, cls: '' }

    const total = order.totals?.grand_total ?? order.total ?? '—'
    const totalStr = typeof total === 'number' ? formatPrice(total) : total

    const dateStr = order.schedule?.date || order.date
        || order.created_at?.slice(0, 10) || '—'

    return (
        <motion.div
            className={`my-order-card glass-card ${status === 'closed' ? 'my-order-card--closed' : ''}`}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
        >
            <div className="my-order-header" onClick={() => setExpanded(e => !e)}>
                <div className="my-order-left">
                    <span className="my-order-id">{order.order_id}</span>
                    <span className="my-order-date">{dateStr}</span>
                </div>
                <div className="my-order-right">
                    <span className={`order-status ${info.cls}`}>{info.text}</span>
                    <span className="my-order-total">{totalStr}</span>
                    <span className="order-chevron">{expanded ? '▲' : '▼'}</span>
                </div>
            </div>

            <AnimatePresence>
                {expanded && (
                    <motion.div
                        className="my-order-details"
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                    >
                        {/* Состав */}
                        <div className="my-order-items">
                            {(order.items || []).map((item, i) => (
                                <div key={i} className="my-order-item-row">
                                    <span className="my-order-item-name">{item.name}</span>
                                    <span className="my-order-item-qty">
                                        {item.quantity} {item.unit || 'шт'}
                                    </span>
                                </div>
                            ))}
                        </div>

                        {/* Детали */}
                        {(order.delivery?.address || order.address) && (
                            <div className="my-order-meta">
                                📍 {order.delivery?.address || order.address}
                            </div>
                        )}
                        {order.payment?.method && (
                            <div className="my-order-meta">
                                💳 {order.payment.method === 'cash' ? 'Наличными' : 'Переводом'}
                            </div>
                        )}
                        {order.comment && (
                            <div className="my-order-meta">
                                💬 {order.comment}
                            </div>
                        )}
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.div>
    )
}

export default function MyOrdersPage() {
    const { user } = useTelegram()
    const navigate = useNavigate()
    const [orders, setOrders] = useState([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState(null)

    useEffect(() => {
        fetchMyOrders()
            .then(d => setOrders(d.orders || []))
            .catch(e => setError(e.message))
            .finally(() => setLoading(false))
    }, [])

    const active = orders.filter(o => o.status !== 'closed')
    const closed = orders.filter(o => o.status === 'closed')

    return (
        <div className="my-orders-page">
            <motion.button
                className="back-button"
                onClick={() => navigate('/')}
                whileTap={{ scale: 0.95 }}
            >
                ← Назад
            </motion.button>

            <h2 className="page-title">📦 Мои заказы</h2>

            {loading && (
                <div className="catalog-loading">
                    <div className="loading-spinner" />
                    <p>Загружаем заказы...</p>
                </div>
            )}

            {error && (
                <div className="empty-state">
                    <span className="empty-state-emoji">⚙️</span>
                    <p className="empty-state-title">Нет соединения с сервером</p>
                    <p className="empty-state-text">
                        История заказов доступна, когда запущен backend.<br />
                        Сейчас бот работает в автономном режиме.
                    </p>
                    <button className="btn btn-primary" onClick={() => navigate('/')}>
                        В каталог
                    </button>
                </div>
            )}

            {!loading && !error && orders.length === 0 && (
                <div className="empty-state">
                    <span className="empty-state-emoji">🛒</span>
                    <p className="empty-state-title">Заказов пока нет</p>
                    <p className="empty-state-text">Самое время что-нибудь заказать!</p>
                    <button className="btn btn-primary" onClick={() => navigate('/')}>
                        В каталог
                    </button>
                </div>
            )}

            {!loading && !error && orders.length > 0 && (
                <>
                    {active.length > 0 && (
                        <section className="my-orders-section">
                            <h3 className="my-orders-section-title">В работе ({active.length})</h3>
                            <div className="my-orders-list">
                                {active.map(o => (
                                    <OrderHistoryCard key={o.order_id} order={o} />
                                ))}
                            </div>
                        </section>
                    )}

                    {closed.length > 0 && (
                        <section className="my-orders-section">
                            <h3 className="my-orders-section-title">Выполненные ({closed.length})</h3>
                            <div className="my-orders-list">
                                {closed.map(o => (
                                    <OrderHistoryCard key={o.order_id} order={o} />
                                ))}
                            </div>
                        </section>
                    )}
                </>
            )}
        </div>
    )
}
