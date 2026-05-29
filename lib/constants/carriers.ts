/**
 * Carrier presets — shared between the onboarding wizard step and the
 * carriers settings page. The settings page filters out codes that have
 * already been added so the user only sees presets still available to
 * one-click-add.
 *
 * `shippop` is the Shippop courier code (null = courier not bookable via
 * Shippop, e.g. Grab Express).
 *
 * `tracking_url` is the public tracking-page template — `{tracking}` is
 * substituted with the tracking number at click time. null = no public
 * tracking page (e.g. Grab / Lalamove are tracked in-app).
 */
export interface CarrierPreset {
  code: string;
  name: string;
  shippop: string | null;
  tracking_url: string | null;
  popular: boolean;
}

export const CARRIER_PRESETS: CarrierPreset[] = [
  { code: 'thai_post', name: 'ไปรษณีย์ไทย / EMS', shippop: 'EMST', tracking_url: 'https://track.thailandpost.co.th/?trackNumber={tracking}',         popular: true  },
  { code: 'kerry',     name: 'Kerry Express',      shippop: 'KEX',  tracking_url: 'https://th.kerryexpress.com/th/track/?track={tracking}',          popular: true  },
  { code: 'flash',     name: 'Flash Express',      shippop: 'FLE',  tracking_url: 'https://www.flashexpress.co.th/tracking/?se={tracking}',         popular: true  },
  { code: 'j&t',       name: 'J&T Express',        shippop: 'JNT',  tracking_url: 'https://www.jtexpress.co.th/index/query/gzquery.html?bills={tracking}', popular: true  },
  { code: 'scg',       name: 'SCG Express',        shippop: 'SCG',  tracking_url: 'https://www.scgexpress.co.th/tracking?cs={tracking}',            popular: false },
  { code: 'ninja',     name: 'Ninja Van',          shippop: 'NJV',  tracking_url: 'https://www.ninjavan.co/th-th/tracking?id={tracking}',           popular: false },
  { code: 'best',      name: 'BEST Express',       shippop: 'BEST', tracking_url: 'https://www.best-inc.co.th/track?bills={tracking}',              popular: false },
  { code: 'dhl',       name: 'DHL',                shippop: 'DHL',  tracking_url: 'https://www.dhl.com/th-en/home/tracking/tracking-express.html?submit=1&tracking-id={tracking}', popular: false },
  { code: 'grab',      name: 'Grab Express',       shippop: null,   tracking_url: null,                                                              popular: false },
  { code: 'lalamove',  name: 'Lalamove',           shippop: 'LLM',  tracking_url: null,                                                              popular: false },
];
