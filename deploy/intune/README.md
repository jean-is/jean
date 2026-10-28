# Installing Jean with Intune

Jean installs as a web app: Edge or Chrome puts it in the Start menu, the Dock and the app switcher, opens it in a window of its own and keeps it up to date from the address it is served from. Intune installs it on managed computers through the browser's own policy, with nothing to package: the address is the app.

Everything below is set in the Intune admin center, under Devices › Configuration › Create, *Settings catalog*, and assigned to a group of users or devices. Replace `https://jean.corp.example/` with the address Jean is served from, exactly, its last slash included.

## Install it

**Microsoft Edge › Configure list of force-installed Web Apps** (`WebAppInstallForceList`), Windows 10 and later:

```json
[{ "url": "https://jean.corp.example/", "default_launch_container": "window", "create_desktop_shortcut": true }]
```

Edge 80 or later installs it at its next policy refresh, and people can't remove it. Chrome reads the same policy, `WebAppInstallForceList`, with the same value, from its own settings in Intune.

On macOS, use *Templates › Preference file* with the preference domain `com.microsoft.Edge` and [`com.microsoft.Edge.plist`](com.microsoft.Edge.plist), its address replaced. For Chrome, the domain is `com.google.Chrome`, with `CookiesAllowedForUrls` in place of `SaveCookiesOnExit`.

## Keep people's data

Jean keeps each person's tasks and files in the browser, tied to its address. A browser told to clear site data when it closes takes them too.

**Microsoft Edge › Save cookies when Microsoft Edge closes** (`SaveCookiesOnExit`): `https://jean.corp.example`, wherever `ClearBrowsingDataOnExit` is on, or `DefaultCookiesSetting` keeps cookies only for the session. Chrome's is `CookiesAllowedForUrls`.

## Let it work with folders

Sync's mirrored folder, and a project kept in a folder, read and write a folder people choose (the File System Access API). Where `DefaultFileSystemReadGuardSetting` or `DefaultFileSystemWriteGuardSetting` blocks it, list Jean's address in **Microsoft Edge › Allow read access via the File System API on these sites** (`FileSystemReadAskForUrls`) and **…write access…** (`FileSystemWriteAskForUrls`). People are still asked which folder, each time.

## Optional

- **Dictation** asks for the microphone once. `AudioCaptureAllowedUrls` with Jean's address allows it without asking.
- **The camera** asks for itself once. `VideoCaptureAllowedUrls` with Jean's address allows it without asking; `"capabilities": { "deny": ["camera"] }` in `policy.json` takes it away instead.

## Check

On a managed computer, `edge://policy` lists what arrived, and `edge://web-app-internals` the apps installed (`chrome://` in Chrome). Then open Jean's `policy.html` there: it checks the site and its `policy.json` as this browser sees them, behind this computer's proxy.

Jean reads its organisation's policy from the site it is served from (`policy.json`, [enterprise.md](../../docs/enterprise.md)), so nothing else needs pushing to computers.
