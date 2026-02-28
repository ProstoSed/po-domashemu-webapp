/**
 * useCart — хук корзины (React Context).
 * Хранит товары, считает итоги, предоставляет add/remove/clear.
 */
import { createContext, useContext, useReducer, useMemo } from 'react'

const CartContext = createContext(null)

function cartReducer(state, action) {
    switch (action.type) {
        case 'ADD_ITEM': {
            const { item, quantity, weight } = action.payload
            const key = `${item.categoryKey}|${item.id}|${weight || ''}`
            const existing = state.items.find(i => i.key === key)

            if (existing) {
                return {
                    ...state,
                    items: state.items.map(i =>
                        i.key === key
                            ? { ...i, quantity: i.quantity + quantity }
                            : i
                    )
                }
            }

            return {
                ...state,
                items: [...state.items, {
                    key,
                    ...item,
                    quantity,
                    weight: weight || null
                }]
            }
        }

        case 'REMOVE_ITEM':
            return {
                ...state,
                items: state.items.filter(i => i.key !== action.payload)
            }

        case 'UPDATE_QUANTITY': {
            const { key, quantity } = action.payload
            if (quantity <= 0) {
                return { ...state, items: state.items.filter(i => i.key !== key) }
            }
            return {
                ...state,
                items: state.items.map(i =>
                    i.key === key ? { ...i, quantity } : i
                )
            }
        }

        case 'CLEAR':
            return { ...state, items: [] }

        default:
            return state
    }
}

export function CartProvider({ children }) {
    const [state, dispatch] = useReducer(cartReducer, { items: [] })

    const addItem = (item, quantity = 1, weight = null) => {
        dispatch({ type: 'ADD_ITEM', payload: { item, quantity, weight } })
    }

    const removeItem = (key) => {
        dispatch({ type: 'REMOVE_ITEM', payload: key })
    }

    const updateQuantity = (key, quantity) => {
        dispatch({ type: 'UPDATE_QUANTITY', payload: { key, quantity } })
    }

    const clearCart = () => {
        dispatch({ type: 'CLEAR' })
    }

    const totalItems = useMemo(
        () => state.items.reduce((sum, i) => sum + i.quantity, 0),
        [state.items]
    )

    const totalPrice = useMemo(
        () => state.items.reduce((sum, i) => {
            const price = i.weight
                ? (i.price_kg || i.price_kg_min || 0) * i.weight * i.quantity
                : (i.price_item || i.price_item_min || 0) * i.quantity
            return sum + price
        }, 0),
        [state.items]
    )

    const value = {
        items: state.items,
        addItem,
        removeItem,
        updateQuantity,
        clearCart,
        totalItems,
        totalPrice
    }

    return (
        <CartContext.Provider value={value}>
            {children}
        </CartContext.Provider>
    )
}

export function useCart() {
    const ctx = useContext(CartContext)
    if (!ctx) throw new Error('useCart must be used within CartProvider')
    return ctx
}
