import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'fs'

// This configures the frontend to run on HTTPS using your certs
export default defineConfig({
  plugins: [react()],
  server: {
    https: {
      key: fs.readFileSync('./key.pem'),
      cert: fs.readFileSync('./cert.pem'),
    },
    host: true, 
  },
})