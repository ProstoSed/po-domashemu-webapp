/**
 * useBackButton — хук для интеграции Telegram BackButton с React Router.
 * Показывает кнопку "Назад" на всех страницах кроме главной.
 * При нажатии — навигация назад по истории, а не закрытие WebApp.
 */
import { useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

const ROOT_PATHS = ['/', '']

export function useBackButton() {
    const location = useLocation()
    const navigate = useNavigate()
    const tg = window.Telegram?.WebApp

    useEffect(() => {
        if (!tg?.BackButton) return

        const isRoot = ROOT_PATHS.includes(location.pathname)

        if (isRoot) {
            tg.BackButton.hide()
        } else {
            tg.BackButton.show()
        }

        const handler = () => {
            // Навигируем назад по React Router
            // Если нет истории — на главную
            if (window.history.length > 1) {
                navigate(-1)
            } else {
                navigate('/')
            }
        }

        tg.BackButton.onClick(handler)

        return () => {
            tg.BackButton.offClick(handler)
        }
    }, [location.pathname, navigate, tg])
}
