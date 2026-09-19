import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import en from './locales/en.json'
import vi from './locales/vi.json'
import es from './locales/es.json'
import type { Language } from '../types'

/**
 * Parent-portal localization. Admin stays English-only by design (see
 * CLAUDE.md) — this instance only ever drives `src/pages/parent/**` and
 * `ParentLayout`. A parent's active language comes from their own account
 * (`User.preferredLanguage`), set by the owner when the account is created.
 */
void i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    vi: { translation: vi },
    es: { translation: es },
  },
  lng: 'en',
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
})

export function setPortalLanguage(language: Language | undefined): void {
  void i18n.changeLanguage(language ?? 'en')
}

export default i18n
