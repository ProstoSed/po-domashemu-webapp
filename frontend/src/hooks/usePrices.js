/**
 * usePrices — загрузка каталога товаров.
 * Приоритет: localStorage кеш → API → static fallback.
 * Кеш TTL: 5 минут (мгновенная загрузка, фоновое обновление).
 */
import { useState, useEffect } from 'react'

const API_URL = import.meta.env.VITE_API_URL || ''
const STATIC_URL = `${import.meta.env.BASE_URL}prices.json`
const CACHE_KEY = 'po_domashemu_prices'
const CACHE_TTL = 5 * 60 * 1000 // 5 минут

function readCache() {
    try {
        const raw = localStorage.getItem(CACHE_KEY)
        if (!raw) return null
        const { data, ts } = JSON.parse(raw)
        if (Date.now() - ts > CACHE_TTL) return { data, expired: true }
        return { data, expired: false }
    } catch {
        return null
    }
}

function writeCache(data) {
    try {
        localStorage.setItem(CACHE_KEY, JSON.stringify({ data, ts: Date.now() }))
    } catch { /* quota exceeded — ignore */ }
}

async function fetchWithTimeout(url, timeoutMs = 4000) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
        const res = await fetch(url, { signal: controller.signal })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return await res.json()
    } finally {
        clearTimeout(timer)
    }
}

export function usePrices() {
    const [categories, setCategories] = useState([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState(null)

    useEffect(() => {
        // 1. Попытка загрузить из кеша мгновенно
        const cached = readCache()
        if (cached?.data?.categories?.length) {
            setCategories(cached.data.categories)
            setLoading(false)
            // Если кеш не истёк — не обновляем
            if (!cached.expired) return
        }

        // 2. Загружаем с API (фоново если кеш был)
        const load = async () => {
            try {
                const data = await fetchWithTimeout(`${API_URL}/api/prices`, 4000)
                setCategories(data.categories || [])
                writeCache(data)
                setLoading(false)
                return
            } catch {
                // API недоступен — fallback на static
            }

            // 3. Fallback: static prices.json
            if (!cached) {
                try {
                    const data = await fetchWithTimeout(STATIC_URL, 3000)
                    setCategories(data.categories || [])
                    writeCache(data)
                    setLoading(false)
                } catch {
                    setError('Не удалось загрузить меню')
                    setLoading(false)
                }
            }
        }

        load()
    }, [])

    const getCategory = (key) => categories.find(c => c.key === key) || null

    const getItem = (categoryKey, itemId) => {
        const cat = getCategory(categoryKey)
        return cat?.items?.find(i => i.id === itemId) || null
    }

    return { categories, loading, error, getCategory, getItem }
}
