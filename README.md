# Suomi Mestari 1 — iPhone & Mobile PWA Version

A dedicated, offline-first Progressive Web App (PWA) tailored specifically for **iPhone (iOS Safari)** and mobile devices, built alongside the Windows desktop edition.

---

## Key Mobile Features

- **Designed for iPhone**: iOS Safe Area insets (`env(safe-area-inset-top)` for Dynamic Island / notch, bottom home indicator), bottom navigation tab bar, and haptic-feel glassmorphic dark theme.
- **100% Offline Standalone Operation**: Includes the complete *Suomen Mestari 1* textbook vocabulary (Chapters 0–9, 1,494 words, topics, inflected forms, confusing lookalikes, and page numbers) pre-cached via Service Worker. Once loaded, it works on the subway, bus, or airplane without internet.
- **Native Finnish Audio Pronunciation**: Built-in speech synthesis (`SpeechSynthesisUtterance` with `fi-FI` voice) with speed toggle (normal 0.9x or slow 0.75x) on every card and dictionary entry.
- **Active Recall with Quick Finnish Keys**: Virtual keyboard helper keys (`ä`, `ö`, `å`, `š`, `ž`) directly above the input so you never have to wrestle with long-pressing keys on the iOS touch keyboard.
- **Diacritic Inspection**: Friendly hints when you forget vowel harmony or type `a` instead of `ä`, or `o` instead of `ö`.
- **4-Grade Spaced Repetition (SRS)**: Transparent intervals (`Unohdin` 10m, `Vaikea` 1d, `Muistin` 3d, `Helppo` 7d+).
- **12 Topic Practice Packs**: Weather, Family, Home, Food, Routines, Time, Travel, Nature, Health, etc.
- **Full Searchable Dictionary**: Fast search in Finnish or English with filter chips.
- **Sync & Backup**: One-click export/import JSON to sync your study progress between your iPhone and PC!

---

## How to Run & Install on iPhone

### Step 1: Run the Mobile Server on your PC
Make sure your PC and iPhone are connected to the same Wi-Fi network. In PowerShell or terminal:

```powershell
cd C:\Users\salehis1\.gemini\antigravity-ide\scratch\finnish-vocab-pwa
py run_mobile_server.py
```

It will output your local IP address, for example:
```text
  On your iPhone: http://192.168.1.xxx:8080
```

### Step 2: Open and Install on your iPhone
1. Open **Safari** on your iPhone.
2. Type in the address shown in your terminal (e.g. `http://192.168.1.xxx:8080`).
3. Tap the **Share** button at the bottom of Safari (square with an arrow pointing up 📤).
4. Scroll down and tap **Add to Home Screen** (*Lisää Koti-valikkoon*).
5. Tap **Add** in the top right corner.

🎉 **Done!** The app will appear on your iPhone home screen with its custom icon. When launched, it opens in full-screen standalone mode with no browser URL bar!

---

## Optional: Host Online for Free (Zero PC Required)

Because this PWA is 100% client-side with zero backend dependencies, you can host it for free on:
- **GitHub Pages**: Push this folder to a GitHub repository, enable GitHub Pages in Settings.
- **Cloudflare Pages / Vercel**: Drag and drop the `finnish-vocab-pwa` folder onto Cloudflare Pages or Vercel.

You get a permanent `https://your-name.pages.dev` link that you can open and install on your iPhone from anywhere in the world!
