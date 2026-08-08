# Jellyfin 360° VR Player

A custom 360° video and photo viewer for Jellyfin, injected through a JavaScript Injector plugin, Tampermonkey, or another compatible custom JavaScript method.

The project extends Jellyfin with an interactive spherical viewer powered by [A-Frame](https://aframe.io/), including desktop and mobile controls, automatic `VR360` metadata detection, thumbnail navigation, projection modes, device-motion support, and custom playback controls.

---

## Features

### 360° Video Viewer

- Interactive equirectangular 360° video playback
- Automatic launch for videos tagged `VR360`
- Manual **360°** button for any video
- Desktop mouse drag navigation
- Android/mobile touch navigation
- Pinch-to-zoom support
- Mouse-wheel zoom
- Device-motion / gyroscope support
- Normal and inverted drag direction
- Thumbnail gallery for sibling videos
- Previous / Next video navigation
- Autoplay next video
- YouTube-style autoplay toggle
- Autoplay enabled by default on first use
- Playback speed control:
  - `0.5x`
  - `0.75x`
  - `1x`
  - `1.25x`
  - `1.5x`
  - `1.75x`
  - `2x`
  - `2.5x`
  - `3x`
  - `3.5x`
  - `4x`
- Seek bar and current time display
- Skip backward / forward
- Volume and mute controls
- Repeat controls
- Auto-hiding playback controls
- Projection modes:
  - **Normal**
  - **Mirror Ball**
  - **Little Planet**
- Single close button that exits the custom player and returns directly to the parent Jellyfin library/folder
- Persistent user preferences through `localStorage`

### 360° Photo Viewer

A separate 360° photo viewer is provided in:

```text
jellyfin-photo360.js
```

Features include:

- Automatic launch for photos tagged `VR360`
- Manual **360°** photo viewer button
- Interactive equirectangular photo viewing
- Desktop mouse drag
- Android/mobile touch controls
- Pinch and mouse-wheel zoom
- Device-motion / gyroscope support
- Normal and inverted drag direction
- Thumbnail gallery
- Previous / Next photo navigation
- Desktop hover-to-open gallery
- Tap-to-open gallery on mobile
- Optional pinned gallery
- Projection modes:
  - **Normal**
  - **Mirror Ball**
  - **Little Planet**
- Single close button that exits both the custom 360° viewer and Jellyfin's native slideshow, returning directly to the library view

---

## Requirements

- Jellyfin **10.11+**
- A modern desktop or mobile browser
- JavaScript injection support
- Internet access for the external A-Frame and Material Icons resources used by the viewer

For device-motion / gyroscope support, the browser must expose the device orientation APIs.

> [!IMPORTANT]
> Device-motion APIs normally require a **secure HTTPS context**.
>
> If Jellyfin is opened over plain HTTP on a LAN IP address, the browser may block motion sensors even though touch and mouse navigation still work.

On some Android browsers, A-Frame may also fail to initialize mobile motion tracking while **Desktop site** mode is enabled. If the viewer displays:

```text
A-Frame could not initialize mobile motion tracking.
Disable desktop-site mode in the browser and reopen the player.
```

disable Desktop site mode and reopen the viewer.

---

## Installation

### 1. Install a JavaScript Injector

Install a Jellyfin JavaScript Injector plugin or use another compatible injection method such as Tampermonkey.

One commonly used Jellyfin plugin repository is:

```text
https://raw.githubusercontent.com/n00bcodr/jellyfin-plugins/main/10.11/manifest.json
```

In Jellyfin:

```text
Dashboard
→ Plugins
→ Repositories
```

Add the repository, install the JavaScript Injector plugin, and restart Jellyfin if required.

### 2. Install the 360° Video Viewer

Copy the contents of:

```text
jellyfin-vr.js
```

into the JavaScript Injector and save it.

### 3. Install the 360° Photo Viewer

If you also want 360° photo support, add the contents of:

```text
jellyfin-photo360.js
```

as a separate injected script.

Keeping the photo and video viewers separate makes them easier to maintain and update independently.

### 4. Refresh Jellyfin

Perform a hard refresh after changing the injected scripts:

```text
Ctrl + F5
```

---

## Marking Media as 360°

The viewers use the Jellyfin metadata tag:

```text
VR360
```

as the authoritative indicator that an item should automatically open in the 360° viewer.

To add it:

```text
Item
→ Edit Metadata
→ Tags
→ VR360
→ Save
```

### Video behavior

When Auto VR is enabled:

```text
Play video
→ Jellyfin detects VR360
→ 360° video viewer opens automatically
```

Videos without the `VR360` tag can still be opened manually using the **360°** button.

The left-side video gallery can include sibling videos from the same Jellyfin folder even when those sibling items are not individually tagged `VR360`.

### Photo behavior

When Auto 360 is enabled:

```text
Open photo
→ Jellyfin detects VR360
→ 360° photo viewer opens automatically
```

Photos without the tag remain in Jellyfin's standard image viewer unless opened manually.

---

## Video Controls

The 360° video player includes Jellyfin-style playback controls.

### Mouse / Touch

| Action | Control |
|---|---|
| Look around | Drag |
| Zoom | Mouse wheel / pinch |
| Previous video | Left navigation button |
| Next video | Right navigation button |
| Open video gallery | Hover/tap left edge |
| Choose projection | Projection menu |
| Device motion | Motion button |
| Autoplay | Autoplay toggle |

### Keyboard Shortcuts

| Key | Action |
|---|---|
| `Space` | Play / Pause |
| `←` | Seek backward |
| `→` | Seek forward |
| `Shift + ←` | Previous gallery video |
| `Shift + →` | Next gallery video |
| `M` | Mute / Unmute |
| `I` | Toggle drag direction |
| `G` | Toggle device motion |
| `V` | Open / close projection menu |
| `A` | Toggle autoplay |
| `Esc` | Close viewer and return to Jellyfin library |

---

## Photo Controls

### Mouse / Touch

| Action | Control |
|---|---|
| Look around | Drag |
| Zoom | Mouse wheel / pinch |
| Previous photo | Left navigation button |
| Next photo | Right navigation button |
| Open gallery | Hover/tap left edge |
| Pin gallery | Pin button |
| Choose projection | Projection menu |
| Device motion | Motion button |

### Keyboard Shortcuts

| Key | Action |
|---|---|
| `←` | Previous 360° photo |
| `→` | Next 360° photo |
| `+` / `=` | Zoom in |
| `-` | Zoom out |
| `0` | Reset view |
| `I` | Toggle drag direction |
| `V` | Open / close projection menu |
| `Esc` | Close viewer and return to Jellyfin library |

---

## Projection Modes

Both viewers support multiple ways to visualize equirectangular 360° content.

### Normal

Traditional spherical 360° viewing.

### Mirror Ball

Displays the 360° environment using a reflective-ball style projection.

### Little Planet

Uses a stereographic-style projection to create the familiar "tiny planet" appearance.

The active mode can be selected directly from the projection menu.

---

## Autoplay

The video viewer includes an optional **Autoplay Next** mode.

When enabled:

```text
Current video ends
→ Next video in the left gallery is loaded
→ Playback starts automatically
```

At the end of the gallery, playback stops rather than wrapping back to the first item.

Autoplay defaults to **ON on first use**. After the user changes the toggle, the selected preference is stored in the browser and restored on future sessions.

---

## Gallery Navigation

### Desktop

The thumbnail gallery normally remains collapsed.

Move the mouse to the left edge of the screen to open it. The panel automatically collapses after the pointer leaves unless the panel is pinned.

### Android / Touch Devices

Hover is not used.

Tap the gallery handle to open or close the panel.

This avoids mobile browsers getting stuck in simulated `:hover` states.

---

## Device Motion

Device motion allows the viewer orientation to follow the physical movement of a phone or tablet.

The viewer checks whether A-Frame successfully initialized mobile tracking before enabling the control.

If motion tracking is unavailable, the viewer displays a warning rather than silently enabling a non-functional button.

Device motion may fail when:

- Jellyfin is opened over insecure HTTP
- Browser permissions were denied
- The device has no compatible orientation sensors
- Android browser **Desktop site** mode prevents A-Frame from creating mobile motion controls

Mouse, touch, pinch, zoom, gallery navigation, and projection modes continue to work without device motion.

---

## Dependencies

The viewer loads the following third-party libraries from public CDNs:

- [A-Frame 1.5.0](https://aframe.io/) — MIT License
- [Material Icons](https://fonts.google.com/icons) — Apache License 2.0

These dependencies are not distributed as part of this repository.

---

## Project Files

```text
Jellyfin-360VR-Player/
├── jellyfin-vr.js
├── jellyfin-photo360.js
├── README.md
├── LICENSE
└── Preview/
```

`jellyfin-vr.js`
: 360° video viewer.

`jellyfin-photo360.js`
: 360° photo viewer.

---

## Development

A typical contribution workflow is:

```bash
git clone https://github.com/YOUR_USERNAME/Jellyfin-360VR-Player.git
cd Jellyfin-360VR-Player

git remote add upstream https://github.com/Mix1C/Jellyfin-360VR-Player.git

git fetch upstream
git checkout main
git merge upstream/main

git checkout -b feature/your-feature
```

After making and testing changes:

```bash
git add .
git commit -m "Describe your change"
git push -u origin feature/your-feature
```

Then open a Pull Request against:

```text
Mix1C/Jellyfin-360VR-Player
base: main
```

---

## Testing Recommendations

Before submitting changes, test at minimum:

### Video

- Normal 360° playback
- Mouse drag
- Android touch
- Pinch zoom
- Previous / Next
- Gallery video switching
- Audio and video switching together
- Autoplay
- Playback speeds
- Projection modes
- Device motion
- Close → parent library

### Photo

- Automatic `VR360` detection
- Manual 360° launch
- Gallery navigation
- Previous / Next
- Projection modes
- Mouse/touch controls
- Device-motion warning
- Close → library

---

## License

This repository contains a `LICENSE` file with the GNU General Public License Version 2.

See [`LICENSE`](LICENSE) for the authoritative license terms.

---

## Credits

Original Jellyfin 360° VR Player created by **Mix1C**.

Additional video and photo viewer enhancements were developed as community contributions.
