// Jellyfin 360 VR Player — desktop + Android controls, pinch zoom, rotation toggle, device motion, VR360 metadata Auto VR, single-close navigation back to the parent library, projection modes, a sibling video thumbnail gallery, and Previous/Next VR360 navigation
(function () {

  const PLAYER_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>360° VR Video Player</title>
    <!-- a frame vr rendering -->
    <script src="https://aframe.io/releases/1.5.0/aframe.min.js"><\/script>
    <script src="https://cdn.jsdelivr.net/npm/hls.js@1.5.18/dist/hls.min.js"><\/script>
    <link rel="stylesheet" href="https://fonts.googleapis.com/icon?family=Material+Icons">
    <style>
        * { box-sizing: border-box; }
        
        /* Material Icons setup */
        .material-icons {
            font-family: 'Material Icons';
            font-weight: normal;
            font-style: normal;
            font-size: 24px;
            line-height: 1;
            letter-spacing: normal;
            text-transform: none;
            display: inline-block;
            white-space: nowrap;
            word-wrap: normal;
            direction: ltr;
            -webkit-font-smoothing: antialiased;
        }
        
        body { 
            margin: 0; 
            overflow: hidden; 
            font-family: 'Noto Sans', sans-serif; 
            background: #000; 
            color: rgba(255,255,255,0.87);
            touch-action: none;
            overscroll-behavior: none;
            -webkit-user-select: none;
            user-select: none;
        }

        /* Main UI container at bottom */
        #ui {
            position: absolute;
            bottom: 0; 
            left: 0; 
            right: 0;
            z-index: 100;
            background: linear-gradient(to top, rgba(0,0,0,0.9) 50%, transparent 100%);
            color: #fff;
            padding: 8px 16px 20px;
            transition: opacity 0.4s ease;
            opacity: 1;
            pointer-events: auto;
        }
        
        /* Hidden state for UI auto-hide */
        #ui.hidden { 
            opacity: 0; 
            pointer-events: none; 
        }

        /* Video progress bar container */
        .progress-container {
            width: 100%;
            height: 4px;
            background: rgba(255,255,255,0.2);
            border-radius: 2px;
            cursor: pointer;
            position: relative;
            margin-bottom: 10px;
            transition: height 0.15s;
        }
        
        .progress-container:hover { 
            height: 6px; 
        }
        
        /* The blue fill that shows progress */
        .progress-fill {
            height: 100%;
            width: 0%;
            background: #00a4dc;
            border-radius: 2px;
            pointer-events: none;
            position: relative;
        }
        
        /* Little thumb that appears on hover */
        .progress-fill::after {
            content: '';
            position: absolute;
            right: -6px; 
            top: 50%;
            transform: translateY(-50%);
            width: 12px; 
            height: 12px;
            background: #fff;
            border-radius: 50%;
            opacity: 0;
            transition: opacity 0.15s;
        }
        
        .progress-container:hover .progress-fill::after { 
            opacity: 1; 
        }

        /* Row of control buttons */
        .control-row {
            display: flex;
            align-items: center;
            gap: 4px;
        }

        /* Generic button style - matches Jellyfin aesthetic */
        .jf-btn {
            background: transparent;
            border: none;
            color: rgba(255,255,255,0.87);
            cursor: pointer;
            padding: 8px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: background 0.2s, color 0.2s;
            flex-shrink: 0;
        }
        
        .jf-btn:hover { 
            background: rgba(255,255,255,0.15); 
            color: #fff; 
        }

        /* Active state for toggle buttons */
        .jf-btn.toggle-active {
            background: rgba(0,164,220,0.25);
            color: #00a4dc;
        }


        .autoplay-btn {
            width: 54px;
            min-width: 54px;
            height: 32px;
            padding: 0;
            border-radius: 999px;
            position: relative;
            background: rgba(255,255,255,.22);
            border: 1px solid rgba(255,255,255,.18);
            transition:
                background .18s ease,
                border-color .18s ease,
                box-shadow .18s ease;
        }

        .autoplay-btn:hover {
            background: rgba(255,255,255,.30);
        }

        .autoplay-track {
            position: absolute;
            inset: 3px;
            border-radius: 999px;
            pointer-events: none;
        }

        .autoplay-knob {
            position: absolute;
            top: 3px;
            left: 3px;
            width: 24px;
            height: 24px;
            border-radius: 50%;
            background: #f2f2f2;
            display: flex;
            align-items: center;
            justify-content: center;
            color: #181818;
            box-shadow: 0 1px 4px rgba(0,0,0,.45);
            transition:
                left .18s ease,
                background .18s ease,
                color .18s ease,
                transform .18s ease;
            pointer-events: none;
        }

        .autoplay-knob .material-icons {
            font-size: 16px;
        }

        .autoplay-btn.toggle-active {
            background: rgba(0,164,220,.34);
            border-color: rgba(0,164,220,.65);
            color: #00a4dc;
            box-shadow: inset 0 0 0 1px rgba(0,164,220,.12);
        }

        .autoplay-btn.toggle-active .autoplay-knob {
            left: 25px;
            background: #00a4dc;
            color: #fff;
        }

        .autoplay-btn:active .autoplay-knob {
            transform: scale(.94);
        }
        
        .jf-btn .material-icons { 
            font-size: 24px; 
        }
        
        .jf-btn.small .material-icons { 
            font-size: 20px; 
        }

        /* Time display text */
        .time {
            font-size: 13px;
            font-family: 'Noto Sans', sans-serif;
            color: rgba(255,255,255,0.87);
            white-space: nowrap;
            padding: 0 8px;
            flex-shrink: 0;
        }

        /* Volume control wrapper */
        .volume-wrap {
            position: relative;
            display: flex;
            align-items: center;
            flex-shrink: 0;
        }
        
        /* Vertical volume slider popup - shows on hover */
        .volume-popup {
            display: none;
            position: absolute;
            bottom: calc(100% + 8px);
            left: 50%;
            transform: translateX(-50%);
            background: #1c1c1c;
            border: 1px solid rgba(255,255,255,0.1);
            border-radius: 6px;
            padding: 12px 10px;
            align-items: center;
            justify-content: center;
            width: 36px;
            height: 120px;
            box-shadow: 0 4px 20px rgba(0,0,0,0.6);
            z-index: 200;
        }
        
        .volume-wrap:hover .volume-popup,
        .volume-popup:hover { 
            display: flex; 
        }

        .volume-popup.dismissed {
            display: none !important;
        }

        /* The actual slider input */
        .volume-slider-vert {
            writing-mode: vertical-lr;
            direction: rtl;
            appearance: none;
            -webkit-appearance: none;
            width: 4px;
            height: 90px;
            background: rgba(255,255,255,0.2);
            border-radius: 2px;
            outline: none;
            cursor: pointer;
            accent-color: #00a4dc;
        }
        
        /* Webkit slider thumb styling */
        .volume-slider-vert::-webkit-slider-thumb {
            -webkit-appearance: none;
            width: 14px; 
            height: 14px;
            border-radius: 50%;
            background: #fff;
            cursor: pointer;
            box-shadow: 0 0 4px rgba(0,0,0,0.5);
        }
        
        /* Firefox slider thumb */
        .volume-slider-vert::-moz-range-thumb {
            width: 14px; 
            height: 14px;
            border-radius: 50%;
            background: #fff;
            cursor: pointer;
            border: none;
        }

        /* "360°" badge indicator */
        .vr-badge {
            font-size: 11px;
            font-family: 'Noto Sans', sans-serif;
            font-weight: 700;
            letter-spacing: 0.5px;
            color: #00a4dc;
            border: 1px solid #00a4dc;
            padding: 2px 7px;
            border-radius: 3px;
            flex-shrink: 0;
        }

        .spacer { flex: 1; }

        /* Settings panel (main menu) */
        .settings-panel {
            display: none;
            position: fixed;
            bottom: 80px;
            right: 16px;
            background: #1c1c1c;
            border: 1px solid rgba(255,255,255,0.1);
            border-radius: 6px;
            min-width: 280px;
            box-shadow: 0 8px 32px rgba(0,0,0,0.7);
            z-index: 9999;
            overflow: hidden;
        }
        
        .settings-panel.open { 
            display: block; 
        }

        /* Individual setting rows */
        .settings-row {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 16px 20px;
            cursor: pointer;
            border-bottom: 1px solid rgba(255,255,255,0.06);
            transition: background 0.15s;
        }
        
        .settings-row:last-child { 
            border-bottom: none; 
        }
        
        .settings-row:hover { 
            background: rgba(255,255,255,0.07); 
        }

        .settings-label {
            font-family: 'Noto Sans', sans-serif;
            font-size: 14px;
            color: rgba(255,255,255,0.87);
        }
        
        .settings-value {
            font-family: 'Noto Sans', sans-serif;
            font-size: 14px;
            color: rgba(255,255,255,0.5);
        }

        /* Sub-panels for speed/quality/repeat settings */
        .settings-sub {
            display: none;
            position: fixed;
            bottom: 80px;
            right: 16px;
            background: #1c1c1c;
            border: 1px solid rgba(255,255,255,0.1);
            border-radius: 6px;
            min-width: 280px;
            box-shadow: 0 8px 32px rgba(0,0,0,0.7);
            z-index: 9999;
            overflow: hidden;
        }
        
        .settings-sub.open { 
            display: block; 
        }

        /* Header of sub-panel with back arrow */
        .settings-sub-header {
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 14px 20px;
            border-bottom: 1px solid rgba(255,255,255,0.08);
            cursor: pointer;
        }
        
        .settings-sub-header:hover { 
            background: rgba(255,255,255,0.05); 
        }
        
        .settings-sub-header .material-icons { 
            font-size: 18px; 
            color: rgba(255,255,255,0.6); 
        }
        
        .settings-sub-header span.title {
            font-family: 'Noto Sans', sans-serif;
            font-size: 14px;
            color: rgba(255,255,255,0.87);
            font-weight: 600;
        }

        /* Individual options in sub-panels */
        .settings-option {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 14px 20px;
            cursor: pointer;
            border-bottom: 1px solid rgba(255,255,255,0.06);
            transition: background 0.15s;
        }
        
        .settings-option:last-child { 
            border-bottom: none; 
        }
        
        .settings-option:hover { 
            background: rgba(255,255,255,0.07); 
        }
        
        .settings-option.active .opt-label { 
            color: #00a4dc; 
        }
        
        /* Checkmark icon for active option */
        .settings-option .check-icon {
            font-size: 18px;
            color: #00a4dc;
            visibility: hidden;
        }
        
        .settings-option.active .check-icon { 
            visibility: visible; 
        }
        
        .opt-label {
            font-family: 'Noto Sans', sans-serif;
            font-size: 14px;
            color: rgba(255,255,255,0.87);
        }


        /* Projection mode chooser */
        .projection-wrap {
            position: relative;
            display: flex;
            align-items: center;
            flex-shrink: 0;
        }

        .projection-btn {
            width: auto;
            min-width: 116px;
            height: 38px;
            padding: 0 11px;
            border-radius: 999px;
            gap: 6px;
            background: rgba(255,255,255,0.08);
            font-size: 12px;
            font-family: 'Noto Sans', sans-serif;
            font-weight: 600;
            white-space: nowrap;
        }

        .projection-btn .material-icons {
            font-size: 18px;
        }

        #projectionCaret {
            margin-left: -2px;
            opacity: .8;
        }

        .projection-menu {
            position: absolute;
            left: 50%;
            bottom: calc(100% + 10px);
            transform: translateX(-50%);
            min-width: 172px;
            padding: 6px;
            background: rgba(28,28,28,.97);
            border: 1px solid rgba(255,255,255,.12);
            border-radius: 10px;
            box-shadow: 0 10px 30px rgba(0,0,0,.5);
            z-index: 10001;
        }

        .projection-menu[hidden] {
            display: none !important;
        }

        .projection-option {
            width: 100%;
            min-height: 38px;
            height: auto;
            padding: 8px 10px;
            border-radius: 8px;
            display: flex;
            align-items: center;
            justify-content: flex-start;
            gap: 8px;
            color: rgba(255,255,255,.9);
            font-size: 12px;
            font-family: 'Noto Sans', sans-serif;
            font-weight: 600;
            background: transparent;
        }

        .projection-option:hover {
            background: rgba(255,255,255,.09);
        }

        .projection-option.active {
            background: rgba(0,164,220,.18);
            color: #00a4dc;
        }

        .projection-check {
            font-size: 18px !important;
            visibility: hidden;
        }

        .projection-option.active .projection-check {
            visibility: visible;
        }

        #projectionCanvas {
            position: absolute;
            inset: 0;
            width: 100%;
            height: 100%;
            z-index: 5;
            display: none;
            pointer-events: none;
            background: #000;
        }

        #projectionToast {
            position: fixed;
            left: 50%;
            bottom: 92px;
            transform: translateX(-50%);
            z-index: 10002;
            display: none;
            padding: 7px 12px;
            border-radius: 6px;
            background: rgba(0,0,0,.70);
            color: rgba(255,255,255,.92);
            font-size: 12px;
            pointer-events: none;
        }


        /* Left-side VR360 video gallery */
        :root {
            --video-gallery-width: 224px;
            --video-gallery-toggle-width: 28px;
            --video-gallery-hot-zone: 18px;

            /* Kept in sync with the real playback-control height by JavaScript. */
            --video-controls-reserved-space: 80px;
        }

        #videoGalleryPanel {
            position: fixed;
            left: 0;
            top: 64px;
            bottom: var(--video-controls-reserved-space);
            width: var(--video-gallery-width);
            z-index: 10003;
            background: rgba(18,18,18,.95);
            border-right: 1px solid rgba(255,255,255,.12);
            box-shadow: 4px 0 18px rgba(0,0,0,.35);
            transform: translateX(0);
            transition: transform .22s ease;
            pointer-events: auto;
            backdrop-filter: blur(5px);
        }

        #videoGalleryPanel.closed {
            transform: translateX(-100%);
        }

        #videoGalleryHeader {
            height: 42px;
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 6px;
            padding: 0 7px 0 12px;
            border-bottom: 1px solid rgba(255,255,255,.09);
            font-size: 13px;
            font-weight: 600;
            color: rgba(255,255,255,.92);
        }

        #videoGalleryTitle {
            min-width: 0;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }

        #videoGalleryCount {
            font-size: 11px;
            font-weight: 400;
            color: rgba(255,255,255,.55);
            margin-left: 5px;
        }

        #videoGalleryPin {
            width: 34px;
            height: 34px;
            min-width: 34px;
            border-radius: 50%;
            color: rgba(255,255,255,.62);
        }

        #videoGalleryPin .material-icons {
            font-size: 19px;
        }

        #videoGalleryPin.active {
            background: rgba(0,164,220,.24);
            color: #00a4dc;
        }

        #videoGalleryList {
            position: absolute;
            top: 42px;
            left: 0;
            right: 0;
            bottom: 0;
            overflow-y: auto;
            overflow-x: hidden;
            padding: 6px 6px 10px;
            touch-action: pan-y;
            overscroll-behavior: contain;
            scrollbar-width: thin;
        }

        #videoGalleryStatus {
            padding: 18px 10px;
            text-align: center;
            font-size: 12px;
            color: rgba(255,255,255,.58);
            line-height: 1.45;
        }

        .videoGalleryItem {
            display: block;
            width: 100%;
            height: auto;
            padding: 3px;
            margin: 0 0 6px;
            border-radius: 4px;
            background: transparent;
            border: 2px solid transparent;
            cursor: pointer;
            text-align: left;
            color: #fff;
            position: relative;
        }

        .videoGalleryItem:hover {
            background: rgba(255,255,255,.08);
        }

        .videoGalleryItem.active {
            border-color: #00a4dc;
            background: rgba(0,164,220,.14);
        }

        .videoGalleryThumb {
            display: block;
            width: 100%;
            aspect-ratio: 16 / 9;
            object-fit: cover;
            background: #242424;
            border-radius: 2px;
            pointer-events: none;
        }

        .videoGalleryName {
            display: block;
            padding: 5px 3px 2px;
            font-size: 11px;
            line-height: 1.25;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            color: rgba(255,255,255,.86);
            pointer-events: none;
        }

        .videoGalleryIndex {
            position: absolute;
            top: 7px;
            left: 7px;
            background: rgba(0,0,0,.62);
            border-radius: 3px;
            padding: 2px 5px;
            font-size: 10px;
            color: #fff;
            pointer-events: none;
        }

        #videoGalleryHotZone {
            position: fixed;
            left: 0;
            top: 64px;
            bottom: var(--video-controls-reserved-space);
            width: var(--video-gallery-hot-zone);
            z-index: 10002;
            display: none;
            pointer-events: auto;
            background: transparent;
        }

        body.video-gallery-hover #videoGalleryHotZone {
            display: block;
        }

        body.video-gallery-open #videoGalleryHotZone {
            pointer-events: none;
        }

        #videoGalleryToggle {
            position: fixed;
            left: var(--video-gallery-width);
            top: 50%;
            transform: translateY(-50%);
            z-index: 10004;
            width: var(--video-gallery-toggle-width);
            height: 58px;
            border-radius: 0 6px 6px 0;
            background: rgba(18,18,18,.84);
            box-shadow: 2px 0 8px rgba(0,0,0,.28);
            transition: left .22s ease;
        }

        body.video-gallery-closed #videoGalleryToggle {
            left: 0;
        }

        #videoGalleryBusy {
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%,-50%);
            z-index: 10010;
            padding: 9px 13px;
            border-radius: 6px;
            background: rgba(0,0,0,.72);
            color: #fff;
            font-size: 12px;
            display: none;
            pointer-events: none;
        }

        /* Previous / Next VR360 video buttons */
        .navVideo {
            position: fixed;
            top: 50%;
            transform: translateY(-50%);
            z-index: 10001;
            width: 54px;
            height: 72px;
            border-radius: 7px;
            background: rgba(0,0,0,.30);
            opacity: .82;
            transition: left .22s ease, background .18s ease, opacity .18s ease;
        }

        .navVideo:hover {
            background: rgba(0,0,0,.66);
            opacity: 1;
        }

        body.controls-hidden .navVideo {
            opacity: 0;
            visibility: hidden;
            pointer-events: none;
        }

        .navVideo:disabled {
            opacity: .22;
            cursor: default;
            background: rgba(0,0,0,.24);
        }

        #previousVideo {
            left: calc(var(--video-gallery-toggle-width) + 10px);
        }

        #nextVideo {
            right: 10px;
        }

        body.video-gallery-open #previousVideo {
            left: calc(var(--video-gallery-width) + var(--video-gallery-toggle-width) + 10px);
        }

        /* Keep A-Frame's own VR button hidden; this player has its own controls. */
        .a-enter-vr,
        .a-enter-ar,
        .a-enter-vr-button,
        .a-enter-ar-button,
        .a-enter-vr-modal,
        [class*="enter-vr"],
        [class*="enter-ar"] {
            display: none !important;
            visibility: hidden !important;
            opacity: 0 !important;
            pointer-events: none !important;
        }

        @media (max-width: 700px) {
            :root {
                --video-gallery-width: 142px;
                --video-gallery-hot-zone: 14px;
                --video-controls-reserved-space: 132px;
            }

            #ui {
                padding: 7px 8px calc(8px + env(safe-area-inset-bottom, 0px));
            }

            .control-row {
                flex-wrap: wrap;
                justify-content: center;
                row-gap: 2px;
                column-gap: 3px;
            }

            /* Force a predictable second row after the playback/time group. */
            .control-row .spacer {
                display: block;
                flex: 0 0 100%;
                height: 0;
            }

            .jf-btn {
                min-width: 36px;
                min-height: 36px;
                padding: 6px;
            }

            .jf-btn .material-icons,
            .jf-btn.small .material-icons {
                font-size: 21px;
            }

            .time {
                padding: 0 4px;
                font-size: 12px;
            }

            /* Pinch handles zoom on touch screens; these three buttons consume
               nearly a third of the available phone width. */
            #zoomOutBtn,
            #zoomResetBtn,
            #zoomInBtn,
            #endsAt,
            .vr-badge {
                display: none;
            }

            .autoplay-btn {
                min-width: 50px;
                width: 50px;
                height: 32px;
                min-height: 32px;
            }

            .autoplay-btn.toggle-active .autoplay-knob {
                left: 21px;
            }

            .settings-panel,
            .settings-sub {
                bottom: calc(var(--video-controls-reserved-space) + 8px);
                right: 8px;
                max-width: calc(100vw - 16px);
            }

            .videoGalleryName {
                font-size: 10px;
            }

            #videoGalleryHeader {
                padding-left: 8px;
                font-size: 11px;
            }

            #videoGalleryPin {
                width: 30px;
                height: 30px;
                min-width: 30px;
            }

            .projection-btn {
                min-width: 44px;
                width: 44px;
                padding: 0;
                border-radius: 50%;
            }

            #projectionLabel,
            #projectionCaret {
                display: none;
            }

            .projection-menu {
                min-width: 158px;
                bottom: calc(100% + 8px);
            }
        }

        @media (max-width: 380px) {
            .control-row {
                column-gap: 1px;
            }

            .jf-btn {
                min-width: 34px;
                min-height: 34px;
                padding: 5px;
            }

            .time {
                padding: 0 2px;
                font-size: 11px;
            }

            .autoplay-btn {
                min-width: 46px;
                width: 46px;
            }

            .autoplay-btn.toggle-active .autoplay-knob {
                left: 17px;
            }
        }

        /* Android phones commonly exceed 700px wide in landscape, so width-only
           mobile rules do not apply. Use the short, coarse-pointer viewport as
           the signal and keep the controls in one compact centered row. */
        @media (pointer: coarse) and (orientation: landscape) and (max-height: 600px) {
            :root {
                --video-controls-reserved-space: 68px;
            }

            #ui {
                padding: 5px max(10px, env(safe-area-inset-right, 0px))
                    calc(6px + env(safe-area-inset-bottom, 0px))
                    max(10px, env(safe-area-inset-left, 0px));
            }

            .progress-container {
                margin-bottom: 4px;
            }

            .control-row {
                flex-wrap: nowrap;
                justify-content: center;
                gap: 2px;
            }

            .control-row .spacer {
                display: none;
            }

            .jf-btn {
                min-width: 34px;
                min-height: 34px;
                padding: 5px;
            }

            .jf-btn .material-icons,
            .jf-btn.small .material-icons {
                font-size: 20px;
            }

            #zoomOutBtn,
            #zoomResetBtn,
            #zoomInBtn,
            #endsAt,
            .vr-badge {
                display: none;
            }

            .time {
                padding: 0 3px;
                font-size: 11px;
            }

            .projection-btn {
                min-width: 34px;
                width: 34px;
                height: 34px;
                padding: 0;
                border-radius: 50%;
            }

            #projectionLabel,
            #projectionCaret {
                display: none;
            }

            .autoplay-btn {
                min-width: 46px;
                width: 46px;
                height: 30px;
                min-height: 30px;
            }

            .autoplay-btn.toggle-active .autoplay-knob {
                left: 17px;
            }

            .settings-panel,
            .settings-sub {
                bottom: calc(var(--video-controls-reserved-space) + 6px);
                max-height: calc(100vh - var(--video-controls-reserved-space) - 18px);
                overflow-y: auto;
            }
        }
    <\/style>
