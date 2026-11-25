import type {Metadata} from 'next';
import StaffSession from './staff-session';
import './style.css';

export const metadata: Metadata = {title: 'BartaCare Admin', robots: {index: false, follow: false}};
export default function Layout({children}: {children: React.ReactNode}) {
  return <html lang="bn"><body><StaffSession>{children}</StaffSession></body></html>;
}
