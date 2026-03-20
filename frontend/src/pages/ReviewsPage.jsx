/**
 * ReviewsPage — страница отзывов.
 * Все пользователи видят отзывы, авторизованные могут оставить свой.
 */
import { useEffect, useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useTelegram } from '../hooks/useTelegram'
import { fetchReviews, createReview } from '../utils/api'
import './ReviewsPage.css'

const API_URL = import.meta.env.VITE_API_URL || ''

const STARS = [1, 2, 3, 4, 5]

/**
 * Сжатие фото через Canvas.
 * Уменьшает до maxSide px и конвертирует в JPEG с quality.
 * Возвращает File.
 */
function compressImage(file, maxSide = 1600, quality = 0.8) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = (e) => {
            const img = new Image()
            img.onload = () => {
                let { width, height } = img
                if (width > maxSide || height > maxSide) {
                    const ratio = Math.min(maxSide / width, maxSide / height)
                    width = Math.round(width * ratio)
                    height = Math.round(height * ratio)
                }
                const canvas = document.createElement('canvas')
                canvas.width = width
                canvas.height = height
                const ctx = canvas.getContext('2d')
                ctx.drawImage(img, 0, 0, width, height)
                canvas.toBlob(
                    (blob) => {
                        if (!blob) return reject(new Error('Не удалось сжать фото'))
                        resolve(new File([blob], file.name.replace(/\.\w+$/, '.jpg'), { type: 'image/jpeg' }))
                    },
                    'image/jpeg',
                    quality,
                )
            }
            img.onerror = () => reject(new Error('Не удалось прочитать фото'))
            img.src = e.target.result
        }
        reader.onerror = () => reject(new Error('Не удалось прочитать файл'))
        reader.readAsDataURL(file)
    })
}

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

/**
 * Lightbox с pinch-zoom, pan и блокировкой фона.
 *
 * Трансформ: translate(x, y) scale(S)
 * - scale применяется первым (от центра элемента)
 * - translate двигает уже масштабированный элемент
 * - x, y — смещение в экранных пикселях
 */
function Lightbox({ src, onClose }) {
    const imgRef = useRef(null)
    const s = useRef({ scale: 1, x: 0, y: 0 })
    const gesture = useRef({})
    const [tf, setTf] = useState({ scale: 1, x: 0, y: 0 })

    useEffect(() => {
        const prev = document.body.style.overflow
        document.body.style.overflow = 'hidden'
        return () => { document.body.style.overflow = prev }
    }, [])

    const clamp = (scale, x, y) => {
        const img = imgRef.current
        if (!img || scale <= 1) return { scale: 1, x: 0, y: 0 }
        const bw = img.offsetWidth, bh = img.offsetHeight
        const maxX = Math.max(0, (bw * scale - window.innerWidth) / 2)
        const maxY = Math.max(0, (bh * scale - window.innerHeight) / 2)
        return {
            scale,
            x: Math.max(-maxX, Math.min(maxX, x)),
            y: Math.max(-maxY, Math.min(maxY, y)),
        }
    }

    const set = (scale, x, y) => {
        const c = clamp(scale, x, y)
        s.current = c
        setTf(c)
    }

    const pinchDist = (t) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY)

    const onTouchStart = (e) => {
        const g = gesture.current
        if (e.touches.length === 2) {
            e.preventDefault()
            g.type = 'pinch'
            g.dist0 = pinchDist(e.touches)
            g.scale0 = s.current.scale
            g.x0 = s.current.x
            g.y0 = s.current.y
            // Центр пинча в экранных координатах
            const midX = (e.touches[0].clientX + e.touches[1].clientX) / 2
            const midY = (e.touches[0].clientY + e.touches[1].clientY) / 2
            // Фиксируем центр картинки НА МОМЕНТ СТАРТА (не пересчитывать в move!)
            const img = imgRef.current
            if (img) {
                const rect = img.getBoundingClientRect()
                const imgCX = rect.left + rect.width / 2
                const imgCY = rect.top + rect.height / 2
                // Координата пинча в image-space (без масштаба)
                g.fxImg = (midX - imgCX) / g.scale0
                g.fyImg = (midY - imgCY) / g.scale0
            } else {
                g.fxImg = 0
                g.fyImg = 0
            }
        } else if (e.touches.length === 1) {
            // Двойной тап
            const now = Date.now()
            if (now - (g.lastTap || 0) < 300) {
                e.preventDefault()
                g.lastTap = 0
                if (s.current.scale > 1.1) {
                    set(1, 0, 0)
                } else {
                    // Zoom 2.5x к точке тапа
                    const img = imgRef.current
                    if (img) {
                        const rect = img.getBoundingClientRect()
                        const imgCX = rect.left + rect.width / 2
                        const imgCY = rect.top + rect.height / 2
                        const tapX = e.touches[0].clientX
                        const tapY = e.touches[0].clientY
                        // Точка тапа относительно центра картинки (в экранных px при scale=1)
                        const dx = tapX - imgCX
                        const dy = tapY - imgCY
                        // Новый pan: сдвигаем так чтобы точка тапа осталась на месте
                        set(2.5, dx * (1 - 2.5), dy * (1 - 2.5))
                    } else {
                        set(2.5, 0, 0)
                    }
                }
                return
            }
            g.lastTap = now
            g.type = 'pan'
            g.panX0 = e.touches[0].clientX - s.current.x
            g.panY0 = e.touches[0].clientY - s.current.y
        }
    }

    const onTouchMove = (e) => {
        const g = gesture.current
        if (e.touches.length === 2 && g.type === 'pinch') {
            e.preventDefault()
            const d = pinchDist(e.touches)
            const newScale = Math.min(5, Math.max(1, g.scale0 * (d / g.dist0)))
            // fxImg/fyImg вычислены в onTouchStart (фиксированная точка в image-space)
            // Формула: pinch-точка остаётся на месте экрана
            const newX = g.x0 + g.fxImg * (g.scale0 - newScale)
            const newY = g.y0 + g.fyImg * (g.scale0 - newScale)
            set(newScale, newX, newY)
        } else if (e.touches.length === 1 && s.current.scale > 1.05) {
            e.preventDefault()
            set(s.current.scale, e.touches[0].clientX - g.panX0, e.touches[0].clientY - g.panY0)
        }
    }

    const onTouchEnd = (e) => {
        if (e.touches.length === 0) {
            gesture.current.type = null
            if (s.current.scale < 1.05) set(1, 0, 0)
        }
    }

    const handleOverlayClick = (e) => {
        if (e.target === e.currentTarget && s.current.scale < 1.05) onClose()
    }

    return (
        <motion.div
            className="lightbox-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={handleOverlayClick}
            onTouchStart={onTouchStart}
            onTouchMove={onTouchMove}
            onTouchEnd={onTouchEnd}
        >
            <button className="lightbox-close" onClick={onClose}>✕</button>
            <div className="lightbox-img-wrap" onClick={(e) => e.stopPropagation()}>
                <img
                    ref={imgRef}
                    className="lightbox-img"
                    src={src}
                    alt="Фото"
                    draggable={false}
                    style={{ transform: `translate(${tf.x}px, ${tf.y}px) scale(${tf.scale})` }}
                />
            </div>
        </motion.div>
    )
}

