/**
 * MyOrdersPage — история заказов текущего пользователя.
 * Пользователь может изменить или отменить заказы со статусом "new".
 */
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useTelegram } from '../hooks/useTelegram'
import { useCart } from '../hooks/useCart'
import { fetchMyOrders, updateMyOrder, cancelMyOrder } from '../utils/api'
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

function OrderHistoryCard({ order, onRepeat, onUpdate, onCancel }) {
    const [expanded, setExpanded] = useState(false)
    const [editing, setEditing] = useState(false)
    const [editItems, setEditItems] = useState([])
    const [editComment, setEditComment] = useState('')
    const [saving, setSaving] = useState(false)

    const status = order.status || 'new'
    const info = STATUS_LABEL[status] || { text: status, cls: '' }
    const canEdit = ['new', 'accepted', 'cooking'].includes(status)

    const total = order.totals?.grand_total ?? order.total ?? '—'
    const totalStr = typeof total === 'number' ? formatPrice(total) : total

    const dateStr = order.schedule?.date || order.date
        || order.created_at?.slice(0, 10) || '—'

    const startEditing = (e) => {
        e.stopPropagation()
        setEditItems((order.items || []).map(item => ({ ...item })))
        setEditComment(order.comment || '')
        setEditing(true)
    }

    const handleQtyChange = (index, delta) => {
        setEditItems(prev => {
            const next = [...prev]
            const item = { ...next[index] }
            const newQty = Math.max(0, (item.quantity ?? 1) + delta)
            if (newQty === 0) {
                next.splice(index, 1)
            } else {
                item.quantity = newQty
                item.total = (item.price_per_unit || 0) * newQty * (item.weight || 1)
                next[index] = item
            }
            return next
        })
    }

    const handleRemoveItem = (index) => {
        setEditItems(prev => prev.filter((_, i) => i !== index))
    }

    const editTotal = editItems.reduce((sum, item) => sum + (item.total || 0), 0)
        + (order.totals?.delivery_total || 0)
    const editItemsTotal = editItems.reduce((sum, item) => sum + (item.total || 0), 0)

    const handleSave = async (e) => {
        e.stopPropagation()
        if (editItems.length === 0) return
        setSaving(true)
        try {
            await onUpdate(order.order_id, {
                items: editItems,
                total: editTotal,
                items_total: editItemsTotal,
                comment: editComment,
            })
            setEditing(false)
        } catch (err) {
            alert(err.message || 'Не удалось сохранить изменения')
        } finally {
            setSaving(false)
        }
    }

    const handleCancel = async (e) => {
        e.stopPropagation()
        if (!window.confirm('Вы уверены что хотите отменить заказ?')) return
        try {
            await onCancel(order.order_id)
        } catch (err) {
            alert(err.message || 'Не удалось отменить заказ')
        }
    }

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
                            {editing ? (
                                <>
                                    {editItems.map((item, i) => {
                                        const qty = item.quantity ?? 1
                                        const ppu = item.price_per_unit ?? 0
                                        const lineTotal = item.total ?? (ppu * qty)
                                        return (
                                            <div key={i} className="my-order-item-row my-order-item-row--edit">
                                                <span className="my-order-item-name">{item.name}</span>
                                                <div className="my-order-edit-controls">
                                                    <button className="qty-btn" onClick={() => handleQtyChange(i, -1)}>−</button>
                                                    <span className="qty-val">{qty}</span>
                                                    <button className="qty-btn" onClick={() => handleQtyChange(i, 1)}>+</button>
                                                    <span className="my-order-item-line-total">
                                                        {lineTotal > 0 ? `${lineTotal.toLocaleString('ru')} ₽` : '—'}
                                                    </span>
                                                    <button className="qty-btn qty-btn--remove" onClick={() => handleRemoveItem(i)}>✕</button>
                                                </div>
                                            </div>
                                        )
                                    })}
                                    {editItems.length === 0 && (
                                        <p className="my-order-empty-edit">Все товары удалены. Отмените заказ или добавьте товары.</p>
                                    )}
                                    <div className="my-order-edit-total">
                                        Итого: {formatPrice(editTotal)}
                                    </div>
                                    <textarea
                                        className="my-order-edit-comment"
                                        value={editComment}
                                        onChange={e => setEditComment(e.target.value)}
                                        placeholder="Комментарий к заказу..."
                                        rows={2}
                                    />
                                </>
                            ) : (
                                (order.items || []).map((item, i) => {
                                    const qty = item.quantity ?? 1
                                    const ppu = item.price_per_unit ?? 0
                                    const lineTotal = item.total ?? (ppu * qty)
                                    return (
                                        <div key={i} className="my-order-item-row">
                                            <span className="my-order-item-name">{item.name}</span>
                                            <span className="my-order-item-qty">
                                                {qty} {item.unit || 'шт'}
                                                {ppu > 0 && ` × ${ppu.toLocaleString('ru')} ₽`}
                                                {lineTotal > 0 && ` = ${lineTotal.toLocaleString('ru')} ₽`}
                                            </span>
                                        </div>
                                    )
                                })
                            )}
                        </div>

                        {/* Детали (только в режиме просмотра) */}
                        {!editing && (
                            <>
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
                            </>
                        )}

                        {/* Кнопки действий */}
                        <div className="my-order-actions">
                            {editing ? (
                                <>
                                    <button
                                        className="btn btn-primary my-order-action-btn"
                                        onClick={handleSave}
                                        disabled={saving || editItems.length === 0}
                                    >
                                        {saving ? 'Сохраняю...' : 'Сохранить изменения'}
                                    </button>
                                    <button
                                        className="btn btn-outline my-order-action-btn"
                                        onClick={(e) => { e.stopPropagation(); setEditing(false) }}
                                    >
                                        Отмена
                                    </button>
                                </>
                            ) : (
                                <>
                                    {canEdit && (
                                        <>
                                            <button
                                                className="btn btn-outline my-order-action-btn"
                                                onClick={startEditing}
                                            >
                                                ✏️ Изменить заказ
                                            </button>
                                            <button
                                                className="btn btn-danger-outline my-order-action-btn"
                                                onClick={handleCancel}
                                            >
                                                ❌ Отменить заказ
                                            </button>
                                        </>
                                    )}
                                    <button
                                        className="btn btn-primary my-order-action-btn"
                                        onClick={(e) => { e.stopPropagation(); onRepeat(order) }}
                                    >
                                        🔄 Повторить заказ
                                    </button>
                                </>
                            )}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.div>
    )
}

