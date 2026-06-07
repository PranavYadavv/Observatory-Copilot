import { Routes, Route } from 'react-router';
import { useScrollReveal } from './hooks/useScrollReveal';
import Navigation from './sections/Navigation';
import Hero from './sections/Hero';
import ProductOverview from './sections/ProductOverview';
import Architecture from './sections/Architecture';
import Documentation from './sections/Documentation';
import Enterprise from './sections/Enterprise';
import Footer from './sections/Footer';
import Dashboard from './pages/Dashboard';

function LandingPage() {
  useScrollReveal(0.15);

  return (
    <div style={{ background: '#030508', minHeight: '100vh' }}>
      <Navigation />
      <Hero />
      <ProductOverview />
      <Architecture />
      <Documentation />
      <Enterprise />
      <Footer />
    </div>
  );
}

function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/dashboard" element={<Dashboard />} />
    </Routes>
  );
}

export default App;
