import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useCart } from '../hooks/useCart'
import { useTelegram } from '../hooks/useTelegram'
import { formatItemPrice } from '../utils/formatPrice'
import QuantityPicker from './QuantityPicker'
import WeightPicker from './WeightPicker'
import './ProductCard.css'

const API_URL = import.meta.env.VITE_API_URL || ''

export default function ProductCard({ item, categoryKey, index, highlight }) {
    const { addItem } = useCart()
    const { haptic } = useTelegram()
    const [added, setAdded] = useState(false)

    const isKg = item.unit === 'кг'
    const minOrder = item.min_order || null
    const minQty = (!isKg && minOrder) ? minOrder : 1
    const minWeight = (isKg && minOrder) ? minOrder : 0.5

    const [qty, setQty] = useState(minQty)
    const [weight, setWeight] = useState(isKg ? Math.max(1, minWeight) : 1)
    const [showPhoto, setShowPhoto] = useState(false)
    const [photoError, setPhotoError] = useState(false)
    const [showDesc, setShowDesc] = useState(false)

    const hasPrice = !item.price_note  // не «индивидуально»
    const hasPhoto = !!item.photo_filename
    const hasDesc = !!item.description

    const handleAdd = () => {
        if (!hasPrice) return
        addItem({ ...item, categoryKey }, qty, isKg ? weight : null)
        haptic('medium')
        setAdded(true)
        setTimeout(() => setAdded(false), 1200)
        setQty(minQty)
    }

    const photoUrl = hasPhoto ? `${API_URL}/api/photos/${item.photo_filename}` : null

    // Сезонность: проверяем текущий сезон
    const currentSeason = (() => {
        const m = new Date().getMonth()
        if (m >= 2 && m <= 4) return 'весна'
        if (m >= 5 && m <= 7) return 'лето'
        if (m >= 8 && m <= 10) return 'осень'
        return 'зима'
    })()
    const isSeasonal = item.seasons?.includes(currentSeason)
    const seasonEmoji = { весна: '🌸', лето: '☀️', осень: '🍂', зима: '❄️' }

    return (
        <div className={`product-card-wrapper${highlight ? ' product-highlight' : ''}${isSeasonal ? ' product-seasonal' : ''}`} id={`product-${item.id}`}>
            <motion.div
                className={`product-card glass-card${item.featured ? ' product-featured' : ''}`}
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05, duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
            >
                <div className="product-info">
                    <h4 className="product-name">
                        {item.featured && <span className="product-featured-badge">⭐ </span>}
                        {item.name}
                    </h4>
                    {isSeasonal && (
                        <span className="product-seasonal-badge">
                            {seasonEmoji[currentSeason]} Сезонное
                        </span>
                    )}
                    {item.note && <span className="product-note">{item.note}</span>}
                    <div className="product-price-row">
                        <span className="price-tag">{formatItemPrice(item)}</span>
                    </div>
                    <div className="product-btns-row">
                        {hasPhoto && (
                            <button
                                className="btn-show-photo"
                                onClick={() => { setShowPhoto(p => !p); setPhotoError(false) }}
                            >
                                {showPhoto ? '🖼 Скрыть' : '🖼 Фото'}
                            </button>
                        )}
                        {hasDesc && (
                            <button
                                className="btn-show-desc"
                                onClick={() => setShowDesc(d => !d)}
                            >
                                {showDesc ? 'Скрыть' : 'Подробнее'}
                            </button>
                        )}
                    </div>
                </div>

                {hasPrice && (
                    <div className={`product-actions ${isKg ? 'product-actions--kg' : ''}`}>
                        {isKg && (
                            <WeightPicker value={weight} onChange={setWeight} minWeight={minWeight} />
                        )}
                        <div className="product-actions-row">
                            <QuantityPicker
                                value={qty}
                                onChange={setQty}
                                min={minQty}
                                max={20}
                            />
                            <motion.button
                                className={`btn-add ${added ? 'btn-add--success' : ''}`}
                                onClick={handleAdd}
                                whileTap={{ scale: 0.9 }}
                            >
                                {added ? '✓' : '+'}
                            </motion.button>
                        </div>
                    </div>
                )}
            </motion.div>

            <AnimatePresence>
                {showPhoto && hasPhoto && (
                    <motion.div
                        className="product-photo-expand"
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.3 }}
                    >
                        {!photoError ? (
                            <img
                                src={photoUrl}
                                alt={item.name}
                                className="product-photo-img"
                                onError={() => setPhotoError(true)}
                                loading="lazy"
                            />
                        ) : (
                            <p className="product-photo-error">Фото недоступно</p>
                        )}
                    </motion.div>
                )}
            </AnimatePresence>

            <AnimatePresence>
                {showDesc && hasDesc && (
                    <motion.div
                        className="product-desc-expand"
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.3 }}
                    >
                        <p className="product-desc-text">{item.description}</p>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    )
}
