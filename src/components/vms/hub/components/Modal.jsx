import React from 'react'
import ReactDOM from 'react-dom'

export default function Modal({ isOpen, onClose, title, children }) {
  if (!isOpen) return null

  return ReactDOM.createPortal(
    <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4 animate-in fade-in duration-300">
      <div className="absolute inset-0 bg-slate-900/40 dark:bg-ink-900/80 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white dark:bg-ink-900 border border-slate-200 dark:border-white/5/60 rounded-2xl shadow-2xl max-w-md w-full animate-in zoom-in-95 duration-300 overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-white/5/60 bg-slate-50/50 dark:bg-ink-950/80">
          <h3 className="text-base font-black text-slate-900 dark:text-slate-100 uppercase tracking-tight">{title}</h3>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center text-slate-400 dark:text-slate-500 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-200/50 dark:hover:bg-slate-700/50 rounded-full transition-all"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
              <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
            </svg>
          </button>
        </div>
        <div className="p-6">
          {children}
        </div>
      </div>
    </div>,
    document.body
  )
}
