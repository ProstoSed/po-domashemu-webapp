/**
 * usePrices — загрузка каталога товаров.
 * Загружает API и static параллельно — показывает первый успешный.
 * API имеет приоритет (содержит photo_filename), но static быстрее.
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
        let settled = false

        const load = async () => {
            // Запускаем оба запроса параллельно
            const apiPromise = fetchWithTimeout(`${API_URL}/api/prices`, 4000)
                .then(data => ({ source: 'api', data }))
                .catch(() => null)

            const staticPromise = fetchWithTimeout(STATIC_URL, 3000)
                .then(data => ({ source: 'static', data }))
                .catch(() => null)

            // Показываем static сразу если он придёт первым
            staticPromise.then(result => {
                if (result && !settled) {
                    settled = true
                    setCategories(result.data.categories || [])
                    setLoading(false)
                }
            })

            // API перезаписывает static (содержит photo_filename)
            apiPromise.then(result => {
                if (result) {
                    settled = true
                    setCategories(result.data.categories || [])
                    setLoading(false)
                }
            })

            // Если оба упали — ошибка
            const [apiResult, staticResult] = await Promise.all([apiPromise, staticPromise])
            if (!apiResult && !staticResult) {
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
