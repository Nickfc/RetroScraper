# buildGamesJson 🎮

If you’ve ever dreamed of rummaging through your sprawling ROM collection like a **raccoon** searching for last night’s leftover pizza—only to meticulously catalog everything in neat JSON scrapbooks—then **buildGamesJson** is your new best friend. This Node.js script scans through your ROM folders, fetches game metadata from IGDB (unless you prefer sweet ignorance in Offline Mode), and saves it all into per-console JSON files with optional schema validation. Yes, it’s basically the librarian of your retro gaming crypt.

## 🌟 Features

### Core Features

- **Automatic ROM Identification**  
  Uses IGDB to identify and validate your ROMs, ensuring even the most obscure bootlegs get a loving catalog entry.

- **Smart Console Detection**  
  Maps folder names to console types, because your NES and SNES deserve their own VIP sections.

- **Metadata Enrichment**  
  Downloads comprehensive game details including cover art, screenshots, release dates, and more—your library will be the envy of every retro gamer.

- **Multi-Directory Support**  
  Handles multiple ROM directories seamlessly, because who doesn’t have ROMs scattered across multiple drives?

- **Progress Saving**  
  Saves progress during large scans to prevent data loss, so your epic cataloging quest won’t be interrupted by sudden power outages.

- **Offline Mode**  
  Operates without internet for basic organization, perfect for those days when you just want to bask in the nostalgia without the metadata fuss.

- **Emulator Core Mapping**  
  Matches ROMs to compatible emulator cores, ensuring your games run smoother than a well-oiled joystick.

- **Custom Tag Generation**  
  Creates searchable tags from game metadata, making it easier to find that one game you forgot you had.

### Advanced Features

- **Parallel Processing**  
  Summon a worker pool (default 4 workers) to query IGDB in parallel, so you don’t do it one by one like a medieval scribe. Configurable workers for those who like to push the limits.

- **Rate-Limiting**  
  We cunningly refuse to surpass 4 requests/second using a token-bucket approach (so IGDB’s banhammer doesn’t descend upon us).

- **Adaptive Rate**  
  Like a startled cat, if we get repeated 429 (Too Many Requests), we cut concurrency in half. The script’s version of survival instincts.

- **Smart Metadata Handling**  
  Fuzzy title matching for creatively named ROMs and nested genre hierarchies to keep your library organized like a pro.

- **Lazy Asset Download**  
  Store only URLs for covers/screenshots. Save disk space for your favorite cat memes, or let us handle the downloads if you prefer.

- **Expanded IGDB Fields**  
  We pull in goodies like `storyline`, `category`, `status`, `game_modes`, `keywords`, etc., then store them like prized collectibles.

- **Auto Tag Generation**  
  We generate naive tags from summary, storyline, genres, and developer text. Perfect for unleashing **questionable** SEO-like mania.

