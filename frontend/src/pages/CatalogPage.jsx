/**
 * CatalogPage — главная страница каталога.
 * Показывает все категории товаров из prices.json.
 */
import { useState, useEffect } from 'react'
import { usePrices } from '../hooks/usePrices'
import CategoryCard from '../components/CategoryCard'
import './CatalogPage.css'

export default function CatalogPage() {
    const { categories, loading, error } = usePrices()
    const [mounted, setMounted] = useState(false)

    useEffect(() => { setMounted(true) }, [])

    // DEBUG: временная отладка — убрать после диагностики
    const debug = `mount=${mounted} load=${loading} err=${error || 'null'} cats=${categories.length}`

    if (loading) {
        return (
            <div className="catalog-loading">
                <div className="loading-spinner" />
                <p style={{ fontSize: '1.2rem', fontWeight: 700 }}>Загружаем меню...</p>
                <p style={{ fontSize: '0.7rem', opacity: 0.5 }}>{debug}</p>
            </div>
        )
    }

    if (error) {
        return (
            <div className="empty-state">
                <span className="empty-state-emoji">😔</span>
                <p className="empty-state-title">Не удалось загрузить меню</p>
                <p className="empty-state-text">Проверьте подключение к интернету</p>
                <p style={{ fontSize: '0.7rem', opacity: 0.5 }}>{debug}</p>
            </div>
        )
    }

    return (
        <div className="catalog-page">
            <h2 className="catalog-title">Наше меню</h2>
            <p className="catalog-subtitle">
                {categories.length} категорий — выбирайте с любовью 💛
            </p>
            <p style={{ fontSize: '0.6rem', opacity: 0.3 }}>{debug}</p>
            <div className="catalog-list">
                {categories.map((cat, i) => (
                    <CategoryCard key={cat.key} category={cat} index={i} />
                ))}
            </div>
        </div>
    )
}
