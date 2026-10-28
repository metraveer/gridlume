import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'
import i18n from './i18n'

// Tests always start in Russian, the primary language.
void i18n.changeLanguage('ru')
afterEach(() => cleanup())
