'use client'

import { useState, useEffect, useCallback } from 'react'

export interface AuthUser {
  email: string
  name: string
  role: 'admin' | 'member'
  provider: 'portal'
  loginAt: string
}

interface SessionToken {
  user: AuthUser
  exp: number // Unix timestamp (ms)
  iat: number
  jti: string
}

const DEMO_ACCOUNTS: Record<string, { password: string; user: Omit<AuthUser, 'provider' | 'loginAt'> }> = {
  'admin@cheeze.local': {
    password: 'admin123',
    user: { email: 'admin@cheeze.local', name: '관리자', role: 'admin' },
  },
  'user@cheeze.local': {
    password: 'user123',
    user: { email: 'user@cheeze.local', name: '직원', role: 'member' },
  },
}

const SESSION_KEY = 'cheeze-sso-token'
const SESSION_TTL = 8 * 60 * 60 * 1000 // 8 hours

function generateJti(): string {
  return `sso-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function createToken(user: AuthUser): SessionToken {
  const now = Date.now()
  return { user, exp: now + SESSION_TTL, iat: now, jti: generateJti() }
}

function isTokenValid(token: SessionToken): boolean {
  return token.exp > Date.now() && !!token.user?.email
}

export function useAuth() {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    try {
      const stored = localStorage.getItem(SESSION_KEY)
      if (stored) {
        const token: SessionToken = JSON.parse(stored)
        if (isTokenValid(token)) {
          setUser(token.user)
        } else {
          localStorage.removeItem(SESSION_KEY)
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
    const authUser: AuthUser = {
      ...account.user,
      provider: 'portal',
      loginAt: new Date().toISOString(),
    }
    const token = createToken(authUser)
    localStorage.setItem(SESSION_KEY, JSON.stringify(token))
    setUser(authUser)
  }, [])

  const logout = useCallback(() => {
    localStorage.removeItem(SESSION_KEY)
    setUser(null)
  }, [])

  return { user, login, logout, isLoading }
}
