import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useCart } from '../hooks/useCart'
import { useTelegram } from '../hooks/useTelegram'
import { formatItemPrice } from '../utils/formatPrice'
import QuantityPicker from './QuantityPicker'
import './ProductCard.css'

const API_URL = import.meta.env.VITE_API_URL || ''

export default function ProductCard({ item, categoryKey, index }) {
    const { addItem } = useCart()
    const { haptic } = useTelegram()
    const [added, setAdded] = useState(false)
    const [qty, setQty] = useState(1)
    const [showPhoto, setShowPhoto] = useState(false)
    const [photoError, setPhotoError] = useState(false)

    const isKg = item.unit === 'кг'
    const hasPrice = !item.price_note  // не «индивидуально»
    const hasPhoto = !!item.photo_filename

    const handleAdd = () => {
        if (!hasPrice) return
        addItem({ ...item, categoryKey }, qty, isKg ? 1 : null)
        haptic('medium')
        setAdded(true)
        setTimeout(() => setAdded(false), 1200)
        setQty(1)
    }

    const photoUrl = hasPhoto ? `${API_URL}/api/photos/${item.photo_filename}` : null

    return (
        <div className="product-card-wrapper">
            <motion.div
                className="product-card glass-card"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05, duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
            >
                <div className="product-info">
                    <h4 className="product-name">{item.name}</h4>
                    {item.note && <span className="product-note">{item.note}</span>}
                    <div className="product-price-row">
                        <span className="price-tag">{formatItemPrice(item)}</span>
                    </div>
                    {hasPhoto && (
                        <button
                            className="btn-show-photo"
                            onClick={() => { setShowPhoto(p => !p); setPhotoError(false) }}
                        >
                            {showPhoto ? '🖼 Скрыть фото' : '🖼 Показать фото'}
                        </button>
                    )}
                </div>

                {hasPrice && (
                    <div className="product-actions">
                        <QuantityPicker value={qty} onChange={setQty} min={1} max={20} />
                        <motion.button
                            className={`btn-add ${added ? 'btn-add--success' : ''}`}
                            onClick={handleAdd}
                            whileTap={{ scale: 0.9 }}
                        >
                            {added ? '✓' : '+'}
                        </motion.button>
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
        </div>
    )
}
