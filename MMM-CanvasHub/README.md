# MMM-CanvasHub

MagicMirror² module for displaying Canvas grades, missing assignments, and announcements through the hosted Canvas Hub widget.

## Installation

From your MagicMirror installation directory, run:

```bash
cd ~/MagicMirror/modules
git clone https://github.com/anthonytapioca-del/MMM-CanvasHub.git
```

Restart MagicMirror after adding the configuration below.

## Configuration

In Canvas Hub, open **API & Developers → MagicMirror widget builder**. Enter your Canvas URL and personal access token, select the sections to display, choose a position and accent color, then generate and copy the configuration object.

Paste that object as an entry in the `modules` array in `~/MagicMirror/config/config.js`. It uses `module: "MMM-CanvasHub"` and points to the hosted widget at `https://canvaswrapper.vercel.app`.

The generated configuration includes the Canvas access token in plain text. Keep `config.js` private, do not publish it, and use a dedicated token that you can revoke. The token is sent to the hosted widget in memory and is not included in the widget URL or stored on Canvas Hub.

The module refreshes every 15 minutes by default. It loads up to 20 active courses and shows at most the three most recently due missing assignments.
