/**
 * TimePicker — drum-style scroll picker for hours and minutes.
 * Opens as a bottom sheet with two scroll-snap columns.
 */
import { useState, useRef, useEffect, useCallback } from 'react'
import './TimePicker.css'

const HOURS = Array.from({ length: 15 }, (_, i) => i + 7)   // 7..21
const MINUTES = [0, 15, 30, 45]
const ITEM_H = 44 // px — height of one drum item

function DrumColumn({ items, value, onChange, formatFn }) {
    const ref = useRef(null)
    const isScrolling = useRef(false)
    const touchEnd = useRef(null)

    const idx = items.indexOf(value)

    // Scroll to selected on mount and when value changes externally
    useEffect(() => {
        if (!ref.current || isScrolling.current) return
        ref.current.scrollTop = idx * ITEM_H
    }, [idx])

    const handleScroll = useCallback(() => {
        if (!ref.current) return
        clearTimeout(touchEnd.current)
        isScrolling.current = true
        touchEnd.current = setTimeout(() => {
            const scrollIdx = Math.round(ref.current.scrollTop / ITEM_H)
            const clamped = Math.max(0, Math.min(scrollIdx, items.length - 1))
            ref.current.scrollTop = clamped * ITEM_H
            isScrolling.current = false
            if (items[clamped] !== value) {
                onChange(items[clamped])
            }
        }, 80)
    }, [items, value, onChange])

    return (
        <div className="drum-col">
            <div className="drum-scroll" ref={ref} onScroll={handleScroll}>
                <div className="drum-pad" />
                {items.map(v => (
                    <div
                        key={v}
                        className={`drum-item ${v === value ? 'active' : ''}`}
                    >
                        {formatFn ? formatFn(v) : v}
                    </div>
                ))}
                <div className="drum-pad" />
            </div>
        </div>
    )
}

export default function TimePicker({ value, onChange, placeholder }) {
    const [open, setOpen] = useState(false)

    // Parse "HH:MM" or default
    const parsed = value?.match(/^(\d{1,2}):(\d{2})$/)
    const [hour, setHour] = useState(parsed ? parseInt(parsed[1]) : 10)
    const [minute, setMinute] = useState(parsed ? parseInt(parsed[2]) : 0)

    // Snap to nearest valid minute
    const snapMinute = (m) => MINUTES.reduce((prev, curr) =>
        Math.abs(curr - m) < Math.abs(prev - m) ? curr : prev
    )

    useEffect(() => {
        if (parsed) {
            setHour(parseInt(parsed[1]))
            setMinute(snapMinute(parseInt(parsed[2])))
        }
    }, [value])

    const handleOpen = () => {
        setOpen(true)
    }

    const handleConfirm = () => {
        const hh = String(hour).padStart(2, '0')
        const mm = String(minute).padStart(2, '0')
        onChange(`${hh}:${mm}`)
        setOpen(false)
    }

    const handleClear = () => {
        onChange('')
        setOpen(false)
    }

    const pad2 = (n) => String(n).padStart(2, '0')

    return (
        <>
            <button
                type="button"
                className={`form-input checkout-time-input time-picker-trigger ${value ? 'has-value' : ''}`}
                onClick={handleOpen}
            >
                {value || placeholder || 'К скольки?'}
            </button>

            {open && (
                <div className="time-picker-overlay" onClick={() => setOpen(false)}>
                    <div className="time-picker-sheet" onClick={e => e.stopPropagation()}>
                        <div className="time-picker-header">
                            <button className="time-picker-clear" onClick={handleClear}>Сбросить</button>
                            <span className="time-picker-title">Время</span>
                            <button className="time-picker-done" onClick={handleConfirm}>Готово</button>
                        </div>

                        <div className="time-picker-drums">
                            <DrumColumn
                                items={HOURS}
                                value={hour}
                                onChange={setHour}
                                formatFn={pad2}
                            />
                            <span className="drum-separator">:</span>
                            <DrumColumn
                                items={MINUTES}
                                value={minute}
                                onChange={setMinute}
                                formatFn={pad2}
                            />
                        </div>

                        <div className="drum-highlight" />
                    </div>
                </div>
            )}
        </>
    )
}
