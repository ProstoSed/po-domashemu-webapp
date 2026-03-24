import { useState, useRef, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useCart } from '../hooks/useCart'
import { useTelegram } from '../hooks/useTelegram'
import { formatPrice, formatItemPrice } from '../utils/formatPrice'
import QuantityPicker from './QuantityPicker'
import WeightPicker from './WeightPicker'
import './ProductCard.css'

const API_URL = import.meta.env.VITE_API_URL || ''

/** Парсит варианты из скобок в конце названия: "Пирожки (мясо, яблоко)" → { base: "Пирожки", variants: ["мясо", "яблоко"] } */
function parseVariants(name) {
    const m = name.match(/^(.+?)\s*\(([^)]+)\)\s*$/)
    if (!m) return null
    const base = m[1].trim()
    const variants = m[2].split(',').map(v => v.trim()).filter(Boolean)
    return variants.length > 0 ? { base, variants } : null
}

export default function ProductCard({ item, categoryKey, index, highlight, promoExtra }) {
    const { addItem } = useCart()
    const { haptic } = useTelegram()
    const [added, setAdded] = useState(false)
    const [flyAnim, setFlyAnim] = useState(null)
    const btnRef = useRef(null)

    const isKg = item.unit === 'кг'
    const minOrder = item.min_order || null
    const minQty = (!isKg && minOrder) ? minOrder : 1
    const minWeight = (isKg && minOrder) ? minOrder : 0.5

    const [qty, setQty] = useState(minQty)
    const [weight, setWeight] = useState(isKg ? Math.max(1, minWeight) : 1)
    const [showPhoto, setShowPhoto] = useState(false)
    const [photoError, setPhotoError] = useState(false)
    const [showDesc, setShowDesc] = useState(false)

    // Варианты начинок из скобок
    const parsed = useMemo(() => parseVariants(item.name), [item.name])
    const [selectedVariant, setSelectedVariant] = useState(null)

    const hasPrice = !item.price_note  // не «индивидуально»
    const hasPhoto = !!item.photo_filename
    const hasDesc = !!item.description
    const needsVariant = parsed && !selectedVariant

    const handleAdd = () => {
        if (!hasPrice || needsVariant) return
        const cartItem = parsed && selectedVariant
            ? { ...item, name: `${parsed.base} (${selectedVariant})`, id: `${item.id}__${selectedVariant}` }
            : item
        addItem({ ...cartItem, categoryKey }, qty, isKg ? weight : null)
        haptic('medium')
        setAdded(true)
        setTimeout(() => setAdded(false), 1200)
        setQty(minQty)

        // Анимация «улетания» к корзине
        const cartEl = document.querySelector('.cart-fab')
        const btnEl = btnRef.current
        if (cartEl && btnEl) {
            const from = btnEl.getBoundingClientRect()
            const to = cartEl.getBoundingClientRect()
            setFlyAnim({
                startX: from.left + from.width / 2,
                startY: from.top + from.height / 2,
                endX: to.left + to.width / 2,
                endY: to.top + to.height / 2,
                name: item.name,
            })
            setTimeout(() => setFlyAnim(null), 600)
        }
    }

    const photoUrl = hasPhoto ? `${API_URL}/api/photos/${item.photo_filename}` : null

    return (
        <div className={`product-card-wrapper${highlight ? ' product-highlight' : ''}`} id={`product-${item.id}`}>
            <motion.div
                className="product-card glass-card"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05, duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
            >
                <div className="product-info">
                    <h4 className="product-name">{parsed ? parsed.base : item.name}</h4>
                    {item.note && <span className="product-note">{item.note}</span>}
                    {parsed && (
                        <div className="variant-chips">
                            {parsed.variants.map(v => (
                                <button
                                    key={v}
                                    className={`variant-chip ${selectedVariant === v ? 'variant-chip--active' : ''}`}
                                    onClick={() => setSelectedVariant(prev => prev === v ? null : v)}
                                >
                                    {v}
                                </button>
                            ))}
                        </div>
                    )}
                    <div className="product-price-row">
                        {item._promoNewPrice ? (
                            <>
                                <span className="price-tag price-tag--old">{formatItemPrice(item)}</span>
                                <span className="price-tag price-tag--new">
                                    {formatPrice(item._promoNewPrice)}{item.unit === 'кг' ? '/кг' : ''}
                                </span>
                                {item.discount_percent && (
                                    <span className="promo-discount-badge">-{item.discount_percent}%</span>
                                )}
                            </>
                        ) : (
                            <span className="price-tag">{formatItemPrice(item)}</span>
                        )}
                    </div>
                    {promoExtra && <div className="promo-info-row">{promoExtra}</div>}
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
                                ref={btnRef}
                                className={`btn-add ${added ? 'btn-add--success' : ''} ${needsVariant ? 'btn-add--disabled' : ''}`}
                                onClick={handleAdd}
                                whileTap={needsVariant ? {} : { scale: 0.9 }}
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

            {flyAnim && createPortal(
                <motion.div
                    className="fly-to-cart"
                    initial={{ x: flyAnim.startX, y: flyAnim.startY, scale: 1, opacity: 1 }}
                    animate={{ x: flyAnim.endX, y: flyAnim.endY, scale: 0.3, opacity: 0 }}
                    transition={{ duration: 0.55, ease: [0.32, 0, 0.67, 0] }}
                >
                    🛒
                </motion.div>,
                document.body
            )}
        </div>
    )
}