<\/head>
<body>
    <div id="videoGalleryHotZone" aria-hidden="true"><\/div>

    <aside id="videoGalleryPanel" class="closed" aria-label="360 video thumbnails">
        <div id="videoGalleryHeader">
            <span id="videoGalleryTitle">360 Videos <span id="videoGalleryCount"><\/span><\/span>
            <button class="jf-btn small" id="videoGalleryPin"
                    title="Pin video gallery" aria-label="Pin video gallery"
                    aria-pressed="false">
                <span class="material-icons">push_pin<\/span>
            <\/button>
        <\/div>
        <div id="videoGalleryList">
            <div id="videoGalleryStatus">Loading 360 videos…<\/div>
        <\/div>
    <\/aside>

    <button class="jf-btn" id="videoGalleryToggle"
            title="Show 360 video thumbnails"
            aria-label="Toggle 360 video thumbnails">
        <span class="material-icons">chevron_right<\/span>
    <\/button>

    <button class="jf-btn navVideo" id="previousVideo"
            title="Previous 360° video" aria-label="Previous 360 degree video">
        <span class="material-icons">chevron_left<\/span>
    <\/button>

    <button class="jf-btn navVideo" id="nextVideo"
            title="Next 360° video" aria-label="Next 360 degree video">
        <span class="material-icons">chevron_right<\/span>
    <\/button>

    <div id="videoGalleryBusy">Loading 360 video…<\/div>

    <!-- Main control UI -->
    <div id="ui">
        <div class="progress-container" id="seekContainer">
            <div class="progress-fill" id="seekBar"><\/div>
        <\/div>

        <div class="control-row">
            <button class="jf-btn" id="playPauseBtn" title="Play/Pause">
                <span class="material-icons">play_arrow<\/span>
            <\/button>

            <button class="jf-btn small" id="skipBackBtn" title="Rewind 10s">
                <span class="material-icons">replay_10<\/span>
            <\/button>

            <button class="jf-btn small" id="skipFwdBtn" title="Forward 10s">
                <span class="material-icons">forward_10<\/span>
            <\/button>

            <div class="volume-wrap" id="volumeWrap">
                <button class="jf-btn small" id="muteBtn" title="Mute">
                    <span class="material-icons">volume_up<\/span>
                <\/button>
                <div class="volume-popup" id="volumePopup">
                    <input type="range" class="volume-slider-vert" id="volumeSlider" min="0" max="1" step="0.02" value="1">
                <\/div>
            <\/div>

            <span class="time" id="timeDisplay">0:00 / 0:00<\/span>
            <span class="time" id="endsAt"><\/span>

            <div class="spacer"><\/div>

            <button class="jf-btn small" id="zoomOutBtn" title="Zoom Out">
                <span class="material-icons">zoom_out<\/span>
            <\/button>

            <button class="jf-btn small" id="zoomResetBtn" title="Reset Zoom">
                <span class="material-icons">center_focus_strong<\/span>
            <\/button>

            <button class="jf-btn small" id="zoomInBtn" title="Zoom In">
                <span class="material-icons">zoom_in<\/span>
            <\/button>

            <div class="projection-wrap" id="projectionWrap">
                <button class="jf-btn small projection-btn" id="projectionBtn"
                        title="Projection: Normal" aria-label="Choose projection mode"
                        aria-haspopup="menu" aria-expanded="false">
                    <span class="material-icons">public<\/span>
                    <span id="projectionLabel">Normal<\/span>
                    <span class="material-icons" id="projectionCaret">arrow_drop_up<\/span>
                <\/button>
                <div class="projection-menu" id="projectionMenu" role="menu"
                     aria-label="Projection modes" hidden>
                    <button class="projection-option active" data-projection="normal"
                            role="menuitemradio" aria-checked="true">
                        <span class="material-icons projection-check">check<\/span>
                        <span>Normal<\/span>
                    <\/button>
                    <button class="projection-option" data-projection="mirror"
                            role="menuitemradio" aria-checked="false">
                        <span class="material-icons projection-check">check<\/span>
                        <span>Mirror Ball<\/span>
                    <\/button>
                    <button class="projection-option" data-projection="planet"
                            role="menuitemradio" aria-checked="false">
                        <span class="material-icons projection-check">check<\/span>
                        <span>Little Planet<\/span>
                    <\/button>
                <\/div>
            <\/div>

            <button class="jf-btn small toggle-active" id="invertDragBtn"
                    title="Rotation: Inverted" aria-label="Toggle inverted rotation" aria-pressed="true">
                <span class="material-icons">swap_horiz<\/span>
            <\/button>

            <button class="jf-btn small" id="motionBtn"
                    title="Device motion: Off" aria-label="Toggle device motion exploration" aria-pressed="false">
                <span class="material-icons">screen_lock_rotation<\/span>
            <\/button>

            <button class="jf-btn small autoplay-btn" id="autoPlayNextBtn"
                    title="Autoplay: Off"
                    aria-label="Toggle autoplay"
                    aria-pressed="false">
                <span class="autoplay-track"><\/span>
                <span class="autoplay-knob">
                    <span class="material-icons">play_arrow<\/span>
                <\/span>
            <\/button>

            <span class="vr-badge">360°<\/span>

            <button class="jf-btn small" id="settingsBtn" title="Settings">
                <span class="material-icons">settings<\/span>
            <\/button>

            <button class="jf-btn" id="fullscreenBtn" title="Fullscreen">
                <span class="material-icons">fullscreen<\/span>
            <\/button>
        <\/div>
    <\/div>

    <!-- Settings main panel -->
    <div class="settings-panel" id="settingsPanel">
        <div class="settings-row" id="setSpeed">
            <span class="settings-label">Playback Speed<\/span>
            <span class="settings-value" id="speedLabel">1x<\/span>
        <\/div>
        <div class="settings-row" id="setQuality">
            <span class="settings-label">Quality<\/span>
            <span class="settings-value" id="qualityLabel">Auto<\/span>
        <\/div>
        <div class="settings-row" id="setRepeat">
            <span class="settings-label">Repeat Mode<\/span>
            <span class="settings-value" id="repeatLabel">None<\/span>
        <\/div>
    <\/div>

    <!-- Speed sub-panel -->
    <div class="settings-sub" id="speedPanel">
        <div class="settings-sub-header" id="speedBack">
            <span class="material-icons">chevron_left<\/span>
            <span class="title">Playback Speed<\/span>
        <\/div>
        <div class="settings-option" data-speed="0.5"><span class="material-icons check-icon">check<\/span><span class="opt-label">0.5x<\/span><\/div>
        <div class="settings-option" data-speed="0.75"><span class="material-icons check-icon">check<\/span><span class="opt-label">0.75x<\/span><\/div>
        <div class="settings-option active" data-speed="1"><span class="material-icons check-icon">check<\/span><span class="opt-label">1x<\/span><\/div>
        <div class="settings-option" data-speed="1.25"><span class="material-icons check-icon">check<\/span><span class="opt-label">1.25x<\/span><\/div>
        <div class="settings-option" data-speed="1.5"><span class="material-icons check-icon">check<\/span><span class="opt-label">1.5x<\/span><\/div>
        <div class="settings-option" data-speed="1.75"><span class="material-icons check-icon">check<\/span><span class="opt-label">1.75x<\/span><\/div>
        <div class="settings-option" data-speed="2"><span class="material-icons check-icon">check<\/span><span class="opt-label">2x<\/span><\/div>
        <div class="settings-option" data-speed="2.5"><span class="material-icons check-icon">check<\/span><span class="opt-label">2.5x<\/span><\/div>
        <div class="settings-option" data-speed="3"><span class="material-icons check-icon">check<\/span><span class="opt-label">3x<\/span><\/div>
        <div class="settings-option" data-speed="3.5"><span class="material-icons check-icon">check<\/span><span class="opt-label">3.5x<\/span><\/div>
        <div class="settings-option" data-speed="4"><span class="material-icons check-icon">check<\/span><span class="opt-label">4.0x<\/span><\/div>
    <\/div>

    <!-- Repeat sub-panel -->
    <div class="settings-sub" id="repeatPanel">
        <div class="settings-sub-header" id="repeatBack">
            <span class="material-icons">chevron_left<\/span>
            <span class="title">Repeat Mode<\/span>
        <\/div>
        <div class="settings-option active" data-repeat="none"><span class="material-icons check-icon">check<\/span><span class="opt-label">None<\/span><\/div>
        <div class="settings-option" data-repeat="one"><span class="material-icons check-icon">check<\/span><span class="opt-label">Repeat One<\/span><\/div>
        <div class="settings-option" data-repeat="all"><span class="material-icons check-icon">check<\/span><span class="opt-label">Repeat All<\/span><\/div>
    <\/div>

    <!-- Quality sub-panel -->
    <div class="settings-sub" id="qualityPanel">
        <div class="settings-sub-header" id="qualityBack">
            <span class="material-icons">chevron_left<\/span>
            <span class="title">Quality<\/span>
        <\/div>
        <div class="settings-option active" data-bitrate="0"><span class="material-icons check-icon">check<\/span><span class="opt-label">Auto<\/span><\/div>
        <div class="settings-option" data-bitrate="120000000"><span class="material-icons check-icon">check<\/span><span class="opt-label">Max<\/span><\/div>
        <div class="settings-option" data-bitrate="15000000"><span class="material-icons check-icon">check<\/span><span class="opt-label">15 Mbps<\/span><\/div>
        <div class="settings-option" data-bitrate="8000000"><span class="material-icons check-icon">check<\/span><span class="opt-label">8 Mbps<\/span><\/div>
        <div class="settings-option" data-bitrate="6000000"><span class="material-icons check-icon">check<\/span><span class="opt-label">6 Mbps<\/span><\/div>
        <div class="settings-option" data-bitrate="4000000"><span class="material-icons check-icon">check<\/span><span class="opt-label">4 Mbps<\/span><\/div>
        <div class="settings-option" data-bitrate="3000000"><span class="material-icons check-icon">check<\/span><span class="opt-label">3 Mbps<\/span><\/div>
        <div class="settings-option" data-bitrate="1500000"><span class="material-icons check-icon">check<\/span><span class="opt-label">1.5 Mbps<\/span><\/div>
        <div class="settings-option" data-bitrate="720000"><span class="material-icons check-icon">check<\/span><span class="opt-label">720 kbps<\/span><\/div>
        <div class="settings-option" data-bitrate="420000"><span class="material-icons check-icon">check<\/span><span class="opt-label">420 kbps<\/span><\/div>
    <\/div>

    <!-- 360 rendering / view -->
    <a-scene vr-mode-ui="enabled: false" background="color: #000000">
        <a-assets id="assets"><\/a-assets>
        <a-entity id="videosphere"
                  geometry="primitive: sphere; radius: 5000;"
                  material="shader: flat; side: back;"
                  rotation="0 180 0">
        <\/a-entity>
        <a-camera id="camera"
                  position="0 1.6 0"
                  look-controls="enabled: true; mouseEnabled: false; touchEnabled: false; magicWindowTrackingEnabled: false"
                  wasd-controls-enabled="false">
        <\/a-camera>
    <\/a-scene>
    <canvas id="projectionCanvas" aria-hidden="true"><\/canvas>
    <div id="projectionToast"><\/div>

    <script>
        // ui elements
        const ui            = document.getElementById('ui');
        const playPauseBtn  = document.getElementById('playPauseBtn');
        const playIcon      = playPauseBtn.querySelector('.material-icons');
        const skipBackBtn   = document.getElementById('skipBackBtn');
        const skipFwdBtn    = document.getElementById('skipFwdBtn');
        const muteBtn       = document.getElementById('muteBtn');
        const muteIcon      = muteBtn.querySelector('.material-icons');
        const volumeWrap    = document.getElementById('volumeWrap');
        const volumePopup   = document.getElementById('volumePopup');
        const seekContainer = document.getElementById('seekContainer');
        const seekBar       = document.getElementById('seekBar');
        const timeDisplay   = document.getElementById('timeDisplay');
        const endsAt        = document.getElementById('endsAt');
        const volumeSlider  = document.getElementById('volumeSlider');
        const fullscreenBtn = document.getElementById('fullscreenBtn');
        const fsIcon        = fullscreenBtn.querySelector('.material-icons');
        const videosphere   = document.getElementById('videosphere');
        const cameraEl      = document.getElementById('camera');
        const zoomInBtn     = document.getElementById('zoomInBtn');
        const zoomOutBtn    = document.getElementById('zoomOutBtn');
        const zoomResetBtn  = document.getElementById('zoomResetBtn');
        const invertDragBtn = document.getElementById('invertDragBtn');
        const motionBtn     = document.getElementById('motionBtn');
        const motionIcon    = motionBtn.querySelector('.material-icons');
        const autoPlayNextBtn = document.getElementById('autoPlayNextBtn');
        const projectionWrap    = document.getElementById('projectionWrap');
        const projectionBtn     = document.getElementById('projectionBtn');
        const projectionLabel   = document.getElementById('projectionLabel');
        const projectionMenu    = document.getElementById('projectionMenu');
        const projectionOptions = Array.from(document.querySelectorAll('.projection-option'));
        const projectionCanvas  = document.getElementById('projectionCanvas');
        const projectionToast   = document.getElementById('projectionToast');
        const videoGalleryPanel = document.getElementById('videoGalleryPanel');
        const videoGalleryList  = document.getElementById('videoGalleryList');
        const videoGalleryCount = document.getElementById('videoGalleryCount');
        const videoGalleryToggle = document.getElementById('videoGalleryToggle');
        const videoGalleryToggleIcon = videoGalleryToggle.querySelector('.material-icons');
        const videoGalleryHotZone = document.getElementById('videoGalleryHotZone');
        const videoGalleryPin = document.getElementById('videoGalleryPin');
        const videoGalleryBusy = document.getElementById('videoGalleryBusy');
        const previousVideo = document.getElementById('previousVideo');
        const nextVideo = document.getElementById('nextVideo');

        // Keep the thumbnail gallery physically above the playback-control bar.
        // Measure the real UI height instead of relying on a fixed desktop/mobile
        // value, because the control row can be taller on narrow screens.
        const VIDEO_GALLERY_CONTROL_GAP = 6;

        function syncVideoGalleryControlClearance() {
            if (!ui) return;

            const uiHeight = Math.ceil(ui.getBoundingClientRect().height);
            const reservedSpace = Math.max(
                0,
                uiHeight + VIDEO_GALLERY_CONTROL_GAP
            );

            document.documentElement.style.setProperty(
                '--video-controls-reserved-space',
                reservedSpace + 'px'
            );
        }

        // Run after the initial layout and whenever the control bar changes size.
        requestAnimationFrame(syncVideoGalleryControlClearance);
        window.addEventListener('resize', syncVideoGalleryControlClearance);

        if (typeof ResizeObserver !== 'undefined') {
            const videoGalleryUiResizeObserver =
                new ResizeObserver(syncVideoGalleryControlClearance);
            videoGalleryUiResizeObserver.observe(ui);
        }

        let videoElement = null;
        let hlsPlayer    = null;
        let hideTimer    = null;
        let muted        = false;

        const PLAYBACK_SPEED_STORAGE_KEY = 'jellyfin-vr-playback-speed-v1';
        const REPEAT_MODE_STORAGE_KEY = 'jellyfin-vr-repeat-mode-v1';
        const VOLUME_STORAGE_KEY = 'jellyfin-vr-volume-v1';
        const MUTED_STORAGE_KEY = 'jellyfin-vr-muted-v1';
        const ZOOM_STORAGE_KEY = 'jellyfin-vr-zoom-fov-v1';
        const ROTATION_STORAGE_KEY = 'jellyfin-vr-inverted-drag-v1';
        const MOTION_STORAGE_KEY = 'jellyfin-vr-device-motion-v1';
        const FULLSCREEN_STORAGE_KEY = 'jellyfin-vr-fullscreen-v1';

        function readParentPreference(key, fallback) {
            try {
                return parent.localStorage.getItem(key) ?? fallback;
            } catch (_) {
                return fallback;
            }
        }

        function saveParentPreference(key, value) {
            try {
                parent.localStorage.setItem(key, String(value));
            } catch (_) {}
        }

        let savedPlaybackSpeed = Number(
            readParentPreference(PLAYBACK_SPEED_STORAGE_KEY, '1')
        );
        if (!Number.isFinite(savedPlaybackSpeed) || savedPlaybackSpeed <= 0) {
            savedPlaybackSpeed = 1;
        }

        let savedRepeatMode = readParentPreference(
            REPEAT_MODE_STORAGE_KEY,
            'none'
        );
        if (!['none', 'one', 'all'].includes(savedRepeatMode)) {
            savedRepeatMode = 'none';
        }

        let savedVolume = Number(readParentPreference(VOLUME_STORAGE_KEY, '1'));
        if (!Number.isFinite(savedVolume)) savedVolume = 1;
        savedVolume = Math.max(0, Math.min(1, savedVolume));
        muted = readParentPreference(MUTED_STORAGE_KEY, 'false') === 'true';
        volumeSlider.value = String(savedVolume);
        muteIcon.textContent = muted
            ? 'volume_off'
            : (savedVolume === 0
                ? 'volume_off'
                : (savedVolume > 0.5 ? 'volume_up' : 'volume_down'));

        // Left video gallery behavior:
        // desktop = hover hot-zone + delayed collapse
        // touch/mobile = explicit tap toggle
        const videoGallerySupportsHover =
            window.matchMedia('(hover: hover) and (pointer: fine)').matches;
        const VIDEO_GALLERY_COLLAPSE_DELAY = 420;
        let videoGalleryOpen = false;
        let videoGalleryPinned = false;
        let videoGalleryCollapseTimer = null;
        let videoGalleryItems = [];
        let currentGalleryVideoItemId = '';

        const AUTO_PLAY_NEXT_STORAGE_KEY = 'jellyfin-vr-autoplay-next-v1';
        let autoPlayNextEnabled =
            readParentPreference(AUTO_PLAY_NEXT_STORAGE_KEY, 'true') === 'true';

        function saveAutoPlayNextPreference() {
            saveParentPreference(
                AUTO_PLAY_NEXT_STORAGE_KEY,
                autoPlayNextEnabled
            );
        }

        function updateAutoPlayNextButton() {
            autoPlayNextBtn.classList.toggle(
                'toggle-active',
                autoPlayNextEnabled
            );
            autoPlayNextBtn.setAttribute(
                'aria-pressed',
                String(autoPlayNextEnabled)
            );
            autoPlayNextBtn.title =
                autoPlayNextEnabled
                    ? 'Autoplay: On'
                    : 'Autoplay: Off';
            autoPlayNextBtn.setAttribute(
                'aria-label',
                autoPlayNextEnabled
                    ? 'Autoplay is on'
                    : 'Autoplay is off'
            );
        }

        autoPlayNextBtn.onclick = (event) => {
            event.stopPropagation();
            autoPlayNextEnabled = !autoPlayNextEnabled;
            saveAutoPlayNextPreference();
            updateAutoPlayNextButton();

            showProjectionToast(
                autoPlayNextEnabled
                    ? 'Autoplay is on'
                    : 'Autoplay is off',
                1500
            );

            showControls();
        };

        updateAutoPlayNextButton();

        document.body.classList.toggle(
            'video-gallery-hover',
            videoGallerySupportsHover
        );

        function cancelVideoGalleryCollapse() {
            if (videoGalleryCollapseTimer) {
                clearTimeout(videoGalleryCollapseTimer);
                videoGalleryCollapseTimer = null;
            }
        }

        function applyVideoGalleryState() {
            videoGalleryPanel.classList.toggle('closed', !videoGalleryOpen);
            document.body.classList.toggle('video-gallery-open', videoGalleryOpen);
            document.body.classList.toggle('video-gallery-closed', !videoGalleryOpen);

            videoGalleryToggleIcon.textContent =
                videoGalleryOpen ? 'chevron_left' : 'chevron_right';

            videoGalleryToggle.title =
                videoGalleryOpen
                    ? 'Hide 360 video thumbnails'
                    : 'Show 360 video thumbnails';

            videoGalleryPin.classList.toggle('active', videoGalleryPinned);
            videoGalleryPin.setAttribute(
                'aria-pressed',
                String(videoGalleryPinned)
            );
            videoGalleryPin.title =
                videoGalleryPinned
                    ? 'Unpin video gallery'
                    : 'Pin video gallery';
        }

        function setVideoGalleryOpen(open) {
            cancelVideoGalleryCollapse();
            videoGalleryOpen = Boolean(open);
            applyVideoGalleryState();
        }

        function scheduleVideoGalleryCollapse() {
            if (
                !videoGallerySupportsHover ||
                videoGalleryPinned ||
                !videoGalleryOpen
            ) {
                return;
            }

            cancelVideoGalleryCollapse();
            videoGalleryCollapseTimer = setTimeout(() => {
                if (!videoGalleryPinned) setVideoGalleryOpen(false);
            }, VIDEO_GALLERY_COLLAPSE_DELAY);
        }

        videoGalleryToggle.onclick = (event) => {
            event.stopPropagation();
            setVideoGalleryOpen(!videoGalleryOpen);
        };

        videoGalleryPin.onclick = (event) => {
            event.stopPropagation();
            videoGalleryPinned = !videoGalleryPinned;
            if (videoGalleryPinned) setVideoGalleryOpen(true);
            applyVideoGalleryState();
        };

        if (videoGallerySupportsHover) {
            videoGalleryHotZone.addEventListener('mouseenter', () => {
                setVideoGalleryOpen(true);
            });

            videoGalleryPanel.addEventListener('mouseenter', () => {
                cancelVideoGalleryCollapse();
            });

            videoGalleryToggle.addEventListener('mouseenter', () => {
                cancelVideoGalleryCollapse();
            });

            videoGalleryPanel.addEventListener('mouseleave', (event) => {
                if (
                    event.relatedTarget === videoGalleryToggle ||
                    videoGalleryToggle.contains(event.relatedTarget)
                ) {
                    return;
                }
                scheduleVideoGalleryCollapse();
            });

            videoGalleryToggle.addEventListener('mouseleave', (event) => {
                if (
                    event.relatedTarget === videoGalleryPanel ||
                    videoGalleryPanel.contains(event.relatedTarget)
                ) {
                    return;
                }
                scheduleVideoGalleryCollapse();
            });
        } else {
            document.addEventListener('pointerdown', (event) => {
                if (
                    videoGalleryOpen &&
                    !videoGalleryPinned &&
                    !videoGalleryPanel.contains(event.target) &&
                    !videoGalleryToggle.contains(event.target)
                ) {
                    setVideoGalleryOpen(false);
                }
            });
        }

        function updateVideoNavigationButtons() {
            const currentIndex = videoGalleryItems.findIndex(
                (item) => String(item.itemId || '') === currentGalleryVideoItemId
            );

            const hasCurrent = currentIndex >= 0;
            previousVideo.disabled =
                !hasCurrent || currentIndex <= 0 || videoGalleryItems.length <= 1;
            nextVideo.disabled =
                !hasCurrent || currentIndex >= videoGalleryItems.length - 1 || videoGalleryItems.length <= 1;

            if (hasCurrent) {
                previousVideo.title = currentIndex > 0
                    ? 'Previous 360° video: ' + (videoGalleryItems[currentIndex - 1]?.title || '')
                    : 'No previous 360° video';
                nextVideo.title = currentIndex < videoGalleryItems.length - 1
                    ? 'Next 360° video: ' + (videoGalleryItems[currentIndex + 1]?.title || '')
                    : 'No next 360° video';
            } else {
                previousVideo.title = 'Previous 360° video';
                nextVideo.title = 'Next 360° video';
            }
        }

        function setActiveGalleryVideo(itemId) {
            currentGalleryVideoItemId = String(itemId || '');

            videoGalleryList
                .querySelectorAll('.videoGalleryItem')
                .forEach((element) => {
                    element.classList.toggle(
                        'active',
                        element.dataset.itemId === currentGalleryVideoItemId
                    );
                });

            const active =
                videoGalleryList.querySelector('.videoGalleryItem.active');

            active?.scrollIntoView?.({
                block: 'nearest',
                behavior: 'smooth'
            });

            updateVideoNavigationButtons();
        }

        function navigateGalleryVideo(step) {
            if (
                !videoGalleryItems.length ||
                videoGalleryBusy.style.display === 'block'
            ) {
                return false;
            }

            const currentIndex = videoGalleryItems.findIndex(
                (item) =>
                    String(item.itemId || '') ===
                    currentGalleryVideoItemId
            );

            if (currentIndex < 0) return false;

            const targetIndex = currentIndex + step;

            if (
                targetIndex < 0 ||
                targetIndex >= videoGalleryItems.length
            ) {
                return false;
            }

            const target = videoGalleryItems[targetIndex];
            if (!target?.itemId) return false;

            parent.postMessage(
                {
                    type: 'JF_VIDEO360_GOTO',
                    itemId: String(target.itemId)
                },
                '*'
            );

            return true;
        }

        previousVideo.onclick = () => navigateGalleryVideo(-1);
        nextVideo.onclick = () => navigateGalleryVideo(1);

        function handleAutoPlayNextEnded() {
            if (!autoPlayNextEnabled || videoElement?.loop) return;

            const advanced = navigateGalleryVideo(1);

            if (!advanced) {
                showProjectionToast(
                    'Auto Play: end of video list',
                    1800
                );
            }
        }

        function renderVideoGallery(items, currentItemId) {
            videoGalleryItems = Array.isArray(items) ? items : [];
            videoGalleryCount.textContent =
                videoGalleryItems.length
                    ? '(' + videoGalleryItems.length + ')'
                    : '';

            videoGalleryList.innerHTML = '';

            if (!videoGalleryItems.length) {
                const status = document.createElement('div');
                status.id = 'videoGalleryStatus';
                status.textContent =
                    'No other videos were found in this folder.';
                videoGalleryList.appendChild(status);
                currentGalleryVideoItemId = String(currentItemId || currentGalleryVideoItemId || '');
                updateVideoNavigationButtons();
                return;
            }

            videoGalleryItems.forEach((item, index) => {
                const button = document.createElement('button');
                button.className = 'videoGalleryItem';
                button.dataset.itemId = String(item.itemId || '');
                button.title = item.title || 'Open 360° video';

                const image = document.createElement('img');
                image.className = 'videoGalleryThumb';
                image.loading = 'lazy';
                image.decoding = 'async';
                image.alt = '';
                if (item.thumbnailUrl) {
                    image.src = item.thumbnailUrl;
                    image.onerror = () => {
                        image.onerror = null;
                        image.src =
                            'data:image/svg+xml;charset=UTF-8,' +
                            encodeURIComponent(
                                '<svg xmlns="http://www.w3.org/2000/svg" width="360" height="203" viewBox="0 0 360 203">' +
                                '<rect width="360" height="203" fill="#242424"/>' +
                                '<circle cx="180" cy="82" r="28" fill="#333"/>' +
                                '<polygon points="172,67 172,97 197,82" fill="#ddd"/>' +
                                '<text x="180" y="134" fill="#00a4dc" font-size="16" font-family="Arial,sans-serif" font-weight="700" text-anchor="middle">360° VIDEO</text>' +
                                '</svg>'
                            );
                    };
                }

                const number = document.createElement('span');
                number.className = 'videoGalleryIndex';
                number.textContent = String(index + 1);

                const name = document.createElement('span');
                name.className = 'videoGalleryName';
                name.textContent =
                    item.title || ('360° video ' + (index + 1));

                button.append(image, number, name);

                button.onclick = () => {
                    if (
                        button.dataset.itemId ===
                        currentGalleryVideoItemId
                    ) {
                        if (
                            !videoGallerySupportsHover &&
                            !videoGalleryPinned
                        ) {
                            setVideoGalleryOpen(false);
                        }
                        return;
                    }

                    parent.postMessage(
                        {
                            type: 'JF_VIDEO360_GOTO',
                            itemId: button.dataset.itemId
                        },
                        '*'
                    );

                    if (
                        !videoGallerySupportsHover &&
                        !videoGalleryPinned
                    ) {
                        setVideoGalleryOpen(false);
                    }
                };

                videoGalleryList.appendChild(button);
            });

            setActiveGalleryVideo(currentItemId);
        }

        // Desktop starts collapsed so the 360 view stays unobstructed.
        // Touch also starts collapsed and uses the explicit tab.
        setVideoGalleryOpen(false);
        applyVideoGalleryState();
        previousVideo.disabled = true;
        nextVideo.disabled = true;

        // Camera zoom uses field of view: lower FOV = zoom in.
        const DEFAULT_FOV = 80;
        const MIN_FOV = 30;
        const MAX_FOV = 100;
        const ZOOM_STEP = 5;
        let currentFov = Number(
            readParentPreference(ZOOM_STORAGE_KEY, String(DEFAULT_FOV))
        );
        if (!Number.isFinite(currentFov)) currentFov = DEFAULT_FOV;
        currentFov = Math.max(MIN_FOV, Math.min(MAX_FOV, currentFov));

        let invertedDragEnabled =
            readParentPreference(ROTATION_STORAGE_KEY, 'true') === 'true';

        // Device-motion exploration is opt-in and must be started from the button.
        let motionEnabled = false;
        let restoreMotionOnInteraction =
            readParentPreference(MOTION_STORAGE_KEY, 'false') === 'true';
        let motionProbeTimer = null;
        let motionProbeHandler = null;

        // Projection mode state.
        const PROJECTION_MODES = [
            { key: 'normal', label: 'Normal', mode: 0 },
            { key: 'mirror', label: 'Mirror Ball', mode: 1 },
            { key: 'planet', label: 'Little Planet', mode: 2 }
        ];
        let projectionModeIndex = 0;
        let projectionMenuOpen = false;

        // Special projection WebGL state. Normal mode always uses the original A-Frame sphere.
        let pgl = null;
        let pProgram = null;
        let pBuffer = null;
        let pTexture = null;
        let pLocations = null;
        let pReady = false;
        let pTextureAllocated = false;
        let pTextureWidth = 0;
        let pTextureHeight = 0;
        let pLastVideoTime = -1;
        let pFrameCanvas = null;
        let pFrameContext = null;
        let normalFrameCanvas = null;
        let normalFrameContext = null;
        let normalTextureSource = null;
        let normalLastVideoTime = -1;
        let projectionToastTimer = null;
        const projectionCameraDirection = new THREE.Vector3();

        function currentProjectionMode() {
            return PROJECTION_MODES[projectionModeIndex] || PROJECTION_MODES[0];
        }

        function updateProjectionButton() {
            const mode = currentProjectionMode();
            projectionLabel.textContent = mode.label;
            projectionBtn.title = 'Projection: ' + mode.label + ' (click to choose)';
            projectionBtn.setAttribute(
                'aria-label',
                'Projection mode: ' + mode.label + '. Click to choose another mode.'
            );

            projectionOptions.forEach((option) => {
                const active = option.dataset.projection === mode.key;
                option.classList.toggle('active', active);
                option.setAttribute('aria-checked', active ? 'true' : 'false');
            });
        }

        function showProjectionToast(message, duration = 1600) {
            projectionToast.textContent = message;
            projectionToast.style.display = 'block';
            clearTimeout(projectionToastTimer);
            projectionToastTimer = setTimeout(() => {
                projectionToast.style.display = 'none';
            }, duration);
        }

        function closeProjectionMenu({ restartHideTimer = true } = {}) {
            projectionMenu.hidden = true;
            projectionMenuOpen = false;
            projectionBtn.setAttribute('aria-expanded', 'false');
            if (restartHideTimer) showControls();
        }

        function openProjectionMenu() {
            closeAll?.();
            projectionMenu.hidden = false;
            projectionMenuOpen = true;
            projectionBtn.setAttribute('aria-expanded', 'true');
            ui.classList.remove('hidden');
            document.body.classList.remove('controls-hidden');
            clearTimeout(hideTimer);
        }

        function toggleProjectionMenu() {
            if (projectionMenuOpen) {
                closeProjectionMenu();
            } else {
                openProjectionMenu();
            }
        }

        function compileProjectionShader(gl, type, source) {
            const shader = gl.createShader(type);
            gl.shaderSource(shader, source);
            gl.compileShader(shader);
            if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
                const message = gl.getShaderInfoLog(shader) || 'Unknown projection shader error';
                gl.deleteShader(shader);
                throw new Error(message);
            }
            return shader;
        }

        function initProjectionGL() {
            if (pReady) return true;

            try {
                pgl =
                    projectionCanvas.getContext('webgl', {
                        alpha: false,
                        antialias: true,
                        preserveDrawingBuffer: false
                    }) ||
                    projectionCanvas.getContext('experimental-webgl', {
                        alpha: false,
                        antialias: true,
                        preserveDrawingBuffer: false
                    });

                if (!pgl) throw new Error('WebGL is unavailable');

                const vs = [
                    'attribute vec2 aPosition;',
                    'varying vec2 vUv;',
                    'void main(){',
                    '  vUv=(aPosition+1.0)*0.5;',
                    '  gl_Position=vec4(aPosition,0.0,1.0);',
                    '}'
                ].join('\\n');

                const fs = [
                    'precision highp float;',
                    'varying vec2 vUv;',
                    'uniform sampler2D uTexture;',
                    'uniform float uAspect;',
                    'uniform float uYaw;',
                    'uniform float uPitch;',
                    'uniform float uZoom;',
                    'uniform float uMode;',
                    'const float PI=3.14159265358979323846;',
                    'mat3 rotY(float a){float s=sin(a),c=cos(a);return mat3(c,0.0,-s,0.0,1.0,0.0,s,0.0,c);}',
                    'mat3 rotX(float a){float s=sin(a),c=cos(a);return mat3(1.0,0.0,0.0,0.0,c,-s,0.0,s,c);}',
                    'vec3 orient(vec3 d){return normalize(rotY(uYaw)*rotX(uPitch)*d);}',
                    'vec2 envUV(vec3 d){',
                    '  d=normalize(d);',
                    '  float lon=atan(d.x,-d.z);',
                    '  float lat=asin(clamp(d.y,-1.0,1.0));',
                    '  float u=fract(0.5-lon/(2.0*PI));',
                    '  float v=clamp(0.5-lat/PI,0.0,1.0);',
                    '  return vec2(u,v);',
                    '}',
                    'void main(){',
                    '  vec2 p=vUv*2.0-1.0;',
                    '  p.x*=uAspect;',
                    '  p/=max(0.35,uZoom);',
                    '  vec3 d;',
                    '  if(uMode<1.5){',
                    '    float r2=dot(p,p);',
                    '    if(r2>1.0){gl_FragColor=vec4(0.0,0.0,0.0,1.0);return;}',
                    '    float z=sqrt(max(0.0,1.0-r2));',
                    '    vec3 n=normalize(vec3(p.x,-p.y,z));',
                    '    vec3 v=vec3(0.0,0.0,1.0);',
                    '    d=normalize(2.0*dot(v,n)*n-v);',
                    '  }else{',
                    '    p*=1.15;',
                    '    float r2=dot(p,p);',
                    '    d=normalize(vec3(2.0*p.x,r2-1.0,-2.0*p.y));',
                    '  }',
                    '  d=orient(d);',
                    '  gl_FragColor=texture2D(uTexture,envUV(d));',
                    '}'
                ].join('\\n');

                const vsh = compileProjectionShader(pgl, pgl.VERTEX_SHADER, vs);
                const fsh = compileProjectionShader(pgl, pgl.FRAGMENT_SHADER, fs);

                pProgram = pgl.createProgram();
                pgl.attachShader(pProgram, vsh);
                pgl.attachShader(pProgram, fsh);
                pgl.linkProgram(pProgram);
                pgl.deleteShader(vsh);
                pgl.deleteShader(fsh);

                if (!pgl.getProgramParameter(pProgram, pgl.LINK_STATUS)) {
                    throw new Error(
                        pgl.getProgramInfoLog(pProgram) ||
                        'Unable to link projection shader'
                    );
                }

                pBuffer = pgl.createBuffer();
                pgl.bindBuffer(pgl.ARRAY_BUFFER, pBuffer);
                pgl.bufferData(
                    pgl.ARRAY_BUFFER,
                    new Float32Array([
                        -1, -1,
                         1, -1,
                        -1,  1,
                        -1,  1,
                         1, -1,
                         1,  1
                    ]),
                    pgl.STATIC_DRAW
                );

                pLocations = {
                    position: pgl.getAttribLocation(pProgram, 'aPosition'),
                    texture: pgl.getUniformLocation(pProgram, 'uTexture'),
                    aspect: pgl.getUniformLocation(pProgram, 'uAspect'),
                    yaw: pgl.getUniformLocation(pProgram, 'uYaw'),
                    pitch: pgl.getUniformLocation(pProgram, 'uPitch'),
                    zoom: pgl.getUniformLocation(pProgram, 'uZoom'),
                    mode: pgl.getUniformLocation(pProgram, 'uMode')
                };

                pTexture = pgl.createTexture();
                pgl.bindTexture(pgl.TEXTURE_2D, pTexture);
                pgl.texParameteri(pgl.TEXTURE_2D, pgl.TEXTURE_WRAP_S, pgl.CLAMP_TO_EDGE);
                pgl.texParameteri(pgl.TEXTURE_2D, pgl.TEXTURE_WRAP_T, pgl.CLAMP_TO_EDGE);
                pgl.texParameteri(pgl.TEXTURE_2D, pgl.TEXTURE_MIN_FILTER, pgl.LINEAR);
                pgl.texParameteri(pgl.TEXTURE_2D, pgl.TEXTURE_MAG_FILTER, pgl.LINEAR);

                pReady = true;
                return true;
            } catch (error) {
                console.error('[Jellyfin VR projection] init failed:', error);
                pReady = false;
                return false;
            }
        }

        function projectionVideoSource() {
            if (
                !videoElement ||
                videoElement.readyState < 2 ||
                !videoElement.videoWidth ||
                !videoElement.videoHeight
            ) {
                return null;
            }

            if (!initProjectionGL()) return null;

            // Cap special projection resolution for performance and mobile GPU limits.
            const maxTextureSize = pgl.getParameter(pgl.MAX_TEXTURE_SIZE) || 4096;
            const coarsePointer = window.matchMedia('(pointer: coarse)').matches;
            const preferredMaxWidth = coarsePointer ? 2048 : 4096;
            const targetMaxWidth = Math.min(maxTextureSize, preferredMaxWidth);

            if (videoElement.videoWidth <= targetMaxWidth) {
                return {
                    source: videoElement,
                    width: videoElement.videoWidth,
                    height: videoElement.videoHeight
                };
            }

            const scale = targetMaxWidth / videoElement.videoWidth;
            const width = Math.max(2, Math.round(videoElement.videoWidth * scale));
            const height = Math.max(2, Math.round(videoElement.videoHeight * scale));

            if (!pFrameCanvas) {
                pFrameCanvas = document.createElement('canvas');
                pFrameContext = pFrameCanvas.getContext('2d', {
                    alpha: false,
                    desynchronized: true
                });
            }

            if (!pFrameContext) return null;

            if (pFrameCanvas.width !== width || pFrameCanvas.height !== height) {
                pFrameCanvas.width = width;
                pFrameCanvas.height = height;
            }

            pFrameContext.drawImage(videoElement, 0, 0, width, height);

            return {
                source: pFrameCanvas,
                width,
                height
            };
        }

        function uploadProjectionVideoFrame() {
            const frame = projectionVideoSource();
            if (!frame || !pgl || !pTexture) return false;

            try {
                pgl.bindTexture(pgl.TEXTURE_2D, pTexture);
                pgl.pixelStorei(pgl.UNPACK_FLIP_Y_WEBGL, false);

                if (
                    !pTextureAllocated ||
                    pTextureWidth !== frame.width ||
                    pTextureHeight !== frame.height
                ) {
                    pgl.texImage2D(
                        pgl.TEXTURE_2D,
                        0,
                        pgl.RGBA,
                        pgl.RGBA,
                        pgl.UNSIGNED_BYTE,
                        frame.source
                    );
                    pTextureAllocated = true;
                    pTextureWidth = frame.width;
                    pTextureHeight = frame.height;
                } else {
                    pgl.texSubImage2D(
                        pgl.TEXTURE_2D,
                        0,
                        0,
                        0,
                        pgl.RGBA,
                        pgl.UNSIGNED_BYTE,
                        frame.source
                    );
                }

                pLastVideoTime = videoElement.currentTime;
                return true;
            } catch (error) {
                console.error('[Jellyfin VR projection] frame upload failed:', error);
                return false;
            }
        }

        function resizeProjectionCanvas() {
            if (projectionCanvas.style.display === 'none') return;

            const dpr = Math.min(window.devicePixelRatio || 1, 2);
            const width = Math.max(
                1,
                Math.round(projectionCanvas.clientWidth * dpr)
            );
            const height = Math.max(
                1,
                Math.round(projectionCanvas.clientHeight * dpr)
            );

            if (
                projectionCanvas.width !== width ||
                projectionCanvas.height !== height
            ) {
                projectionCanvas.width = width;
                projectionCanvas.height = height;
            }
        }

        function restoreNormalProjectionSurface() {
            // Updating only A-Frame's attribute is not enough on some Android
            // Chromium/WebView builds after the overlay WebGL canvas has been
            // displayed. Keep the Three.js object and video texture in sync too.
            videosphere.setAttribute('visible', true);

            const sphereObject = videosphere.object3D;
            if (sphereObject) sphereObject.visible = true;

            try {
                const mesh = videosphere.getObject3D?.('mesh');
                const materials = Array.isArray(mesh?.material)
                    ? mesh.material
                    : [mesh?.material];

                materials.forEach((material) => {
                    if (!material) return;
                    material.visible = true;
                    if (material.map) {
                        // Reaffirm the media element because Android may leave
                        // VideoTexture pointing at a stale decoded frame.
                        if (normalTextureSource) {
                            material.map.image = normalTextureSource;
                        } else if (videoElement) {
                            material.map.image = videoElement;
                        }
                        material.map.needsUpdate = true;
                    }
                    material.needsUpdate = true;
                });

                // A-Frame and the projection canvas use separate WebGL contexts.
                // Reset cached renderer state before the scene draws again.
                videosphere.sceneEl?.renderer?.resetState?.();
            } catch (error) {
                console.debug('[Jellyfin VR] Normal projection restore note:', error);
            }
        }

        function configureNormalProjectionTexture() {
            normalTextureSource = videoElement;
            normalLastVideoTime = -1;

            if (
                !videoElement?.videoWidth ||
                !videoElement?.videoHeight
            ) return;

            try {
                const gl = videosphere.sceneEl?.renderer?.getContext?.();
                const gpuLimit = gl?.getParameter(gl.MAX_TEXTURE_SIZE) || 4096;
                const coarsePointer = window.matchMedia('(pointer: coarse)').matches;
                const safeLimit = Math.min(gpuLimit, coarsePointer ? 2048 : gpuLimit);

                if (
                    videoElement.videoWidth <= safeLimit &&
                    videoElement.videoHeight <= safeLimit
                ) return;

                const scale = Math.min(
                    safeLimit / videoElement.videoWidth,
                    safeLimit / videoElement.videoHeight
                );
                const width = Math.max(2, Math.floor(videoElement.videoWidth * scale));
                const height = Math.max(2, Math.floor(videoElement.videoHeight * scale));

                if (!normalFrameCanvas) {
                    normalFrameCanvas = document.createElement('canvas');
                    normalFrameContext = normalFrameCanvas.getContext('2d', {
                        alpha: false,
                        desynchronized: true
                    });
                }

                if (!normalFrameContext) return;
                normalFrameCanvas.width = width;
                normalFrameCanvas.height = height;
                normalTextureSource = normalFrameCanvas;
            } catch (error) {
                console.debug('[Jellyfin VR] Normal texture sizing note:', error);
            }
        }

        function updateNormalProjectionFrame() {
            if (
                currentProjectionMode().key !== 'normal' ||
                normalTextureSource !== normalFrameCanvas ||
                !normalFrameContext ||
                !videoElement ||
                videoElement.readyState < 2
            ) return;

            if (
                normalLastVideoTime === videoElement.currentTime &&
                !videoElement.seeking
            ) return;

            try {
                normalFrameContext.drawImage(
                    videoElement,
                    0,
                    0,
                    normalFrameCanvas.width,
                    normalFrameCanvas.height
                );
                normalLastVideoTime = videoElement.currentTime;

                const mesh = videosphere.getObject3D?.('mesh');
                const materials = Array.isArray(mesh?.material)
                    ? mesh.material
                    : [mesh?.material];
                materials.forEach((material) => {
                    if (material?.map) material.map.needsUpdate = true;
                });
            } catch (error) {
                console.debug('[Jellyfin VR] Normal frame update note:', error);
            }
        }

        function useNormalProjection(message) {
            projectionModeIndex = 0;
            updateProjectionButton();
            projectionCanvas.style.display = 'none';
            restoreNormalProjectionSurface();

            // On Android the mesh/texture can be attached a frame after the mode
            // selection. Refresh once more after A-Frame has resumed rendering.
            requestAnimationFrame(restoreNormalProjectionSurface);
            if (message) showProjectionToast(message, 2200);
        }

        function applyProjectionMode({ announce = true } = {}) {
            const mode = currentProjectionMode();
            updateProjectionButton();

            if (mode.key === 'normal') {
                useNormalProjection(
                    announce ? 'Projection: Normal' : undefined
                );
                return;
            }

            if (
                !videoElement ||
                videoElement.readyState < 2 ||
                !videoElement.videoWidth
            ) {
                useNormalProjection('Video is not ready yet — using Normal view');
                return;
            }

            if (!initProjectionGL()) {
                useNormalProjection(
                    'This browser could not start the special projection — using Normal view'
                );
                return;
            }

            pTextureAllocated = false;
            pLastVideoTime = -1;

            if (!uploadProjectionVideoFrame()) {
                useNormalProjection(
                    'Unable to use this video for the special projection — using Normal view'
                );
                return;
            }

            videosphere.setAttribute('visible', false);
            projectionCanvas.style.display = 'block';
            if (announce) showProjectionToast('Projection: ' + mode.label);
        }

        function setProjectionByKey(
            key,
            { announce = true, persist = true } = {}
        ) {
            const nextIndex = PROJECTION_MODES.findIndex((mode) => mode.key === key);
            if (nextIndex < 0) return;

            projectionModeIndex = nextIndex;
            closeProjectionMenu({ restartHideTimer: false });
            applyProjectionMode({ announce });
            if (persist) {
                parent.postMessage({
                    type: 'JF_VIDEO360_PROJECTION',
                    projection: currentProjectionMode().key
                }, '*');
            }
            showControls();
        }

        function drawProjectionFrame() {
            updateNormalProjectionFrame();

            if (
                projectionCanvas.style.display === 'none' ||
                !pReady ||
                !pTexture ||
                currentProjectionMode().key === 'normal'
            ) {
                requestAnimationFrame(drawProjectionFrame);
                return;
            }

            try {
                resizeProjectionCanvas();

                // Upload only when the underlying video frame/time has advanced.
                if (
                    videoElement &&
                    videoElement.readyState >= 2 &&
                    (
                        pLastVideoTime !== videoElement.currentTime ||
                        videoElement.seeking
                    )
                ) {
                    if (!uploadProjectionVideoFrame()) {
                        useNormalProjection(
                            'Projection rendering failed — using Normal view'
                        );
                        requestAnimationFrame(drawProjectionFrame);
                        return;
                    }
                }

                pgl.viewport(
                    0,
                    0,
                    projectionCanvas.width,
                    projectionCanvas.height
                );
                pgl.clearColor(0, 0, 0, 1);
                pgl.clear(pgl.COLOR_BUFFER_BIT);
                pgl.useProgram(pProgram);

                pgl.bindBuffer(pgl.ARRAY_BUFFER, pBuffer);
                pgl.enableVertexAttribArray(pLocations.position);
                pgl.vertexAttribPointer(
                    pLocations.position,
                    2,
                    pgl.FLOAT,
                    false,
                    0,
                    0
                );

                pgl.activeTexture(pgl.TEXTURE0);
                pgl.bindTexture(pgl.TEXTURE_2D, pTexture);
                pgl.uniform1i(pLocations.texture, 0);
                pgl.uniform1f(
                    pLocations.aspect,
                    projectionCanvas.width /
                    Math.max(1, projectionCanvas.height)
                );

                // Use the camera's final world direction instead of reading only
                // look-controls' manual yaw/pitch objects. The world direction
                // includes drag direction, device motion and A-Frame transforms,
                // keeping Mirror Ball and Little Planet aligned with Normal mode.
                cameraEl.object3D.updateWorldMatrix?.(true, false);
                cameraEl.object3D.getWorldDirection(projectionCameraDirection);

                const directionLength = projectionCameraDirection.lengthSq();
                let yaw = 0;
                let pitch = 0;

                if (directionLength > 0.000001) {
                    projectionCameraDirection.normalize();
                    yaw = Math.atan2(
                        -projectionCameraDirection.x,
                        -projectionCameraDirection.z
                    );
                    pitch = Math.asin(
                        Math.max(-1, Math.min(1, projectionCameraDirection.y))
                    );
                }

                pgl.uniform1f(pLocations.yaw, yaw || 0);
                pgl.uniform1f(pLocations.pitch, pitch || 0);
                pgl.uniform1f(
                    pLocations.zoom,
                    DEFAULT_FOV / Math.max(MIN_FOV, currentFov)
                );
                pgl.uniform1f(
                    pLocations.mode,
                    currentProjectionMode().mode
                );

                pgl.drawArrays(pgl.TRIANGLES, 0, 6);
            } catch (error) {
                console.error('[Jellyfin VR projection] render failed:', error);
                useNormalProjection(
                    'Projection rendering failed — using Normal view'
                );
            }

            requestAnimationFrame(drawProjectionFrame);
        }

        projectionBtn.onclick = (event) => {
            event.stopPropagation();
            toggleProjectionMenu();
        };

        projectionOptions.forEach((option) => {
            option.onclick = (event) => {
                event.stopPropagation();
                setProjectionByKey(option.dataset.projection);
            };
        });

        document.addEventListener('click', (event) => {
            if (
                projectionMenuOpen &&
                !projectionWrap.contains(event.target)
            ) {
                closeProjectionMenu();
            }
        });

        updateProjectionButton();
        requestAnimationFrame(drawProjectionFrame);

        function updateInvertDragButton() {
            invertDragBtn.classList.toggle('toggle-active', invertedDragEnabled);
            invertDragBtn.setAttribute('aria-pressed', String(invertedDragEnabled));
            invertDragBtn.title = invertedDragEnabled
                ? 'Rotation: Inverted (click for normal)'
                : 'Rotation: Normal (click for inverted)';
        }

        function updateMotionButton() {
            motionBtn.classList.toggle('toggle-active', motionEnabled);
            motionBtn.setAttribute('aria-pressed', String(motionEnabled));
            motionBtn.title = motionEnabled
                ? 'Device motion: On (tap to disable)'
                : 'Device motion: Off (tap to enable)';
            motionIcon.textContent = motionEnabled
                ? 'screen_rotation'
                : 'screen_lock_rotation';
        }

        function clearMotionProbe() {
            if (motionProbeTimer) {
                clearTimeout(motionProbeTimer);
                motionProbeTimer = null;
            }

            if (motionProbeHandler) {
                window.removeEventListener('deviceorientation', motionProbeHandler);
                motionProbeHandler = null;
            }
        }

        function setAFrameMotionTracking(enabled) {
            cameraEl.setAttribute(
                'look-controls',
                'magicWindowTrackingEnabled',
                enabled
            );

            // Apply immediately as well as through the component attribute update.
            const controls =
                cameraEl.components && cameraEl.components['look-controls'];

            if (controls && controls.magicWindowControls) {
                controls.magicWindowControls.enabled = enabled;
            }

            if (!enabled && controls) {
                controls.previousMagicWindowYaw = undefined;
                controls.magicWindowAbsoluteEuler?.set(0, 0, 0);
                controls.magicWindowDeltaEuler?.set(0, 0, 0);
            }
        }

        function startMotionProbe() {
            clearMotionProbe();

            let receivedSensorData = false;

            motionProbeHandler = (event) => {
                if (
                    Number.isFinite(event.alpha) ||
                    Number.isFinite(event.beta) ||
                    Number.isFinite(event.gamma)
                ) {
                    receivedSensorData = true;
                    clearMotionProbe();
                }
            };

            window.addEventListener('deviceorientation', motionProbeHandler);

            motionProbeTimer = setTimeout(() => {
                clearMotionProbe();

                if (motionEnabled && !receivedSensorData) {
                    alert(
                        'Motion control was enabled, but no orientation data arrived. ' +
                        'Use HTTPS, allow motion sensors in the browser, and make sure the phone has a gyroscope.'
                    );
                }
            }, 3000);
        }

        async function enableMotionControl() {
            if (!window.isSecureContext) {
                alert(
                    'Device motion requires a secure HTTPS connection. ' +
                    'Open Jellyfin using an https:// address, then try again.'
                );
                return;
            }

            if (typeof window.DeviceOrientationEvent === 'undefined') {
                alert(
                    'This browser or device does not expose device-orientation sensors.'
                );
                return;
            }

            try {
                // Safari/iOS may require explicit permission. Chromium-based Android
                // browsers usually do not expose these requestPermission methods.
                const permissionRequests = [];

                if (
                    typeof window.DeviceOrientationEvent.requestPermission ===
                    'function'
                ) {
                    permissionRequests.push(
                        window.DeviceOrientationEvent.requestPermission()
                    );
                }

                if (
                    typeof window.DeviceMotionEvent !== 'undefined' &&
                    typeof window.DeviceMotionEvent.requestPermission ===
                    'function'
                ) {
                    permissionRequests.push(
                        window.DeviceMotionEvent.requestPermission()
                    );
                }

                if (permissionRequests.length) {
                    const results = await Promise.all(permissionRequests);

                    if (results.some((result) => result !== 'granted')) {
                        alert('Motion-sensor permission was not granted.');
                        return;
                    }
                }

                const controls =
                    cameraEl.components &&
                    cameraEl.components['look-controls'];

                if (!controls || !controls.magicWindowControls) {
                    alert(
                        'A-Frame could not initialize mobile motion tracking. ' +
                        'Disable desktop-site mode in the browser and reopen the player.'
                    );
                    return;
                }

                motionEnabled = true;
                restoreMotionOnInteraction = false;
                saveParentPreference(MOTION_STORAGE_KEY, true);
                setAFrameMotionTracking(true);
                updateMotionButton();
                startMotionProbe();
                showControls();
            } catch (error) {
                console.error('Unable to enable device motion:', error);
                alert(
                    'Unable to enable device motion: ' +
                    (error?.message || error)
                );
            }
        }

        function disableMotionControl() {
            motionEnabled = false;
            restoreMotionOnInteraction = false;
            saveParentPreference(MOTION_STORAGE_KEY, false);
            clearMotionProbe();
            setAFrameMotionTracking(false);
            updateMotionButton();
            showControls();
        }

        function setZoomFov(newFov) {
            currentFov = Math.max(MIN_FOV, Math.min(MAX_FOV, newFov));
            saveParentPreference(ZOOM_STORAGE_KEY, currentFov);
            cameraEl.setAttribute('camera', 'fov', currentFov);
            zoomResetBtn.title = 'Reset Zoom (' + currentFov + '°)';
            showControls();
        }

        // end time
        function updateEndsAt() {
            if (!videoElement || !videoElement.duration || isNaN(videoElement.duration)) return;
            
            const remaining = (videoElement.duration - videoElement.currentTime) / (videoElement.playbackRate || 1);
            const end = new Date(Date.now() + remaining * 1000);
            const hours = end.getHours();
            const minutes = end.getMinutes().toString().padStart(2,'0');
            const ampm = hours >= 12 ? 'PM' : 'AM';
            const h12 = hours % 12 || 12;
            
            // Formatting the "Ends at" string with some extra spaces for padding
            endsAt.textContent = \`\u00a0\u00a0\u00a0\u00a0Ends at \${h12}:\${minutes} \${ampm}\`;
        }

        // Helper to format seconds into "M:SS"
        function formatTime(seconds) {
            if (isNaN(seconds)) return '0:00';
            const mins = Math.floor(seconds / 60);
            const secs = Math.floor(seconds % 60);
            return \`\${mins}:\${secs.toString().padStart(2,'0')}\`;
        }

        // Update progress bar and time display
        function updateProgress() {
            if (!videoElement) return;
            
            const percentage = (videoElement.currentTime / videoElement.duration) * 100;
            seekBar.style.width = percentage + '%';
            timeDisplay.textContent = \`\${formatTime(videoElement.currentTime)} / \${formatTime(videoElement.duration)}\`;
            updateEndsAt();
        }

        // Seek to specific time in video
        function seekTo(targetTime) {
            if (!videoElement) return;
            videoElement.currentTime = Math.max(0, Math.min(targetTime, videoElement.duration));
            updateProgress();
        }

        // Show controls and auto-hide after 4 seconds
        function showControls() {
            ui.classList.remove('hidden');
            document.body.classList.remove('controls-hidden');
            clearTimeout(hideTimer);
            hideTimer = setTimeout(() => {
                ui.classList.add('hidden');
                document.body.classList.add('controls-hidden');
            }, 4000);
        }

        // Initialize zoom and wire the on-screen controls.
        setZoomFov(currentFov);

        zoomInBtn.onclick = () => setZoomFov(currentFov - ZOOM_STEP);
        zoomOutBtn.onclick = () => setZoomFov(currentFov + ZOOM_STEP);
        zoomResetBtn.onclick = () => setZoomFov(DEFAULT_FOV);

        updateInvertDragButton();
        invertDragBtn.onclick = () => {
            invertedDragEnabled = !invertedDragEnabled;
            saveParentPreference(
                ROTATION_STORAGE_KEY,
                invertedDragEnabled
            );
            updateInvertDragButton();
            showControls();
        };

        updateMotionButton();
        motionBtn.onclick = async () => {
            if (motionEnabled) {
                disableMotionControl();
            } else {
                await enableMotionControl();
            }
        };

        // Sensor permission may require a fresh user gesture. If motion was
        // previously enabled, restore it on the first interaction.
        const restoreMotionPreference = async (event) => {
            if (!restoreMotionOnInteraction || motionEnabled) return;
            if (event.target.closest('#motionBtn')) return;
            restoreMotionOnInteraction = false;
            await enableMotionControl();
        };
        document.addEventListener(
            'pointerdown',
            restoreMotionPreference,
            { capture: true, once: true }
        );

        // Unified desktop and Android controls:
        // - mouse drag rotates the view
        // - one finger rotates the view
        // - two-finger native touch events pinch to zoom (Brave-compatible fallback)
        // - the rotation-direction button switches normal/inverted drag
        // - the motion button adds gyroscope/device-orientation exploration
        function setupViewGestures() {
            const sceneEl = cameraEl.sceneEl;
            const canvas = sceneEl && sceneEl.canvas;
            const controls = cameraEl.components && cameraEl.components['look-controls'];

            if (!canvas || !controls) {
                setTimeout(setupViewGestures, 100);
                return;
            }

            // Avoid installing the handlers twice.
            if (canvas.dataset.viewGesturesReady === 'true') return;
            canvas.dataset.viewGesturesReady = 'true';
            canvas.style.touchAction = 'none';
            canvas.style.overscrollBehavior = 'none';

            const sensitivity = 0.002;
            const halfPi = Math.PI / 2;

            function rotateView(deltaX, deltaY) {
                const dragDirection = invertedDragEnabled ? 1 : -1;
                controls.yawObject.rotation.y += deltaX * sensitivity * dragDirection;
                controls.pitchObject.rotation.x += deltaY * sensitivity * dragDirection;
                controls.pitchObject.rotation.x = Math.max(
                    -halfPi,
                    Math.min(halfPi, controls.pitchObject.rotation.x)
                );
                showControls();
            }

            // Desktop mouse drag. Touch pointers are intentionally ignored here;
            // Android uses native touch events below for more reliable multi-touch.
            let mouseDragging = false;
            let previousMouseX = 0;
            let previousMouseY = 0;

            canvas.addEventListener('pointerdown', (e) => {
                if (e.pointerType !== 'mouse' || e.button !== 0) return;

                // Canvas gestures prevent a normal click from reaching the
                // document, so close settings as soon as the screen is used.
                closeAll();
                mouseDragging = true;
                previousMouseX = e.clientX;
                previousMouseY = e.clientY;
                canvas.setPointerCapture?.(e.pointerId);
                canvas.style.cursor = 'grabbing';
                showControls();
                e.preventDefault();
            });

            canvas.addEventListener('pointermove', (e) => {
                if (e.pointerType !== 'mouse' || !mouseDragging) return;

                const movementX = e.clientX - previousMouseX;
                const movementY = e.clientY - previousMouseY;
                previousMouseX = e.clientX;
                previousMouseY = e.clientY;
                rotateView(movementX, movementY);
                e.preventDefault();
            });

            function endMouseDrag(e) {
                if (e.pointerType !== 'mouse') return;
                mouseDragging = false;
                canvas.releasePointerCapture?.(e.pointerId);
                canvas.style.cursor = '';
            }

            canvas.addEventListener('pointerup', endMouseDrag);
            canvas.addEventListener('pointercancel', endMouseDrag);
            canvas.addEventListener('lostpointercapture', (e) => {
                if (e.pointerType === 'mouse') {
                    mouseDragging = false;
                    canvas.style.cursor = '';
                }
            });

            // Native Android touch fallback. This is more reliable in Brave than
            // depending on two simultaneous PointerEvent objects inside the canvas.
            let touchMode = 'none';
            let previousTouchX = 0;
            let previousTouchY = 0;
            let pinchStartDistance = 0;
            let pinchStartFov = currentFov;

            function touchDistance(touchList) {
                const dx = touchList[0].clientX - touchList[1].clientX;
                const dy = touchList[0].clientY - touchList[1].clientY;
                return Math.max(1, Math.hypot(dx, dy));
            }

            function beginTouchPinch(touchList) {
                touchMode = 'pinch';
                pinchStartDistance = touchDistance(touchList);
                pinchStartFov = currentFov;
            }

            canvas.addEventListener('touchstart', (e) => {
                // preventDefault below suppresses the synthetic click on touch
                // devices; dismiss settings explicitly instead.
                closeAll();
                if (e.touches.length >= 2) {
                    beginTouchPinch(e.touches);
                } else if (e.touches.length === 1) {
                    touchMode = 'rotate';
                    previousTouchX = e.touches[0].clientX;
                    previousTouchY = e.touches[0].clientY;
                }

                showControls();
                e.preventDefault();
            }, { capture: true, passive: false });

            canvas.addEventListener('touchmove', (e) => {
                if (e.touches.length >= 2) {
                    if (touchMode !== 'pinch') beginTouchPinch(e.touches);

                    const distance = touchDistance(e.touches);
                    const scale = distance / pinchStartDistance;

                    // Fingers farther apart: lower FOV = zoom in.
                    // Fingers closer together: higher FOV = zoom out.
                    setZoomFov(pinchStartFov / scale);
                    e.preventDefault();
                    return;
                }

                if (e.touches.length === 1) {
                    const touch = e.touches[0];

                    if (touchMode !== 'rotate') {
                        touchMode = 'rotate';
                        previousTouchX = touch.clientX;
                        previousTouchY = touch.clientY;
                        e.preventDefault();
                        return;
                    }

                    const movementX = touch.clientX - previousTouchX;
                    const movementY = touch.clientY - previousTouchY;
                    previousTouchX = touch.clientX;
                    previousTouchY = touch.clientY;
                    rotateView(movementX, movementY);
                    e.preventDefault();
                }
            }, { capture: true, passive: false });

            canvas.addEventListener('touchend', (e) => {
                if (e.touches.length >= 2) {
                    beginTouchPinch(e.touches);
                } else if (e.touches.length === 1) {
                    touchMode = 'rotate';
                    previousTouchX = e.touches[0].clientX;
                    previousTouchY = e.touches[0].clientY;
                } else {
                    touchMode = 'none';
                    pinchStartDistance = 0;
                }
                e.preventDefault();
            }, { capture: true, passive: false });

            canvas.addEventListener('touchcancel', (e) => {
                touchMode = 'none';
                pinchStartDistance = 0;
                e.preventDefault();
            }, { capture: true, passive: false });
        }

        setupViewGestures();

        // Mouse wheel: wheel up zooms in; wheel down zooms out.
        document.addEventListener('wheel', (e) => {
            // Keep the browser's Ctrl+wheel page zoom available.
            if (e.ctrlKey) return;

            // Avoid hijacking scrolling over the player controls and menus.
            if (e.target.closest('#ui, .settings-panel, .settings-sub, #videoGalleryPanel, #videoGalleryToggle')) return;

            e.preventDefault();
            setZoomFov(currentFov + (e.deltaY < 0 ? -ZOOM_STEP : ZOOM_STEP));
        }, { passive: false });

        // Show controls on mouse movement or touch
        document.addEventListener('mousemove', showControls);
        document.addEventListener('touchstart', showControls);

        // Seek bar click to jump to position
        seekContainer.addEventListener('click', (e) => {
            if (!videoElement || !videoElement.duration) return;
            
            const rect = seekContainer.getBoundingClientRect();
            const clickX = e.clientX - rect.left;
            const newTime = (clickX / rect.width) * videoElement.duration;
            seekTo(newTime);
        });

        // Seek bar drag functionality
        let dragging = false;
        seekContainer.addEventListener('mousedown', () => dragging = true);
        document.addEventListener('mouseup', () => dragging = false);
        
        seekContainer.addEventListener('mousemove', (e) => {
            if (!dragging || !videoElement?.duration) return;
            
            const rect = seekContainer.getBoundingClientRect();
            const mouseX = e.clientX - rect.left;
            const ratio = Math.max(0, Math.min(1, mouseX / rect.width));
            seekTo(ratio * videoElement.duration);
        });

        // Play/Pause button
        playPauseBtn.onclick = () => {
            if (!videoElement) return;
            
            if (videoElement.paused) { 
                videoElement.play(); 
                playIcon.textContent = 'pause'; 
            } else { 
                videoElement.pause(); 
                playIcon.textContent = 'play_arrow'; 
            }
            showControls();
        };

        // Skip backward 10 seconds
        skipBackBtn.onclick = () => {
            const currentTime = videoElement?.currentTime || 0;
            seekTo(currentTime - 10);
        };
        
        // Skip forward 10 seconds
        skipFwdBtn.onclick = () => {
            const currentTime = videoElement?.currentTime || 0;
            seekTo(currentTime + 10);
        };

        // Mute/unmute toggle
        muteBtn.onclick = () => {
            if (!videoElement) return;
            
            muted = !muted;
            videoElement.muted = muted;
            saveParentPreference(MUTED_STORAGE_KEY, muted);
            
            // Update icon based on mute state
            muteIcon.textContent = muted ? 'volume_off' : (videoElement.volume > 0.5 ? 'volume_up' : 'volume_down');
        };

        // Volume slider input handler
        volumeSlider.oninput = () => {
            if (!videoElement) return;
            
            videoElement.volume = volumeSlider.value;
            savedVolume = Number(volumeSlider.value);
            saveParentPreference(VOLUME_STORAGE_KEY, savedVolume);
            if (muted && savedVolume > 0) {
                muted = false;
                videoElement.muted = false;
                saveParentPreference(MUTED_STORAGE_KEY, false);
            }
            
            // Update volume icon based on level
            if (volumeSlider.value == 0) {
                muteIcon.textContent = 'volume_off';
            } else if (volumeSlider.value < 0.5) {
                muteIcon.textContent = 'volume_down';
            } else {
                muteIcon.textContent = 'volume_up';
            }
        };

        let restoreFullscreenOnInteraction =
            readParentPreference(FULLSCREEN_STORAGE_KEY, 'false') === 'true';

        function updateFullscreenPreference() {
            const enabled = Boolean(document.fullscreenElement);
            fsIcon.textContent = enabled ? 'fullscreen_exit' : 'fullscreen';
            saveParentPreference(FULLSCREEN_STORAGE_KEY, enabled);
            parent.postMessage({
                type: 'JF_VIDEO360_FULLSCREEN_STATE',
                fullscreen: enabled
            }, '*');
        }

        // Fullscreen requires a user gesture, so a saved fullscreen state is
        // restored on the first eligible interaction with the player.
        fullscreenBtn.onclick = async () => {
            try {
                if (!document.fullscreenElement) {
                    await document.documentElement.requestFullscreen();
                } else {
                    await document.exitFullscreen();
                }
            } catch (error) {
                console.warn('[Jellyfin VR] Fullscreen request failed:', error);
            }
            updateFullscreenPreference();
        };
        document.addEventListener(
            'fullscreenchange',
            updateFullscreenPreference
        );

        document.addEventListener('pointerdown', (event) => {
            if (
                !restoreFullscreenOnInteraction ||
                document.fullscreenElement ||
                event.target.closest('#fullscreenBtn')
            ) {
                return;
            }

            restoreFullscreenOnInteraction = false;
            document.documentElement.requestFullscreen().catch((error) => {
                console.warn(
                    '[Jellyfin VR] Saved fullscreen could not be restored:',
                    error
                );
            });
        }, { capture: true, once: true });

        // ── Settings panel logic ──
        const settingsBtn   = document.getElementById('settingsBtn');
        const settingsPanel = document.getElementById('settingsPanel');
        const speedPanel    = document.getElementById('speedPanel');
        const repeatPanel   = document.getElementById('repeatPanel');
        const qualityPanel  = document.getElementById('qualityPanel');
        const speedLabel    = document.getElementById('speedLabel');
        const repeatLabel   = document.getElementById('repeatLabel');
        const qualityLabel  = document.getElementById('qualityLabel');

        speedLabel.textContent = savedPlaybackSpeed + 'x';
        document.querySelectorAll('[data-speed]').forEach((option) => {
            option.classList.toggle(
                'active',
                Number(option.dataset.speed) === savedPlaybackSpeed
            );
        });

        const savedRepeatOption = document.querySelector(
            '[data-repeat="' + savedRepeatMode + '"]'
        );
        repeatLabel.textContent =
            savedRepeatOption?.querySelector('.opt-label')?.textContent ||
            'None';
        document.querySelectorAll('[data-repeat]').forEach((option) => {
            option.classList.toggle(
                'active',
                option.dataset.repeat === savedRepeatMode
            );
        });

        // Close all settings panels
        function closeAll() {
            settingsPanel.classList.remove('open');
            speedPanel.classList.remove('open');
            repeatPanel.classList.remove('open');
            qualityPanel.classList.remove('open');
        }

        // Dismiss open control menus before an outside interaction. Capture
        // phase also covers the VR canvas and controls that stop propagation.
        document.addEventListener('pointerdown', (e) => {
            const target = e.target;

            if (!target.closest('#settingsBtn, .settings-panel, .settings-sub')) {
                closeAll();
            }
            if (!projectionWrap.contains(target)) {
                closeProjectionMenu({ restartHideTimer: false });
            }
            volumePopup.classList.toggle('dismissed', !volumeWrap.contains(target));
        }, true);

        // Allow hover to reveal volume again after it was dismissed.
        volumeWrap.addEventListener('pointerenter', () => {
            volumePopup.classList.remove('dismissed');
        });

        // Settings button click handler
        settingsBtn.onclick = (e) => {
            e.stopPropagation();
            closeProjectionMenu({ restartHideTimer: false });
            const isOpen = settingsPanel.classList.contains('open');
            closeAll();
            if (!isOpen) settingsPanel.classList.add('open');
            showControls();
        };

        // Open speed sub-panel
        document.getElementById('setSpeed').onclick = (e) => {
            e.stopPropagation();
            settingsPanel.classList.remove('open');
            speedPanel.classList.add('open');
        };

        // Open repeat sub-panel
        document.getElementById('setRepeat').onclick = (e) => {
            e.stopPropagation();
            settingsPanel.classList.remove('open');
            repeatPanel.classList.add('open');
        };

        // Open quality sub-panel
        document.getElementById('setQuality').onclick = (e) => {
            e.stopPropagation();
            settingsPanel.classList.remove('open');
            qualityPanel.classList.add('open');
        };

        // Back button in speed panel
        document.getElementById('speedBack').onclick = (e) => {
            e.stopPropagation();
            speedPanel.classList.remove('open');
            settingsPanel.classList.add('open');
        };

        // Back button in repeat panel
        document.getElementById('repeatBack').onclick = (e) => {
            e.stopPropagation();
            repeatPanel.classList.remove('open');
            settingsPanel.classList.add('open');
        };

        // Back button in quality panel
        document.getElementById('qualityBack').onclick = (e) => {
            e.stopPropagation();
            qualityPanel.classList.remove('open');
            settingsPanel.classList.add('open');
        };

        // Speed option selection
        document.querySelectorAll('[data-speed]').forEach(opt => {
            opt.addEventListener('click', (e) => {
                e.stopPropagation();
                
                const speed = parseFloat(opt.dataset.speed);
                if (videoElement) videoElement.playbackRate = speed;
                savedPlaybackSpeed = speed;
                saveParentPreference(PLAYBACK_SPEED_STORAGE_KEY, speed);
                
                speedLabel.textContent = speed + 'x';
                
                // Mark this option as active
                document.querySelectorAll('[data-speed]').forEach(o => o.classList.remove('active'));
                opt.classList.add('active');
                
                updateEndsAt();
                closeAll();
                settingsPanel.classList.add('open');
            });
        });

        // Repeat mode selection
        document.querySelectorAll('[data-repeat]').forEach(opt => {
            opt.addEventListener('click', (e) => {
                e.stopPropagation();
                
                const mode = opt.dataset.repeat;
                if (videoElement) videoElement.loop = (mode === 'one');
                savedRepeatMode = mode;
                saveParentPreference(REPEAT_MODE_STORAGE_KEY, mode);
                
                repeatLabel.textContent = opt.querySelector('.opt-label').textContent;
                
                // Mark active
                document.querySelectorAll('[data-repeat]').forEach(o => o.classList.remove('active'));
                opt.classList.add('active');
                
                closeAll();
                settingsPanel.classList.add('open');
            });
        });

        let qualityChangePending = false;

        // Quality/bitrate selection. Jellyfin must negotiate a new playback
        // URL in the authenticated parent page; editing the current URL does
        // not start a new server transcode.
        document.querySelectorAll('[data-bitrate]').forEach(opt => {
            opt.addEventListener('click', (e) => {
                e.stopPropagation();

                if (qualityChangePending || !videoElement) return;
                
                const bitrate = parseInt(opt.dataset.bitrate);
                const label = opt.querySelector('.opt-label').textContent;

                qualityChangePending = true;
                showProjectionToast('Changing quality to ' + label + 'â€¦', 3000);

                parent.postMessage({
                    type: 'JF_VIDEO360_QUALITY',
                    bitrate,
                    label,
                    currentTime: videoElement.currentTime || 0,
                    paused: videoElement.paused
                }, '*');

                closeAll();
            });
        });

        // Click outside to close settings
        document.addEventListener('click', () => closeAll());

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (!videoElement) return;
            
            // Space = play/pause
            if (e.key === ' ') { 
                e.preventDefault(); 
                playPauseBtn.click(); 
            }
            
            // Shift + Arrow = previous/next VR360 video.
            // Arrow alone keeps the existing 5-second seek behavior.
            if (e.key === 'ArrowRight') {
                e.preventDefault();
                if (e.shiftKey) {
                    nextVideo.click();
                } else {
                    seekTo(videoElement.currentTime + 5);
                }
            }
            
            if (e.key === 'ArrowLeft') {
                e.preventDefault();
                if (e.shiftKey) {
                    previousVideo.click();
                } else {
                    seekTo(videoElement.currentTime - 5);
                }
            }
            
            // M = mute toggle
            if (e.key === 'm' || e.key === 'M') {
                muteBtn.click();
            }
            
            // I = toggle inverted/normal rotation
            if (e.key === 'i' || e.key === 'I') {
                invertDragBtn.click();
            }

            // V = open/close projection mode chooser
            if (e.key === 'v' || e.key === 'V') {
                e.preventDefault();
                toggleProjectionMenu();
            }

            // A = toggle Auto Play Next
            if (e.key === 'a' || e.key === 'A') {
                e.preventDefault();
                autoPlayNextBtn.click();
            }

            // G = toggle device-motion exploration
            if (e.key === 'g' || e.key === 'G') {
                motionBtn.click();
            }

            // F = fullscreen toggle
            if (e.key === 'f' || e.key === 'F') {
                fullscreenBtn.click();
            }

            // + or = zooms in
            if (e.key === '+' || e.key === '=') {
                e.preventDefault();
                setZoomFov(currentFov - ZOOM_STEP);
            }

            // - zooms out
            if (e.key === '-' || e.key === '_') {
                e.preventDefault();
                setZoomFov(currentFov + ZOOM_STEP);
            }

            // 0 resets zoom
            if (e.key === '0') {
                e.preventDefault();
                setZoomFov(DEFAULT_FOV);
            }
            
            showControls();
        });

        // Listen for video/gallery messages from the parent Jellyfin page.
        window.addEventListener('message', (e) => {
            const data = e.data || {};

            if (data.type === 'JF_VIDEO360_GALLERY_LOADING') {
                videoGalleryCount.textContent = '';
                videoGalleryList.innerHTML =
                    '<div id="videoGalleryStatus">Loading 360 videos…<\\/div>';
                return;
            }

            if (data.type === 'JF_VIDEO360_GALLERY') {
                renderVideoGallery(
                    data.items,
                    data.currentItemId || currentGalleryVideoItemId
                );
                return;
            }

            if (data.type === 'JF_VIDEO360_GALLERY_BUSY') {
                const busy = Boolean(data.busy);
                videoGalleryBusy.style.display = busy ? 'block' : 'none';
                videoGalleryBusy.textContent =
                    data.message || 'Loading 360 video…';

                if (busy) {
                    previousVideo.disabled = true;
                    nextVideo.disabled = true;
                } else {
                    updateVideoNavigationButtons();
                }
                return;
            }

            if (data.type === 'JF_VIDEO360_QUALITY_ERROR') {
                qualityChangePending = false;
                showProjectionToast(
                    data.message || 'Unable to change video quality',
                    3000
                );
                return;
            }

            const {
                type,
                src,
                currentTime,
                itemId,
                autoplay,
                qualityBitrate,
                qualityLabel: loadedQualityLabel,
                projection: loadedProjection
            } = data;

            if (type !== 'LOAD_VIDEO' || !src) return;

            closeProjectionMenu({ restartHideTimer: false });

            const previousRate =
                videoElement?.playbackRate || savedPlaybackSpeed;

            seekBar.style.width = '0%';
            timeDisplay.textContent = '0:00 / 0:00';
            endsAt.textContent = '';

            // IMPORTANT: create the HTMLVideoElement only once.
            // A-Frame's VideoTexture keeps a reference to this exact DOM object.
            // Replacing/removing it causes the new audio to play while the sphere
            // continues showing frames from the old detached video element.
            if (!videoElement) {
                videoElement = document.createElement('video');
                videoElement.id          = 'my360video';
                videoElement.crossOrigin = 'anonymous';
                videoElement.autoplay    = true;
                videoElement.loop        = false;
                videoElement.playsInline = true;
                videoElement.setAttribute('playsinline', '');
                videoElement.setAttribute('webkit-playsinline', '');
                videoElement.preload     = 'auto';

                document.getElementById('assets').appendChild(videoElement);

                // Bind A-Frame to this persistent video element once.
                videosphere.setAttribute('material', {
                    shader: 'flat',
                    side: 'back',
                    src: '#my360video',
                    repeat: '-1 1'
                });

                // These listeners stay valid because the element is reused.
                videoElement.addEventListener('timeupdate', updateProgress);
                videoElement.addEventListener('durationchange', updateEndsAt);
                videoElement.addEventListener(
                    'ended',
                    handleAutoPlayNextEnded
                );
            } else {
                try { videoElement.pause(); } catch (_) {}
            }

            videoElement.volume = savedVolume;
            videoElement.muted = muted;
            videoElement.playbackRate = previousRate;
            videoElement.loop = savedRepeatMode === 'one';

            if (itemId) {
                setActiveGalleryVideo(itemId);
            }

            if (qualityBitrate !== undefined) {
                qualityChangePending = false;
                qualityLabel.textContent = loadedQualityLabel || 'Auto';
                document.querySelectorAll('[data-bitrate]').forEach((option) => {
                    option.classList.toggle(
                        'active',
                        Number(option.dataset.bitrate) === Number(qualityBitrate)
                    );
                });
            }

            videoElement.onloadedmetadata = () => {
                if (currentTime) {
                    try { videoElement.currentTime = currentTime; } catch (_) {}
                }

                configureNormalProjectionTexture();

                // Explicitly reaffirm the texture source after src changes.
                // This is mostly defensive; reusing the same video element is the
                // key fix, but these flags force Three/A-Frame to refresh immediately.
                try {
                    const mesh = videosphere.getObject3D?.('mesh');
                    const material = mesh?.material;
                    const texture = material?.map;
                    if (texture) {
                        texture.image = normalTextureSource || videoElement;
                        texture.needsUpdate = true;
                    }
                    if (material) material.needsUpdate = true;
                } catch (error) {
                    console.debug('[Jellyfin VR] Texture refresh note:', error);
                }

                updateEndsAt();
                updateProgress();
                showControls();
                videoGalleryBusy.style.display = 'none';

                if (autoplay === false) {
                    videoElement.pause();
                    playIcon.textContent = 'play_arrow';
                } else {
                    playIcon.textContent = 'pause';
                    videoElement.play().catch((error) => {
                        console.warn(
                            '[Jellyfin VR] Selected video could not autoplay:',
                            error
                        );
                    });
                }
            };

            videoElement.onloadeddata = () => {
                // Reapply the saved projection once a decodable frame exists.
                setProjectionByKey(
                    loadedProjection || currentProjectionMode().key,
                    { announce: false, persist: false }
                );

                // Some Chromium/A-Frame combinations keep the last decoded frame
                // until the first frame of the new source is available.
                try {
                    const mesh = videosphere.getObject3D?.('mesh');
                    const texture = mesh?.material?.map;
                    if (texture) {
                        configureNormalProjectionTexture();
                        texture.image = normalTextureSource || videoElement;
                        texture.needsUpdate = true;
                    }
                } catch (_) {}
            };

            videoElement.onerror = () => {
                videoGalleryBusy.style.display = 'none';
                showProjectionToast(
                    'Unable to load the selected video',
                    2500
                );
            };

            // Change only the source on the persistent element. Jellyfin's
            // transcoding URL is HLS; use native HLS where available and
            // hls.js everywhere else without replacing the video element.
            if (hlsPlayer) {
                hlsPlayer.destroy();
                hlsPlayer = null;
            }

            const isHls = /(?:\.m3u8)(?:[?#]|$)/i.test(src);
            const nativeHls = videoElement.canPlayType(
                'application/vnd.apple.mpegurl'
            );

            if (isHls && !nativeHls && window.Hls?.isSupported()) {
                hlsPlayer = new window.Hls({
                    enableWorker: true,
                    backBufferLength: 30
                });
                hlsPlayer.on(window.Hls.Events.ERROR, (_event, data) => {
                    if (!data?.fatal) return;
                    console.error('[Jellyfin VR] Fatal HLS error:', data);
                    qualityChangePending = false;
                    showProjectionToast(
                        'Unable to play the transcoded stream',
                        3000
                    );
                });
                hlsPlayer.loadSource(src);
                hlsPlayer.attachMedia(videoElement);
            } else {
                videoElement.src = src;
                videoElement.load();
            }
        });

        // Remove A-Frame's default VR button (we don't want it)
        const removeAFrameChrome = () => {
            document.querySelectorAll(
                '.a-enter-vr, .a-enter-ar, .a-enter-vr-button, .a-enter-ar-button, .a-enter-vr-modal, [class*="enter-vr"], [class*="enter-ar"]'
            ).forEach((el) => el.remove());
        };
        const aframeRemove = new MutationObserver(removeAFrameChrome);
        aframeRemove.observe(document.body, { childList: true, subtree: true });
        removeAFrameChrome();
        setTimeout(removeAFrameChrome, 250);
        setTimeout(removeAFrameChrome, 1000);
    <\/script>
<\/body>
<\/html>`;

  // ─────────────────────────────────────────────────────────────
  // Jellyfin integration / automatic VR360 metadata detection
  // ─────────────────────────────────────────────────────────────

  const VR360_TAG = 'VR360';
  const AUTO_VR_STORAGE_KEY = 'jellyfin-vr-auto360-enabled-v1';
  const QUALITY_STORAGE_KEY = 'jellyfin-vr-quality-v1';
  const PROJECTION_STORAGE_KEY = 'jellyfin-vr-projection-v1';
  const VALID_PROJECTIONS = new Set(['normal', 'mirror', 'planet']);

  function loadSavedProjection() {
    try {
      const saved = localStorage.getItem(PROJECTION_STORAGE_KEY) || 'normal';
      return VALID_PROJECTIONS.has(saved) ? saved : 'normal';
    } catch (_) {
      return 'normal';
    }
  }

  function saveProjection(projection) {
    if (!VALID_PROJECTIONS.has(projection)) return;
    try {
      localStorage.setItem(PROJECTION_STORAGE_KEY, projection);
    } catch (_) {}
  }

  function loadSavedQuality() {
    try {
      const saved = JSON.parse(localStorage.getItem(QUALITY_STORAGE_KEY) || 'null');
      const bitrate = Number(saved?.bitrate) || 0;
      return {
        bitrate,
        label: String(saved?.label || (bitrate ? bitrate + ' bps' : 'Auto'))
      };
    } catch (_) {
      return { bitrate: 0, label: 'Auto' };
    }
  }

  function saveQuality(quality) {
    try {
      localStorage.setItem(QUALITY_STORAGE_KEY, JSON.stringify(quality));
    } catch (_) {}
  }

  // Auto VR is ON by default. The preference is stored per browser/device.
  let autoVREnabled = (() => {
    try {
      const saved = localStorage.getItem(AUTO_VR_STORAGE_KEY);
      return saved === null ? true : saved === 'true';
    } catch (_) {
      return true;
    }
  })();

  let lastAutoCheckedItemId = null;
  let autoCheckInFlightItemId = null;
  let autoDismissedItemId = null;
  let lastMetadataFailureAt = 0;

  function saveAutoVRPreference() {
    try {
      localStorage.setItem(AUTO_VR_STORAGE_KEY, String(autoVREnabled));
    } catch (_) {
      // Storage may be unavailable in a private/restricted browser context.
    }
  }

  function getNativeJellyfinVideo() {
    // Exclude the video element that lives inside our VR iframe/document.
    return document.querySelector('video');
  }

  // Get current Jellyfin video source and timestamp.
  function getJellyfinStamp() {
    const vid = getNativeJellyfinVideo();
    if (!vid) return null;

    const src = vid.currentSrc || vid.src;
    if (!src) return null;

    return { src, currentTime: vid.currentTime || 0 };
  }

  function normalizeJellyfinItemId(value) {
    if (!value) return null;

    const cleaned = String(value).trim().replace(/[{}]/g, '');
    if (/^[0-9a-f]{32}$/i.test(cleaned)) return cleaned;
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cleaned)) {
      return cleaned.replace(/-/g, '');
    }

    return null;
  }

  function getItemIdFromUrlLike(value) {
    if (!value) return null;

    const raw = String(value);

    // Jellyfin playback URLs normally contain /Videos/{ItemId}/...
    const pathMatch = raw.match(/\/videos\/([0-9a-f-]{32,36})(?:\/|\?|$)/i);
    if (pathMatch) {
      const id = normalizeJellyfinItemId(pathMatch[1]);
      if (id) return id;
    }

    // Also support itemId/id query parameters in video/player routes.
    const queryMatch = raw.match(/(?:[?&#]|^)(?:itemId|id)=([0-9a-f-]{32,36})(?:[&#]|$)/i);
    if (queryMatch) {
      const id = normalizeJellyfinItemId(queryMatch[1]);
      if (id) return id;
    }

    return null;
  }

  function getCurrentJellyfinItemId() {
    const stamp = getJellyfinStamp();

    // 1) Most reliable while playing: the actual media URL.
    const fromVideo = getItemIdFromUrlLike(stamp?.src);
    if (fromVideo) return fromVideo;

    // 2) Fallback: Jellyfin's SPA URL/hash route.
    const fromLocation = getItemIdFromUrlLike(window.location.href) ||
                         getItemIdFromUrlLike(window.location.hash);
    if (fromLocation) return fromLocation;

    return null;
  }

  function getJellyfinApiClient() {
    return window.ApiClient || globalThis.ApiClient || null;
  }

  function getJellyfinUserId(apiClient) {
    try {
      return apiClient?.getCurrentUserId?.() ||
             apiClient?._serverInfo?.UserId ||
             apiClient?._serverInfo?.userId ||
             null;
    } catch (_) {
      return apiClient?._serverInfo?.UserId || null;
    }
  }

  async function fetchItemMetadataDirect(itemId, apiClient) {
    const stamp = getJellyfinStamp();
    const mediaSrc = stamp?.src;

    let mediaUrl = null;
    try {
      if (mediaSrc) mediaUrl = new URL(mediaSrc, window.location.href);
    } catch (_) {}

    const userId = getJellyfinUserId(apiClient);
    const token = (() => {
      try {
        return apiClient?.accessToken?.() ||
               mediaUrl?.searchParams.get('api_key') ||
               mediaUrl?.searchParams.get('apiKey') ||
               null;
      } catch (_) {
        return null;
      }
    })();

    let serverBase = null;
    try {
      serverBase = apiClient?._serverAddress || null;
    } catch (_) {}

    // If ApiClient does not expose the server address, derive the base path
    // from the current media URL, preserving installations under /jellyfin etc.
    if (!serverBase && mediaUrl) {
      const lowerPath = mediaUrl.pathname.toLowerCase();
      const videosIndex = lowerPath.indexOf('/videos/');
      const basePath = videosIndex >= 0 ? mediaUrl.pathname.slice(0, videosIndex) : '';
      serverBase = mediaUrl.origin + basePath;
    }

    serverBase = serverBase || window.location.origin;

    const url = new URL(serverBase.replace(/\/$/, '') + '/Items/' + encodeURIComponent(itemId));
    if (userId) url.searchParams.set('userId', userId);

    const headers = {};
    if (token) headers['X-Emby-Token'] = token;

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers,
      credentials: 'same-origin'
    });

    if (!response.ok) {
      throw new Error('Jellyfin metadata request failed: HTTP ' + response.status);
    }

    return await response.json();
  }

  async function getJellyfinItemMetadata(itemId) {
    const apiClient = getJellyfinApiClient();
    const userId = getJellyfinUserId(apiClient);

    // Preferred path inside Jellyfin Web. This reuses the current authenticated
    // Jellyfin session and works with the server's own API client.
    if (apiClient && typeof apiClient.getItem === 'function' && userId) {
      try {
        return await apiClient.getItem(userId, itemId);
      } catch (error) {
        console.warn('[Jellyfin VR] ApiClient.getItem failed; trying direct API request.', error);
      }
    }

    // Fallback for Web builds where ApiClient is not fully exposed globally.
    return await fetchItemMetadataDirect(itemId, apiClient);
  }


  const vrVideoGalleryMetadataCache = new Map();

  function getJellyfinConnectionContext() {
    const apiClient = getJellyfinApiClient();
    const stamp = getJellyfinStamp();

    let mediaUrl = null;
    try {
      if (stamp?.src) {
        mediaUrl = new URL(stamp.src, window.location.href);
      }
    } catch (_) {}

    const userId = getJellyfinUserId(apiClient);

    const token = (() => {
      try {
        return apiClient?.accessToken?.() ||
               mediaUrl?.searchParams.get('api_key') ||
               mediaUrl?.searchParams.get('apiKey') ||
               null;
      } catch (_) {
        return null;
      }
    })();

    let serverBase = null;

    try {
      serverBase = apiClient?._serverAddress || null;
    } catch (_) {}

    if (!serverBase && mediaUrl && /^https?:$/i.test(mediaUrl.protocol)) {
      const lowerPath = mediaUrl.pathname.toLowerCase();
      const videosIndex = lowerPath.indexOf('/videos/');
      const basePath =
        videosIndex >= 0
          ? mediaUrl.pathname.slice(0, videosIndex)
          : '';
      serverBase = mediaUrl.origin + basePath;
    }

    serverBase = (serverBase || window.location.origin).replace(/\/$/, '');

    return {
      apiClient,
      userId,
      token,
      serverBase,
      mediaUrl
    };
  }

  function authenticatedJellyfinUrl(pathname, params = {}) {
    const { token, serverBase } = getJellyfinConnectionContext();
    const url = new URL(serverBase + pathname);

    for (const [key, value] of Object.entries(params)) {
      if (
        value === undefined ||
        value === null ||
        value === ''
      ) {
        continue;
      }

      const serialized = Array.isArray(value)
        ? value.join('|')
        : String(value);

      url.searchParams.set(key, serialized);
    }

    if (token && !url.searchParams.has('api_key')) {
      url.searchParams.set('api_key', token);
    }

    return url.toString();
  }

  async function jellyfinFetchJson(pathname, params = {}) {
    const {
      token,
      serverBase
    } = getJellyfinConnectionContext();

    const url = new URL(serverBase + pathname);

    for (const [key, value] of Object.entries(params)) {
      if (
        value === undefined ||
        value === null ||
        value === ''
      ) {
        continue;
      }

      const serialized = Array.isArray(value)
        ? value.join('|')
        : String(value);

      url.searchParams.set(key, serialized);
    }

    const headers = {};
    if (token) headers['X-Emby-Token'] = token;

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers,
      credentials: 'same-origin'
    });

    if (!response.ok) {
      throw new Error(
        'Jellyfin request failed (' +
        response.status +
        '): ' +
        pathname
      );
    }

    return await response.json();
  }

  async function jellyfinPostJson(pathname, body, params = {}) {
    const {
      token,
      serverBase
    } = getJellyfinConnectionContext();

    const url = new URL(serverBase + pathname);

    for (const [key, value] of Object.entries(params)) {
      if (value === undefined || value === null || value === '') continue;
      url.searchParams.set(key, String(value));
    }

    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['X-Emby-Token'] = token;

    const response = await fetch(url.toString(), {
      method: 'POST',
      headers,
      credentials: 'same-origin',
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      throw new Error(
        'Jellyfin request failed (' + response.status + '): ' + pathname
      );
    }

    return await response.json();
  }

  async function getCachedVideoMetadata(itemId) {
    if (vrVideoGalleryMetadataCache.has(itemId)) {
      return vrVideoGalleryMetadataCache.get(itemId);
    }

    const item = await getJellyfinItemMetadata(itemId);
    vrVideoGalleryMetadataCache.set(itemId, item);
    return item;
  }

  function videoGalleryPlaceholderUrl(title = '360° Video') {
    const safeTitle = String(title || '360° Video')
      .replace(/[&<>"']/g, (char) => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
      }[char]));

    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" width="360" height="203" viewBox="0 0 360 203">' +
      '<rect width="360" height="203" fill="#242424"/>' +
      '<circle cx="180" cy="88" r="30" fill="#333"/>' +
      '<polygon points="172,72 172,104 198,88" fill="#ddd"/>' +
      '<text x="180" y="135" fill="#00a4dc" font-size="16" font-family="Arial,sans-serif" font-weight="700" text-anchor="middle">360° VIDEO</text>' +
      '<text x="180" y="160" fill="#bbb" font-size="11" font-family="Arial,sans-serif" text-anchor="middle">' +
      safeTitle.slice(0, 36) +
      '</text>' +
      '</svg>';

    return 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svg);
  }

  function videoGalleryThumbnailUrl(item) {
    const itemId = item?.Id || item?.id;
    const title = item?.Name || item?.name || '360° Video';

    if (!itemId) return videoGalleryPlaceholderUrl(title);

    const imageTags =
      item?.ImageTags ||
      item?.imageTags ||
      {};

    const primaryTag =
      imageTags?.Primary ||
      imageTags?.primary ||
      item?.PrimaryImageTag ||
      item?.primaryImageTag ||
      null;

    // Raw/home videos often have no generated Primary image.
    // Do not request /Images/Primary unless Jellyfin explicitly says it exists.
    if (!primaryTag) {
      return videoGalleryPlaceholderUrl(title);
    }

    return authenticatedJellyfinUrl(
      '/Items/' + encodeURIComponent(itemId) + '/Images/Primary',
      {
        maxWidth: 360,
        maxHeight: 203,
        quality: 82,
        tag: primaryTag
      }
    );
  }

  function isVideoLibraryItem(item) {
    const mediaType =
      String(item?.MediaType || item?.mediaType || '')
        .toLowerCase();

    const type =
      String(item?.Type || item?.type || '')
        .toLowerCase();

    return (
      mediaType === 'video' ||
      ['video', 'movie', 'episode', 'musicvideo'].includes(type)
    );
  }

  function parseParentIdFromLocation() {
    const candidates = [];

    try {
      const hash = String(window.location.hash || '');
      const hashQueryIndex = hash.indexOf('?');
      if (hashQueryIndex >= 0) {
        const hashParams = new URLSearchParams(hash.slice(hashQueryIndex + 1));
        candidates.push(
          hashParams.get('parentId'),
          hashParams.get('ParentId')
        );
      }

      const searchParams = new URLSearchParams(window.location.search || '');
      candidates.push(
        searchParams.get('parentId'),
        searchParams.get('ParentId')
      );
    } catch (_) {}

    return candidates
      .map(normalizeJellyfinItemId)
      .find(Boolean) || null;
  }

  function normalizeFsPath(value) {
    return String(value || '')
      .replace(/\//g, '\\')
      .replace(/\\+$/, '')
      .toLowerCase();
  }

  function directoryOfPath(value) {
    const normalized = normalizeFsPath(value);
    const index = normalized.lastIndexOf('\\');
    return index > 0 ? normalized.slice(0, index) : '';
  }

  function naturalVideoSort(a, b) {
    const left = String(
      a?.Path ||
      a?.path ||
      a?.SortName ||
      a?.sortName ||
      a?.Name ||
      a?.name ||
      ''
    );

    const right = String(
      b?.Path ||
      b?.path ||
      b?.SortName ||
      b?.sortName ||
      b?.Name ||
      b?.name ||
      ''
    );

    return left.localeCompare(right, undefined, {
      numeric: true,
      sensitivity: 'base'
    });
  }

  function uniqueItemsById(items) {
    const result = [];
    const seen = new Set();

    for (const item of items || []) {
      const itemId = normalizeJellyfinItemId(
        item?.Id || item?.id
      );

      if (!itemId || seen.has(itemId)) continue;

      seen.add(itemId);
      result.push(item);
    }

    return result;
  }

  async function querySiblingVideoItems(params = {}) {
    const { userId } = getJellyfinConnectionContext();

    // Important: do NOT filter by VR360 here.
    // VR360 is only the Auto-VR trigger. Once the user is already inside
    // the VR viewer, the gallery/navigation should show all video siblings
    // from the same Jellyfin folder/library context.
    const requestParams = {
      Recursive: false,
      Fields: 'Tags,Path,ParentId,SortName,PrimaryImageAspectRatio',
      SortBy: 'SortName',
      SortOrder: 'Ascending',
      EnableImages: true,
      ImageTypeLimit: 1,
      ...params
    };

    const response = userId
      ? await jellyfinFetchJson(
          '/Users/' + encodeURIComponent(userId) + '/Items',
          requestParams
        )
      : await jellyfinFetchJson('/Items', requestParams);

    const items = Array.isArray(response?.Items)
      ? response.Items
      : [];

    return items.filter(isVideoLibraryItem);
  }

  async function resolveCandidateVideoItems(activeItemId, current) {
    const currentParentId = normalizeJellyfinItemId(
      current?.ParentId ||
      current?.parentId
    );

    const locationParentId = parseParentIdFromLocation();

    const parentCandidates = Array.from(
      new Set(
        [currentParentId, locationParentId]
          .filter(Boolean)
      )
    );

    // Strategy 1: direct children of the known folder.
    for (const parentId of parentCandidates) {
      try {
        const direct = await querySiblingVideoItems({
          ParentId: parentId,
          Recursive: false
        });

        if (direct.length > 1) {
          console.debug(
            '[Jellyfin VR Gallery] Using direct folder query:',
            parentId,
            direct.length
          );
          return direct;
        }

        // Some home-video layouts introduce one extra nested folder.
        const recursive = await querySiblingVideoItems({
          ParentId: parentId,
          Recursive: true
        });

        if (recursive.length > 1) {
          console.debug(
            '[Jellyfin VR Gallery] Using recursive folder query:',
            parentId,
            recursive.length
          );
          return recursive;
        }
      } catch (error) {
        console.warn(
          '[Jellyfin VR Gallery] Folder query failed:',
          parentId,
          error
        );
      }
    }

    // Strategy 2: Jellyfin's sibling lookup around the active item.
    try {
      const adjacent = await querySiblingVideoItems({
        AdjacentTo: activeItemId,
        Recursive: false
      });

      if (adjacent.length > 1) {
        console.debug(
          '[Jellyfin VR Gallery] Using AdjacentTo query:',
          adjacent.length
        );
        return adjacent;
      }
    } catch (error) {
      console.warn(
        '[Jellyfin VR Gallery] AdjacentTo query failed:',
        error
      );
    }

    // Strategy 3: query all video items visible to the current user,
    // then prefer items from the same physical directory as the active file.
    try {
      const allVideos = await querySiblingVideoItems({
        Recursive: true
      });

      const currentDirectory = directoryOfPath(
        current?.Path ||
        current?.path
      );

      if (currentDirectory) {
        const sameDirectory = allVideos.filter((item) => {
          return directoryOfPath(
            item?.Path ||
            item?.path
          ) === currentDirectory;
        });

        if (sameDirectory.length > 1) {
          console.debug(
            '[Jellyfin VR Gallery] Using same-path fallback:',
            sameDirectory.length
          );
          return sameDirectory;
        }
      }

      if (allVideos.length > 1) {
        console.debug(
          '[Jellyfin VR Gallery] Using library-wide video fallback:',
          allVideos.length
        );
        return allVideos;
      }
    } catch (error) {
      console.warn(
        '[Jellyfin VR Gallery] Library-wide fallback failed:',
        error
      );
    }

    return [];
  }

  async function getVR360VideosForCurrentFolder(activeItemId) {
    const current = await getCachedVideoMetadata(activeItemId);

    let candidates =
      await resolveCandidateVideoItems(
        activeItemId,
        current
      );

    // Make sure the current item participates even when a Jellyfin query
    // returns only neighboring items.
    candidates = uniqueItemsById([
      ...candidates,
      current
    ]);

    const resolved = [];

    for (const candidate of candidates) {
      const candidateId = normalizeJellyfinItemId(
        candidate?.Id ||
        candidate?.id
      );

      if (!candidateId) continue;

      let item = candidate;

      // Folder queries normally include Tags, but if this server omitted them,
      // retrieve complete metadata only for that candidate.
      if (!Array.isArray(item?.Tags || item?.tags)) {
        try {
          item = await getCachedVideoMetadata(candidateId);
        } catch (error) {
          console.warn(
            '[Jellyfin VR Gallery] Unable to read item metadata:',
            candidateId,
            error
          );
          continue;
        }
      } else {
        vrVideoGalleryMetadataCache.set(candidateId, item);
      }

      if (!isVideoLibraryItem(item)) continue;

      // Do not require VR360 here. The current item may be the only file
      // carrying the metadata tag, while the rest of the sibling videos
      // are still intended to be browsed in this VR session.
      resolved.push(item);
    }

    const sorted = uniqueItemsById(resolved).sort(naturalVideoSort);

    // Always keep the active video in the gallery even if a particular
    // Jellyfin listing endpoint omitted it.
    if (
      isVideoLibraryItem(current) &&
      !sorted.some(
        (item) =>
          normalizeJellyfinItemId(item?.Id || item?.id) ===
          activeItemId
      )
    ) {
      sorted.push(current);
      sorted.sort(naturalVideoSort);
    }

    console.debug(
      '[Jellyfin VR Gallery] Final sibling video count:',
      sorted.length,
      sorted.map((item) => item?.Name || item?.name || item?.Id)
    );

    return sorted.map((item) => {
      const itemId = normalizeJellyfinItemId(
        item?.Id ||
        item?.id
      );

      return {
        itemId,
        title:
          item?.Name ||
          item?.name ||
          itemId ||
          '360° video',
        thumbnailUrl: videoGalleryThumbnailUrl(item)
      };
    });
  }

  async function getGalleryPlaybackUrl(itemId) {
    const item = await getCachedVideoMetadata(itemId);

    const {
      userId,
      token,
      serverBase,
      mediaUrl
    } = getJellyfinConnectionContext();

    const playbackInfo = await jellyfinFetchJson(
      '/Items/' + encodeURIComponent(itemId) + '/PlaybackInfo',
      {
        userId
      }
    );

    const sources =
      playbackInfo?.MediaSources ||
      playbackInfo?.mediaSources ||
      [];

    const source = sources[0] || item?.MediaSources?.[0];

    if (!source) {
      throw new Error(
        'Jellyfin did not return a media source for this video.'
      );
    }

    // If Jellyfin already gives us a transcoding/remux URL, prefer it.
    if (source.TranscodingUrl) {
      const transcode = new URL(source.TranscodingUrl, serverBase + '/');
      if (token && !transcode.searchParams.has('api_key')) {
        transcode.searchParams.set('api_key', token);
      }
      return {
        src: transcode.toString(),
        item
      };
    }

    // For this custom browser player, direct streaming is the most predictable
    // path for the same Insta360/home-video files used by the current viewer.
    let container =
      String(source.Container || item?.Container || 'mp4')
        .split(',')[0]
        .trim()
        .toLowerCase();

    if (!/^[a-z0-9]+$/.test(container)) container = 'mp4';

    const stream = new URL(
      serverBase +
      '/Videos/' +
      encodeURIComponent(itemId) +
      '/stream.' +
      container
    );

    stream.searchParams.set('static', 'true');

    const mediaSourceId =
      source.Id ||
      source.id ||
      itemId;

    stream.searchParams.set(
      'mediaSourceId',
      mediaSourceId
    );

    if (source.ETag) {
      stream.searchParams.set('tag', source.ETag);
    }

    if (token) {
      stream.searchParams.set('api_key', token);
    }

    // Preserve useful client identity parameters when the current native
    // Jellyfin stream contains them.
    if (mediaUrl) {
      ['DeviceId', 'deviceId'].forEach((name) => {
        const value = mediaUrl.searchParams.get(name);
        if (value && !stream.searchParams.has(name)) {
          stream.searchParams.set(name, value);
        }
      });
    }

    return {
      src: stream.toString(),
      item
    };
  }

  async function getQualityPlaybackUrl(itemId, maxBitrate) {
    const bitrate = Number(maxBitrate) || 0;

    // Auto returns to Jellyfin's normal direct-play/remux decision.
    if (bitrate === 0) {
      return await getGalleryPlaybackUrl(itemId);
    }

    const { userId, token, serverBase } = getJellyfinConnectionContext();
    const playbackInfo = await jellyfinPostJson(
      '/Items/' + encodeURIComponent(itemId) + '/PlaybackInfo',
      {
        UserId: userId,
        // Load the full timeline and let the persistent video element seek
        // after metadata is available. Starting the transcode at the saved
        // position as well would apply the offset twice.
        StartTimeTicks: 0,
        IsPlayback: true,
        AutoOpenLiveStream: true,
        MaxStreamingBitrate: bitrate,
        DeviceProfile: {
          Name: 'Jellyfin VR Player',
          SupportedMediaTypes: 'Video',
          MaxStreamingBitrate: bitrate,
          MaxStaticBitrate: bitrate,
          DirectPlayProfiles: [],
          TranscodingProfiles: [{
            Container: 'ts',
            Type: 'Video',
            VideoCodec: 'h264',
            AudioCodec: 'aac,mp3',
            Protocol: 'hls',
            Context: 'Streaming',
            EstimateContentLength: false,
            EnableMpegtsM2TsMode: false,
            TranscodeSeekInfo: 'Auto',
            CopyTimestamps: false,
            EnableSubtitlesInManifest: false,
            MaxAudioChannels: '2',
            MinSegments: 1,
            SegmentLength: 0,
            BreakOnNonKeyFrames: true
          }],
          ContainerProfiles: [],
          CodecProfiles: [],
          SubtitleProfiles: [],
          ResponseProfiles: []
        }
      },
      { userId }
    );

    const source = (playbackInfo?.MediaSources || playbackInfo?.mediaSources || [])[0];
    const transcodingUrl = source?.TranscodingUrl || source?.transcodingUrl;

    if (!transcodingUrl) {
      const supportsTranscoding =
        source?.SupportsTranscoding ?? source?.supportsTranscoding;
      const reason =
        source?.TranscodingSubProtocol ||
        source?.transcodingSubProtocol ||
        source?.DirectStreamUrl ||
        source?.directStreamUrl ||
        'no compatible transcoding profile';
      throw new Error(
        'Jellyfin did not provide a transcoding URL (' +
        'supports transcoding: ' + String(supportsTranscoding) +
        '; ' + String(reason) + ').'
      );
    }

    const url = new URL(transcodingUrl, serverBase + '/');
    if (token && !url.searchParams.has('api_key')) {
      url.searchParams.set('api_key', token);
    }

    return {
      src: url.toString(),
      item: await getCachedVideoMetadata(itemId)
    };
  }

  function itemHasVR360Tag(item) {
    const tags = item?.Tags || item?.tags || [];
    if (!Array.isArray(tags)) return false;

    return tags.some(tag => String(tag).trim().toUpperCase() === VR360_TAG);
  }

  function getAutoVRButton() {
    return document.getElementById('vr360-auto-toggle');
  }

  function updateAutoVRButton() {
    const btn = getAutoVRButton();
    if (!btn) return;

    const span = btn.querySelector('span');
    btn.setAttribute('aria-pressed', String(autoVREnabled));
    btn.title = autoVREnabled
      ? 'Auto VR: ON — automatically opens videos tagged VR360'
      : 'Auto VR: OFF — click to enable automatic VR360 playback';

    if (span) {
      span.style.color = autoVREnabled ? '#00a4dc' : 'rgba(255,255,255,0.72)';
      span.style.opacity = autoVREnabled ? '1' : '0.72';
    }
  }

  function setAutoVREnabled(enabled) {
    autoVREnabled = Boolean(enabled);
    saveAutoVRPreference();
    updateAutoVRButton();

    // Re-evaluate the current video immediately when Auto VR is turned on.
    if (autoVREnabled) {
      autoDismissedItemId = null;
      lastAutoCheckedItemId = null;
      lastMetadataFailureAt = 0;
      setTimeout(checkForVideo, 0);
    }
  }

  // Open the 360 VR player overlay.
  function opentheplayer(options = {}) {
    // Don't open if already open.
    if (document.getElementById('vr360-overlay')) return;

    const videoInfo = getJellyfinStamp();
    if (!videoInfo) {
      alert('No video playing — start a video in Jellyfin first.');
      return;
    }

    const initialItemId = options.itemId || getCurrentJellyfinItemId();
    let activeItemId = initialItemId;
    let selectedQuality = loadSavedQuality();
    let selectedProjection = loadSavedProjection();

    // Pause Jellyfin's native player.
    const jellyfinVideo = getNativeJellyfinVideo();
    if (jellyfinVideo) jellyfinVideo.pause();

    // Create blob URL for player HTML.
    const blob    = new Blob([PLAYER_HTML], { type: 'text/html' });
    const blobUrl = URL.createObjectURL(blob);

    // Create overlay container.
    const overlay = document.createElement('div');
    overlay.id = 'vr360-overlay';
    overlay.dataset.itemId = activeItemId || '';
    overlay.dataset.autoStarted = options.autoStarted ? 'true' : 'false';
    overlay.style.cssText = `position:fixed;inset:0;z-index:99999;background:#000;`;

    // Single close button: exits the custom player and returns directly
    // to the video's parent Jellyfin folder/library view.
    const closeBtn = document.createElement('button');
    closeBtn.style.cssText = `
      position:absolute;top:12px;right:12px;z-index:100000;
      background:rgba(0,0,0,0.25);border:none;color:rgba(255,255,255,0.9);
      cursor:pointer;display:flex;align-items:center;justify-content:center;
      width:42px;height:42px;
      font-family:'Noto Sans',sans-serif;font-size:15px;font-weight:600;
      padding:0;border-radius:50%;transition:background 0.2s;
    `;
    closeBtn.innerHTML = '<span style="font-family:\'Material Icons\',sans-serif;font-size:28px;line-height:1;">close</span>';
    closeBtn.title = 'Close 360 viewer and return to library';
    closeBtn.setAttribute(
      'aria-label',
      'Close 360 viewer and return to library'
    );

    closeBtn.onmouseenter = () => {
      closeBtn.style.background = 'rgba(0,0,0,0.55)';
    };
    closeBtn.onmouseleave = () => {
      closeBtn.style.background = 'rgba(0,0,0,0.25)';
    };

    let closed = false;

    function getCurrentJellyfinServerId() {
      try {
        const match = window.location.href.match(
          /(?:[?&#]|^)serverId=([^&#]+)/i
        );
        if (match) return decodeURIComponent(match[1]);
      } catch (_) {}

      const apiClient = getJellyfinApiClient();

      try {
        return apiClient?.serverId?.() ||
               apiClient?._serverInfo?.Id ||
               apiClient?._serverInfo?.id ||
               null;
      } catch (_) {
        return null;
      }
    }

    function buildJellyfinLibraryUrl(parentId) {
      const baseUrl = window.location.href.split('#')[0];
      const params = new URLSearchParams();

      if (parentId) params.set('parentId', parentId);

      const serverId = getCurrentJellyfinServerId();
      if (serverId) params.set('serverId', serverId);

      // Jellyfin 10.11 commonly uses #!/list. Preserve that route style when
      // the current installation uses it; otherwise use the modern #/list form.
      const hashPrefix =
        String(window.location.hash || '').startsWith('#!')
          ? '#!/list?'
          : '#/list?';

      return baseUrl + hashPrefix + params.toString();
    }

    async function resolveParentFolderId() {
      if (!activeItemId) return null;

      try {
        const metadata = await getCachedVideoMetadata(activeItemId);

        return normalizeJellyfinItemId(
          metadata?.ParentId ||
          metadata?.parentId
        );
      } catch (error) {
        console.warn(
          '[Jellyfin VR] Could not read the active video ParentId:',
          error
        );
        return null;
      }
    }

    const navigateBackToLibrary = async () => {
      // Stop Jellyfin's native element completely so the native playback layer
      // cannot remain mounted while we return to the folder/grid.
      if (jellyfinVideo) {
        try { jellyfinVideo.pause(); } catch (_) {}

        try {
          jellyfinVideo.removeAttribute('src');
          jellyfinVideo
            .querySelectorAll('source')
            .forEach((source) => source.remove());
          jellyfinVideo.load();
        } catch (_) {}
      }

      const parentId = await resolveParentFolderId();

      if (parentId) {
        const libraryUrl = buildJellyfinLibraryUrl(parentId);

        console.info(
          '[Jellyfin VR] Returning directly to parent library:',
          libraryUrl
        );

        // Force a clean Jellyfin page reconstruction after replacing the route.
        // This prevents the native playback overlay from resurfacing.
        window.location.replace(libraryUrl);
        setTimeout(() => window.location.reload(), 80);
        return;
      }

      // Fallback: when Jellyfin metadata does not expose ParentId, use history.
      // The custom overlay is already gone and the native video has been stopped.
      console.warn(
        '[Jellyfin VR] Parent folder could not be resolved; using browser Back.'
      );
      window.history.back();
    };

    let onViewerMessage = null;

    const closeVRPlayer = async () => {
      if (closed) return;
      closed = true;

      // Prevent Auto VR from immediately reopening the same item while Jellyfin
      // transitions back to its parent folder.
      if (activeItemId) autoDismissedItemId = activeItemId;

      document.removeEventListener('keydown', onKey);

      if (onViewerMessage) {
        window.removeEventListener('message', onViewerMessage);
      }

      URL.revokeObjectURL(blobUrl);
      overlay.remove();

      // Do not resume Jellyfin's native player. Exit playback completely.
      await navigateBackToLibrary();
    };

    closeBtn.onclick = closeVRPlayer;

    // Create iframe for VR player.
    const iframe = document.createElement('iframe');
    iframe.src = blobUrl;
    iframe.style.cssText = `position:absolute;inset:0;border:none;width:100%;height:100%;`;
    iframe.allow = 'autoplay; fullscreen; xr-spatial-tracking; accelerometer; gyroscope; magnetometer';

    async function sendVideoGalleryToViewer() {
      if (!activeItemId || !iframe.contentWindow) return;

      iframe.contentWindow.postMessage(
        { type: 'JF_VIDEO360_GALLERY_LOADING' },
        '*'
      );

      try {
        const items =
          await getVR360VideosForCurrentFolder(activeItemId);

        iframe.contentWindow.postMessage(
          {
            type: 'JF_VIDEO360_GALLERY',
            items,
            currentItemId: activeItemId
          },
          '*'
        );
      } catch (error) {
        console.warn(
          '[Jellyfin VR] Unable to build video gallery:',
          error
        );

        iframe.contentWindow.postMessage(
          {
            type: 'JF_VIDEO360_GALLERY',
            items: [],
            currentItemId: activeItemId
          },
          '*'
        );
      }
    }

    // Send initial video and gallery data once the iframe is ready.
    iframe.onload = async () => {
      let currentTitle = '';
      let initialSrc = videoInfo.src;

      if (activeItemId) {
        try {
          const metadata =
            await getCachedVideoMetadata(activeItemId);
          currentTitle =
            metadata?.Name ||
            metadata?.name ||
            '';
        } catch (_) {}

        if (selectedQuality.bitrate > 0) {
          try {
            initialSrc = (
              await getQualityPlaybackUrl(
                activeItemId,
                selectedQuality.bitrate
              )
            ).src;
          } catch (error) {
            console.warn(
              '[Jellyfin VR] Saved quality is unavailable; using Auto.',
              error
            );
            selectedQuality = { bitrate: 0, label: 'Auto' };
            saveQuality(selectedQuality);
          }
        }
      }

      iframe.contentWindow.postMessage({
        type: 'LOAD_VIDEO',
        src: initialSrc,
        currentTime: videoInfo.currentTime,
        itemId: activeItemId,
        title: currentTitle,
        qualityBitrate: selectedQuality.bitrate,
        qualityLabel: selectedQuality.label,
        projection: selectedProjection
      }, '*');

      sendVideoGalleryToViewer();
    };

    let gallerySwitchBusy = false;
    let qualitySwitchBusy = false;

    onViewerMessage = async (event) => {
      if (event.source !== iframe.contentWindow) return;

      if (event.data?.type === 'JF_VIDEO360_FULLSCREEN_STATE') {
        closeBtn.style.display = event.data?.fullscreen ? 'none' : 'flex';
        return;
      }

      if (event.data?.type === 'JF_VIDEO360_PROJECTION') {
        const projection = String(event.data?.projection || '');
        if (VALID_PROJECTIONS.has(projection)) {
          selectedProjection = projection;
          saveProjection(selectedProjection);
        }
        return;
      }

      if (event.data?.type === 'JF_VIDEO360_QUALITY') {
        if (qualitySwitchBusy || !activeItemId) return;

        qualitySwitchBusy = true;

        try {
          const bitrate = Number(event.data?.bitrate) || 0;
          const currentTime = Number(event.data?.currentTime) || 0;
          const result = await getQualityPlaybackUrl(
            activeItemId,
            bitrate
          );
          selectedQuality = {
            bitrate,
            label: event.data?.label || 'Auto'
          };
          saveQuality(selectedQuality);

          iframe.contentWindow.postMessage(
            {
              type: 'LOAD_VIDEO',
              src: result.src,
              currentTime,
              itemId: activeItemId,
              autoplay: !event.data?.paused,
              qualityBitrate: bitrate,
              qualityLabel: selectedQuality.label,
              projection: selectedProjection
            },
            '*'
          );
        } catch (error) {
          console.error('[Jellyfin VR] Unable to change quality:', error);
          iframe.contentWindow.postMessage(
            {
              type: 'JF_VIDEO360_QUALITY_ERROR',
              message: error?.message || 'Unable to change video quality'
            },
            '*'
          );
        } finally {
          qualitySwitchBusy = false;
        }

        return;
      }

      if (event.data?.type !== 'JF_VIDEO360_GOTO') return;

      const targetItemId =
        normalizeJellyfinItemId(event.data?.itemId);

      if (
        !targetItemId ||
        targetItemId === activeItemId ||
        gallerySwitchBusy
      ) {
        return;
      }

      gallerySwitchBusy = true;

      iframe.contentWindow.postMessage(
        {
          type: 'JF_VIDEO360_GALLERY_BUSY',
          busy: true,
          message: 'Loading 360 video…'
        },
        '*'
      );

      try {
        let result;

        try {
          result = selectedQuality.bitrate > 0
            ? await getQualityPlaybackUrl(targetItemId, selectedQuality.bitrate)
            : await getGalleryPlaybackUrl(targetItemId);
        } catch (qualityError) {
          if (selectedQuality.bitrate === 0) throw qualityError;

          console.warn(
            '[Jellyfin VR] Selected quality is unavailable for the next video; using Auto.',
            qualityError
          );
          selectedQuality = { bitrate: 0, label: 'Auto' };
          saveQuality(selectedQuality);
          result = await getGalleryPlaybackUrl(targetItemId);
        }

        activeItemId = targetItemId;
        overlay.dataset.itemId = activeItemId;

        iframe.contentWindow.postMessage(
          {
            type: 'LOAD_VIDEO',
            src: result.src,
            currentTime: 0,
            itemId: activeItemId,
            qualityBitrate: selectedQuality.bitrate,
            qualityLabel: selectedQuality.label,
            projection: selectedProjection,
            title:
              result.item?.Name ||
              result.item?.name ||
              ''
          },
          '*'
        );

        iframe.contentWindow.postMessage(
          {
            type: 'JF_VIDEO360_GALLERY',
            items:
              await getVR360VideosForCurrentFolder(activeItemId),
            currentItemId: activeItemId
          },
          '*'
        );
      } catch (error) {
        console.error(
          '[Jellyfin VR] Unable to switch gallery video:',
          error
        );

        iframe.contentWindow.postMessage(
          {
            type: 'JF_VIDEO360_GALLERY_BUSY',
            busy: false,
            message: 'Unable to load this 360 video'
          },
          '*'
        );
      } finally {
        gallerySwitchBusy = false;
        iframe.contentWindow.postMessage(
          {
            type: 'JF_VIDEO360_GALLERY_BUSY',
            busy: false
          },
          '*'
        );
      }
    };

    window.addEventListener('message', onViewerMessage);

    overlay.appendChild(closeBtn);
    overlay.appendChild(iframe);
    document.body.appendChild(overlay);

    // ESC has the same behavior as the X button: exit to the library.
    const onKey = (e) => {
      if (e.key === 'Escape') closeVRPlayer();
    };
    document.addEventListener('keydown', onKey);
  }

  async function maybeAutoOpenVR() {
    if (!autoVREnabled) return;
    if (document.getElementById('vr360-overlay')) return;

    const videoInfo = getJellyfinStamp();
    if (!videoInfo?.src) return;

    const itemId = getCurrentJellyfinItemId();
    if (!itemId) {
      console.debug('[Jellyfin VR] Could not determine the current Jellyfin Item ID.');
      return;
    }

    // Once playback changes to another item, allow Auto VR again.
    if (autoDismissedItemId && autoDismissedItemId !== itemId) {
      autoDismissedItemId = null;
    }

    if (autoDismissedItemId === itemId) return;
    if (lastAutoCheckedItemId === itemId) return;
    if (autoCheckInFlightItemId === itemId) return;

    // If a request just failed, avoid hammering the API every DOM mutation.
    if (lastMetadataFailureAt && Date.now() - lastMetadataFailureAt < 5000) return;

    autoCheckInFlightItemId = itemId;

    try {
      const item = await getJellyfinItemMetadata(itemId);

      // Playback may have changed while the metadata request was in flight.
      if (getCurrentJellyfinItemId() !== itemId) return;

      lastAutoCheckedItemId = itemId;
      lastMetadataFailureAt = 0;

      const tags = item?.Tags || item?.tags || [];
      console.debug('[Jellyfin VR] Item metadata checked:', {
        itemId,
        name: item?.Name || item?.name,
        tags
      });

      if (
        autoVREnabled &&
        autoDismissedItemId !== itemId &&
        itemHasVR360Tag(item) &&
        !document.getElementById('vr360-overlay')
      ) {
        console.info('[Jellyfin VR] VR360 tag detected — opening VR player automatically.');
        opentheplayer({ itemId, autoStarted: true });
      }
    } catch (error) {
      lastMetadataFailureAt = Date.now();
      console.warn('[Jellyfin VR] Unable to read metadata for Auto VR:', error);
    } finally {
      if (autoCheckInFlightItemId === itemId) autoCheckInFlightItemId = null;
    }
  }

  // Create the manual "VR" button and the persistent "AUTO" toggle
  // in Jellyfin's native playback controls.
  function createVRstuff() {
    const fullscreenBtn = document.querySelector('.btnFullscreen');
    if (!fullscreenBtn || !fullscreenBtn.parentNode) return;

    let manualBtn = document.getElementById('vr360-toggleplay');

    if (!manualBtn) {
      manualBtn = document.createElement('button');
      manualBtn.id = 'vr360-toggleplay';
      manualBtn.setAttribute('is', 'paper-icon-button-light');
      manualBtn.className = 'autoSize paper-icon-button-light';
      manualBtn.title = 'VR Player — open manually';
      manualBtn.setAttribute('aria-label', 'Open VR Player manually');

      const span = document.createElement('span');
      span.className = 'largePaperIconButton';
      span.setAttribute('aria-hidden', 'true');
      span.textContent = 'VR';
      span.style.cssText = `
        font-family:'Noto Sans',sans-serif;
        font-size:13px;
        font-weight:700;
        letter-spacing:0.5px;
        display:inline-flex;
        align-items:center;
        justify-content:center;
      `;

      manualBtn.appendChild(span);
      manualBtn.onclick = () => opentheplayer({ autoStarted: false });
      fullscreenBtn.parentNode.insertBefore(manualBtn, fullscreenBtn);
    }

    let autoBtn = document.getElementById('vr360-auto-toggle');

    if (!autoBtn) {
      autoBtn = document.createElement('button');
      autoBtn.id = 'vr360-auto-toggle';
      autoBtn.setAttribute('is', 'paper-icon-button-light');
      autoBtn.className = 'autoSize paper-icon-button-light';
      autoBtn.setAttribute('aria-label', 'Toggle automatic VR360 playback');

      const autoSpan = document.createElement('span');
      autoSpan.className = 'largePaperIconButton';
      autoSpan.setAttribute('aria-hidden', 'true');
      autoSpan.textContent = 'AUTO';
      autoSpan.style.cssText = `
        font-family:'Noto Sans',sans-serif;
        font-size:10px;
        font-weight:700;
        letter-spacing:0.25px;
        display:inline-flex;
        align-items:center;
        justify-content:center;
      `;

      autoBtn.appendChild(autoSpan);
      autoBtn.onclick = () => setAutoVREnabled(!autoVREnabled);

      // Order: AUTO | VR | Fullscreen
      manualBtn.parentNode.insertBefore(autoBtn, manualBtn);
    }

    updateAutoVRButton();
  }

  // Remove VR controls from Jellyfin UI when there is no active video.
  function removeVRstuff() {
    document.getElementById('vr360-toggleplay')?.remove();
    document.getElementById('vr360-auto-toggle')?.remove();
  }

  // Check whether a Jellyfin video is active, maintain the buttons, and run the
  // metadata-based Auto VR check. No resolution/filename guessing is used.
  function checkForVideo() {
    const vid = getNativeJellyfinVideo();
    const src = vid?.currentSrc || vid?.src;
    const hasVideo = Boolean(vid && src);

    if (hasVideo) {
      createVRstuff();

      const itemId = getCurrentJellyfinItemId();
      if (itemId && lastAutoCheckedItemId && lastAutoCheckedItemId !== itemId) {
        lastAutoCheckedItemId = null;
        lastMetadataFailureAt = 0;
      }

      maybeAutoOpenVR();
    } else {
      removeVRstuff();
      lastAutoCheckedItemId = null;
      autoCheckInFlightItemId = null;
      autoDismissedItemId = null;
    }
  }

  // Watch Jellyfin's SPA/player for video nodes and source changes.
  const observer = new MutationObserver(checkForVideo);

  // Initialize everything.
  function init() {
    checkForVideo();

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['src']
    });

    // Media events cover cases where Jellyfin reuses the same <video> element.
    document.addEventListener('play', checkForVideo, true);
    document.addEventListener('loadedmetadata', checkForVideo, true);
    document.addEventListener('emptied', checkForVideo, true);
  }

  // Run init when page loads.
  if (document.readyState === 'complete') {
    init();
  } else {
    window.addEventListener('load', init);
  }
})();
