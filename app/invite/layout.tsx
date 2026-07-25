// Static metadata for invite links — never indexed, clean preview when the
// invite URL is shared in chat.
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'คำเชิญเข้าร่วมทีม',
  description: 'คุณได้รับเชิญให้เข้าร่วมทีม — กดเพื่อตอบรับคำเชิญ',
  robots: { index: false, follow: false },
};

export default function InviteLayout({ children }: { children: React.ReactNode }) {
  return children;
}
