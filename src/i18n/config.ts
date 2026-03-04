import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './locales/en.json';
import sl from './locales/sl.json';
import de from './locales/de.json';
import it from './locales/it.json';
import hu from './locales/hu.json';

const resources = {
  en: { translation: en },
  sl: { translation: sl },
  de: { translation: de },
  it: { translation: it },
  hu: { translation: hu },
};

// Map subdomain to default language
const domainLanguageMap: Record<string, string> = {
  si: 'sl',  // Slovenia → Slovenščina
  hu: 'hu',  // Hungary → Magyar
  uk: 'en',  // UK → English
  at: 'de',  // Austria → Deutsch
};

function getDefaultLanguage(): string {
  // If user already chose a language, respect that
  const stored = sessionStorage.getItem('userLanguage');
  if (stored) return stored;

  // Detect subdomain (e.g. "si" from "si.lana8wonder.com")
  const hostname = window.location.hostname;
  const subdomain = hostname.split('.')[0];
  const domainLang = domainLanguageMap[subdomain];
  if (domainLang) return domainLang;

  // Fallback to English
  return 'en';
}

const storedLanguage = getDefaultLanguage();

i18n
  .use(initReactI18next)
  .init({
    resources,
    lng: storedLanguage,
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false,
    },
  });

export default i18n;
