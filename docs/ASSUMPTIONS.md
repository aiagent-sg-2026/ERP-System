# HR/Admin MVP assumptions

Date: 2026-09-29. These are implementation choices for the local development
MVP; source contracts and tests take precedence if they conflict.

1. A Company profile belongs to the active authenticated `masterFn` and
   `companyFn`. A user with `settings.read` may view it; only a user with
   `settings.manage` may edit it. Neither Company identity nor country, currency
   or tax regime is editable from this profile form.
2. Registration number, tax number and postal address are optional until the
   Company supplies them. Saving trims values and enforces bounded lengths.
   The address uses line 1, line 2, city and postal code rather than imposing
   one country's address format on both SG and MY.
3. A Company logo is an optional PNG, JPEG or WebP image up to 256 KiB.
   The shared command validates its declared MIME type, bytes and signature;
   SVG is excluded because it can contain active content. Clearing a logo is
   an explicit user action.
4. Profile edits are versioned and audited. The current Company name is updated
   in the canonical `company` row; the remaining profile fields are stored in
   a Company-scoped record so they do not inflate ordinary tenant listings.
5. The Odoo project KB is concept research, not an implementation source. Its
   form-save note reinforces verifying server readback after save. The current
   ERP source and tests own the behavior here.

These assumptions can be revised when verified user or product requirements
provide a more specific contract.
