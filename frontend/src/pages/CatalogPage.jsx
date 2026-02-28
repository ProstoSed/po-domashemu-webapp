/**
 * CatalogPage — главная страница каталога.
 * Показывает все категории товаров из prices.json.
 */
import { usePrices } from '../hooks/usePrices'
import CategoryCard from '../components/CategoryCard'
import './CatalogPage.css'

export default function CatalogPage() {
    const { categories, loading, error } = usePrices()

    if (loading) {
        return (
            <div className="catalog-loading">
                <div className="loading-spinner" />
                <p>Загружаем меню...</p>
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
