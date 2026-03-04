/**
 * CatalogPage — главная страница каталога.
 * Показывает все категории товаров из prices.json.
 */
import { useState, useEffect } from 'react'
import { usePrices } from '../hooks/usePrices'
import CategoryCard from '../components/CategoryCard'
import './CatalogPage.css'

const LOADING_PHRASES = [
    'Достаём пироги из печи',
    'Замешиваем тесто',
    'Взбиваем крем',
    'Проверяем начинку',
    'Пробуем на вкус',
    'Раскатываем тесто',
    'Добавляем щепотку любви',
    'Накрываем стол',
    'Ставим чайник',
    'Готовим всё самое вкусное',
    'Просеиваем муку через сито',
    'Взбиваем белки в пену',
    'Растапливаем сливочное масло',
    'Ждём подъёма дрожжей',
    'Лепим фигурные края',
    'Смазываем поверхность яйцом',
    'Отправляем в разогретую печь',
    'Слушаем шипение начинки',
    'Нарезаем горячим ножом',
    'Поливаем шоколадом',
    'Украшаем свежими фруктами',
    'Сохраняем домашний уют',
    'Проверяем список продуктов',
    'Достаём золотистый противень',
    'Наслаждаемся запахом ванили',
    'Готовим фруктовую начинку',
    'Раскладываем по бумажным формам',
    'Ждём звонка таймера',
    'Варим густой конфитюр',
    'Взбиваем сливочный крем',
    'Посыпаем молотой корицей',
    'Делим на равные порции',
    'Готовим сезонный десерт',
    'Следим за нагревом духовки',
    'Укладываем слой ягод',
    'Закрываем фольгой',
    'Даём тесту отдохнуть',
    'Создаём кулинарное искусство',
    'Подбираем свежие ингредиенты',
    'Включаем кухонный комбайн',
    'Ждём равномерной румяности',
    'Остужаем на металлической решётке',
    'Подаём с горячим кофе',
    'Запекаем до полной готовности',
    'Добавляем экстракт миндаля',
    'Смешиваем сухие компоненты',
    'Готовим с душой',
    'Ждём кулинарного чуда',
    'Украшаем лесными орехами',
    'Проверяем температуру внутри',
    'Замешиваем крутое тесто',
    'Разогреваем форму для выпечки',
    'Посыпаем кунжутом сверху',
    'Вынимаем из формы аккуратно',
    'Готовим слоёное тесто',
    'Добавляем цедру лимона',
    'Ждём пока остынет крем',
    'Упаковываем в коробку',
    'Выбираем лучший рецепт',
    'Приглашаем к столу',
    'Достаём скалку',
    'Готовим песочную основу',
    'Наливаем молоко в тесто',
    'Ждём появления аромата',
    'Делаем последний штрих',
]

function getRandomPhrase(exclude) {
    const filtered = LOADING_PHRASES.filter(p => p !== exclude)
    return filtered[Math.floor(Math.random() * filtered.length)]
}

export default function CatalogPage() {
    const { categories, loading, error } = usePrices()
    const [loadingPhrase, setLoadingPhrase] = useState(() => getRandomPhrase())

    useEffect(() => {
        if (!loading) return
        const id = setInterval(() => {
            setLoadingPhrase(prev => getRandomPhrase(prev))
        }, 2000)
        return () => clearInterval(id)
    }, [loading])

    if (loading) {
        return (
            <div className="catalog-loading">
                <div className="loading-spinner" />
                <p className="loading-phrase" key={loadingPhrase}>{loadingPhrase}<span className="bouncing-dots"><span>.</span><span>.</span><span>.</span></span></p>
            </div>
        )
    }

    if (error) {
        return (
            <div className="empty-state">
                <span className="empty-state-emoji">😔</span>
                <p className="empty-state-title">Не удалось загрузить меню</p>
                <p className="empty-state-text">Проверьте подключение к интернету</p>
            </div>
        )
    }

    return (
        <div className="catalog-page">
            <h2 className="catalog-title">Наше меню</h2>
            <p className="catalog-subtitle">
                {categories.length} категорий — выбирайте с любовью 💛
            </p>
            <div className="catalog-list">
                {categories.map((cat, i) => (
                    <CategoryCard key={cat.key} category={cat} index={i} />
                ))}
            </div>
        </div>
    )
}
