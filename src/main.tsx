import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(  //You are saying that the element will never be null, but you are not checking it, it is just in develop to avoid the typescript complaining 
  <StrictMode>
    <App />
  </StrictMode>
)
