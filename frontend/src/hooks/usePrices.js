/**
 * usePrices — загрузка каталога товаров.
 * Пока читает из статического JSON (в будущем — из API).
 */
import { useState, useEffect } from 'react'

// Данные подгружаются из public/prices.json
// import.meta.env.BASE_URL правильно разрешается и локально (/), и на GitHub Pages (/repo-name/)
const PRICES_URL = `${import.meta.env.BASE_URL}prices.json`

export function usePrices() {
    const [categories, setCategories] = useState([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState(null)

    useEffect(() => {
        fetch(PRICES_URL)
            .then(res => {
                if (!res.ok) throw new Error(`HTTP ${res.status}`)
                return res.json()
            })
            .then(data => {
                setCategories(data.categories || [])
                setLoading(false)
            })
            .catch(err => {
                console.error('Ошибка загрузки цен:', err)
                setError(err.message)
                setLoading(false)
            })
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
