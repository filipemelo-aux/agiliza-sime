# Fleet rules

- Document/fine status (vencido, a vencer em 30 dias, em dia) comes from the due date in `fleetDocumentStatus.ts`, not the stored status alone, so stale records still show as overdue.
- Detran debts use dedicated endpoints in `normalize.ts` (MA, PA, TO) and `[detran:<key>]` tags for updates; TO preserves absent debts because an incomplete response is not evidence of payment.
