/**
 * useIsAdmin — проверяет, является ли текущий пользователь админом.
 * Запрашивает бэкенд /api/check-admin для динамической проверки.
 * В dev-режиме использует VITE_DEV_USER_ID и env VITE_ADMIN_IDS как fallback.
 */
import { useState, useEffect } from 'react'
import { checkAdmin } from '../utils/api'

const MAMA_ID = 5513112898
const _extraIds = (import.meta.env.VITE_ADMIN_IDS || '')
    .split(',').map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n))
const STATIC_ADMIN_IDS = new Set([MAMA_ID, ..._extraIds])
const IS_DEV = import.meta.env.DEV
const DEV_USER_ID = parseInt(import.meta.env.VITE_DEV_USER_ID || '0', 10)

export function useIsAdmin() {
    const [isAdmin, setIsAdmin] = useState(() => {
        // Мгновенная проверка по статическому списку (до ответа API)
        if (IS_DEV && STATIC_ADMIN_IDS.has(DEV_USER_ID)) return true
        const tgUser = window.Telegram?.WebApp?.initDataUnsafe?.user
        if (tgUser && STATIC_ADMIN_IDS.has(tgUser.id)) return true
        return false
    })
    const [checked, setChecked] = useState(false)

    useEffect(() => {
        checkAdmin()
            .then(data => setIsAdmin(data.admin === true))
            .catch(() => {
                // API недоступен — используем статический список
            })
            .finally(() => setChecked(true))
    }, [])

    return { isAdmin, checked }
}
