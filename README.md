# HelPhone – Community Emergency Response App

A community-powered emergency help network where neighbours help neighbours. Send a request, appear on the map, let your community respond.

## 🚀 Quick Start

### 1. Install Dependencies
```bash
npm install
```

### 2. Start Development Server
```bash
npm run dev
```

This opens **http://localhost:3000** automatically with hot reload enabled.

### 3. Build for Production
```bash
npm run build
npm run preview  # Preview the production build locally
```

## 📁 Project Structure

```
HelPhone/
├── src/
│   ├── main.jsx              # Entry point
│   ├── App.jsx               # Full landing page with all sections
│   └── App.css               # Animations (blink, pulse, dash, float)
├── assets/
│   ├── hero-nokia.mp4        # Hero video (looping)
│   ├── hero-poster.png       # Video poster
│   └── chars/                # Character illustrations
├── screens/ & uploads/       # Design reference files
├── index.html                # HTML template
├── vite.config.js            # Vite configuration
└── package.json              # Dependencies & scripts

```

## 🎨 Design System

Colors defined inline in JSX:
- **Dark teal**: `#234B4E` (primary)
- **Cream**: `#ECE0CC` (backgrounds)
- **Accent coral**: `#FF7A6B` (emergency/action)
- **Purple**: `#7357FF` (community)
- **Teal**: `#3F8487` (responders)
- **Muted**: `#a2a586` (secondary CTA)

Animations in `src/App.css`:
- `mdblink` – Blinking indicator
- `mdpulse` – Ripple pulse effect
- `mddash` – Animated dashed line
- `mdfloat` – Floating animation

## 🛠️ Available Commands

| Command | Purpose |
|---------|---------|
| `npm run dev` | Start dev server (http://localhost:3000) |
| `npm run build` | Build for production → `dist/` |
| `npm run preview` | Preview production build |

## 📑 Page Sections

1. **Navbar** – Fixed floating navigation with anchors
2. **Hero** – Video background, headline, CTA buttons
3. **Problem** – Problem statement + 4-card grid (Lost, Stranded, Unsafe, Need Assistance)
4. **How It Works** – 3-step process (Send Request → Appear on Map → Receive Help)
5. **Live Community Map** – Animated SVG map with responder pins, routes, animations
6. **Why People Show Up** – 4-card value proposition grid
7. **Features** – 4-feature grid with icons
8. **Trust & Safety** – 4 safety systems (Verification, Moderation, Privacy, Tracking)
9. **Final CTA** – Call-to-action + footer

## ⚡ Special Features

- **Scroll-triggered reveals** – Content fades in/slides up as you scroll
- **Video looping** – Hero video plays, reverses, repeats infinitely
- **Interactive SVG map** – Animated responder pins, pulsing rings, dashed routes
- **Smooth scroll navigation** – Anchor links to sections
- **Responsive grid layouts** – Auto-fit columns, mobile-first

## 🎬 Key Scripts in App.jsx

- `RevealDiv` component – Wraps section content, handles scroll animations
- `useEffect` hook – Sets up Intersection Observer for reveals
- `setupReveals()` – Tracks visibility and applies opacity/transform
- Video ref logic – Implements seamless ping-pong video loop

## 📝 Development Notes

- **No TypeScript yet** – Plain JSX (easy to migrate to `.tsx`)
- **No routing** – Single-page layout with anchor navigation
- **No state management** – Local React hooks only
- **All styles inline** – No separate CSS components
- **SVG embedded** – Animated map is inline SVG with SMIL animations

## 🤝 Contributing

1. Edit `src/App.jsx` for content/layout changes
2. Edit `src/App.css` for new animations
3. Run `npm run dev` to see changes instantly
4. Test in browser at http://localhost:3000

## 📞 Support

Check `AGENTS.md` for technical architecture details and development gotchas.

---

**Built with React 18 + Vite. Made for communities.**
