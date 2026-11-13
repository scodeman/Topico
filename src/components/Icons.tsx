import type { ReactNode } from 'react';

/* Small line icons for the toolbar (24×24 grid, drawn with the text colour).
   Shapes after Lucide (https://lucide.dev), ISC License, Copyright (c) Lucide Contributors. */

function Icon({ children }: { children: ReactNode }) {
  return (
    <svg className="icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  );
}

/** A page with a plus. */
export const NewIcon = () => (
  <Icon>
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <path d="M14 2v6h6" />
    <path d="M12 12v6M9 15h6" />
  </Icon>
);

/** A small diagram: three boxes linked to a common one. */
export const SampleIcon = () => (
  <Icon>
    <rect x="9" y="2" width="6" height="6" rx="1" />
    <rect x="2" y="16" width="6" height="6" rx="1" />
    <rect x="16" y="16" width="6" height="6" rx="1" />
    <path d="M12 8v4M5 16v-3a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v3" />
  </Icon>
);

/** An open folder. */
export const OpenIcon = () => (
  <Icon>
    <path d="m6 14 1.5-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.54 6a2 2 0 0 1-1.95 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H18a2 2 0 0 1 2 2v2" />
  </Icon>
);

/** A floppy disk. */
export const SaveIcon = () => (
  <Icon>
    <path d="M15.2 3a2 2 0 0 1 1.4.6l3.8 3.8a2 2 0 0 1 .6 1.4V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z" />
    <path d="M17 21v-7a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v7" />
    <path d="M7 3v4a1 1 0 0 0 1 1h7" />
  </Icon>
);

/** A floppy disk with a pencil: save to a new file. */
export const SaveAsIcon = () => (
  <Icon>
    <path d="M12 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h10.2a2 2 0 0 1 1.4.6l3.8 3.8a2 2 0 0 1 .6 1.4V10" />
    <path d="M7 21v-7a1 1 0 0 1 1-1h4" />
    <path d="M7 3v4a1 1 0 0 0 1 1h7" />
    <path d="M21.4 13.6a1.9 1.9 0 0 0-2.7-2.7L14 15.6V18.3h2.7z" />
  </Icon>
);

/** A page with a picture: export as an SVG image. */
export const ImageFileIcon = () => (
  <Icon>
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <path d="M14 2v6h6" />
    <circle cx="10" cy="12" r="2" />
    <path d="m20 17-1.1-1.1a2 2 0 0 0-2.8 0L10 22" />
  </Icon>
);

/** Two boxes joined by a connector: export as an editable diagram. */
export const DiagramIcon = () => (
  <Icon>
    <rect x="3" y="3" width="8" height="8" rx="2" />
    <path d="M7 11v4a2 2 0 0 0 2 2h4" />
    <rect x="13" y="13" width="8" height="8" rx="2" />
  </Icon>
);
