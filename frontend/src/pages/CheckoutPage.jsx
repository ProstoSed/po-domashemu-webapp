/**
 * CheckoutPage — оформление заказа.
 * Дата, способ получения, телефон, комментарий.
 */
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useCart } from '../hooks/useCart'
import { useTelegram } from '../hooks/useTelegram'
import { formatPrice } from '../utils/formatPrice'
import './CheckoutPage.css'

export default function CheckoutPage() {
    const { items, totalPrice, clearCart } = useCart()
    const { sendData, haptic, user } = useTelegram()
    const navigate = useNavigate()

    const [delivery, setDelivery] = useState('pickup')  // pickup | delivery
    const [address, setAddress] = useState('')
    const [phone, setPhone] = useState('')
    const [date, setDate] = useState('')
    const [comment, setComment] = useState('')
    const [sending, setSending] = useState(false)

    if (items.length === 0) {
        navigate('/cart')
        return null
    }

    const handleSubmit = () => {
        if (!phone.trim()) {
            alert('Укажите номер телефона')
            return
        }
        if (delivery === 'delivery' && !address.trim()) {
            alert('Укажите адрес доставки')
            return
        }

        setSending(true)
        haptic('heavy')

        const orderData = {
            items: items.map(i => ({
                name: i.name,
                id: i.id,
                categoryKey: i.categoryKey,
                quantity: i.quantity,
                weight: i.weight,
                unit: i.unit,
                price_kg: i.price_kg,
                price_item: i.price_item,
                price_kg_min: i.price_kg_min,
                price_item_min: i.price_item_min
            })),
            total: totalPrice,
            delivery_type: delivery,
            address: delivery === 'delivery' ? address : 'Самовывоз (д. Зимёнки)',
            phone,
            date: date || 'Как можно скорее',
            comment,
            user: user ? {
                id: user.id,
                first_name: user.first_name,
                username: user.username
            } : null
        }

        // Отправляем данные через Telegram WebApp API
        sendData(orderData)

        // Если не в Telegram (разработка) — переходим на страницу успеха
        setTimeout(() => {
            clearCart()
            navigate('/success')
            setSending(false)
        }, 500)
    }

    return (
        <div className="checkout-page">
            <motion.button
                className="back-button"
                onClick={() => navigate('/cart')}
                whileTap={{ scale: 0.95 }}
            >
                ← Корзина
            </motion.button>

            <h2 className="checkout-title">Оформление</h2>

            {/* Способ получения */}
            <motion.div
                className="form-group glass-card"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.05 }}
            >
                <label className="form-label">Способ получения</label>
                <div className="delivery-options">
                    <button
                        className={`delivery-option ${delivery === 'pickup' ? 'active' : ''}`}
                        onClick={() => setDelivery('pickup')}
                    >
                        <span className="delivery-icon">🏡</span>
                        <span>Самовывоз</span>
                    </button>
                    <button
                        className={`delivery-option ${delivery === 'delivery' ? 'active' : ''}`}
                        onClick={() => setDelivery('delivery')}
                    >
                        <span className="delivery-icon">🚗</span>
                        <span>Доставка</span>
                    </button>
                </div>
            </motion.div>

            {/* Адрес доставки */}
            {delivery === 'delivery' && (
                <motion.div
                    className="form-group glass-card"
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                >
                    <label className="form-label">Адрес доставки</label>
                    <input
                        type="text"
                        className="form-input"
                        placeholder="Город, улица, дом, квартира"
                        value={address}
                        onChange={e => setAddress(e.target.value)}
                    />
                </motion.div>
            )}

            {/* Телефон */}
            <motion.div
                className="form-group glass-card"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
            >
                <label className="form-label">Телефон для связи</label>
                <input
                    type="tel"
                    className="form-input"
                    placeholder="+7 999 123-45-67"
                    value={phone}
                    onChange={e => setPhone(e.target.value)}
                />
            </motion.div>

            {/* Дата */}
            <motion.div
                className="form-group glass-card"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15 }}
            >
                <label className="form-label">Когда нужно?</label>
                <input
                    type="date"
                    className="form-input"
                    value={date}
                    onChange={e => setDate(e.target.value)}
                    min={new Date().toISOString().split('T')[0]}
                />
            </motion.div>

            {/* Комментарий */}
            <motion.div
                className="form-group glass-card"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
            >
                <label className="form-label">Комментарий (необязательно)</label>
                <textarea
                    className="form-input form-textarea"
                    placeholder="Например: без орехов, поярче декор"
                    value={comment}
                    onChange={e => setComment(e.target.value)}
                    rows={3}
                />
            </motion.div>

            {/* Итог + кнопка */}
            <motion.div
                className="checkout-footer"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.25 }}
            >
                <div className="checkout-total">
                    <span>Итого:</span>
                    <span className="checkout-total-price">{formatPrice(totalPrice)}</span>
                </div>
                <button
                    className="btn btn-primary btn-block btn-lg"
                    onClick={handleSubmit}
                    disabled={sending}
                >
                    {sending ? '⏳ Отправляем...' : '✅ Отправить заказ'}
                </button>
            </motion.div>
        </div>
    )
}
