import { lazy, Suspense, useState } from 'react'
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import { CartProvider } from './hooks/useCart.jsx'
import Header from './components/Header'
import CartButton from './components/CartButton'
import AssistantButton from './components/AssistantButton'
import AssistantModal from './components/AssistantModal'
import CatalogPage from './pages/CatalogPage'
import CategoryPage from './pages/CategoryPage'
import CartPage from './pages/CartPage'
import CheckoutPage from './pages/CheckoutPage'
import SuccessPage from './pages/SuccessPage'
const AdminPage = lazy(() => import('./pages/AdminPage'))
import SearchPage from './pages/SearchPage'
import MyOrdersPage from './pages/MyOrdersPage'
import MyPhotosPage from './pages/MyPhotosPage'
import DeliveryPage from './pages/DeliveryPage'
import AboutPage from './pages/AboutPage'
import InvitePage from './pages/InvitePage'
import ReviewsPage from './pages/ReviewsPage'
import LentenCatalogPage from './pages/LentenCatalogPage'
import LentenCategoryPage from './pages/LentenCategoryPage'
import BanquetCatalogPage from './pages/BanquetCatalogPage'
import BanquetCategoryPage from './pages/BanquetCategoryPage'
import KidsCatalogPage from './pages/KidsCatalogPage'
import KidsCategoryPage from './pages/KidsCategoryPage'

export default function App() {
    const [assistantOpen, setAssistantOpen] = useState(false)

    return (
        <CartProvider>
            <HashRouter>
                <div className="app">
                    <Header />
                    <main className="app-main">
                        <Routes>
                            <Route path="/" element={<CatalogPage />} />
                            <Route path="/category/:categoryKey" element={<CategoryPage />} />
                            <Route path="/lenten" element={<LentenCatalogPage />} />
                            <Route path="/lenten/category/:categoryKey" element={<LentenCategoryPage />} />
                            <Route path="/banquet" element={<BanquetCatalogPage />} />
                            <Route path="/banquet/category/:categoryKey" element={<BanquetCategoryPage />} />
                            <Route path="/kids" element={<KidsCatalogPage />} />
                            <Route path="/kids/category/:categoryKey" element={<KidsCategoryPage />} />
                            <Route path="/cart" element={<CartPage />} />
                            <Route path="/checkout" element={<CheckoutPage />} />
                            <Route path="/success" element={<SuccessPage />} />
                            <Route path="/admin" element={<Suspense fallback={<div className="catalog-loading"><div className="loading-spinner" /><p>Загрузка...</p></div>}><AdminPage /></Suspense>} />
                            <Route path="/search" element={<SearchPage />} />
                            <Route path="/my-orders" element={<MyOrdersPage />} />
                            <Route path="/my-photos" element={<MyPhotosPage />} />
                            <Route path="/delivery" element={<DeliveryPage />} />
                            <Route path="/about" element={<AboutPage />} />
                            <Route path="/invite" element={<InvitePage />} />
                            <Route path="/reviews" element={<ReviewsPage />} />
                            <Route path="*" element={<Navigate to="/" replace />} />
                        </Routes>
                    </main>
                    <AssistantButton onClick={() => setAssistantOpen(true)} />
                    <CartButton />
                    <AssistantModal
                        isOpen={assistantOpen}
                        onClose={() => setAssistantOpen(false)}
                    />
                </div>
            </HashRouter>
        </CartProvider>
    )
}
