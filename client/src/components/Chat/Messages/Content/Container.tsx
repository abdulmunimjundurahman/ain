import { TMessage } from 'librechat-data-provider';
import { useRecoilValue } from 'recoil';
import store from '~/store';
import Files from './Files';

const Container = ({ children, message }: { children: React.ReactNode; message?: TMessage }) => {
  const chatDirection = useRecoilValue(store.chatDirection);
  const isRTL = chatDirection?.toLowerCase() === 'rtl';
  
  return (
    <div
      className="text-message flex min-h-[20px] flex-col items-start gap-3 overflow-visible [.text-message+&]:mt-5"
      dir={isRTL ? 'rtl' : 'ltr'}
    >
      {message?.isCreatedByUser === true && <Files message={message} />}
      {children}
    </div>
  );
};

export default Container;
