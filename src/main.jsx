import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { StellarWalletsKit } from '@creit-tech/stellar-wallets-kit/sdk'
import { Networks } from '@creit-tech/stellar-wallets-kit/types'
import { defaultModules } from '@creit-tech/stellar-wallets-kit/modules/utils'
import App from './App.jsx'
import Help from './pages/Help.jsx'
import Ranking from './pages/Ranking.jsx'

StellarWalletsKit.init({
  modules: defaultModules(),
  network: Networks.TESTNET,
  theme: { mode: 'dark', primaryColor: '#7357FF' },
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
