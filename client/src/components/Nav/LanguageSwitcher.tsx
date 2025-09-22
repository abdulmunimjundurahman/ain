import React, { useCallback } from 'react';
import { useRecoilState } from 'recoil';
import { Globe } from 'lucide-react';
import { useLocalize } from '~/hooks';
import { setAcceptLanguageHeader } from 'librechat-data-provider';
import store from '~/store';
import Cookies from 'js-cookie';

interface LanguageSwitcherProps {
  onLanguageChange?: () => void;
}

const LanguageSwitcher: React.FC<LanguageSwitcherProps> = ({ onLanguageChange }) => {
  const localize = useLocalize();
  const [langcode, setLangcode] = useRecoilState(store.lang);
  const [chatDirection, setChatDirection] = useRecoilState(store.chatDirection);

  const changeLang = useCallback(
    (value: string) => {
      let userLang = value;
      if (value === 'auto') {
        userLang = navigator.language || navigator.languages[0];
      }

      // Auto-set RTL direction for Arabic and other RTL languages
      const rtlLanguages = ['ar', 'ar-EG', 'ar-SA', 'ar-AE', 'ar-QA', 'ar-KW', 'ar-BH', 'ar-OM', 'ar-YE', 'ar-IQ', 'ar-SY', 'ar-JO', 'ar-LB', 'ar-PS', 'ar-MA', 'ar-DZ', 'ar-TN', 'ar-LY', 'ar-SD', 'ar-EG', 'he', 'he-IL', 'fa', 'fa-IR', 'ug', 'ug-CN'];
      const isRTL = rtlLanguages.some(lang => userLang.startsWith(lang));
      
      // Set chat direction based on language
      setChatDirection(isRTL ? 'RTL' : 'LTR');

      requestAnimationFrame(() => {
        document.documentElement.lang = userLang;
        document.documentElement.dir = isRTL ? 'rtl' : 'ltr';
      });
      setLangcode(userLang);
      Cookies.set('lang', userLang, { expires: 365 });
      
      // Set language header for API requests
      setAcceptLanguageHeader(userLang);
      
      // Call the callback if provided
      if (onLanguageChange) {
        onLanguageChange();
      }
    },
    [setLangcode, setChatDirection, onLanguageChange],
  );

  const getCurrentLanguageLabel = () => {
    const languageMap: { [key: string]: string } = {
      'auto': localize('com_nav_lang_auto'),
      'en-US': localize('com_nav_lang_english'),
      'ar-EG': localize('com_nav_lang_arabic'),
      'zh-Hans': localize('com_nav_lang_chinese'),
      'zh-Hant': localize('com_nav_lang_traditional_chinese'),
      'es-ES': localize('com_nav_lang_spanish'),
      'fr-FR': localize('com_nav_lang_french'),
      'de-DE': localize('com_nav_lang_german'),
      'it-IT': localize('com_nav_lang_italian'),
      'pt-BR': localize('com_nav_lang_brazilian_portuguese'),
      'pt-PT': localize('com_nav_lang_portuguese'),
      'ru-RU': localize('com_nav_lang_russian'),
      'ja-JP': localize('com_nav_lang_japanese'),
      'ko-KR': localize('com_nav_lang_korean'),
      'he-HE': localize('com_nav_lang_hebrew'),
      'fa-IR': localize('com_nav_lang_persian'),
    };
    
    return languageMap[langcode] || langcode;
  };

  const toggleLanguage = () => {
    // Toggle between English and Arabic for now
    if (langcode === 'ar-EG') {
      changeLang('en-US');
    } else {
      changeLang('ar-EG');
    }
  };

  return (
    <button
      onClick={toggleLanguage}
      className="flex items-center gap-2 px-3 py-2 text-sm text-text-primary hover:bg-surface-hover rounded-lg transition-colors border border-border-medium"
      title={`${localize('com_nav_language')}: ${getCurrentLanguageLabel()}`}
    >
      <Globe className="icon-sm" />
      <span className="hidden sm:inline">{getCurrentLanguageLabel()}</span>
      <span className="sm:hidden">{langcode === 'ar-EG' ? 'ع' : 'EN'}</span>
    </button>
  );
};

export default LanguageSwitcher;