export default function MyOrdersPage() {
    const { user } = useTelegram()
    const { addItem, clearCart } = useCart()
    const navigate = useNavigate()
    const [orders, setOrders] = useState([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState(null)

    const loadOrders = () => {
        setLoading(true)
        fetchMyOrders()
            .then(d => setOrders(d.orders || []))
            .catch(e => setError(e.message))
            .finally(() => setLoading(false))
    }

    useEffect(() => { loadOrders() }, [])

    const handleRepeat = (order) => {
        clearCart()
        for (const item of (order.items || [])) {
            const cartItem = {
                id: item.id || item.name,
                name: item.name,
                categoryKey: item.category_key || 'other',
                unit: item.unit || 'шт',
                price_item: item.price_per_unit || 0,
                price_kg: item.unit === 'кг' ? (item.price_per_unit || 0) : undefined,
            }
            const qty = item.quantity ?? 1
            const weight = item.unit === 'кг' ? qty : null
            addItem(cartItem, weight ? 1 : qty, weight)
        }
        navigate('/cart')
    }

    const handleUpdate = async (orderId, data) => {
        await updateMyOrder(orderId, data)
        loadOrders()
    }

    const handleCancel = async (orderId) => {
        await cancelMyOrder(orderId)
        loadOrders()
    }

    const active = orders.filter(o => o.status !== 'closed')
    const closed = orders.filter(o => o.status === 'closed')

    return (
        <div className="my-orders-page">
            <motion.button
                className="back-button"
                onClick={() => navigate('/')}
                whileTap={{ scale: 0.95 }}
            >
                <span className="back-arrow">←</span> Назад
            </motion.button>

            <h2 className="page-title">📦 Мои заказы</h2>

            {loading && (
                <div className="catalog-loading">
                    <div className="loading-spinner" />
                    <p>Загружаем заказы<span className="bouncing-dots"><span>.</span><span>.</span><span>.</span></span></p>
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
                                    <OrderHistoryCard
                                        key={o.order_id}
                                        order={o}
                                        onRepeat={handleRepeat}
                                        onUpdate={handleUpdate}
                                        onCancel={handleCancel}
                                    />
                                ))}
                            </div>
                        </section>
                    )}

                    {closed.length > 0 && (
                        <section className="my-orders-section">
                            <h3 className="my-orders-section-title">Выполненные ({closed.length})</h3>
                            <div className="my-orders-list">
                                {closed.map(o => (
                                    <OrderHistoryCard
                                        key={o.order_id}
                                        order={o}
                                        onRepeat={handleRepeat}
                                        onUpdate={handleUpdate}
                                        onCancel={handleCancel}
                                    />
                                ))}
                            </div>
                        </section>
                    )}
                </>
            )}
        </div>
    )
}
