# Project architecture rules

- All standard document printing opens lightweight printable HTML in a new window and invokes browser printing; cheque printing remains isolated in its dedicated layout because it requires exact physical positioning.
- Long fiscal entry forms are composed from collapsible section blocks and tinted sub-groups, with fields placed inside the block that owns the data, so density stays high while collapsed sections keep their state.
- ANTT minimum-freight coefficients live as versioned constants in one module, and road distance comes from a backend function, so a new ANTT resolution only adds a table version.
- CT-e authorization is initiated only from the list toolbar and uses the Focus NFe backend connector; fiscal forms only save drafts.
- Production and service CT-es use one shared complete DACTE HTML template so print fields and pagination stay consistent.
