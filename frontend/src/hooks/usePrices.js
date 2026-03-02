/**
 * usePrices — загрузка каталога товаров.
 * Сначала пробует API (свежие данные с photo_filename), fallback на статический JSON.
 */
import { useState, useEffect } from 'react'

const API_URL = import.meta.env.VITE_API_URL || ''
const STATIC_URL = `${import.meta.env.BASE_URL}prices.json`

export function usePrices() {
    const [categories, setCategories] = useState([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState(null)

    useEffect(() => {
        const load = async () => {
            try {
                // Сначала пробуем API (имеет photo_filename после sync)
                const res = await fetch(`${API_URL}/api/prices`)
                if (!res.ok) throw new Error(`HTTP ${res.status}`)
                const data = await res.json()
                setCategories(data.categories || [])
            } catch (apiErr) {
                console.warn('API prices failed, trying static:', apiErr.message)
                try {
                    // Fallback на статический prices.json
                    const res = await fetch(STATIC_URL)
                    if (!res.ok) throw new Error(`HTTP ${res.status}`)
                    const data = await res.json()
                    setCategories(data.categories || [])
                } catch (staticErr) {
                    console.error('Ошибка загрузки цен:', staticErr)
                    setError(staticErr.message)
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
