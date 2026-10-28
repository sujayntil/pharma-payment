# Tally import base test cases

| Case | Expected result | Automated coverage |
|---|---|---|
| Upload a valid workbook with a customer that has no MR mapping | Invoice imports with Bill Amount as the collectible total, remains unassigned, and customer appears in the unmapped report | `test_unmapped_invoice_imported_and_repeat_is_idempotent` |
| Upload the same weekly row again | No second invoice; row reported as a duplicate | `test_unmapped_invoice_imported_and_repeat_is_idempotent` |
| Re-upload a bill number with changed customer/date/amount | Existing invoice details are updated from the sheet; recorded collections remain and pending is recalculated | `test_existing_bill_number_is_updated_without_losing_collections` |
| Map an imported unassigned customer to an MR | Existing unassigned invoices become visible to that MR | `test_mapping_backfills_unassigned_invoices_and_future_imports` |
| Upload a later invoice for an already mapped customer | Invoice is assigned to the mapped MR | `test_mapping_backfills_unassigned_invoices_and_future_imports` |
| Load customers for assignment UI | MR assignment and invoice count are returned | `test_customer_list_exposes_assignment_and_invoice_count_to_mapping_ui` |
| Upload malformed row values | Row is reported; no invoice is saved for it | `test_invalid_rows_are_reported_without_becoming_invoices` |
| Upload a valid workbook without optional taxable/tax columns | Core invoice fields import; optional columns remain blank | `test_workbook_without_optional_tax_columns_is_accepted` |
| Upload unsupported `.xls` file | Clear 400 response; no changes | `test_non_xlsx_upload_is_rejected` |
| Call import without admin authorization | Request is rejected | `test_import_route_requires_admin_dependency` |
| Record a collection and open the admin dashboard feed | Recent payment is visible without a new notifications table | `test_recent_collection_feed_uses_existing_payment_ledger` |
| MR adds a normal invoice, then attempts to add an invoice already imported from Tally | Manual entry remains available; the Tally duplicate is blocked even with the legacy override flag | `test_mr_manual_invoice_flow_remains_available_but_blocks_tally_duplicate` |

Run from `backend/` with `python -m unittest discover -s tests`.

Manual acceptance still needed before rollout: inspect the import result on a phone and laptop, check a representative real workbook, and verify against a Neon staging branch with anonymized production-like rows. Do not run the schema migration directly against production as a test.
