export interface ThaiBank {
  code: string;
  name_th: string;
  name_en: string;
  color: string;
  logo?: string;
  icon?: string;
}

export const THAI_BANKS: ThaiBank[] = [
  { code: 'BBL',       name_th: 'กรุงเทพ',             name_en: 'Bangkok Bank',       color: '#1e22aa', logo: '/bank_logo/bbl.svg' },
  { code: 'KBANK',     name_th: 'กสิกรไทย',            name_en: 'Kasikornbank',       color: '#138f2d', logo: '/bank_logo/kbank.svg' },
  { code: 'SCB',       name_th: 'ไทยพาณิชย์',          name_en: 'SCB',                color: '#4e2a82', logo: '/bank_logo/scb.svg' },
  { code: 'KTB',       name_th: 'กรุงไทย',             name_en: 'Krungthai Bank',     color: '#1ba5e1', logo: '/bank_logo/ktb.svg' },
  { code: 'TTB',       name_th: 'ทหารไทยธนชาต',        name_en: 'TMBThanachart',      color: '#0f59a0', logo: '/bank_logo/tmb.svg' },
  { code: 'BAY',       name_th: 'กรุงศรีอยุธยา',        name_en: 'Bank of Ayudhya',    color: '#fec43b', logo: '/bank_logo/bay.svg' },
  { code: 'GSB',       name_th: 'ออมสิน',               name_en: 'Government Savings', color: '#eb198d', logo: '/bank_logo/gsb.svg' },
  { code: 'BAAC',      name_th: 'ธ.ก.ส.',              name_en: 'BAAC',               color: '#4b9b1d', logo: '/bank_logo/baac.svg' },
  { code: 'CIMB',      name_th: 'ซีไอเอ็มบี',           name_en: 'CIMB Thai',          color: '#7b0000', logo: '/bank_logo/cimb.svg' },
  { code: 'UOB',       name_th: 'ยูโอบี',               name_en: 'UOB',                color: '#0b3979', logo: '/bank_logo/uob.svg' },
  { code: 'LHBANK',    name_th: 'แลนด์ แอนด์ เฮ้าส์',   name_en: 'Land and Houses',    color: '#6d6e71', logo: '/bank_logo/lhb.svg' },
  { code: 'TISCO',     name_th: 'ทิสโก้',               name_en: 'TISCO',              color: '#12549f', logo: '/bank_logo/tisco.svg' },
  { code: 'KKP',       name_th: 'เกียรตินาคินภัทร',      name_en: 'Kiatnakin Phatra',   color: '#199078', logo: '/bank_logo/kk.svg' },
  { code: 'ICBC',      name_th: 'ไอซีบีซี',             name_en: 'ICBC (Thai)',        color: '#c50f1c', logo: '/bank_logo/icbc.svg' },
  { code: 'GHB',       name_th: 'ธอส.',                name_en: 'Government Housing', color: '#f57e20', logo: '/bank_logo/ghb.svg' },
  { code: 'PROMPTPAY', name_th: 'PromptPay',           name_en: 'PromptPay',          color: '#003b71' },
];

export function getBankByCode(code: string): ThaiBank | undefined {
  return THAI_BANKS.find(b => b.code === code);
}
