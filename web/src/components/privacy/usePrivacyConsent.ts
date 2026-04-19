'use client'

import { useState, useEffect, useCallback } from 'react'

const PRIVACY_VERSION = '1.0'
const STORAGE_KEY = 'cheeze-privacy-consent'

interface ConsentRecord {
  version: string
  consented: boolean
  timestamp: string
}

function readRecord(): ConsentRecord | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    return JSON.parse(raw) as ConsentRecord
  } catch {
    return null
  }
}

export function usePrivacyConsent() {
  const [isOpen, setIsOpen] = useState(false)
  const [needsConsent, setNeedsConsent] = useState(false)

  useEffect(() => {
    const record = readRecord()
    const required =
      !record || !record.consented || record.version !== PRIVACY_VERSION
    setNeedsConsent(required)
    if (required) setIsOpen(true)
  }, [])

  const recordConsent = useCallback(() => {
    const record: ConsentRecord = {
      version: PRIVACY_VERSION,
      consented: true,
      timestamp: new Date().toISOString(),
    }
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(record))
    } catch {
      // storage unavailable — proceed silently
    }
    setNeedsConsent(false)
    setIsOpen(false)
  }, [])

  const openModal = useCallback(() => {
    setIsOpen(true)
  }, [])

  const closeModal = useCallback(() => {
    // dismiss without recording consent — modal re-appears next visit
    setIsOpen(false)
  }, [])

  return { needsConsent, recordConsent, openModal, isOpen, closeModal }
}
