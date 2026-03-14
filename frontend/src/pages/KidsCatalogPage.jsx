/**
 * KidsCatalogPage — каталог детского меню.
 */
import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useKidsPrices } from '../hooks/useKidsPrices'
import CategoryCard from '../components/CategoryCard'
import './CatalogPage.css'
import './CategoryPage.css'

const LOADING_PHRASES = [
    'Готовим для маленьких гурманов',
    'Украшаем разноцветной посыпкой',
    'Лепим фигурки из теста',
    'Выбираем самые вкусные начинки',
    'Печём мини-пирожки',
    'Делаем сладкие сюрпризы',
    'Готовим с любовью для детей',
    'Выпекаем весёлые формочки',
]

function getRandomPhrase(exclude) {
    const filtered = LOADING_PHRASES.filter(p => p !== exclude)
    return filtered[Math.floor(Math.random() * filtered.length)]
}

export default function KidsCatalogPage() {
    const { categories, loading, error } = useKidsPrices()
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
                <p className="empty-state-title">Не удалось загрузить детское меню</p>
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
                <span className="empty-state-emoji">🧸</span>
                <p className="empty-state-title">Детское меню пока пусто</p>
                <p className="empty-state-text">Скоро здесь появятся детские блюда</p>
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

            <h2 className="catalog-title">🧸 Детское меню</h2>
            <p className="catalog-subtitle">
                {categories.length} категорий — вкусно и весело для малышей
            </p>
            <div className="catalog-list">
                {categories.map((cat, i) => (
                    <CategoryCard
                        key={cat.key}
                        category={cat}
                        index={i}
                        linkPrefix="/kids/category"
                    />
                ))}
            </div>
        </div>
    )
}
