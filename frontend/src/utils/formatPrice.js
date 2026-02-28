/**
 * formatPrice — форматирование цен для отображения.
 */

/** 1200 → «1 200₽» */
export function formatPrice(price) {
    if (!price && price !== 0) return '—'
    return Math.round(price).toLocaleString('ru-RU') + '₽'
}

/** Формат цены для карточки товара (с учётом диапазонов) */
export function formatItemPrice(item) {
    if (item.price_note) return item.price_note

    // Фиксированная цена за кг
    if (item.price_kg) return `${formatPrice(item.price_kg)}/кг`

    // Фиксированная цена за шт
    if (item.price_item) return formatPrice(item.price_item)

    // Диапазон за кг
    if (item.price_kg_min && item.price_kg_max) {
        return `${formatPrice(item.price_kg_min)}—${formatPrice(item.price_kg_max)}/кг`
    }

    // Диапазон за шт
    if (item.price_item_min && item.price_item_max) {
        if (item.price_item_min === item.price_item_max) {
            return `от ${formatPrice(item.price_item_min)}`
        }
        return `${formatPrice(item.price_item_min)}—${formatPrice(item.price_item_max)}`
    }

    // Наценка
    if (item.price_add) return `+${formatPrice(item.price_add)}`

    return '—'
}

/** Единица товара для корзины */
export function getUnitLabel(item) {
    if (item.unit === 'кг') return 'кг'
    if (item.unit === 'шт') return 'шт'
    if (item.unit === 'заказ') return ''
    if (item.unit === 'доп.') return ''
    return item.unit || 'шт'
}
