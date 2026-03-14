/**
 * usePrices — загрузка каталога товаров.
 * Приоритет: API (актуальные данные + photo_filename).
 * Static fallback — только если API не ответил за 4с.
 */
import { useState, useEffect } from 'react'

const API_URL = import.meta.env.VITE_API_URL || ''
const STATIC_URL = `${import.meta.env.BASE_URL}prices.json`

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
        const load = async () => {
            // Сначала пробуем API (актуальные данные)
            try {
                const data = await fetchWithTimeout(`${API_URL}/api/prices`, 4000)
                setCategories(data.categories || [])
                setLoading(false)
                return
            } catch {
                // API недоступен — fallback на static
            }

            // Fallback: static prices.json
            try {
                const data = await fetchWithTimeout(STATIC_URL, 3000)
                setCategories(data.categories || [])
                setLoading(false)
            } catch {
                setError('Не удалось загрузить меню')
                setLoading(false)
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
