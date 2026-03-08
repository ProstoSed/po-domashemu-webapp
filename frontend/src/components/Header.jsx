import { useState, useEffect, useRef } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useTelegram } from '../hooks/useTelegram'
import './Header.css'

const MAMA_ID = 5513112898
const _extraIds = (import.meta.env.VITE_ADMIN_IDS || '')
    .split(',').map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n))
const ADMIN_IDS = new Set([MAMA_ID, ..._extraIds])

// В dev-режиме (npm run dev) всегда показываем вкладки без проверки прав
const IS_DEV = import.meta.env.DEV

const CLIENT_NAV_ROW1 = [
    { path: '/search',    label: '🔍 Поиск' },
    { path: '/cart',      label: '🛒 Корзина' },
    { path: '/my-orders', label: '📦 Мои заказы' },
]

const CLIENT_NAV_ROW2 = [
    { path: '/delivery',  label: '🚗 Доставка' },
    { path: '/about',     label: 'ℹ️ О нас' },
    { path: '/invite',    label: '🎁 Пригласить' },
]

export default function Header() {
    const { user } = useTelegram()
    const navigate = useNavigate()
    const location = useLocation()
    const isMama = IS_DEV || (user && ADMIN_IDS.has(user.id))
    const isAdmin = location.pathname.startsWith('/admin')

    // Скрыть клиентский sub-nav на служебных страницах
    const hideClientNav = ['/cart', '/checkout', '/success'].some(
        p => location.pathname.startsWith(p)
    )

    // Скрытие навигации при скролле вниз, показ при скролле вверх
    const [navHidden, setNavHidden] = useState(false)
    const stateRef = useRef({ anchorY: 0, hidden: false, cooldown: false })

    useEffect(() => {
        const HIDE_AFTER = 60
        const SHOW_AFTER = 35
        const COOLDOWN_MS = 350  // игнорировать скролл после переключения (layout shift)

        const onScroll = () => {
            const st = stateRef.current
            if (st.cooldown) return

            const y = window.scrollY

            // У самого верха — всегда показывать
            if (y < 50) {
                if (st.hidden) {
                    st.hidden = false
                    st.anchorY = y
                    st.cooldown = true
                    setNavHidden(false)
                    setTimeout(() => { st.cooldown = false }, COOLDOWN_MS)
                }
                return
            }

            const delta = y - st.anchorY

            if (!st.hidden && delta > HIDE_AFTER) {
                st.hidden = true
                st.anchorY = y
                st.cooldown = true
                setNavHidden(true)
                setTimeout(() => { st.cooldown = false }, COOLDOWN_MS)
            } else if (st.hidden && delta < -SHOW_AFTER) {
                st.hidden = false
                st.anchorY = y
                st.cooldown = true
                setNavHidden(false)
                setTimeout(() => { st.cooldown = false }, COOLDOWN_MS)
            }
        }
        window.addEventListener('scroll', onScroll, { passive: true })
        return () => window.removeEventListener('scroll', onScroll)
    }, [])

    return (
        <header className="header">
            <div className="header-content">
                <span
                    className="header-logo"
                    onClick={() => navigate('/')}
                    style={{ cursor: 'pointer' }}
                >
                    🥧
                </span>
                <div className="header-text" onClick={() => navigate('/')} style={{ cursor: 'pointer' }}>
                    <h1 className="header-title">По-домашнему</h1>
                    <p className="header-subtitle">Домашняя выпечка на заказ</p>
                </div>
                <div className="header-baking-anim" aria-hidden="true" />
            </div>

            {/* Главные вкладки: Админка | Клиентское */}
            {isMama && (
                <div className="header-main-tabs">
                    <button
                        className={`header-main-tab ${isAdmin ? 'active' : ''}`}
                        onClick={() => navigate('/admin')}
                    >
                        ⚙️ Админка
                    </button>
                    <button
                        className={`header-main-tab ${!isAdmin ? 'active' : ''}`}
                        onClick={() => navigate('/')}
                    >
                        🥧 Клиентское
                    </button>
                </div>
            )}

            {/* Клиентский sub-nav */}
            {!isAdmin && !hideClientNav && (
                <div className={`header-nav-wrap ${navHidden ? 'nav-hidden' : ''}`}>
                    <div className="header-panel-title">Панель управления</div>
                    <div className="header-nav-grid">
                        {[...CLIENT_NAV_ROW1, ...CLIENT_NAV_ROW2].map(item => (
                            <button
                                key={item.path}
                                className={`header-grid-btn ${location.pathname === item.path ? 'active' : ''}`}
                                onClick={() => navigate(item.path)}
                            >
                                {item.label}
                            </button>
                        ))}
                    </div>
                </div>
            )}
        </header>
    )
}
