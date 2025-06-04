import React from 'react'
import ReactDOM from 'react-dom/client'

// Load the refactored App.jsx component and the new global styles:
import App from './App.jsx'
import './styles/global.css'

import './App.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
