// แถวแท็บกรองแบบชิป — ใช้ได้ทุกหน้า list
// สไตล์อยู่ใน globals.css (`.filter-tabs` / `.filter-tab` / `.filter-tab-active`)
// ห้ามพิมพ์คลาสสีเองที่หน้า ไม่งั้นแต่ละหน้าจะเพี้ยนกันเองอีก
'use client';

export interface FilterTabItem {
  id: string;
  label: string;
  /** ซ่อนแท็บนี้ (เช่นฟีเจอร์ยังไม่เปิด) */
  hidden?: boolean;
}

interface Props {
  tabs: FilterTabItem[];
  activeId: string;
  onChange: (id: string) => void;
  className?: string;
}

export default function FilterTabs({ tabs, activeId, onChange, className }: Props) {
  const visible = tabs.filter(t => !t.hidden);
  if (visible.length === 0) return null;

  return (
    <div className={`filter-tabs${className ? ` ${className}` : ''}`} role="tablist">
      {visible.map(tab => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          aria-selected={tab.id === activeId}
          onClick={() => onChange(tab.id)}
          className={`filter-tab${tab.id === activeId ? ' filter-tab-active' : ''}`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
