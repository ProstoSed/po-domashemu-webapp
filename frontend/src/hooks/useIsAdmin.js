/**
 * useIsAdmin — проверяет, является ли текущий пользователь админом.
 * Сначала проверяет по статическому списку (мгновенно),
 * затем подтверждает через бэкенд /api/check-admin.
 * Если бэкенд недоступен — использует статический результат.
 */
import { useState, useEffect } from 'react'
import { checkAdmin } from '../utils/api'

const MAMA_ID = 5513112898
const _extraIds = (import.meta.env.VITE_ADMIN_IDS || '')
    .split(',').map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n))
const STATIC_ADMIN_IDS = new Set([MAMA_ID, ..._extraIds])
const IS_DEV = import.meta.env.DEV
const DEV_USER_ID = parseInt(import.meta.env.VITE_DEV_USER_ID || '0', 10)

function staticCheck() {
    if (IS_DEV && STATIC_ADMIN_IDS.has(DEV_USER_ID)) return true
    const tgUser = window.Telegram?.WebApp?.initDataUnsafe?.user
    if (tgUser && STATIC_ADMIN_IDS.has(tgUser.id)) return true
    return false
}

export function useIsAdmin() {
    const [isAdmin, setIsAdmin] = useState(staticCheck)
    const [checked, setChecked] = useState(false)

    useEffect(() => {
        let cancelled = false
        checkAdmin()
            .then(data => {
                if (!cancelled) setIsAdmin(data.admin === true)
            })
            .catch(() => {
                // API недоступен — оставляем статический результат
            })
            .finally(() => {
                if (!cancelled) setChecked(true)
            })
        return () => { cancelled = true }
    }, [])

    // Если через 3 секунды checked ещё false — принудительно ставим
    useEffect(() => {
        if (checked) return
        const timer = setTimeout(() => setChecked(true), 3000)
        return () => clearTimeout(timer)
    }, [checked])

    return { isAdmin, checked }
}
