/**
 * LentenCatalogPage — каталог постного меню.
 * Аналог CatalogPage, но загружает постные позиции из /api/lenten-prices.
 */
import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useLentenPrices } from '../hooks/useLentenPrices'
import CategoryCard from '../components/CategoryCard'
import './CatalogPage.css'
import './CategoryPage.css'

const LOADING_PHRASES = [
    'Подбираем постные рецепты',
    'Готовим без молока и яиц',
    'Замешиваем постное тесто',
    'Выбираем сезонные овощи',
    'Готовим с душой и заботой',
    'Ищем лучшие постные блюда',
    'Проверяем свежесть ингредиентов',
    'Готовим полезное и вкусное',
]

function getRandomPhrase(exclude) {
    const filtered = LOADING_PHRASES.filter(p => p !== exclude)
    return filtered[Math.floor(Math.random() * filtered.length)]
}

export default function LentenCatalogPage() {
    const { categories, loading, error } = useLentenPrices()
    const navigate = useNavigate()
    const [loadingPhrase, setLoadingPhrase] = useState(() => getRandomPhrase())

    useEffect(() => {
        if (!loading) return
        const id = setInterval(() => {
            setLoadingPhrase(prev => getRandomPhrase(prev))
        }, 2000)
        return () => clearInterval(id)
    }, [loading])

    if (loading) {
        return (
            <div className="catalog-loading">
                <div className="loading-spinner" />
                <p className="loading-phrase" key={loadingPhrase}>{loadingPhrase}<span className="bouncing-dots"><span>.</span><span>.</span><span>.</span></span></p>
            </div>
        )
    }

    if (error) {
        return (
            <div className="empty-state">
                <span className="empty-state-emoji">😔</span>
                <p className="empty-state-title">Не удалось загрузить постное меню</p>
                <p className="empty-state-text">Проверьте подключение к интернету</p>
                <button className="btn btn-primary" onClick={() => navigate('/')}>
                    Вернуться в меню
                </button>
            </div>
        )
    }

    if (categories.length === 0) {
        return (
            <div className="empty-state">
                <span className="empty-state-emoji">🌿</span>
                <p className="empty-state-title">Постное меню пока пусто</p>
                <p className="empty-state-text">Скоро здесь появятся постные блюда</p>
                <button className="btn btn-primary" onClick={() => navigate('/')}>
                    Вернуться в меню
                </button>
            </div>
        )
    }

    return (
        <div className="catalog-page">
            <motion.button
                className="back-button"
                onClick={() => navigate('/')}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                whileTap={{ scale: 0.95 }}
            >
                <span className="back-arrow">←</span> Наше меню
            </motion.button>

            <h2 className="catalog-title">🌿 Постное меню</h2>
            <p className="catalog-subtitle">
                {categories.length} категорий — вкусно и без компромиссов
            </p>
            <div className="catalog-list">
                {categories.map((cat, i) => (
                    <CategoryCard
                        key={cat.key}
                        category={cat}
                        index={i}
                        linkPrefix="/lenten/category"
                    />
                ))}
            </div>
        </div>
    )
}
