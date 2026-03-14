/**
 * SuccessPage — заказ успешно оформлен.
 * Анимированная галочка + конфетти.
 */
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useTelegram } from '../hooks/useTelegram'
import './SuccessPage.css'

const CONFETTI_COLORS = ['#d4a373', '#faedcd', '#e57373', '#81c784', '#ffb74d', '#64b5f6']

function Confetti() {
    const pieces = Array.from({ length: 30 }, (_, i) => ({
        id: i,
        x: Math.random() * 100,
        delay: Math.random() * 2,
        dur: 2 + Math.random() * 2,
        color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
        size: 6 + Math.random() * 8
    }))

    return (
        <div className="confetti-container">
            {pieces.map(p => (
                <div
                    key={p.id}
                    className="confetti-piece"
                    style={{
                        left: `${p.x}%`,
                        animationDelay: `${p.delay}s`,
                        animationDuration: `${p.dur}s`,
                        backgroundColor: p.color,
                        width: `${p.size}px`,
                        height: `${p.size}px`
                    }}
                />
            ))}
        </div>
    )
}

export default function SuccessPage() {
    const navigate = useNavigate()
    const { haptic, close } = useTelegram()
    const [showConfetti, setShowConfetti] = useState(true)

    useEffect(() => {
        haptic('heavy')
        const timer = setTimeout(() => setShowConfetti(false), 4000)
        return () => clearTimeout(timer)
    }, [])

    return (
        <div className="success-page">
            {showConfetti && <Confetti />}

            <motion.div
                className="success-icon"
                initial={{ scale: 0, rotate: -180 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ type: 'spring', damping: 10, stiffness: 200, delay: 0.2 }}
            >
                ✅
            </motion.div>

            <motion.h2
                className="success-title"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5 }}
            >
                Заказ отправлен!
            </motion.h2>

            <motion.p
                className="success-text"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.7 }}
            >
                Надежда свяжется с вами для подтверждения.
                Спасибо за заказ! 💛
            </motion.p>

            <motion.p
                className="success-hint"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.9 }}
            >
                Передумали или хотите добавить что-то? Заказ можно изменить или отменить в разделе «Мои заказы» до начала доставки.
            </motion.p>

            <motion.div
                className="success-actions"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 1.1 }}
            >
                <button className="btn btn-primary btn-lg" onClick={() => navigate('/')}>
                    Ещё что-нибудь? 🥧
                </button>
                <button className="btn btn-secondary" onClick={close}>
                    Закрыть
                </button>
            </motion.div>
        </div>
    )
}
