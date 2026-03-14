/**
 * ReviewsPage — страница отзывов.
 * Все пользователи видят отзывы, авторизованные могут оставить свой.
 */
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useTelegram } from '../hooks/useTelegram'
import { fetchReviews, createReview } from '../utils/api'
import './ReviewsPage.css'

const STARS = [1, 2, 3, 4, 5]

function StarRating({ value, onChange, readonly = false }) {
    return (
        <div className={`star-rating ${readonly ? 'star-rating--readonly' : ''}`}>
            {STARS.map(s => (
                <span
                    key={s}
                    className={`star ${s <= value ? 'star--filled' : ''}`}
                    onClick={() => !readonly && onChange?.(s)}
                >
                    ★
                </span>
            ))}
        </div>
    )
}

function ReviewCard({ review }) {
    const date = review.created_at?.slice(0, 10) || '—'
    const name = review.first_name || 'Аноним'
    const username = review.username

    return (
        <motion.div
            className="review-card glass-card"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
        >
            <div className="review-card-header">
                <div className="review-card-author">
                    <span className="review-card-avatar">
                        {name.charAt(0).toUpperCase()}
                    </span>
                    <div className="review-card-info">
                        {username ? (
                            <a
                                className="review-card-name"
                                href={`https://t.me/${username}`}
                                target="_blank"
                                rel="noreferrer"
                            >
                                {name}
                            </a>
                        ) : (
                            <span className="review-card-name">{name}</span>
                        )}
                        <span className="review-card-date">{date}</span>
                    </div>
                </div>
                <StarRating value={review.rating || 5} readonly />
            </div>
            <p className="review-card-text">{review.text}</p>
        </motion.div>
    )
}

export default function ReviewsPage() {
    const navigate = useNavigate()
    const { user } = useTelegram()
    const [reviews, setReviews] = useState([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState(null)

    // Форма
    const [showForm, setShowForm] = useState(false)
    const [text, setText] = useState('')
    const [rating, setRating] = useState(5)
    const [submitting, setSubmitting] = useState(false)
    const [submitted, setSubmitted] = useState(false)

    const loadReviews = () => {
        setLoading(true)
        fetchReviews()
            .then(d => setReviews(d.reviews || []))
            .catch(e => setError(e.message))
            .finally(() => setLoading(false))
    }

    useEffect(() => { loadReviews() }, [])

    const handleSubmit = async () => {
        if (!text.trim()) return
        setSubmitting(true)
        try {
            await createReview(text.trim(), rating)
            setText('')
            setRating(5)
            setShowForm(false)
            setSubmitted(true)
            loadReviews()
            setTimeout(() => setSubmitted(false), 3000)
        } catch (err) {
            alert(err.message || 'Не удалось отправить отзыв')
        } finally {
            setSubmitting(false)
        }
    }

    const avgRating = reviews.length
        ? (reviews.reduce((s, r) => s + (r.rating || 5), 0) / reviews.length).toFixed(1)
        : null

    return (
        <div className="reviews-page">
            <motion.button
                className="back-button"
                onClick={() => navigate('/')}
                whileTap={{ scale: 0.95 }}
            >
                <span className="back-arrow">←</span> Назад
            </motion.button>

            <h2 className="page-title">⭐ Отзывы</h2>

            {avgRating && (
                <div className="reviews-summary glass-card">
                    <span className="reviews-summary-rating">{avgRating}</span>
                    <StarRating value={Math.round(avgRating)} readonly />
                    <span className="reviews-summary-count">{reviews.length} отзывов</span>
                </div>
            )}

            {/* Кнопка "Оставить отзыв" */}
            {!showForm && (
                <motion.button
                    className="btn btn-primary reviews-write-btn"
                    onClick={() => setShowForm(true)}
                    whileTap={{ scale: 0.97 }}
                >
                    ✍️ Оставить отзыв
                </motion.button>
            )}

            {/* Уведомление об успешной отправке */}
            <AnimatePresence>
                {submitted && (
                    <motion.div
                        className="reviews-success"
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                    >
                        ✅ Спасибо за отзыв!
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Форма отзыва */}
            <AnimatePresence>
                {showForm && (
                    <motion.div
                        className="review-form glass-card"
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                    >
                        <h3 className="review-form-title">Ваш отзыв</h3>

                        <div className="review-form-rating">
                            <span className="review-form-label">Оценка:</span>
                            <StarRating value={rating} onChange={setRating} />
                        </div>

                        <textarea
                            className="review-form-textarea"
                            value={text}
                            onChange={e => setText(e.target.value)}
                            placeholder="Расскажите о вашем опыте..."
                            rows={4}
                            maxLength={1000}
                        />

                        <div className="review-form-counter">
                            {text.length}/1000
                        </div>

                        <div className="review-form-actions">
                            <button
                                className="btn btn-primary"
                                onClick={handleSubmit}
                                disabled={submitting || !text.trim()}
                            >
                                {submitting ? 'Отправляю...' : 'Отправить'}
                            </button>
                            <button
                                className="btn btn-outline"
                                onClick={() => setShowForm(false)}
                            >
                                Отмена
                            </button>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Список отзывов */}
            {loading && (
                <div className="catalog-loading">
                    <div className="loading-spinner" />
                    <p>Загружаем отзывы<span className="bouncing-dots"><span>.</span><span>.</span><span>.</span></span></p>
                </div>
            )}

            {error && (
                <div className="empty-state">
                    <span className="empty-state-emoji">⚙️</span>
                    <p className="empty-state-title">Нет соединения с сервером</p>
                    <button className="btn btn-primary" onClick={() => navigate('/')}>
                        В каталог
                    </button>
                </div>
            )}

            {!loading && !error && reviews.length === 0 && (
                <div className="empty-state">
                    <span className="empty-state-emoji">💬</span>
                    <p className="empty-state-title">Отзывов пока нет</p>
                    <p className="empty-state-text">Будьте первым, кто оставит отзыв!</p>
                </div>
            )}

            {!loading && !error && reviews.length > 0 && (
                <div className="reviews-list">
                    {reviews.map(r => (
                        <ReviewCard key={r.id} review={r} />
                    ))}
                </div>
            )}
        </div>
    )
}
