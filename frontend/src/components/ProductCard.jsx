import { useState } from 'react'
import { motion } from 'framer-motion'
import { useCart } from '../hooks/useCart'
import { useTelegram } from '../hooks/useTelegram'
import { formatItemPrice } from '../utils/formatPrice'
import QuantityPicker from './QuantityPicker'
import './ProductCard.css'

export default function ProductCard({ item, categoryKey, index }) {
    const { addItem } = useCart()
    const { haptic } = useTelegram()
    const [added, setAdded] = useState(false)
    const [qty, setQty] = useState(1)

    const isKg = item.unit === 'кг'
    const hasPrice = !item.price_note  // не «индивидуально»

    const handleAdd = () => {
        if (!hasPrice) return
        addItem({ ...item, categoryKey }, qty, isKg ? 1 : null)
        haptic('medium')
        setAdded(true)
        setTimeout(() => setAdded(false), 1200)
        setQty(1)
    }

    return (
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
    )
}
