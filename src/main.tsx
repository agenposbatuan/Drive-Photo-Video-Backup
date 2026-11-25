import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { PwaService } from './services/PwaService';

// Inisialisasi Service Worker & PWA lifecycle management
PwaService.registerServiceWorker();

createRoot(document.getElementById('root')!).render(<App />);
