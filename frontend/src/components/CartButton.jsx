import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useCart } from '../hooks/useCart'
import { formatPrice } from '../utils/formatPrice'
import './CartButton.css'

export default function CartButton() {
    const { totalItems, totalPrice } = useCart()
    const navigate = useNavigate()

    if (totalItems === 0) return null

    return (
        <AnimatePresence>
            <motion.button
                className="cart-fab"
                onClick={() => navigate('/cart')}
                initial={{ y: 80, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: 80, opacity: 0 }}
                transition={{ type: 'spring', damping: 20, stiffness: 300 }}
                whileTap={{ scale: 0.95 }}
                key="cart-fab"
            >
                <span className="cart-fab-icon">🛒</span>
                <span className="cart-fab-text">Корзина</span>
                <span className="cart-fab-price">{formatPrice(totalPrice)}</span>
                <motion.span
                    className="cart-fab-badge"
                    key={totalItems}
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: 'spring', damping: 10, stiffness: 400 }}
                >
                    {totalItems}
                </motion.span>
            </motion.button>
        </AnimatePresence>
    )
}
