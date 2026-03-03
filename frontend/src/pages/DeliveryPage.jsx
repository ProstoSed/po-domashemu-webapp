import { useState, useRef } from 'react'
import { motion } from 'framer-motion'
import { geocodeAddress } from '../utils/api'
import { formatPrice } from '../utils/formatPrice'
import './DeliveryPage.css'

const PICKUP_ADDRESS = 'д. Зимёнки, Нижегородская область'

const DELIVERY_ZONES = [
    { distance: 'до 5 км',   price: '100 ₽' },
    { distance: '5 – 10 км', price: '100–200 ₽' },
    { distance: '10 – 20 км', price: '200–400 ₽' },
    { distance: '20 – 30 км', price: '400–600 ₽' },
]

export default function DeliveryPage() {
    const [calcAddr, setCalcAddr] = useState('')
    const [calcStatus, setCalcStatus] = useState('idle')
    const [calcResult, setCalcResult] = useState(null)
    const timerRef = useRef(null)

    const handleCalcInput = (value) => {
        setCalcAddr(value)
        clearTimeout(timerRef.current)

        if (!value.trim() || value.trim().length < 5) {
            setCalcStatus('idle')
            setCalcResult(null)
            return
        }

        setCalcStatus('loading')
        timerRef.current = setTimeout(async () => {
            try {
                const result = await geocodeAddress(value.trim())
                if (result.found) {
                    setCalcStatus('found')
                    setCalcResult(result)
                } else {
                    setCalcStatus('error')
                    setCalcResult(null)
                }
            } catch {
                setCalcStatus('error')
                setCalcResult(null)
            }
        }, 900)
    }

    return (
        <motion.div
            className="delivery-page"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
        >
            <h2 className="delivery-title">🚗 Доставка и самовывоз</h2>

            {/* Самовывоз */}
            <div className="delivery-card glass-card">
                <div className="delivery-card-header">
                    <span className="delivery-icon">🏠</span>
                    <h3>Самовывоз</h3>
                    <span className="delivery-badge delivery-badge--free">Бесплатно</span>
                </div>
                <p className="delivery-card-desc">
                    Заберите заказ самостоятельно по адресу:
                </p>
                <div className="delivery-address">
                    <span>📍</span>
                    <span>{PICKUP_ADDRESS}</span>
                </div>
                <p className="delivery-hint">
                    Дату и время согласуем при оформлении заказа.
                </p>
            </div>

            {/* Доставка */}
            <div className="delivery-card glass-card">
                <div className="delivery-card-header">
                    <span className="delivery-icon">🚗</span>
                    <h3>Доставка</h3>
                </div>
                <p className="delivery-card-desc">
                    Стоимость рассчитывается по расстоянию от д. Зимёнки:
                </p>
                <div className="delivery-formula">
                    <span>20 ₽ × км</span>
                    <span className="delivery-formula-sep">·</span>
                    <span>минимум 100 ₽</span>
                </div>
                <div className="delivery-zones">
                    {DELIVERY_ZONES.map(z => (
                        <div key={z.distance} className="delivery-zone-row">
                            <span className="delivery-zone-dist">{z.distance}</span>
                            <span className="delivery-zone-price">{z.price}</span>
                        </div>
                    ))}
                </div>

                {/* Калькулятор доставки */}
                <div className="delivery-calc">
                    <p className="delivery-calc-label">Рассчитать стоимость доставки:</p>
                    <input
                        className="delivery-calc-input"
                        type="text"
                        placeholder="Введите адрес..."
                        value={calcAddr}
                        onChange={(e) => handleCalcInput(e.target.value)}
                    />
                    {calcStatus === 'loading' && (
                        <p className="delivery-calc-status">
                            Определяем адрес<span className="bouncing-dots"><span>.</span><span>.</span><span>.</span></span>
                        </p>
                    )}
                    {calcStatus === 'error' && (
                        <p className="delivery-calc-status delivery-calc-error">
                            Не удалось определить адрес. Попробуйте уточнить.
                        </p>
                    )}
                    {calcStatus === 'found' && calcResult && (
                        <div className="delivery-calc-result">
                            <div className="delivery-calc-row">
                                <span>📍</span>
                                <span>{calcResult.address}</span>
                            </div>
                            <div className="delivery-calc-row">
                                <span>📏</span>
                                <span>~{calcResult.distance_km} км {calcResult.road_distance ? 'по дороге' : 'по прямой'}</span>
                            </div>
                            <div className="delivery-calc-row delivery-calc-price">
                                <span>🚗</span>
                                <span>Доставка: <b>{formatPrice(calcResult.delivery_price)}</b></span>
                            </div>
                        </div>
                    )}
                </div>

                <p className="delivery-hint">
                    Точная цена считается автоматически при оформлении заказа — введите адрес и увидите стоимость.
                </p>
            </div>

            {/* Время */}
            <div className="delivery-card glass-card">
                <div className="delivery-card-header">
                    <span className="delivery-icon">⏰</span>
                    <h3>Время выполнения</h3>
                </div>
                <p className="delivery-card-desc">
                    Заказ выполняется в течение <strong>1–3 дней</strong> в зависимости от сложности. Желаемую дату можно указать при оформлении — постараемся выполнить к нужному времени.
                </p>
            </div>
        </motion.div>
    )
}
