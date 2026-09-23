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
This library holds the lead sheets of songs the band has played, currently plays, or may play in the future. This short tour shows how to find a song, play and print it, transpose it, practise along with a recording, mix your own sound, and work with setlists and comping.

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

## instrument: Read your own part
setup: openDemoSong
target: #instrument
interactive: true
No need to transpose in your head. Try it: pick your instrument and the sheet transposes to fit it: concert pitch, Concert + Roman (concert pitch with a Roman numeral analysis added to the chord table), alto sax, B♭ clarinet or trumpet, tenor sax, trombone (bass clef) or sousaphone (bass clef). The page remembers your choice for next time. Playback always sounds at concert pitch, whatever instrument's part is on screen.

## play: Listen along
setup: openDemoSong
target: .sheet-transport
interactive: true
Hearing the tune played back helps before you pick up your horn. Try it: **Play** plays the tune, and the notes light up on the sheet as they sound. **Stop** ends playback. Press the **Spacebar** any time a sheet is open to play or pause.

## print: Take it to the gig
setup: openDemoSong
target: #printLink
interactive: true
For a stand or a folder, get the chart on paper. Try it: **Print** turns it into a clean page. To keep a digital copy instead, choose *Save as PDF* in the print dialog. Setlists have their own print buttons, which we'll get to later.

# adjust: Play it your way
setup: openDemoSong

## key: Find your key
target: #keyStepper
interactive: true
Not every tune sits right in the printed key. Try it: the **−** and **+** buttons move it by **semitones**, transposing both the notation and the sound together, so what you play and what you hear stay in step. In a personal setlist the new key is saved with that song.

## tempo: Practise at your own pace
target: #tempoStepper
interactive: true
Try it: the tempo is in real **beats per minute**, starting from the tune's own marking. Slow it down to learn a tricky passage, then bring it back up.

## more: Loop a tricky passage
setup: openDrawer
target: #repeatStepper
interactive: true
Repeating a passage by hand breaks your flow. Try it: the small arrow at the bottom of the toolbar opens **More controls**, where the **Repeat** stepper plays the tune up to 20 times in a row and skips the lead-in bar after the first pass, so the loop stays tidy. The comping picker lives here too.

## irealpro: Bring a backing band
target: #iRealPro
For any tune with chords, this button hands the chart to the **iReal Pro** app on your phone, so you have a backing band in your pocket.

## mp3: Make a practice recording
target: #exportMp3Btn
Renders what you are hearing right now into an **.mp3** file: your instrument, key, tempo, comping, mixer settings and repeat count all included. Handy for a practice track to take away.

## fullscreen: Read it up close
target: #sheetFullscreenBtn
Gives the whole screen to the sheet and, where your browser allows, keeps the screen awake while you read. On a phone you can still **pinch to zoom** on a dense chart.

# inspiration: Listen and practise
setup: openDemoSong

## button: Hear other versions
target: #inspirationLink
interactive: true
Want to hear how other bands played this tune? When a song has reference recordings, an **Inspiration** button appears. Try it: it opens a floating player alongside your sheet.

## panel: Keep listening while you browse
setup: openInspiration
target: #inspirationPanel
interactive: true
The player keeps going while you browse other songs. Try it: drag its **header** to move it and its **left edge** to resize it, or use the resize button to jump between sizes. It closes only when you close it.

## tabs: Compare recordings
setup: openInspiration
target: #inspirationTabs
interactive: true
This song has more than one recording, so try switching between the tabs to compare them. Only one plays at a time.

## loop: Loop a phrase
setup: openInspiration
target: #inspirationLoopBar
interactive: true
Get a tricky phrase to repeat on its own, instead of scrubbing back by hand. Play the video, try pressing **A** where the phrase starts and **B** where it ends, and it repeats endlessly. You can also drag the **A** and **B** handles on the timeline, and **✕** clears them.

## zoom: Place your loop precisely
setup: openInspiration
target: .inspiration-loop-overview-row
interactive: true
The strip is the whole recording. Try it: use the **+** and **−** buttons, or drag the highlighted window or its edges, to zoom the timeline below it, which makes it far easier to place your **A** and **B** markers precisely.

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

