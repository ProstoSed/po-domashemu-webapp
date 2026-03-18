/**
 * CatalogPage — главная страница каталога.
 * Показывает все категории товаров из prices.json.
 */
import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { usePrices } from '../hooks/usePrices'
import { fetchFeatured, fetchPopular } from '../utils/api'
import CategoryCard from '../components/CategoryCard'
import ProductCard from '../components/ProductCard'
import './CatalogPage.css'

const LOADING_PHRASES = [
    'Достаём пироги из печи',
    'Замешиваем тесто',
    'Взбиваем крем',
    'Проверяем начинку',
    'Пробуем на вкус',
    'Раскатываем тесто',
    'Добавляем щепотку любви',
    'Накрываем стол',
    'Ставим чайник',
    'Готовим всё самое вкусное',
    'Просеиваем муку через сито',
    'Взбиваем белки в пену',
    'Растапливаем сливочное масло',
    'Ждём подъёма дрожжей',
    'Лепим фигурные края',
    'Смазываем поверхность яйцом',
    'Отправляем в разогретую печь',
    'Слушаем шипение начинки',
    'Нарезаем горячим ножом',
    'Поливаем шоколадом',
    'Украшаем свежими фруктами',
    'Сохраняем домашний уют',
    'Проверяем список продуктов',
    'Достаём золотистый противень',
    'Наслаждаемся запахом ванили',
    'Готовим фруктовую начинку',
    'Раскладываем по бумажным формам',
    'Ждём звонка таймера',
    'Варим густой конфитюр',
    'Взбиваем сливочный крем',
    'Посыпаем молотой корицей',
    'Делим на равные порции',
    'Готовим сезонный десерт',
    'Следим за нагревом духовки',
    'Укладываем слой ягод',
    'Закрываем фольгой',
    'Даём тесту отдохнуть',
    'Создаём кулинарное искусство',
    'Подбираем свежие ингредиенты',
    'Включаем кухонный комбайн',
    'Ждём равномерной румяности',
    'Остужаем на металлической решётке',
    'Подаём с горячим кофе',
    'Запекаем до полной готовности',
    'Добавляем экстракт миндаля',
    'Смешиваем сухие компоненты',
    'Готовим с душой',
    'Ждём кулинарного чуда',
    'Украшаем лесными орехами',
    'Проверяем температуру внутри',
    'Замешиваем крутое тесто',
    'Разогреваем форму для выпечки',
    'Посыпаем кунжутом сверху',
    'Вынимаем из формы аккуратно',
    'Готовим слоёное тесто',
    'Добавляем цедру лимона',
    'Ждём пока остынет крем',
    'Упаковываем в коробку',
    'Выбираем лучший рецепт',
    'Приглашаем к столу',
    'Достаём скалку',
    'Готовим песочную основу',
    'Наливаем молоко в тесто',
    'Ждём появления аромата',
    'Делаем последний штрих',
]

function getRandomPhrase(exclude) {
    const filtered = LOADING_PHRASES.filter(p => p !== exclude)
    return filtered[Math.floor(Math.random() * filtered.length)]
}

