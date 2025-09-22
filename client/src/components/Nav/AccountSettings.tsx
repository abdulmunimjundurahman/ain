import { useState, memo, useCallback } from 'react';
import { useRecoilState } from 'recoil';
import * as Select from '@ariakit/react/select';
import { FileText, LogOut, Globe } from 'lucide-react';
import { LinkIcon, GearIcon, DropdownMenuSeparator, Avatar } from '@librechat/client';
import { useGetStartupConfig, useGetUserBalance } from '~/data-provider';
import { setAcceptLanguageHeader } from 'librechat-data-provider';
import FilesView from '~/components/Chat/Input/Files/FilesView';
import { useAuthContext } from '~/hooks/AuthContext';
import { useLocalize } from '~/hooks';
import Settings from './Settings';
import store from '~/store';
import Cookies from 'js-cookie';

function AccountSettings() {
  const localize = useLocalize();
  const { user, isAuthenticated, logout } = useAuthContext();
  const { data: startupConfig } = useGetStartupConfig();
  const balanceQuery = useGetUserBalance({
    enabled: !!isAuthenticated && startupConfig?.balance?.enabled,
  });
  const [showSettings, setShowSettings] = useState(false);
  const [showFiles, setShowFiles] = useRecoilState(store.showFiles);
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
    },
    [setLangcode, setChatDirection],
  );

  const toggleLanguage = useCallback(() => {
    if (langcode === 'ar-EG') {
      changeLang('en-US');
    } else {
      changeLang('ar-EG');
    }
  }, [langcode, changeLang]);

  return (
    <Select.SelectProvider>
      <Select.Select
        aria-label={localize('com_nav_account_settings')}
        data-testid="nav-user"
        className="mt-text-sm flex h-auto w-full items-center gap-2 rounded-xl p-2 text-sm transition-all duration-200 ease-in-out hover:bg-surface-hover"
      >
        <div className="-ml-0.9 -mt-0.8 h-8 w-8 flex-shrink-0">
          <div className="relative flex">
            <Avatar user={user} size={32} />
          </div>
        </div>
        <div
          className="mt-2 grow overflow-hidden text-ellipsis whitespace-nowrap text-left text-text-primary"
          style={{ marginTop: '0', marginLeft: '0' }}
        >
          {user?.name ?? user?.username ?? localize('com_nav_user')}
        </div>
      </Select.Select>
      <Select.SelectPopover
        className="popover-ui w-[235px]"
        style={{
          transformOrigin: 'bottom',
          marginRight: '0px',
          translate: '0px',
        }}
      >
        <div className="text-token-text-secondary ml-3 mr-2 py-2 text-sm" role="note">
          {user?.email ?? localize('com_nav_user')}
        </div>
        <DropdownMenuSeparator />
        {startupConfig?.balance?.enabled === true && balanceQuery.data != null && (
          <>
            <div className="text-token-text-secondary ml-3 mr-2 py-2 text-sm" role="note">
              {localize('com_nav_balance')}:{' '}
              {new Intl.NumberFormat().format(Math.round(balanceQuery.data.tokenCredits))}
            </div>
            <DropdownMenuSeparator />
          </>
        )}
        <Select.SelectItem
          value=""
          onClick={() => setShowFiles(true)}
          className="select-item text-sm"
        >
          <FileText className="icon-md" aria-hidden="true" />
          {localize('com_nav_my_files')}
        </Select.SelectItem>
        {startupConfig?.helpAndFaqURL !== '/' && (
          <Select.SelectItem
            value=""
            onClick={() => window.open(startupConfig?.helpAndFaqURL, '_blank')}
            className="select-item text-sm"
          >
            <LinkIcon aria-hidden="true" />
            {localize('com_nav_help_faq')}
          </Select.SelectItem>
        )}
        <Select.SelectItem
          value=""
          onClick={() => setShowSettings(true)}
          className="select-item text-sm"
        >
          <GearIcon className="icon-md" aria-hidden="true" />
          {localize('com_nav_settings')}
        </Select.SelectItem>
        <Select.SelectItem
          value=""
          onClick={toggleLanguage}
          className="select-item text-sm"
        >
          <Globe className="icon-md" aria-hidden="true" />
          {localize('com_nav_language')} → {langcode === 'ar-EG' ? 'English' : 'العربية'}
        </Select.SelectItem>
        <DropdownMenuSeparator />
        <Select.SelectItem
          aria-selected={true}
          onClick={() => logout()}
          value="logout"
          className="select-item text-sm"
        >
          <LogOut className="icon-md" />
          {localize('com_nav_log_out')}
        </Select.SelectItem>
      </Select.SelectPopover>
      {showFiles && <FilesView open={showFiles} onOpenChange={setShowFiles} />}
      {showSettings && <Settings open={showSettings} onOpenChange={setShowSettings} />}
    </Select.SelectProvider>
  );
}

export default memo(AccountSettings);
