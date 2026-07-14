# WarmWrite 1.4

A lightweight, mobile-first browser word processor for distraction-free drafting.

## Version 1.4
- Open TXT and simple RTF documents
- Last three recent local documents in the menu
- Rename by tapping the document title
- Session word count
- Formatting bar toggle in Settings (off by default)
- Mobile symbol/formatting dock stays above the keyboard
- Local autosave, save reminder, TXT and RTF export

Important: local documents live in browser storage. Export important work regularly.

## GitHub Pages
Upload all eight files to the repository root and commit to `main`. GitHub Pages will rebuild automatically.

## Licence
MIT

- Improved bold and italic toggling on iPhone/Safari.

- B/I/S inspect the full selected text formatting state before explicitly toggling it.
- Improved iPhone/Safari selection preservation and a single verified retry if Safari ignores the first command.

- Locks the title bar in the app frame.
- Locks the enabled status, symbol and formatting bars together above the keyboard.
- Only the document text scrolls while writing.
- Removes toolbar transition movement during iPhone viewport changes.
