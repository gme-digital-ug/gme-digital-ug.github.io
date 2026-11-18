# Glossary

**Company facts**
The facts about GME Digital UG that pages name: legal and short company name, address,
commercial register entry (court and HRB number), managing director, contact email,
phone, VAT ID and the public site address (origin). They live only in
`_data/company.yml`; pages render them, never type them. The Impressum is canonical.
_Avoid_: company info, imprint data.

**Legal document**
An app's privacy policy or terms of use, at a URL registered with the app stores. Built
from the shared legal wording in `_includes/legal/` plus the app's own sections and
App facts (docs/adr/0002). The German `datenschutz.html` and `impressum.html` are not
legal documents in this sense; they cover the company and the website.

**App facts**
What an app's legal documents say that differs between apps: name, minimum age,
whether it has accounts or processes personal data, whether it is free, its website
path and the documents' effective dates. One file per app, `_data/apps/<app>.yml`.
