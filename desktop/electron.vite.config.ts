import { resolve } from 'path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {},
  preload: {
    // sandbox: true 的 preload 只能 require('electron') 等少數內建模組，
    // 所以第三方套件必須打包進 preload，不能留成外部 require
    build: {
      externalizeDeps: { exclude: ['@electron-toolkit/preload'] }
    }
  },
  renderer: {
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src')
      }
    },
    plugins: [react()]
  }
})
