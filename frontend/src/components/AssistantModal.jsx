/**
 * AssistantModal — модальное окно AI-помощника.
 * Drawer снизу с полем ввода, ответом и карточками товаров.
 */
import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useCart } from '../hooks/useCart'
import { useTelegram } from '../hooks/useTelegram'
import { usePrices } from '../hooks/usePrices'
import { useLentenPrices } from '../hooks/useLentenPrices'
import { useBanquetPrices } from '../hooks/useBanquetPrices'
import { useKidsPrices } from '../hooks/useKidsPrices'
import { askAssistant } from '../utils/api'
import { formatItemPrice } from '../utils/formatPrice'
import './AssistantModal.css'

const API_URL = import.meta.env.VITE_API_URL || ''

const HINT_POOL = [
    'Что взять на день рождения?',
    'Хочу к чаю что-нибудь вкусное',
    'Нужен торт на 10 человек',
    'Что посоветуете из постного?',
    'Что заказать на детский праздник?',
    'Посоветуйте пироги на семейный ужин',
    'Хочу сладкое к завтраку',
    'Что подарить коллеге?',
    'Нужна выпечка на 5 человек',
    'Что есть с мясной начинкой?',
    'Посоветуйте что-нибудь с ягодами',
    'Хочу попробовать что-то новое',
    'Что взять на пикник?',
    'Нужен десерт для свидания',
    'Какие пироги самые популярные?',
    'Что заказать на юбилей бабушке?',
    'Есть что-нибудь без сахара?',
    'Хочу большой пирог с капустой',
    'Что подойдёт к кофе?',
    'Посоветуйте банкетное меню',
]

function pickRandomHints(count = 4) {
    const shuffled = [...HINT_POOL].sort(() => Math.random() - 0.5)
    return shuffled.slice(0, count)
}

const THINKING_PHRASES = [
    'Изучаю наше меню',
    'Подбираю лучшие варианты',
    'Думаю что подойдёт',
    'Советуюсь с Надеждой',
    'Оцениваю сочетания',
    'Листаю рецепты',
    'Прикидываю порции',
    'Смотрю что свежее',
    'Считаю стоимость',
    'Подбираю к чаю',
    'Вспоминаю фирменное',
    'Проверяю наличие',
    'Ищу идеальный вариант',
    'Сравниваю начинки',
    'Учитываю сезон',
    'Вдохновляюсь рецептами',
    'Оцениваю размер порций',
    'Подбираю по вкусу',
    'Составляю подборку',
    'Продумываю сочетание',
]

