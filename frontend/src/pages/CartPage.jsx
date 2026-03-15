/**
 * CartPage — страница корзины.
 * Показывает товары, количество, цены, итог.
 */
import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useCart } from '../hooks/useCart'
import { updateMyOrder } from '../utils/api'
import { formatPrice, getUnitLabel } from '../utils/formatPrice'
import QuantityPicker from '../components/QuantityPicker'
import WeightPicker from '../components/WeightPicker'
import './CartPage.css'

export default function CartPage() {
    const { items, updateQuantity, updateWeight, removeItem, clearCart, totalPrice } = useCart()
    const navigate = useNavigate()
    const [editOrderId, setEditOrderId] = useState(null)
    const [merging, setMerging] = useState(false)

    useEffect(() => {
        const id = sessionStorage.getItem('editOrderId')
        if (id) setEditOrderId(id)
    }, [])

    const handleMergeToOrder = async () => {
        if (!editOrderId || items.length === 0) return
        setMerging(true)
        try {
            const existingItems = JSON.parse(sessionStorage.getItem('editOrderItems') || '[]')
            const deliveryTotal = parseFloat(sessionStorage.getItem('editOrderDeliveryTotal') || '0')
            const comment = sessionStorage.getItem('editOrderComment') || ''

            // Мёрж: добавляем новые товары из корзины к существующим
            const merged = [...existingItems]
            for (const cartItem of items) {
                const existingIdx = merged.findIndex(m => m.name === cartItem.name)
                if (existingIdx >= 0) {
                    // Суммируем количество
                    const ex = merged[existingIdx]
                    ex.quantity = (ex.quantity ?? 1) + cartItem.quantity
                    ex.total = (ex.price_per_unit || 0) * ex.quantity * (ex.weight || 1)
                } else {
                    // Новый товар
                    const price = cartItem.weight
                        ? (cartItem.price_kg || cartItem.price_kg_min || 0)
                        : (cartItem.price_item || cartItem.price_item_min || 0)
                    merged.push({
                        name: cartItem.name,
                        quantity: cartItem.quantity,
                        unit: cartItem.unit || 'шт',
                        weight: cartItem.weight || null,
                        price_per_unit: price,
                        total: price * cartItem.quantity * (cartItem.weight || 1),
                        category_key: cartItem.categoryKey,
                    })
                }
            }

            const itemsTotal = merged.reduce((s, i) => s + (i.total || 0), 0)
            await updateMyOrder(editOrderId, {
                items: merged,
                total: itemsTotal + deliveryTotal,
                items_total: itemsTotal,
                comment,
            })

            // Очистка
            clearCart()
            sessionStorage.removeItem('editOrderId')
            sessionStorage.removeItem('editOrderItems')
            sessionStorage.removeItem('editOrderDeliveryTotal')
            sessionStorage.removeItem('editOrderComment')
            setEditOrderId(null)
            navigate('/my-orders')
        } catch (err) {
            alert(err.message || 'Не удалось обновить заказ')
        } finally {
            setMerging(false)
        }
    }

    const handleCancelEditMode = () => {
        sessionStorage.removeItem('editOrderId')
        sessionStorage.removeItem('editOrderItems')
        sessionStorage.removeItem('editOrderDeliveryTotal')
        sessionStorage.removeItem('editOrderComment')
        setEditOrderId(null)
        clearCart()
        navigate('/my-orders')
    }

    if (items.length === 0) {
        return (
            <div className="empty-state">
                <span className="empty-state-emoji">🛒</span>
                <p className="empty-state-title">Корзина пуста</p>
                <p className="empty-state-text">Выберите любимую выпечку из каталога</p>
                <button className="btn-catalog-cta btn-shimmer" onClick={() => navigate('/')}>
                    Перейти в каталог
                </button>
            </div>
        )
    }

    return (
        <div className="cart-page">
            <motion.button
                className="back-button"
                onClick={() => navigate('/')}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                whileTap={{ scale: 0.95 }}
            >
                <span className="back-arrow">←</span> В каталог
            </motion.button>

            <h2 className="cart-title">
                {editOrderId ? `Добавление к ${editOrderId}` : 'Ваша корзина'}
            </h2>

            {editOrderId && (
                <div className="cart-edit-banner">
                    Выберите товары в каталоге и вернитесь сюда — они добавятся к вашему заказу
                </div>
            )}

            <div className="cart-items">
                <AnimatePresence>
                    {items.map((item) => {
                        const price = item.weight
                            ? (item.price_kg || item.price_kg_min || 0) * item.weight * item.quantity
                            : (item.price_item || item.price_item_min || 0) * item.quantity

                        return (
                            <motion.div
                                className="cart-item glass-card"
                                key={item.key}
                                layout
                                initial={{ opacity: 0, x: 20 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -50, height: 0, marginBottom: 0, padding: 0 }}
                                transition={{ duration: 0.3 }}
                            >
                                <div className="cart-item-info">
                                    <h4 className="cart-item-name">{item.name}</h4>
                                    {item.weight && (
                                        <div className="cart-item-weight-row">
                                            <WeightPicker
                                                value={item.weight}
                                                onChange={(w) => updateWeight(item.key, w)}
                                            />
                                        </div>
                                    )}
                                    <span className="cart-item-price price-tag">
                                        {formatPrice(price)}
                                    </span>
                                </div>
                                <div className="cart-item-actions">
                                    <QuantityPicker
                                        value={item.quantity}
                                        onChange={(q) => updateQuantity(item.key, q)}
                                        min={0}
                                    />
                                    <motion.button
                                        className="cart-item-remove"
                                        onClick={() => removeItem(item.key)}
                                        whileTap={{ scale: 0.85 }}
                                    >
                                        ✕
                                    </motion.button>
                                </div>
                            </motion.div>
                        )
                    })}
                </AnimatePresence>
            </div>

            <motion.button
                className="btn-catalog-cta btn-outline btn-shimmer"
                onClick={() => navigate('/')}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                whileTap={{ scale: 0.97 }}
            >
                Добавить ещё
            </motion.button>

            {/* Итог */}
            <motion.div
                className="cart-summary glass-card"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
            >
                <div className="cart-summary-row">
                    <span>Итого</span>
                    <span className="cart-summary-total">{formatPrice(totalPrice)}</span>
                </div>
                <div className="cart-summary-note">
                    + стоимость доставки (если не самовывоз)
                </div>
            </motion.div>

            <div className="cart-buttons">
                {editOrderId ? (
                    <>
                        <button
                            className="btn btn-primary btn-block btn-lg"
                            onClick={handleMergeToOrder}
                            disabled={merging || items.length === 0}
                        >
                            {merging ? 'Сохраняю...' : `Добавить в заказ`}
                        </button>
                        <button
                            className="btn btn-outline btn-block"
                            onClick={handleCancelEditMode}
                        >
                            Отмена
                        </button>
                    </>
                ) : (
                    <>
                        <button
                            className="btn btn-primary btn-block btn-lg"
                            onClick={() => navigate('/checkout')}
                        >
                            Оформить заказ
                        </button>
                        <button
                            className="btn btn-danger btn-block"
                            onClick={clearCart}
                        >
                            Очистить корзину
                        </button>
                    </>
                )}
            </div>
        </div>
    )
}