# mixer: Balance your sound
setup: openDemoSong

## open: Shape your own mix
setup: openMixer
target: #mixerPanel
The **Mixer** is the mixing desk for everything you hear. It opens as a small panel under its button, and on a phone as a sheet from the bottom of the screen.

## accompaniment: Bring in bass and chords
setup: openMixer
target: #mixerSectionAccompaniment
interactive: true
Give the tune a backing band of its own. Try it: the **auto-accompaniment** plays a bass line and chords built from the chord symbols. They start **muted**, so nothing changes until you turn them on — each has a **mute** button, a **volume** fader and a **voice** picker, and the **accompaniment pattern** picker sets the style.

## voices: Mix every part separately
setup: openMixer
target: #mixerVoicesSection
interactive: true
Each melody line in the song gets its own mute, volume and instrument. Try it: a tune with a trumpet and a sousaphone shows both. Your choices carry over to every other song with a voice of the same name.

## extras: Dial in the feel
setup: openMixer
target: #mixerStripSwing
interactive: true
Try it: loosen straight eighth notes with the **swing** fader, switch on a click with the **drum** metronome, or turn on higher-quality playback with the **wave** button.

# setlists: Setlists and printing

## shelf: Browse setlists
setup: showSetlists
target: #songList
The **Setlists** tab lists the band's own setlists, which are read-only, and **Yours** underneath. Yours are stored in this browser only.

## new: Make your own setlist
setup: showSetlists
target: .rj-library-new-setlist-btn
**New setlist** starts from scratch, from a copy of any existing setlist (a **remix**), or from a **.txt** file you upload. Let's build one from scratch, step by step.

## create: Start from scratch
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

## reorder: Set the running order
setup: createDemoSetlist, addDemoSong1, addDemoSong2
target: #songList
interactive: true
Try it: drag a song's **⋮⋮** handle up or down to move it. With a row focused, **Alt** + **↑** **↓** nudges it one slot at a time from the keyboard instead.

## break: Split into sets
setup: createDemoSetlist, addDemoSong1, addDemoSong2
target: .rj-library-add-break
interactive: true
Try it: **Add a set break** starts a new set — handy for splitting a gig into Set 1, Set 2 and so on. Type a label, or leave it blank for an automatic "Set 2".

## open: Run through the set
setup: openDemoSetlist
target: #openSetlistTools
Opening a setlist puts its songs in order in the sidebar, split into **sets**. Click one to see it in the same interactive sheet, or use **↑** **↓** (or swipe on a phone) to step through the list. **Listen** opens the setlist's songs on YouTube.

## print: Print for the gig
setup: openDemoSetlist
target: .rj-library-print-group
interactive: true
- **Setlist**: a big numbered list of titles to put on stage.
- **Chordbook**: every song's title and chord grid.
- **Songbook**: every song with its chords and full notation.

## exports: Take a setlist anywhere
setup: createDemoSetlist, addDemoSong1, addDemoSong2
target: #setlistExportBtn
A personal setlist can also be exported as a **.txt** file, and imported again on another device — the setlist equivalent of the Print, MP3 and iReal Pro exports you already know from a single song.

# comping: Comping
setup: openDemoSong

## pick: Add your own accompaniment
setup: openDrawer
target: #compingSlot
interactive: true
Comping is a chord accompaniment written out as a second staff under the melody. Try picking a **pattern** from this list: Charleston, clave, walking steps and more.

## notation: Read the colours
setup: openDrawer, compingOn
target: #notation
Each hit is a three-note chord, and the colour tells you the role of each note: **black** is the root, **gold** the third and **magenta** the fifth. The three lines move smoothly from chord to chord, so they are easy to follow.

## mixer: Blend comping into the mix
setup: openDrawer, compingOn, openMixer
target: #mixerVoicesSection
interactive: true
With comping on, it joins the mixer as its own **Comping** voice, so try it: mute it, turn it up or give it another instrument.

## done: That's the tour
setup: showLibrary
target: #tourBtn
That covers everything. Replay the tour any time with this **?** button, and pick another language in the tour's corner.
