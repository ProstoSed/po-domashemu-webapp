/**
 * CategoryPage — страница товаров внутри категории.
 * Показывает все товары выбранной категории.
 */
import { useEffect, useState, useMemo } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { usePrices } from '../hooks/usePrices'
import { fetchPopular } from '../utils/api'
import ProductCard from '../components/ProductCard'
import './CategoryPage.css'
import './CatalogPage.css'

export default function CategoryPage() {
    const { categoryKey } = useParams()
    const navigate = useNavigate()
    const [searchParams, setSearchParams] = useSearchParams()
    const { getCategory, categories, loading } = usePrices()
    const [highlightId, setHighlightId] = useState(null)
    const [popularData, setPopularData] = useState({})

    useEffect(() => {
        fetchPopular().then(d => setPopularData(d.popular || {})).catch(() => {})
    }, [])

    // Популярные товары для текущей категории
    const popularItems = useMemo(() => {
        const catPopular = popularData[categoryKey] || []
        if (!catPopular.length || !categories.length) return []
        const category = categories.find(c => c.key === categoryKey)
        if (!category) return []
        const result = []
        for (const pop of catPopular) {
            const item = (category.items || []).find(i => i.name === pop.name)
            if (item) {
                result.push({ ...item, categoryKey, orderCount: pop.order_count })
            }
        }
        return result
    }, [popularData, categoryKey, categories])

    useEffect(() => {
        const hid = searchParams.get('highlight')
        if (hid) {
            setHighlightId(hid)
            // Убираем из URL чтобы не повторялось при навигации
            setSearchParams({}, { replace: true })
            // Скроллим к элементу
            setTimeout(() => {
                const el = document.getElementById(`product-${hid}`)
                if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' })
            }, 300)
            // Убираем подсветку через 2.5 секунды
            setTimeout(() => setHighlightId(null), 2800)
        }
    }, [searchParams])

    if (loading) {
        return (
            <div className="catalog-loading">
                <div className="loading-spinner" />
            </div>
        )
    }

    const category = getCategory(categoryKey)

    if (!category) {
        return (
            <div className="empty-state">
                <span className="empty-state-emoji">🤔</span>
                <p className="empty-state-title">Категория не найдена</p>
                <button className="btn btn-primary" onClick={() => navigate('/')}>
                    Вернуться в каталог
                </button>
            </div>
        )
    }

    const emoji = category.name.match(/^\p{Emoji}/u)?.[0] || '📦'
    const cleanName = category.name.replace(/^\p{Emoji}\s*/u, '')

    return (
        <div className="category-page">
            <motion.button
                className="back-button"
                onClick={() => navigate('/')}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                whileTap={{ scale: 0.95 }}
            >
                <span className="back-arrow">←</span> Назад
            </motion.button>

            <motion.div
                className="category-header"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.05 }}
            >
                <span className="category-page-emoji">{emoji}</span>
                <h2 className="category-page-title">{cleanName}</h2>
                {category.description && (
                    <p className="category-page-desc">{category.description}</p>
                )}
                <p className="category-page-count">{category.items.length} позиций</p>
            </motion.div>

            {popularItems.length > 0 && (
                <motion.div
                    className="featured-wrap featured-wrap--popular"
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                >
                    <div className="featured-inner">
                        <h3 className="featured-title">💙 Выбор покупателей</h3>
                        {popularItems.map((item, i) => (
                            <ProductCard key={`pop-${item.id}`} item={item} categoryKey={categoryKey} index={i} />
                        ))}
                    </div>
                </motion.div>
            )}

            <div className="products-list">
                {category.items.map((item, i) => (
                    <ProductCard
                        key={item.id}
                        item={item}
                        categoryKey={categoryKey}
                        index={i}
                        highlight={item.id === highlightId}
                    />
                ))}
            </div>
        </div>
    )
}
