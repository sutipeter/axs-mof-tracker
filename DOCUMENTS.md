# AXS document library

The authenticated tracker displays the catalogue from `axs_dashboard.payload.documentLibrary`. Each catalogue item has a stable document ID, linked task IDs, language and an ordered list of versions. Each version records its date, review status, change note and files. Earlier versions are retained; document upload does not alter task completion.

## Storage and access

This repository is public. Only encrypted document bytes are stored under `documents/sealed/`. AES-256-GCM uses a random 96-bit nonce per file and binds the repository-relative path as additional authenticated data. The decryption key and catalogue are stored in the existing member-only Supabase dashboard, never in this repository. The browser verifies both authentication and SHA-256 before offering a download. Signed-out visitors cannot obtain the key from the dashboard API. Authorised users can retain downloaded documents; revoking access cannot retract prior downloads.

Paths include the document ID, version and SHA-256 of the original file. These are immutable. Original Word/PDF files are preserved byte for byte. The technical-environment document has a library version 1.0 because its original file did not include an explicit version number. The Hungarian MFA 1.0 is retained alongside 1.1. Language variants are distinct catalogue entries.

## Adding later versions

Use `tools/publish-document.py` from a clean checkout. Pass the file, --document-id, --version and --note; a new document also needs --title, --language and --task-ids. It prompts for the existing tracker account and password. It creates a new encrypted immutable file and appends its metadata to the existing document's versions. Existing versions must never be replaced. For a revision, provide a numerically newer version and a meaningful change note. New entries require explicit related task IDs.

The script publishes encrypted files first, verifies their public availability, then saves the catalogue through the existing `axs_save` revision check. A conflict stops publication of catalogue changes without overwriting another user's edits. Already uploaded ciphertext is harmless and can be reused on retry. The dashboard history retains catalogue revisions. Store a separate secure backup of the original documents and authenticated dashboard export; GitHub alone cannot restore the decryption key.

Do not commit passwords, tokens, the catalogue key, clear-text documents, dashboard exports or development snapshots. This repository deliberately contains no file deletion or catalogue rollback UI.
