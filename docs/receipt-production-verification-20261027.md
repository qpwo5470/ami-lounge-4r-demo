# Receipt request demo production verification — 2026-10-27

Issues: qpwo5470/ami-lounge-4r-demo#1 and qpwo5470/408d_web#103. User corrected scope: send the actual normal-auth production receiveKioskSale request; do not directly create admin vouchers.

Source c14a1a6 (35 tests pass), coordinator Chrome/parser QA passes including delayed-response side change. Source main pushed and GitHub Pages built c14a1a6; all8 changed/runtime assets match local SHA256. Existing29 DEMO SVGs/menu unchanged.

Receiver9f9359f deployed as receivekiosksale-00007-baq ACTIVE. Production1/test0 preserved; only exact Pages origin CORS enabled, test receiver remains closed. Temporary issue102 raw diagnostics expired and were not extended.

Real browser POST from Pages origin with normal kiosk headers returned200 ACCEPTED, identical POST replay returned200 ALREADY_RECEIVED. Payload N61605|02|20261027|9901|01|AL001HS; corresponding production voucher4a2a0fc9db7eadb7a01bcee5deaba9bd73e3470e5a5dceb2630eed3ac3b52a81 is ISSUED with source kis-N61605 and issuer kis. Exact body/QR/menu code verified in sale/voucher records. Approval is DEMO-prefixed so the synthetic recorded sale is identifiable. No real card charging or physical manufacture initiated.

Key is entered at runtime, memory-only and not in this repo/storage. Optional v3 totals omitted; verified accepted by the actual receiver. Live URL https://qpwo5470.github.io/ami-lounge-4r-demo/?device=R&v=20261027-2 . Field scan/physical output remains the user’s test, independently of app issue296.
