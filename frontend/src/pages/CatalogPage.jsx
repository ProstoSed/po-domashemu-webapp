/**
 * CatalogPage — главная страница каталога.
 * Показывает все категории товаров из prices.json.
 */
import { useState } from 'react'
import { usePrices } from '../hooks/usePrices'
import CategoryCard from '../components/CategoryCard'
import './CatalogPage.css'

const LOADING_PHRASES = [
    'Достаём пироги из печи...',
    'Замешиваем тесто...',
    'Взбиваем крем...',
    'Проверяем начинку...',
    'Пробуем на вкус...',
    'Раскатываем тесто...',
    'Добавляем щепотку любви...',
    'Накрываем стол...',
    'Ставим чайник...',
    'Готовим всё самое вкусное...',
]

function getRandomPhrase() {
    return LOADING_PHRASES[Math.floor(Math.random() * LOADING_PHRASES.length)]
}

export default function CatalogPage() {
    const { categories, loading, error } = usePrices()
    const [loadingPhrase] = useState(getRandomPhrase)

    if (loading) {
        return (
            <div className="catalog-loading">
                <div className="loading-spinner" />
                <p>{loadingPhrase}<span className="bouncing-dots"><span>.</span><span>.</span><span>.</span></span></p>
            </div>
        )
    }

    if (error) {
        return (
            <div className="empty-state">
                <span className="empty-state-emoji">😔</span>
                <p className="empty-state-title">Не удалось загрузить меню</p>
                <p className="empty-state-text">Проверьте подключение к интернету</p>
            </div>
        )
    }

    return (
        <div className="catalog-page">
            <h2 className="catalog-title">Наше меню</h2>
            <p className="catalog-subtitle">
                {categories.length} категорий — выбирайте с любовью 💛
            </p>
            <div className="catalog-list">
                {categories.map((cat, i) => (
                    <CategoryCard key={cat.key} category={cat} index={i} />
                ))}
            </div>
        </div>
    )
}
