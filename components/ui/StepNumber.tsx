// Path: components/ui/StepNumber.tsx
// เลขลำดับขั้นในคู่มือ "วิธีหา credentials" — วงกลมสีแบรนด์ + ตัวเลขขาว
//
// เดิมประกาศไว้ในหน้า /settings/chat-channels ตัวเดียว พอหน้า /settings/ad-accounts
// ต้องมีคู่มือแบบเดียวกันจึงยกออกมาไว้ที่นี่ — หน้าไหนมีคู่มือทีละขั้นให้ใช้ตัวนี้

export default function StepNumber({ number }: { number: number }) {
  return (
    <div className="w-7 h-7 rounded-full bg-primary flex items-center justify-center flex-shrink-0">
      <span className="text-white text-sm font-bold">{number}</span>
    </div>
  );
}
