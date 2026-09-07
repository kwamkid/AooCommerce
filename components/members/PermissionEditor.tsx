// Path: components/members/PermissionEditor.tsx
// ตัวตั้งสิทธิ์สมาชิก — ใช้ร่วมทั้งโมดัล "เชิญสมาชิก" และ "แก้ไขสมาชิก"
//
// โมเดล (ดู lib/permissions.ts): ตำแหน่งหลัก 1 ค่า + staff เปิดสิทธิ์เป็นราย
// "กลุ่มงาน" 3 ระดับ (ไม่เห็น / ดูอย่างเดียว / จัดการ)
//
// ⛔ ห้ามสร้าง UI ติ๊กตำแหน่ง/สิทธิ์ตัวใหม่ที่ไหนอีก — ของเดิมเป็น checkbox หลาย role
//    ที่ผสมกันเองได้ ทำให้เจ้าของร้าน "งงว่าใครเห็นอะไร ใครทำอะไรได้"
'use client';

import { useMemo } from 'react';
import { Check, Crown, Monitor, ShieldCheck, UserCog, Users } from 'lucide-react';
import FilterChips, { type FilterChip } from '@/components/ui/FilterChips';
import OptionCards, { type OptionCardItem } from '@/components/ui/OptionCards';
import Radio from '@/components/ui/Radio';
import Toggle from '@/components/ui/Toggle';
import {
  AREAS, ROLE_LEVELS, STAFF_PRESETS, isAdminTierRole,
  type Area, type AreaLevel, type Permissions, type RoleLevel,
} from '@/lib/permissions';

export interface MemberPermissionValue {
  role: RoleLevel;
  /** ใช้เฉพาะ role staff — ชั้นผู้บริหารได้ทุกกลุ่มงานอัตโนมัติ */
  permissions: Permissions;
  can_view_cost: boolean;
  pc_all_counters: boolean;
  /** กติกาเดิมของสิทธิ์คลัง: [] = ทุกคลัง · มีสมาชิก = เฉพาะที่เลือก */
  warehouse_ids: string[];
  /** อนุมานจาก warehouse_ids เสมอ (เครื่อง POS ผูกกับคลัง) — ไม่ให้ผู้ใช้เลือกแยก */
  terminal_ids: string[];
}

export interface WarehouseOption { id: string; name: string; is_default?: boolean }
export interface TerminalOption { id: string; name: string; warehouse_id: string | null }

interface PermissionEditorProps {
  value: MemberPermissionValue;
  onChange: (next: MemberPermissionValue) => void;
  /** members.grant_admin — ผู้จัดการมอบตำแหน่งผู้ดูแลระบบ/เจ้าของไม่ได้ (API บังคับซ้ำอีกชั้น) */
  canGrantAdmin: boolean;
  warehouses: WarehouseOption[];
  terminals: TerminalOption[];
  /** กำลังแก้ไขเจ้าของ → ล็อกตำแหน่งไว้ (เจ้าของถูกกำหนดโดยระบบ ไม่ใช่มอบให้กัน) */
  isOwnerTarget?: boolean;
  disabled?: boolean;
  /**
   * โหมดเชิญให้ส่ง false — `company_invitations` ไม่มีคอลัมน์ `pc_all_counters`
   * (ตั้งได้หลังสมาชิกเข้าร่วมแล้วเท่านั้น) โชว์สวิตช์ที่ตั้งไม่ติดคือโกหกผู้ใช้
   */
  showPcRover?: boolean;
}

const LEVEL_CHIPS: FilterChip<AreaLevel>[] = [
  { id: 'none', label: 'ไม่เห็น', activeClass: 'border-gray-400 bg-gray-100 text-gray-700 dark:bg-slate-600 dark:text-slate-100 dark:border-slate-400' },
  { id: 'view', label: 'ดูอย่างเดียว', activeClass: 'border-blue-400 bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300' },
  { id: 'manage', label: 'จัดการ', activeClass: 'border-emerald-400 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300' },
];

const PRESET_CHIP_CLASS = 'border-primary bg-primary/10 text-primary dark:text-[#FF7043]';

const ROLE_ICON: Record<RoleLevel, React.ElementType> = {
  owner: Crown,
  admin: ShieldCheck,
  manager: UserCog,
  staff: Users,
};

