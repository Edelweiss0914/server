'use client'

import { useState, useEffect, useCallback } from 'react'

export interface AuthUser {
  email: string
  name: string
  role: 'admin' | 'member'
}

const DEMO_ACCOUNTS: Record<string, { password: string; user: AuthUser }> = {
  'admin@cheeze.local': {
    password: 'admin123',
    user: { email: 'admin@cheeze.local', name: '관리자', role: 'admin' },
  },
  'user@cheeze.local': {
    password: 'user123',
    user: { email: 'user@cheeze.local', name: '직원', role: 'member' },
  },
}

const SESSION_KEY = 'cheeze-session'

export function useAuth() {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    try {
      const stored = localStorage.getItem(SESSION_KEY)
      if (stored) {
        const parsed: AuthUser = JSON.parse(stored)
        if (parsed.email && parsed.name && parsed.role) {
          setUser(parsed)
        }
      }
    } catch {
      localStorage.removeItem(SESSION_KEY)
    } finally {
      setIsLoading(false)
    }
  }, [])

  const login = useCallback((email: string, password: string) => {
    const account = DEMO_ACCOUNTS[email.toLowerCase().trim()]
    if (!account || account.password !== password) {
      throw new Error('이메일 또는 비밀번호가 올바르지 않습니다.')
    }
    localStorage.setItem(SESSION_KEY, JSON.stringify(account.user))
    setUser(account.user)
  }, [])

  const logout = useCallback(() => {
    localStorage.removeItem(SESSION_KEY)
    setUser(null)
  }, [])

  return { user, login, logout, isLoading }
}
