/**
 * MyPhotosPage — запросы на фото товаров.
 * Показывает свои запросы + форму для создания нового.
 */
import { useEffect, useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { usePrices } from '../hooks/usePrices'
import { fetchMyPhotoRequests, createPhotoRequest } from '../utils/api'
import './MyPhotosPage.css'

const PHOTO_STATUS = {
    open:      { text: 'Ожидает',  emoji: '⏳', cls: 'pstatus-open' },
    fulfilled: { text: 'Готово',   emoji: '✅', cls: 'pstatus-done' },
    rejected:  { text: 'Отклонён', emoji: '❌', cls: 'pstatus-rej' },
}

export default function MyPhotosPage() {
    const { categories, loading: pricesLoading } = usePrices()
    const navigate = useNavigate()

    const [requests, setRequests] = useState([])
    const [loadingReqs, setLoadingReqs] = useState(true)
    const [reqError, setReqError] = useState(null)

    // Форма запроса
    const [showForm, setShowForm] = useState(false)
    const [searchQ, setSearchQ] = useState('')
    const [selectedItem, setSelectedItem] = useState(null) // { categoryKey, id, name }
    const [submitting, setSubmitting] = useState(false)
    const [submitResult, setSubmitResult] = useState(null) // { ok, message }

    useEffect(() => {
        fetchMyPhotoRequests()
            .then(d => setRequests(d.requests || []))
            .catch(e => setReqError(e.message))
            .finally(() => setLoadingReqs(false))
    }, [])

    // Поиск по каталогу для формы
    const allItems = useMemo(() => {
        const list = []
        for (const cat of categories) {
            for (const item of cat.items || []) {
                list.push({ ...item, categoryKey: cat.key, categoryName: cat.name })
            }
        }
        return list
    }, [categories])

    const searchResults = useMemo(() => {
        const q = searchQ.trim().toLowerCase()
        if (!q || q.length < 2) return []
        return allItems.filter(i =>
            i.name.toLowerCase().includes(q) ||
            i.categoryName.toLowerCase().includes(q)
        ).slice(0, 8)
    }, [allItems, searchQ])

    const handleSubmit = async () => {
        if (!selectedItem) {
            alert('Выберите товар из списка')
            return
        }
        setSubmitting(true)
        setSubmitResult(null)
        try {
            const r = await createPhotoRequest(
                selectedItem.categoryKey,
                selectedItem.id,
                selectedItem.name
            )
            if (r.already_exists) {
                setSubmitResult({ ok: true, message: 'Запрос уже отправлен — ждём фото!' })
            } else {
                setSubmitResult({ ok: true, message: `Запрос ${r.req_id} отправлен ✅` })
                // Добавляем в список локально
                setRequests(prev => [{
                    req_id: r.req_id,
                    item_name: selectedItem.name,
                    status: 'open',
                    created_at: new Date().toISOString().slice(0, 10),
                }, ...prev])
            }
            setShowForm(false)
            setSearchQ('')
            setSelectedItem(null)
        } catch (e) {
            setSubmitResult({ ok: false, message: `Ошибка: ${e.message}` })
        } finally {
            setSubmitting(false)
        }
    }

    return (
        <div className="my-photos-page">
            <motion.button
                className="back-button"
                onClick={() => navigate('/')}
                whileTap={{ scale: 0.95 }}
            >
                <span className="back-arrow">←</span> Назад
            </motion.button>

            <div className="photos-page-header">
                <h2 className="page-title">📷 Запросы на фото</h2>
                <button
                    className="btn-new-request"
                    onClick={() => { setShowForm(f => !f); setSubmitResult(null) }}
                >
                    {showForm ? '✕ Отмена' : '+ Запросить'}
                </button>
            </div>

            {/* Форма запроса */}
            <AnimatePresence>
                {showForm && (
                    <motion.div
                        className="glass-card new-request-form"
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                    >
                        <p className="form-label">Найдите товар и нажмите «Запросить»</p>

                        {/* Поиск товара */}
                        <input
                            type="search"
                            className="form-input"
                            placeholder="Название товара..."
                            value={searchQ}
                            onChange={e => { setSearchQ(e.target.value); setSelectedItem(null) }}
                            autoFocus
                        />

                        {/* Результаты поиска */}
                        {searchResults.length > 0 && !selectedItem && (
                            <div className="item-search-results">
                                {searchResults.map(item => (
                                    <div
                                        key={`${item.categoryKey}-${item.id}`}
                                        className="item-search-row"
                                        onClick={() => {
                                            setSelectedItem(item)
                                            setSearchQ(item.name)
                                        }}
                                    >
                                        <span className="item-search-name">{item.name}</span>
                                        <span className="item-search-cat">{item.categoryName}</span>
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* Выбранный товар */}
                        {selectedItem && (
                            <div className="selected-item">
                                ✓ <b>{selectedItem.name}</b>
                                <span className="selected-item-cat">{selectedItem.categoryName}</span>
                            </div>
                        )}

                        <button
                            className="btn btn-primary btn-block"
                            style={{ marginTop: '0.75rem' }}
                            onClick={handleSubmit}
                            disabled={submitting || !selectedItem}
                        >
                            {submitting ? '⏳ Отправляем...' : '📷 Запросить фото'}
                        </button>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Результат отправки */}
            {submitResult && (
                <div className={`submit-result ${submitResult.ok ? 'submit-result--ok' : 'submit-result--err'}`}>
                    {submitResult.message}
                </div>
            )}

            {/* Список моих запросов */}
            {loadingReqs && (
                <div className="catalog-loading">
                    <div className="loading-spinner" />
                    <p>Загружаем запросы...</p>
                </div>
            )}

            {reqError && (
                <div className="empty-state">
                    <span className="empty-state-emoji">⚙️</span>
                    <p className="empty-state-title">Нет соединения с сервером</p>
                    <p className="empty-state-text">Запросы доступны при запущенном backend.</p>
                </div>
            )}

            {!loadingReqs && !reqError && requests.length === 0 && !showForm && (
                <div className="empty-state">
                    <span className="empty-state-emoji">📷</span>
                    <p className="empty-state-title">Запросов пока нет</p>
                    <p className="empty-state-text">
                        Нажмите «+ Запросить», чтобы попросить фото любого товара
                    </p>
                </div>
            )}

            {!loadingReqs && requests.length > 0 && (
                <div className="photo-requests-list">
                    {requests.map((r, i) => {
                        const ps = PHOTO_STATUS[r.status] || { text: r.status, emoji: '?', cls: '' }
                        return (
                            <motion.div
                                key={r.req_id || i}
                                className="my-photo-card glass-card"
                                initial={{ opacity: 0, y: 6 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: i * 0.04 }}
                            >
                                <div className="my-photo-card-top">
                                    <span className="my-photo-item">{r.item_name}</span>
                                    <span className={`pstatus ${ps.cls}`}>
                                        {ps.emoji} {ps.text}
                                    </span>
                                </div>
                                {r.created_at && (
                                    <div className="my-photo-date">
                                        🕐 {r.created_at.slice(0, 10)}
                                    </div>
                                )}
                            </motion.div>
                        )
                    })}
                </div>
            )}
        </div>
    )
}
