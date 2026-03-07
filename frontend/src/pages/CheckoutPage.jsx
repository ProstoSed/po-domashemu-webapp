/**
 * CheckoutPage — оформление заказа.
 * Геокодирование адреса, расчёт доставки, выбор оплаты.
 */
import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useCart } from '../hooks/useCart'
import { useTelegram } from '../hooks/useTelegram'
import { formatPrice } from '../utils/formatPrice'
import { geocodeAddress } from '../utils/api'
import './CheckoutPage.css'

export default function CheckoutPage() {
    const { items, totalPrice, clearCart } = useCart()
    const { sendData, haptic, user } = useTelegram()
    const navigate = useNavigate()

    const [delivery, setDelivery] = useState('pickup')
    const [address, setAddress] = useState('')
    const [phone, setPhone] = useState('')
    const [date, setDate] = useState('')
    const [comment, setComment] = useState('')
    const [payment, setPayment] = useState('cash')
    const [sending, setSending] = useState(false)

    // Геокодирование
    const [geoStatus, setGeoStatus] = useState('idle') // idle | loading | found | error
    const [geoInfo, setGeoInfo] = useState(null)        // { address, distance_km, delivery_price, lat, lon }
    const geocodeTimer = useRef(null)

    if (items.length === 0) {
        navigate('/cart')
        return null
    }

    const deliveryPrice = delivery === 'delivery' && geoInfo ? geoInfo.delivery_price : 0
    const grandTotal = totalPrice + deliveryPrice

    // Геокодирование с debounce 900мс
    const scheduleGeocode = (addr) => {
        clearTimeout(geocodeTimer.current)
        if (!addr.trim() || addr.trim().length < 5) {
            setGeoStatus('idle')
            setGeoInfo(null)
            return
        }
        setGeoStatus('loading')
        geocodeTimer.current = setTimeout(async () => {
            try {
                const result = await geocodeAddress(addr.trim())
                if (result.found) {
                    setGeoStatus('found')
                    setGeoInfo(result)
                } else {
                    setGeoStatus('error')
                    setGeoInfo(null)
                }
            } catch {
                setGeoStatus('error')
                setGeoInfo(null)
            }
        }, 900)
    }

    // Сброс геокодирования при переключении на самовывоз
    useEffect(() => {
        if (delivery === 'pickup') {
            clearTimeout(geocodeTimer.current)
            setGeoStatus('idle')
            setGeoInfo(null)
        }
    }, [delivery])

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
                price_item_min: i.price_item_min,
            })),
            total: grandTotal,
            items_total: totalPrice,
            delivery_type: delivery,
            delivery_price: deliveryPrice,
            address: delivery === 'delivery'
                ? (geoInfo?.address || address)
                : 'Самовывоз (д. Зимёнки)',
            geo: geoInfo
                ? { lat: geoInfo.lat, lon: geoInfo.lon, distance_km: geoInfo.distance_km }
                : null,
            phone,
            date: date || 'Как можно скорее',
            comment,
            payment_method: payment,
            user: user ? {
                id: user.id,
                first_name: user.first_name,
                username: user.username,
            } : null,
        }

        // Очищаем корзину ДО sendData, т.к. tg.sendData() закрывает WebApp мгновенно
        clearCart()

        // В Telegram: sendData отправляет данные боту и закрывает Mini App
        // Бот обрабатывает заказ (сохраняет + уведомляет маму)
        sendData(orderData)

        // Если мы всё ещё здесь (браузер, не Telegram) — показываем success
        navigate('/success')
        setSending(false)
    }

    const card = (delay) => ({
        initial: { opacity: 0, y: 10 },
        animate: { opacity: 1, y: 0 },
        transition: { delay },
    })

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
            <motion.div className="form-group glass-card" {...card(0.05)}>
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

            {/* Адрес доставки + геокодирование */}
            {delivery === 'delivery' && (
                <motion.div
                    className="form-group glass-card"
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                >
                    <label className="form-label">Адрес доставки</label>
                    <input
                        type="text"
                        className="form-input"
                        placeholder="Нижний Новгород, ул. Ленина, 5"
                        value={address}
                        onChange={e => {
                            setAddress(e.target.value)
                            scheduleGeocode(e.target.value)
                        }}
                    />

                    {geoStatus === 'loading' && (
                        <div className="geo-status">📍 Определяем адрес<span className="bouncing-dots"><span>.</span><span>.</span><span>.</span></span></div>
                    )}
                    {geoStatus === 'found' && geoInfo && (
                        <div className="geo-result">
                            <div className="geo-address">📍 {geoInfo.address}</div>
                            <div className="geo-meta">
                                📏 ~{geoInfo.distance_km} км {geoInfo.road_distance ? 'по дороге' : 'по прямой'}
                                &nbsp;·&nbsp;
                                🚗 Доставка: <b>{formatPrice(geoInfo.delivery_price)}</b>
                            </div>
                        </div>
                    )}
                    {geoStatus === 'error' && (
                        <div className="geo-error">
                            ⚠️ Не удалось определить адрес — цену уточним при звонке
                        </div>
                    )}
                </motion.div>
            )}

            {/* Телефон */}
            <motion.div className="form-group glass-card" {...card(0.1)}>
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
            <motion.div className="form-group glass-card" {...card(0.15)}>
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
            <motion.div className="form-group glass-card" {...card(0.2)}>
                <label className="form-label">Комментарий (необязательно)</label>
                <textarea
                    className="form-input form-textarea"
                    placeholder="Например: без орехов, поярче декор"
                    value={comment}
                    onChange={e => setComment(e.target.value)}
                    rows={3}
                />
            </motion.div>

            {/* Способ оплаты */}
            <motion.div className="form-group glass-card" {...card(0.25)}>
                <label className="form-label">Способ оплаты</label>
                <div className="delivery-options">
                    <button
                        className={`delivery-option ${payment === 'cash' ? 'active' : ''}`}
                        onClick={() => setPayment('cash')}
                    >
                        <span className="delivery-icon">💵</span>
                        <span>Наличными</span>
                    </button>
                    <button
                        className={`delivery-option ${payment === 'transfer' ? 'active' : ''}`}
                        onClick={() => setPayment('transfer')}
                    >
                        <span className="delivery-icon">💳</span>
                        <span>Перевод</span>
                    </button>
                </div>
            </motion.div>

            {/* Итог + кнопка */}
            <motion.div
                className="checkout-footer"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
            >
                {/* Разбивка: товары + доставка */}
                {delivery === 'delivery' && deliveryPrice > 0 && (
                    <div className="checkout-breakdown">
                        <div className="checkout-sub-row">
                            <span>Товары</span>
                            <span>{formatPrice(totalPrice)}</span>
                        </div>
                        <div className="checkout-sub-row">
                            <span>Доставка</span>
                            <span>{formatPrice(deliveryPrice)}</span>
                        </div>
                    </div>
                )}
                {delivery === 'delivery' && deliveryPrice === 0 && address && geoStatus !== 'loading' && (
                    <p className="checkout-delivery-hint">
                        {geoStatus === 'error'
                            ? '⚠️ Стоимость доставки уточним при звонке'
                            : '📍 Введите адрес для расчёта доставки'}
                    </p>
                )}

                <div className="checkout-total">
                    <span>Итого:</span>
                    <span className="checkout-total-price">{formatPrice(grandTotal)}</span>
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
