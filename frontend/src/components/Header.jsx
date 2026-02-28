import { useNavigate } from 'react-router-dom'
import { useTelegram } from '../hooks/useTelegram'
import './Header.css'

const MAMA_ID = 5513112898
const _extraIds = (import.meta.env.VITE_ADMIN_IDS || '')
    .split(',').map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n))
const ADMIN_IDS = new Set([MAMA_ID, ..._extraIds])

export default function Header() {
    const { user } = useTelegram()
    const navigate = useNavigate()
    const isMama = user && ADMIN_IDS.has(user.id)

    return (
        <header className="header">
            <div className="header-content">
                <span className="header-logo">🥧</span>
                <div className="header-text">
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
        </header>
    )
}
