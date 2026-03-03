import './WeightPicker.css'

const DEFAULT_OPTIONS = [0.5, 1, 1.5, 2, 3]

export default function WeightPicker({ value, onChange, options = DEFAULT_OPTIONS }) {
    return (
        <div className="weight-picker">
            {options.map(w => (
                <button
                    key={w}
                    className={`weight-chip ${value === w ? 'active' : ''}`}
                    onClick={() => onChange(w)}
                >
                    {w}
                </button>
            ))}
            <span className="weight-unit">кг</span>
        </div>
    )
}
