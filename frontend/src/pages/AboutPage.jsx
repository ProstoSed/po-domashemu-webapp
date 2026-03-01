import { motion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import './AboutPage.css'

export default function AboutPage() {
    const navigate = useNavigate()

    return (
        <motion.div
            className="about-page"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
        >
            <div className="about-hero glass-card">
                <span className="about-hero-emoji">🥧</span>
                <h2 className="about-hero-title">По-домашнему</h2>
                <p className="about-hero-sub">Домашняя выпечка с душой</p>
            </div>

            <div className="about-card glass-card">
                <h3 className="about-section-title">👩‍🍳 О нас</h3>
                <p className="about-text">
                    Меня зовут <strong>Надежда</strong>. Я готовлю домашнюю выпечку на заказ —
                    пироги, торты, булочки, пиццу и многое другое. Всё делается с любовью,
                    из натуральных продуктов, без лишних добавок.
                </p>
                <p className="about-text">
                    Работаю из д. Зимёнки (Нижегородская область). Принимаю заказы для частных
                    лиц, на праздники, корпоративы и просто так 🙂
                </p>
            </div>

            <div className="about-card glass-card">
                <h3 className="about-section-title">📋 Как сделать заказ</h3>
                <div className="about-steps">
                    <div className="about-step">
                        <span className="about-step-num">1</span>
                        <span>Выберите товары в каталоге и добавьте в корзину</span>
                    </div>
                    <div className="about-step">
                        <span className="about-step-num">2</span>
                        <span>Оформите заказ — укажите телефон, дату и способ получения</span>
                    </div>
                    <div className="about-step">
                        <span className="about-step-num">3</span>
                        <span>Я подтвержу заказ и свяжусь с вами для уточнения деталей</span>
                    </div>
                    <div className="about-step">
                        <span className="about-step-num">4</span>
                        <span>Получите свежую выпечку самовывозом или с доставкой 🚗</span>
                    </div>
                </div>
            </div>

            <div className="about-card glass-card">
                <h3 className="about-section-title">💬 Связаться</h3>
                <a
                    className="about-contact-link"
                    href="https://t.me/kolesnik_nadezhda"
                    target="_blank"
                    rel="noreferrer"
                >
                    <span>✈️</span>
                    <span>@kolesnik_nadezhda в Telegram</span>
                </a>
            </div>

            <button className="btn btn-primary about-catalog-btn" onClick={() => navigate('/')}>
                🥧 Перейти в каталог
            </button>
        </motion.div>
    )
}
