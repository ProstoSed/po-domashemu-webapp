import './QuantityPicker.css'

export default function QuantityPicker({ value, onChange, min = 1, max = 99 }) {
    return (
        <div className="qty-picker">
            <button
                className="qty-btn"
                onClick={() => onChange(value - 1)}
                disabled={value <= 0}
            >
                −
            </button>
            <span className="qty-value">{value}</span>
            <button
                className="qty-btn"
                onClick={() => onChange(Math.min(max, value + 1))}
                disabled={value >= max}
            >
                +
            </button>
        </div>
    )
}