- **JSON Schema Validation**  
  An optional JSON schema (powered by [ajv](https://www.npmjs.com/package/ajv)) ensures your final JSON meets your lofty standards.

- **Partial Saves**  
  We save progress every 100 processed entries, so if your computer spontaneously combusts, at least some data survives the flames.

- **Unmatched Titles**  
  We track games that IGDB simply can’t find in a special `unmatched.json`. (Probably obscure bootlegs or an actual virus disguised as a ROM.)

- **Console Index**  
  `consoles_index.json` references your per-console JSON files, letting you see your entire empire of retro consoles at a glance.

## 🚀 Installation & Setup

1. **Install Node.js**  
   Make sure you have Node.js (≥14.0) installed, so the script can do its conjuring.

2. **Clone this repo**  
   ```bash
   git clone https://github.com/Nickfc/ElectronKiosk/buildGamesJson.git
   cd buildGamesJson
   ```

3. **Install Dependencies**  
   ```bash
   npm install
   ```
   We rely on:
   - **axios** for HTTP requests
   - **chalk** for colorful console logs
   - **cli-progress** for fancy progress bars
   - **string-similarity** for fuzzy title matching
   - **ini** for reading the sacred `config.ini`
   - **ajv** for optional JSON schema validation

4. **Create/Configure `config.ini`**  
   Place a `config.ini` in the same directory (unless you enjoy errors). Below is an example configuration:

   ```ini
   [Paths]
   RomsPaths = C:/RetroArch/Games/Roms, E:/psx games        ; Comma-separated list of directories where ROM files are stored
   OutputFolder = data                                       ; Base directory where metadata and other generated files will be saved
   ImagesFolder = data/images                               ; Directory where game cover images and screenshots will be stored
   CoresFolder = C:/RetroArch/win64/cores                   ; Directory containing RetroArch libretro cores (.dll files)

   [IGDB]
   ClientID=                                                ; Your IGDB API client ID (required for online functionality)
   ClientSecret=                                            ; Your IGDB API client secret (required for online functionality)

   [Settings]
   SkipExistingMetadata = false                            ; Skip processing ROMs that already have metadata files
   OfflineMode = false                                     ; Run in offline mode using only local data, no API calls
   Concurrency = 4                                         ; Number of parallel processing threads
   LazyDownload = false                                    ; Download images only when viewing/accessing a game
   AdaptiveRate = true                                     ; Automatically adjust API request rate based on rate limits
   ValidateSchema = false                                  ; Validate metadata against JSON schema before saving
   TagGeneration = true                                    ; Generate tags from game descriptions and metadata
   MaxRequestsPerSecond = 4                                ; Maximum number of API requests per second
   RefillIntervalMs = 1000                                  ; Time in milliseconds between API request quota refills
   SaveEveryN = 100                                        ; Save progress after processing this many games
   FuzzyMatchThreshold = 0.4                               ; Minimum similarity score (0-1) for fuzzy string matching
   AutoSelectCoreConfidence = 0.8                          ; Minimum confidence score to auto-select a core for a console
   MaxConsoleSuggestions = 5                                ; Maximum number of console suggestions when auto-detection fails
   ValidRomExtensions = .nes, .sfc, .smc, .gba, .gb, .gbc, .n64, .z64, .v64, .zip  ; List of file extensions to process
   OutputFormat = json                                     ; Output format for metadata files (json, csv, or xml)

   [Cores]
   ; Manual core assignments for specific consoles
   ; Format: console_name = path_to_core
   ; Console names should match IGDB platform names
   ; Paths should point to valid libretro core files

   ; Examples:
   ; amiga = C:/RetroArch/cores/puae_libretro.dll
   ; nes = C:/RetroArch/cores/nestopia_libretro.dll
   ; snes = C:/RetroArch/cores/snes9x_libretro.dll
   ; game boy advance = C:/RetroArch/cores/mgba_libretro.dll
   ```

   **Configuration Breakdown:**

   - **`Paths`**:  
     - **`RomsPaths`**: Comma-separated list of directories where your ROMs are stored.
     - **`OutputFolder`**: Base directory where metadata and other generated files will be saved.
     - **`ImagesFolder`**: Directory where game cover images and screenshots will be stored.
     - **`CoresFolder`**: Directory containing RetroArch libretro cores (.dll files).

   - **`IGDB`**:  
     - **`ClientID` / `ClientSecret`**: Keys for IGDB API. If left empty, the script can't do magical metadata.

   - **`Settings`**:  
     - **`SkipExistingMetadata`**: Skip processing ROMs that already have metadata files.
     - **`OfflineMode`**: If `true`, no IGDB requests.
     - **`Concurrency`**: Number of parallel processing threads.
     - **`LazyDownload`**: If `true`, only store URLs for images—no local downloads.
     - **`AdaptiveRate`**: If `true`, automatically adjust API request rate based on rate limits.
     - **`ValidateSchema`**: Validate final JSON using ajv.
     - **`TagGeneration`**: Generate tags from summary, storyline, etc.
     - **`MaxRequestsPerSecond`**: Maximum number of API requests per second.
     - **`RefillIntervalMs`**: Time in milliseconds between API request quota refills.
     - **`SaveEveryN`**: Save progress after processing this many games.
     - **`FuzzyMatchThreshold`**: Threshold for fuzzy matching ROM titles.
     - **`AutoSelectCoreConfidence`**: Minimum confidence score to auto-select a core for a console.
     - **`MaxConsoleSuggestions`**: Maximum number of console suggestions when auto-detection fails.
     - **`ValidRomExtensions`**: List of file extensions to process.
     - **`OutputFormat`**: Output format for metadata files (`json`, `csv`, or `xml`).

   - **`Cores`**:  
     Manual core assignments for specific consoles. Ensure console names match IGDB platform names and paths point to valid libretro core files.

## 🎮 Usage

Just run the script:

```bash
node buildGamesJson.js
```

### Command-Line Options

- **Standard Run**:  
  ```bash
  node buildGamesJson.js
  ```

- **Offline Mode (No Metadata Fetching)**:  
  ```bash
  node buildGamesJson.js --offline
  ```

- **Custom Config Location**:  
  ```bash
  node buildGamesJson.js --config alternative-config.ini
  ```

- **Enable Debug Logging**:  
  ```bash
  node buildGamesJson.js --debug
  ```

### What It Does

1. **Scans Your ROM Folders**  
   - Identifies console types from folder names.
   - Validates ROM files based on extensions.
   - Groups ROMs by console.

2. **Fetches Metadata**  
   - Queries IGDB for game details.
   - Downloads artwork (optional).
   - Generates custom tags.
   - Validates against schema if enabled.

3. **Organizes Everything**  
   - Creates per-console JSON files in `OutputFolder`.
   - Downloads and organizes images in `ImagesFolder` (unless `LazyDownload` is enabled).
   - Maps ROMs to emulator cores.
   - Tracks unmatched games in `unmatched.json`.

### Sample Output Structure

```
data/
├── NES.json
├── SNES.json
├── PSX.json
├── unmatched.json
├── consoles_index.json
├── cores.json
└── folderConsoleMappings.json
images/
├── NES/
│   └── Super Mario Bros/
│       ├── cover.jpg
│       └── screenshots/
│           └── 1.jpg
└── SNES/
    └── ...
```

> **Note:** If `LazyDownload` is true, you won’t see `cover.jpg` or screenshots locally. Instead, you’ll have an array of IGDB image URLs in your JSON.

## 📜 Schema Validation

If `ValidateSchema` is true, the script runs everything through AJV to check it’s not producing nonsense (e.g., a game with zero `RomPaths`). If validation fails, we warn you but keep your data. We’re not total monsters.

## 🔧 Partial Saving

After every 100 new/updated entries (configurable via `SaveEveryN`), the script writes out your current progress. So if you do something crazy like forcibly shutting down your PC, you’ll at least have some data left to pick through in the rubble.

## 🛠️ Concurrency & Rate-Limiting

- **Concurrency**: By default 4, but can be set in `config.ini`. More concurrency = faster queries... until IGDB complains.
- **4 requests/second** limit: We’re polite. A token-bucket ensures we won’t exceed 4 requests per second.
- **Adaptive meltdown**: A fancy way of saying we reduce concurrency by half if we keep hitting 429 errors.

## 🌐 Offline Mode

If you’re offline—or maybe you just want to remain in the bliss of ignorance—turn `OfflineMode` on. The script will skip IGDB entirely. You’ll still get a JSON listing of your ROMs, but metadata will be mostly empty. Perfect for doomsday scenarios.

## 📂 Unmatched Games

Any ROM that IGDB can’t identify (or that fails fuzzy matching) lands in the `unmatched.json` file. Maybe you have a super-rare beta or a mislabeled folder from your basement. Keep it safe or rename it properly so it doesn’t get left behind next time.

## 🐛 Troubleshooting

1. **Missing IGDB Credentials**  
   - You’ll get an error if `ClientID`/`ClientSecret` are missing and you’re not in offline mode.

2. **Bizarre File Extensions**  
   - Only certain ROM extensions are recognized. See the top of `buildGamesJson.js` to add your own if you’re feeling rebellious.

3. **Missing Cores**  
   - The script tries to map each console to a specific core path. If you don’t have that, it’ll emit a warning. Update `CORE_MAP` if you want a different path or no path at all.

4. **"IGDB hates me"**  
   - Check your API credentials.

5. **"My ROMs are invisible"**  
   - Verify file extensions.

6. **"Everything is on fire"**  
   - Check your `config.ini`.

7. **"It's all offline"**  
   - Internet connection or IGDB down.

### Debug Mode

```bash
# Enable debug logging
node buildGamesJson.js --debug
```

## 🤝 Contributing

PRs are welcome. If you have new ideas—like summoning more metadata from IGDB or generating even wackier tags—go for it. Just keep the code at least half as sarcastic, so we maintain brand consistency.

1. Fork it
2. Branch it
3. Code it
4. Push it
5. PR it

## 📜 License

[MIT](./LICENSE) — basically do whatever you want, at your own risk, and don’t blame us if the script accidentally triggers the apocalypse.

## 💖 Acknowledgments

- IGDB for their API (and patience)
- RetroArch for core mappings
- Caffeine for making this possible

---

**Enjoy your newly organized retro library**—complete with random tags, partial downloads, and fuzzy matched titles. Because the line between collecting and obsessing is oh-so-thin!