import { useState, useEffect, useRef } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useTelegram } from '../hooks/useTelegram'
import './Header.css'

const MAMA_ID = 5513112898
const _extraIds = (import.meta.env.VITE_ADMIN_IDS || '')
    .split(',').map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n))
const ADMIN_IDS = new Set([MAMA_ID, ..._extraIds])

// В dev-режиме (npm run dev) всегда показываем вкладки без проверки прав
// В dev-режиме показываем админку только если DEV_USER_ID совпадает с одним из ADMIN_IDS
const IS_DEV = import.meta.env.DEV
const DEV_USER_ID = parseInt(import.meta.env.VITE_DEV_USER_ID || '0', 10)

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
    const userId = user?.id || (IS_DEV ? DEV_USER_ID : 0)
    const isMama = ADMIN_IDS.has(userId)
    const isAdmin = location.pathname.startsWith('/admin')

    // Скрыть клиентский sub-nav на служебных страницах
    const hideClientNav = ['/cart', '/checkout', '/success'].some(
        p => location.pathname.startsWith(p)
    )

    // Скрытие навигации при скролле вниз, показ при скролле вверх
    const [navHidden, setNavHidden] = useState(false)
    const stateRef = useRef({ lastY: 0, hidden: false, accumulated: 0, rafId: 0, changedAt: 0 })

    useEffect(() => {
        const HIDE_THRESHOLD = 50   // px вниз для скрытия
        const SHOW_THRESHOLD = 30   // px вверх для показа
        const TOP_ZONE = 40         // у самого верха — всегда показывать
        const MIN_INTERVAL = 400    // мс между переключениями (защита от инерции)

        const update = () => {
            const st = stateRef.current
            st.rafId = 0
            const y = window.scrollY
            const now = Date.now()

            // У самого верха — всегда показывать
            if (y < TOP_ZONE) {
                if (st.hidden) {
                    st.hidden = false
                    st.changedAt = now
                    setNavHidden(false)
                }
                st.accumulated = 0
                st.lastY = y
                return
            }

            const delta = y - st.lastY
            st.lastY = y

            // Если направление сменилось — сбрасываем аккумулятор
            if ((st.accumulated > 0 && delta < 0) || (st.accumulated < 0 && delta > 0)) {
                st.accumulated = 0
            }

            st.accumulated += delta

            // Не переключаем слишком часто (инерционный скролл на мобильных)
            if (now - st.changedAt < MIN_INTERVAL) return

            if (!st.hidden && st.accumulated > HIDE_THRESHOLD) {
                st.hidden = true
                st.accumulated = 0
                st.changedAt = now
                setNavHidden(true)
            } else if (st.hidden && st.accumulated < -SHOW_THRESHOLD) {
                st.hidden = false
                st.accumulated = 0
                st.changedAt = now
                setNavHidden(false)
            }
        }

        const onScroll = () => {
            if (!stateRef.current.rafId) {
                stateRef.current.rafId = requestAnimationFrame(update)
            }
        }

        stateRef.current.lastY = window.scrollY
        window.addEventListener('scroll', onScroll, { passive: true })
        return () => {
            window.removeEventListener('scroll', onScroll)
            if (stateRef.current.rafId) cancelAnimationFrame(stateRef.current.rafId)
        }
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
