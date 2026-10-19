/** Local SVG interface icons; no remote icon font or runtime dependency. */
const paths:Record<string,string>={
 menu:'<path d="M4 6h16M4 12h16M4 18h16"/>',close:'<path d="m6 6 12 12M6 18 18 6"/>',arrow:'<path d="M5 12h14m-6-6 6 6-6 6"/>',back:'<path d="M19 12H5m6-6-6 6 6 6"/>',
 map:'<path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3V6Zm6-3v15m6-12v15"/>',wheel:'<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="2"/><path d="M3 10h6m6 0h6m-9 4v7"/>',
 route:'<circle cx="6" cy="5" r="2"/><circle cx="18" cy="19" r="2"/><path d="M8 5h8a4 4 0 0 1 0 8H8a3 3 0 0 0 0 6h8"/>',pin:'<path d="M20 10c0 6-8 11-8 11S4 16 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/>',
 shield:'<path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3Z"/><path d="m8 12 3 3 5-6"/>',chart:'<path d="M4 4v16h16M8 15v-4m5 4V7m5 8V4"/>',settings:'<path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="3"/><circle cx="15" cy="17" r="3"/>',
 play:'<path d="m8 4 12 8-12 8V4Z"/>',pause:'<path d="M8 5v14M16 5v14"/>',reset:'<path d="M3 11a9 9 0 1 1 2 7M3 4v7h7"/>',book:'<path d="M12 5c-3-2-7-2-9-1v15c3-1 6-1 9 1 3-2 6-2 9-1V4c-2-1-6-1-9 1Zm0 0v15"/>',
 compass:'<circle cx="12" cy="12" r="9"/><path d="m16 8-2 6-6 2 2-6 6-2Z"/>',help:'<circle cx="12" cy="12" r="9"/><path d="M9 9a3 3 0 1 1 4 3c-1 0-1 1-1 2m0 3h.01"/>',info:'<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10h.01"/>',
 home:'<path d="m3 11 9-8 9 8M5 10v11h14V10M9 21v-7h6v7"/>',layers:'<path d="m12 3 10 6-10 6L2 9l10-6Zm-10 11 10 6 10-6"/>',save:'<path d="M5 3h12l4 4v14H3V3h2Zm2 0v6h10V3M7 21v-8h10v8"/>',
 left:'<path d="M18 20v-9a4 4 0 0 0-4-4H4m5-5L4 7l5 5"/>',right:'<path d="M6 20v-9a4 4 0 0 1 4-4h10m-5-5 5 5-5 5"/>',straight:'<path d="M12 21V3m-6 6 6-6 6 6"/>',uturn:'<path d="M18 21V9a6 6 0 0 0-12 0v6m-4-4 4 4 4-4"/>',check:'<path d="m5 12 4 4L19 6"/>',eye:'<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
};
export function icon(name:string,className=''):string{return `<svg class="icon ${className}" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name]??paths.compass}</svg>`;}
