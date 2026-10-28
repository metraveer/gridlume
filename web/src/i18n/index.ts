import i18next from 'i18next'
import ICU from 'i18next-icu'
import { initReactI18next } from 'react-i18next'
import en from './en.json'
import ru from './ru.json'

export const LANGUAGES = ['ru', 'en'] as const
export type Language = (typeof LANGUAGES)[number]

const STORAGE_KEY = 'gl-lang'

/** Saved choice first, then the browser language; Russian for Russian browsers, English otherwise. */
export function detectLanguage(): Language {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved === 'ru' || saved === 'en') return saved
  } catch {
    // storage can be blocked; fall back to the browser language
  }
  return (navigator.language || 'ru').toLowerCase().startsWith('ru') ? 'ru' : 'en'
}

export function setLanguage(lang: Language) {
  try {
    localStorage.setItem(STORAGE_KEY, lang)
  } catch {
    // remembering is a convenience; switching still works
  }
  document.documentElement.lang = lang
  return i18next.changeLanguage(lang)
}

// Keys are flat ("rail.map"), so dots are not nesting separators.
// ICU message format gives correct Russian plurals: 1 узел, 2 узла, 5 узлов.
void i18next
  .use(ICU)
  .use(initReactI18next)
  .init({
    resources: { ru: { translation: ru }, en: { translation: en } },
    lng: detectLanguage(),
    fallbackLng: 'ru',
    keySeparator: false,
    interpolation: { escapeValue: false },
    returnNull: false,
  })

document.documentElement.lang = i18next.language

export default i18next
