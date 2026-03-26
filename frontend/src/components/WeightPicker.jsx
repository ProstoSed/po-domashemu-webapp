import './WeightPicker.css'

const ALL_OPTIONS = [0.5, 1, 1.5, 2, 3]

export default function WeightPicker({ value, onChange, options, minWeight = 0 }) {
    const opts = options || ALL_OPTIONS.filter(w => w >= minWeight)
    const needsGrid = opts.length > 3
    return (
        <div className={`weight-picker ${needsGrid ? 'weight-picker--grid' : ''}`}>
            {opts.map(w => (
                <button
                    key={w}
                    className={`weight-chip ${value === w ? 'active' : ''}`}
                    onClick={() => onChange(w)}
                >
                    {w} кг
                </button>
            ))}
        </div>
    )
}
