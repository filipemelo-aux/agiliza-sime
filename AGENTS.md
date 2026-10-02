# Project architecture rules

- Standard list/report printing opens lightweight printable HTML and invokes browser printing; the DACTE is delivered as a direct PDF download (HTML rendered via html2canvas+jsPDF in src/lib/htmlToPdf.ts); cheque printing stays isolated because it needs exact physical positioning.
- Long fiscal entry forms are composed from collapsible section blocks and tinted sub-groups, with fields placed inside the block that owns the data, so density stays high while collapsed sections keep their state.
- ANTT minimum-freight coefficients live as versioned constants in one module, and road distance comes from a backend function, so a new ANTT resolution only adds a table version.
- CT-e authorization is initiated only from the list toolbar and uses the Focus NFe backend connector; fiscal forms only save drafts.
- Production and service CT-es use one shared complete DACTE HTML template so print fields and pagination stay consistent.
- MDF-e printing uses its own complete DAMDFE HTML template and the same direct PDF renderer as DACTE, because each fiscal model has a distinct official layout.
- SEFAZ operations on a CT-e (transmit, status, DACTE PDF, XML, CC-e, cancel) are grouped in one dialog opened by the toolbar SEFAZ button; the focus-nfe function exposes them per saved CT-e id so the emission environment stays consistent.