export default function CatalogPage() {
    const { categories, loading, error } = usePrices()
    const navigate = useNavigate()
    const [loadingPhrase, setLoadingPhrase] = useState(() => getRandomPhrase())
    const [showWelcome, setShowWelcome] = useState(false)

    useEffect(() => {
        if (!localStorage.getItem('po_domashemu_welcomed')) {
            setShowWelcome(true)
        }
    }, [])

    const dismissWelcome = () => {
        localStorage.setItem('po_domashemu_welcomed', '1')
        setShowWelcome(false)
    }

    useEffect(() => {
        if (!loading) return
        const id = setInterval(() => {
            setLoadingPhrase(prev => getRandomPhrase(prev))
        }, 2000)
        return () => clearInterval(id)
    }, [loading])

    // Загружаем featured/popular с API
    const [featuredData, setFeaturedData] = useState({ day: [], week: [], seasonal: [] })
    const [popularData, setPopularData] = useState({})

    useEffect(() => {
        fetchFeatured().then(d => setFeaturedData(d)).catch(() => {})
        fetchPopular().then(d => setPopularData(d.popular || {})).catch(() => {})
    }, [])

    // Резолвим featured items — находим полные данные товара в categories
    const resolveItems = (list) => {
        const result = []
        for (const entry of list) {
            // Ищем товар в основном меню (source=main)
            for (const cat of categories) {
                if (cat.key !== entry.category_key) continue
                const item = (cat.items || []).find(i => i.id === entry.item_id)
                if (item) {
                    result.push({ ...item, categoryKey: cat.key })
                    break
                }
            }
        }
        return result
    }

    const dayItems = useMemo(() => resolveItems(featuredData.day || []), [featuredData.day, categories])
    const weekItems = useMemo(() => resolveItems(featuredData.week || []), [featuredData.week, categories])
    const seasonalItems = useMemo(() => resolveItems(featuredData.seasonal || []), [featuredData.seasonal, categories])

    // Популярные товары — находим полные данные
    const popularItems = useMemo(() => {
        const result = []
        for (const [catKey, items] of Object.entries(popularData)) {
            for (const pop of items) {
                for (const cat of categories) {
                    if (cat.key !== catKey) continue
                    const item = (cat.items || []).find(i => i.name === pop.name)
                    if (item) {
                        result.push({ ...item, categoryKey: cat.key, orderCount: pop.order_count })
                        break
                    }
                }
            }
        }
        return result
    }, [popularData, categories])

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
                <p className="empty-state-title">Не удалось загрузить меню</p>
                <p className="empty-state-text">Проверьте подключение к интернету</p>
            </div>
        )
    }

    return (
        <div className="catalog-page">
            <AnimatePresence>
                {showWelcome && (
                    <motion.div
                        className="welcome-overlay"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.3 }}
                    >
                        <motion.div
                            className="welcome-card glass-card"
                            initial={{ scale: 0.85, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.85, opacity: 0 }}
                            transition={{ delay: 0.1, duration: 0.35 }}
                        >
                            <span className="welcome-emoji">🥧</span>
                            <h2 className="welcome-title">Добро пожаловать!</h2>
                            <p className="welcome-text">
                                Домашняя пекарня <b>«По-домашнему»</b> — выпечка с любовью и заботой от Надежды из д. Зимёнки.
                            </p>
                            <p className="welcome-text">
                                Здесь вы можете выбрать любимую выпечку, оформить заказ и задать вопросы нашему помощнику.
                            </p>
                            <button className="btn btn-primary btn-lg welcome-btn" onClick={dismissWelcome}>
                                Перейти к меню
                            </button>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            <h2 className="catalog-title">Наше меню</h2>
            <p className="catalog-subtitle">
                {categories.length} категорий — выбирайте с любовью 💛
            </p>

            <motion.div
                className="lenten-card glass-card"
                onClick={() => navigate('/lenten')}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.05, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                whileTap={{ scale: 0.96 }}
            >
                <span className="lenten-card-icon">🌿</span>
                <div className="lenten-card-info">
                    <h3 className="lenten-card-title">Постное меню</h3>
                    <span className="lenten-card-desc">Вкусно и без компромиссов</span>
                </div>
                <span className="category-arrow">›</span>
            </motion.div>

            <motion.div
                className="lenten-card banquet-card glass-card"
                onClick={() => navigate('/banquet')}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                whileTap={{ scale: 0.96 }}
            >
                <span className="lenten-card-icon">🥂</span>
                <div className="lenten-card-info">
                    <h3 className="lenten-card-title">Фуршетное меню</h3>
                    <span className="lenten-card-desc">Для праздников и мероприятий</span>
                </div>
                <span className="category-arrow">›</span>
            </motion.div>

            <motion.div
                className="lenten-card kids-card glass-card"
                onClick={() => navigate('/kids')}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                whileTap={{ scale: 0.96 }}
            >
                <span className="lenten-card-icon">🧸</span>
                <div className="lenten-card-info">
                    <h3 className="lenten-card-title">Детское меню</h3>
                    <span className="lenten-card-desc">Вкусно и весело для малышей</span>
                </div>
                <span className="category-arrow">›</span>
            </motion.div>

            {dayItems.length > 0 && (
                <div className="featured-section">
                    <h3 className="featured-title">⭐ Товар дня</h3>
                    {dayItems.map((item, i) => (
                        <ProductCard key={item.id} item={{ ...item, featured: true }} categoryKey={item.categoryKey} index={i} />
                    ))}
                </div>
            )}

            {weekItems.length > 0 && (
                <div className="featured-section">
                    <h3 className="featured-title">🔥 Товар недели</h3>
                    {weekItems.map((item, i) => (
                        <ProductCard key={item.id} item={item} categoryKey={item.categoryKey} index={i} />
                    ))}
                </div>
            )}

            {seasonalItems.length > 0 && (
                <div className="featured-section">
                    <h3 className="featured-title">{(() => {
                        const emojis = { весна: '🌸', лето: '☀️', осень: '🍂', зима: '❄️' }
                        return emojis[featuredData.current_season] || '🌿'
                    })()} Сезонное</h3>
                    {seasonalItems.map((item, i) => (
                        <ProductCard key={item.id} item={{ ...item, seasons: [featuredData.current_season] }} categoryKey={item.categoryKey} index={i} />
                    ))}
                </div>
            )}

            {popularItems.length > 0 && (
                <div className="featured-section">
                    <h3 className="featured-title">💜 Выбор покупателей</h3>
                    {popularItems.map((item, i) => (
                        <ProductCard key={item.id} item={item} categoryKey={item.categoryKey} index={i} />
                    ))}
                </div>
            )}

            <div className="catalog-list">
                {categories.map((cat, i) => (
                    <CategoryCard key={cat.key} category={cat} index={i} />
                ))}
            </div>
        </div>
    )
}
