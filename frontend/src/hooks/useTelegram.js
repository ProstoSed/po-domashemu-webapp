/**
 * useTelegram — хук для работы с Telegram WebApp SDK.
 * Получает данные пользователя, тему, и предоставляет методы SDK.
 */
import { useEffect, useMemo } from 'react'

export function useTelegram() {
    const tg = useMemo(() => window.Telegram?.WebApp, [])

    useEffect(() => {
        if (tg) {
            tg.ready()
            tg.expand()  // Раскрыть на весь экран
            tg.enableClosingConfirmation()
        }
    }, [tg])

    const user = tg?.initDataUnsafe?.user || null
    const colorScheme = tg?.colorScheme || 'dark'

    /** Отправить данные заказа обратно в бота */
    const sendData = (data) => {
        if (tg) {
            tg.sendData(JSON.stringify(data))
        }
    }

    /** Закрыть WebApp */
    const close = () => {
        if (tg) tg.close()
    }

    /** Показать кнопку MainButton (внизу Telegram) */
    const showMainButton = (text, onClick) => {
        if (tg?.MainButton) {
            tg.MainButton.setText(text)
            tg.MainButton.show()
            tg.MainButton.onClick(onClick)
        }
    }

    const hideMainButton = () => {
        if (tg?.MainButton) tg.MainButton.hide()
    }

    /** Вибро-отклик при действии */
    const haptic = (type = 'light') => {
        if (tg?.HapticFeedback) {
            tg.HapticFeedback.impactOccurred(type)
        }
    }

    return {
        tg,
        user,
        colorScheme,
        sendData,
        close,
        showMainButton,
        hideMainButton,
        haptic
    }
}
