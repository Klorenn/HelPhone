# AGENTS.md – HelPhone

## What This Repo Is

A **React + Vite application** for HelPhone, a community emergency response web app. Full dev workflow with hot reload support. Single-page landing website with scroll-triggered animations, interactive SVG map, and hero video loop.

## Stack

- **Framework**: React 18
- **Build**: Vite
- **Dev Server**: `npm run dev` → http://localhost:3000
- **Package Manager**: npm
- **Node**: v18+ required

## Quick Start

```bash
npm install      # Install dependencies
npm run dev      # Start local dev server (auto-opens http://localhost:3000)
npm run build    # Compile for production → dist/
npm run preview  # Preview production build
```

## File Organization

### Source Code
- **`src/main.jsx`** – App entry point
- **`src/App.jsx`** – Single component with full page (hero, sections, footer)
- **`src/App.css`** – Animation keyframes (blink, pulse, dash, float)

### Static Assets
- **`assets/hero-nokia.mp4`** – Hero video (loops forward/reverse infinitely)
- **`assets/hero-poster.png`** – Video fallback/poster image
- **`assets/chars/`** – Character illustration PNGs
- **`screens/`** → Original UI screenshots (reference only, not used in build)
- **`uploads/`** → Design artifacts (reference only)

### Config & Metadata
- **`index.html`** – Main HTML entry (imports `/src/main.jsx`)
- **`vite.config.js`** – Vite config (port 3000, auto-open)
- **`package.json`** – Scripts and dependencies

## Development Workflow

### Running Locally
```bash
npm run dev    # Start Vite dev server with hot reload
               # Automatically opens http://localhost:3000
```

Hot reload works instantly when you edit `.jsx` or `.css` files. No build step required.

### Editing Page Content

The entire page lives in `src/App.jsx`. Sections:

1. **Navbar** – Fixed floating nav with anchor links
2. **Hero** – Video background + headline + CTAs
3. **Problem** – Problem statement + 4 scenario cards
4. **How It Works** – 3-step flow with step circles
5. **Live Map** – Animated SVG with responder pins, routes, pulsing rings
6. **Why People Show Up** – 4 value cards
7. **Features** – 4 feature cards with icons
8. **Trust & Safety** – 4 safety systems with icons
9. **Final CTA** – Big headline + join button
10. **Footer** – Links + copyright

### Adding Animations

Keyframes in `src/App.css`:
- `mdblink` – Blinking effect (for live indicator)
- `mdpulse` – Ripple pulse (for responder rings)
- `mddash` – Dashed line animation (for routes)
- `mdfloat` – Floating up/down (for images)

Add animations with `style={{ animation: 'mdblink 1.4s steps(1) infinite' }}`

### Scroll-Triggered Reveals

`RevealDiv` component wraps section content:
```jsx
<RevealDiv index={revealIndex++} style={{ ... }}>
  Content here fades in when scrolled into view
</RevealDiv>
```

Handled by `Intersection Observer` in `useEffect`. Pre-hides content below the fold, unhides on scroll.

### Video Loop Logic

Hero video ref logic in `useEffect`:
- Video plays forward to end
- On `ended` event, reverses frame-by-frame using `requestAnimationFrame`
- Returns to frame 0, plays forward again
- Repeats infinitely

## Design Tokens

Colors and spacing hardcoded in inline styles:
- **Primary teal**: `#234B4E` (headers, primary text)
- **Accent coral**: `#FF7A6B` (CTAs, emergency indicators)
- **Purple**: `#7357FF` (community/responders)
- **Cream bg**: `#ECE0CC` (light sections)
- **Dark bg**: `#1c2c24` or `#234B4E` (dark sections)
- **Teal accent**: `#3F8487` (secondary)
- **Muted button**: `#a2a586` (secondary CTA)

No separate tokens file — all inline in JSX.

## Component Boundaries

- **Single `App` component** – Entire page in one file (40KB JSX)
- **No sub-components** – All sections defined inline with `RevealDiv` helper
- **No routing** – Anchor navigation only (`<a href="#section">`)
- **State management** – Only local `reveals` state for scroll animations
- **Refs** – `videoRef` for video looping

## Important Notes

- **No TypeScript** – Plain JSX (can migrate to `.tsx` later)
- **No tests** – None configured (Jest + React Testing Library can be added)
- **No sub-routing** – Single-page layout with anchor links
- **Video assets** – Must be in `assets/` folder; paths are relative
- **Git not initialized** – Run `git init` if needed
- **Hot reload works on `.jsx` and `.css` edits** – Instant browser refresh

## Gotchas

1. **Asset paths**: Use `assets/hero-nokia.mp4` (relative), not `/assets/...`
2. **Port 3000**: Vite defaults to 3000; if occupied, change in `vite.config.js`
3. **Video poster**: Keep `poster="assets/hero-poster.png"` to prevent poster flickering
4. **Scroll reveal race condition**: Fallback timeout after 4.5s ensures reveals show even if observer fails
5. **SVG animations**: SMIL animations (`<animate>`) work in JSX inline SVG
6. **Video reverse**: Uses `requestAnimationFrame` in a tight loop; disable if performance issues arise

## Future Enhancements

- Convert single `App.jsx` to component hierarchy (Hero.jsx, Problem.jsx, etc.)
- Add TypeScript (`npm install -D typescript`)
- Add testing (Jest + React Testing Library)
- Add linting (ESLint)
- Add form handling for "Request Help" CTA
- Add real-time map with WebSocket
- Add backend API integration
- Add authentication (if responder dashboard needed)
