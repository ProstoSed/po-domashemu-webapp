/**
 * useIsAdmin — проверяет, является ли текущий пользователь админом.
 * Ждёт ответа от /api/check-admin, пока не ответит — checked=false.
 * Если API недоступен — fallback на статический список.
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

function getUserId() {
    if (IS_DEV) return DEV_USER_ID
    return window.Telegram?.WebApp?.initDataUnsafe?.user?.id || 0
}

export function useIsAdmin() {
    const [isAdmin, setIsAdmin] = useState(false)
    const [checked, setChecked] = useState(false)

    useEffect(() => {
        let cancelled = false
        checkAdmin()
            .then(data => {
                if (!cancelled) {
                    setIsAdmin(data.admin === true)
                    setChecked(true)
                }
            })
            .catch(() => {
                // API недоступен — fallback на статический список
                if (!cancelled) {
                    setIsAdmin(staticCheck())
                    setChecked(true)
                }
            })
        return () => { cancelled = true }
    }, [])

    return { isAdmin, checked, userId: getUserId() }
}
