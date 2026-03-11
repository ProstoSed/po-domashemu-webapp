/**
 * AssistantButton — плавающая кнопка AI-помощника.
 * Расположена НАД кнопкой корзины, адаптивна для разных экранов.
 */
import { motion } from 'framer-motion'
import { useCart } from '../hooks/useCart'
import './AssistantButton.css'

export default function AssistantButton({ onClick }) {
    const { totalItems } = useCart()

    // Сдвигаем выше если корзина видна
    const hasCart = totalItems > 0

    return (
        <motion.button
            className={`assistant-fab ${hasCart ? 'assistant-fab--with-cart' : ''}`}
            onClick={onClick}
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', damping: 15, stiffness: 300, delay: 0.3 }}
            whileTap={{ scale: 0.9 }}
            whileHover={{ scale: 1.05 }}
        >
            <span className="assistant-fab-icon">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 2a7 7 0 0 1 7 7c0 2.38-1.19 4.47-3 5.74V17a2 2 0 0 1-2 2H10a2 2 0 0 1-2-2v-2.26C6.19 13.47 5 11.38 5 9a7 7 0 0 1 7-7z"/>
                    <line x1="10" y1="22" x2="14" y2="22"/>
                    <line x1="9" y1="17" x2="15" y2="17"/>
                </svg>
            </span>
            <span className="assistant-fab-label">Подсказать?</span>
        </motion.button>
    )
}
