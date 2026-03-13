/**
 * InvitePage — Пригласить друга (реферальная ссылка).
 */
import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useTelegram } from '../hooks/useTelegram'
import { fetchMyReferral } from '../utils/api'
import './InvitePage.css'
import './CategoryPage.css'

// Fallback — если backend недоступен
const FALLBACK_BOT = 'VypechkaNadezhda_App_bot'

export default function InvitePage() {
    const navigate = useNavigate()
    const { user, tg } = useTelegram()
    const [copied, setCopied] = useState(false)
    const [refData, setRefData] = useState(null)

    useEffect(() => {
        fetchMyReferral()
            .then(setRefData)
            .catch(() => {})
    }, [])

    const userId = user?.id || 0
    const botUsername = refData?.bot_username || FALLBACK_BOT
    const refCount = refData?.referrals_count ?? 0
    const refLink = `https://t.me/${botUsername}?start=ref_${userId}`

    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(refLink)
            setCopied(true)
            setTimeout(() => setCopied(false), 2000)
        } catch {
            const input = document.createElement('input')
            input.value = refLink
            document.body.appendChild(input)
            input.select()
            document.execCommand('copy')
            document.body.removeChild(input)
            setCopied(true)
            setTimeout(() => setCopied(false), 2000)
        }
    }

    const handleShare = () => {
        if (tg?.openTelegramLink) {
            tg.openTelegramLink(
                `https://t.me/share/url?url=${encodeURIComponent(refLink)}&text=${encodeURIComponent('Попробуй домашнюю выпечку от По-домашнему! 🥧')}`
            )
        } else if (navigator.share) {
            navigator.share({
                title: 'По-домашнему 🥧',
                text: 'Попробуй домашнюю выпечку от По-домашнему!',
                url: refLink,
            }).catch(() => {})
        } else {
            handleCopy()
        }
    }

    return (
        <motion.div
            className="invite-page"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
        >
            <motion.button
                className="back-button"
                onClick={() => navigate('/')}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                whileTap={{ scale: 0.95 }}
            >
                ← Назад
            </motion.button>

            <div className="invite-hero glass-card">
                <span className="invite-hero-emoji">🎁</span>
                <h2 className="invite-title">Пригласи друга!</h2>
                <p className="invite-desc">
                    Поделитесь ссылкой с друзьями. Если они впервые запустят бота по вашей
                    ссылке — они станут вашими рефералами!
                </p>
                <p className="invite-bonus">
                    За каждого друга, оформившего заказ, вы получите <strong>скидку 5%</strong> на будущие заказы.
                </p>
            </div>

            <div className="invite-link-card glass-card">
                <div className="invite-link-label">🔗 Ваша ссылка:</div>
                <div className="invite-link-box">
                    <span className="invite-link-text">{refLink}</span>
                </div>
                <div className="invite-actions">
                    <button className="btn btn-primary invite-btn" onClick={handleCopy}>
                        {copied ? '✅ Скопировано!' : '📋 Копировать'}
                    </button>
                    <button className="btn btn-success invite-btn" onClick={handleShare}>
                        📤 Поделиться
                    </button>
                </div>
            </div>

            <div className="invite-stats glass-card">
                <span className="invite-stats-emoji">👥</span>
                <span className="invite-stats-text">
                    Вы пригласили: <strong>{refCount}</strong> {refCount === 1 ? 'друга' : 'друзей'}
                </span>
            </div>
        </motion.div>
    )
}
