/**
 * SearchPage — поиск по каталогу.
 * Работает полностью на клиенте (uses prices.json).
 */
import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { usePrices } from '../hooks/usePrices'
import { useCart } from '../hooks/useCart'
import { formatPrice } from '../utils/formatPrice'
import './SearchPage.css'

export default function SearchPage() {
    const { categories, loading } = usePrices()
    const { addItem } = useCart()
    const navigate = useNavigate()
    const [query, setQuery] = useState('')
    const [added, setAdded] = useState({}) // itemId → true (brief flash)

    // Плоский список всех товаров с именем категории
    const allItems = useMemo(() => {
        const list = []
        for (const cat of categories) {
            for (const item of cat.items || []) {
                list.push({ ...item, categoryKey: cat.key, categoryName: cat.name })
            }
        }
        return list
    }, [categories])

    // Фильтрация по запросу
    const results = useMemo(() => {
        const q = query.trim().toLowerCase()
        if (!q) return []
        return allItems.filter(item =>
            item.name.toLowerCase().includes(q) ||
            item.categoryName.toLowerCase().includes(q)
        )
    }, [allItems, query])

    const handleAdd = (item) => {
        addItem(
            { ...item, categoryKey: item.categoryKey },
            1,
            item.price_kg || item.price_kg_min ? 0.5 : null
        )
        setAdded(prev => ({ ...prev, [item.id]: true }))
        setTimeout(() => setAdded(prev => ({ ...prev, [item.id]: false })), 1200)
    }

    const priceStr = (item) => {
        if (item.price_kg || item.price_kg_min) {
            const p = item.price_kg || item.price_kg_min
            return `от ${formatPrice(p)}/кг`
        }
        if (item.price_item || item.price_item_min) {
            const p = item.price_item || item.price_item_min
            return `от ${formatPrice(p)}/шт`
        }
        return '—'
    }

    return (
        <div className="search-page">
            <motion.button
                className="back-button"
                onClick={() => navigate('/')}
                whileTap={{ scale: 0.95 }}
            >
                ← Назад
            </motion.button>

            <h2 className="search-title">🔍 Поиск</h2>

            {/* Поле поиска */}
            <div className="search-input-wrap">
                <input
                    autoFocus
                    type="search"
                    className="search-input"
                    placeholder="Пироги, торты, пицца..."
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                />
                {query && (
                    <button className="search-clear" onClick={() => setQuery('')}>✕</button>
                )}
            </div>

            {/* Состояния */}
            {loading && (
                <div className="catalog-loading">
                    <div className="loading-spinner" />
                    <p>Загружаем каталог...</p>
                </div>
            )}

            {!loading && !query && (
                <div className="search-hint">
                    <p>Найдено товаров в каталоге: <b>{allItems.length}</b></p>
                    <p className="search-hint-sub">Начните вводить название или категорию</p>
                </div>
            )}

            {!loading && query && results.length === 0 && (
                <div className="empty-state">
                    <span className="empty-state-emoji">🤷</span>
                    <p className="empty-state-title">Ничего не найдено</p>
                    <p className="empty-state-text">Попробуйте другое слово</p>
                </div>
            )}

            {/* Результаты */}
            {results.length > 0 && (
                <>
                    <p className="search-count">Найдено: <b>{results.length}</b></p>
                    <div className="search-results">
                        <AnimatePresence>
                            {results.map((item, i) => (
                                <motion.div
                                    key={`${item.categoryKey}-${item.id}`}
                                    className="search-result-card glass-card"
                                    initial={{ opacity: 0, y: 8 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: i * 0.03 }}
                                >
                                    <div
                                        className="search-result-main"
                                        onClick={() => navigate(`/category/${item.categoryKey}`)}
                                    >
                                        <div className="search-result-name">{item.name}</div>
                                        <div className="search-result-cat">{item.categoryName}</div>
                                        <div className="search-result-price">{priceStr(item)}</div>
                                    </div>
                                    <button
                                        className={`search-add-btn ${added[item.id] ? 'added' : ''}`}
                                        onClick={() => handleAdd(item)}
                                    >
                                        {added[item.id] ? '✓' : '+'}
                                    </button>
                                </motion.div>
                            ))}
                        </AnimatePresence>
                    </div>
                </>
            )}
        </div>
    )
}