function ReviewCard({ review, onPhotoClick }) {
    const date = review.created_at?.slice(0, 10) || '—'
    const name = review.first_name || 'Аноним'
    const username = review.username
    const photoUrl = review.photo ? `${API_URL}/api/photos/${review.photo}` : null

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
            {photoUrl && (
                <img
                    className="review-card-photo"
                    src={photoUrl}
                    alt="Фото к отзыву"
                    loading="lazy"
                    onClick={() => onPhotoClick?.(photoUrl)}
                />
            )}
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
    const [photo, setPhoto] = useState(null)
    const [photoPreview, setPhotoPreview] = useState(null)
    const fileRef = useRef(null)
    const [submitting, setSubmitting] = useState(false)
    const [submitted, setSubmitted] = useState(false)
    const [lightboxSrc, setLightboxSrc] = useState(null)

    const loadReviews = () => {
        setLoading(true)
        fetchReviews()
            .then(d => setReviews(d.reviews || []))
            .catch(e => setError(e.message))
            .finally(() => setLoading(false))
    }

    useEffect(() => { loadReviews() }, [])

    const handlePhotoChange = async (e) => {
        const file = e.target.files?.[0]
        if (!file) return
        if (file.size > 20 * 1024 * 1024) {
            alert('Фото слишком большое (макс. 20 МБ)')
            return
        }
        // Сжимаем сразу — и для превью, и для отправки
        let compressed = file
        try { compressed = await compressImage(file) } catch { /* используем оригинал */ }
        setPhoto(compressed)
        // Превью из сжатого файла (маленький base64)
        const reader = new FileReader()
        reader.onload = (ev) => setPhotoPreview(ev.target.result)
        reader.onerror = () => setPhotoPreview(null)
        reader.readAsDataURL(compressed)
    }

    const clearPhoto = () => {
        setPhoto(null)
        setPhotoPreview(null)
        if (fileRef.current) fileRef.current.value = ''
    }

    const handleSubmit = async () => {
        if (!text.trim()) return
        setSubmitting(true)
        try {
            // Фото уже сжато при выборе (handlePhotoChange)
            // Пытаемся отправить с фото, при ошибке — fallback без фото
            if (photo) {
                try {
                    await createReview(text.trim(), rating, photo)
                } catch (photoErr) {
                    // Фото не отправилось — предлагаем без фото
                    const sendWithout = confirm('Не удалось отправить фото. Отправить отзыв без фото?')
                    if (!sendWithout) { setSubmitting(false); return }
                    await createReview(text.trim(), rating, null)
                }
            } else {
                await createReview(text.trim(), rating, null)
            }

            setText('')
            setRating(5)
            clearPhoto()
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

                        {/* Фото */}
                        <div className="review-form-photo">
                            <input
                                ref={fileRef}
                                type="file"
                                accept="image/*"
                                onChange={handlePhotoChange}
                                hidden
                            />
                            {photoPreview ? (
                                <div className="review-photo-preview">
                                    <img
                                        src={photoPreview}
                                        alt="Превью"
                                        onError={() => setPhotoPreview(null)}
                                    />
                                    <button className="review-photo-remove" onClick={clearPhoto}>✕</button>
                                </div>
                            ) : (
                                <button
                                    className="btn btn-outline review-photo-btn"
                                    onClick={() => fileRef.current?.click()}
                                    type="button"
                                >
                                    📷 Прикрепить фото
                                </button>
                            )}
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
                        <ReviewCard key={r.id} review={r} onPhotoClick={setLightboxSrc} />
                    ))}
                </div>
            )}

            {/* Lightbox — полноэкранный просмотр фото с pinch-zoom */}
            <AnimatePresence>
                {lightboxSrc && (
                    <Lightbox src={lightboxSrc} onClose={() => setLightboxSrc(null)} />
                )}
            </AnimatePresence>
        </div>
    )
}
