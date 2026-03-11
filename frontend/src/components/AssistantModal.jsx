/**
 * AssistantModal — модальное окно AI-помощника.
 * Drawer снизу с полем ввода, ответом и карточками товаров.
 */
import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useCart } from '../hooks/useCart'
import { useTelegram } from '../hooks/useTelegram'
import { usePrices } from '../hooks/usePrices'
import { useLentenPrices } from '../hooks/useLentenPrices'
import { askAssistant } from '../utils/api'
import { formatItemPrice } from '../utils/formatPrice'
import './AssistantModal.css'

const API_URL = import.meta.env.VITE_API_URL || ''

const THINKING_PHRASES = [
    'Изучаю наше меню...',
    'Подбираю лучшие варианты...',
    'Думаю что подойдёт...',
    'Советуюсь с Надеждой...',
    'Оцениваю сочетания...',
]

export default function AssistantModal({ isOpen, onClose }) {
    const [query, setQuery] = useState('')
    const [loading, setLoading] = useState(false)
    const [result, setResult] = useState(null)
    const [error, setError] = useState(null)
    const [thinkingPhrase, setThinkingPhrase] = useState(THINKING_PHRASES[0])
    const inputRef = useRef(null)
    const { addItem } = useCart()
    const { haptic } = useTelegram()
    const { categories: mainCategories } = usePrices()
    const { categories: lentenCategories } = useLentenPrices()
    const [addedItems, setAddedItems] = useState(new Set())

    useEffect(() => {
        if (isOpen && inputRef.current) {
            setTimeout(() => inputRef.current?.focus(), 300)
        }
    }, [isOpen])

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

    // Найти товар по category_key и item_id в загруженных данных
    const findProduct = (categoryKey, itemId, source) => {
        const cats = source === 'lenten' ? lentenCategories : mainCategories
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

        try {
            const data = await askAssistant(query.trim())
            if (data.error && !data.text) {
                setError(data.error)
            } else {
                // Обогащаем products полными данными из загруженных каталогов
                const enrichedProducts = (data.products || [])
                    .map(p => {
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

    const handleAddToCart = (product) => {
        const isKg = product.unit === 'кг'
        addItem({ ...product, categoryKey: product.category_key || product.categoryKey }, 1, isKg ? 1 : null)
        haptic?.('medium')
        setAddedItems(prev => new Set(prev).add(product.id))
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
                                        {thinkingPhrase}
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
                                </motion.div>
                            )}

                            {!loading && !result && !error && (
                                <div className="assistant-hints">
                                    <p className="assistant-hints-title">Попробуйте спросить:</p>
                                    {[
                                        'Что взять на день рождения?',
                                        'Хочу к чаю что-нибудь вкусное',
                                        'Нужен торт на 10 человек',
                                        'Что посоветуете из постного?',
                                    ].map(hint => (
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
    const photoUrl = product.photo_filename
        ? `${API_URL}/api/photos/${product.photo_filename}`
        : null

    const priceText = formatItemPrice(product)

    return (
        <motion.div
            className="mini-product-card"
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
        >
            {photoUrl && (
                <img
                    className="mini-product-photo"
                    src={photoUrl}
                    alt={product.name}
                    loading="lazy"
                    onError={e => { e.target.style.display = 'none' }}
                />
            )}
            <div className="mini-product-info">
                <span className="mini-product-name">{product.name}</span>
                <span className="mini-product-price">{priceText}</span>
            </div>
            <button
                className={`mini-product-add ${isAdded ? 'mini-product-added' : ''}`}
                onClick={onAdd}
                disabled={isAdded}
            >
                {isAdded ? '...' : '+'}
            </button>
        </motion.div>
    )
}