/** ตัดกลุ่มงานที่ 'none' ทิ้ง — เก็บ key ที่ปิดอยู่ไว้ทำให้เทียบกับแม่แบบไม่ตรงเปล่า ๆ */
function pruned(permissions: Permissions): Permissions {
  const out: Permissions = {};
  for (const area of AREAS) {
    const level = permissions[area.key];
    if (level === 'view' || level === 'manage') out[area.key] = level;
  }
  return out;
}

function samePermissions(a: Permissions, b: Permissions): boolean {
  const pa = pruned(a), pb = pruned(b);
  const ka = Object.keys(pa), kb = Object.keys(pb);
  if (ka.length !== kb.length) return false;
  return ka.every(k => pa[k as Area] === pb[k as Area]);
}

/** สิทธิ์ตั้งต้นของ staff ที่เพิ่งถูกสร้าง/ถูกลดขั้นมาจากผู้บริหาร */
export const DEFAULT_STAFF_PERMISSIONS: Permissions = STAFF_PRESETS[0].permissions;

export default function PermissionEditor({
  value, onChange, canGrantAdmin, warehouses, terminals,
  isOwnerTarget, disabled, showPcRover = true,
}: PermissionEditorProps) {
  const adminTier = isAdminTierRole(value.role);
  const perms = value.permissions || {};
  const levelOf = (area: Area): AreaLevel => perms[area] ?? 'none';

  const patch = (part: Partial<MemberPermissionValue>) => onChange({ ...value, ...part });

  // เครื่อง POS ผูกกับคลัง — เลือกคลังไหนก็ได้เครื่องของคลังนั้น (กติกาเดิมของหน้าสมาชิก)
  const terminalsFor = (warehouseIds: string[]): string[] =>
    warehouseIds.length === 0
      ? []
      : terminals.filter(t => t.warehouse_id && warehouseIds.includes(t.warehouse_id)).map(t => t.id);

  const terminalsByWarehouse = useMemo(() => {
    const map: Record<string, TerminalOption[]> = {};
    for (const t of terminals) {
      if (!t.warehouse_id) continue;
      (map[t.warehouse_id] ||= []).push(t);
    }
    return map;
  }, [terminals]);

  const setRole = (role: RoleLevel) => {
    if (isAdminTierRole(role)) {
      // ผู้บริหารได้ทุกกลุ่มงาน + ทุกคลัง + เห็นต้นทุนเสมอ (resolveCanViewCost)
      // permissions ต้องว่าง ไม่งั้นมีสองแหล่งความจริงว่าใครได้อะไร
      patch({ role, permissions: {}, can_view_cost: true, warehouse_ids: [], terminal_ids: [] });
      return;
    }
    // ลดขั้นมาเป็น staff แล้วยังไม่มีสิทธิ์อะไรเลย → ตั้งแม่แบบตัวแรกให้ก่อน
    // (ปล่อยว่างไว้ = คนนั้นล็อกอินเข้ามาแล้วไม่เห็นเมนูอะไรเลย ซึ่งดูเหมือนระบบพัง)
    // ขอบเขตคลังไม่แตะ — ค่าที่มีอยู่โชว์อยู่บนจอให้เห็นชัด ๆ อยู่แล้ว ไม่ใช่การให้สิทธิ์เงียบ
    const nextPerms = Object.keys(pruned(perms)).length > 0 ? perms : { ...DEFAULT_STAFF_PERMISSIONS };
    patch({ role, permissions: nextPerms });
  };

  const setArea = (area: Area, level: AreaLevel) => {
    const next: Permissions = { ...perms };
    if (level === 'none') delete next[area];
    else next[area] = level;
    patch({ permissions: next });
  };

  const setWarehouseIds = (ids: string[]) =>
    patch({ warehouse_ids: ids, terminal_ids: terminalsFor(ids) });

  const roleOptions: OptionCardItem<RoleLevel>[] = ROLE_LEVELS
    .filter(r => {
      if (r.key === 'owner') return isOwnerTarget === true;   // เจ้าของ = ระบบกำหนด มอบให้กันไม่ได้
      if (r.key === 'admin') return canGrantAdmin;
      return true;
    })
    .map(r => {
      const Icon = ROLE_ICON[r.key];
      return {
        id: r.key,
        label: r.label,
        description: r.key === 'owner' && isOwnerTarget ? 'กำหนดโดยระบบ' : r.desc,
        preview: (
          <span className={`w-9 h-9 rounded-full flex items-center justify-center ${
            value.role === r.key ? 'bg-primary text-white' : 'bg-gray-100 dark:bg-slate-700 text-gray-500 dark:text-slate-400'
          }`}>
            <Icon className="w-4 h-4" />
          </span>
        ),
      };
    });

  // เทียบกับแม่แบบทั้ง 5 ตัว = งานเล็กมาก ไม่ต้อง memo (perms เป็น object ใหม่ทุก render อยู่แล้ว)
  const activePreset = STAFF_PRESETS.find(p => samePermissions(p.permissions, perms))?.key ?? '';

  const presetChips: FilterChip<string>[] = STAFF_PRESETS.map(p => ({
    id: p.key,
    label: p.label,
    activeClass: PRESET_CHIP_CLASS,
  }));

  // สิทธิ์คลัง/POS จะมีความหมายก็ต่อเมื่อคนนั้นเปิดกลุ่มงานคลังหรือแคชเชียร์อยู่
  const needsWarehouseScope = levelOf('inventory') !== 'none' || levelOf('pos') !== 'none';
  const showTerminalNames = levelOf('pos') !== 'none';
  const warehouseMode: 'all' | 'custom' = value.warehouse_ids.length === 0 ? 'all' : 'custom';

  return (
    <div className="space-y-5">
      {/* ── ตำแหน่ง ─────────────────────────────────────────────── */}
      <div>
        <label className="field-label">ตำแหน่ง</label>
        <OptionCards
          value={value.role}
          onChange={setRole}
          options={roleOptions}
          columns={Math.min(roleOptions.length, 3)}
          disabled={disabled || isOwnerTarget}
        />
      </div>

      {adminTier ? (
        <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900">
          <Check className="w-4 h-4 text-emerald-600 dark:text-emerald-400 mt-0.5 flex-shrink-0" />
          <p className="subtitle-text text-emerald-700 dark:text-emerald-300">
            ได้ทุกกลุ่มงานอัตโนมัติ — เข้าถึงทุกคลัง เห็นต้นทุนสินค้า และเปิดหน้าตั้งค่าได้
          </p>
        </div>
      ) : (
        <>
          {/* ── แม่แบบ ─────────────────────────────────────────── */}
          <div>
            <label className="field-label">แม่แบบ</label>
            <p className="helper-text text-gray-400 dark:text-slate-500 mb-2">
              กดเลือกเพื่อตั้งกลุ่มงานทั้งชุดทีเดียว แล้วปรับรายตัวด้านล่างได้
            </p>
            <FilterChips
              chips={presetChips}
              value={activePreset}
              onChange={key => {
                const preset = STAFF_PRESETS.find(p => p.key === key);
                if (preset) patch({ permissions: { ...preset.permissions } });
              }}
              disabled={disabled}
            />
          </div>

          {/* ── กลุ่มงาน ────────────────────────────────────────── */}
          <div>
            <label className="field-label">กลุ่มงาน</label>
            <div className="rounded-lg border border-gray-200 dark:border-slate-600 divide-y divide-gray-100 dark:divide-slate-700">
              {AREAS.map(area => (
                <div
                  key={area.key}
                  className="flex flex-col gap-2 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
                >
                  <div className="min-w-0">
                    <p className="subtitle-text font-medium text-gray-700 dark:text-slate-300">{area.label}</p>
                    <p className="helper-text text-gray-400 dark:text-slate-500">{area.desc}</p>
                  </div>
                  <FilterChips
                    chips={LEVEL_CHIPS}
                    value={levelOf(area.key)}
                    onChange={level => setArea(area.key, level)}
                    disabled={disabled}
                    className="sm:justify-end"
                  />
                </div>
              ))}
            </div>
          </div>

          {/* ── ขอบเขตคลัง / POS ─────────────────────────────────── */}
          {needsWarehouseScope && warehouses.length > 0 && (
            <div>
              <label className="field-label">คลังที่เข้าถึงได้</label>
              <div className="space-y-2 mb-2">
                <Radio
                  checked={warehouseMode === 'all'}
                  onChange={() => setWarehouseIds([])}
                  label="ทุกคลัง"
                  disabled={disabled}
                />
                <Radio
                  checked={warehouseMode === 'custom'}
                  onChange={() => {
                    if (value.warehouse_ids.length > 0) return;
                    // เริ่มโหมด "เฉพาะที่เลือก" ด้วยคลังหลักเสมอ — ลิสต์ว่างแปลว่าทุกคลัง
                    const first = warehouses.find(w => w.is_default) || warehouses[0];
                    setWarehouseIds(first ? [first.id] : []);
                  }}
                  label="เฉพาะคลังที่เลือก"
                  disabled={disabled}
                />
              </div>
              {warehouseMode === 'custom' && (
                <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                  {warehouses.map(wh => {
                    const checked = value.warehouse_ids.includes(wh.id);
                    const whTerminals = terminalsByWarehouse[wh.id] || [];
                    return (
                      <label
                        key={wh.id}
                        className={`flex items-center gap-2.5 px-3 py-2 rounded-lg cursor-pointer transition-colors ${
                          checked ? 'bg-primary/5 dark:bg-primary/10' : 'bg-gray-50 dark:bg-slate-700 hover:bg-gray-100 dark:hover:bg-slate-600'
                        } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
                      >
                        {/* input จริงซ่อนไว้ (ไม่ใช่ div ล้วน) เพื่อให้ยัง tab/เคาะ space ได้ */}
                        <input
                          type="checkbox"
                          className="sr-only"
                          checked={checked}
                          disabled={disabled}
                          onChange={() => {
                            // ห้ามเอาตัวสุดท้ายออก — ลิสต์ว่างจะสลับกลับเป็น "ทุกคลัง" เงียบ ๆ
                            if (checked && value.warehouse_ids.length === 1) return;
                            setWarehouseIds(
                              checked
                                ? value.warehouse_ids.filter(id => id !== wh.id)
                                : [...value.warehouse_ids, wh.id],
                            );
                          }}
                        />
                        <span className={`w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                          checked ? 'bg-primary border-primary' : 'border-gray-300 dark:border-slate-500'
                        }`}>
                          {checked && <Check className="w-3 h-3 text-white" />}
                        </span>
                        <span className="min-w-0">
                          <span className="subtitle-text text-gray-700 dark:text-slate-300">{wh.name}</span>
                          {showTerminalNames && whTerminals.length > 0 && (
                            <span className="helper-text text-gray-400 dark:text-slate-500 ml-1">
                              ({whTerminals.map((t, i) => (
                                <span key={t.id}>
                                  {i > 0 && ', '}
                                  <Monitor className="w-3 h-3 inline -mt-0.5 mr-0.5" />
                                  {t.name}
                                </span>
                              ))})
                            </span>
                          )}
                        </span>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ── PC หน่วยแทน ─────────────────────────────────────── */}
          {levelOf('pc') === 'manage' && (
            showPcRover ? (
              <div className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg bg-gray-50 dark:bg-slate-700">
                <div className="min-w-0">
                  <p className="subtitle-text text-gray-700 dark:text-slate-300">PC หน่วยแทน (เข้าได้ทุกสาขา)</p>
                  <p className="helper-text text-gray-400 dark:text-slate-500">
                    ปิด = บันทึกยอดได้เฉพาะสาขาที่ถูกมอบหมายในหน้าลูกค้าฝากขาย
                  </p>
                </div>
                <Toggle
                  checked={value.pc_all_counters}
                  onChange={v => patch({ pc_all_counters: v })}
                  disabled={disabled}
                  aria-label="PC หน่วยแทน"
                />
              </div>
            ) : (
              <p className="helper-text text-gray-400 dark:text-slate-500 px-1">
                ตั้ง &ldquo;PC หน่วยแทน (เข้าได้ทุกสาขา)&rdquo; ได้หลังสมาชิกกดรับคำเชิญแล้ว
              </p>
            )
          )}

          {/* ── ต้นทุน ─────────────────────────────────────────── */}
          <div className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg bg-gray-50 dark:bg-slate-700">
            <div className="min-w-0">
              <p className="subtitle-text text-gray-700 dark:text-slate-300">เห็นต้นทุนสินค้า</p>
              <p className="helper-text text-gray-400 dark:text-slate-500">ราคาทุน · กำไรต่อชิ้น</p>
            </div>
            <Toggle
              checked={value.can_view_cost}
              onChange={v => patch({ can_view_cost: v })}
              disabled={disabled}
              aria-label="เห็นต้นทุนสินค้า"
            />
          </div>
        </>
      )}
    </div>
  );
}
