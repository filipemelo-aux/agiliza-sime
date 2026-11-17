# Fleet rules

- Document/fine status (vencido, a vencer em 30 dias, em dia) comes from the due date in `fleetDocumentStatus.ts`, not the stored status alone, so stale records still show as overdue.
- Detran debts are imported by `vehicle-debts-sync` only for UFs with a debt endpoint (`normalize.ts`: MA, PA); rows carry a `[detran:<key>]` tag in observacoes so re-queries update in place and debts no longer listed are marked paid.
