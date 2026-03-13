/**
 * useBanquetPrices — загрузка фуршетного меню.
 * Аналог useLentenPrices, но запрашивает /api/banquet-prices.
 */
import { useState, useEffect } from 'react'

const API_URL = import.meta.env.VITE_API_URL || ''

async function fetchWithTimeout(url, timeoutMs = 5000) {
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

export function useBanquetPrices() {
    const [categories, setCategories] = useState([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState(null)

    useEffect(() => {
        const load = async () => {
            try {
                const data = await fetchWithTimeout(`${API_URL}/api/banquet-prices`, 5000)
                setCategories(data.categories || [])
            } catch {
                setError('Не удалось загрузить фуршетное меню')
            } finally {
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
