import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { StellarWalletsKit } from '@creit-tech/stellar-wallets-kit/sdk'
import { Networks, SwkAppDarkTheme } from '@creit-tech/stellar-wallets-kit/types'
import { defaultModules } from '@creit-tech/stellar-wallets-kit/modules/utils'
import App from './App.jsx'
import Help from './pages/Help.jsx'
import Ranking from './pages/Ranking.jsx'
import './App.css'

StellarWalletsKit.init({
  modules: defaultModules(),
  network: Networks.TESTNET,
  theme: {
    ...SwkAppDarkTheme,
    background: '#1c2c24',
    'background-secondary': '#234B4E',
    'foreground-strong': '#F4ECDC',
    foreground: 'rgba(242,236,220,0.9)',
    'foreground-secondary': 'rgba(242,236,220,0.62)',
    primary: '#7357FF',
    'primary-foreground': '#ffffff',
    border: 'rgba(255,255,255,0.12)',
    shadow: '0 24px 72px rgba(0,0,0,0.58)',
    'border-radius': '0.875rem',
    'font-family': 'Inter, Helvetica Neue, sans-serif',
  },
  authModal: {
    showInstallLabel: true,
    hideUnsupportedWallets: false,
  },
})

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<App />} />
        <Route path="/help" element={<Help />} />
        <Route path="/ranking" element={<Ranking />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>,
)
