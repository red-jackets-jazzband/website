# ui
next: Next
back: Back
skip: Skip tour
done: Done
progress: {chapter} · {n}/{total}
chapters: Chapters
language: Language
close: Close the tour
loading: Loading…
helpLabel: Take the tour

# basics: The basics

## welcome: Welcome to the songs page
setup: showLibrary
target: #libraryTabs
This library holds the lead sheets of songs the band has played, currently plays, or may play in the future. This short tour walks through picking a song, playing and printing it, transposing, practising along with a recording, the mixer, setlists and comping.

Use **Next** and **Back** or the **←** and **→** keys. **Esc** leaves the tour, and the **?** button brings it back any time.

## search: Find a song
setup: showLibrary
target: #songSearch
interactive: true
Try it: type part of a title to filter the list. Press **/** anywhere to jump to this box, then use **↑** **↓** and **Enter** to open a song. The **A–Z** strip beside the list jumps straight to a letter.

## open: Your lead sheet
setup: openDemoSong
target: .rj-sheet-paper
Picking a song opens it here. We've opened *Bourbon Street Parade* for the tour. The chord table comes first, then the notation. On a phone the sheet takes over the whole screen and a **back** button returns you to the list.

## instrument: Choose your instrument
setup: openDemoSong
target: #instrument
interactive: true
Try it: pick your instrument and the sheet is transposed to fit it: concert pitch, Concert + Roman (concert pitch with a Roman numeral analysis added to the chord table), alto sax, B♭ clarinet or trumpet, tenor sax, trombone (bass clef) or sousaphone (bass clef). The page remembers your choice for next time. Playback always sounds at concert pitch, whatever instrument's part is on screen.

## play: Play it
setup: openDemoSong
target: .sheet-transport
interactive: true
Try it: **Play** plays the tune, and the notes light up on the sheet as they sound. **Stop** ends playback. Press the **Spacebar** any time a sheet is open to play or pause.

## print: Print or save as PDF
setup: openDemoSong
target: #printLink
interactive: true
Try it: **Print** turns the chart into a clean page. To keep a digital copy, choose *Save as PDF* in the print dialog. Setlists have their own print buttons, which we'll get to later.

# adjust: Transpose and export
setup: openDemoSong

## key: Change the key
target: #keyStepper
interactive: true
Try it: the **−** and **+** buttons move the key by **semitones**. It transposes both the notation and the sound, so what you play and what you hear stay in step. In a personal setlist the new key is saved with that song.

## tempo: Change the tempo
target: #tempoStepper
interactive: true
Try it: the tempo is in real **beats per minute**, starting from the tune's own marking. Slow it down to learn a tricky passage, then bring it back up.

## more: More controls
setup: openDrawer
target: #repeatStepper
interactive: true
The small arrow at the bottom of the toolbar opens **More controls**. Try it: the **Repeat** stepper plays the tune up to 20 times in a row, for practising on a loop, and skips the lead-in bar after the first pass so the loop stays tidy. The comping picker lives here too.

## irealpro: Open it in iReal Pro
target: #iRealPro
For any tune with chords, this button hands the chart to the **iReal Pro** app on your phone, so you have a backing band in your pocket.

## mp3: Export an MP3
target: #exportMp3Btn
Renders what you are hearing right now into an **.mp3** file: your instrument, key, tempo, comping, mixer settings and repeat count all included. Handy for a practice track to take away.

## fullscreen: Full screen
target: #sheetFullscreenBtn
Gives the whole screen to the sheet and, where your browser allows, keeps the screen awake while you read. On a phone you can still **pinch to zoom** on a dense chart.

# inspiration: Listen and practise
setup: openDemoSong

## button: Inspiration
target: #inspirationLink
interactive: true
When a song has reference recordings, an **Inspiration** button appears. Try it: it opens a floating player, so you can hear how other bands play the tune.

## panel: The floating player
setup: openInspiration
target: #inspirationPanel
interactive: true
The player keeps going while you browse other songs. Try it: drag its **header** to move it and its **left edge** to resize it, or use the resize button to jump between sizes. It closes only when you close it.

## tabs: YouTube, Spotify and more
setup: openInspiration
target: #inspirationTabs
interactive: true
This song has more than one recording, so try switching between the tabs. Only one plays at a time.

## zoom: Zoom in on the timeline
setup: openInspiration
target: .inspiration-loop-overview-row
interactive: true
The strip is the whole recording. Try it: use the **+** and **−** buttons, or drag the highlighted window or its edges, to zoom the timeline below it, which makes it far easier to place markers precisely.

## loop: Loop a phrase
setup: openInspiration
target: #inspirationLoopBar
interactive: true
Play the video, try pressing **A** where a phrase starts and **B** where it ends, and it repeats endlessly. You can also drag the **A** and **B** handles on the timeline, and **✕** clears them.

## speed: Slow it down
setup: openInspiration
target: #inspirationLoopSpeed
interactive: true
Try it: step the **speed** down (or up) to learn a fast line at your own pace, then play along.

## share: Share your loop
setup: openInspiration
target: #inspirationShareBtn
interactive: true
Try it: copies a link to this song **and** your A–B loop. Whoever opens it lands on the same sheet with the video already set to your phrase.

# mixer: The mixer
setup: openDemoSong

## open: Open the mixer
setup: openMixer
target: #mixerPanel
The **Mixer** is the mixing desk for everything you hear. It opens as a small panel under its button, and on a phone as a sheet from the bottom of the screen.

## accompaniment: Bass and chords
setup: openMixer
target: #mixerSectionAccompaniment
interactive: true
The **auto-accompaniment** plays a bass line and chords built from the chord symbols. They start **muted**, so nothing changes until you turn them on. Try it: each has a **mute** button, a **volume** fader and a **voice** picker, and the pattern picker sets the style.

## voices: Every voice of the tune
setup: openMixer
target: #mixerVoicesSection
interactive: true
Each melody line in the song gets its own mute, volume and instrument. Try it: a tune with a trumpet and a sousaphone shows both. Your choices carry over to every other song with a voice of the same name.

## extras: Swing, metronome and quality
setup: openMixer
target: #mixerStripSwing
interactive: true
Try it: the **swing** fader loosens straight eighth notes. The **drum** switches the metronome on, and the **wave** button enables higher-quality playback.

# setlists: Setlists and printing

## shelf: The setlist shelf
setup: showSetlists
target: #songList
The **Setlists** tab lists the band's own setlists, which are read-only, and **Yours** underneath. Yours are stored in this browser only.

## new: Make your own setlist
setup: showSetlists
target: .rj-library-new-setlist-btn
**New setlist** starts from scratch, from a copy of any existing setlist (a **remix**), or from a **.txt** file you upload. Let's build one from scratch, step by step.

## create: A fresh, empty setlist
setup: createDemoSetlist
target: #setlistTitleRow
Starting from *Empty* opens a blank setlist right away, ready for songs — we've named this one *Tour setlist*. Double-click a name (or its pencil) any time to rename your own.

## addsong: Add a song
setup: createDemoSetlist
target: .rj-library-add-song-field
interactive: true
Try it: search a title in the box at the foot of the list, then press **Enter** — or click a match — to add it.

## addsong2: Add another
setup: createDemoSetlist, addDemoSong1
target: .rj-library-add-song-field
interactive: true
Try it: add a second song the same way. The list grows downward, one row per song, ready to put in order.

## reorder: Reorder by dragging
setup: createDemoSetlist, addDemoSong1, addDemoSong2
target: #songList
interactive: true
Try it: drag a song's **⋮⋮** handle up or down to move it. With a row focused, **Alt** + **↑** **↓** nudges it one slot at a time from the keyboard instead.

## break: Add a section
setup: createDemoSetlist, addDemoSong1, addDemoSong2
target: .rj-library-add-break
interactive: true
Try it: **Add a set break** starts a new set — handy for splitting a gig into Set 1, Set 2 and so on. Type a label, or leave it blank for an automatic "Set 2".

## open: Open a setlist
setup: openDemoSetlist
target: #openSetlistTools
Opening a setlist puts its songs in order in the sidebar, split into **sets**. Click one to see it in the same interactive sheet, or use **↑** **↓** (or swipe on a phone) to step through the list. **Listen** opens the setlist's songs on YouTube.

## print: Three ways to print
setup: openDemoSetlist
target: .rj-library-print-group
interactive: true
- **Setlist**: a big numbered list of titles to put on stage.
- **Chordbook**: every song's title and chord grid.
- **Songbook**: every song with its chords and full notation.

## exports: Every way to export
setup: openDemoSong
target: #sheetActions
Beyond the three setlist prints, a single song can be **printed** or saved as a PDF, exported as an **MP3**, or sent to **iReal Pro**. A personal setlist can also be exported as a **.txt** file and imported again on another device.

# comping: Comping
setup: openDemoSong

## pick: Add a comping part
setup: openDrawer
target: #compingSlot
interactive: true
Comping is a chord accompaniment written out as a second staff under the melody. Try picking a **pattern** from this list: Charleston, clave, walking steps and more.

## notation: Read the colours
setup: openDrawer, compingOn
target: #notation
Each hit is a three-note chord, and the colour tells you the role of each note: **black** is the root, **gold** the third and **magenta** the fifth. The three lines move smoothly from chord to chord, so they are easy to follow.

## mixer: Comping in the mixer
setup: openDrawer, compingOn, openMixer
target: #mixerVoicesSection
interactive: true
With comping on, it joins the mixer as its own **Comping** voice, so try it: mute it, turn it up or give it another instrument.

## done: That's the tour
setup: showLibrary
target: #tourBtn
That covers everything. Replay the tour any time with this **?** button, and pick another language in the tour's corner.
