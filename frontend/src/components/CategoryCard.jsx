import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import './CategoryCard.css'

export default function CategoryCard({ category, index, linkPrefix = '/category' }) {
    const navigate = useNavigate()

    // Извлекаем эмодзи из начала названия
    const emoji = category.name.match(/^\p{Emoji}/u)?.[0] || '📦'
    const cleanName = category.name.replace(/^\p{Emoji}\s*/u, '')

    return (
        <motion.div
            className="category-card glass-card"
            onClick={() => navigate(`${linkPrefix}/${category.key}`)}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.06, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
            whileTap={{ scale: 0.96 }}
        >
            <span className="category-emoji">{emoji}</span>
            <div className="category-info">
                <h3 className="category-name">{cleanName}</h3>
                <span className="category-count">
                    {category.items.length} {pluralize(category.items.length)}
                </span>
            </div>
            <span className="category-arrow">›</span>
        </motion.div>
    )
}

function pluralize(count) {
    const n = count % 100
    if (n >= 11 && n <= 14) return 'позиций'
    const last = n % 10
    if (last === 1) return 'позиция'
    if (last >= 2 && last <= 4) return 'позиции'
    return 'позиций'
}