export default function AssistantModal({ isOpen, onClose }) {
    const [query, setQuery] = useState('')
    const [loading, setLoading] = useState(false)
    const [result, setResult] = useState(null)
    const [error, setError] = useState(null)
    const [thinkingPhrase, setThinkingPhrase] = useState(THINKING_PHRASES[0])
    const inputRef = useRef(null)
    const navigate = useNavigate()
    const { addItem } = useCart()
    const { haptic } = useTelegram()
    const { categories: mainCategories } = usePrices()
    const { categories: lentenCategories } = useLentenPrices()
    const { categories: banquetCategories } = useBanquetPrices()
    const { categories: kidsCategories } = useKidsPrices()
    const [addedItems, setAddedItems] = useState(new Set())
    const [hints, setHints] = useState(() => pickRandomHints())

    // Обновляем подсказки при каждом открытии
    useEffect(() => {
        if (isOpen) setHints(pickRandomHints())
    }, [isOpen])

    // Не фокусируем поле автоматически — пусть пользователь сначала прочитает подсказки

    useEffect(() => {
        if (!loading) return
        const id = setInterval(() => {
            setThinkingPhrase(prev => {
                const filtered = THINKING_PHRASES.filter(p => p !== prev)
                return filtered[Math.floor(Math.random() * filtered.length)]
            })
        }, 2000)
        return () => clearInterval(id)
    }, [loading])

    const catalogMap = { main: mainCategories, lenten: lentenCategories, banquet: banquetCategories, kids: kidsCategories }

    // Найти товар по category_key и item_id в загруженных данных
    const findProduct = (categoryKey, itemId, source) => {
        const cats = catalogMap[source] || mainCategories
        const cat = cats.find(c => c.key === categoryKey)
        if (!cat) return null
        const item = cat.items.find(i => i.id === itemId)
        if (!item) return null
        return { ...item, categoryKey, _source: source }
    }

    const handleSubmit = async (e) => {
        e?.preventDefault()
        if (!query.trim() || loading) return

        setLoading(true)
        setResult(null)
        setError(null)
        setAddedItems(new Set())
        setShowCartPrompt(false)

        try {
            const data = await askAssistant(query.trim())
            if (data.error && !data.text) {
                setError(data.error)
            } else {
                // Обогащаем products полными данными из загруженных каталогов + дедупликация
                const seen = new Set()
                const enrichedProducts = (data.products || [])
                    .map(p => {
                        const key = `${p.category_key}:${p.item_id}`
                        if (seen.has(key)) return null
                        seen.add(key)
                        const full = findProduct(p.category_key, p.item_id, p.source)
                        return full ? { ...full, ...p } : null
                    })
                    .filter(Boolean)

                setResult({
                    text: data.text,
                    products: enrichedProducts,
                })
            }
        } catch (err) {
            setError(err.message || 'Не удалось получить ответ')
        } finally {
            setLoading(false)
        }
    }

    const [showCartPrompt, setShowCartPrompt] = useState(false)

    const handleAddToCart = (product) => {
        const isKg = product.unit === 'кг'
        addItem({ ...product, categoryKey: product.category_key || product.categoryKey }, 1, isKg ? 1 : null)
        haptic?.('medium')
        setAddedItems(prev => new Set(prev).add(product.id))
        setShowCartPrompt(true)
    }

    const handleGoToCart = () => {
        onClose()
        navigate('/cart')
    }

    const handleClose = () => {
        onClose()
    }

    const handleKeyDown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            handleSubmit()
        }
    }

    return (
        <AnimatePresence>
            {isOpen && (
                <>
                    <motion.div
                        className="assistant-overlay"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={handleClose}
                    />
                    <motion.div
                        className="assistant-modal"
                        initial={{ y: '100%' }}
                        animate={{ y: 0 }}
                        exit={{ y: '100%' }}
                        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                        drag="y"
                        dragConstraints={{ top: 0, bottom: 0 }}
                        dragElastic={{ top: 0, bottom: 0.6 }}
                        onDragEnd={(_, info) => {
                            if (info.offset.y > 100 || info.velocity.y > 300) {
                                handleClose()
                            }
                        }}
                    >
                        <div className="assistant-modal-handle" onClick={handleClose} />

                        <div className="assistant-modal-header">
                            <span className="assistant-modal-icon">
                                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M12 2a7 7 0 0 1 7 7c0 2.38-1.19 4.47-3 5.74V17a2 2 0 0 1-2 2H10a2 2 0 0 1-2-2v-2.26C6.19 13.47 5 11.38 5 9a7 7 0 0 1 7-7z"/>
                                    <line x1="10" y1="22" x2="14" y2="22"/>
                                    <line x1="9" y1="17" x2="15" y2="17"/>
                                </svg>
                            </span>
                            <div>
                                <h3 className="assistant-modal-title">Помощник</h3>
                                <p className="assistant-modal-subtitle">Подскажу что выбрать из нашего меню</p>
                            </div>
                        </div>

                        <form className="assistant-form" onSubmit={handleSubmit}>
                            <textarea
                                ref={inputRef}
                                className="assistant-input"
                                value={query}
                                onChange={e => setQuery(e.target.value)}
                                onKeyDown={handleKeyDown}
                                placeholder="Хочу на день рождения 10 человек..."
                                rows={2}
                                maxLength={500}
                                disabled={loading}
                            />
                            <button
                                type="submit"
                                className="assistant-send-btn"
                                disabled={!query.trim() || loading}
                            >
                                {loading ? '...' : 'Спросить'}
                            </button>
                        </form>

                        <div className="assistant-content">
                            {loading && (
                                <motion.div
                                    className="assistant-thinking"
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                >
                                    <div className="loading-spinner assistant-spinner" />
                                    <p className="assistant-thinking-text" key={thinkingPhrase}>
                                        {thinkingPhrase}<span className="thinking-dots"><span>.</span><span>.</span><span>.</span></span>
                                    </p>
                                </motion.div>
                            )}

                            {error && (
                                <div className="assistant-error">
                                    <p>{error}</p>
                                </div>
                            )}

                            {result && (
                                <motion.div
                                    className="assistant-result"
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                >
                                    <div className="assistant-text">
                                        {result.text.split('\n').map((line, i) => (
                                            <p key={i}>{line}</p>
                                        ))}
                                    </div>

                                    {result.products.length > 0 && (
                                        <div className="assistant-products">
                                            <p className="assistant-products-title">Рекомендуемые товары:</p>
                                            {result.products.map((product) => (
                                                <MiniProductCard
                                                    key={`${product.category_key}-${product.id}`}
                                                    product={product}
                                                    onAdd={() => handleAddToCart(product)}
                                                    isAdded={addedItems.has(product.id)}
                                                />
                                            ))}
                                        </div>
                                    )}

                                    {showCartPrompt && addedItems.size > 0 && (
                                        <motion.div
                                            className="assistant-cart-prompt"
                                            initial={{ opacity: 0, y: 8 }}
                                            animate={{ opacity: 1, y: 0 }}
                                        >
                                            <button className="assistant-cart-btn" onClick={handleGoToCart}>
                                                🛒 Перейти в корзину
                                            </button>
                                            <button className="assistant-stay-btn" onClick={() => setShowCartPrompt(false)}>
                                                Продолжить выбор
                                            </button>
                                        </motion.div>
                                    )}
                                </motion.div>
                            )}

                            {!loading && !result && !error && (
                                <div className="assistant-hints">
                                    <p className="assistant-hints-title">Попробуйте спросить:</p>
                                    {hints.map(hint => (
                                        <button
                                            key={hint}
                                            className="assistant-hint-chip"
                                            onClick={() => { setQuery(hint); }}
                                        >
                                            {hint}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    )
}

function MiniProductCard({ product, onAdd, isAdded }) {
    const [showPhoto, setShowPhoto] = useState(false)
    const [photoError, setPhotoError] = useState(false)
    const [showDesc, setShowDesc] = useState(false)

    const photoUrl = product.photo_filename
        ? `${API_URL}/api/photos/${product.photo_filename}`
        : null
    const hasDesc = !!product.description

    const priceText = formatItemPrice(product)

    return (
        <div className="mini-product-wrapper">
            <motion.div
                className="mini-product-card"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
            >
                <div className="mini-product-info">
                    <span className="mini-product-name">{product.name}</span>
                    <span className="mini-product-price">{priceText}</span>
                    <div className="mini-product-btns-row">
                        {photoUrl && (
                            <button
                                className="mini-btn-show-photo"
                                onClick={() => { setShowPhoto(p => !p); setPhotoError(false) }}
                            >
                                {showPhoto ? '🖼 Скрыть' : '🖼 Фото'}
                            </button>
                        )}
                        {hasDesc && (
                            <button
                                className="mini-btn-show-desc"
                                onClick={() => setShowDesc(d => !d)}
                            >
                                {showDesc ? 'Скрыть' : 'Подробнее'}
                            </button>
                        )}
                    </div>
                </div>
                <button
                    className={`mini-product-add ${isAdded ? 'mini-product-added' : ''}`}
                    onClick={onAdd}
                    disabled={isAdded}
                >
                    {isAdded ? '✓' : '+'}
                </button>
            </motion.div>

            <AnimatePresence>
                {showPhoto && photoUrl && (
                    <motion.div
                        className="mini-product-photo-expand"
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.3 }}
                    >
                        {!photoError ? (
                            <img
                                src={photoUrl}
                                alt={product.name}
                                className="mini-product-photo-img"
                                onError={() => setPhotoError(true)}
                                loading="lazy"
                            />
                        ) : (
                            <p className="mini-product-photo-error">Фото недоступно</p>
                        )}
                    </motion.div>
                )}
            </AnimatePresence>

            <AnimatePresence>
                {showDesc && hasDesc && (
                    <motion.div
                        className="mini-product-desc-expand"
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.3 }}
                    >
                        <p className="mini-product-desc-text">{product.description}</p>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    )
}
