/** Ícones SVG do protótipo Aion (design handoff) (stroke currentColor). */
export function Icon({
  d,
  size = 19,
}: {
  d: string;
  size?: number;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      dangerouslySetInnerHTML={{ __html: d }}
    />
  );
}

export const ICONS = {
  dashboard:
    '<rect x="3" y="3" width="7" height="9" rx="1.5"></rect><rect x="14" y="3" width="7" height="5" rx="1.5"></rect><rect x="14" y="12" width="7" height="9" rx="1.5"></rect><rect x="3" y="16" width="7" height="5" rx="1.5"></rect>',
  equip:
    '<rect x="3" y="4" width="18" height="12" rx="2"></rect><path d="M8 20h8"></path><path d="M12 16v4"></path>',
  os: '<path d="M9 3h6a1 1 0 0 1 1 1v1H8V4a1 1 0 0 1 1-1z"></path><rect x="5" y="5" width="14" height="16" rx="2"></rect><path d="M8.5 12h7M8.5 16h5"></path>',
  gestao:
    '<path d="M14.7 6.3a4 4 0 0 1-5 5L4 17v3h3l5.7-5.7a4 4 0 0 1 5-5L14.7 12l-3-3z"></path>',
  evolucao: '<path d="M3 17l6-6 4 4 8-8"></path><path d="M14 7h7v7"></path>',
  estoque: '<path d="M3 9.5 12 4l9 5.5"></path><path d="M5 10v10h14V10"></path>',
  financeiro:
    '<circle cx="12" cy="12" r="9"></circle><path d="M12 7v5l3 3"></path>',
  megaphone:
    '<path d="M3 10v4a1 1 0 0 0 1 1h2l4 4V5L6 9H4a1 1 0 0 0-1 1z"></path><path d="M14 8a4 4 0 0 1 0 8"></path>',
  search: '<circle cx="11" cy="11" r="7"></circle><path d="M20 20l-3.5-3.5"></path>',
  star: '<path d="M12 3l2.6 5.6 6.1.6-4.6 4.1 1.4 6-5.5-3.3-5.5 3.3 1.4-6-4.6-4.1 6.1-.6z"></path>',
  clock: '<circle cx="12" cy="12" r="9"></circle><path d="M12 7v5l4 2"></path>',
  help: '<circle cx="12" cy="12" r="9"></circle><path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.8.4-1.5 1-1.5 2.2V14"></path><path d="M12 17.5v.01"></path>',
  bell: '<path d="M6 16h12l-1.2-2.2A4 4 0 0 1 16 11V9a4 4 0 0 0-8 0v2a4 4 0 0 1-.8 2.8z"></path><path d="M10 18a2 2 0 0 0 4 0"></path>',
  building:
    '<rect x="4" y="3" width="16" height="18" rx="1.5"></rect><path d="M8 8h2M14 8h2M8 12h2M14 12h2M8 16h2M14 16h2"></path>',
  folder:
    '<path d="M3 6a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>',
  history:
    '<path d="M3 12a9 9 0 1 0 3-6.7"></path><path d="M3 4v5h5"></path><path d="M12 7v5l3 3"></path>',
  clipboard:
    '<rect x="6" y="4" width="12" height="17" rx="2"></rect><path d="M9 3h6v3H9z"></path><path d="M9 11h6M9 15h6"></path>',
  factory:
    '<path d="M3 21V10l5 3.5V10l5 3.5V10l6 4v7z"></path><path d="M3 21h18"></path>',
  layers:
    '<path d="M12 3 2 8l10 5 10-5z"></path><path d="M2 13l10 5 10-5"></path><path d="M2 18l10 5 10-5"></path>',
  columns:
    '<rect x="3" y="4" width="18" height="16" rx="2"></rect><path d="M9 4v16M15 4v16"></path>',
  plus: '<path d="M12 5v14M5 12h14"></path>',
  pin: '<path d="M12 21s7-6.6 7-11.5A7 7 0 0 0 5 9.5C5 14.4 12 21 12 21z"></path><circle cx="12" cy="9.5" r="2.3"></circle>',
  users:
    '<circle cx="9" cy="8" r="3.2"></circle><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6"></path>',
  contratos:
    '<rect x="4" y="3" width="16" height="18" rx="1.5"></rect><path d="M8 8h8M8 12h8M8 16h5"></path>',
  dollar:
    '<path d="M12 2v20"></path><path d="M17 6.5c0-1.9-2.2-3.5-5-3.5s-5 1.4-5 3.5S9.2 10 12 10s5 1.6 5 3.5-2.2 3.5-5 3.5-5-1.4-5-3.5"></path>',
  compass:
    '<circle cx="12" cy="12" r="9"></circle><path d="M14.5 9.5 13 14l-4.5 1.5L10 11z"></path>',
  target:
    '<circle cx="12" cy="12" r="8.5"></circle><circle cx="12" cy="12" r="4.5"></circle><circle cx="12" cy="12" r="0.8"></circle>',
  shield: '<path d="M12 3 4 6v6c0 5 3.5 8 8 10 4.5-2 8-5 8-10V6z"></path>',
  settings:
    '<circle cx="12" cy="12" r="3"></circle><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"></path>',
  flag: '<path d="M5 3v18"></path><path d="M5 4h11l-2 4 2 4H5"></path>',
  trend: '<path d="M3 17l6-6 4 4 8-8"></path><path d="M15 6h6v6"></path>',
  calendar:
    '<rect x="3" y="5" width="18" height="16" rx="2"></rect><path d="M8 3v4M16 3v4M3 10h18"></path>',
  archive:
    '<rect x="3" y="4" width="18" height="5" rx="1.5"></rect><path d="M5 9v11h14V9M10 13h4"></path>',
} as const;

export type IconKey = keyof typeof ICONS;
