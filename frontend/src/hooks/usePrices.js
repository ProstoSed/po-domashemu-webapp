/**
 * usePrices — загрузка каталога товаров.
 * Сначала пробует API (свежие данные с photo_filename), fallback на статический JSON.
 * Включает retry + таймаут для надёжности в Telegram WebApp.
 */
import { useState, useEffect } from 'react'

const API_URL = import.meta.env.VITE_API_URL || ''
const STATIC_URL = `${import.meta.env.BASE_URL}prices.json`

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

async function fetchWithRetry(url, retries = 2, delay = 800, timeoutMs = 5000) {
    for (let i = 0; i <= retries; i++) {
        try {
            return await fetchWithTimeout(url, timeoutMs)
        } catch (err) {
            if (i < retries) {
                await new Promise(r => setTimeout(r, delay))
            } else {
                throw err
            }
        }
    }
}

export function usePrices() {
    const [categories, setCategories] = useState([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState(null)

    useEffect(() => {
        const load = async () => {
            try {
                // Сначала пробуем API (имеет photo_filename после sync)
                const data = await fetchWithRetry(`${API_URL}/api/prices`, 2, 800, 5000)
                setCategories(data.categories || [])
            } catch (apiErr) {
                console.warn('API prices failed, trying static:', apiErr.message)
                try {
                    // Fallback на статический prices.json (всегда доступен на GitHub Pages)
                    const data = await fetchWithTimeout(STATIC_URL, 5000)
                    setCategories(data.categories || [])
                } catch (staticErr) {
                    console.error('Ошибка загрузки цен:', staticErr)
                    setError('Не удалось загрузить меню')
                }
            }
            setLoading(false)
        }
        load()
    }, [])

    /** Получить категорию по ключу */
    const getCategory = (key) => categories.find(c => c.key === key) || null

    /** Получить товар по категории и ID */
    const getItem = (categoryKey, itemId) => {
        const cat = getCategory(categoryKey)
        return cat?.items?.find(i => i.id === itemId) || null
    }

    return { categories, loading, error, getCategory, getItem }
}
