import { type ReactNode } from 'react';

type ITMSLayoutProps = {
  children: ReactNode;
};

export function ITMSLayout({ children }: ITMSLayoutProps) {
  return (
    <div className="h-full w-full text-white relative overflow-hidden">
      <div className="relative z-10 h-full w-full overflow-auto [&>*]:overflow-visible">
        {children}
      </div>
    </div>
  );
}
