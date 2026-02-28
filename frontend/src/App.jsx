import { HashRouter, Routes, Route } from 'react-router-dom'
import { CartProvider } from './hooks/useCart.jsx'
import Header from './components/Header'
import CartButton from './components/CartButton'
import CatalogPage from './pages/CatalogPage'
import CategoryPage from './pages/CategoryPage'
import CartPage from './pages/CartPage'
import CheckoutPage from './pages/CheckoutPage'
import SuccessPage from './pages/SuccessPage'
import AdminPage from './pages/AdminPage'
import SearchPage from './pages/SearchPage'
import MyOrdersPage from './pages/MyOrdersPage'
import MyPhotosPage from './pages/MyPhotosPage'

export default function App() {
    return (
        <CartProvider>
            <HashRouter>
                <div className="app">
                    <Header />
                    <main className="app-main">
                        <Routes>
                            <Route path="/" element={<CatalogPage />} />
                            <Route path="/category/:categoryKey" element={<CategoryPage />} />
                            <Route path="/cart" element={<CartPage />} />
                            <Route path="/checkout" element={<CheckoutPage />} />
                            <Route path="/success" element={<SuccessPage />} />
                            <Route path="/admin" element={<AdminPage />} />
                            <Route path="/search" element={<SearchPage />} />
                            <Route path="/my-orders" element={<MyOrdersPage />} />
                            <Route path="/my-photos" element={<MyPhotosPage />} />
                        </Routes>
                    </main>
                    <CartButton />
                </div>
            </HashRouter>
        </CartProvider>
    )
}
