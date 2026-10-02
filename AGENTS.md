# Project architecture rules

- Standard list/report printing opens lightweight printable HTML and invokes browser printing; the DACTE PDF must always use the immutable vector renderer and approved A4 geometry in `src/components/freight/dactePdf.ts`—never HTML/canvas—because browser layout varied per machine; cheque output is delivered only as a downloaded PDF built from the stored layout in `src/lib/checkPdf.ts` (never direct browser printing, which silently skipped on some machines) and needs exact physical positioning, so it stays isolated from the other printers.
- Long fiscal entry forms are composed from collapsible section blocks and tinted sub-groups, with fields placed inside the block that owns the data, so density stays high while collapsed sections keep their state.
- ANTT minimum-freight coefficients live as versioned constants in one module, and road distance comes from a backend function, so a new ANTT resolution only adds a table version.
- CT-e authorization is initiated only from the list toolbar and uses the Focus NFe backend connector; fiscal forms only save drafts.
- Production and service CT-es use one shared DACTE vector renderer so print fields and positions stay identical.
- MDF-e printing uses its own complete DAMDFE HTML template rendered by the html2canvas+jsPDF helper, because each fiscal model has a distinct official layout.
- SEFAZ operations on a CT-e (transmit, status, DACTE PDF, XML, CC-e, cancel) are grouped in one dialog opened by the toolbar SEFAZ button; the focus-nfe function exposes them per saved CT-e id so the emission environment stays consistent.
- CT-e CFOP is derived centrally from the service origin/destination states and service type, so route changes cannot leave an internal/interstate code inconsistent.
- Official fiscal glyphs (SEFAZ, MDF-e) come from the Sime SVG set stored as CDN assets and are exposed only through wrapper components in `src/components/icons`, so the same approved glyph is reused in menus, toolbars and dialogs instead of ad-hoc generic icons.
