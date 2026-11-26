# Miss Pirouette: the song, for Suno

Generate it in Suno (custom mode), about 3 to 3½ minutes. Save the song as
public/audio/pirouette/song.mp3 and run: npm run audio -- pirouette
(the game version of these lyrics, with the shouted words marked, is public/audio/pirouette/lyrics.txt)

## Title
The Last Pirouette

## Style of music
1920s operetta waltz in 3/4 time, solo music box intro, small vintage orchestra with strings, harp, celesta, glockenspiel and pizzicato, haughty coquettish soprano with a fragile, lonely edge, old gramophone recording with crackle, theatrical and bittersweet, three sections that get faster: slow music box waltz, stately minuet with harpsichord, frantic fast waltz, ending that slows down and stops like a music box running out of spring

## Exclude styles
modern drums, synth, electric guitar, autotune, rap

## Lyrics
[Intro: solo music box, a lid creaking open, then the soprano, spoken and surprised]
Oh! The lid... the light... a visitor? How rude!
Well, don't just stand there, darling... the show must go on!

[Verse 1: slow, fragile music box waltz]
One-two-three, one-two-three, I have danced since nineteen-two,
Every night the same sweet song, and every night for no one... but you?
Hear my music box go ping, ping, ping, every NOTE is meant for you,
Send it back if you keep time, little clock, and I'll dance right through!
Watch me TWIRL! And mind your feet, my tulle is sharp, my turn is neat!
MIRROR, mirror on the lid, who's the fairest one of all?
She keeps dancing when I do, she's the only friend I've got at all.

[Break: whispered, the music almost stops, only a quiet ticking music box]
Close the lid... and HUSH...
In the dark I'm all alone...

[Interlude: three clicks of a wind-up key, the tempo picks up]
Click, click, click! Wind me up again!

[Verse 2: stately minuet with harpsichord and pizzicato, call and response]
A minuet must have a partner, a bow, a step, a turn,
I'll show you once, you follow twice, come on, it's time you learn!
STEP and STEP and TURN! Now you!
STEP and STEP and TURN! Now you!
Round and round the little stage, the velvet cushions rise,
And the pins upon the cylinder go THUMP before your eyes!
STEP and STEP and TURN! Now you!
STEP and STEP and TURN! Oh... you do it too...

[Interlude: three clicks of a wind-up key, much faster]
Click, click, click! Faster! Wind me up again!

[Verse 3: frantic fast waltz, wild and desperate]
Faster, faster, spin me round, I'll never, ever stop!
KICK! KICK! KICK! A fouetté, I'll dance until I drop!
Fifty years of dust and MOTHS come fluttering from the seams,
And my MIRROR girl is breaking free, she's dancing out of my dreams!
BRAVO! BRAVO! Throw me flowers, throw me roses, throw them all!
For the audience that never came... that never came at all...

[Outro: the music box slows down, the pitch sags, it stops]
I'm... winding... down...
Was... someone... watching...?
Thank you.

[End]

## Tips
- If Suno speeds the whole song up from the start, regenerate: the first part must be slow
  and fragile, the minuet stately, and only the last part fast.
- If it cuts before the outro, use "Extend" from the last verse with the outro lyrics.
- The ending should really slow down and stop: that is her final moment in the game.

## The song in the game: *Mirror on the Lid*
The second generation, made with the battle prompt below in mind, is the one in the game
(art/pirouette/song-source.mp3). The first one (*The Last Pirouette*) was not usable: Suno sang
these tips as lyrics after 2:42 and sang the verses without breaks.

## How the game uses the song (important when generating it)
The fight lasts as long as the player takes, so the game does not play the song straight
through. Each stanza plays once, whole; then its last 8 bars, without the voice, repeat until
her spring is down enough, and the next stanza comes in. The voiceless bars come from the
instrumental (Suno's instrumental download, or separated: see tools/duel-song/README.md).

So, when generating a duel song:
1. One verse block per attack-stanza, each followed by `[Instrumental break: ..., 4 bars, no vocals]`.
2. Steady tempo (Suno tends to keep one tempo for the whole song even when asked to speed up:
   the game speeds the later turns up itself, without changing the pitch).
3. Paste only the lyrics into Suno's lyrics box, never these notes.
