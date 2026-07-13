# WarmWrite

WarmWrite is a tiny, mobile-first browser word processor designed for distraction-free writing.

## Version 1 features

- Phone-friendly responsive interface
- Live word count
- Browser spell checking
- Bold, italic and strikethrough
- Quick-symbol bar
- Local browser autosave
- Optional warming save reminder
- Selectable save-reminder threshold
- TXT export
- RTF export preserving bold, italic and strikethrough
- TXT import
- Offline support when hosted as a PWA

## Important note about storage

WarmWrite autosaves into the browser's local storage. Browser data can be cleared by the user or operating system. Export important work regularly.

## Try it locally

Because service workers require a web server, the best local test is:

```bash
python3 -m http.server 8000
```

Then visit `http://localhost:8000`.

The editor itself will also open directly from `index.html`, but offline installation will not work from a `file://` address.

## Publish with GitHub Pages

1. Create a new public GitHub repository.
2. Upload all files in this folder to the repository root.
3. Open **Settings → Pages**.
4. Under **Build and deployment**, choose **Deploy from a branch**.
5. Select the `main` branch and `/ (root)` folder.
6. Save. GitHub will provide the website address.

## Customising the app

Most everyday options are already available inside **Settings**.

The default name and colours can be changed in `index.html` and `style.css`.

## Licence

MIT Licence. See `LICENSE`.


## Version 1.1

Mobile formatting, symbol, and status controls now stay docked directly above the on-screen keyboard while typing.
