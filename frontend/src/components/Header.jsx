import { useNavigate, useLocation } from 'react-router-dom'
import { useTelegram } from '../hooks/useTelegram'
import './Header.css'

const MAMA_ID = 5513112898
const _extraIds = (import.meta.env.VITE_ADMIN_IDS || '')
    .split(',').map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n))
const ADMIN_IDS = new Set([MAMA_ID, ..._extraIds])

const CLIENT_NAV = [
    { path: '/search',    label: '🔍 Поиск' },
    { path: '/my-orders', label: '📦 Заказы' },
    { path: '/my-photos', label: '📷 Фото' },
]

export default function Header() {
    const { user } = useTelegram()
    const navigate = useNavigate()
    const location = useLocation()
    const isMama = user && ADMIN_IDS.has(user.id)

    // Скрыть навигацию на служебных страницах
    const hideNav = ['/cart', '/checkout', '/success', '/admin'].some(
        p => location.pathname.startsWith(p)
    )

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
                {isMama && (
                    <button
                        className="header-admin-btn"
                        onClick={() => navigate('/admin')}
                        title="Панель управления"
                    >
                        ⚙️
                    </button>
                )}
            </div>

            {/* Клиентская навигация (только для обычных пользователей) */}
            {!isMama && !hideNav && (
                <nav className="header-nav">
                    {CLIENT_NAV.map(item => (
                        <button
                            key={item.path}
                            className={`header-nav-btn ${location.pathname === item.path ? 'active' : ''}`}
                            onClick={() => navigate(item.path)}
                        >
                            {item.label}
                        </button>
                    ))}
                </nav>
            )}
        </header>
    )
}
