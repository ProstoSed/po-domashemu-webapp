/**
 * CartPage — страница корзины.
 * Показывает товары, количество, цены, итог.
 */
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useCart } from '../hooks/useCart'
import { formatPrice, getUnitLabel } from '../utils/formatPrice'
import QuantityPicker from '../components/QuantityPicker'
import './CartPage.css'

export default function CartPage() {
    const { items, updateQuantity, removeItem, clearCart, totalPrice } = useCart()
    const navigate = useNavigate()

    if (items.length === 0) {
        return (
            <div className="empty-state">
                <span className="empty-state-emoji">🛒</span>
                <p className="empty-state-title">Корзина пуста</p>
                <p className="empty-state-text">Выберите любимую выпечку из каталога</p>
                <button className="btn btn-primary" onClick={() => navigate('/')}>
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
                ← В каталог
            </motion.button>

            <h2 className="cart-title">Ваша корзина</h2>

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
                                        <span className="cart-item-weight">{item.weight} кг</span>
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
            </div>
        </div>
    )
}
