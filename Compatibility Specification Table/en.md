# Compatibility Specification

<p align="center"><b><font color="red">⚠️The compatibility specification table for this language has ceased updates!⚠️</font></b></p>

This website is built with **HTML5**, **CSS3**, **JavaScript (ES6+)**, and some advanced **CSS animation/layout features**.

Minimum supported browser versions for full functionality:

| Feature Module | Chrome | Edge | Firefox | Safari | iOS Safari | Android Chrome | Notes |
|----------------|:------:|:----:|:-------:|:------:|:----------:|:--------------:|------|
| Accurate Network Time (`fetch` + `async/await`) | ✅ 42+ | ✅ 79+ | ✅ 39+ | ✅ 10+ | ✅ 10+ | ✅ 42+ | Fallback to system time if network unavailable |
| Lunar Calendar Calculation (JS) | ✅ 1+ | ✅ 12+ | ✅ 1+ | ✅ 3+ | ✅ 3+ | ✅ 42+ | Highly compatible |
| Time & Date Display (`Date` + `toLocaleTimeString`) | ✅ 46+ | ✅ 79+ | ✅ 29+ | ⚠️ 10+ | ⚠️ 10+ | ✅ 46+ | Older Safari may display differently |
| Search Engine Redirect (`window.open` + RegEx) | ✅ 1+ | ✅ 12+ | ✅ 1+ | ✅ 3+ | ✅ 3+ | ✅ 42+ | JS must be enabled |
| Background Switching (`<img>` + `<video>` + `video.play()`) | ✅ 31+ | ✅ 79+ | ✅ 30+ | ⚠️ 10+ | ⚠️ 10+ | ✅ 42+ | iOS Safari auto-play requires muted |
| Menu Animation (CSS animation + animationend) | ✅ 43+ | ✅ 79+ | ✅ 16+ | ⚠️ 10+ | ⚠️ 10+ | ✅ 42+ | Not supported in IE, older devices may lag |
| Mobile Zoom Control (touch / gesture) | ❌ | ❌ | ❌ | ⚠️ 10+ | ⚠️ 10+ | ⚠️ 42+ | Not applicable on desktop, limited on old devices |
| Local Storage (`localStorage`) | ✅ 4+ | ✅ 79+ | ✅ 3+ | ✅ 4+ | ✅ 3+ | ✅ 42+ | Stores preferred engine and background |
| DOM Operations (`querySelector` + `classList` + `dataset`) | ✅ 1+ | ✅ 79+ | ✅ 3+ | ✅ 3+ | ✅ 3+ | ✅ 42+ | Highly compatible |
| Animation & Interaction Performance (`requestAnimationFrame`) | ✅ 24+ | ✅ 79+ | ✅ 23+ | ✅ 6+ | ✅ 6+ | ✅ 42+ | Ensures smooth refresh |

## Recommendations

1. **Desktop**  
   - Recommended: Chrome 100+, Edge 100+, Safari 15+, Firefox 100+  
   - Older versions still work but may have laggy animations or lower network time accuracy.

2. **Mobile**  
   - Recommended: iOS Safari 15+, Android Chrome 100+  
   - Video auto-play requires muted.  
   - Pinch/zoom prevention may not work on older devices.

3. **Not Recommended**  
   - IE series (lacks `classList.toggle` animation lock, `fetch`, `async/await`)  
   - Very old mobile browsers (< iOS 10 / Android Chrome 50)  

⚠️ Note: This table applies to “Ver.9.1.2” and earlier, future versions may differ.
