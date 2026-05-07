'use client'

import { ButtonHTMLAttributes } from 'react'
import { audio } from '@/lib/audio'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost'
  size?: 'sm' | 'md' | 'lg'
  playSound?: boolean
}

const variants = {
  primary: 'bg-[#ffd700] text-black hover:bg-[#ffec6e] font-bold',
  secondary: 'bg-[#1a1a1a] text-[#f0f0f0] border border-[#444] hover:bg-[#2a2a2a]',
  danger: 'bg-[#ef4444] text-white hover:bg-[#dc2626] font-bold',
  ghost: 'text-[#ffd700] hover:underline',
}

const sizes = {
  sm: 'px-3 py-1.5 text-sm',
  md: 'px-5 py-2.5 text-base',
  lg: 'px-7 py-3.5 text-lg',
}

export default function Button({
  variant = 'primary',
  size = 'md',
  playSound = true,
  onClick,
  className = '',
  children,
  ...props
}: ButtonProps) {
  function handleClick(e: React.MouseEvent<HTMLButtonElement>) {
    if (playSound) audio.click()
    onClick?.(e)
  }

  return (
    <button
      onClick={handleClick}
      className={`rounded-md transition-colors focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-[#ffd700] focus-visible:ring-offset-2 focus-visible:ring-offset-black cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${variants[variant]} ${sizes[size]} ${className}`}
      {...props}
    >
      {children}
    </button>
  )
}
