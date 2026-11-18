# Fleet rules

- Document/fine status (vencido, a vencer em 30 dias, em dia) comes from the due date in `fleetDocumentStatus.ts`, not the stored status alone, so stale records still show as overdue.
- Detran debts use dedicated endpoints in `normalize.ts` (MA, PA, TO) and `[detran:<key>]` tags for updates; TO also queries SEFAZ-TO IPVA in parallel (optional, warning on failure); in TO only SEFAZ IPVA tags may be marked paid when absent, since the Detran response is incomplete. State timeouts retry once.
- Detran owner documents resolve canonical profile IDs first and legacy auth IDs only when unique, both in the dialog and server; the stored owner's document takes precedence to avoid querying another establishment.
