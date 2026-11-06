# Boleto rules

- Boleto remittances (CNAB 240) are built by `src/lib/boleto/cnab240Sicoob.ts` from per-tenant/establishment `cobranca_configs`; nosso número and NSA are reserved only via the locking `reservar_remessa_cnab` RPC (re-sent installments reuse their number) after client-side validation, so numbers never repeat or skip. A test reproduces the legacy remittance byte-for-byte.
